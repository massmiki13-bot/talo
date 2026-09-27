import { base44, db } from "@/lib/db";
import { formatEuro, hexToRgb, addImageSafe, addFooter } from "@/utils/pdfUtils";

export async function exportWorksiteFolder(worksite, transactions, photos, laborCost, employees, attendance) {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF();
  const profiles = await db.CompanyProfile.list();
  const profile = profiles[0];
  const pageWidth = 210, pageHeight = 297, margin = 15;
  const color = hexToRgb(profile?.colore_principale || "#2563eb");
  let y = 20;

  // Header
  const logoW = profile?.logo_larghezza || 35;
  const logoH = profile?.logo_altezza || 18;
  if (profile?.logo_url) addImageSafe(doc, profile.logo_url, margin, 12, logoW, logoH);
  if (profile) {
    const textX = profile.logo_url ? margin + logoW + 5 : margin;
    doc.setFontSize(14); doc.setFont(undefined, "bold");
    doc.text(profile.ragione_sociale || "", textX, 18);
    doc.setFontSize(8); doc.setFont(undefined, "normal");
    doc.text(`${profile.indirizzo || ""} ${profile.citta || ""} | P.IVA: ${profile.partita_iva || ""}`, textX, 23);
    y = 32;
  }

  doc.setDrawColor(color.r, color.g, color.b);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Title
  doc.setFontSize(16); doc.setFont(undefined, "bold");
  doc.text("Cartella Lavoro", margin, y);
  y += 8;
  doc.setFontSize(12);
  doc.text(worksite.nome || "", margin, y);
  y += 6;
  doc.setFontSize(9); doc.setFont(undefined, "normal");
  if (worksite.indirizzo) { doc.text(`Indirizzo: ${worksite.indirizzo}`, margin, y); y += 5; }
  if (worksite.cliente_nome) { doc.text(`Cliente: ${worksite.cliente_nome}`, margin, y); y += 5; }
  y += 4;

  // Economic summary
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageWidth - margin * 2, 40, "F");
  doc.setFontSize(11); doc.setFont(undefined, "bold");
  doc.text("Riepilogo Economico", margin + 5, y + 7);
  doc.setFont(undefined, "normal"); doc.setFontSize(9);

  const entrate = transactions.filter(t => t.tipo === "entrata").reduce((s, t) => s + (t.importo || 0), 0);
  const uscite = transactions.filter(t => t.tipo === "uscita").reduce((s, t) => s + (t.importo || 0), 0);
  const margine = entrate - uscite - laborCost;

  const colW = (pageWidth - margin * 2 - 10) / 3;
  const sumY = y + 14;
  doc.text("Entrate", margin + 5, sumY);
  doc.setFont(undefined, "bold"); doc.setTextColor(22, 163, 74);
  doc.text(formatEuro(entrate), margin + 5, sumY + 6);
  doc.setTextColor(0, 0, 0); doc.setFont(undefined, "normal");

  doc.text("Uscite", margin + 5 + colW, sumY);
  doc.setFont(undefined, "bold"); doc.setTextColor(220, 38, 38);
  doc.text(formatEuro(uscite), margin + 5 + colW, sumY + 6);
  doc.setTextColor(0, 0, 0); doc.setFont(undefined, "normal");

  doc.text("Manodopera", margin + 5 + colW * 2, sumY);
  doc.setFont(undefined, "bold"); doc.setTextColor(220, 38, 38);
  doc.text(formatEuro(laborCost), margin + 5 + colW * 2, sumY + 6);
  doc.setTextColor(0, 0, 0); doc.setFont(undefined, "normal");

  doc.setFontSize(10); doc.setFont(undefined, "bold");
  doc.text(`Margine: ${formatEuro(margine)}`, margin + 5, sumY + 16);
  doc.setTextColor(margine >= 0 ? 22 : 220, margine >= 0 ? 163 : 38, margine >= 0 ? 74 : 38);
  doc.setTextColor(0, 0, 0);
  y += 48;

  // Transactions
  if (y > pageHeight - 60) { doc.addPage(); y = 20; }
  doc.setFontSize(11); doc.setFont(undefined, "bold");
  doc.text("Movimenti", margin, y);
  y += 6;
  doc.setFontSize(8); doc.setFont(undefined, "normal");

  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
  doc.text("Data", margin + 2, y + 5);
  doc.text("Descrizione", margin + 30, y + 5);
  doc.text("Tipo", margin + 120, y + 5);
  doc.text("Importo", pageWidth - margin - 35, y + 5);
  y += 9;

  transactions.forEach(t => {
    if (y > pageHeight - 20) { doc.addPage(); y = 20; }
    doc.text(t.data ? new Date(t.data).toLocaleDateString("it-IT") : "", margin + 2, y);
    doc.text((t.descrizione || t.categoria || "").substring(0, 40), margin + 30, y);
    doc.text(t.tipo === "entrata" ? "Entrata" : "Uscita", margin + 120, y);
    doc.text(formatEuro(t.importo || 0), pageWidth - margin - 35, y);
    y += 6;
  });
  y += 6;

  // Labor cost detail
  if (laborCost > 0 && attendance.length > 0) {
    if (y > pageHeight - 40) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setFont(undefined, "bold");
    doc.text("Manodopera (dalle giornaliere)", margin, y);
    y += 6;
    doc.setFontSize(8); doc.setFont(undefined, "normal");
    attendance.forEach(a => {
      a.presenze?.forEach(p => {
        if (y > pageHeight - 20) { doc.addPage(); y = 20; }
        const emp = employees.find(e => e.id === p.dipendente_id);
        const empName = emp ? `${emp.nome} ${emp.cognome}` : p.dipendente_nome || "";
        const rate = emp?.costo_orario || 0;
        const cost = (p.ore || 0) * rate;
        if (cost > 0) {
          doc.text(`${a.data ? new Date(a.data).toLocaleDateString("it-IT") : ""} — ${empName}: ${p.ore}h × ${formatEuro(rate)}`, margin + 2, y);
          doc.text(formatEuro(cost), pageWidth - margin - 35, y);
          y += 6;
        }
      });
    });
    y += 6;
  }

  // Photos
  const photosByFase = { prima: [], durante: [], dopo: [] };
  photos.forEach(p => { if (photosByFase[p.fase]) photosByFase[p.fase].push(p); });
  const faseLabels = { prima: "Prima", durante: "Durante", dopo: "Dopo" };

  for (const fase of ["prima", "durante", "dopo"]) {
    if (photosByFase[fase].length === 0) continue;
    if (y > pageHeight - 50) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setFont(undefined, "bold");
    doc.text(`Foto — ${faseLabels[fase]}`, margin, y);
    y += 8;
    doc.setFont(undefined, "normal"); doc.setFontSize(8);

    for (const photo of photosByFase[fase]) {
      if (y > pageHeight - 60) { doc.addPage(); y = 20; }
      try {
        addImageSafe(doc, photo.foto_url, margin, y, 60, 45);
      } catch (e) { /* skip broken image */ }
      if (photo.didascalia) {
        doc.setFontSize(8);
        const lines = doc.splitTextToSize(photo.didascalia, 110);
        doc.text(lines, margin + 65, y + 5);
      }
      if (photo.data) {
        doc.setFontSize(7); doc.setTextColor(100, 116, 139);
        doc.text(new Date(photo.data).toLocaleDateString("it-IT"), margin + 65, y + 15);
        doc.setTextColor(0, 0, 0);
      }
      y += 52;
      doc.setFontSize(8);
    }
  }

  // Quick notes
  if (worksite.note_veloci) {
    if (y > pageHeight - 40) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setFont(undefined, "bold");
    doc.text("Note Veloci", margin, y);
    y += 6;
    doc.setFontSize(9); doc.setFont(undefined, "normal");
    const noteLines = doc.splitTextToSize(worksite.note_veloci, pageWidth - margin * 2);
    noteLines.forEach(line => {
      if (y > pageHeight - 20) { doc.addPage(); y = 20; }
      doc.text(line, margin, y);
      y += 5;
    });
  }

  addFooter(doc, profile, pageWidth, pageHeight, margin);
  doc.save(`Cartella_${worksite.nome || "Lavoro"}.pdf`);
}