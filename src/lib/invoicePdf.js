// Fattura in PDF: copia di cortesia per il cliente (l'originale è l'XML trasmesso allo SdI).
import { computeInvoice, aliquotaOf, lineTotal, TIPI_DOC, PAGAMENTI } from "@/lib/invoices";

const n = (v) => Number(v) || 0;

async function toDataUrl(url) {
  if (!url || url.startsWith("data:")) return url || null;
  try {
    const blob = await fetch(url).then((r) => (r.ok ? r.blob() : null));
    if (!blob) return null;
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
  } catch { return null; }
}

export async function buildInvoicePdf(inv, profile, client) {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF();
  const c = computeInvoice(inv);
  const W = 210, M = 16, CW = W - M * 2;
  const hex = (profile?.colore_principale || "#1e3a8a").replace("#", "");
  const C = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  const eur = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n(v));
  const it = (s) => (s ? new Date(s).toLocaleDateString("it-IT") : "—");
  const logo = await toDataUrl(profile?.logo_url);
  let y = 16;

  // intestazione: impresa a sinistra, documento a destra
  if (logo) {
    try { doc.addImage(logo, /png/i.test(logo.slice(0, 30)) ? "PNG" : "JPEG", M, y - 2, profile?.logo_larghezza || 40, profile?.logo_altezza || 20); y += (profile?.logo_altezza || 20) + 2; } catch { /* logo non valido */ }
  }
  doc.setFontSize(12); doc.setFont(undefined, "bold"); doc.text(profile?.ragione_sociale || "", M, y);
  doc.setFontSize(8.5); doc.setFont(undefined, "normal"); doc.setTextColor(80, 80, 80);
  const imp = [
    [profile?.indirizzo, [profile?.cap, profile?.citta, profile?.provincia && `(${profile.provincia})`].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    [profile?.partita_iva && `P.IVA ${profile.partita_iva}`, profile?.codice_fiscale && profile.codice_fiscale !== profile.partita_iva && `C.F. ${profile.codice_fiscale}`].filter(Boolean).join(" · "),
    [profile?.telefono, profile?.email].filter(Boolean).join(" · "),
    profile?.pec && `PEC ${profile.pec}`,
  ].filter(Boolean);
  imp.forEach((l, i) => doc.text(l, M, y + 5 + i * 4));
  const tipoLabel = TIPI_DOC.find((t) => t.value === (inv.tipo_documento || "TD01"))?.label || "Fattura";
  doc.setTextColor(...C); doc.setFontSize(16); doc.setFont(undefined, "bold");
  doc.text(tipoLabel.split(" /")[0].toUpperCase(), W - M, 20, { align: "right" });
  doc.setFontSize(10); doc.setTextColor(30, 30, 30);
  doc.text(`N. ${inv.numero || ""} del ${it(inv.data)}`, W - M, 27, { align: "right" });
  y = Math.max(y + 5 + imp.length * 4, 40) + 4;
  doc.setDrawColor(...C); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
  y += 7;

  // cliente e oggetto
  doc.setFontSize(7.5); doc.setTextColor(120, 120, 120); doc.text("SPETTABILE", W / 2 + 4, y);
  doc.setFontSize(10); doc.setTextColor(20, 20, 20); doc.setFont(undefined, "bold");
  doc.text(doc.splitTextToSize(client?.nome || client?.nome_privato || "", CW / 2 - 4), W / 2 + 4, y + 5);
  doc.setFont(undefined, "normal"); doc.setFontSize(8.5);
  const cl = [
    client?.indirizzo,
    [client?.cap, client?.citta, client?.provincia && `(${client.provincia})`].filter(Boolean).join(" "),
    client?.partita_iva && `P.IVA ${client.partita_iva}`,
    client?.codice_fiscale && `C.F. ${client.codice_fiscale}`,
    client?.codice_sdi && `Codice SDI ${client.codice_sdi}`,
    client?.pec && `PEC ${client.pec}`,
  ].filter(Boolean);
  cl.forEach((l, i) => doc.text(l, W / 2 + 4, y + 10 + i * 4));
  if (inv.oggetto) {
    doc.setFontSize(7.5); doc.setTextColor(120, 120, 120); doc.text("OGGETTO", M, y);
    doc.setFontSize(9); doc.setTextColor(20, 20, 20);
    doc.text(doc.splitTextToSize(inv.oggetto, CW / 2 - 8), M, y + 5);
  }
  y += 14 + cl.length * 4;

  // righe
  const cols = [{ l: "Descrizione", w: 0.46 }, { l: "Q.tà", w: 0.08, r: true }, { l: "U.M.", w: 0.07 }, { l: "Prezzo", w: 0.13, r: true }, { l: "Sc.%", w: 0.07, r: true }, { l: "IVA", w: 0.07, r: true }, { l: "Importo", w: 0.12, r: true }];
  const widths = cols.map((x) => x.w * CW);
  const head = () => {
    doc.setFillColor(...C); doc.rect(M, y - 4.5, CW, 7, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont(undefined, "bold");
    let x = M;
    cols.forEach((col, i) => { doc.text(col.l, col.r ? x + widths[i] - 1.5 : x + 1.5, y, col.r ? { align: "right" } : undefined); x += widths[i]; });
    doc.setTextColor(20, 20, 20); doc.setFont(undefined, "normal"); y += 6;
  };
  head();
  doc.setFontSize(8.5);
  for (const r of c.righe) {
    const a = aliquotaOf(r.aliquota_key ?? r.iva_percentuale ?? 22);
    const desc = doc.splitTextToSize(String(r.descrizione || ""), widths[0] - 3);
    const h = desc.length * 3.9 + 2.5;
    if (y + h > 250) { doc.addPage(); y = 20; head(); doc.setFontSize(8.5); }
    const vals = [desc, n(r.quantita).toLocaleString("it-IT"), r.unita_misura || "", eur(r.prezzo_unitario), n(r.sconto) ? String(n(r.sconto)) : "", a.natura || `${a.aliquota}%`, eur(lineTotal(r))];
    let x = M;
    vals.forEach((v, i) => { doc.text(v, cols[i].r ? x + widths[i] - 1.5 : x + 1.5, y, cols[i].r ? { align: "right" } : undefined); x += widths[i]; });
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.line(M, y + h - 3.2, M + CW, y + h - 3.2);
    y += h;
  }
  y += 4;
  if (y > 225) { doc.addPage(); y = 20; }

  // riepilogo IVA a sinistra, totali a destra
  const yTop = y;
  doc.setFontSize(7.5); doc.setTextColor(120, 120, 120); doc.text("RIEPILOGO IVA", M, y); y += 4.5;
  doc.setFontSize(8); doc.setTextColor(20, 20, 20);
  for (const g of c.riepilogo) {
    doc.text(g.natura ? `${g.natura} - ${g.label}` : `IVA ${g.aliquota}%`, M, y);
    doc.text(`imponibile ${eur(g.imponibile)}  ·  imposta ${eur(g.imposta)}`, M, y + 3.8);
    if (g.rif) { doc.setTextColor(110, 110, 110); doc.text(doc.splitTextToSize(g.rif, CW / 2), M, y + 7.4); doc.setTextColor(20, 20, 20); y += 3.6; }
    y += 9;
  }
  let ty = yTop;
  const tot = (label, v, bold) => {
    doc.setFont(undefined, bold ? "bold" : "normal"); doc.setFontSize(bold ? 10.5 : 9);
    doc.text(label, W / 2 + 10, ty); doc.text(eur(v), W - M, ty, { align: "right" });
    ty += bold ? 7 : 5.5;
  };
  tot("Imponibile", c.imponibile);
  tot("IVA", c.iva);
  if (c.bollo) tot("Bollo virtuale", c.bollo);
  doc.setDrawColor(...C); doc.line(W / 2 + 10, ty - 3, W - M, ty - 3); ty += 1.5;
  tot("Totale documento", c.totale, true);
  if (c.splitPayment) tot("IVA versata dal cliente (split payment)", -c.iva);
  if (c.daPagare !== c.totale) tot("Netto a pagare", c.daPagare, true);
  doc.setFont(undefined, "normal");
  y = Math.max(y, ty) + 4;

  // pagamento e note
  doc.setFontSize(8.5);
  const mp = inv.modalita_pagamento || "MP05";
  const iban = inv.iban || profile?.iban;
  const pag = [
    `Pagamento: ${PAGAMENTI.find((p) => p.value === mp)?.label || "Bonifico"}${inv.scadenza ? ` entro il ${it(inv.scadenza)}` : ""}`,
    mp === "MP05" && iban && `IBAN ${String(iban).replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim()}`,
  ].filter(Boolean);
  pag.forEach((l) => { doc.text(l, M, y); y += 4.5; });
  if (inv.note) { const nl = doc.splitTextToSize(inv.note, CW); y += 1; doc.text(nl, M, y); y += nl.length * 4 + 2; }
  if ((inv.regime || profile?.regime_fiscale) === "RF19") {
    y += 1; doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize("Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, della L. 190/2014 (regime forfettario): non soggetta a IVA ne' a ritenuta d'acconto.", CW), M, y);
  }

  doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
  doc.text(doc.splitTextToSize("Copia di cortesia priva di valore fiscale. L'originale della fattura elettronica e' disponibile nell'area riservata del sito dell'Agenzia delle Entrate (art. 21 DPR 633/72).", CW), M, 285);
  return doc;
}
