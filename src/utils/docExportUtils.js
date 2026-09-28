import { hexToRgb, addImageSafe, addCompanyHeader, addFooter } from "@/utils/pdfUtils";

// Sostituisce i placeholder {{FIELD}} e {{FIELD|default}} con i valori forniti.
// Supporta blocchi condizionali {{#if FIELD}}...{{/if}}: il blocco viene
// incluso solo se FIELD ha un valore, altrimenti viene rimosso interamente.
export function fillTemplate(templateText, fields, profile) {
  let content = templateText;

  // Sostituisce prima i campi azienda
  if (profile) {
    const sede = [profile.indirizzo, `${profile.cap || ""} ${profile.citta || ""}`.trim(), profile.provincia && `(${profile.provincia})`]
      .filter(Boolean).join(", ");
    content = content.replace(/\{\{DITTA\}\}/g, profile.ragione_sociale || "__________");
    content = content.replace(/\{\{SEDE\}\}/g, sede || "__________");
    content = content.replace(/\{\{PIVA\}\}/g, profile.partita_iva || "__________");
    content = content.replace(/\{\{CITTA_DITTA\}\}/g, profile.citta || "__________");
    content = content.replace(/\{\{EMAIL_DITTA\}\}/g, profile.email || "");
    content = content.replace(/\{\{PEC_DITTA\}\}/g, profile.pec || "");
  }

  // Processa i blocchi condizionali {{#if FIELD}}...{{/if}} (dall'interno verso l'esterno)
  // Se il campo ha un valore, mantiene il contenuto del blocco; altrimenti lo rimuove
  let prevContent;
  do {
    prevContent = content;
    content = content.replace(/\{\{#if (\w+)\}\}((?:(?!\{\{#if).)*?)\{\{\/if\}\}/gs, (match, key, blockContent) => {
      const val = fields[key];
      return val && String(val).trim() ? blockContent : "";
    });
  } while (content !== prevContent);

  // Pulisce eventuali tag {{/if}} orfani residui
  content = content.replace(/\{\{\/if\}\}/g, "");

  // Gestisce {{FIELD|default}} — se il campo è vuoto, usa il default
  content = content.replace(/\{\{(\w+)\|([^}]+)\}\}/g, (match, key, defaultVal) => {
    const val = fields[key];
    return val && String(val).trim() ? val : defaultVal;
  });

  // Gestisce i restanti {{FIELD}} — se vuoto, omette il valore (nessun trattino)
  content = content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = fields[key];
    return val && String(val).trim() ? val : "";
  });

  // Pulisce gli artefatti lasciati dai campi facoltativi vuoti
  content = content.split("\n").map(line => {
    // Rimuove righe residue con solo §N (marker di sezione non consumati)
    if (/^\s*§\d+\s*$/.test(line)) return "";
    let cleaned = line
      .replace(/ {2,}/g, " ")
      .replace(/\(\s*\)/g, "")
      .replace(/,\s*,/g, ",")
      .replace(/,\s*\./g, ".")
      .replace(/\s+,/g, ",")
      .replace(/^\s*,+\s*/g, "")
      // Rimuove preposizioni/articoli orfani prima di punteggiatura (campi vuoti)
      .replace(/\s+(dal|del|della|dei|degli|delle|di|da|al|alla|allo|ai|alle|agli|nel|nella|nello|nei|nelle|negli|col|sul|sulla|sullo|sui|sulle|sugli|con|per|il|la|lo|i|le|gli|un|una|uno|a|in|su|tra|fra|e|o)\s*([,\.])/gi, "$2")
      .replace(/\s+$/g, "")
      .trim();
    if (cleaned.length === 0 || !/[a-zA-Z0-9À-Ù€]/.test(cleaned)) {
      return "";
    }
    return cleaned;
  }).join("\n");

  // Pulisce righe vuote multiple (lascia al massimo una riga vuota tra i paragrafi)
  content = content.replace(/\n{3,}/g, "\n\n");

  // Numera gli articoli in sequenza: le clausole facoltative ("ART. –") non hanno un numero fisso
  let art = 0;
  content = content.replace(/^ART\.\s*\d*\s*–/gm, () => `ART. ${++art} –`);

  // Rinumera gli articoli progressivamente (saltando quelli omessi)
  let artNum = 0;
  content = content.split("\n").map(line => {
    const match = line.match(/^ART\.\s+(\d+|[–-])\s*[–-]\s*(.+)/i);
    if (match) {
      artNum++;
      return `ART. ${artNum} – ${match[2]}`;
    }
    return line;
  }).join("\n");

  return content;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Converte il contenuto testuale in HTML per il documento Word
function contentToHtml(content) {
  const lines = content.split("\n");
  let isFirstLine = true;
  const parts = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed === "") return "<div style='height:6px;'></div>";
    if (isFirstLine) {
      isFirstLine = false;
      return `<p style="text-align:center; font-weight:bold; font-size:14pt; margin:12px 0 16px 0;">${escapeHtml(line)}</p>`;
    }
    if (/^ART\.\s+\d+/i.test(trimmed)) {
      return `<p style="font-weight:bold; margin:10px 0 4px 0;">${escapeHtml(line)}</p>`;
    }
    if (/^[A-ZÀ-Ù\s\.,\-–()\/]+$/.test(trimmed) && trimmed.length < 80) {
      return `<p style="text-align:center; font-weight:bold; margin:8px 0;">${escapeHtml(line)}</p>`;
    }
    return `<p style="margin:4px 0; line-height:1.6;">${escapeHtml(line)}</p>`;
  });
  return parts.join("\n");
}

// Costruisce il documento PDF del contratto (riusabile per download e allegato email)
export async function buildContractDoc(contract, profile) {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF();
  const pageWidth = 210, pageHeight = 297, margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // Intestazione aziendale (logo in alto + dati sotto + linea colorata)
  let { y, color } = addCompanyHeader(doc, profile, pageWidth, margin);

  // Titolo del documento
  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.setTextColor(color.r, color.g, color.b);
  const titleLines = doc.splitTextToSize(contract.titolo || "Contratto", contentWidth);
  doc.text(titleLines, pageWidth / 2, y, { align: "center" });
  y += titleLines.length * 6 + 6;
  doc.setTextColor(0, 0, 0);

  // Linea separatrice
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Contenuto del contratto
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  const lines = doc.splitTextToSize(contract.contenuto_finale || "", contentWidth);

  lines.forEach(line => {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
    }

    const trimmed = line.trim();
    // Riga vuota = spazio paragrafo
    if (trimmed === "") {
      y += 3;
      return;
    }
    // Titoli in maiuscolo brevi → centrati e grassetto
    if (/^[A-ZÀ-Ù\s\.,\-–()\/]+$/.test(trimmed) && trimmed.length < 80) {
      doc.setFont(undefined, "bold");
      doc.text(line, pageWidth / 2, y, { align: "center" });
      y += 6;
      doc.setFont(undefined, "normal");
      return;
    }
    // Articoli → grassetto
    if (/^ART\.\s+\d+/i.test(trimmed)) {
      doc.setFont(undefined, "bold");
      doc.text(line, margin, y);
      y += 5.5;
      doc.setFont(undefined, "normal");
      return;
    }
    // Testo normale
    doc.text(line, margin, y);
    y += 5;
  });

  // Sezione firma — entrambe le parti affiancate
  if (y > pageHeight - 50) {
    doc.addPage();
    y = 20;
  }
  y += 15;
  const signLineY = y + 22;
  const colW = (pageWidth - margin * 2) / 2;
  const rightColX = margin + colW + 5;

  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);

  // Colonna sinistra: Datore di Lavoro
  if (profile?.firma_url) {
    addImageSafe(doc, profile.firma_url, margin, y, 40, 20);
  }
  doc.line(margin, signLineY, margin + colW - 10, signLineY);
  doc.setFontSize(8);
  doc.text(profile?.ragione_sociale || "", margin, signLineY + 4);

  // Colonna destra: Controparte
  if (contract.controparte_nome) {
    doc.text(contract.controparte_nome, rightColX, signLineY - 3);
  }
  const fc = contract.firma_controparte;
  if (fc?.firma) addImageSafe(doc, fc.firma, rightColX, y, 40, 16);
  doc.line(rightColX, signLineY, rightColX + colW - 10, signLineY);
  doc.text("Firma", rightColX, signLineY + 4);

  // Dati della firma elettronica semplice raccolta dal telefono
  if (fc) {
    let ey = signLineY + 12;
    if (ey > pageHeight - 32) { doc.addPage(); ey = 20; }
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    const when = new Date(fc.data).toLocaleString("it-IT");
    const lines = doc.splitTextToSize(`Firma elettronica semplice (art. 20 D.Lgs. 82/2005) apposta da ${fc.nome} il ${when}, IP ${fc.ip}. Impronta SHA-256 del testo firmato: ${fc.hash}`, pageWidth - margin * 2);
    doc.text(lines, margin, ey);
    doc.setTextColor(0, 0, 0);
  }

  addFooter(doc, profile, pageWidth, pageHeight, margin);
  return doc;
}

// Genera e scarica un PDF professionale del contratto
export async function generateContractPDF(contract, profile) {
  const doc = await buildContractDoc(contract, profile);
  doc.save(`Contratto_${(contract.titolo || "").replace(/[^a-zA-Z0-9_\-]/g, "_")}.pdf`);
}

// Genera il PDF del contratto come Blob (per allegato email)
export async function generateContractPDFBlob(contract, profile) {
  const doc = await buildContractDoc(contract, profile);
  return doc.output("blob");
}

// Genera e scarica un documento Word (.doc) del contratto
export function generateContractWord(contract, profile) {
  const content = contract.contenuto_finale || "";
  const bodyHtml = contentToHtml(content);

  const color = profile?.colore_principale || "#2563eb";

  const logoWpx = Math.round((profile?.logo_larghezza || 35) * 3.78);
  const logoHpx = Math.round((profile?.logo_altezza || 18) * 3.78);
  const logoHtml = profile?.logo_url
    ? `<div style="text-align:left; margin-bottom:8px;"><img src="${profile.logo_url}" style="max-height:${logoHpx}px; max-width:${logoWpx}px;" alt="Logo" /></div>`
    : "";

  const headerData = profile ? `
    <div style="font-size:9pt; line-height:1.4;">
      <strong style="font-size:12pt; color:${color};">${escapeHtml(profile.ragione_sociale || "")}</strong><br/>
      ${escapeHtml(profile.indirizzo || "")} - ${escapeHtml(profile.cap || "")} ${escapeHtml(profile.citta || "")} (${escapeHtml(profile.provincia || "")})<br/>
      P.IVA: ${escapeHtml(profile.partita_iva || "")}${profile.telefono ? " | Tel: " + escapeHtml(profile.telefono) : ""}<br/>
      ${profile.email ? "Email: " + escapeHtml(profile.email) : ""}${profile.pec ? " | PEC: " + escapeHtml(profile.pec) : ""}
    </div>` : "";

  const headerHtml = (logoHtml || headerData) ? `
    ${logoHtml}
    ${headerData}
    <div style="border-bottom:2px solid ${color}; margin-bottom:20px;"></div>` : "";

  const firmaHtml = `<table style="width:100%; margin-top:30px; border-collapse:collapse;">
  <tr>
    <td style="width:50%; vertical-align:bottom; padding-right:10px;">
      ${profile?.firma_url ? `<img src="${profile.firma_url}" style="max-height:50px; max-width:140px;" alt="Firma" /><br/>` : "<div style=\"height:50px;\"></div>"}
      <span style="font-size:9pt; border-top:1px solid #000; padding-top:2px; display:inline-block; width:90%;">${escapeHtml(profile?.ragione_sociale || "")}</span>
    </td>
    <td style="width:50%; vertical-align:bottom; padding-left:10px;">
      <div style="height:50px;"></div>
      <span style="font-size:9pt; border-top:1px solid #000; padding-top:2px; display:inline-block; width:90%;">${escapeHtml(contract.controparte_nome || "")}<br/>Firma</span>
    </td>
  </tr>
</table>`;

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(contract.titolo || "Contratto")}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4; margin: 2.5cm 2cm; }
body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
p { margin: 4pt 0; }
</style>
</head>
<body>
${headerHtml}
${bodyHtml}
${firmaHtml}
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Contratto_${(contract.titolo || "").replace(/[^a-zA-Z0-9_\-]/g, "_")}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}