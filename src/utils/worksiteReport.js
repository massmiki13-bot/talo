// Resoconto del lavoro in PDF: dati, avanzamento, economia, incassi, foto prima/dopo.
import { addImageSafe, hexToRgb, addFooter, formatEuro } from "@/utils/pdfUtils";
import { COST_CATEGORIES, fmtDate } from "@/lib/worksites";

const M = 16;
const W = 210;

async function toDataUrl(url) {
  if (!url || url.startsWith("data:")) return url || null;
  try {
    const blob = await fetch(url).then((r) => (r.ok ? r.blob() : null));
    if (!blob) return null;
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
  } catch { return null; }
}

/**
 * data: { worksite, profile, econ, labor, payments, rate, photos, logsCount, team }
 * internal: true = include costi e margini (copia per l'azienda), false = versione per il cliente
 */
export async function generateWorksiteReport({ worksite, profile, econ, labor, payments = [], rate = [], photos = [], logsCount = 0, team = [] }, { internal = true } = {}) {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF();
  const color = hexToRgb(profile?.colore_principale || "#1d4ed8");
  const logo = await toDataUrl(profile?.logo_url);
  let y = 16;

  const section = (title) => {
    if (y > 250) { doc.addPage(); y = 20; }
    y += 4;
    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(color.r, color.g, color.b);
    doc.text(title.toUpperCase(), M, y);
    doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(0.3); doc.line(M, y + 1.5, W - M, y + 1.5);
    doc.setTextColor(20, 20, 20); doc.setFont(undefined, "normal");
    y += 8;
  };
  const row = (label, value, opts = {}) => {
    if (value === null || value === undefined || value === "") return;
    if (y > 275) { doc.addPage(); y = 20; }
    doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.text(label, M, y);
    doc.setTextColor(20, 20, 20); if (opts.bold) doc.setFont(undefined, "bold");
    doc.text(String(value), opts.right ? W - M : M + 55, y, opts.right ? { align: "right" } : undefined);
    doc.setFont(undefined, "normal");
    y += 6;
  };

  if (logo) addImageSafe(doc, logo, M, y - 4, 32, 14);
  doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  doc.text(profile?.ragione_sociale || "", W - M, y, { align: "right" });
  doc.text(new Date().toLocaleDateString("it-IT"), W - M, y + 5, { align: "right" });
  y += 18;
  doc.setTextColor(20, 20, 20); doc.setFontSize(17); doc.setFont(undefined, "bold");
  doc.text(doc.splitTextToSize(worksite.nome || "Lavoro", W - 2 * M), M, y);
  y += 8;
  doc.setFontSize(10); doc.setFont(undefined, "normal"); doc.setTextColor(90, 90, 90);
  doc.text(internal ? "Resoconto del lavoro" : "Relazione di fine lavori", M, y);
  y += 6;

  section("Dati del lavoro");
  row("Cliente", worksite.cliente_nome);
  row("Indirizzo", worksite.indirizzo);
  row("Tipo di intervento", worksite.tipo_intervento);
  row("Periodo", [worksite.data_inizio && `dal ${fmtDate(worksite.data_inizio)}`, (worksite.data_fine_effettiva || worksite.data_fine_prevista) && `al ${fmtDate(worksite.data_fine_effettiva || worksite.data_fine_prevista)}`].filter(Boolean).join(" "));
  if (worksite.titolo_edilizio?.tipo) row("Titolo edilizio", [worksite.titolo_edilizio.tipo, worksite.titolo_edilizio.numero && `n. ${worksite.titolo_edilizio.numero}`, worksite.titolo_edilizio.data && `del ${fmtDate(worksite.titolo_edilizio.data)}`].filter(Boolean).join(" "));
  row("Direttore dei lavori", worksite.direttore_lavori);
  if (team.length) row("Squadra", team.join(", ").slice(0, 90));
  row("Giornate di lavoro", labor.giorni ? `${labor.giorni} (${labor.ore} ore)` : null);
  row("Voci nel giornale", logsCount || null);

  if ((worksite.fasi || []).length) {
    section(`Avanzamento: ${worksite.avanzamento || 0}%`);
    for (const f of worksite.fasi) row(f.nome || "Fase", `${Number(f.completamento) || 0}%`, { right: true });
  }

  section("Importi e incassi");
  row("Importo del contratto", formatEuro(econ.ricavo), { right: true, bold: true });
  row("Incassato", formatEuro(payments.reduce((s, p) => s + (Number(p.importo) || 0), 0)), { right: true });
  row("Da incassare", formatEuro(Math.max(0, econ.ricavo - payments.reduce((s, p) => s + (Number(p.importo) || 0), 0))), { right: true });
  for (const r of rate) row(`${r.descrizione}${r.scadenza ? ` (${fmtDate(r.scadenza)})` : ""}`, `${formatEuro(r.importo)} · ${r.stato === "pagata" ? "pagata" : r.stato === "scaduta" ? "scaduta" : r.stato === "parziale" ? "parziale" : "da pagare"}`, { right: true });

  if (internal) {
    section("Economia (uso interno)");
    doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text("Categoria", M, y); doc.text("Budget", 120, y, { align: "right" }); doc.text("Reale", 155, y, { align: "right" }); doc.text("Scostamento", W - M, y, { align: "right" });
    y += 5;
    for (const c of COST_CATEGORIES) {
      const b = Number(econ.budget?.[c]) || 0;
      const r = econ.byCat[c] || 0;
      if (!b && !r) continue;
      doc.setFontSize(9); doc.setTextColor(20, 20, 20);
      doc.text(c, M, y); doc.text(b ? formatEuro(b) : "—", 120, y, { align: "right" }); doc.text(formatEuro(r), 155, y, { align: "right" });
      if (b) { doc.setTextColor(r > b ? 185 : 21, r > b ? 28 : 128, r > b ? 28 : 61); doc.text(`${r > b ? "+" : ""}${formatEuro(r - b)}`, W - M, y, { align: "right" }); }
      y += 6;
    }
    doc.setTextColor(20, 20, 20);
    row("Totale costi", formatEuro(econ.costi), { right: true, bold: true });
    row("Margine reale", `${formatEuro(econ.margineReale)}${econ.ricavo ? ` (${Math.round((econ.margineReale / econ.ricavo) * 100)}%)` : ""}`, { right: true, bold: true });
    if (econ.marginePrevisto !== null) row("Margine previsto da budget", formatEuro(econ.marginePrevisto), { right: true });
  }

  const prima = photos.filter((p) => p.fase === "prima").slice(0, 4);
  const dopo = photos.filter((p) => p.fase === "dopo").slice(0, 4);
  if (prima.length || dopo.length) {
    doc.addPage(); y = 20;
    section("Foto prima e dopo");
    const drawSet = async (list, label) => {
      if (!list.length) return;
      doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text(label, M, y); doc.setFont(undefined, "normal"); y += 4;
      let x = M;
      for (const p of list) {
        const data = await toDataUrl(p.foto_url);
        if (data) addImageSafe(doc, data, x, y, 42, 32);
        x += 45;
      }
      y += 38;
    };
    await drawSet(prima, "Prima");
    await drawSet(dopo, "Dopo");
  }

  addFooter(doc, { ...profile, logo_url: logo }, W, 297, M);
  return doc.output("blob");
}
