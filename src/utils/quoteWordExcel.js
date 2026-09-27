import { formatEuro, formatNumber } from "@/utils/pdfUtils";
import { downloadWordDoc } from "@/utils/wordExport";
import { downloadExcelSheet } from "@/utils/excelExport";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildClientHtml(quote, selectedClient) {
  if (!quote.cliente_nome) return "";
  let html = `<p style="margin:8px 0;"><strong>Cliente:</strong> ${escapeHtml(quote.cliente_nome)}</p>`;
  if (selectedClient) {
    const parts = [];
    if (selectedClient.indirizzo) parts.push(escapeHtml(selectedClient.indirizzo));
    const cityLine = [selectedClient.cap, selectedClient.citta, selectedClient.provincia].filter(Boolean).join(" ");
    if (cityLine) parts.push(escapeHtml(cityLine));
    if (selectedClient.partita_iva) parts.push(`P.IVA: ${escapeHtml(selectedClient.partita_iva)}`);
    if (selectedClient.telefono) parts.push(`Tel: ${escapeHtml(selectedClient.telefono)}`);
    if (selectedClient.email) parts.push(`Email: ${escapeHtml(selectedClient.email)}`);
    if (parts.length) html += `<p style="margin:2px 0; font-size:10pt; color:#64748b;">${parts.join(" | ")}</p>`;
  }
  return html;
}

export function generateQuoteWord(ctx) {
  const { profile, quote, righe, totals, selectedClient, unitOptions, calcRowTotal } = ctx;

  const rowsHtml = righe.map(r => {
    // Capitoli e testi: una riga a tutta larghezza.
    if (r.tipo === "capitolo") return `<tr><td colspan="7" style="font-weight:bold; text-transform:uppercase; background:#f1f5f9;">${escapeHtml(r.descrizione || "")}</td></tr>`;
    if (r.tipo === "testo") return `<tr><td colspan="7">${escapeHtml(r.descrizione || "")}</td></tr>`;
    const um = unitOptions.find(u => u.value === r.unita_misura)?.label || r.unita_misura || "";
    return `<tr>
      <td>${r.opzionale ? "<em>[Opzionale – non incluso nel totale]</em> " : ""}${escapeHtml(r.descrizione || "")}</td>
      <td style="text-align:center;">${escapeHtml(um)}</td>
      <td style="text-align:right;">${formatNumber(r.quantita || 0, 2)}</td>
      <td style="text-align:right;">${formatEuro(r.prezzo_unitario || 0)}</td>
      <td style="text-align:right;">${formatNumber(r.sconto || 0, 0)}%</td>
      <td style="text-align:right;">${formatNumber(r.iva_percentuale || 0, 0)}%</td>
      <td style="text-align:right; font-weight:bold;">${formatEuro(calcRowTotal(r))}</td>
    </tr>`;
  }).join("");

  const tableHtml = `<table>
    <thead><tr>
      <th>Descrizione</th><th>U.M.</th><th>Qtà</th><th>Prezzo Unit.</th><th>Sc.%</th><th>IVA</th><th>Totale</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;

  const totalsHtml = `<table style="width:50%; margin-left:auto; margin-top:12px; border:none;">
    <tr><td style="border:none; padding:3px 8px;">Imponibile</td><td style="border:none; padding:3px 8px; text-align:right;">${formatEuro(totals.imponibile)}</td></tr>
    <tr><td style="border:none; padding:3px 8px;">IVA</td><td style="border:none; padding:3px 8px; text-align:right;">${formatEuro(totals.iva_totale)}</td></tr>
    <tr><td style="border:none; padding:3px 8px; font-weight:bold; font-size:12pt; border-top:1px solid #000;">TOTALE</td><td style="border:none; padding:3px 8px; text-align:right; font-weight:bold; font-size:12pt; border-top:1px solid #000;">${formatEuro(totals.totale)}</td></tr>
  </table>`;

  let bodyHtml = "";
  bodyHtml += buildClientHtml(quote, selectedClient);
  if (quote.oggetto) bodyHtml += `<p style="margin:8px 0;"><strong>Oggetto:</strong> ${escapeHtml(quote.oggetto)}</p>`;
  if (quote.data) bodyHtml += `<p style="margin:4px 0; font-size:10pt; color:#64748b;">Data: ${new Date(quote.data).toLocaleDateString("it-IT")}${quote.validita_giorni ? ` | Validità: ${quote.validita_giorni} giorni` : ""}</p>`;
  bodyHtml += tableHtml;
  bodyHtml += totalsHtml;
  if (quote.note) bodyHtml += `<p style="margin-top:15px;"><strong>Note:</strong><br/>${escapeHtml(quote.note)}</p>`;

  const safeNum = (quote.numero || "bozza").replace(/[^a-zA-Z0-9_\-]/g, "_");
  downloadWordDoc(`Preventivo_${safeNum}.doc`, `Preventivo N. ${quote.numero || ""}`, bodyHtml, profile);
}

export function generateQuoteExcel(ctx) {
  const { profile, quote, righe, totals, selectedClient, unitOptions, calcRowTotal } = ctx;

  const headers = [
    { label: "Descrizione", width: 250, align: "left" },
    { label: "U.M.", width: 40, align: "center" },
    { label: "Qtà", width: 50, align: "right" },
    { label: "Prezzo Unitario", width: 110, align: "right" },
    { label: "Sconto %", width: 50, align: "right" },
    { label: "IVA %", width: 50, align: "right" },
    { label: "Totale", width: 110, align: "right" },
  ];

  const rows = righe.map(r => {
    if (r.tipo === "capitolo") return [(r.descrizione || "").toUpperCase(), "", "", "", "", "", ""];
    if (r.tipo === "testo") return [r.descrizione || "", "", "", "", "", "", ""];
    const um = unitOptions.find(u => u.value === r.unita_misura)?.label || r.unita_misura || "";
    return [
      (r.opzionale ? "[Opzionale – non incluso] " : "") + (r.descrizione || ""),
      um,
      { value: r.quantita || 0, type: "number" },
      { value: r.prezzo_unitario || 0, type: "currency" },
      { value: r.sconto || 0, type: "percent" },
      { value: r.iva_percentuale || 0, type: "percent" },
      { value: calcRowTotal(r), type: "currency" },
    ];
  });

  const footerRows = [
    ["", "", "", "", "", "Imponibile", { value: totals.imponibile, type: "currency" }],
    ["", "", "", "", "", "IVA", { value: totals.iva_totale, type: "currency" }],
    ["", "", "", "", "", "TOTALE", { value: totals.totale, type: "currency" }],
  ];

  const infoLines = [];
  infoLines.push(`Cliente: ${quote.cliente_nome || ""}`);
  if (selectedClient?.indirizzo) infoLines.push(`Indirizzo: ${selectedClient.indirizzo}`);
  if (selectedClient?.partita_iva) infoLines.push(`P.IVA Cliente: ${selectedClient.partita_iva}`);
  if (quote.oggetto) infoLines.push(`Oggetto: ${quote.oggetto}`);
  if (quote.data) infoLines.push(`Data: ${new Date(quote.data).toLocaleDateString("it-IT")}`);
  if (quote.validita_giorni) infoLines.push(`Validità: ${quote.validita_giorni} giorni`);

  const safeNum = (quote.numero || "bozza").replace(/[^a-zA-Z0-9_\-]/g, "_");
  downloadExcelSheet({
    filename: `Preventivo_${safeNum}.xls`,
    title: `Preventivo N. ${quote.numero || ""}`,
    headers,
    rows,
    profile,
    footerRows,
    infoLines,
  });
}