// @ts-nocheck — disegno di PDF/Excel con argomenti a ventaglio (jsPDF): escluso dal controllo dei tipi.
import { downloadExcelSheet } from "@/utils/excelExport";
import { formatEuro } from "@/utils/pdfUtils";
import { getStatoInfo, ATTENDANCE_STATES, STATE_ORDER } from "@/utils/attendanceStates";

const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const WEEKDAY_LETTERS = ["D", "L", "M", "M", "G", "V", "S"];
const TAB_LETTERS = { ferie: "F", permesso: "P", malattia: "M", assente: "A" };

// Sunday/Saturday header colors (match on-screen slate/red tints)
const SUNDAY_BG = "#fee2e2";
const SUNDAY_TEXT = "#dc2626";
const SATURDAY_BG = "#f1f5f9";
const SATURDAY_TEXT = "#94a3b8";

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
      letter: WEEKDAY_LETTERS[weekday],
      isSunday: weekday === 0,
      isSaturday: weekday === 6,
      headerBg: weekday === 0 ? SUNDAY_BG : weekday === 6 ? SATURDAY_BG : "",
      headerText: weekday === 0 ? SUNDAY_TEXT : weekday === 6 ? SATURDAY_TEXT : "",
    });
  }
  return arr;
}

function buildLegend() {
  return STATE_ORDER.map(s => {
    const info = ATTENDANCE_STATES[s];
    const symbol = s === "presente" ? "8" : (TAB_LETTERS[s] || info.short);
    return { symbol, label: info.label, bgColor: info.excelBg, textColor: info.excelText };
  });
}

export function generateSingleEmployeeExcel(emp, mese, anno, profile, showCosts) {
  const days = buildDaysArray(anno, mese);

  const headers = [
    { label: "Giorno", width: 60, align: "left" },
    { label: "Sett.", width: 40, align: "center" },
    { label: "Stato", width: 130, align: "left" },
    { label: "Ore", width: 50, align: "right" },
    { label: "Cantiere / Sezione", width: 250, align: "left" },
  ];

  const rows = days.map(d => {
    const dayData = emp.dayMap[d.dateStr];
    const giornoLabel = `${d.letter} ${d.day}`;

    // Empty day — apply Sunday/Saturday tint
    if (!dayData) {
      const bg = d.isSunday ? SUNDAY_BG : d.isSaturday ? SATURDAY_BG : "";
      return [
        { value: giornoLabel, bgColor: bg },
        { value: d.letter, bgColor: bg, textColor: d.isSunday ? SUNDAY_TEXT : d.isSaturday ? SATURDAY_TEXT : "", align: "center" },
        "", "", "",
      ];
    }

    const info = getStatoInfo(dayData.stato);
    const cellBg = info.excelBg;
    const cellText = info.excelText;

    if (info.countsAsHours) {
      const cantieriStr = (dayData.cantieri || []).map(c => `${c.cantiere_nome} (${c.ore.toFixed(1)}h)`).join(", ");
      return [
        { value: giornoLabel, bgColor: cellBg, textColor: cellText, bold: true },
        { value: d.letter, bgColor: cellBg, textColor: cellText, align: "center" },
        { value: info.label, bgColor: cellBg, textColor: cellText },
        { value: dayData.ore, type: "number", bgColor: cellBg, textColor: cellText, bold: true },
        { value: cantieriStr, bgColor: cellBg, textColor: cellText },
      ];
    }

    return [
      { value: giornoLabel, bgColor: cellBg, textColor: cellText, bold: true },
      { value: d.letter, bgColor: cellBg, textColor: cellText, align: "center" },
      { value: info.label, bgColor: cellBg, textColor: cellText },
      { value: TAB_LETTERS[dayData.stato] || "", type: "text", align: "right", bgColor: cellBg, textColor: cellText, bold: true },
      "",
    ];
  });

  const footerRows = [["", "", "TOTALE ORE", { value: emp.totaleOre, type: "number" }, ""]];

  const infoLines = [`Dipendente: ${emp.nome}`, `Mese: ${MESI[mese]} ${anno}`];
  if (showCosts && emp.costoOrario) {
    infoLines.push(`Costo orario: ${formatEuro(emp.costoOrario)}`);
    infoLines.push(`Costo totale manodopera: ${formatEuro(emp.costoTotale)}`);
  }

  const safeName = emp.nome.replace(/\s/g, "_");
  downloadExcelSheet({
    filename: `Tabellone_${safeName}_${MESI[mese]}_${anno}.xls`,
    title: `Tabellone Ore - ${emp.nome}`,
    headers,
    rows,
    profile,
    footerRows,
    infoLines,
    legend: buildLegend(),
  });
}

export function generateAllEmployeesExcel(employeeSummary, mese, anno, profile, totals, showCosts) {
  const days = buildDaysArray(anno, mese);

  // Row 1: day numbers (with Sunday/Saturday coloring)
  const headerRow1 = [
    { label: "Dipendente", width: 160, align: "left" },
    ...days.map(d => ({
      label: String(d.day),
      width: 30,
      align: "center",
      bgColor: d.headerBg || undefined,
      textColor: d.headerText || undefined,
    })),
    { label: "ORE", width: 55, align: "right" },
  ];

  // Row 2: weekday letters (sub-header, with Sunday/Saturday coloring)
  const headerRow2 = [
    { label: "", width: 160 },
    ...days.map(d => ({
      label: d.letter,
      width: 30,
      align: "center",
      bgColor: d.headerBg || undefined,
      textColor: d.headerText || undefined,
    })),
    { label: "", width: 55 },
  ];

  // Data rows — one per employee
  const rows = employeeSummary.map(emp => {
    const cells = [{ value: emp.nome, bold: true }];

    days.forEach(d => {
      const dayData = emp.dayMap[d.dateStr];

      if (!dayData) {
        const bg = d.isSunday ? SUNDAY_BG : d.isSaturday ? SATURDAY_BG : "";
        cells.push({ value: "", bgColor: bg });
        return;
      }

      const info = getStatoInfo(dayData.stato);
      const cellBg = info.excelBg;
      const cellText = info.excelText;

      if (info.countsAsHours && dayData.ore > 0) {
        cells.push({ value: dayData.ore, type: "number", bgColor: cellBg, textColor: cellText, bold: true, align: "center" });
      } else {
        cells.push({ value: TAB_LETTERS[dayData.stato] || "", bgColor: cellBg, textColor: cellText, bold: true, align: "center" });
      }
    });

    cells.push({ value: emp.totaleOre, type: "number", bold: true });
    return cells;
  });

  // Total row
  const totalCells = [{ value: "TOTALE", bold: true }];
  days.forEach(d => {
    let dayTotal = 0;
    employeeSummary.forEach(emp => {
      const dd = emp.dayMap[d.dateStr];
      if (dd && getStatoInfo(dd.stato).countsAsHours) dayTotal += dd.ore;
    });
    totalCells.push(dayTotal > 0 ? { value: dayTotal, type: "number", bold: true } : "");
  });
  totalCells.push({ value: totals.ore, type: "number", bold: true });
  const footerRows = [totalCells];

  const infoLines = [`Periodo: ${MESI[mese]} ${anno}`, `Dipendenti: ${employeeSummary.length}`, `Totale ore: ${totals.ore.toFixed(1)}h`];
  if (showCosts) infoLines.push(`Totale costo manodopera: ${formatEuro(totals.costo)}`);

  downloadExcelSheet({
    filename: `Riepilogo_Ore_${MESI[mese]}_${anno}.xls`,
    title: `Riepilogo Ore - ${MESI[mese]} ${anno}`,
    headers: headerRow1,
    subHeaderRows: [headerRow2],
    rows,
    profile,
    footerRows,
    infoLines,
    legend: buildLegend(),
  });
}