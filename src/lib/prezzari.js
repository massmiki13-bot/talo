// Prezzari: importazione (Excel/CSV/ODS e PDF), ricerca delle voci e prezzo suggerito dall'IA.
import { api, db } from "@/lib/db";

export const REGIONI = ["Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", "Molise",
  "Piemonte", "Provincia autonoma di Bolzano", "Provincia autonoma di Trento", "Puglia", "Sardegna", "Sicilia", "Toscana", "Umbria", "Valle d'Aosta", "Veneto"];

export const TIPI = [
  { value: "regionale", label: "Prezzario regionale / provinciale" },
  { value: "comunale", label: "Prezzario comunale" },
  { value: "ditta", label: "Listino della ditta" },
  { value: "altro", label: "Altro (DEI, fornitori…)" },
];

/** "1.234,56 €" → 1234.56 ; "12,5" → 12.5 ; "1234.56" → 1234.56 */
export function parsePrice(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[€\s]/g, "").replace(/eur/i, "");
  if (!s || !/\d/.test(s)) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, ""); // "1.234.567": punti delle migliaia
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : null;
}

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// ─── Fogli di calcolo ───

export async function readSheet(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  // il foglio con più righe è quasi sempre quello delle voci
  let best = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" });
    if (!best || rows.length > best.rows.length) best = { name, rows };
  }
  return best || { name: "", rows: [] };
}

const HINTS = {
  codice: /^(cod|codice|art|articolo|tariffa|n\.?\s*voce|voce|id)\b/i,
  descrizione: /(descr|denominaz|lavoraz|designaz|declaratoria|oggetto)/i,
  unita_misura: /^(u\.?\s*m\.?|um|unit|misura|u\.?\s*mis)/i,
  prezzo: /(prezzo|importo|euro|€|valore|costo)/i,
};

/** Trova la riga di intestazione e le colonne con euristiche; null se incerte. */
export function detectColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = rows[r].map((c) => clean(c).toLowerCase());
    const map = {};
    cells.forEach((c, i) => {
      if (!c) return;
      for (const [k, re] of Object.entries(HINTS)) {
        if (map[k] != null) continue;
        if (k === "prezzo" && /(sicur|manodop|%|incid)/.test(c)) continue;
        if (re.test(c)) { map[k] = i; break; }
      }
    });
    if (map.descrizione != null && map.prezzo != null) return { headerRow: r, ...map };
  }
  return null;
}

/** L'IA individua le colonne guardando le prime righe (quando l'intestazione non è standard). */
export async function detectColumnsAi(rows) {
  const sample = rows.slice(0, 30).map((r, i) => `${i}: ${r.slice(0, 14).map((c) => clean(c).slice(0, 60)).join(" | ")}`).join("\n");
  const res = await api.integrations.Core.InvokeLLM({
    prompt: `Queste sono le prime righe di un prezzario edile italiano esportato in foglio di calcolo (celle separate da " | ", indici di colonna da 0).
Indica la riga di intestazione (o -1 se non c'è) e l'indice di colonna di: codice della voce, descrizione, unità di misura, prezzo unitario in euro (NON la percentuale di manodopera o sicurezza).
${sample}`,
    response_json_schema: {
      type: "object",
      properties: { headerRow: { type: "number" }, codice: { type: "number" }, descrizione: { type: "number" }, unita_misura: { type: "number" }, prezzo: { type: "number" } },
      required: ["headerRow", "descrizione", "prezzo"],
    },
  });
  if (res?.descrizione == null || res?.prezzo == null) return null;
  return { headerRow: Number(res.headerRow), codice: res.codice ?? null, descrizione: Number(res.descrizione), unita_misura: res.unita_misura ?? null, prezzo: Number(res.prezzo) };
}

/**
 * Converte le righe in voci. Gestisce la struttura tipica dei prezzari:
 * righe "madre" senza prezzo (descrizione generale / capitolo) e righe figlie con prezzo e dettaglio.
 */
export function rowsToVoci(rows, cols) {
  const out = [];
  let parent = null;
  let chapter = "";
  const get = (r, k) => (cols[k] == null || cols[k] < 0 ? "" : r[cols[k]]);
  for (let i = cols.headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const codice = clean(get(r, "codice"));
    const desc = clean(get(r, "descrizione"));
    const prezzo = parsePrice(get(r, "prezzo"));
    if (!desc && !codice) continue;
    if (prezzo == null || prezzo <= 0) {
      // riga senza prezzo: capitolo (corta, spesso maiuscola) o descrizione madre
      const isChapter = desc.length < 90 && desc === desc.toUpperCase();
      if (isChapter) { chapter = desc || chapter; parent = null; } else parent = { codice, desc };
      continue;
    }
    let full = desc;
    if (parent?.desc && (!codice || !parent.codice || codice.startsWith(parent.codice)) && desc.length < 160 && parent.desc !== desc) full = `${parent.desc} – ${desc}`;
    out.push({ codice, capitolo: chapter.slice(0, 200), descrizione: full.slice(0, 2000), unita_misura: clean(get(r, "unita_misura")).slice(0, 20), prezzo: Math.round(prezzo * 100) / 100 });
  }
  return out;
}

// ─── PDF: l'IA legge poche pagine alla volta ───

export async function pdfPageCount(file) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  return doc.getPageCount();
}

export async function extractPdfVoci(file, from, to, onProgress, chunk = 3) {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const voci = [];
  const total = Math.ceil((to - from + 1) / chunk);
  let done = 0;
  let failed = 0;
  for (let p = from; p <= to; p += chunk) {
    const part = await PDFDocument.create();
    const idx = [];
    for (let k = p; k < Math.min(p + chunk, to + 1); k++) idx.push(k - 1);
    (await part.copyPages(src, idx)).forEach((pg) => part.addPage(pg));
    const bytes = await part.save();
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file: new File([/** @type {any} */ (bytes)], `prezzario-p${p}.pdf`, { type: "application/pdf" }) });
      const res = await api.integrations.Core.InvokeLLM({
        prompt: `Estrai TUTTE le voci con prezzo da queste pagine di un prezzario edile italiano.
Per ogni voce: codice (così com'è scritto), descrizione completa (se la voce è un sotto-articolo, unisci la descrizione generale dell'articolo con quella specifica), unità di misura, prezzo unitario in euro (numero, NON percentuali di manodopera o sicurezza), capitolo se indicato.
Ignora intestazioni, note, totali. Non inventare voci.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            voci: { type: "array", items: { type: "object", properties: { codice: { type: "string" }, descrizione: { type: "string" }, unita_misura: { type: "string" }, prezzo: { type: "number" }, capitolo: { type: "string" } }, required: ["descrizione", "prezzo"] } },
          },
          required: ["voci"],
        },
      });
      for (const v of res?.voci || []) {
        const prezzo = parsePrice(v.prezzo);
        if (!v.descrizione || !prezzo) continue;
        voci.push({ codice: clean(v.codice), capitolo: clean(v.capitolo).slice(0, 200), descrizione: clean(v.descrizione).slice(0, 2000), unita_misura: clean(v.unita_misura).slice(0, 20), prezzo: Math.round(prezzo * 100) / 100 });
      }
    } catch (e) {
      console.error(e);
      failed++;
    }
    done++;
    onProgress?.(done, total, voci.length, failed);
  }
  return { voci, failed };
}

// ─── Salvataggio ───

export async function savePrezzario(meta, voci, onProgress) {
  const prezzario = await db.Prezzario.create({ ...meta, n_voci: 0, attivo: true });
  let saved = 0;
  for (let i = 0; i < voci.length; i += 400) {
    const part = voci.slice(i, i + 400).map((v) => ({ ...v, prezzario_id: prezzario.id }));
    await db.PrezzarioVoce.bulkCreate(part);
    saved += part.length;
    onProgress?.(saved, voci.length);
  }
  return db.Prezzario.update(prezzario.id, { n_voci: saved });
}

export async function deletePrezzario(p) {
  await db.PrezzarioVoce.deleteMany({ prezzario_id: p.id });
  await db.Prezzario.delete(p.id);
}

// ─── Ricerca ───

const STOP = new Set("di da del della dei delle degli con per tra fra in su al alla alle ai agli il lo la le gli un una uno e ed o od a ad compreso compresa inclusi incluso ogni tipo fornitura posa opera mediante eseguito eseguita realizzazione".split(" "));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const keywords = (text) => [...new Set(String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];

/** Cerca voci per parole (tutte), poi ripiega su "almeno una" ordinando per quante ne contiene. */
export async function searchVoci(text, prezzarioIds, limit = 60) {
  const words = keywords(text).slice(0, 6);
  const scope = prezzarioIds?.length ? { prezzario_id: { $in: prezzarioIds } } : {};
  const codeLike = /^[A-Z0-9.\-/]{4,}$/i.test(String(text).trim()) ? String(text).trim() : null;
  if (codeLike) {
    const byCode = await db.PrezzarioVoce.filter({ ...scope, codice: { $regex: `^${escapeRe(codeLike)}` } }, "codice", limit).catch(() => []);
    if (byCode.length) return byCode;
  }
  if (!words.length) return [];
  const stem = (w) => escapeRe(w.length > 6 ? w.slice(0, w.length - 2) : w); // tollera singolare/plurale
  let res = await db.PrezzarioVoce.filter({ ...scope, $and: words.map((w) => ({ descrizione: { $regex: stem(w) } })) }, "codice", limit).catch(() => []);
  if (res.length < 8 && words.length > 1) {
    const more = await db.PrezzarioVoce.filter({ ...scope, $or: words.map((w) => ({ descrizione: { $regex: stem(w) } })) }, "codice", 400).catch(() => []);
    const score = (v) => words.reduce((s, w) => s + (v.descrizione.toLowerCase().includes(w.slice(0, Math.max(4, w.length - 2))) ? 1 : 0), 0);
    const seen = new Set(res.map((v) => v.id));
    res = [...res, ...more.filter((v) => !seen.has(v.id)).sort((a, b) => score(b) - score(a))].slice(0, limit);
  }
  return res;
}

/**
 * Prezzo di una voce di preventivo dal prezzario: cerca le voci candidate e l'IA sceglie la più adatta.
 * Ritorna { voce, prezzo, motivo, affidabilita } oppure null.
 */
export async function aiPriceFor(descrizione, unita, prezzari) {
  const ids = prezzari.map((p) => p.id);
  let cands = await searchVoci(descrizione, ids, 40);
  if (cands.length < 5) {
    // parole tecniche alternative suggerite dall'IA (sinonimi usati nei prezzari)
    const kw = await api.integrations.Core.InvokeLLM({
      prompt: `Dai 3 brevi ricerche (2-3 parole tecniche ciascuna) per trovare in un prezzario edile italiano la voce: "${descrizione}".`,
      response_json_schema: { type: "object", properties: { ricerche: { type: "array", items: { type: "string" } } }, required: ["ricerche"] },
    }).catch(() => null);
    for (const q of kw?.ricerche || []) {
      const more = await searchVoci(q, ids, 20);
      const seen = new Set(cands.map((c) => c.id));
      cands = [...cands, ...more.filter((m) => !seen.has(m.id))];
    }
  }
  if (!cands.length) return null;
  const byId = Object.fromEntries(prezzari.map((p) => [p.id, p]));
  const list = cands.slice(0, 40).map((c, i) => ({ n: i, codice: c.codice, descrizione: c.descrizione.slice(0, 400), um: c.unita_misura, prezzo: c.prezzo, prezzario: byId[c.prezzario_id]?.nome }));
  const res = await api.integrations.Core.InvokeLLM({
    prompt: `Voce del preventivo: "${descrizione}"${unita ? ` (unità: ${unita})` : ""}.
Scegli tra le voci di prezzario qui sotto quella che corrisponde meglio al lavoro descritto (stessa lavorazione, materiale e unità di misura compatibile). Se nessuna è davvero adatta rispondi n = -1.
${JSON.stringify(list)}`,
    response_json_schema: {
      type: "object",
      properties: { n: { type: "number" }, affidabilita: { type: "string", enum: ["alta", "media", "bassa"] }, motivo: { type: "string" } },
      required: ["n"],
    },
  });
  const pick = cands[Number(res?.n)];
  if (!pick || Number(res.n) < 0) return null;
  const p = byId[pick.prezzario_id];
  const k = 1 + (Number(p?.ricarico_percentuale) || 0) / 100;
  return { voce: pick, prezzario: p, prezzo: Math.round(pick.prezzo * k * 100) / 100, affidabilita: res.affidabilita || "media", motivo: res.motivo || "" };
}

export const activePrezzari = async () => (await db.Prezzario.list("-predefinito").catch(() => [])).filter((p) => p.attivo !== false && p.n_voci > 0);

/** Unità del prezzario → unità del preventivo (null se non riconosciuta). */
export function mapUnit(um) {
  const u = String(um || "").toLowerCase().replace(/\s+/g, "").replace(/\.$/, "");
  if (/^(m²|mq|m2|metriquadri|metroquadro)$/.test(u)) return "mq";
  if (/^(m³|mc|m3|metricubi|metrocubo)$/.test(u)) return "mc";
  if (/^(ml|m\.l|metrolineare)$/.test(u)) return "ml";
  if (/^(m|metro|metri)$/.test(u)) return "m";
  if (/^(kg|chilogrammo|chilogrammi)$/.test(u)) return "kg";
  if (/^(t|ton|tonnellata|tonnellate|q\.?li)$/.test(u)) return "t";
  if (/^(h|ora|ore)$/.test(u)) return "ore";
  if (/^(gg|giorno|giorni|g)$/.test(u)) return "gg";
  if (/^(acorpo|corpo)$/.test(u)) return "corpo";
  if (/^(cad|cadauno|n|nr|n°|num|numero|pz|pezzo|pezzi)$/.test(u)) return "cad";
  return null;
}

/** Riga di preventivo pronta a partire da una voce di prezzario. */
export function rowFromVoce(v, prezzario, iva = 22) {
  const k = 1 + (Number(prezzario?.ricarico_percentuale) || 0) / 100;
  return {
    tipo: "voce", descrizione: v.descrizione, unita_misura: mapUnit(v.unita_misura) || "cad", quantita: 1,
    prezzo_unitario: Math.round(v.prezzo * k * 100) / 100, sconto: 0, iva_percentuale: iva, costo_unitario: null, opzionale: false,
    fonte_prezzo: { prezzario: prezzario?.nome || "", codice: v.codice || "", prezzo_base: v.prezzo, um: v.unita_misura || "" },
  };
}
