function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const NUM_FORMATS = {
  text: "\\@",
  number: "#,##0.00",
  integer: "#,##0",
  currency: '#,##0.00\\ "€"',
  percent: '0"%"',
};

function normalizeCell(cell, fallbackAlign) {
  const base = { bgColor: "", textColor: "", bold: false };
  if (cell === null || cell === undefined) return { ...base, value: "", type: "text", align: fallbackAlign };
  if (typeof cell === "object") {
    const type = cell.type || "text";
    const defaultAlign = (type === "currency" || type === "number" || type === "percent" || type === "integer") ? "right" : fallbackAlign;
    return {
      ...base,
      value: cell.value ?? "",
      type,
      align: cell.align || defaultAlign,
      bgColor: cell.bgColor || "",
      textColor: cell.textColor || "",
      bold: cell.bold || false,
    };
  }
  if (typeof cell === "number") return { ...base, value: cell, type: "number", align: "right" };
  return { ...base, value: String(cell), type: "text", align: fallbackAlign };
}

function cellStyle(cell) {
  const fmt = NUM_FORMATS[cell.type] || NUM_FORMATS.text;
  let style = `text-align:${cell.align}; mso-number-format:'${fmt}';`;
  if (cell.bgColor) style += ` background-color:${cell.bgColor};`;
  if (cell.textColor) style += ` color:${cell.textColor};`;
  if (cell.bold) style += ` font-weight:bold;`;
  return style;
}

function normalizeHeader(h) {
  if (typeof h === "string") return { label: h, width: 0, align: "center", bgColor: "", textColor: "" };
  return { label: h.label || "", width: h.width || 0, align: h.align || "center", bgColor: h.bgColor || "", textColor: h.textColor || "" };
}

/**
 * Downloads a professional Excel-compatible (.xls) file with company header,
 * info lines, a formatted data table, and optional footer rows + legend.
 *
 * Cells can be:
 *  - A string → rendered as text
 *  - A number → rendered as number
 *  - An object { value, type, align, bgColor, textColor, bold }
 *    where type is 'text'|'number'|'integer'|'currency'|'percent'
 *
 * @param {object} opts
 * @param {string} opts.filename - Download filename (with or without .xls)
 * @param {string} opts.title - Document title shown above the table
 * @param {(string|{label:string,width?:number,align?:string,bgColor?:string,textColor?:string})[]} opts.headers - Column headers
 * @param {(*[]|*[])[]} opts.rows - Data rows
 * @param {object} opts.profile - Company profile for header
 * @param {(*[][]|*[])[]} opts.footerRows - Footer rows (e.g. totals)
 * @param {string[]} opts.infoLines - Extra info lines below title
 * @param {number[]} opts.columnWidths - Explicit column widths
 * @param {(*[][]|*[])[]} opts.subHeaderRows - Additional header rows below main header
 * @param {{symbol:string,label:string,bgColor:string,textColor:string}[]} opts.legend - Legend items after table
 */
export function downloadExcelSheet({ filename, title, headers, rows, profile, footerRows = [], infoLines = [], columnWidths = [], subHeaderRows = [], legend = [] }) {
  const color = profile?.colore_principale || "#2563eb";
  const colCount = headers.length;

  const normHeaders = headers.map(normalizeHeader);
  const widths = normHeaders.map((h, i) => columnWidths[i] || h.width || 100);
  const colEls = widths.map(w => `<col width="${w}" />`).join("");

  const logoWpx = Math.round((profile?.logo_larghezza || 35) * 3.78);
  const logoHpx = Math.round((profile?.logo_altezza || 18) * 3.78);

  const headerRows = [];
  if (profile?.logo_url) {
    headerRows.push(`<tr><td colspan="${colCount}" style="padding:4px 6px;"><img src="${profile.logo_url}" style="max-height:${logoHpx}px; max-width:${logoWpx}px;" /></td></tr>`);
  }
  if (profile) {
    headerRows.push(`<tr><td colspan="${colCount}" style="font-size:14pt; font-weight:bold; color:${color}; padding:4px 6px;">${escapeHtml(profile.ragione_sociale || "")}</td></tr>`);
    const addr = [profile.indirizzo, `${profile.cap || ""} ${profile.citta || ""}`.trim(), profile.provincia && `(${profile.provincia})`].filter(Boolean).join(", ");
    if (addr) headerRows.push(`<tr><td colspan="${colCount}" style="font-size:9pt; color:#64748b; padding:2px 6px;">${escapeHtml(addr)}</td></tr>`);
    const contactParts = [];
    if (profile.partita_iva) contactParts.push(`P.IVA: ${escapeHtml(profile.partita_iva)}`);
    if (profile.telefono) contactParts.push(`Tel: ${escapeHtml(profile.telefono)}`);
    if (profile.email) contactParts.push(`Email: ${escapeHtml(profile.email)}`);
    if (profile.pec) contactParts.push(`PEC: ${escapeHtml(profile.pec)}`);
    if (profile.sito_web) contactParts.push(`Web: ${escapeHtml(profile.sito_web)}`);
    if (contactParts.length) headerRows.push(`<tr><td colspan="${colCount}" style="font-size:9pt; color:#64748b; padding:2px 6px;">${contactParts.join(" | ")}</td></tr>`);
  }

  if (title) {
    headerRows.push(`<tr><td colspan="${colCount}" style="font-size:12pt; font-weight:bold; padding:10px 6px 4px 6px;">${escapeHtml(title)}</td></tr>`);
  }
  infoLines.forEach(line => {
    headerRows.push(`<tr><td colspan="${colCount}" style="font-size:10pt; color:#475569; padding:1px 6px;">${escapeHtml(line)}</td></tr>`);
  });
  headerRows.push(`<tr><td colspan="${colCount}" style="height:6px;"></td></tr>`);

  // Main header row
  const ths = normHeaders.map(h => {
    const bg = h.bgColor || color;
    const txt = h.textColor || "white";
    return `<th style="background-color:${bg}; color:${txt}; font-weight:bold; border:1px solid #94a3b8; padding:6px 8px; font-size:9pt; text-align:${h.align};">${escapeHtml(h.label)}</th>`;
  }).join("");

  // Sub-header rows (e.g. weekday letters under day numbers)
  const subHeaderTrs = subHeaderRows.map(shr => {
    const normShr = shr.map(normalizeHeader);
    const cells = normShr.map(h => {
      const bg = h.bgColor || "#f1f5f9";
      const txt = h.textColor || "#475569";
      return `<th style="background-color:${bg}; color:${txt}; font-weight:bold; border:1px solid #cbd5e1; padding:3px 4px; font-size:8pt; text-align:${h.align};">${escapeHtml(h.label)}</th>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  // Data rows
  const trs = rows.map((r, ri) => {
    const rowBg = ri % 2 === 0 ? "" : "background-color:#f8fafc;";
    const cells = r.map((cell, ci) => {
      const norm = normalizeCell(cell, normHeaders[ci]?.align === "right" ? "right" : "left");
      // If cell has its own bgColor, don't apply alternating row bg to that cell
      const bg = norm.bgColor || rowBg;
      return `<td style="border:1px solid #cbd5e1; padding:4px 8px; ${cellStyle(norm)} ${bg}">${escapeHtml(norm.value)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  // Footer rows
  const footerTrs = footerRows.map(fr =>
    `<tr>${fr.map((cell, ci) => {
      const norm = normalizeCell(cell, normHeaders[ci]?.align === "right" ? "right" : "left");
      return `<td style="border:1px solid #cbd5e1; padding:4px 8px; ${cellStyle(norm)} font-weight:bold; background-color:#e2e8f0;">${escapeHtml(norm.value)}</td>`;
    }).join("")}</tr>`
  ).join("");

  // Legend section
  let legendHtml = "";
  if (legend.length > 0) {
    legendHtml += `<tr><td colspan="${colCount}" style="height:12px;"></td></tr>`;
    legendHtml += `<tr><td colspan="${colCount}" style="font-size:10pt; font-weight:bold; color:#475569; padding:4px 6px;">Legenda</td></tr>`;
    legendHtml += legend.map(item => {
      const bg = item.bgColor || "#e2e8f0";
      const txt = item.textColor || "#1e293b";
      return `<tr>
        <td style="border:1px solid #cbd5e1; padding:4px 8px; background-color:${bg}; color:${txt}; font-weight:bold; text-align:center; font-size:10pt;">${escapeHtml(item.symbol)}</td>
        <td colspan="${colCount - 1}" style="border:1px solid #cbd5e1; padding:4px 8px; font-size:10pt; color:#475569;">= ${escapeHtml(item.label)}</td>
      </tr>`;
    }).join("");
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Foglio1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head>
<body>
<table style="border-collapse:collapse;">
${colEls}
${headerRows.join("")}
<tr>${ths}</tr>
${subHeaderTrs}
${trs}
${footerTrs}
${legendHtml}
</table>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : filename + ".xls";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}