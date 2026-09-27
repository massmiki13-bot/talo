import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/db";
import { getAccessContext } from "@/lib/accessScope";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Clock, FileDown, FileText } from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { formatEuro } from "@/utils/pdfUtils";
import { ATTENDANCE_STATES, STATE_ORDER, getStatoInfo } from "@/utils/attendanceStates";
import { generateSingleEmployeePdf, generateAllEmployeesPdf } from "@/utils/monthlyReportPdf";
import { generateSingleEmployeeExcel, generateAllEmployeesExcel } from "@/utils/hoursExcelExport";
import ExportVariantDialog from "@/components/attendance/ExportVariantDialog";
import { Switch } from "@/components/ui/switch";

const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const WEEKDAY_LETTERS = ["D", "L", "M", "M", "G", "V", "S"];
const TAB_LETTERS = { ferie: "F", permesso: "P", malattia: "M", assente: "A" };

export default function MonthlyHours() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [worksites, setWorksites] = useState([]);
  const [mese, setMese] = useState(new Date().getMonth());
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportTarget, setExportTarget] = useState(null); // "single" | "all" | null
  const [showCosts, setShowCosts] = useState(true);

  const accessCtx = getAccessContext();
  const isOperaio = !accessCtx.isHost && accessCtx.accessLevel === "operaio";
  const canSeeCosts = !isOperaio;
  const myEmpId = accessCtx.employeeId;

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (isOperaio && myEmpId) setSelectedEmpId(myEmpId);
  }, [isOperaio, myEmpId]);

  const load = async () => {
    try {
      const [emps, att, sites] = await Promise.all([
        db.Employee.list(),
        db.DailyAttendance.list(),
        db.Worksite.list(),
      ]);
      setEmployees(emps);
      setAttendance(att);
      setWorksites(sites);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const monthAttendance = useMemo(() => {
    return attendance.filter(a => {
      if (!a.data) return false;
      const d = new Date(a.data);
      return d.getMonth() === mese && d.getFullYear() === anno;
    });
  }, [attendance, mese, anno]);

  const employeeSummary = useMemo(() => {
    const map = {};
    monthAttendance.forEach(a => {
      a.presenze?.forEach(p => {
        if (!p.dipendente_id) return;
        if (isOperaio && p.dipendente_id !== myEmpId) return;

        const stato = p.stato || "presente";
        const empId = p.dipendente_id;
        if (!map[empId]) {
          map[empId] = { id: empId, nome: p.dipendente_nome || "", totaleOre: 0, perLavoro: {}, stati: {}, dayMap: {} };
        }
        const info = getStatoInfo(stato);
        const cantiereId = a.cantiere_id;
        const isGeneralCantiere = !cantiereId || cantiereId === "__nessun_cantiere__";
        const ws = worksites.find(w => w.id === cantiereId);
        const cantiereNome = ws?.nome || a.cantiere_nome || (cantiereId && !isGeneralCantiere ? "N/D" : "");

        if (info.countsAsHours) map[empId].totaleOre += p.ore || 0;
        map[empId].stati[stato] = (map[empId].stati[stato] || 0) + 1;

        if (info.countsAsHours && !isGeneralCantiere) {
          if (!map[empId].perLavoro[cantiereNome]) map[empId].perLavoro[cantiereNome] = 0;
          map[empId].perLavoro[cantiereNome] += p.ore || 0;
        }

        if (!map[empId].dayMap[a.data]) map[empId].dayMap[a.data] = { stato, ore: 0, cantieri: [] };
        const dayEntry = map[empId].dayMap[a.data];
        if (stato === "presente") dayEntry.stato = "presente";
        else if (dayEntry.stato !== "presente") dayEntry.stato = stato;
        if (info.countsAsHours) {
          dayEntry.ore += p.ore || 0;
          if (!isGeneralCantiere) dayEntry.cantieri.push({ cantiere_id: cantiereId, cantiere_nome: cantiereNome, ore: p.ore || 0 });
        }
      });
    });

    employees.forEach(emp => {
      if (map[emp.id]) {
        map[emp.id].nome = `${emp.nome} ${emp.cognome}`;
        map[emp.id].costoOrario = emp.costo_orario || 0;
        map[emp.id].costoTotale = (emp.costo_orario || 0) * map[emp.id].totaleOre;
      }
    });

    Object.values(map).forEach(emp => {
      emp.giorni = Object.entries(emp.dayMap).map(([data, d]) => ({ data, ...d })).sort((a, b) => a.data.localeCompare(b.data));
    });

    return Object.values(map).sort((a, b) => b.totaleOre - a.totaleOre);
  }, [monthAttendance, employees, worksites, isOperaio, myEmpId]);

  const totaleOreMese = employeeSummary.reduce((s, e) => s + e.totaleOre, 0);
  const totaleCostoMese = employeeSummary.reduce((s, e) => s + (e.costoTotale || 0), 0);

  const daysInMonth = new Date(anno, mese + 1, 0).getDate();
  const days = useMemo(() => {
    const arr = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${anno}-${String(mese + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const date = new Date(dateStr);
      const weekday = date.getDay();
      arr.push({ day: d, dateStr, weekday, letter: WEEKDAY_LETTERS[weekday], isSunday: weekday === 0, isSaturday: weekday === 6 });
    }
    return arr;
  }, [anno, mese, daysInMonth]);

  const handleSelectVariant = async (variant, includeCosts, format = "pdf") => {
    const showCostsInPdf = canSeeCosts && includeCosts;
    setExporting(true);
    try {
      const profiles = await db.CompanyProfile.list();
      const profile = profiles[0];
      if (format === "excel") {
        if (exportTarget === "single") {
          const emp = employeeSummary.find(e => e.id === selectedEmpId);
          if (emp) generateSingleEmployeeExcel(emp, mese, anno, profile, showCostsInPdf);
        } else if (exportTarget === "all") {
          generateAllEmployeesExcel(employeeSummary, mese, anno, profile, { ore: totaleOreMese, costo: totaleCostoMese }, showCostsInPdf);
        }
      } else {
        if (exportTarget === "single") {
          const emp = employeeSummary.find(e => e.id === selectedEmpId);
          if (emp) await generateSingleEmployeePdf(emp, mese, anno, variant, profile, showCostsInPdf);
        } else if (exportTarget === "all") {
          await generateAllEmployeesPdf(employeeSummary, mese, anno, variant, profile, { ore: totaleOreMese, costo: totaleCostoMese }, showCostsInPdf);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
      setExportTarget(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={String(mese)} onValueChange={v => setMese(parseInt(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{MESI.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(anno)} onValueChange={v => setAnno(parseInt(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[0,1,2].map(i => { const y = new Date().getFullYear() - i; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}</SelectContent>
        </Select>
        {canSeeCosts && (
          <div className="flex items-center gap-2 ml-auto">
            <Switch checked={showCosts} onCheckedChange={setShowCosts} id="show-costs" />
            <label htmlFor="show-costs" className="text-xs font-medium text-slate-600 cursor-pointer">Mostra costi</label>
          </div>
        )}
        {!isOperaio && (
          <Button onClick={() => setExportTarget("all")} variant="outline" className="gap-2">
            <FileDown className="w-4 h-4" /> Esporta (tutti)
          </Button>
        )}
      </div>

      {/* Employee selector for single PDF */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Dipendente</label>
          {isOperaio ? (
            <div className="text-sm font-medium text-slate-700 py-2">
              {employeeSummary.find(e => e.id === myEmpId)?.nome || "Nessun dato"}
            </div>
          ) : (
            <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
              <SelectTrigger><SelectValue placeholder="Seleziona dipendente per PDF dettagliato..." /></SelectTrigger>
              <SelectContent>
                {employeeSummary.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button onClick={() => setExportTarget("single")} disabled={!selectedEmpId} className="gap-2 bg-blue-600 hover:bg-blue-700">
          <FileText className="w-4 h-4" /> Esporta tabellone
        </Button>
      </div>

      {/* Summary cards */}
      <div className={`grid grid-cols-1 ${canSeeCosts && showCosts ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 mb-6`}>
        <Card><CardContent className="pt-6">
          <Users className="w-5 h-5 text-blue-600 mb-2" />
          <p className="text-2xl font-bold text-slate-900">{employeeSummary.length}</p>
          <p className="text-xs text-slate-500">Dipendenti con ore</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <Clock className="w-5 h-5 text-amber-600 mb-2" />
          <p className="text-2xl font-bold text-slate-900">{totaleOreMese.toFixed(1)}h</p>
          <p className="text-xs text-slate-500">Totale ore del mese</p>
        </CardContent></Card>
        {canSeeCosts && showCosts && (
        <Card><CardContent className="pt-6">
          <span className="text-2xl">💶</span>
          <p className="text-2xl font-bold text-slate-900 mt-2">{formatEuro(totaleCostoMese)}</p>
          <p className="text-xs text-slate-500">Costo manodopera</p>
        </CardContent></Card>
        )}
      </div>

      {/* Tabellone grid */}
      {employeeSummary.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Nessuna presenza registrata per {MESI[mese]} {anno}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 border-b border-r border-slate-200 px-2 py-1.5 text-left text-xs font-medium text-slate-500 uppercase min-w-[120px] max-w-[180px]">Dipendente</th>
                  {days.map(d => (
                    <th key={d.dateStr} className={`border-b border-r border-slate-200 px-0.5 py-1 text-center text-xs font-medium min-w-[28px] w-7 ${d.isSunday ? "bg-red-50 text-red-600" : d.isSaturday ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-600"}`}>
                      {d.day}
                    </th>
                  ))}
                  <th className="bg-slate-50 border-b border-slate-200 px-2 py-1 text-center text-xs font-medium text-slate-500 uppercase min-w-[50px]">ORE</th>
                </tr>
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 border-b border-r border-slate-200"></th>
                  {days.map(d => (
                    <th key={d.dateStr} className={`border-b border-r border-slate-200 px-0.5 py-0.5 text-center text-[10px] font-medium ${d.isSunday ? "bg-red-50 text-red-500" : d.isSaturday ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-400"}`}>
                      {d.letter}
                    </th>
                  ))}
                  <th className="bg-slate-50 border-b border-slate-200"></th>
                </tr>
              </thead>
              <tbody>
                {employeeSummary.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 font-medium text-slate-900 whitespace-nowrap px-2 py-1.5 min-w-[120px] max-w-[180px] truncate">
                      {emp.nome}
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {STATE_ORDER.map(s => {
                          const count = emp.stati[s] || 0;
                          if (count === 0) return null;
                          return <span key={s} className={`text-[8px] px-1 rounded ${ATTENDANCE_STATES[s].badgeClass}`}>{ATTENDANCE_STATES[s].short}×{count}</span>;
                        })}
                      </div>
                    </td>
                    {days.map(d => {
                      const dayData = emp.dayMap[d.dateStr];
                      if (!dayData) return <td key={d.dateStr} className={`border-b border-r border-slate-200 text-center min-w-[28px] w-7 h-8 ${d.isSunday ? "bg-red-50/50" : d.isSaturday ? "bg-slate-50" : ""}`}></td>;
                      const info = getStatoInfo(dayData.stato);
                      if (dayData.stato === "presente") {
                        return (
                          <td key={d.dateStr} className={`border-b border-r border-slate-200 text-center text-xs font-semibold ${info.bgClass} min-w-[28px] w-7 h-8`}
                            title={dayData.cantieri.map(c => `${c.cantiere_nome}: ${c.ore}h`).join(", ")}>
                            {dayData.ore.toFixed(0)}
                          </td>
                        );
                      }
                      return (
                        <td key={d.dateStr} className={`border-b border-r border-slate-200 text-center text-[10px] font-bold min-w-[28px] w-7 h-8 ${info.bgClass}`}>
                          {TAB_LETTERS[dayData.stato] || ""}
                        </td>
                      );
                    })}
                    <td className="border-b border-slate-200 text-center font-bold text-slate-900 bg-slate-50 px-2 py-1.5">
                      {emp.totaleOre.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-500">
        {STATE_ORDER.map(s => {
          const info = ATTENDANCE_STATES[s];
          const symbol = s === "presente" ? "8" : (TAB_LETTERS[s] || info.short);
          return (
            <span key={s} className="flex items-center gap-1">
              <span className={`font-bold px-1 rounded ${info.badgeClass}`}>{symbol}</span> = {info.label}
            </span>
          );
        })}
      </div>

      <ExportVariantDialog
        open={!!exportTarget}
        title={exportTarget === "all" ? "Esporta — Tutti i dipendenti" : "Esporta — Singolo dipendente"}
        onClose={() => setExportTarget(null)}
        onSelect={handleSelectVariant}
        loading={exporting}
        canSeeCosts={canSeeCosts}
      />
    </div>
  );
}