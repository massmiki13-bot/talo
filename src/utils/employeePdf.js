// PDF per i dipendenti: tesserino di riconoscimento e verbale di consegna DPI.
import { addImageSafe, hexToRgb } from "@/utils/pdfUtils";

async function toDataUrl(url) {
  if (!url || url.startsWith("data:")) return url || null;
  try {
    const blob = await fetch(url).then((r) => (r.ok ? r.blob() : null));
    if (!blob) return null;
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
  } catch {
    return null;
  }
}

const fmt = (d) => (d ? new Date(d).toLocaleDateString("it-IT") : "");

// Tesserino di riconoscimento (art. 18 e 26 D.Lgs. 81/08, art. 5 L. 136/2010):
// foto, generalità, datore di lavoro e, in edilizia, data di assunzione.
export async function generateBadgePdf(employee, profile) {
  const jsPDF = (await import("jspdf")).default;
  const W = 85.6, H = 54;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [H, W] });
  const color = hexToRgb(profile?.colore_principale || "#1d4ed8");
  const [foto, logo] = await Promise.all([toDataUrl(employee.foto_url), toDataUrl(profile?.logo_url)]);

  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(0, 0, W, 11, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7); doc.setFont(undefined, "bold");
  doc.text("TESSERA DI RICONOSCIMENTO", 4, 5);
  doc.setFontSize(6); doc.setFont(undefined, "normal");
  doc.text("D.Lgs. 81/2008 · L. 136/2010", 4, 8.6);
  if (logo) addImageSafe(doc, logo, W - 22, 1.5, 18, 8);

  // Foto
  doc.setDrawColor(200, 200, 200);
  if (foto) addImageSafe(doc, foto, 4, 14, 22, 28);
  else { doc.rect(4, 14, 22, 28); doc.setTextColor(150, 150, 150); doc.setFontSize(5); doc.text("FOTO", 15, 28, { align: "center" }); }

  let y = 16.5;
  const line = (label, value, bold = false) => {
    if (!value) return;
    doc.setTextColor(110, 110, 110); doc.setFontSize(5); doc.setFont(undefined, "normal");
    doc.text(label.toUpperCase(), 29, y);
    doc.setTextColor(20, 20, 20); doc.setFontSize(bold ? 9 : 6.5); doc.setFont(undefined, bold ? "bold" : "normal");
    doc.text(doc.splitTextToSize(String(value), W - 33)[0], 29, y + (bold ? 3.8 : 3));
    y += bold ? 7.5 : 6;
  };
  line("Lavoratore", `${employee.nome || ""} ${employee.cognome || ""}`.trim(), true);
  line("Nato il", [fmt(employee.data_nascita), employee.luogo_nascita && `a ${employee.luogo_nascita}`].filter(Boolean).join(" "));
  line("Mansione", employee.ruolo);
  line("Assunto il", fmt(employee.data_assunzione));

  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(0.4);
  doc.line(4, 45, W - 4, 45);
  doc.setTextColor(20, 20, 20); doc.setFontSize(6); doc.setFont(undefined, "bold");
  doc.text(doc.splitTextToSize(profile?.ragione_sociale || "", W - 8)[0], 4, 48.5);
  doc.setFont(undefined, "normal"); doc.setFontSize(5); doc.setTextColor(90, 90, 90);
  doc.text([profile?.partita_iva && `P.IVA ${profile.partita_iva}`, profile?.citta].filter(Boolean).join(" · "), 4, 51.5);
  if (employee.matricola) doc.text(`Matr. ${employee.matricola}`, W - 4, 51.5, { align: "right" });
  return doc.output("blob");
}

// Verbale di consegna dei DPI, da far firmare al lavoratore.
export async function generateDpiPdf(employee, profile, items) {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF();
  const M = 18;
  const logo = await toDataUrl(profile?.logo_url);
  let y = 18;
  if (logo) { addImageSafe(doc, logo, M, y - 4, 30, 14); }
  doc.setFontSize(10); doc.setFont(undefined, "bold");
  doc.text(profile?.ragione_sociale || "", 210 - M, y, { align: "right" });
  doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(90, 90, 90);
  doc.text([profile?.indirizzo, [profile?.cap, profile?.citta].filter(Boolean).join(" ")].filter(Boolean).join(", "), 210 - M, y + 5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 22;
  doc.setFontSize(14); doc.setFont(undefined, "bold");
  doc.text("Verbale di consegna dei Dispositivi di Protezione Individuale", M, y);
  y += 6;
  doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(90, 90, 90);
  doc.text("ai sensi degli artt. 18, 77 e 78 del D.Lgs. 81/2008", M, y);
  doc.setTextColor(0, 0, 0);
  y += 10;
  doc.setFontSize(10);
  doc.text(`Lavoratore: ${employee.nome || ""} ${employee.cognome || ""}${employee.codice_fiscale ? `  –  C.F. ${employee.codice_fiscale}` : ""}`, M, y);
  y += 6;
  if (employee.ruolo) { doc.text(`Mansione: ${employee.ruolo}`, M, y); y += 6; }
  y += 4;

  const cols = [{ l: "Dispositivo", x: M }, { l: "Taglia", x: 120 }, { l: "Q.tà", x: 145 }, { l: "Data consegna", x: 162 }];
  doc.setFillColor(241, 245, 249); doc.rect(M, y - 5, 210 - 2 * M, 8, "F");
  doc.setFontSize(8); doc.setFont(undefined, "bold");
  cols.forEach((c) => doc.text(c.l, c.x + 2, y));
  y += 7;
  doc.setFont(undefined, "normal"); doc.setFontSize(9);
  for (const it of items) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text(doc.splitTextToSize(it.articolo || "", 98), cols[0].x + 2, y);
    doc.text(String(it.taglia || ""), cols[1].x + 2, y);
    doc.text(String(it.quantita || 1), cols[2].x + 2, y);
    doc.text(fmt(it.data_consegna), cols[3].x + 2, y);
    doc.setDrawColor(226, 232, 240); doc.line(M, y + 3, 210 - M, y + 3);
    y += 8;
  }
  y += 8;
  doc.setFontSize(8.5);
  const text = "Il lavoratore dichiara di aver ricevuto i DPI sopra elencati, di essere stato informato e formato sul loro corretto utilizzo, e si impegna a utilizzarli conformemente alle istruzioni, ad averne cura e a segnalare immediatamente eventuali difetti o inconvenienti (art. 78 D.Lgs. 81/2008).";
  doc.text(doc.splitTextToSize(text, 210 - 2 * M), M, y);
  y += 26;
  doc.line(M, y, M + 70, y); doc.line(210 - M - 70, y, 210 - M, y);
  doc.setFontSize(8);
  doc.text("Firma del datore di lavoro", M, y + 5);
  doc.text("Firma del lavoratore per ricevuta", 210 - M - 70, y + 5);
  doc.text(`Data: ${new Date().toLocaleDateString("it-IT")}`, M, y + 16);
  return doc.output("blob");
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
