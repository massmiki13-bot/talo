import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { dayEntries, holidayName, isWorkingDay, iso, employedOn, fmtH } from "@/lib/attendance";
import { ATTENDANCE_STATES, STATE_ORDER } from "@/utils/attendanceStates";

// Mese a colpo d'occhio: quanti dipendenti sono registrati ogni giorno e quali giornate mancano.
export default function AttendanceCalendar({ month, setMonth, records, employees, today, onOpenDay, myEmpId }) {
  const y = month.getFullYear(), m = month.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;

  const info = useMemo(() => {
    const out = {};
    for (let d = 1; d <= days; d++) {
      const ds = iso(new Date(y, m, d));
      const entries = Object.values(dayEntries(records, ds)).filter((e) => !myEmpId || e.dipendente_id === myEmpId);
      const expected = myEmpId ? 1 : employees.filter((e) => employedOn(e, ds)).length;
      const counts = {};
      let ore = 0;
      for (const e of entries) { counts[e.stato] = (counts[e.stato] || 0) + 1; ore += e.ore || 0; }
      out[ds] = { n: entries.length, expected, counts, ore, hol: holidayName(ds), working: isWorkingDay(ds) };
    }
    return out;
  }, [records, employees, y, m, days, myEmpId]);

  const missing = Object.entries(info).filter(([ds, v]) => v.working && ds <= today && v.n < v.expected).length;

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 flex flex-wrap items-center gap-2">
        <button onClick={() => setMonth(new Date(y, m - 1, 1))} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Mese precedente"><ChevronLeft className="w-5 h-5" /></button>
        <p className="font-semibold text-slate-900 capitalize min-w-[140px] text-center">{month.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</p>
        <button onClick={() => setMonth(new Date(y, m + 1, 1))} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Mese successivo"><ChevronRight className="w-5 h-5" /></button>
        {!myEmpId && (missing > 0
          ? <span className="ml-auto text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-0.5 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{missing} {missing === 1 ? "giornata incompleta" : "giornate incomplete"}</span>
          : <span className="ml-auto text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-0.5">Mese completo fino a oggi</span>)}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500 border-b border-slate-100">
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} className="border-b border-r border-slate-100 bg-slate-50/50" />)}
          {Array.from({ length: days }).map((_, i) => {
            const ds = iso(new Date(y, m, i + 1));
            const v = info[ds];
            const incomplete = v.working && ds <= today && v.n < v.expected;
            const pct = v.expected ? Math.min(100, Math.round((v.n / v.expected) * 100)) : 0;
            return (
              <button key={ds} onClick={() => onOpenDay(ds)}
                className={`min-h-[72px] sm:min-h-[96px] border-b border-r border-slate-100 p-1.5 text-left hover:bg-brand-50/50 transition-colors ${!v.working ? "bg-slate-50" : ""} ${ds === today ? "ring-2 ring-inset ring-brand-500" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${v.hol ? "text-red-700" : !v.working ? "text-slate-500" : "text-slate-800"}`}>{i + 1}</span>
                  {incomplete && <span className="w-2 h-2 rounded-full bg-amber-500" title="Giornata incompleta" />}
                </div>
                {v.hol && <p className="text-[10px] leading-tight text-red-700 truncate">{v.hol}</p>}
                {v.n > 0 && (
                  <div className="mt-1 space-y-1">
                    <p className="text-[11px] text-slate-700 tabular-nums"><span className="hidden sm:inline">{v.n}/{v.expected} · </span>{fmtH(v.ore)}h</p>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
                      {STATE_ORDER.filter((s) => v.counts[s]).map((s) => (
                        <span key={s} style={{ width: `${(v.counts[s] / Math.max(v.expected, v.n)) * 100}%`, background: ATTENDANCE_STATES[s].color }} />
                      ))}
                    </div>
                    <div className="hidden sm:flex flex-wrap gap-0.5">
                      {STATE_ORDER.filter((s) => s !== "presente" && v.counts[s]).map((s) => (
                        <span key={s} className={`text-[10px] px-1 rounded ${ATTENDANCE_STATES[s].badgeClass}`}>{ATTENDANCE_STATES[s].short} {v.counts[s]}</span>
                      ))}
                    </div>
                  </div>
                )}
                {v.n === 0 && incomplete && <p className="text-[10px] text-amber-700 mt-1 hidden sm:block">Da compilare</p>}
                <span className="sr-only">{pct}% registrato</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {STATE_ORDER.map((s) => <span key={s} className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full" style={{ background: ATTENDANCE_STATES[s].color }} />{ATTENDANCE_STATES[s].label}</span>)}
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Giornata incompleta</span>
      </div>
    </div>
  );
}
