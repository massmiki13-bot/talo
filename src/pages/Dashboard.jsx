import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { getAccessContext } from "@/lib/accessScope";
import { ResponsiveContainer, AreaChart, Area, Line, XAxis, Tooltip, ComposedChart } from "recharts";
import {
  FileText, Receipt, ClipboardList, Upload, ArrowUpRight, AlertTriangle, Clock, Bell, HardHat, CheckCircle2, Users, FileWarning, Euro, ChevronRight,
  TrendingUp, TrendingDown, Target, Sparkles, Loader2, CalendarDays, Pencil, Check, X, Wallet, Timer,
} from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { fmtEur } from "@/lib/quotes";
import { computeDashboard, MESI } from "@/lib/dashboard";

const n = (v) => Number(v) || 0;
const eurShort = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n(v));
const RED = "#c3122a";
const KIND = {
  soldi: { icon: Euro, cls: "bg-brand-600 text-white" },
  cantiere: { icon: HardHat, cls: "bg-zinc-900 text-white" },
  documento: { icon: FileWarning, cls: "bg-brand-50 text-brand-700" },
  vendita: { icon: FileText, cls: "bg-zinc-100 text-zinc-700" },
};
const AGENDA_DOT = { promemoria: "bg-zinc-900", incasso: "bg-emerald-500", scadenza: "bg-brand-600", cantiere: "bg-amber-500" };

function greeting() {
  const h = new Date().getHours();
  return h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const ctx = getAccessContext();
  const isOperaio = !ctx.isHost && ctx.accessLevel === "operaio";

  const load = useCallback(async () => {
    const safe = (p) => p.catch(() => []);
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const [quotes, worksites, payments, invoices, transactions, attendance, employees, empDocs, compDocs, contracts, reminders, profile] = await Promise.all([
      safe(db.Quote.list("-data", 1000)), safe(db.Worksite.list()), safe(db.WorksitePayment.list("-data", 5000)), safe(db.Invoice.list("-data", 2000)),
      safe(db.WorksiteTransaction.list("-data", 5000)), safe(db.DailyAttendance.filter({ data: todayIso })), safe(db.Employee.list()), safe(db.EmployeeDocument.list()),
      safe(db.CompanyDocument.list()), safe(db.GeneratedContract.list()), safe(db.Reminder.filter({ completato: false }, "data", 300)), safe(db.CompanyProfile.list()),
    ]);
    setD({ quotes, worksites, payments, invoices, transactions, attendance, employees, empDocs, compDocs, contracts, reminders, profile: profile[0] || null });
  }, []);

  useEffect(() => {
    load();
    const unsubs = ["Reminder", "Quote", "Worksite", "WorksitePayment", "Invoice", "DailyAttendance"].map((e) => db[e].subscribe(() => load()));
    return () => unsubs.forEach((u) => { try { u && u(); } catch { /* ignore */ } });
  }, [load]);

  const v = useMemo(() => (d ? computeDashboard(d) : null), [d]);
  if (!d || !v) return <LoadingSpinner />;

  const firstName = (user?.full_name || user?.email || "").split(/[\s@]/)[0];
  const dateLabel = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (isOperaio) return <OperaioHome name={firstName} dateLabel={dateLabel} employeeId={ctx.employeeId} />;
  const urgent = v.alerts.filter((a) => a.sev >= 3).length;

  return (
    <div className="space-y-5">
      {/* ───── Apertura ───── */}
      <section className="relative overflow-hidden rounded-3xl brushed text-white">
        <div className="absolute -right-24 -top-28 w-[460px] h-[460px] rounded-full blur-3xl opacity-25 pointer-events-none" style={{ backgroundImage: "var(--metal-red-soft)" }} />
        <div className="relative p-6 sm:p-8 grid xl:grid-cols-[1fr_auto] gap-8 items-end">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400">{dateLabel}</p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold uppercase leading-[0.95] mt-3">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
            <p className="text-zinc-400 mt-3 text-[15px]">
              {d.profile?.ragione_sociale ? `${d.profile.ragione_sociale} · ` : ""}
              {urgent ? <span className="text-white font-medium">{urgent} {urgent === 1 ? "urgenza" : "urgenze"} da gestire</span> : v.alerts.length ? `${v.alerts.length} cose da tenere d'occhio` : "tutto sotto controllo"}
            </p>
            <div className="flex flex-wrap gap-2 mt-6">
              <Quick to="/preventivi/nuovo" icon={FileText} label="Nuovo preventivo" primary />
              <Quick to="/fatture" icon={Receipt} label="Fatture" />
              <Quick to="/presenze" icon={ClipboardList} label="Giornaliera" />
              <Quick to="/documenti-ditta" icon={Upload} label="Carica documenti" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px rounded-2xl overflow-hidden bg-white/[0.08] border border-white/[0.08] xl:w-[560px]">
            <HeroStat label="Incassato nel mese" value={eurShort(v.incassatoMese)} delta={v.deltaMese} to="/analisi" />
            <HeroStat label="Da incassare" value={eurShort(v.daIncassare)} sub={v.scaduto ? `di cui ${eurShort(v.scaduto)} scaduti` : "nessuna rata scaduta"} subWarn={v.scaduto > 0} to="/lavori" />
            <HeroStat label="Preventivi aperti" value={eurShort(v.pipeline)} sub={`${v.pending.length} in attesa di risposta`} to="/preventivi" />
          </div>
        </div>
      </section>

      {/* ───── Tre indicatori di governo ───── */}
      <div className="grid lg:grid-cols-3 gap-5">
        <GoalCard profile={d.profile} value={v.fatturatoAnno} source={v.fonteFatturato} canEdit={ctx.isHost} onSaved={load} />
        <ForecastCard forecast={v.forecast} />
        <CrewCard p={v.presence} />
      </div>

      {/* ───── Agenda della settimana ───── */}
      <Agenda days={v.agenda} />

      <div className="grid xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <Card title="Incassi degli ultimi 12 mesi" action={<Link to="/analisi" className="text-sm text-zinc-500 hover:text-brand-700 inline-flex items-center gap-1">Analisi <ArrowUpRight className="w-4 h-4" /></Link>}>
            <div className="flex items-baseline gap-3 -mt-1">
              <p className="font-display text-3xl font-bold text-zinc-950 tabular-nums">{eurShort(v.trend.reduce((s, t) => s + t.incassi, 0))}</p>
              <span className="text-xs text-zinc-500">anno prima: {eurShort(v.trend.reduce((s, t) => s + t.annoPrima, 0))}</span>
            </div>
            <div className="h-[190px] mt-3 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={v.trend} margin={{ left: 4, right: 4, top: 8 }}>
                  <defs>
                    <linearGradient id="dashRed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={RED} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={RED} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip />} cursor={{ stroke: "#e4e4e7" }} />
                  <Area type="monotone" dataKey="incassi" name="Incassi" stroke={RED} strokeWidth={2.5} fill="url(#dashRed)" dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="annoPrima" name="Anno prima" stroke="#a1a1aa" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Lavori in corso" action={<Link to="/lavori" className="text-xs text-zinc-500 hover:text-brand-700 inline-flex items-center gap-0.5">Tutti <ChevronRight className="w-3.5 h-3.5" /></Link>}>
            {v.running.length === 0 ? <Empty text="Nessun lavoro in corso." /> : (
              <ul className="divide-y divide-zinc-100 -my-2">
                {v.running.slice(0, 6).map((w) => (
                  <li key={w.id}>
                    <Link to={`/lavori/${w.id}`} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_180px_110px] items-center gap-x-4 gap-y-2 py-3 group">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate group-hover:text-brand-700">{w.nome}</p>
                        <p className="text-xs text-zinc-500 truncate">
                          {w.cliente_nome || "—"}
                          {w.inRitardo ? <span className="text-brand-700 font-medium"> · in ritardo</span> : w.indietro ? <span className="text-amber-700 font-medium"> · indietro sui tempi</span> : w.data_fine_prevista ? ` · fine ${new Date(w.data_fine_prevista).toLocaleDateString("it-IT")}` : ""}
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-1 order-last sm:order-none">
                        <div className="relative h-2 rounded-full bg-zinc-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, n(w.avanzamento))}%`, backgroundImage: "var(--metal-red)" }} />
                          {w.atteso != null && <span className="absolute top-0 bottom-0 w-0.5 bg-zinc-900" style={{ left: `${w.atteso}%` }} title="Dove dovrebbe essere oggi" />}
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1 tabular-nums">{Math.round(n(w.avanzamento))}% fatto{w.atteso != null ? ` · atteso ${Math.round(w.atteso)}%` : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-zinc-900">{eurShort(w.totale)}</p>
                        <p className="text-[11px] text-zinc-500 tabular-nums">{w.totale ? `${Math.round((w.incassato / w.totale) * 100)}% incassato` : "—"}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Briefing v={v} profile={d.profile} />

          <Card title={<span className="flex items-center gap-2">Richiede attenzione {v.alerts.length ? <Badge n={v.alerts.length} /> : null}</span>}>
            {v.alerts.length === 0 ? (
              <div className="py-6 text-center"><CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" /><p className="text-sm text-zinc-600 mt-2">Nessuna urgenza. Ottimo lavoro.</p></div>
            ) : (
              <ul className="space-y-0.5 -mx-2">
                {v.alerts.slice(0, 7).map((a, i) => {
                  const k = KIND[a.kind] || KIND.vendita;
                  return (
                    <li key={i}>
                      <Link to={a.to} className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-zinc-50">
                        <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${k.cls}`}><k.icon className="w-4 h-4" /></span>
                        <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-zinc-900 leading-snug">{a.text}</span><span className="block text-xs text-zinc-500 mt-0.5">{a.meta}</span></span>
                        <ChevronRight className="w-4 h-4 text-zinc-300 mt-2 shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {v.alerts.length > 7 && <p className="text-xs text-zinc-500 mt-2">e altre {v.alerts.length - 7}</p>}
          </Card>

          <Card title="Preventivi · ultimi 90 giorni" action={<Link to="/preventivi" className="text-xs text-zinc-500 hover:text-brand-700 inline-flex items-center gap-0.5">Tutti <ChevronRight className="w-3.5 h-3.5" /></Link>}>
            <Funnel steps={v.funnel} />
            {v.pending.length > 0 && (
              <ul className="mt-4 pt-3 border-t border-zinc-100 space-y-1 -mx-2">
                {v.pending.slice(0, 4).map((q) => (
                  <li key={q.id}>
                    <Link to={`/preventivi/${q.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-50">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${q.stato === "visto" ? "bg-emerald-500" : "bg-zinc-300"}`} />
                      <span className="flex-1 min-w-0 text-sm text-zinc-800 truncate">{q.cliente_nome || "—"}{q.stato === "visto" ? <span className="text-xs text-emerald-700"> · aperto</span> : null}</span>
                      <span className="text-sm tabular-nums text-zinc-900">{eurShort(q.imponibile || q.totale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Componenti ───────────── */

function Card({ title, action, children, className = "" }) {
  return (
    <section className={`bg-white rounded-2xl border border-zinc-200 p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-sm font-semibold text-zinc-900">{title}</h2>{action}</div>
      {children}
    </section>
  );
}
const Empty = ({ text }) => <p className="text-sm text-zinc-500 py-6 text-center">{text}</p>;
const Badge = ({ n: count }) => <span className="text-[11px] font-semibold text-white rounded-full px-1.5 min-w-[20px] text-center" style={{ backgroundImage: "var(--metal-red)" }}>{count}</span>;

function Quick({ to, icon: I, label, primary }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition ${primary ? "bg-brand-600 text-white" : "bg-white/[0.07] text-zinc-100 border border-white/[0.1] hover:bg-white/[0.12]"}`}>
      <I className="w-4 h-4" /> {label}
    </Link>
  );
}

function HeroStat({ label, value, sub, subWarn, delta, to }) {
  const up = delta != null && delta >= 0;
  return (
    <Link to={to} className="bg-ink-900/60 hover:bg-ink-800/80 transition-colors p-4 sm:p-5 flex items-center justify-between gap-3 sm:block">
      <div>
        <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400 leading-tight">{label}</p>
        <p className="font-display text-2xl sm:text-3xl font-bold tabular-nums sm:mt-2 whitespace-nowrap sm:hidden">{value}</p>
      </div>
      <div className="text-right sm:text-left">
        <p className="font-display text-3xl font-bold tabular-nums mt-2 whitespace-nowrap hidden sm:block">{value}</p>
        {delta != null ? (
          <p className={`text-xs mt-0.5 inline-flex items-center gap-1 ${up ? "text-emerald-400" : "text-brand-400"}`}>{up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}{up ? "+" : ""}{Math.round(delta)}% sul mese scorso</p>
        ) : sub ? <p className={`text-xs mt-0.5 ${subWarn ? "text-brand-400" : "text-zinc-500"}`}>{sub}</p> : <p className="text-xs mt-0.5 text-zinc-500">primo mese di dati</p>}
      </div>
    </Link>
  );
}

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => <p key={p.dataKey} className="flex justify-between gap-4"><span className="text-zinc-500">{p.name}</span><span className="tabular-nums font-medium">{fmtEur(p.value)}</span></p>)}
    </div>
  );
}

// Obiettivo di fatturato dell'anno, con anello di avanzamento e ritmo necessario.
function GoalCard({ profile, value, source, canEdit, onSaved }) {
  const goal = n(profile?.obiettivo_fatturato);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  const now = new Date();
  const dayOfYear = Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / 86_400_000);
  const expectedPct = (dayOfYear / 365) * 100;
  const monthsLeft = 12 - now.getMonth();
  const save = async () => {
    if (!profile?.id) return;
    await db.CompanyProfile.update(profile.id, { obiettivo_fatturato: Number(String(draft).replace(/\./g, "").replace(",", ".")) || 0 });
    setEdit(false); onSaved();
  };
  const R = 44, C = 2 * Math.PI * R;
  return (
    <Card title={<span className="flex items-center gap-2"><Target className="w-4 h-4 text-brand-600" />Obiettivo {now.getFullYear()}</span>}
      action={canEdit && !edit ? <button onClick={() => { setDraft(goal ? String(goal) : ""); setEdit(true); }} className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100" aria-label="Imposta obiettivo"><Pencil className="w-4 h-4" /></button> : null}>
      {edit ? (
        <div className="flex items-center gap-2">
          <input autoFocus inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="es. 600000" className="flex-1 h-10 rounded-lg border border-zinc-300 px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500" aria-label="Obiettivo di fatturato in euro" />
          <button onClick={save} className="h-10 w-10 grid place-items-center rounded-lg bg-brand-600 text-white" aria-label="Salva"><Check className="w-4 h-4" /></button>
          <button onClick={() => setEdit(false)} className="h-10 w-10 grid place-items-center rounded-lg border border-zinc-200 text-zinc-500" aria-label="Annulla"><X className="w-4 h-4" /></button>
        </div>
      ) : !goal ? (
        <div className="text-sm text-zinc-600">
          <p className="font-display text-3xl font-bold text-zinc-950 tabular-nums">{eurShort(value)}</p>
          <p className="mt-1">fatturato finora ({source}).</p>
          {canEdit && <button onClick={() => { setDraft(""); setEdit(true); }} className="mt-3 text-sm font-medium text-brand-700 hover:underline">Imposta un obiettivo annuale →</button>}
        </div>
      ) : (
        <div className="flex items-center gap-5">
          <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0 -rotate-90" aria-hidden="true">
            <defs><linearGradient id="goalRed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f5606e" /><stop offset="1" stopColor="#a10d23" /></linearGradient></defs>
            <circle cx="56" cy="56" r={R} fill="none" stroke="#f4f4f5" strokeWidth="11" />
            <circle cx="56" cy="56" r={R} fill="none" stroke="url(#goalRed)" strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
            <line x1={56 + (R - 9) * Math.cos((expectedPct / 100) * 2 * Math.PI)} y1={56 + (R - 9) * Math.sin((expectedPct / 100) * 2 * Math.PI)} x2={56 + (R + 9) * Math.cos((expectedPct / 100) * 2 * Math.PI)} y2={56 + (R + 9) * Math.sin((expectedPct / 100) * 2 * Math.PI)} stroke="#18181b" strokeWidth="2.5" />
          </svg>
          <div className="min-w-0">
            <p className="font-display text-4xl font-bold text-zinc-950 tabular-nums leading-none">{Math.round(pct)}%</p>
            <p className="text-sm text-zinc-600 mt-1.5 tabular-nums">{eurShort(value)} di {eurShort(goal)}</p>
            <p className={`text-xs mt-1.5 ${pct >= expectedPct ? "text-emerald-700" : "text-brand-700"}`}>
              {pct >= expectedPct ? "In linea con l'anno" : `Servono ${eurShort((goal - value) / Math.max(1, monthsLeft))} al mese`}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1"><span className="w-3 h-0.5 bg-zinc-900 inline-block" />dove dovresti essere oggi ({Math.round(expectedPct)}%)</p>
          </div>
        </div>
      )}
    </Card>
  );
}

function ForecastCard({ forecast }) {
  const max = Math.max(1, ...forecast.map((f) => f.value));
  const total = forecast.slice(1).reduce((s, f) => s + f.value, 0);
  return (
    <Card title={<span className="flex items-center gap-2"><Wallet className="w-4 h-4 text-brand-600" />Previsione di cassa</span>}>
      <p className="font-display text-3xl font-bold text-zinc-950 tabular-nums -mt-1">{eurShort(total)}</p>
      <p className="text-xs text-zinc-500">in arrivo nei prossimi 90 giorni da rate e fatture</p>
      <ul className="mt-4 space-y-2.5">
        {forecast.map((f) => (
          <li key={f.label} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-xs">
            <span className={f.late ? "text-brand-700 font-medium" : "text-zinc-600"}>{f.label}</span>
            <span className="h-2 rounded-full bg-zinc-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(f.value / max) * 100}%`, background: f.late ? "var(--metal-red)" : "#27272a" }} /></span>
            <span className="tabular-nums font-medium text-zinc-900 w-20 text-right">{eurShort(f.value)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CrewCard({ p }) {
  const sites = Object.entries(p.bySite);
  return (
    <Card title={<span className="flex items-center gap-2"><HardHat className="w-4 h-4 text-brand-600" />In cantiere oggi</span>}
      action={<Link to="/presenze" className="text-xs text-zinc-500 hover:text-brand-700 inline-flex items-center gap-0.5">Giornaliera <ChevronRight className="w-3.5 h-3.5" /></Link>}>
      {!p.working ? <Empty text="Oggi è festivo." /> : (
        <>
          <div className="flex items-baseline gap-2 -mt-1">
            <p className="font-display text-3xl font-bold text-zinc-950 tabular-nums">{p.present.length}<span className="text-zinc-400">/{p.expected}</span></p>
            <p className="text-xs text-zinc-500">presenti{p.absent.length ? ` · ${p.absent.length} assenti` : ""}</p>
          </div>
          {p.registered < p.expected && <p className="text-xs text-brand-700 font-medium mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{p.expected - p.registered} ancora da registrare</p>}
          {sites.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {sites.slice(0, 4).map(([site, names]) => (
                <li key={site}>
                  <p className="text-xs font-medium text-zinc-800 truncate">{site}</p>
                  <div className="flex -space-x-1.5 mt-1">
                    {names.slice(0, 8).map((nm) => <span key={nm} title={nm} className="w-7 h-7 rounded-full bg-zinc-900 text-white text-[10px] font-semibold grid place-items-center ring-2 ring-white">{nm.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>)}
                    {names.length > 8 && <span className="w-7 h-7 rounded-full bg-zinc-200 text-zinc-700 text-[10px] font-semibold grid place-items-center ring-2 ring-white">+{names.length - 8}</span>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-zinc-500 mt-3">Nessuna presenza registrata per ora.</p>}
        </>
      )}
    </Card>
  );
}

function Agenda({ days }) {
  const total = days.reduce((s, x) => s + x.items.length, 0);
  return (
    <section className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-brand-600" />Prossimi 7 giorni<span className="text-xs font-normal text-zinc-500">{total} impegni</span></h2>
        <div className="hidden md:flex items-center gap-3 text-[11px] text-zinc-500">
          {[["promemoria", "Promemoria"], ["incasso", "Incassi attesi"], ["scadenza", "Scadenze"], ["cantiere", "Fine lavori"]].map(([k, l]) => <span key={k} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${AGENDA_DOT[k]}`} />{l}</span>)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {days.map(({ day, items, holiday }, i) => {
          const dt = new Date(day);
          return (
            <div key={day} className={`rounded-xl border p-2.5 sm:min-h-[110px] ${i === 0 ? "border-zinc-900 bg-zinc-950 text-white" : holiday ? "border-zinc-200 bg-zinc-50" : "border-zinc-200"}`}>
              <div className="flex items-baseline gap-1.5 sm:block">
                <p className={`text-[10px] uppercase tracking-[0.14em] ${i === 0 ? "text-brand-400" : "text-zinc-500"}`}>{i === 0 ? "Oggi" : dt.toLocaleDateString("it-IT", { weekday: "short" })}</p>
                <p className="font-display text-2xl font-bold leading-none sm:mt-1">{dt.getDate()} <span className={`text-xs font-sans font-normal ${i === 0 ? "text-zinc-400" : "text-zinc-500"}`}>{MESI[dt.getMonth()]}</span></p>
              </div>
              <ul className="mt-2 space-y-1">
                {items.slice(0, 3).map((it, k) => (
                  <li key={k}>
                    <Link to={it.to} className={`flex items-start gap-1.5 text-[11.5px] leading-snug rounded px-1 -mx-1 ${i === 0 ? "hover:bg-white/10" : "hover:bg-zinc-50"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${AGENDA_DOT[it.kind]}`} />
                      <span className="line-clamp-2">{it.time ? `${it.time} ` : ""}{it.text}</span>
                    </Link>
                  </li>
                ))}
                {items.length > 3 && <li className={`text-[11px] ${i === 0 ? "text-zinc-400" : "text-zinc-500"}`}>+{items.length - 3} altri</li>}
                {items.length === 0 && <li className={`text-[11px] ${i === 0 ? "text-zinc-500" : "text-zinc-400"}`}>—</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Funnel({ steps }) {
  const max = Math.max(1, steps[0].count);
  const conv = steps[0].count ? Math.round((steps[2].count / steps[0].count) * 100) : null;
  return (
    <div>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={s.label}>
            <div className="flex justify-between text-xs mb-1"><span className="text-zinc-600">{s.label}</span><span className="tabular-nums font-medium text-zinc-900">{s.count}{s.value ? ` · ${eurShort(s.value)}` : ""}</span></div>
            <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, background: i === 2 ? "var(--metal-red)" : i === 1 ? "#52525b" : "#18181b" }} /></div>
          </div>
        ))}
      </div>
      {conv != null && <p className="text-xs text-zinc-500 mt-3">Tasso di accettazione: <b className="text-zinc-900">{conv}%</b></p>}
    </div>
  );
}

// Briefing del giorno: l'IA mette in fila le priorità con i dati della dashboard.
function Briefing({ v, profile }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const facts = {
        oggi: v.today, incassato_mese: Math.round(v.incassatoMese), variazione_mese_pct: v.deltaMese && Math.round(v.deltaMese),
        da_incassare: Math.round(v.daIncassare), scaduto: Math.round(v.scaduto), previsione_cassa: v.forecast.map((f) => ({ periodo: f.label, euro: Math.round(f.value) })),
        presenze: { presenti: v.presence.present.length, attesi: v.presence.expected, registrati: v.presence.registered },
        urgenze: v.alerts.slice(0, 12).map((a) => `${a.text} (${a.meta})`),
        lavori: v.running.slice(0, 8).map((w) => ({ nome: w.nome, avanzamento: n(w.avanzamento), atteso: w.atteso && Math.round(w.atteso), in_ritardo: w.inRitardo })),
        preventivi_aperti: v.pending.length, agenda_settimana: v.agenda.map((x) => ({ giorno: x.day, impegni: x.items.map((i) => i.text) })),
      };
      const r = await api.integrations.Core.InvokeLLM({
        prompt: `Sei l'assistente del titolare di ${profile?.ragione_sociale || "un'impresa edile"}. Scrivi il briefing di oggi: una frase d'apertura e al massimo 4 priorità concrete in ordine di importanza (soldi da incassare, cantieri in ritardo, scadenze, clienti da richiamare). Frasi brevi, italiano semplice, cita nomi e cifre. Non inventare nulla.
DATI: ${JSON.stringify(facts)}`,
        response_json_schema: { type: "object", properties: { apertura: { type: "string" }, priorita: { type: "array", items: { type: "string" } } }, required: ["apertura", "priorita"] },
      });
      setRes(r);
    } catch (e) {
      setRes({ errore: e.message || "L'IA non ha risposto, riprova tra poco." });
    } finally { setBusy(false); }
  };
  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-800 metal-ink text-white p-5">
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full blur-2xl opacity-30 pointer-events-none" style={{ backgroundImage: "var(--metal-red-soft)" }} />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand-400" />Briefing del giorno</h2>
          <button onClick={run} disabled={busy} className="text-xs font-semibold h-8 px-3 rounded-lg bg-brand-600 text-white disabled:opacity-60 inline-flex items-center gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Timer className="w-3.5 h-3.5" />}{res ? "Aggiorna" : "Prepara"}
          </button>
        </div>
        {!res ? (
          <p className="text-sm text-zinc-400 mt-3">L'IA legge incassi, cantieri, scadenze e agenda e ti dice da dove partire oggi.</p>
        ) : res.errore ? (
          <p className="text-sm text-brand-300 mt-3">{res.errore}</p>
        ) : (
          <div className="mt-3">
            <p className="text-[15px] font-medium leading-snug">{res.apertura}</p>
            <ol className="mt-3 space-y-2">
              {(res.priorita || []).map((p, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-zinc-300 leading-snug">
                  <span className="shrink-0 w-5 h-5 rounded-full text-[11px] font-bold grid place-items-center text-white" style={{ backgroundImage: "var(--metal-red)" }}>{i + 1}</span>{p}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

function OperaioHome({ name, dateLabel, employeeId }) {
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl brushed text-white p-6 sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400">{dateLabel}</p>
        <h1 className="font-display text-4xl font-bold uppercase mt-3">{greeting()}{name ? `, ${name}` : ""}</h1>
        <p className="text-zinc-400 mt-2">Qui trovi le tue presenze, i tuoi documenti e le scadenze dei corsi.</p>
      </section>
      <div className="grid sm:grid-cols-2 gap-3">
        {[["/presenze", ClipboardList, "Le mie presenze", "Ore registrate e calendario"], [`/dipendenti/${employeeId}`, Users, "Il mio profilo", "Documenti, corsi e visite mediche"]].map(([to, I, t, s]) => (
          <Link key={to} to={to} className="group bg-white rounded-2xl border border-zinc-200 p-5 hover:border-zinc-300 transition flex items-center gap-4">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-zinc-950 text-white"><I className="w-5 h-5" /></span>
            <span className="flex-1"><span className="block font-semibold text-zinc-900">{t}</span><span className="block text-sm text-zinc-500">{s}</span></span>
            <ArrowUpRight className="w-5 h-5 text-zinc-300 group-hover:text-brand-600" />
          </Link>
        ))}
      </div>
    </div>
  );
}
