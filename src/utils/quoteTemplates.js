import { formatEuro, formatNumber, hexToRgb, addImageSafe, addFooter } from "@/utils/pdfUtils";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

const COLS = [
  { key: "descrizione", label: "Descrizione", w: 78, align: "left" },
  { key: "unita_misura", label: "U.M.", w: 12, align: "left" },
  { key: "quantita", label: "Qtà", w: 15, align: "right" },
  { key: "prezzo_unitario", label: "Prezzo Unit.", w: 22, align: "right" },
  { key: "sconto", label: "Sc.%", w: 13, align: "right" },
  { key: "iva_percentuale", label: "IVA", w: 12, align: "right" },
  { key: "totale", label: "Totale", w: 28, align: "right" },
];

function getColPositions(margin) {
  let x = margin;
  return COLS.map((col) => {
    const pos = { ...col, x, rightX: x + col.w - 2, endX: x + col.w };
    x += col.w;
    return pos;
  });
}

function getCellValue(row, key, unitOptions, calcRowTotal) {
  // Capitoli, righe di testo e subtotali: solo descrizione (e importo del subtotale).
  if (row._subtotale !== undefined) return key === "totale" ? formatEuro(row._subtotale) : key === "descrizione" ? row.descrizione : "";
  if (row.tipo === "capitolo" || row.tipo === "testo") return key === "descrizione" ? row.descrizione || "" : "";
  if (row.opzionale && key === "totale") return `(${formatEuro(calcRowTotal(row))})`;
  switch (key) {
    case "descrizione": return row.descrizione || "";
    case "unita_misura": return unitOptions.find((u) => u.value === row.unita_misura)?.label || row.unita_misura || "";
    case "quantita": return formatNumber(row.quantita || 0, 2);
    case "prezzo_unitario": return formatEuro(row.prezzo_unitario || 0);
    case "sconto": return `${formatNumber(row.sconto || 0, 0)}%`;
    case "iva_percentuale": return `${formatNumber(row.iva_percentuale || 0, 0)}%`;
    case "totale": return formatEuro(calcRowTotal(row));
    default: return "";
  }
}

// ============================================================
// CLASSICA — Sobria, tradizionale, documento aziendale formale
// Logo in alto a sinistra, singola linea di separazione,
// tabella con sole linee orizzontali, totali in box semplice
// ============================================================
function renderClassica(doc, ctx) {
  const { profile, quote, righe, totals, selectedClient, clienteFirma, unitOptions, calcRowTotal } = ctx;
  const color = hexToRgb(profile?.colore_principale || "#2563eb");
  const cols = getColPositions(MARGIN);
  const logoW = profile?.logo_larghezza || 35;
  const logoH = profile?.logo_altezza || 18;
  let y = 18;

  // Company header — logo left, info below
  if (profile?.logo_url) {
    addImageSafe(doc, profile.logo_url, MARGIN, y, logoW, logoH);
  }
  doc.setFontSize(11); doc.setFont(undefined, "bold");
  doc.text(profile?.ragione_sociale || "", MARGIN, y + logoH + 6);
  doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(80, 80, 80);
  doc.text(`${profile?.indirizzo || ""} · ${profile?.cap || ""} ${profile?.citta || ""} (${profile?.provincia || ""})`, MARGIN, y + logoH + 11);
  doc.text(`P.IVA ${profile?.partita_iva || ""} · Tel ${profile?.telefono || ""} · ${profile?.email || ""}`, MARGIN, y + logoH + 15);
  doc.setTextColor(0, 0, 0);

  // Doc number top-right
  doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(80, 80, 80);
  doc.text("Preventivo", PAGE_W - MARGIN, y + 4, { align: "right" });
  doc.setFontSize(14); doc.setFont(undefined, "bold"); doc.setTextColor(0, 0, 0);
  doc.text(`N. ${quote.numero || ""}`, PAGE_W - MARGIN, y + 11, { align: "right" });
  doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(80, 80, 80);
  doc.text(`del ${quote.data ? new Date(quote.data).toLocaleDateString("it-IT") : ""}`, PAGE_W - MARGIN, y + 16, { align: "right" });
  if (quote.validita_giorni) doc.text(`Validità ${quote.validita_giorni} giorni`, PAGE_W - MARGIN, y + 21, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // Double rule — thick + thin
  y += logoH + 24;
  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(1.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2);
  y += 10;

  // Client — simple left text, no box
  doc.setFontSize(7); doc.setFont(undefined, "bold"); doc.setTextColor(color.r, color.g, color.b);
  doc.text("DESTINATARIO", MARGIN, y); doc.setTextColor(0, 0, 0);
  y += 5;
  doc.setFontSize(10); doc.setFont(undefined, "bold");
  doc.text(quote.cliente_nome || "", MARGIN, y); y += 4;
  if (selectedClient) {
    doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(80, 80, 80);
    if (selectedClient.indirizzo) { doc.text(selectedClient.indirizzo, MARGIN, y); y += 3; }
    const cityLine = [selectedClient.cap, selectedClient.citta, selectedClient.provincia].filter(Boolean).join(" ");
    if (cityLine) { doc.text(cityLine, MARGIN, y); y += 3; }
    if (selectedClient.partita_iva) { doc.text(`P.IVA ${selectedClient.partita_iva}`, MARGIN, y); y += 3; }
    doc.setTextColor(0, 0, 0);
  }
  y += 6;

  if (quote.oggetto) {
    doc.setFontSize(8); doc.setFont(undefined, "normal");
    doc.text(`Oggetto: `, MARGIN, y);
    doc.setFont(undefined, "bold");
    doc.text(quote.oggetto, MARGIN + 16, y);
    y += 8;
  }

  // Table — horizontal lines only, no fills, no vertical lines
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setFontSize(6); doc.setFont(undefined, "bold"); doc.setTextColor(60, 60, 60);
  cols.forEach((c) => c.align === "right" ? doc.text(c.label.toUpperCase(), c.rightX, y + 4, { align: "right" }) : doc.text(c.label.toUpperCase(), c.x, y + 4));
  doc.setTextColor(0, 0, 0);
  y += 6;
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 2;

  doc.setFontSize(7); doc.setFont(undefined, "normal");
  const drawTableTop = (yy) => {
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.4);
    doc.line(MARGIN, yy, PAGE_W - MARGIN, yy);
    doc.setFontSize(6); doc.setFont(undefined, "bold"); doc.setTextColor(60, 60, 60);
    cols.forEach((c) => c.align === "right" ? doc.text(c.label.toUpperCase(), c.rightX, yy + 4, { align: "right" }) : doc.text(c.label.toUpperCase(), c.x, yy + 4));
    doc.setTextColor(0, 0, 0);
    yy += 6;
    doc.setLineWidth(0.3); doc.setDrawColor(180, 180, 180);
    doc.line(MARGIN, yy, PAGE_W - MARGIN, yy);
    return yy + 2;
  };

  righe.forEach((r) => {
    if (y > PAGE_H - 60) { doc.addPage(); y = 20; y = drawTableTop(y); doc.setFontSize(7); doc.setFont(undefined, "normal"); }
    const descCol = cols.find((c) => c.key === "descrizione");
    const descLines = doc.splitTextToSize(r.descrizione || "", descCol.w - 2);
    const rh = Math.max(7, descLines.length * 3.5 + 2);
    cols.forEach((c) => {
      const v = getCellValue(r, c.key, unitOptions, calcRowTotal);
      if (c.key === "descrizione") doc.text(descLines, c.x, y + 4);
      else if (c.align === "right") doc.text(v, c.rightX, y + 4, { align: "right" });
      else doc.text(v, c.x, y + 4);
    });
    doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2);
    doc.line(MARGIN, y + rh, PAGE_W - MARGIN, y + rh);
    y += rh;
  });
  y += 6;

  // Totals — simple right-aligned text block, no box fill
  doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(80, 80, 80);
  doc.text("Imponibile", PAGE_W - MARGIN - 60, y); doc.text(formatEuro(totals.imponibile), PAGE_W - MARGIN, y, { align: "right" }); y += 5;
  doc.text("IVA", PAGE_W - MARGIN - 60, y); doc.text(formatEuro(totals.iva_totale), PAGE_W - MARGIN, y, { align: "right" }); y += 5;
  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(0.5); doc.line(PAGE_W - MARGIN - 60, y, PAGE_W - MARGIN, y); y += 5;
  doc.setFontSize(10); doc.setFont(undefined, "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Totale", PAGE_W - MARGIN - 60, y); doc.text(formatEuro(totals.totale), PAGE_W - MARGIN, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 15;

  if (quote.note) {
    doc.setFontSize(7); doc.setFont(undefined, "bold"); doc.setTextColor(color.r, color.g, color.b);
    doc.text("NOTE", MARGIN, y); doc.setTextColor(0, 0, 0);
    doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(80, 80, 80);
    const nl = doc.splitTextToSize(quote.note, CONTENT_W);
    doc.text(nl, MARGIN, y + 4); y += nl.length * 4 + 8; doc.setTextColor(0, 0, 0);
  }
  drawSignatures(doc, y, profile, clienteFirma);
}

// ============================================================
// MODERNA — Banda colorata piena, grassetto, contemporanea
// Header a piena pagina colorato, titolo grande, zebra rows,
// barra totali colorata full-width
// ============================================================
function renderModerna(doc, ctx) {
  const { profile, quote, righe, totals, selectedClient, clienteFirma, unitOptions, calcRowTotal } = ctx;
  const color = hexToRgb(profile?.colore_principale || "#2563eb");
  const cols = getColPositions(MARGIN);

  // Full-bleed colored header block
  const logoW = profile?.logo_larghezza || 35;
  const logoH = profile?.logo_altezza || 18;
  const headerH = Math.max(42, logoH + 20);
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(0, 0, PAGE_W, headerH, "F");

  // Logo on colored band
  if (profile?.logo_url) {
    addImageSafe(doc, profile.logo_url, MARGIN, (headerH - logoH) / 2, logoW, logoH);
  }
  // Company info on band, right-aligned, white
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11); doc.setFont(undefined, "bold");
  doc.text(profile?.ragione_sociale || "", PAGE_W - MARGIN, 12, { align: "right" });
  doc.setFontSize(6); doc.setFont(undefined, "normal");
  doc.text(`${profile?.indirizzo || ""} ${profile?.cap || ""} ${profile?.citta || ""}`, PAGE_W - MARGIN, 17, { align: "right" });
  doc.text(`P.IVA ${profile?.partita_iva || ""} · Tel ${profile?.telefono || ""}`, PAGE_W - MARGIN, 22, { align: "right" });
  doc.text(profile?.email || "", PAGE_W - MARGIN, 27, { align: "right" });
  doc.setTextColor(0, 0, 0);

  let y = headerH + 10;

  // Big bold title
  doc.setFontSize(22); doc.setFont(undefined, "bold"); doc.setTextColor(30, 30, 30);
  doc.text("PREVENTIVO", MARGIN, y);
  doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.setTextColor(100, 100, 100);
  doc.text(`N. ${quote.numero || ""}`, PAGE_W - MARGIN, y - 2, { align: "right" });
  doc.text(`${quote.data ? new Date(quote.data).toLocaleDateString("it-IT") : ""}`, PAGE_W - MARGIN, y + 4, { align: "right" });
  // Accent thick underline
  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(3);
  doc.line(MARGIN, y + 3, MARGIN + 50, y + 3);
  doc.setTextColor(0, 0, 0);
  y += 12;

  if (quote.validita_giorni) {
    doc.setFontSize(7); doc.setTextColor(color.r, color.g, color.b); doc.setFont(undefined, "bold");
    doc.text(`Validità offerta: ${quote.validita_giorni} giorni`, MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  // Client — colored label, no box
  doc.setFontSize(6); doc.setFont(undefined, "bold"); doc.setTextColor(color.r, color.g, color.b);
  doc.text("CLIENTE", MARGIN, y);
  y += 5;
  doc.setFontSize(10); doc.setFont(undefined, "bold"); doc.setTextColor(30, 30, 30);
  doc.text(quote.cliente_nome || "", MARGIN, y); y += 4;
  if (selectedClient) {
    doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(120, 120, 120);
    if (selectedClient.indirizzo) { doc.text(selectedClient.indirizzo, MARGIN, y); y += 3; }
    const cityLine = [selectedClient.cap, selectedClient.citta, selectedClient.provincia].filter(Boolean).join(" ");
    if (cityLine) { doc.text(cityLine, MARGIN, y); y += 3; }
    doc.setTextColor(0, 0, 0);
  }
  y += 6;

  if (quote.oggetto) { doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(60, 60, 60); doc.text(quote.oggetto, MARGIN, y); y += 7; }

  // Table header — text labels, thick colored underline, no fill
  const drawHeader = (yy) => {
    cols.forEach((c) => {
      doc.setFontSize(6); doc.setFont(undefined, "bold"); doc.setTextColor(120, 120, 120);
      if (c.align === "right") doc.text(c.label.toUpperCase(), c.rightX, yy, { align: "right" });
      else doc.text(c.label.toUpperCase(), c.x, yy);
    });
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(1.5);
    doc.line(MARGIN, yy + 2, PAGE_W - MARGIN, yy + 2);
    return yy + 5;
  };
  y = drawHeader(y);
  doc.setFontSize(7); doc.setFont(undefined, "normal");

  righe.forEach((r, idx) => {
    if (y > PAGE_H - 60) { doc.addPage(); y = 20; y = drawHeader(y); doc.setFontSize(7); doc.setFont(undefined, "normal"); }
    const descCol = cols.find((c) => c.key === "descrizione");
    const descLines = doc.splitTextToSize(r.descrizione || "", descCol.w - 2);
    const rh = Math.max(7, descLines.length * 3.5 + 2);
    // Zebra with light tint of theme color
    if (idx % 2 === 0) {
      doc.setFillColor(248, 249, 252);
      doc.rect(MARGIN, y, CONTENT_W, rh, "F");
    }
    cols.forEach((c) => {
      const v = getCellValue(r, c.key, unitOptions, calcRowTotal);
      if (c.key === "descrizione") doc.text(descLines, c.x, y + 4);
      else if (c.align === "right") doc.text(v, c.rightX, y + 4, { align: "right" });
      else doc.text(v, c.x, y + 4);
    });
    y += rh;
  });
  y += 6;

  // Full-width colored total bar
  const barH = 12;
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(MARGIN, y, CONTENT_W, barH, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont(undefined, "normal");
  doc.text("IMPONIBILE", MARGIN + 4, y + 4.5);
  doc.text(formatEuro(totals.imponibile), MARGIN + 45, y + 4.5, { align: "right" });
  doc.text("IVA", MARGIN + 75, y + 4.5);
  doc.text(formatEuro(totals.iva_totale), MARGIN + 100, y + 4.5, { align: "right" });
  doc.setFontSize(9); doc.setFont(undefined, "bold");
  doc.text("TOTALE", PAGE_W - MARGIN - 55, y + 8.5);
  doc.setFontSize(11);
  doc.text(formatEuro(totals.totale), PAGE_W - MARGIN - 4, y + 8.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += barH + 10;

  if (quote.note) {
    doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(100, 100, 100);
    const nl = doc.splitTextToSize(quote.note, CONTENT_W);
    doc.text(nl, MARGIN, y); y += nl.length * 4 + 8; doc.setTextColor(0, 0, 0);
  }
  drawSignatures(doc, y, profile, clienteFirma);
}

// ============================================================
// MINIMAL — Massima essenzialità, tanto spazio bianco
// Niente colori, niente riempimenti, niente bordi.
// Solo linee grigie sottilissime, tipografia piccola,
// grandi spaziature verticali
// ============================================================
function renderMinimal(doc, ctx) {
  const { profile, quote, righe, totals, selectedClient, clienteFirma, unitOptions, calcRowTotal } = ctx;
  const cols = getColPositions(MARGIN);
  const GRAY = 200;
  const DARK = 60;
  const logoW = profile?.logo_larghezza || 22;
  const logoH = profile?.logo_altezza || 11;
  let y = 25;

  // Tiny company info, all left, gray
  if (profile?.logo_url) {
    addImageSafe(doc, profile.logo_url, MARGIN, y, logoW, logoH);
  }
  const textX = MARGIN + logoW + 4;
  doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(GRAY, GRAY, GRAY);
  doc.text(profile?.ragione_sociale || "", textX, y + 3);
  doc.text(`${profile?.indirizzo || ""} ${profile?.cap || ""} ${profile?.citta || ""}`, textX, y + 7);
  doc.text(`P.IVA ${profile?.partita_iva || ""}  ${profile?.email || ""}`, textX, y + 11);
  doc.setTextColor(0, 0, 0);
  y += Math.max(22, logoH + 4);

  // Huge gap, tiny letter-spaced title
  y += 15;
  doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.setTextColor(DARK, DARK, DARK);
  doc.text("P R E V E N T I V O", MARGIN, y);
  doc.setFontSize(7); doc.setTextColor(GRAY, GRAY, GRAY);
  doc.text(`${quote.numero || ""}  /  ${quote.data ? new Date(quote.data).toLocaleDateString("it-IT") : ""}`, PAGE_W - MARGIN, y, { align: "right" });
  y += 8;

  // Single thin line
  doc.setDrawColor(GRAY, GRAY, GRAY); doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 15;

  // Client — just name, big-ish
  doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(DARK, DARK, DARK);
  doc.text(quote.cliente_nome || "", MARGIN, y); y += 4;
  if (selectedClient) {
    doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(GRAY, GRAY, GRAY);
    if (selectedClient.indirizzo) { doc.text(selectedClient.indirizzo, MARGIN, y); y += 3; }
    const cityLine = [selectedClient.cap, selectedClient.citta, selectedClient.provincia].filter(Boolean).join(" ");
    if (cityLine) { doc.text(cityLine, MARGIN, y); y += 3; }
  }
  y += 12;

  if (quote.oggetto) {
    doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(DARK, DARK, DARK);
    doc.text(quote.oggetto, MARGIN, y); y += 10;
  }

  // Table — no header fill, tiny gray labels, only thin bottom lines
  const drawHeader = (yy) => {
    cols.forEach((c) => {
      doc.setFontSize(5); doc.setFont(undefined, "normal"); doc.setTextColor(GRAY, GRAY, GRAY);
      if (c.align === "right") doc.text(c.label.toUpperCase(), c.rightX, yy, { align: "right" });
      else doc.text(c.label.toUpperCase(), c.x, yy);
    });
    yy += 3;
    doc.setDrawColor(GRAY, GRAY, GRAY); doc.setLineWidth(0.2);
    doc.line(MARGIN, yy, PAGE_W - MARGIN, yy);
    return yy + 4;
  };
  y = drawHeader(y);
  doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(DARK, DARK, DARK);

  righe.forEach((r) => {
    if (y > PAGE_H - 65) { doc.addPage(); y = 25; y = drawHeader(y); doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(DARK, DARK, DARK); }
    const descCol = cols.find((c) => c.key === "descrizione");
    const descLines = doc.splitTextToSize(r.descrizione || "", descCol.w - 2);
    const rh = Math.max(7, descLines.length * 3.5 + 3);
    cols.forEach((c) => {
      const v = getCellValue(r, c.key, unitOptions, calcRowTotal);
      if (c.key === "descrizione") doc.text(descLines, c.x, y + 3);
      else if (c.align === "right") doc.text(v, c.rightX, y + 3, { align: "right" });
      else doc.text(v, c.x, y + 3);
    });
    doc.setDrawColor(235, 235, 235); doc.setLineWidth(0.15);
    doc.line(MARGIN, y + rh, PAGE_W - MARGIN, y + rh);
    y += rh;
  });
  y += 15;

  // Totals — sparse text, right-aligned, lots of line spacing
  doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(GRAY, GRAY, GRAY);
  doc.text("Imponibile", PAGE_W - MARGIN - 55, y); doc.text(formatEuro(totals.imponibile), PAGE_W - MARGIN, y, { align: "right" }); y += 6;
  doc.text("IVA", PAGE_W - MARGIN - 55, y); doc.text(formatEuro(totals.iva_totale), PAGE_W - MARGIN, y, { align: "right" }); y += 6;
  doc.setDrawColor(GRAY, GRAY, GRAY); doc.setLineWidth(0.2); doc.line(PAGE_W - MARGIN - 55, y, PAGE_W - MARGIN, y); y += 6;
  doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(DARK, DARK, DARK);
  doc.text("Totale", PAGE_W - MARGIN - 55, y); doc.text(formatEuro(totals.totale), PAGE_W - MARGIN, y, { align: "right" });
  y += 20;

  if (quote.note) {
    doc.setFontSize(6); doc.setFont(undefined, "normal"); doc.setTextColor(GRAY, GRAY, GRAY);
    const nl = doc.splitTextToSize(quote.note, CONTENT_W - 20);
    doc.text(nl, MARGIN, y); y += nl.length * 3.5 + 10;
  }
  drawSignatures(doc, y, profile, clienteFirma);
}

// ============================================================
// PROFESSIONALE — Struttura ricca, sezioni con bordi, griglia
// completa. Box aziendale, box cliente, tabella con griglia
// verticale+orizzontale, box totali con header colorato,
// box note. Adatta a lavori importanti
// ============================================================
function renderProfessionale(doc, ctx) {
  const { profile, quote, righe, totals, selectedClient, clienteFirma, unitOptions, calcRowTotal } = ctx;
  const color = hexToRgb(profile?.colore_principale || "#2563eb");
  const cols = getColPositions(MARGIN);
  let y = 15;

  // Company header box — bordered with left color bar
  const logoW = profile?.logo_larghezza || 22;
  const logoH = profile?.logo_altezza || 12;
  const hdrH = Math.max(24, logoH + 8);
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(MARGIN, y, 3, hdrH, "F");
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.rect(MARGIN + 3, y, CONTENT_W - 3, hdrH);
  if (profile?.logo_url) {
    addImageSafe(doc, profile.logo_url, MARGIN + 7, y + 4, logoW, logoH);
  }
  doc.setFontSize(11); doc.setFont(undefined, "bold");
  doc.text(profile?.ragione_sociale || "", MARGIN + 7 + logoW + 3, y + 7);
  doc.setFontSize(6); doc.setFont(undefined, "normal"); doc.setTextColor(100, 100, 100);
  doc.text(`${profile?.indirizzo || ""} · ${profile?.cap || ""} ${profile?.citta || ""} (${profile?.provincia || ""})`, MARGIN + 32, y + 12);
  doc.text(`P.IVA ${profile?.partita_iva || ""} · Tel ${profile?.telefono || ""} · ${profile?.email || ""}`, MARGIN + 32, y + 17);
  doc.setTextColor(0, 0, 0);
  y += hdrH + 6;

  // Title bar — colored full width with number
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(MARGIN, y, CONTENT_W, 9, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont(undefined, "bold");
  doc.text("PREVENTIVO", MARGIN + 4, y + 6);
  doc.text(`N. ${quote.numero || ""}`, PAGE_W - MARGIN - 4, y + 6, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 13;
  doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(80, 80, 80);
  doc.text(`Data: ${quote.data ? new Date(quote.data).toLocaleDateString("it-IT") : ""}`, MARGIN, y);
  if (quote.validita_giorni) doc.text(`Validità: ${quote.validita_giorni} giorni`, PAGE_W - MARGIN, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 6;

  // Client box — bordered
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, CONTENT_W, 16);
  doc.setFontSize(6); doc.setFont(undefined, "bold"); doc.setTextColor(color.r, color.g, color.b);
  doc.text("DESTINATARIO", MARGIN + 3, y + 4); doc.setTextColor(0, 0, 0);
  doc.setFontSize(9); doc.setFont(undefined, "bold");
  doc.text(quote.cliente_nome || "", MARGIN + 3, y + 9);
  if (selectedClient) {
    doc.setFontSize(6); doc.setFont(undefined, "normal"); doc.setTextColor(100, 100, 100);
    if (selectedClient.indirizzo) doc.text(selectedClient.indirizzo, MARGIN + 3, y + 13);
    doc.setTextColor(0, 0, 0);
  }
  y += 20;

  if (quote.oggetto) {
    doc.setFontSize(8); doc.setFont(undefined, "normal");
    doc.text(`Oggetto: ${quote.oggetto}`, MARGIN, y); y += 6;
  }

  // Table — full grid with colored header and vertical separators
  const drawHeader = (yy) => {
    const h = 7;
    doc.setFillColor(color.r, color.g, color.b);
    doc.rect(MARGIN, yy, CONTENT_W, h, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont(undefined, "bold");
    cols.forEach((c) => c.align === "right" ? doc.text(c.label.toUpperCase(), c.rightX, yy + 5, { align: "right" }) : doc.text(c.label.toUpperCase(), c.x, yy + 5));
    // White vertical separators in header
    doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.3);
    cols.forEach((c, i) => { if (i > 0) doc.line(c.x, yy, c.x, yy + h); });
    doc.setTextColor(0, 0, 0);
    return yy + h;
  };
  y = drawHeader(y);
  doc.setFontSize(7); doc.setFont(undefined, "normal");

  righe.forEach((r, idx) => {
    if (y > PAGE_H - 65) { doc.addPage(); y = 20; y = drawHeader(y); doc.setFontSize(7); doc.setFont(undefined, "normal"); }
    const descCol = cols.find((c) => c.key === "descrizione");
    const descLines = doc.splitTextToSize(r.descrizione || "", descCol.w - 2);
    const rh = Math.max(7, descLines.length * 3.5 + 2);
    if (idx % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(MARGIN, y, CONTENT_W, rh, "F"); }
    // Full grid
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, CONTENT_W, rh);
    cols.forEach((c, i) => { if (i > 0) doc.line(c.x, y, c.x, y + rh); });
    cols.forEach((c) => {
      const v = getCellValue(r, c.key, unitOptions, calcRowTotal);
      if (c.key === "descrizione") doc.text(descLines, c.x, y + 4);
      else if (c.align === "right") doc.text(v, c.rightX, y + 4, { align: "right" });
      else doc.text(v, c.x, y + 4);
    });
    y += rh;
  });
  y += 6;

  // Totals box — bordered with colored header strip
  const boxW = 90, boxX = PAGE_W - MARGIN - boxW;
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.rect(boxX, y, boxW, 26);
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(boxX, y, boxW, 5, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont(undefined, "bold");
  doc.text("RIEPILOGO IMPORTI", boxX + boxW / 2, y + 3.5, { align: "center" });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(7); doc.setFont(undefined, "normal");
  doc.text("Imponibile:", boxX + 4, y + 11); doc.text(formatEuro(totals.imponibile), boxX + boxW - 4, y + 11, { align: "right" });
  doc.text("IVA:", boxX + 4, y + 16); doc.text(formatEuro(totals.iva_totale), boxX + boxW - 4, y + 16, { align: "right" });
  doc.setDrawColor(200, 200, 200); doc.line(boxX + 4, y + 19, boxX + boxW - 4, y + 19);
  doc.setFont(undefined, "bold"); doc.setFontSize(10);
  doc.text("TOTALE:", boxX + 4, y + 24); doc.text(formatEuro(totals.totale), boxX + boxW - 4, y + 24, { align: "right" });
  y += 32;

  // Notes in bordered box
  if (quote.note) {
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
    const nl = doc.splitTextToSize(quote.note, CONTENT_W - 8);
    const nh = nl.length * 4 + 8;
    doc.rect(MARGIN, y, CONTENT_W, nh);
    doc.setFontSize(6); doc.setFont(undefined, "bold"); doc.setTextColor(color.r, color.g, color.b);
    doc.text("NOTE", MARGIN + 4, y + 5); doc.setTextColor(0, 0, 0);
    doc.setFontSize(7); doc.setFont(undefined, "normal");
    doc.text(nl, MARGIN + 4, y + 9);
    y += nh + 5;
  }
  drawSignatures(doc, y, profile, clienteFirma);
}

// ============================================================
// ELEGANTE — Premium, centrato, decorativo, raffinato
// Tutto centrato, doppie linee decorative, logo centrato,
// titolo con linee laterali, tabella arrotondata, totali
// in box con bordo colorato, dettagli grafici curati
// ============================================================
function renderElegante(doc, ctx) {
  const { profile, quote, righe, totals, selectedClient, clienteFirma, unitOptions, calcRowTotal } = ctx;
  const color = hexToRgb(profile?.colore_principale || "#2563eb");
  const cols = getColPositions(MARGIN);
  const CX = PAGE_W / 2;
  let y = 18;

  // Top decorative double line
  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(0.8);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
  y += 10;

  // Logo centered
  if (profile?.logo_url) {
    const lw = profile?.logo_larghezza || 38;
    const lh = profile?.logo_altezza || 19;
    addImageSafe(doc, profile.logo_url, (PAGE_W - lw) / 2, y, lw, lh);
    y += lh + 3;
  }

  // Company info centered
  doc.setFontSize(10); doc.setFont(undefined, "bold");
  doc.text(profile?.ragione_sociale || "", CX, y, { align: "center" }); y += 4;
  doc.setFontSize(6); doc.setFont(undefined, "normal"); doc.setTextColor(120, 120, 120);
  doc.text(`${profile?.indirizzo || ""} · ${profile?.cap || ""} ${profile?.citta || ""} (${profile?.provincia || ""})`, CX, y, { align: "center" }); y += 3;
  doc.text(`P.IVA ${profile?.partita_iva || ""} · Tel ${profile?.telefono || ""} · ${profile?.email || ""}`, CX, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 8;

  // Decorative title with flanking lines and diamond accents
  doc.setFontSize(15); doc.setFont(undefined, "bold");
  const titleText = "PREVENTIVO";
  const titleW = doc.getTextWidth(titleText);
  const gap = 8;
  const lineLen = (CONTENT_W - titleW - gap * 2) / 2;
  const titleY = y + 5;
  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(0.5);
  doc.line(MARGIN, titleY, MARGIN + lineLen, titleY);
  doc.line(PAGE_W - MARGIN - lineLen, titleY, PAGE_W - MARGIN, titleY);
  // Small diamond dots at line ends
  doc.setFillColor(color.r, color.g, color.b);
  doc.circle(MARGIN + lineLen + 1, titleY, 0.8, "F");
  doc.circle(PAGE_W - MARGIN - lineLen - 1, titleY, 0.8, "F");
  doc.text(titleText, CX, titleY + 1, { align: "center" });
  y += 9;

  doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(100, 100, 100);
  doc.text(`N. ${quote.numero || ""}`, CX, y, { align: "center" });
  y += 4;
  doc.text(`${quote.data ? new Date(quote.data).toLocaleDateString("it-IT") : ""}`, CX, y, { align: "center" });
  if (quote.validita_giorni) {
    y += 4;
    doc.text(`Validità ${quote.validita_giorni} giorni`, CX, y, { align: "center" });
  }
  doc.setTextColor(0, 0, 0);
  y += 10;

  // Client — centered in framed box with colored border
  const clientH = 18;
  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(0.4);
  doc.rect(MARGIN, y, CONTENT_W, clientH);
  // Inner thin frame
  doc.setLineWidth(0.15);
  doc.rect(MARGIN + 1.5, y + 1.5, CONTENT_W - 3, clientH - 3);
  doc.setFontSize(6); doc.setFont(undefined, "bold"); doc.setTextColor(color.r, color.g, color.b);
  doc.text("DESTINATARIO", CX, y + 5, { align: "center" }); doc.setTextColor(0, 0, 0);
  doc.setFontSize(9); doc.setFont(undefined, "bold");
  doc.text(quote.cliente_nome || "", CX, y + 10, { align: "center" });
  if (selectedClient) {
    doc.setFontSize(6); doc.setFont(undefined, "normal"); doc.setTextColor(120, 120, 120);
    const cityLine = [selectedClient.indirizzo, selectedClient.cap, selectedClient.citta, selectedClient.provincia].filter(Boolean).join(" · ");
    if (cityLine) doc.text(cityLine, CX, y + 14, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }
  y += clientH + 6;

  if (quote.oggetto) {
    doc.setFontSize(8); doc.setFont(undefined, "italic"); doc.setTextColor(80, 80, 80);
    doc.text(quote.oggetto, CX, y, { align: "center" });
    doc.setTextColor(0, 0, 0);
    y += 7;
  }

  // Table — rounded header, no zebra, thin colored separators
  const drawHeader = (yy) => {
    const h = 7;
    doc.setFillColor(color.r, color.g, color.b);
    doc.roundedRect(MARGIN, yy, CONTENT_W, h, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont(undefined, "bold");
    cols.forEach((c) => c.align === "right" ? doc.text(c.label.toUpperCase(), c.rightX, yy + 5, { align: "right" }) : doc.text(c.label.toUpperCase(), c.x, yy + 5));
    doc.setTextColor(0, 0, 0);
    return yy + h;
  };
  y = drawHeader(y);
  doc.setFontSize(7); doc.setFont(undefined, "normal");

  righe.forEach((r, idx) => {
    if (y > PAGE_H - 65) { doc.addPage(); y = 20; y = drawHeader(y); doc.setFontSize(7); doc.setFont(undefined, "normal"); }
    const descCol = cols.find((c) => c.key === "descrizione");
    const descLines = doc.splitTextToSize(r.descrizione || "", descCol.w - 2);
    const rh = Math.max(7, descLines.length * 3.5 + 2);
    if (idx % 2 === 0) { doc.setFillColor(252, 252, 253); doc.rect(MARGIN, y, CONTENT_W, rh, "F"); }
    doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(0.12);
    doc.line(MARGIN, y + rh, PAGE_W - MARGIN, y + rh);
    cols.forEach((c) => {
      const v = getCellValue(r, c.key, unitOptions, calcRowTotal);
      if (c.key === "descrizione") doc.text(descLines, c.x, y + 4);
      else if (c.align === "right") doc.text(v, c.rightX, y + 4, { align: "right" });
      else doc.text(v, c.x, y + 4);
    });
    y += rh;
  });
  y += 6;

  // Totals — centered framed box with double border
  const boxW = 85, boxX = CX - boxW / 2;
  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(0.5);
  doc.roundedRect(boxX, y, boxW, 26, 2, 2);
  doc.setLineWidth(0.2);
  doc.roundedRect(boxX + 1.5, y + 1.5, boxW - 3, 23, 1.5, 1.5);
  doc.setFontSize(7); doc.setFont(undefined, "normal");
  doc.text("Imponibile", CX - 20, y + 7, { align: "right" }); doc.text(formatEuro(totals.imponibile), CX + 20, y + 7, { align: "right" });
  doc.text("IVA", CX - 20, y + 13, { align: "right" }); doc.text(formatEuro(totals.iva_totale), CX + 20, y + 13, { align: "right" });
  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(0.3); doc.line(boxX + 8, y + 16, boxX + boxW - 8, y + 16);
  doc.setFont(undefined, "bold"); doc.setFontSize(10);
  doc.text("TOTALE", CX - 20, y + 23, { align: "right" }); doc.text(formatEuro(totals.totale), CX + 20, y + 23, { align: "right" });
  y += 32;

  // Decorative bottom line before notes/signatures
  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setLineWidth(0.15);
  doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
  y += 6;

  if (quote.note) {
    doc.setFontSize(7); doc.setFont(undefined, "italic"); doc.setTextColor(100, 100, 100);
    const nl = doc.splitTextToSize(quote.note, CONTENT_W - 10);
    doc.text(nl, CX, y, { align: "center" }); y += nl.length * 4 + 8; doc.setTextColor(0, 0, 0);
  }
  drawSignatures(doc, y, profile, clienteFirma);
}

// Shared signature block
function drawSignatures(doc, y, profile, clienteFirma) {
  if (y > PAGE_H - 40) { doc.addPage(); y = 20; }
  y += 10;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 15, MARGIN + 60, y + 15);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Firma e Timbro (Azienda)", MARGIN, y + 19);
  doc.setTextColor(0, 0, 0);
  if (profile?.firma_url) addImageSafe(doc, profile.firma_url, MARGIN, y - 5, 40, 18);
  if (profile?.timbro_url) addImageSafe(doc, profile.timbro_url, MARGIN + 35, y - 10, 25, 25);
  const clientSigX = PAGE_W - MARGIN - 70;
  doc.setDrawColor(200, 200, 200);
  doc.line(clientSigX, y + 15, clientSigX + 65, y + 15);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Firma Cliente (per accettazione)", clientSigX, y + 19);
  if (clienteFirma) {
    addImageSafe(doc, clienteFirma, clientSigX, y - 5, 55, 18);
    doc.setFontSize(6);
    doc.text(`Firmato il ${new Date().toLocaleDateString("it-IT")}`, clientSigX, y + 22);
  }
  doc.setTextColor(0, 0, 0);
}

export const QUOTE_TEMPLATES = [
  { id: "classica", nome: "Classica", descrizione: "Sobria e tradizionale, stile letterhead aziendale con doppia linea di separazione", render: renderClassica },
  { id: "moderna", nome: "Moderna", descrizione: "Banda colorata a piena pagina, titolo grande, righe zebrate e barra totali vivace", render: renderModerna },
  { id: "minimal", nome: "Minimal", descrizione: "Massimo spazio bianco, niente colori né bordi, solo linee grigie sottilissime", render: renderMinimal },
  { id: "professionale", nome: "Professionale", descrizione: "Struttura ricca con box bordati, griglia completa e sezioni ben delimitate", render: renderProfessionale },
  { id: "elegante", nome: "Elegante", descrizione: "Premium centrato, doppie linee decorative, tabella arrotondata e dettagli raffinati", render: renderElegante },
];

// ─── Preparazione comune a tutte le grafiche ───

const imageCache = new Map();

// jsPDF vuole le immagini già caricate: le trasformiamo in data URL.
async function toDataUrl(url) {
  if (!url || url.startsWith("data:")) return url || null;
  if (imageCache.has(url)) return imageCache.get(url);
  const p = fetch(url)
    .then((r) => (r.ok ? r.blob() : null))
    .then((blob) => blob && new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    }))
    .catch(() => null);
  imageCache.set(url, p);
  return p;
}

async function imageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Righe per la stampa: capitoli in evidenza, subtotale in fondo a ogni capitolo,
// voci opzionali segnalate (il loro importo non entra nel totale).
function printableRows(righe, calcRowTotal) {
  const hasChapters = righe.some((r) => r.tipo === "capitolo");
  const out = [];
  let chapter = null;
  const closeChapter = () => {
    if (chapter && chapter.count > 0) out.push({ descrizione: `Subtotale ${chapter.titolo}`, _subtotale: chapter.totale });
  };
  for (const r of righe) {
    if (r.tipo === "capitolo") {
      closeChapter();
      chapter = { titolo: r.descrizione || "", totale: 0, count: 0 };
      // Solo caratteri del font standard PDF (niente simboli Unicode).
      out.push({ ...r, descrizione: (r.descrizione || "").toUpperCase() });
    } else if (r.tipo === "testo") {
      out.push(r);
    } else {
      if (chapter && !r.opzionale) { chapter.totale += calcRowTotal(r); chapter.count++; }
      out.push(r.opzionale ? { ...r, descrizione: `[OPZIONALE – non incluso nel totale] ${r.descrizione || ""}` } : r);
    }
  }
  if (hasChapters) closeChapter();
  return out;
}

function summaryNote(ctx) {
  const { quote, totals } = ctx;
  const parts = [];
  if (totals.iva?.length > 1) {
    parts.push("Riepilogo IVA: " + totals.iva.map((x) => `${x.aliquota}% su ${formatEuro(x.imponibile)} = ${formatEuro(x.imposta)}`).join(" · "));
  }
  if (totals.sconto_importo > 0.005) parts.push(`Sconto applicato sul totale: ${formatNumber(quote.sconto_globale, 2)}% (${formatEuro(totals.sconto_importo)})`);
  if (totals.opzionali > 0.005) parts.push(`Voci opzionali non incluse nel totale: ${formatEuro(totals.opzionali)} + IVA`);
  const conditions = ctx.conditions || "";
  return [parts.join("\n"), conditions ? `CONDIZIONI\n${conditions}` : "", quote.note || ""].filter(Boolean).join("\n\n");
}

function drawCover(doc, ctx) {
  const { profile, quote, totals, chapters } = ctx;
  const color = hexToRgb(profile?.colore_principale || "#2563eb");
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(0, 0, PAGE_W, 8, "F");
  let y = 40;
  if (profile?.logo_url) {
    const w = Math.min(70, (profile.logo_larghezza || 35) * 1.6);
    const h = Math.min(40, (profile.logo_altezza || 18) * 1.6);
    addImageSafe(doc, profile.logo_url, (PAGE_W - w) / 2, y, w, h);
    y += h + 12;
  }
  doc.setFontSize(12); doc.setFont(undefined, "bold"); doc.setTextColor(40, 40, 40);
  doc.text(profile?.ragione_sociale || "", PAGE_W / 2, y, { align: "center" });
  y += 30;
  doc.setFontSize(10); doc.setFont(undefined, "normal"); doc.setTextColor(color.r, color.g, color.b);
  doc.text("PREVENTIVO", PAGE_W / 2, y, { align: "center" });
  y += 12;
  doc.setFontSize(20); doc.setFont(undefined, "bold"); doc.setTextColor(20, 20, 20);
  const title = doc.splitTextToSize(quote.oggetto || `Preventivo n. ${quote.numero || ""}`, CONTENT_W - 20);
  doc.text(title, PAGE_W / 2, y, { align: "center" });
  y += title.length * 9 + 6;
  doc.setFontSize(10); doc.setFont(undefined, "normal"); doc.setTextColor(90, 90, 90);
  doc.text(`N. ${quote.numero || ""}${quote.revisione ? ` · Rev. ${quote.revisione}` : ""} · ${quote.data ? new Date(quote.data).toLocaleDateString("it-IT") : ""}`, PAGE_W / 2, y, { align: "center" });
  y += 7;
  if (quote.cliente_nome) doc.text(`Alla cortese attenzione di ${quote.cliente_nome}`, PAGE_W / 2, y, { align: "center" });
  y += 20;

  if (chapters?.length) {
    doc.setFontSize(8); doc.setFont(undefined, "bold"); doc.setTextColor(color.r, color.g, color.b);
    doc.text("SOMMARIO", MARGIN + 20, y); y += 5;
    doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2);
    doc.setFont(undefined, "normal"); doc.setTextColor(40, 40, 40); doc.setFontSize(9);
    chapters.forEach((c) => {
      doc.text(c.titolo, MARGIN + 20, y + 4);
      doc.text(formatEuro(c.totale), PAGE_W - MARGIN - 20, y + 4, { align: "right" });
      doc.line(MARGIN + 20, y + 6.5, PAGE_W - MARGIN - 20, y + 6.5);
      y += 8;
    });
    y += 4;
  }
  doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.setTextColor(90, 90, 90);
  doc.text("Imponibile", MARGIN + 20, y); doc.text(formatEuro(totals.imponibile), PAGE_W - MARGIN - 20, y, { align: "right" }); y += 6;
  doc.setFontSize(12); doc.setFont(undefined, "bold"); doc.setTextColor(20, 20, 20);
  doc.text("Totale IVA inclusa", MARGIN + 20, y); doc.text(formatEuro(totals.totale), PAGE_W - MARGIN - 20, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

async function appendAttachments(doc, allegati = []) {
  for (const a of allegati) {
    if (!/\.(png|jpe?g|webp)(\?|$)/i.test(a.url || "") && !/^image\//.test(a.type || "")) continue;
    const data = await toDataUrl(a.url);
    if (!data) continue;
    const size = await imageSize(data);
    if (!size) continue;
    doc.addPage();
    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(60, 60, 60);
    doc.text(a.name || "Allegato", MARGIN, 18);
    const maxW = CONTENT_W, maxH = PAGE_H - 50;
    const ratio = Math.min(maxW / size.w, maxH / size.h);
    const w = size.w * ratio, h = size.h * ratio;
    addImageSafe(doc, data, MARGIN + (maxW - w) / 2, 24, w, h);
  }
}

/**
 * ctx: { profile, quote, righe, totals, selectedClient, clienteFirma, unitOptions, calcRowTotal,
 *        conditions?, chapters? }
 */
export async function generateQuotePDF(templateId, ctx) {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF();
  const template = QUOTE_TEMPLATES.find((t) => t.id === templateId) || QUOTE_TEMPLATES[0];

  const [logo, firma, timbro, clienteFirma] = await Promise.all([
    toDataUrl(ctx.profile?.logo_url), toDataUrl(ctx.profile?.firma_url), toDataUrl(ctx.profile?.timbro_url), toDataUrl(ctx.clienteFirma),
  ]);
  const profile = ctx.profile ? { ...ctx.profile, logo_url: logo, firma_url: firma, timbro_url: timbro } : ctx.profile;
  const prepared = {
    ...ctx,
    profile,
    clienteFirma,
    righe: printableRows(ctx.righe || [], ctx.calcRowTotal),
    quote: { ...ctx.quote, numero: `${ctx.quote.numero || ""}${ctx.quote.revisione ? ` Rev.${ctx.quote.revisione}` : ""}` },
  };
  prepared.quote.note = summaryNote({ ...prepared, quote: { ...ctx.quote } });

  template.render(doc, prepared);
  if (ctx.quote.copertina) {
    doc.insertPage(1);
    doc.setPage(1);
    drawCover(doc, prepared);
  }
  await appendAttachments(doc, ctx.quote.allegati);
  addFooter(doc, profile, PAGE_W, PAGE_H, MARGIN);
  return doc.output("blob");
}