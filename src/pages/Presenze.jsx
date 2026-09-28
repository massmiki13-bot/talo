import React, { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import { getAccessContext } from "@/lib/accessScope";
import { ClipboardList, CalendarDays, Table2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import DailySheet from "@/components/attendance/DailySheet";
import AttendanceCalendar from "@/components/attendance/AttendanceCalendar";
import MonthlyHours from "@/pages/MonthlyHours";
import { iso, parseIso } from "@/lib/attendance";

const TABS = [
  { key: "giornaliera", label: "Giornaliera", icon: ClipboardList },
  { key: "calendario", label: "Calendario", icon: CalendarDays },
  { key: "tabellone", label: "Tabellone mensile", icon: Table2 },
];
const LEGACY = { inserimento: "giornaliera", riepilogo: "tabellone" };

export default function Presenze() {
  const params = new URLSearchParams(window.location.search);
  const initialTab = LEGACY[params.get("tab")] || params.get("tab") || "giornaliera";
  const [tab, setTab] = useState(TABS.some((t) => t.key === initialTab) ? initialTab : "giornaliera");
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(params.get("data") || "") ? params.get("data") : iso(new Date()));
  const [month, setMonth] = useState(() => { const d = parseIso(date); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [worksites, setWorksites] = useState([]);
  const [siteLabel, setSiteLabel] = useState("Cantiere");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  const ctx = getAccessContext();
  const isOperaio = !ctx.isHost && ctx.accessLevel === "operaio";

  const load = useCallback(async () => {
    try {
      const [recs, emps, sites, profiles] = await Promise.all([
        db.DailyAttendance.filter({ data: { $gte: new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10) } }, "-data", 10000), db.Employee.list(), db.Worksite.list("-created_date"), db.CompanyProfile.list().catch(() => []),
      ]);
      setRecords(recs);
      setEmployees(emps);
      // lavori aperti per l'inserimento; quelli chiusi restano leggibili nei dati già salvati
      setWorksites(sites.filter((w) => w.stato ? w.stato !== "finito" : w.attivo !== false).map((w) => ({ ...w, nome: w.nome || w.titolo || "Cantiere" })));
      if (profiles[0]?.termine_sezioni) setSiteLabel(profiles[0].termine_sezioni);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const switchTab = (k) => {
    if (dirty && tab === "giornaliera" && !confirm("Ci sono modifiche non salvate nella giornaliera. Uscire e perderle?")) return;
    setTab(k);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", k);
    window.history.replaceState(null, "", u);
  };
  const openDay = (ds) => { setDate(ds); setTab("giornaliera"); };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Presenze" subtitle={isOperaio ? "Le tue giornate registrate" : `Registra ogni giorno chi c'era, dove ha lavorato e per quante ore: il costo manodopera finisce da solo nei lavori.`} />

      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 w-fit mb-4 max-w-full overflow-x-auto no-scrollbar">
        {TABS.map(({ key, label, icon: I }) => (
          <button key={key} onClick={() => switchTab(key)} className={`flex items-center gap-1.5 px-3 h-9 rounded-md text-sm whitespace-nowrap ${tab === key ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}>
            <I className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "giornaliera" && (
        <DailySheet
          date={date} setDate={setDate} records={records} employees={isOperaio ? employees.filter((e) => e.id === ctx.employeeId) : employees}
          worksites={worksites} siteLabel={siteLabel} readOnly={isOperaio} canSeeCosts={!isOperaio} onSaved={load} onDirtyChange={setDirty}
        />
      )}
      {tab === "calendario" && (
        <AttendanceCalendar month={month} setMonth={setMonth} records={records} employees={employees} today={iso(new Date())} onOpenDay={openDay} myEmpId={isOperaio ? ctx.employeeId : null} />
      )}
      {tab === "tabellone" && <MonthlyHours onOpenDay={isOperaio ? undefined : openDay} />}
    </div>
  );
}
