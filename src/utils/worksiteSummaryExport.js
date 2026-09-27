import { db } from "@/lib/db";
import { formatEuro, hexToRgb, addImageSafe, addFooter } from "@/utils/pdfUtils";

export async function exportWorksitesSummary(worksites) {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF();

  const [attendance, photos, receivedQuotes, quotes, profiles] = await Promise.all([
    db.DailyAttendance.list(),
    db.WorksitePhoto.list(),
    db.ReceivedQuote.list(),
    db.Quote.list(),
    db.CompanyProfile.list(),
  ]);
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
  doc.text("Riepilogo Cantieri", margin, y);
  y += 6;
  doc.setFontSize(8); doc.setFont(undefined, "normal");
  doc.text(`Generato il ${new Date().toLocaleDateString("it-IT")} — ${worksites.length} cantieri`, margin, y);
  y += 8;

  let totalOreAll = 0;
  let totalDocAll = 0;
  let totalPreventiviAll = 0;

  worksites.forEach((w, idx) => {
    if (y > pageHeight - 50) { doc.addPage(); y = 20; }

    // Worksites heading
    doc.setFillColor(color.r, color.g, color.b);
    doc.rect(margin, y - 4, pageWidth - margin * 2, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10); doc.setFont(undefined, "bold");
    doc.text(`${idx + 1}. ${w.nome || "Senza nome"}`, margin + 2, y + 1);
    doc.setTextColor(0, 0, 0);
    y += 8;

    doc.setFontSize(8); doc.setFont(undefined, "normal");
    if (w.cliente_nome) { doc.text(`Cliente: ${w.cliente_nome}`, margin + 2, y); y += 5; }
    if (w.indirizzo) { doc.text(`Indirizzo: ${w.indirizzo}`, margin + 2, y); y += 5; }
    const statoLabel = w.stato === "in_corso" ? "In corso" : w.stato === "finito" ? "Finito" : "Da iniziare";
    doc.text(`Stato: ${statoLabel}`, margin + 2, y); y += 6;

    // Total hours
    const siteAttendance = attendance.filter(a => a.cantiere_id === w.id);
    let totalOre = 0;
    let totalGiorni = 0;
    siteAttendance.forEach(a => {
      a.presenze?.forEach(p => {
        if (p.stato === "presente") {
          totalOre += (p.ore || 0);
          totalGiorni++;
        }
      });
    });
    totalOreAll += totalOre;

    // Uploaded documents
    const sitePhotos = photos.filter(p => p.worksite_id === w.id);
    const siteReceived = receivedQuotes.filter(rq => rq.worksite_id === w.id);
    const docCount = sitePhotos.length + siteReceived.length;
    totalDocAll += docCount;

    // Approved quotes
    const siteQuotes = quotes.filter(q =>
      (q.worksite_id === w.id || q.id === w.preventivo_id) && q.stato === "approvato"
    );
    const preventiviTotal = siteQuotes.reduce((s, q) => s + (q.totale || 0), 0);
    totalPreventiviAll += preventiviTotal;

    // Summary box
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, pageWidth - margin * 2, 24, "F");
    doc.setFontSize(8);

    const colW = (pageWidth - margin * 2 - 6) / 3;
    doc.setFont(undefined, "normal"); doc.setTextColor(100, 116, 139);
    doc.text("Ore totali", margin + 3, y + 6);
    doc.setFont(undefined, "bold"); doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.text(`${totalOre.toFixed(1)} h`, margin + 3, y + 13);
    doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`${totalGiorni} presenze`, margin + 3, y + 19);

    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text("Documenti caricati", margin + 3 + colW, y + 6);
    doc.setFont(undefined, "bold"); doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.text(`${docCount}`, margin + 3 + colW, y + 13);
    doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`${sitePhotos.length} foto, ${siteReceived.length} prev. ricevuti`, margin + 3 + colW, y + 19);

    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text("Preventivi approvati", margin + 3 + colW * 2, y + 6);
    doc.setFont(undefined, "bold"); doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.text(formatEuro(preventiviTotal), margin + 3 + colW * 2, y + 13);
    doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`${siteQuotes.length} preventiv${siteQuotes.length === 1 ? "o" : "i"}`, margin + 3 + colW * 2, y + 19);

    doc.setTextColor(0, 0, 0);
    y += 28;

    // Document detail list
    if (docCount > 0) {
      doc.setFontSize(8); doc.setFont(undefined, "bold");
      doc.text("Documenti:", margin + 2, y); y += 5;
      doc.setFont(undefined, "normal"); doc.setFontSize(7);
      sitePhotos.forEach(p => {
        if (y > pageHeight - 15) { doc.addPage(); y = 20; }
        const dt = p.data ? new Date(p.data).toLocaleDateString("it-IT") : "";
        doc.text(`[Foto] ${dt} ${p.didascalia ? "— " + p.didascalia : ""}`.substring(0, 90), margin + 4, y);
        y += 4;
      });
      siteReceived.forEach(rq => {
        if (y > pageHeight - 15) { doc.addPage(); y = 20; }
        const dt = rq.data ? new Date(rq.data).toLocaleDateString("it-IT") : "";
        doc.text(`[Prev. ricevuto] ${dt} ${rq.fornitore ? "— " + rq.fornitore : ""}`.substring(0, 90), margin + 4, y);
        y += 4;
      });
    }

    // Approved quotes detail
    if (siteQuotes.length > 0) {
      if (y > pageHeight - 15) { doc.addPage(); y = 20; }
      doc.setFontSize(8); doc.setFont(undefined, "bold");
      doc.text("Preventivi approvati:", margin + 2, y); y += 5;
      doc.setFont(undefined, "normal"); doc.setFontSize(7);
      siteQuotes.forEach(q => {
        if (y > pageHeight - 15) { doc.addPage(); y = 20; }
        doc.text(`${q.numero || ""} ${q.oggetto ? "— " + q.oggetto : ""}`.substring(0, 60), margin + 4, y);
        doc.text(formatEuro(q.totale || 0), pageWidth - margin - 30, y);
        y += 4;
      });
    }

    y += 6;
  });

  // Grand totals
  if (y > pageHeight - 30) { doc.addPage(); y = 20; }
  doc.setDrawColor(color.r, color.g, color.b);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;
  doc.setFontSize(11); doc.setFont(undefined, "bold");
  doc.text("Totali Generali", margin, y); y += 7;
  doc.setFontSize(9); doc.setFont(undefined, "normal");
  doc.text(`Ore totali: ${totalOreAll.toFixed(1)} h`, margin, y); y += 5;
  doc.text(`Documenti totali: ${totalDocAll}`, margin, y); y += 5;
  doc.text(`Totale preventivi approvati: ${formatEuro(totalPreventiviAll)}`, margin, y);

  addFooter(doc, profile, pageWidth, pageHeight, margin);
  doc.save(`Riepilogo_Cantieri_${new Date().toISOString().slice(0, 10)}.pdf`);
}