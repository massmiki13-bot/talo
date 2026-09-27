// Shared PDF utilities for clean, readable document generation

export function formatEuro(amount) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function formatNumber(n, decimals = 2) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n || 0);
}

export function hexToRgb(hex) {
  if (!hex || !hex.startsWith("#")) return { r: 37, g: 99, b: 235 };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

export function addImageSafe(doc, url, x, y, w, h) {
  if (!url) return;
  try {
    const imgType = url.match(/\.(png)$/i) ? "PNG" : "JPEG";
    doc.addImage(url, imgType, x, y, w, h);
  } catch (e) {}
}

export function getLogoPosition(profile, pageWidth, margin) {
  const pos = profile?.logo_posizione || "alto_sinistra";
  const w = profile?.logo_larghezza || 55;
  const h = profile?.logo_altezza || 28;
  let x;
  if (pos === "alto_centro") x = (pageWidth - w) / 2;
  else if (pos === "alto_destra") x = pageWidth - margin - w;
  else x = margin;
  return { x, y: 14, w, h };
}

export function addCompanyHeader(doc, profile, pageWidth, margin) {
  let y = 14;
  const color = hexToRgb(profile?.colore_principale || "#2563eb");
  const color2 = hexToRgb(profile?.colore_secondario || profile?.colore_principale || "#2563eb");

  // Logo in alto, sopra i dati aziendali
  if (profile?.logo_url) {
    const lp = getLogoPosition(profile, pageWidth, margin);
    addImageSafe(doc, profile.logo_url, lp.x, lp.y, lp.w, lp.h);
    y = lp.y + lp.h + 4;
  }

  // Dati aziendali sotto il logo
  if (profile) {
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text(profile.ragione_sociale || "", margin, y);
    y += 5;
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(`${profile.indirizzo || ""} - ${profile.cap || ""} ${profile.citta || ""} (${profile.provincia || ""})`, margin, y);
    y += 4;
    doc.text(`P.IVA: ${profile.partita_iva || ""} | Tel: ${profile.telefono || ""}`, margin, y);
    y += 4;
    doc.text(`Email: ${profile.email || ""} | PEC: ${profile.pec || ""}`, margin, y);
    y += 4;
    if (profile.codice_destinatario) {
      doc.text(`Codice di Fatturazione: ${profile.codice_destinatario}`, margin, y);
      y += 4;
    }
    if (profile.sito_web) {
      doc.text(`Sito web: ${profile.sito_web}`, margin, y);
      y += 4;
    }
  }

  doc.setDrawColor(color.r, color.g, color.b);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;
  return { y, color, color2 };
}

export function addFooter(doc, profile, pageWidth, pageHeight, margin) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (profile?.logo_url && profile?.logo_su_ogni_pagina !== false) {
      addImageSafe(doc, profile.logo_url, pageWidth - margin - 12, pageHeight - 14, 10, 7);
    }
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Pagina ${i} di ${pageCount}`, pageWidth - margin - 15, pageHeight - 8, { align: "right" });
    if (profile) doc.text(profile.ragione_sociale || "", margin, pageHeight - 8);
    doc.setTextColor(0, 0, 0);
  }
}

// Table column right-edges (for right-aligned) or x positions (for left-aligned)
export const TABLE_COLS = {
  desc: { x: 17, endX: 98 },
  um:   { x: 100 },
  qty:  { rightX: 122 },
  price:{ rightX: 146 },
  disc: { rightX: 158 },
  iva:  { rightX: 170 },
  tot:  { rightX: 193 },
};

export function drawTableHeader(doc, y, margin, contentWidth, color) {
  const headerH = 8;
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(margin, y, contentWidth, headerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont(undefined, "bold");
  doc.text("Descrizione", TABLE_COLS.desc.x, y + 5.5);
  doc.text("U.M.", TABLE_COLS.um.x, y + 5.5);
  doc.text("Qtà", TABLE_COLS.qty.rightX, y + 5.5, { align: "right" });
  doc.text("Prezzo Unit.", TABLE_COLS.price.rightX, y + 5.5, { align: "right" });
  doc.text("Sc.%", TABLE_COLS.disc.rightX, y + 5.5, { align: "right" });
  doc.text("IVA", TABLE_COLS.iva.rightX, y + 5.5, { align: "right" });
  doc.text("Totale", TABLE_COLS.tot.rightX, y + 5.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  return y + headerH;
}

export function addTotalsBox(doc, y, totals, color, pageWidth, margin) {
  const boxW = 80;
  const boxX = pageWidth - margin - boxW;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(boxX, y, boxW, 26, 2, 2, "F");
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);
  doc.text("Imponibile:", boxX + 4, y + 7);
  doc.text(formatEuro(totals.imponibile), boxX + boxW - 4, y + 7, { align: "right" });
  doc.text("IVA:", boxX + 4, y + 13);
  doc.text(formatEuro(totals.iva_totale), boxX + boxW - 4, y + 13, { align: "right" });
  doc.setDrawColor(color.r, color.g, color.b);
  doc.setLineWidth(0.5);
  doc.line(boxX + 4, y + 16, boxX + boxW - 4, y + 16);
  doc.setFont(undefined, "bold");
  doc.setFontSize(11);
  doc.text("TOTALE:", boxX + 4, y + 22);
  doc.text(formatEuro(totals.totale), boxX + boxW - 4, y + 22, { align: "right" });
}