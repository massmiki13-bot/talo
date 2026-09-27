import { formatEuro } from "@/utils/pdfUtils";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCompanyHeaderHtml(profile) {
  if (!profile) return "";
  const color = profile.colore_principale || "#2563eb";
  const logoWpx = Math.round((profile.logo_larghezza || 35) * 3.78);
  const logoHpx = Math.round((profile.logo_altezza || 18) * 3.78);
  const logoHtml = profile.logo_url
    ? `<div style="margin-bottom:8px;"><img src="${profile.logo_url}" style="max-height:${logoHpx}px; max-width:${logoWpx}px;" alt="Logo" /></div>`
    : "";
  const lines = [];
  lines.push(`<strong style="font-size:14pt; color:${color};">${escapeHtml(profile.ragione_sociale || "")}</strong>`);
  const addr = [profile.indirizzo, `${profile.cap || ""} ${profile.citta || ""}`.trim(), profile.provincia && `(${profile.provincia})`].filter(Boolean).join(", ");
  if (addr) lines.push(`<span style="font-size:9pt; color:#64748b;">${escapeHtml(addr)}</span>`);
  const contactParts = [];
  if (profile.partita_iva) contactParts.push(`P.IVA: ${escapeHtml(profile.partita_iva)}`);
  if (profile.telefono) contactParts.push(`Tel: ${escapeHtml(profile.telefono)}`);
  if (profile.email) contactParts.push(`Email: ${escapeHtml(profile.email)}`);
  if (profile.pec) contactParts.push(`PEC: ${escapeHtml(profile.pec)}`);
  if (profile.sito_web) contactParts.push(`Web: ${escapeHtml(profile.sito_web)}`);
  if (contactParts.length) lines.push(`<span style="font-size:9pt; color:#64748b;">${contactParts.join(" | ")}</span>`);
  return `${logoHtml}<div style="line-height:1.5;">${lines.join("<br/>")}</div><div style="border-bottom:2px solid ${color}; margin:10px 0 20px 0;"></div>`;
}

export function downloadWordDoc(filename, title, bodyHtml, profile) {
  const color = profile?.colore_principale || "#2563eb";
  const headerHtml = buildCompanyHeaderHtml(profile);
  const titleHtml = title
    ? `<h1 style="text-align:center; font-size:16pt; color:${color}; margin:0 0 16px 0;">${escapeHtml(title)}</h1>`
    : "";
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(filename)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4; margin: 2.5cm 2cm; }
body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
table { border-collapse: collapse; width: 100%; font-size: 10pt; }
th { background-color: ${color}; color: white; padding: 6px 8px; text-align: left; font-size: 9pt; border: 1px solid #cbd5e1; }
td { border: 1px solid #cbd5e1; padding: 5px 8px; }
</style>
</head>
<body>
${headerHtml}
${titleHtml}
${bodyHtml}
</body>
</html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".doc") ? filename : filename + ".doc";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}