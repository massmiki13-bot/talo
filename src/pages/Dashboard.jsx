import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { getAccessContext } from "@/lib/accessScope";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from "recharts";
import {
  FileText, Receipt, ClipboardList, Upload, ArrowUpRight, AlertTriangle, Clock, Bell, HardHat, CheckCircle2, Users, FileWarning, Euro, ChevronRight,
} from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { fmtEur, OPEN_STATES, effectiveState, expiryDate } from "@/lib/quotes";
import { installments } from "@/lib/worksites";
import { computeInvoice } from "@/lib/invoices";
import { dayEntries, employedOn, isWorkingDay } from "@/lib/attendance";

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const iso = (d) => d.toISOString().slice(0, 10);
const n = (v) => Number(v) || 0;
const eurShort = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n(v));

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
    const [quotes, worksites, payments, invoices, attendance, employees, empDocs, compDocs, contracts, reminders, profile] = await Promise.all([
      safe(db.Quote.list("-data", 1000)), safe(db.Worksite.list()), safe(db.WorksitePayment.list("-data", 5000)), safe(db.Invoice.list("-data", 2000)),
      safe(db.DailyAttendance.filter({ data: iso(new Date()) })), safe(db.Employee.list()), safe(db.EmployeeDocument.list()), safe(db.CompanyDocument.list()),
      safe(db.GeneratedContract.list()), safe(db.Reminder.filter({ completato: false }, "data", 200)), safe(db.CompanyProfile.list()),
    ]);
    setD({ quotes, worksites, payments, invoices, attendance, employees, empDocs, compDocs, contracts, reminders, profile: profile[0] });
  }, []);

  useEffect(() => {
    load();
    const unsubs = ["Reminder", "Quote", "Worksite", "WorksitePayment", "Invoice", "DailyAttendance"].map((e) => db[e].subscribe(() => load()));
    return () => unsubs.forEach((u) => { try { u && u(); } catch { /* ignore */ } });
  }, [load]);

  const v = useMemo(() => {
    if (!d) return null;
    const today = iso(new Date());
    const now = new Date();
    const monthKey = today.slice(0, 7);
    const in30 = iso(new Date(Date.now() + 30 * 86_400_000));

    const incassatoMese = d.payments.filter((p) => String(p.data).startsWith(monthKey)).reduce((s, p) => s + n(p.importo), 0);
    const trend = Array.from({ length: 6 }, (_, i) => {
      const dt = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      return { label: MESI[dt.getMonth()], incassi: d.payments.filter((p) => String(p.data).startsWith(k)).reduce((s, p) => s + n(p.importo), 0) };
    });

    const jobs = d.worksites.map((w) => {
      const pays = d.payments.filter((p) => p.worksite_id === w.id);
      const incassato = pays.reduce((s, p) => s + n(p.importo), 0);
      const totale = n(w.importo_totale);
      const rate = installments(w.piano_pagamenti || [], pays);
      return { ...w, incassato, daIncassare: Math.max(0, totale - incassato), scadute: rate.filter((r) => r.residuo > 0.005 && r.scadenza && r.scadenza < today) };
    });
    const running = jobs.filter((w) => w.stato === "in_corso").sort((a, b) => n(b.avanzamento) - n(a.avanzamento));
    const daIncassare = jobs.reduce((s, w) => s + w.daIncassare, 0);

    // Oggi in cantiere
    const entries = dayEntries(d.attendance, today);
    const expected = d.employees.filter((e) => employedOn(e, today)).length;
    const present = Object.values(entries).filter((e) => e.stato === "presente").length;
    const registered = Object.keys(entries).length;

    // Cose da fare, in ordine di urgenza
    const alerts = [];
    for (const w of jobs) for (const r of w.scadute) alerts.push({ sev: 3, icon: Euro, text: `${w.cliente_nome || w.nome}: rata "${r.descrizione || "rata"}" non pagata`, meta: `${fmtEur(r.residuo)} · scaduta il ${new Date(r.scadenza).toLocaleDateString("it-IT")}`, to: `/lavori/${w.id}` });
    for (const i of d.invoices) {
      if (i.stato === "pagata" || i.stato === "bozza" || !i.scadenza || i.scadenza >= today || i.tipo_documento === "TD04") continue;
      alerts.push({ sev: 3, icon: Receipt, text: `Fattura ${i.numero} a ${i.cliente_nome || "cliente"} scaduta`, meta: `${fmtEur(computeInvoice(i).daPagare)} · dal ${new Date(i.scadenza).toLocaleDateString("it-IT")}`, to: `/fatture?id=${i.id}` });
    }
    const docs = [
      ...d.empDocs.map((x) => ({ ...x, _to: x.dipendente_id ? `/dipendenti/${x.dipendente_id}` : "/dipendenti" })),
      ...d.compDocs.map((x) => ({ ...x, _to: `/documenti-ditta?doc=${x.id}` })),
      ...d.contracts.filter((x) => !["concluso", "annullato"].includes(x.stato)).map((x) => ({ ...x, _to: `/contratti?id=${x.id}` })),
    ].filter((x) => x.data_scadenza && x.data_scadenza <= in30);
    for (const x of docs) {
      const late = x.data_scadenza < today;
      alerts.push({ sev: late ? 2 : 1, icon: FileWarning, text: `${x.titolo || "Documento"} ${late ? "scaduto" : "in scadenza"}`, meta: new Date(x.data_scadenza).toLocaleDateString("it-IT"), to: x._to });
    }
    for (const q of d.quotes) {
      const st = effectiveState(q);
      if (st === "visto") alerts.push({ sev: 1, icon: FileText, text: `${q.cliente_nome || "Il cliente"} ha aperto il preventivo ${q.numero}`, meta: "buon momento per chiamarlo", to: `/preventivi/${q.id}` });
      else if (OPEN_STATES.includes(q.stato)) { const exp = expiryDate(q); if (exp && iso(exp) <= iso(new Date(Date.now() + 7 * 86_400_000))) alerts.push({ sev: 1, icon: Clock, text: `Preventivo ${q.numero} (${q.cliente_nome || "—"}) scade presto`, meta: exp.toLocaleDateString("it-IT"), to: `/preventivi/${q.id}` }); }
    }
    alerts.sort((a, b) => b.sev - a.sev);

    const pending = d.quotes.filter((q) => OPEN_STATES.includes(q.stato) && effectiveState(q) !== "scaduto");
    const todayRem = d.reminders.filter((r) => !r.is_preavviso && r.data <= today);
    return {
      incassatoMese, trend, daIncassare, running, alerts, pending, todayRem,
      pipeline: pending.reduce((s, q) => s + n(q.imponibile || q.totale), 0),
      presence: { present, registered, expected, working: isWorkingDay(today) },
      nextRem: d.reminders.filter((r) => !r.is_preavviso && r.data > today).slice(0, 4),
    };
  }, [d]);

  if (!d || !v) return <LoadingSpinner />;
  const firstName = (user?.full_name || user?.user_metadata?.full_name || user?.email || "").split(/[\s@]/)[0];
  const dateLabel = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  if (isOperaio) return <OperaioHome name={firstName} dateLabel={dateLabel} employeeId={ctx.employeeId} />;

  return (
    <div className="space-y-5">
      {/* Apertura */}
      <section className="relative overflow-hidden rounded-3xl brushed text-white p-6 sm:p-8">
        <div className="absolute -right-20 -top-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-25 pointer-events-none" style={{ backgroundImage: "var(--metal-red-soft)" }} />
        <div className="relative flex flex-col xl:flex-row xl:items-end gap-8">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400 capitalize">{dateLabel}</p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold uppercase leading-[0.95] mt-3">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
            <p className="text-zinc-400 mt-3 text-[15px]">{d.profile?.ragione_sociale ? `${d.profile.ragione_sociale} · ` : ""}{v.alerts.length ? `${v.alerts.length} ${v.alerts.length === 1 ? "cosa richiede" : "cose richiedono"} la tua attenzione` : "tutto sotto controllo"}</p>
            <div className="flex flex-wrap gap-2 mt-6">
              <Quick to="/preventivi/nuovo" icon={FileText} label="Nuovo preventivo" primary />
              <Quick to="/fatture" icon={Receipt} label="Fatture" />
              <Quick to="/presenze" icon={ClipboardList} label="Giornaliera di oggi" />
              <Quick to="/documenti-ditta" icon={Upload} label="Carica documenti" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px rounded-2xl overflow-hidden bg-white/[0.08] border border-white/[0.08] xl:w-[520px] shrink-0">
            <HeroStat label="Incassato questo mese" value={eurShort(v.incassatoMese)} to="/analisi" />
            <HeroStat label="Da incassare" value={eurShort(v.daIncassare)} to="/lavori" />
            <HeroStat label="Preventivi in attesa" value={eurShort(v.pipeline)} sub={`${v.pending.length} aperti`} to="/preventivi" />
          </div>
        </div>
      </section>

      <div className="grid xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          {/* Oggi */}
          <div className="grid sm:grid-cols-3 gap-3">
            <TodayCard to="/presenze" icon={HardHat} title="In cantiere oggi"
              value={v.presence.working ? `${v.presence.present}/${v.presence.expected}` : "—"}
              note={!v.presence.working ? "Giorno festivo" : v.presence.registered < v.presence.expected ? `${v.presence.expected - v.presence.registered} da registrare` : "Giornaliera completa"}
              warn={v.presence.working && v.presence.registered < v.presence.expected} />
            <TodayCard to="/promemoria" icon={Bell} title="Promemoria di oggi" value={v.todayRem.length} note={v.todayRem[0]?.titolo || "Niente in agenda"} warn={v.todayRem.some((r) => r.data < iso(new Date()))} />
            <TodayCard to="/lavori" icon={CheckCircle2} title="Lavori in corso" value={v.running.length} note={v.running[0] ? `${v.running[0].nome} al ${Math.round(n(v.running[0].avanzamento))}%` : "Nessun lavoro aperto"} />
          </div>

          {/* Andamento incassi */}
          <section className="bg-white rounded-2xl border border-zinc-200 p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Incassi degli ultimi 6 mesi</h2>
                <p className="font-display text-3xl font-bold text-zinc-950 mt-1 tabular-nums">{eurShort(v.trend.reduce((s, t) => s + t.incassi, 0))}</p>
              </div>
              <Link to="/analisi" className="text-sm text-brand-700 hover:underline inline-flex items-center gap-1">Analisi completa <ArrowUpRight className="w-4 h-4" /></Link>
            </div>
            <div className="h-[170px] mt-3 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={v.trend} margin={{ left: 4, right: 4, top: 6 }}>
                  <defs>
                    <linearGradient id="dashRed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c3122a" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#c3122a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(x) => [fmtEur(x), "Incassi"]} contentStyle={{ borderRadius: 10, border: "1px solid #e4e4e7", fontSize: 12 }} />
                  <Area type="monotone" dataKey="incassi" stroke="#c3122a" strokeWidth={2.5} fill="url(#dashRed)" dot={{ r: 3, fill: "#c3122a", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Lavori in corso */}
          <section className="bg-white rounded-2xl border border-zinc-200 p-5">
            <Head title="Lavori in corso" to="/lavori" />
            {v.running.length === 0 ? <Empty text="Nessun lavoro in corso." /> : (
              <ul className="divide-y divide-zinc-100 -my-1">
                {v.running.slice(0, 6).map((w) => (
                  <li key={w.id}>
                    <Link to={`/lavori/${w.id}`} className="flex items-center gap-4 py-3 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate group-hover:text-brand-700">{w.nome}</p>
                        <p className="text-xs text-zinc-500 truncate">{w.cliente_nome || "—"}{w.data_fine_prevista ? ` · fine ${new Date(w.data_fine_prevista).toLocaleDateString("it-IT")}` : ""}</p>
                      </div>
                      <div className="w-28 sm:w-40 shrink-0">
                        <div className="flex justify-between text-[11px] text-zinc-500 mb-1"><span>avanzamento</span><span className="tabular-nums font-medium text-zinc-800">{Math.round(n(w.avanzamento))}%</span></div>
                        <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, n(w.avanzamento))}%`, backgroundImage: "var(--metal-red)" }} /></div>
                      </div>
                      <span className="hidden sm:block w-24 text-right text-sm tabular-nums text-zinc-700">{eurShort(w.importo_totale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-5">
          {/* Attenzione */}
          <section className="bg-white rounded-2xl border border-zinc-200 p-5">
            <Head title="Richiede attenzione" count={v.alerts.length} />
            {v.alerts.length === 0 ? (
              <div className="py-8 text-center"><CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" /><p className="text-sm text-zinc-600 mt-2">Nessuna urgenza. Ottimo lavoro.</p></div>
            ) : (
              <ul className="space-y-1 -mx-2">
                {v.alerts.slice(0, 8).map((a, i) => (
                  <li key={i}>
                    <Link to={a.to} className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-zinc-50">
                      <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${a.sev >= 3 ? "bg-brand-600 text-white" : a.sev === 2 ? "bg-brand-50 text-brand-700" : "bg-zinc-100 text-zinc-700"}`}><a.icon className="w-4 h-4" /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-zinc-900 leading-snug">{a.text}</span>
                        <span className="block text-xs text-zinc-500 mt-0.5">{a.meta}</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-300 mt-2 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {v.alerts.length > 8 && <p className="text-xs text-zinc-500 mt-2">e altre {v.alerts.length - 8}</p>}
          </section>

          {/* Preventivi */}
          <section className="bg-white rounded-2xl border border-zinc-200 p-5">
            <Head title="Preventivi in attesa" to="/preventivi" />
            {v.pending.length === 0 ? <Empty text="Nessun preventivo in attesa." /> : (
              <ul className="space-y-1 -mx-2">
                {v.pending.slice(0, 5).map((q) => (
                  <li key={q.id}>
                    <Link to={`/preventivi/${q.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-zinc-50">
                      <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-zinc-900 truncate">{q.cliente_nome || "—"}</span><span className="block text-xs text-zinc-500">N. {q.numero}{q.stato === "visto" ? " · aperto dal cliente" : ""}</span></span>
                      <span className="text-sm font-semibold tabular-nums text-zinc-900">{eurShort(q.imponibile || q.totale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {v.nextRem.length > 0 && (
            <section className="bg-white rounded-2xl border border-zinc-200 p-5">
              <Head title="Prossimi promemoria" to="/promemoria" />
              <ul className="space-y-2">
                {v.nextRem.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 text-sm">
                    <span className="w-12 text-center shrink-0 rounded-lg bg-zinc-100 py-1 leading-tight"><span className="block text-[10px] uppercase text-zinc-500">{new Date(r.data).toLocaleDateString("it-IT", { month: "short" })}</span><span className="block font-display text-lg font-bold text-zinc-900">{new Date(r.data).getDate()}</span></span>
                    <span className="text-zinc-800 truncate">{r.titolo}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Quick({ to, icon: I, label, primary }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition ${primary ? "bg-brand-600 text-white" : "bg-white/[0.07] text-zinc-100 border border-white/[0.1] hover:bg-white/[0.12]"}`}>
      <I className="w-4 h-4" /> {label}
    </Link>
  );
}

function HeroStat({ label, value, sub, to }) {
  return (
    <Link to={to} className="bg-ink-900/60 hover:bg-ink-800/80 transition-colors p-4 sm:p-5 flex items-center justify-between gap-3 sm:block">
      <div>
        <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400 leading-tight">{label}</p>
        {sub && <p className="text-xs text-zinc-500 mt-0.5 sm:hidden">{sub}</p>}
      </div>
      <p className="font-display text-2xl sm:text-3xl font-bold tabular-nums sm:mt-2 whitespace-nowrap">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5 hidden sm:block">{sub}</p>}
    </Link>
  );
}

function TodayCard({ to, icon: I, title, value, note, warn }) {
  return (
    <Link to={to} className="group bg-white rounded-2xl border border-zinc-200 p-4 hover:border-zinc-300 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] transition">
      <div className="flex items-center justify-between">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-zinc-950 text-white"><I className="w-[18px] h-[18px]" /></span>
        <ArrowUpRight className="w-4 h-4 text-zinc-300 group-hover:text-brand-600 transition-colors" />
      </div>
      <p className="text-xs text-zinc-500 mt-3">{title}</p>
      <p className="font-display text-3xl font-bold text-zinc-950 tabular-nums leading-tight">{value}</p>
      <p className={`text-xs mt-1 truncate ${warn ? "text-brand-700 font-medium" : "text-zinc-500"}`}>{warn && <AlertTriangle className="w-3 h-3 inline -mt-0.5 mr-1" />}{note}</p>
    </Link>
  );
}

function Head({ title, to, count }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">{title}{count ? <span className="text-xs font-semibold text-white rounded-full px-1.5 min-w-[20px] text-center" style={{ backgroundImage: "var(--metal-red)" }}>{count}</span> : null}</h2>
      {to && <Link to={to} className="text-xs text-zinc-500 hover:text-brand-700 inline-flex items-center gap-0.5">Vedi tutti <ChevronRight className="w-3.5 h-3.5" /></Link>}
    </div>
  );
}

const Empty = ({ text }) => <p className="text-sm text-zinc-500 py-6 text-center">{text}</p>;

function OperaioHome({ name, dateLabel, employeeId }) {
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl brushed text-white p-6 sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400 capitalize">{dateLabel}</p>
        <h1 className="font-display text-4xl font-bold uppercase mt-3">{greeting()}{name ? `, ${name}` : ""}</h1>
        <p className="text-zinc-400 mt-2">Qui trovi le tue presenze, i tuoi documenti e le scadenze dei corsi.</p>
      </section>
      <div className="grid sm:grid-cols-2 gap-3">
        <TodayCard to="/presenze" icon={ClipboardList} title="Le mie presenze" value="Apri" note="Ore registrate e calendario" />
        <TodayCard to={`/dipendenti/${employeeId}`} icon={Users} title="Il mio profilo" value="Apri" note="Documenti, corsi e visite mediche" />
      </div>
    </div>
  );
}
