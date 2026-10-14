// @ts-nocheck — disegno di PDF/Excel con argomenti a ventaglio (jsPDF): escluso dal controllo dei tipi.
import { formatEuro, addCompanyHeader, addFooter } from "@/utils/pdfUtils";
import { ATTENDANCE_STATES, STATE_ORDER, getStatoInfo } from "@/utils/attendanceStates";

const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
// Weekday initials: index = getDay() (0=Sunday)
const DAY_INITIALS = ["D", "L", "M", "M", "G", "V", "S"];
const TAB_LETTERS = { ferie: "F", permesso: "P", malattia: "M", assente: "A" };

const VARIANT_LABELS = {
  sintetica: "Sintetica",
  media: "Media",
  dettagliata: "Dettagliata",
};

function hexToRgb(hex) {
  if (!hex || !hex.startsWith("#")) return { r: 30, g: 64, b: 175 };
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

function buildDaysArray(anno, mese) {
  const daysInMonth = new Date(anno, mese + 1, 0).getDate();
  const arr = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${anno}-${String(mese + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dateObj = new Date(dateStr + "T00:00:00");
    const weekday = dateObj.getDay();
    arr.push({
      day: d,
      dateStr,
      weekday,
      initial: DAY_INITIALS[weekday],
      isSunday: weekday === 0,
      isSaturday: weekday === 6,
      dateObj,
    });
  }
  return arr;
}

function truncate(text, maxLen) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

// ============================================================
// SINGLE EMPLOYEE DETAILED — landscape matrix, one row per cantiere
// ============================================================
async function generateSingleEmployeeDetailed(emp, mese, anno, profile, showCosts = true) {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = 297, pageHeight = 210, margin = 12;
  const contentW = pageWidth - margin * 2;
  let { y, color } = addCompanyHeader(doc, profile, pageWidth, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Tabellone Ore Mensili - Versione Dettagliata", margin, y);
  y += 7;
  doc.setFontSize(11);
  doc.text(emp.nome, margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("Mese di riferimento: " + MESI[mese] + " " + anno, margin, y);
  y += 8;

  // Build per-cantiere data
  const cantiereMap = {}; // nome -> { perDay: {dateStr: ore}, giorni: [dayNum], totale: 0 }
  const giorniMap = {};
  emp.giorni.forEach(g => {
    giorniMap[g.data] = g;
    (g.cantieri || []).forEach(c => {
      const name = c.cantiere_nome || "N/D";
      if (!cantiereMap[name]) cantiereMap[name] = { perDay: {}, giorni: [], totale: 0 };
      cantiereMap[name].perDay[g.data] = (cantiereMap[name].perDay[g.data] || 0) + (c.ore || 0);
      cantiereMap[name].totale += c.ore || 0;
      const dayNum = parseInt(g.data.split("-")[2], 10);
      if (!cantiereMap[name].giorni.includes(dayNum)) cantiereMap[name].giorni.push(dayNum);
    });
  });

  const cantieri = Object.keys(cantiereMap).sort((a, b) => (cantiereMap[b]?.totale ?? 0) - (cantiereMap[a]?.totale ?? 0));
  const days = buildDaysArray(anno, mese);
  const numDays = days.length;

  // Assign a color to each cantiere for visual identification
  const cantiereColors = [
    { r: 30, g: 64, b: 175 },   // blue
    { r: 5, g: 150, b: 105 },   // green
    { r: 217, g: 119, b: 6 },   // amber
    { r: 124, g: 58, b: 237 },  // purple
    { r: 220, g: 38, b: 38 },   // red
    { r: 14, g: 165, b: 233 },  // sky
    { r: 190, g: 24, b: 93 },   // pink
    { r: 120, g: 113, b: 108 }, // stone
  ];
  const cantiereColorMap = {};
  cantieri.forEach((name, i) => {
    cantiereColorMap[name] = cantiereColors[i % cantiereColors.length];
  });

  // Matrix layout
  const nameColW = 65;
  const totalColW = 22;
  const dayColW = (contentW - nameColW - totalColW) / numDays;
  const dayStartX = margin + nameColW;
  const totalX = pageWidth - margin - totalColW;

  // Header row 1: day numbers
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(margin, y, contentW, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("Cantiere / Sezione", margin + 2, y + 5);
  let dX = dayStartX;
  days.forEach(d => {
    doc.text(String(d.day), dX + dayColW / 2, y + 5, { align: "center" });
    dX += dayColW;
  });
  doc.text("TOT", totalX + totalColW / 2, y + 5, { align: "center" });
  y += 7;

  // Header row 2: weekday initials
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentW, 5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  dX = dayStartX;
  days.forEach(d => {
    if (d.isSunday) doc.setTextColor(200, 50, 50);
    else if (d.isSaturday) doc.setTextColor(150, 150, 150);
    else doc.setTextColor(120, 120, 120);
    doc.text(d.initial, dX + dayColW / 2, y + 3.5, { align: "center" });
    dX += dayColW;
  });
  doc.setTextColor(120, 120, 120);
  doc.text("h", totalX + totalColW / 2, y + 3.5, { align: "center" });
  y += 5;

  // One row per cantiere
  const rowH = 7;
  doc.setFontSize(7);

  cantieri.forEach((cName, ci) => {
    if (y > pageHeight - 30) { doc.addPage(); y = 20; }
    const cd = cantiereMap[cName];
    const cc = cantiereColorMap[cName];

    // Row background — light tint of cantiere color
    doc.setFillColor(cc.r, cc.g, cc.b);
    doc.rect(margin, y, 3, rowH, "F"); // color stripe on left
    if (ci % 2 === 0) {
      doc.setFillColor(250, 250, 252);
      doc.rect(margin + 3, y, contentW - 3, rowH, "F");
    }

    // Cantiere name
    doc.setFont("helvetica", "bold");
    doc.setTextColor(cc.r, cc.g, cc.b);
    doc.text(truncate(cName, 30), margin + 5, y + 5);

    // Day cells — hours only on days worked on this cantiere
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    dX = dayStartX;
    days.forEach(d => {
      const ore = cd.perDay[d.dateStr];
      if (ore !== undefined && ore > 0) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(cc.r, cc.g, cc.b);
        doc.text(ore.toFixed(0), dX + dayColW / 2, y + 5, { align: "center" });
        doc.setFont("helvetica", "normal");
      }
      dX += dayColW;
    });

    // Total for this cantiere
    doc.setFont("helvetica", "bold");
    doc.setTextColor(cc.r, cc.g, cc.b);
    doc.text(cd.totale.toFixed(1), totalX + totalColW / 2, y + 5, { align: "center" });

    y += rowH;
  });

  // TOTALE row (sum of all cantieri per day)
  if (y > pageHeight - 25) { doc.addPage(); y = 20; }
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(margin, y, contentW, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTALE GIORNO", margin + 5, y + 5.5);
  dX = dayStartX;
  days.forEach(d => {
    const dayData = giorniMap[d.dateStr];
    const ore = (dayData && getStatoInfo(dayData.stato).countsAsHours) ? dayData.ore : 0;
    if (ore > 0) {
      doc.text(ore.toFixed(0), dX + dayColW / 2, y + 5.5, { align: "center" });
    }
    dX += dayColW;
  });
  doc.text(emp.totaleOre.toFixed(1), totalX + totalColW / 2, y + 5.5, { align: "center" });
  y += 14;

  // --- Riepilogo ore per cantiere con giorni ---
  if (y > pageHeight - 30) { doc.addPage(); y = 20; }
  doc.setDrawColor(color.r, color.g, color.b);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Riepilogo ore per cantiere", margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  cantieri.forEach(cName => {
    if (y > pageHeight - 20) { doc.addPage(); y = 20; }
    const cd = cantiereMap[cName];
    const cc = cantiereColorMap[cName];
    // Color dot
    doc.setFillColor(cc.r, cc.g, cc.b);
    doc.circle(margin + 2, y - 1, 1.5, "F");
    doc.setTextColor(cc.r, cc.g, cc.b);
    doc.setFont("helvetica", "bold");
    doc.text(truncate(cName, 35), margin + 6, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    const giorniStr = cd.giorni.sort((a, b) => a - b).join(", ");
    doc.text("giorni: " + giorniStr, margin + 6, y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(cd.totale.toFixed(1) + "h", pageWidth - margin - 4, y + 2, { align: "right" });
    y += 10;
  });

  // --- Totale generale ---
  y += 2;
  if (y > pageHeight - 20) { doc.addPage(); y = 20; }
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(margin, y, contentW, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTALE ORE GENERALI", margin + 4, y + 6.5);
  doc.text(emp.totaleOre.toFixed(1) + "h", pageWidth - margin - 4, y + 6.5, { align: "right" });
  y += 14;

  // --- State counts ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  STATE_ORDER.forEach(s => {
    const count = emp.stati[s] || 0;
    if (count > 0) {
      if (y > pageHeight - 20) { doc.addPage(); y = 20; }
      doc.text(ATTENDANCE_STATES[s].label + ": " + count + " giorn" + (count === 1 ? "o" : "i"), margin, y);
      y += 4.5;
    }
  });

  // --- Cost ---
  if (showCosts && emp.costoOrario) {
    y += 3;
    if (y > pageHeight - 20) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(color.r, color.g, color.b);
    doc.text("Costo orario: " + formatEuro(emp.costoOrario), margin, y);
    y += 6;
    doc.setFontSize(12);
    doc.text("Costo totale manodopera: " + formatEuro(emp.costoTotale), margin, y);
  }

  addFooter(doc, profile, pageWidth, pageHeight, margin);
  doc.save(`Tabellone_${emp.nome.replace(/\s/g, "_")}_${MESI[mese]}_${anno}_dettagliata.pdf`);
}

// ============================================================
// SINGLE EMPLOYEE — vertical day-by-day tabellone
// ============================================================
export async function generateSingleEmployeePdf(emp, mese, anno, variant, profile, showCosts = true) {
  // Detailed variant uses a landscape cantiere-per-row matrix
  if (variant === "dettagliata") {
    return generateSingleEmployeeDetailed(emp, mese, anno, profile, showCosts);
  }
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF();
  const pageWidth = 210, pageHeight = 297, margin = 15;
  const contentW = pageWidth - margin * 2;
  let { y, color } = addCompanyHeader(doc, profile, pageWidth, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Tabellone Ore Mensili", margin, y);
  y += 7;
  doc.setFontSize(11);
  doc.text(emp.nome, margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Mese di riferimento: ${MESI[mese]} ${anno}  -  Versione: ${VARIANT_LABELS[variant]}`, margin, y);
  y += 8;

  const giorniMap = {};
  emp.giorni.forEach(g => { giorniMap[g.data] = g; });
  const days = buildDaysArray(anno, mese);

  const showStatoCol = variant !== "sintetica";
  const showCantiereCol = variant === "media" || variant === "dettagliata";

  // Column layout
  // Col 1: Giorno (initial + number)     x = margin + 2
  // Col 2: Stato (if showStatoCol)       x = margin + 30
  // Col 3: Ore                           right-aligned at margin + 95
  // Col 4: Cantiere (if showCantiereCol) x = margin + 102
  const giornoX = margin + 2;
  const statoX = margin + 30;
  const oreRightX = margin + 95;
  const cantiereX = margin + 102;
  const cantiereMaxChars = 28;

  // Table header
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(margin, y, contentW, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Giorno", giornoX, y + 5.5);
  if (showStatoCol) doc.text("Stato", statoX, y + 5.5);
  doc.text("Ore", oreRightX, y + 5.5, { align: "right" });
  if (showCantiereCol) doc.text("Cantiere / Sezione", cantiereX, y + 5.5);
  doc.setTextColor(0, 0, 0);
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const rowH = 6;

  days.forEach(d => {
    if (y > pageHeight - 30) { doc.addPage(); y = 20; }

    const recorded = giorniMap[d.dateStr];

    // Weekend background
    if (d.isSunday) {
      doc.setFillColor(254, 242, 242);
      doc.rect(margin, y - 4, contentW, rowH, "F");
    } else if (d.isSaturday) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 4, contentW, rowH, "F");
    }

    // Col 1: weekday initial + day number
    doc.setFont("helvetica", "normal");
    if (d.isSunday) doc.setTextColor(200, 50, 50);
    else if (d.isSaturday) doc.setTextColor(120, 120, 120);
    else doc.setTextColor(50, 50, 50);
    doc.text(`${d.initial} ${d.day}`, giornoX, y);

    // Col 2: Stato
    if (showStatoCol) {
      let statoLabel = "";
      let statoColor = { r: 100, g: 116, b: 139 };
      if (recorded) {
        const info = getStatoInfo(recorded.stato);
        statoLabel = info.label;
        statoColor = hexToRgb(info.color);
        if (variant === "dettagliata" && recorded.note) {
          statoLabel += " (" + truncate(recorded.note, 20) + ")";
        }
      } else if (d.isSunday) {
        statoLabel = "Riposo";
        statoColor = { r: 200, g: 100, b: 100 };
      } else {
        statoLabel = "Non lavorato";
      }
      doc.setTextColor(statoColor.r, statoColor.g, statoColor.b);
      doc.text(statoLabel, statoX, y);
    }

    // Col 3: Ore
    if (recorded && getStatoInfo(recorded.stato).countsAsHours && recorded.ore > 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(recorded.ore.toFixed(1) + "h", oreRightX, y, { align: "right" });
      doc.setFont("helvetica", "normal");
    } else if (recorded && !getStatoInfo(recorded.stato).countsAsHours) {
      const sc2 = hexToRgb(getStatoInfo(recorded.stato).color);
      doc.setTextColor(sc2.r, sc2.g, sc2.b);
      doc.text(TAB_LETTERS[recorded.stato] || "-", oreRightX, y, { align: "right" });
    } else {
      doc.setTextColor(180, 180, 180);
      doc.text("-", oreRightX, y, { align: "right" });
    }

    // Col 4: Cantiere
    if (showCantiereCol) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      let cantiereText = "";
      if (recorded && recorded.cantieri && recorded.cantieri.length > 0) {
        cantiereText = recorded.cantieri.map(c => truncate(c.cantiere_nome, 20) + " (" + c.ore.toFixed(1) + "h)").join(", ");
      }
      doc.text(truncate(cantiereText, cantiereMaxChars), cantiereX, y);
    }

    y += rowH;
  });

  // --- Riepilogo per cantiere (media + dettagliata) ---
  if (variant === "media" || variant === "dettagliata") {
    y += 6;
    if (y > pageHeight - 40) { doc.addPage(); y = 20; }
    doc.setDrawColor(color.r, color.g, color.b);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("Riepilogo ore per cantiere", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    Object.entries(emp.perLavoro).forEach(([wsName, ore]) => {
      if (y > pageHeight - 20) { doc.addPage(); y = 20; }
      doc.text(truncate(wsName, 40) + " - " + ore.toFixed(1) + "h", margin + 4, y);
      y += 5;
    });
  }

  // --- Totale ore (all variants) ---
  y += 4;
  if (y > pageHeight - 25) { doc.addPage(); y = 20; }
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(margin, y - 4, contentW, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTALE ORE LAVORATE", margin + 4, y + 2);
  doc.text(emp.totaleOre.toFixed(1) + "h", pageWidth - margin - 4, y + 2, { align: "right" });
  y += 12;

  // --- State counts (dettagliata only) ---
  if (variant === "dettagliata") {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    STATE_ORDER.forEach(s => {
      const count = emp.stati[s] || 0;
      if (count > 0) {
        if (y > pageHeight - 25) { doc.addPage(); y = 20; }
        doc.text(ATTENDANCE_STATES[s].label + ": " + count + " giorn" + (count === 1 ? "o" : "i"), margin, y);
        y += 4.5;
      }
    });
  }

  // --- Cost (dettagliata only, if costoOrario set) ---
  if (variant === "dettagliata" && showCosts && emp.costoOrario) {
    y += 3;
    if (y > pageHeight - 25) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(color.r, color.g, color.b);
    doc.text("Costo orario: " + formatEuro(emp.costoOrario), margin, y);
    y += 6;
    doc.setFontSize(12);
    doc.text("Costo totale manodopera: " + formatEuro(emp.costoTotale), margin, y);
  }

  addFooter(doc, profile, pageWidth, pageHeight, margin);
  doc.save(`Tabellone_${emp.nome.replace(/\s/g, "_")}_${MESI[mese]}_${anno}_${variant}.pdf`);
}

// ============================================================
// ALL EMPLOYEES — matrix grid (landscape) + cantiere breakdown
// ============================================================
export async function generateAllEmployeesPdf(employeeSummary, mese, anno, variant, profile, totals, showCosts = true) {
  const jsPDF = (await import("jspdf")).default;
  // Landscape for more horizontal space
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = 297, pageHeight = 210, margin = 12;
  const contentW = pageWidth - margin * 2;
  let { y, color } = addCompanyHeader(doc, profile, pageWidth, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Riepilogo Ore Mensili - Tutti i dipendenti", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`${MESI[mese]} ${anno}  -  Versione: ${VARIANT_LABELS[variant]}`, margin, y);
  y += 8;

  // Summary box
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentW, 12, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  doc.text(`Dipendenti: ${employeeSummary.length}`, margin + 4, y + 5);
  doc.text(`Totale ore: ${totals.ore.toFixed(1)}h`, margin + 80, y + 5);
  if (variant === "dettagliata" && showCosts) {
    doc.text(`Totale costo manodopera: ${formatEuro(totals.costo)}`, margin + 160, y + 5);
  }
  y += 18;

  const days = buildDaysArray(anno, mese);
  const numDays = days.length;

  // Column widths for the matrix
  const nameColW = 70;
  const totalColW = 22;
  const dayColW = (contentW - nameColW - totalColW) / numDays;

  // Header row 1: day numbers
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(margin, y, contentW, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("Dipendente", margin + 2, y + 5);
  let dayX = margin + nameColW;
  days.forEach(d => {
    doc.text(String(d.day), dayX + dayColW / 2, y + 5, { align: "center" });
    dayX += dayColW;
  });
  doc.text("TOT", pageWidth - margin - totalColW / 2, y + 5, { align: "center" });
  y += 7;

  // Header row 2: weekday initials
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentW, 5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  dayX = margin + nameColW;
  days.forEach(d => {
    if (d.isSunday) doc.setTextColor(200, 50, 50);
    else if (d.isSaturday) doc.setTextColor(150, 150, 150);
    else doc.setTextColor(120, 120, 120);
    doc.text(d.initial, dayX + dayColW / 2, y + 3.5, { align: "center" });
    dayX += dayColW;
  });
  doc.setTextColor(120, 120, 120);
  doc.text("h", pageWidth - margin - totalColW / 2, y + 3.5, { align: "center" });
  y += 5;

  // Employee rows
  const rowH = 7;
  const subRowH = 6;
  const stripeW = 3;
  const cantierePalette = [
    { r: 30, g: 64, b: 175 },
    { r: 5, g: 150, b: 105 },
    { r: 217, g: 119, b: 6 },
    { r: 124, g: 58, b: 237 },
    { r: 220, g: 38, b: 38 },
    { r: 14, g: 165, b: 233 },
    { r: 190, g: 24, b: 93 },
    { r: 120, g: 113, b: 108 },
  ];
  doc.setFontSize(7);

  employeeSummary.forEach((emp, empIdx) => {
    // Build per-cantiere per-day map for detailed variant
    let cantiereMap = null;
    if (variant === "dettagliata") {
      cantiereMap = {};
      emp.giorni.forEach(g => {
        (g.cantieri || []).forEach(c => {
          const name = c.cantiere_nome || "N/D";
          if (!cantiereMap[name]) cantiereMap[name] = { perDay: {}, totale: 0 };
          cantiereMap[name].perDay[g.data] = (cantiereMap[name].perDay[g.data] || 0) + (c.ore || 0);
          cantiereMap[name].totale += c.ore || 0;
        });
      });
    }
    const cantieri = cantiereMap ? Object.keys(cantiereMap).sort((a, b) => cantiereMap[b].totale - cantiereMap[a].totale) : [];
    const useSubRows = variant === "dettagliata" && cantieri.length > 0;

    // Check space: need room for name header + cantiere rows + total row
    const blockH = useSubRows ? (rowH + cantieri.length * subRowH + subRowH) : rowH;
    if (y + blockH > pageHeight - 25) { doc.addPage(); y = 20; }

    const blockTop = y;

    if (useSubRows) {
      // Employee name header row (spans full width, light tint)
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, contentW, rowH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 30);
      doc.text(truncate(emp.nome, 28), margin + 2, y + 5);
      y += rowH;

      // One row per cantiere
      cantieri.forEach((cName, ci) => {
        const cd = cantiereMap[cName];
        const cc = cantierePalette[ci % cantierePalette.length];
        if (y > pageHeight - 15) { doc.addPage(); y = 20; }

        // Alternating subtle background
        if (ci % 2 === 0) {
          doc.setFillColor(250, 250, 252);
          doc.rect(margin + stripeW, y, contentW - stripeW, subRowH, "F");
        }
        // Color stripe
        doc.setFillColor(cc.r, cc.g, cc.b);
        doc.rect(margin, y, stripeW, subRowH, "F");

        // Cantiere name (indented)
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(cc.r, cc.g, cc.b);
        doc.text(truncate(cName, 26), margin + stripeW + 2, y + 4.2);

        // Day cells — hours only on days worked on this cantiere
        dayX = margin + nameColW;
        days.forEach(d => {
          const ore = cd?.perDay[d.dateStr];
          if (ore !== undefined && ore > 0) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(cc.r, cc.g, cc.b);
            doc.text(ore.toFixed(0), dayX + dayColW / 2, y + 4.2, { align: "center" });
          }
          dayX += dayColW;
        });

        // Cantiere total
        doc.setFont("helvetica", "bold");
        doc.setTextColor(cc.r, cc.g, cc.b);
        doc.text((cd?.totale ?? 0).toFixed(1), pageWidth - margin - totalColW / 2, y + 4.2, { align: "center" });

        y += subRowH;
      });

      // Total row for this employee (day-by-day sum across cantieri)
      doc.setFillColor(color.r, color.g, color.b);
      doc.rect(margin, y, contentW, subRowH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text("Totale", margin + 2, y + 4.2);
      dayX = margin + nameColW;
      days.forEach(d => {
        const dayData = emp.dayMap[d.dateStr];
        const ore = (dayData && getStatoInfo(dayData.stato).countsAsHours) ? dayData.ore : 0;
        if (ore > 0) {
          doc.text(ore.toFixed(0), dayX + dayColW / 2, y + 4.2, { align: "center" });
        } else if (dayData && !getStatoInfo(dayData.stato).countsAsHours) {
          doc.text(TAB_LETTERS[dayData.stato] || "-", dayX + dayColW / 2, y + 4.2, { align: "center" });
        }
        dayX += dayColW;
      });
      doc.setFontSize(8);
      doc.text(emp.totaleOre.toFixed(1), pageWidth - margin - totalColW / 2, y + 4.2, { align: "center" });
      y += subRowH + 2;
    } else {
      // Single row per employee (sintetica / media)
      if (empIdx % 2 === 0) {
        doc.setFillColor(250, 250, 252);
        doc.rect(margin, y, contentW, rowH, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      doc.text(truncate(emp.nome, 28), margin + 2, y + 5);

      dayX = margin + nameColW;
      days.forEach(d => {
        const dayData = emp.dayMap[d.dateStr];
        if (dayData) {
          const info = getStatoInfo(dayData.stato);
          if (info.countsAsHours && dayData.ore > 0) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 64, 175);
            doc.text(dayData.ore.toFixed(0), dayX + dayColW / 2, y + 5, { align: "center" });
          } else {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(hexToRgb(info.color).r, hexToRgb(info.color).g, hexToRgb(info.color).b);
            doc.text(TAB_LETTERS[dayData.stato] || "-", dayX + dayColW / 2, y + 5, { align: "center" });
          }
        }
        dayX += dayColW;
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(emp.totaleOre.toFixed(1), pageWidth - margin - totalColW / 2, y + 5, { align: "center" });
      doc.setFontSize(7);
      y += rowH;
    }
  });

  // --- Grand total ---
  y += 3;
  if (y > pageHeight - 20) { doc.addPage(); y = 20; }
  doc.setFillColor(color.r, color.g, color.b);
  doc.rect(margin, y, contentW, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTALE ORE", margin + 4, y + 6);
  doc.text(totals.ore.toFixed(1) + "h", pageWidth - margin - 4, y + 6, { align: "right" });
  if (variant === "dettagliata" && showCosts) {
    doc.text("TOTALE COSTO: " + formatEuro(totals.costo), pageWidth / 2, y + 6, { align: "center" });
  }
  y += 14;

  // --- Cantiere breakdown (media + dettagliata) ---
  if (variant === "media" || variant === "dettagliata") {
    if (y > pageHeight - 30) { doc.addPage(); y = 20; }
    doc.setDrawColor(color.r, color.g, color.b);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("Suddivisione ore per cantiere", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    // Two-column layout for cantiere breakdown
    const colW = contentW / 2;
    let col1Y = y;
    let col2Y = y;
    const allEntries = [];
    employeeSummary.forEach(emp => {
      // Collect days per cantiere for this employee
      const cantiereDays = {};
      emp.giorni.forEach(g => {
        (g.cantieri || []).forEach(c => {
          const name = c.cantiere_nome || "N/D";
          if (!cantiereDays[name]) cantiereDays[name] = [];
          const dayNum = parseInt(g.data.split("-")[2], 10);
          if (!cantiereDays[name].includes(dayNum)) cantiereDays[name].push(dayNum);
        });
      });
      Object.entries(emp.perLavoro).forEach(([wsName, ore]) => {
        const days = (cantiereDays[wsName] || []).sort((a, b) => a - b);
        allEntries.push({ emp: emp.nome, ws: wsName, ore, giorni: days });
      });
    });
    const half = Math.ceil(allEntries.length / 2);
    const col1 = allEntries.slice(0, half);
    const col2 = allEntries.slice(half);

    col1.forEach(e => {
      if (col1Y > pageHeight - 15) { doc.addPage(); col1Y = 20; }
      doc.setTextColor(80, 80, 80);
      doc.text(truncate(e.emp, 18), margin, col1Y);
      doc.setTextColor(50, 50, 50);
      doc.text(truncate(e.ws, 20), margin + 50, col1Y);
      doc.setFont("helvetica", "bold");
      doc.text(e.ore.toFixed(1) + "h", margin + colW - 4, col1Y, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6);
      if (e.giorni && e.giorni.length) {
        doc.text("gg: " + e.giorni.join(","), margin + 50, col1Y + 3.5);
      }
      doc.setFontSize(8);
      col1Y += 8;
    });
    col2.forEach(e => {
      if (col2Y > pageHeight - 15) { doc.addPage(); col2Y = 20; }
      const cx = margin + colW;
      doc.setTextColor(80, 80, 80);
      doc.text(truncate(e.emp, 18), cx, col2Y);
      doc.setTextColor(50, 50, 50);
      doc.text(truncate(e.ws, 20), cx + 50, col2Y);
      doc.setFont("helvetica", "bold");
      doc.text(e.ore.toFixed(1) + "h", cx + colW - 4, col2Y, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6);
      if (e.giorni && e.giorni.length) {
        doc.text("gg: " + e.giorni.join(","), cx + 50, col2Y + 3.5);
      }
      doc.setFontSize(8);
      col2Y += 8;
    });
    y = Math.max(col1Y, col2Y);
  }

  // --- Legend ---
  y += 6;
  if (y > pageHeight - 20) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  let legX = margin;
  doc.text("Legenda:", legX, y);
  legX += 22;
  doc.text("numero = ore lavorate", legX, y); legX += 60;
  doc.setTextColor(hexToRgb(ATTENDANCE_STATES.ferie.color).r, hexToRgb(ATTENDANCE_STATES.ferie.color).g, hexToRgb(ATTENDANCE_STATES.ferie.color).b);
  doc.text("F = Ferie", legX, y); legX += 35;
  doc.setTextColor(hexToRgb(ATTENDANCE_STATES.permesso.color).r, hexToRgb(ATTENDANCE_STATES.permesso.color).g, hexToRgb(ATTENDANCE_STATES.permesso.color).b);
  doc.text("P = Permessi", legX, y); legX += 40;
  doc.setTextColor(hexToRgb(ATTENDANCE_STATES.malattia.color).r, hexToRgb(ATTENDANCE_STATES.malattia.color).g, hexToRgb(ATTENDANCE_STATES.malattia.color).b);
  doc.text("M = Malattia", legX, y); legX += 40;
  doc.setTextColor(hexToRgb(ATTENDANCE_STATES.assente.color).r, hexToRgb(ATTENDANCE_STATES.assente.color).g, hexToRgb(ATTENDANCE_STATES.assente.color).b);
  doc.text("A = Assente", legX, y);

  addFooter(doc, profile, pageWidth, pageHeight, margin);
  doc.save(`Riepilogo_Ore_${MESI[mese]}_${anno}_${variant}.pdf`);
}