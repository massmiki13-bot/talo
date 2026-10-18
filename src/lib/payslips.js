// Buste paga: da un PDF unico con le buste di tutti, un PDF per ogni dipendente.
import { api, db } from "@/lib/db";
import { fullName } from "@/lib/employees";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Trova il dipendente da codice fiscale o nome (anche con nome e cognome invertiti). */
export function matchEmployee(employees, { codice_fiscale, nominativo }) {
  const cf = String(codice_fiscale || "").toUpperCase().replace(/\s/g, "");
  if (cf.length === 16) { const e = employees.find((x) => String(x.codice_fiscale || "").toUpperCase() === cf); if (e) return e; }
  const n = norm(nominativo);
  if (!n) return null;
  const words = new Set(n.split(" "));
  let best = null;
  let bestScore = 0;
  for (const e of employees) {
    const parts = norm(`${e.nome} ${e.cognome}`).split(" ").filter(Boolean);
    if (!parts.length) continue;
    const hit = parts.filter((p) => words.has(p)).length;
    const score = hit / parts.length;
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return bestScore >= 0.99 || (bestScore >= 0.5 && best && words.has(norm(best.cognome))) ? best : null;
}

/** Raggruppa le pagine consecutive dello stesso lavoratore (buste su più pagine). */
export function groupPages(pages) {
  const groups = [];
  for (const p of [...pages].sort((a, b) => a.pagina - b.pagina)) {
    const key = p.employeeId || `?${norm(p.nominativo)}|${p.codice_fiscale || ""}`;
    const last = groups.at(-1);
    if (last && last.key === key && last.pagine.at(-1) === p.pagina - 1) last.pagine.push(p.pagina);
    else groups.push({ key, employeeId: p.employeeId || "", nominativo: p.nominativo, codice_fiscale: p.codice_fiscale, mese: p.mese, anno: p.anno, pagine: [p.pagina] });
  }
  return groups;
}

/** Legge un gruppo di pagine (già estratto in un PDF a parte): per ogni pagina lavoratore e periodo. */
async function readChunk(bytes, first, count, employees) {
  const { file_url } = await api.integrations.Core.UploadFile({ file: new File([/** @type {any} */ (bytes)], `buste-p${first}.pdf`, { type: "application/pdf" }), private: true });
  const res = await api.integrations.Core.InvokeLLM({
    prompt: `Il PDF allegato ha ${count} pagine, estratte da un file di buste paga (cedolini / LUL) di un'impresa: qui le chiami pagina 1, 2… ${count}.
Restituisci ESATTAMENTE ${count} elementi in "pagine", uno per ogni pagina in ordine, con: pagina (1-${count}), nominativo del lavoratore della busta in quella pagina (cognome e nome come scritti; vuoto se la pagina non è una busta paga, es. riepiloghi o totali), codice_fiscale del lavoratore (se scritto), mese (1-12) e anno del periodo di paga (0 se non scritti).
Se una pagina è la continuazione della busta della pagina prima (trattenute, netto…) e riporta il nome, indica lo stesso lavoratore.
Dipendenti dell'impresa: ${employees.map((e) => `${fullName(e)}${e.codice_fiscale ? ` (${e.codice_fiscale})` : ""}`).join("; ")}.`,
    file_urls: [file_url],
    response_json_schema: {
      type: "object",
      properties: { pagine: { type: "array", items: { type: "object", properties: { pagina: { type: "integer" }, nominativo: { type: "string" }, codice_fiscale: { type: "string" }, mese: { type: "integer" }, anno: { type: "integer" } }, required: ["pagina", "nominativo", "codice_fiscale", "mese", "anno"] } } },
      required: ["pagine"],
    },
  });
  return (res.pagine || []).map((r) => ({ ...r, pagina: Number(r.pagina) + first - 1 }));
}

/** Legge il PDF a gruppi di 8 pagine (3 gruppi alla volta): per ogni pagina chi è il lavoratore e il periodo. */
export async function analyzePayslips(file, employees, onProgress) {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const n = pdf.getPageCount();
  const CHUNK = 8;
  const starts = [];
  for (let p = 1; p <= n; p += CHUNK) starts.push(p);
  const found = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < starts.length) {
      const first = starts[next++];
      const count = Math.min(CHUNK, n - first + 1);
      const part = await PDFDocument.create();
      (await part.copyPages(pdf, Array.from({ length: count }, (_, k) => first - 1 + k))).forEach((pg) => part.addPage(pg));
      const bytes = await part.save();
      let rows = null;
      for (let attempt = 0; attempt < 2 && !rows; attempt++) {
        try { rows = await readChunk(bytes, first, count, employees); } catch (e) { if (attempt) throw e; await new Promise((r) => setTimeout(r, 3000)); }
      }
      found.push(...rows);
      onProgress?.(++done, starts.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, starts.length) }, worker));

  const pages = [];
  let prev = null;
  for (let i = 1; i <= n; i++) {
    const r = found.find((x) => x.pagina === i) || { pagina: i, nominativo: "" };
    const emp = r.nominativo ? matchEmployee(employees, r) : null;
    const row = { pagina: i, nominativo: r.nominativo || "", codice_fiscale: r.codice_fiscale || "", mese: r.mese || prev?.mese || null, anno: r.anno || prev?.anno || null, employeeId: emp?.id || "" };
    pages.push(row);
    if (row.nominativo) prev = row;
  }
  return { pdf, n, groups: groupPages(pages).filter((g) => g.nominativo || g.employeeId) };
}

export const periodLabel = (g) => (g.mese && g.anno ? `${MESI[g.mese - 1]} ${g.anno}` : g.anno ? String(g.anno) : "");

/** Crea un PDF per gruppo, lo carica tra i file privati e lo salva nei documenti del dipendente. */
export async function savePayslips(pdf, groups, employees, onProgress) {
  const { PDFDocument } = await import("pdf-lib");
  let done = 0;
  const saved = [];
  for (const g of groups.filter((x) => x.employeeId)) {
    const emp = employees.find((e) => e.id === g.employeeId);
    const out = await PDFDocument.create();
    (await out.copyPages(pdf, g.pagine.map((p) => p - 1))).forEach((pg) => out.addPage(pg));
    const bytes = await out.save();
    const period = periodLabel(g);
    const name = `Busta paga ${fullName(emp)}${period ? ` ${period}` : ""}.pdf`;
    const { file_url } = await api.integrations.Core.UploadFile({ file: new File([/** @type {any} */ (bytes)], name, { type: "application/pdf" }), private: true });
    const data = g.anno ? `${g.anno}-${String(g.mese || 1).padStart(2, "0")}-01` : new Date().toISOString().slice(0, 10);
    saved.push(await db.EmployeeDocument.create({
      dipendente_id: emp.id, tipo: "busta_paga", titolo: `Busta paga${period ? ` ${period}` : ""}`, file_url, data_emissione: data, descrizione: `Pagine ${g.pagine.join(", ")} del file originale`,
    }));
    onProgress?.(++done);
  }
  return saved;
}
