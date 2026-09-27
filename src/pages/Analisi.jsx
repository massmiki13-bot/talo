import React, { useState, useEffect } from "react";
import { base44, db } from "@/lib/db";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { BarChart3, FileWarning, FolderOpen, BellRing, TrendingUp, TrendingDown, Wallet, PieChart } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import { formatEuro } from "@/utils/pdfUtils";
import AnnualReport from "@/pages/AnnualReport";

const monthNames = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export default function Analisi() {
  const [quotes, setQuotes] = useState([]);
  const [empDocs, setEmpDocs] = useState([]);
  const [compDocs, setCompDocs] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [plMonth, setPlMonth] = useState(new Date().getMonth());
  const [plYear, setPlYear] = useState(new Date().getFullYear());
  const [tab, setTab] = useState(new URLSearchParams(window.location.search).get("tab") === "report" ? "report" : "analisi");

  useEffect(() => {
    loadAll();
    const entities = ["Reminder", "Quote", "CompanyDocument", "EmployeeDocument", "Employee", "WorksiteTransaction"];
    const unsubs = entities.map(e => db[e].subscribe(() => loadAll()));
    return () => { unsubs.forEach(u => { try { u && u(); } catch (_) {} }); };
  }, []);

  const loadAll = async () => {
    try {
      const [qs, ed, cd, rem, emps, txs] = await Promise.all([
        db.Quote.list(),
        db.EmployeeDocument.list(),
        db.CompanyDocument.list(),
        db.Reminder.list(),
        db.Employee.list(),
        db.WorksiteTransaction.list(),
      ]);
      setQuotes(qs);
      setEmpDocs(ed);
      setCompDocs(cd);
      setReminders(rem);
      setEmployees(emps);
      setTransactions(txs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Fatturato mensile (basato su preventivi approvati)
  const monthlyData = monthNames.map((m, idx) => {
    const monthQuotes = quotes.filter(q => {
      if (!q.data) return false;
      const d = new Date(q.data);
      return d.getFullYear() === year && d.getMonth() === idx && q.stato === "approvato";
    });
    const totale = monthQuotes.reduce((sum, q) => sum + (q.totale || 0), 0);
    const imponibile = monthQuotes.reduce((sum, q) => sum + (q.imponibile || 0), 0);
    return { month: m, fatturato: Math.round(totale), imponibile: Math.round(imponibile), count: monthQuotes.length };
  });

  const yearTotal = monthlyData.reduce((sum, d) => sum + d.fatturato, 0);
  const yearImponibile = monthlyData.reduce((sum, d) => sum + d.imponibile, 0);
  const availableYears = [...new Set(quotes.map(q => q.anno).filter(Boolean))].sort((a, b) => b - a);
  if (!availableYears.includes(year)) availableYears.unshift(year);

  // Scadenze
  const allDeadlines = [];
  empDocs.forEach(d => {
    if (d.data_scadenza) {
      const emp = employees.find(e => e.id === d.dipendente_id);
      allDeadlines.push({ date: d.data_scadenza, title: d.titolo, type: "Documento Dipendente", detail: emp ? `${emp.nome} ${emp.cognome}` : "" });
    }
  });
  compDocs.forEach(d => {
    if (d.data_scadenza) {
      allDeadlines.push({ date: d.data_scadenza, title: d.titolo, type: "Documento Ditta", detail: "" });
    }
  });
  reminders.forEach(r => {
    if (r.data && !r.completato) {
      allDeadlines.push({ date: r.data, title: r.titolo, type: r.tipo || "Promemoria", detail: r.descrizione || "" });
    }
  });

  // Calendar
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const isHoliday = (dateStr) => new Date(dateStr).getDay() === 0;
  const isSaturday = (dateStr) => new Date(dateStr).getDay() === 6;

  const getDeadlinesForDate = (dayNum) => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    return allDeadlines.filter(d => d.date === dateStr);
  };

  const navigateMonth = (delta) => {
    let m = calMonth + delta;
    let y = calYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCalMonth(m);
    setCalYear(y);
  };

  const typeIcons = {
    "Documento Dipendente": FileWarning,
    "Documento Ditta": FolderOpen,
    "Promemoria": BellRing,
    "scadenza_documento": FileWarning,
    "scadenza_contratto": FolderOpen,
    "appuntamento": BellRing,
    "altro": BellRing,
  };

  if (loading) return <LoadingSpinner />;

  // Monthly P&L
  const plMonthTransactions = transactions.filter(t => {
    if (!t.data) return false;
    const d = new Date(t.data);
    return d.getMonth() === plMonth && d.getFullYear() === plYear;
  });
  const plEntrate = plMonthTransactions.filter(t => t.tipo === "entrata").reduce((s, t) => s + (t.importo || 0), 0);
  const plUscite = plMonthTransactions.filter(t => t.tipo === "uscita").reduce((s, t) => s + (t.importo || 0), 0);
  const plMargine = plEntrate - plUscite;

  // Previous month for comparison
  const prevMonth = plMonth === 0 ? 11 : plMonth - 1;
  const prevYear = plMonth === 0 ? plYear - 1 : plYear;
  const prevMonthTransactions = transactions.filter(t => {
    if (!t.data) return false;
    const d = new Date(t.data);
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  });
  const prevEntrate = prevMonthTransactions.filter(t => t.tipo === "entrata").reduce((s, t) => s + (t.importo || 0), 0);
  const prevUscite = prevMonthTransactions.filter(t => t.tipo === "uscita").reduce((s, t) => s + (t.importo || 0), 0);
  const prevMargine = prevEntrate - prevUscite;

  const diffEntrate = plEntrate - prevEntrate;
  const diffUscite = plUscite - prevUscite;
  const diffMargine = plMargine - prevMargine;
  const pctEntrate = prevEntrate > 0 ? ((diffEntrate / prevEntrate) * 100) : 0;
  const pctUscite = prevUscite > 0 ? ((diffUscite / prevUscite) * 100) : 0;
  const pctMargine = prevMargine !== 0 ? ((diffMargine / Math.abs(prevMargine)) * 100) : 0;

  const navigatePlMonth = (delta) => {
    let m = plMonth + delta;
    let y = plYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setPlMonth(m);
    setPlYear(y);
  };

  return (
    <div>
      <PageHeader title="Analisi" subtitle="Fatturato, bilancio e scadenze riuniti" />

      <div className="bg-white rounded-xl border border-slate-200 p-1.5 inline-flex gap-1 shadow-sm mb-6">
        <button onClick={() => setTab("analisi")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "analisi" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
          <BarChart3 className="w-4 h-4" /> Analisi
        </button>
        <button onClick={() => setTab("report")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "report" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
          <PieChart className="w-4 h-4" /> Report Annuale
        </button>
      </div>

      {tab === "analisi" && (
      <>
      {/* Monthly P&L */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase">Questo Mese — Bilancio</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => navigatePlMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">←</button>
            <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center capitalize">
              {new Date(plYear, plMonth).toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
            </span>
            <button onClick={() => navigatePlMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">→</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-emerald-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-600">Entrate</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-700">{formatEuro(plEntrate)}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-600">Uscite</span>
              <TrendingDown className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-700">{formatEuro(plUscite)}</p>
          </div>
          <div className={`rounded-lg p-4 ${plMargine >= 0 ? "bg-emerald-100" : "bg-red-100"}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-600">Margine</span>
              <Wallet className={`w-4 h-4 ${plMargine >= 0 ? "text-emerald-600" : "text-red-600"}`} />
            </div>
            <p className={`text-2xl font-bold ${plMargine >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatEuro(plMargine)}</p>
            <p className={`text-xs mt-0.5 ${plMargine >= 0 ? "text-emerald-600" : "text-red-600"}`}>{plMargine >= 0 ? "Attivo" : "Passivo"}</p>
          </div>
        </div>

        {/* Period comparison */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase">Confronto con il mese precedente</h3>
            <span className="text-xs text-slate-400 capitalize">{new Date(prevYear, prevMonth).toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Entrate</p>
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-bold text-slate-700">{formatEuro(plEntrate)}</p>
                {prevEntrate > 0 && (
                  <span className={`text-xs font-medium ${diffEntrate >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {diffEntrate >= 0 ? "▲" : "▼"} {Math.abs(pctEntrate).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Prec: {formatEuro(prevEntrate)}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Uscite</p>
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-bold text-slate-700">{formatEuro(plUscite)}</p>
                {prevUscite > 0 && (
                  <span className={`text-xs font-medium ${diffUscite <= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {diffUscite <= 0 ? "▼" : "▲"} {Math.abs(pctUscite).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Prec: {formatEuro(prevUscite)}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Margine</p>
              <div className="flex items-baseline gap-2">
                <p className={`text-sm font-bold ${plMargine >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatEuro(plMargine)}</p>
                {prevMargine !== 0 && (
                  <span className={`text-xs font-medium ${diffMargine >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {diffMargine >= 0 ? "▲" : "▼"} {Math.abs(pctMargine).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Prec: {formatEuro(prevMargine)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Fatturato */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase">Preventivi Approvati — Mensile</h2>
          <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {yearTotal === 0 ? (
          <EmptyState icon={BarChart3} title="Nessun fatturato" description={`Nessun preventivo approvato nel ${year}`} />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={v => `€${v.toLocaleString("it-IT")}`} />
                <Tooltip formatter={v => `€ ${v.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`} contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0" }} />
                <Legend />
                <Bar dataKey="imponibile" fill="#93c5fd" name="Imponibile" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fatturato" fill="#2563eb" name="Fatturato" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-end gap-6 mt-4 text-sm">
              <div><span className="text-slate-500">Imponibile anno:</span> <span className="font-semibold">€ {yearImponibile.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span></div>
              <div><span className="text-slate-500">Fatturato anno:</span> <span className="font-bold text-blue-600">€ {yearTotal.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span></div>
            </div>
          </>
        )}
      </div>

      {/* Calendario Scadenze */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase">Calendario Scadenze</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">←</button>
            <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center capitalize">
              {new Date(calYear, calMonth).toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
            </span>
            <button onClick={() => navigateMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">→</button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300"></span>Festivo</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border border-slate-300"></span>Sabato/Domenica</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span>Scadenza</span>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
          ))}
          {Array.from({ length: startWeekday }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            const dayDeadlines = getDeadlinesForDate(dayNum);
            const hasDeadlines = dayDeadlines.length > 0;
            const holiday = isHoliday(dateStr);
            const saturday = isSaturday(dateStr);
            const bgClass = hasDeadlines ? "bg-amber-50 border-amber-300" : holiday ? "bg-red-50 border-red-200" : saturday ? "bg-slate-50 border-slate-200" : "bg-white border-slate-100";
            return (
              <div key={dayNum} className={`min-h-[80px] border rounded-lg p-1.5 ${bgClass}`}>
                <div className={`text-xs font-medium ${holiday ? "text-red-600" : saturday ? "text-slate-400" : "text-slate-700"}`}>
                  {dayNum}
                </div>
                {dayDeadlines.slice(0, 2).map((d, idx) => {
                  const Icon = typeIcons[d.type] || BellRing;
                  return (
                    <div key={idx} className="text-[10px] text-amber-700 bg-amber-100 rounded px-1 py-0.5 mt-1 truncate flex items-center gap-0.5" title={`${d.title} - ${d.type}${d.detail ? ` (${d.detail})` : ""}`}>
                      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">{d.title}</span>
                    </div>
                  );
                })}
                {dayDeadlines.length > 2 && <div className="text-[10px] text-amber-600 mt-0.5">+{dayDeadlines.length - 2}</div>}
              </div>
            );
          })}
        </div>

        {/* Upcoming deadlines list */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Prossime Scadenze</h3>
          {allDeadlines.length === 0 ? (
            <p className="text-sm text-slate-500">Nessuna scadenza registrata.</p>
          ) : (
            <div className="space-y-2">
              {allDeadlines
                .filter(d => new Date(d.date) >= new Date(new Date().toISOString().slice(0, 10)))
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .slice(0, 10)
                .map((d, idx) => {
                  const Icon = typeIcons[d.type] || BellRing;
                  const isOverdue = new Date(d.date) < new Date(new Date().toDateString());
                  return (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <Icon className={`w-4 h-4 ${isOverdue ? "text-red-500" : "text-amber-500"}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{d.title}</p>
                        <p className="text-xs text-slate-500">{d.type}{d.detail ? ` · ${d.detail}` : ""}</p>
                      </div>
                      <span className={`text-xs font-medium ${isOverdue ? "text-red-600" : "text-slate-600"}`}>
                        {new Date(d.date).toLocaleDateString("it-IT")}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
      </>
      )}
      {tab === "report" && <AnnualReport embedded />}
    </div>
  );
}