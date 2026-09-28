import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { getAccessContext } from "@/lib/accessScope";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank, HandCoins, Briefcase, Sparkles, Loader2, AlertTriangle, ArrowRight, Clock, Users,
  Target, Timer, FileText, LayoutDashboard, HardHat, UserRound, FileBarChart, Minus,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import AnnualReport from "@/pages/AnnualReport";
import { computeAnalytics, periodOf, eur, pct } from "@/lib/analytics";
import { QUOTE_STATES } from "@/lib/quotes";
import { fmtH } from "@/lib/attendance";

const C = { incassi: "#c3122a", costi: "#71717a", margine: "#059669", neutro: "#a1a1aa" };
const CAT_COLORS = { Materiali: "#c3122a", Manodopera: "#18181b", Noleggi: "#71717a", Subappalti: "#f59e0b", Altro: "#d4d4d8" };
const TABS = [
  { key: "panoramica", label: "Panoramica", icon: LayoutDashboard },
  { key: "lavori", label: "Lavori", icon: HardHat },
  { key: "commerciale", label: "Commerciale", icon: Target },
  { key: "personale", label: "Personale", icon: UserRound },
  { key: "report", label: "Report annuale", icon: FileBarChart },
];

export default function Analisi() {
  const params = new URLSearchParams(window.location.search);
  const [tab, setTab] = useState(TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "panoramica");
  const [periodKey, setPeriodKey] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState(null);
  const [ai, setAi] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const ctx = getAccessContext();
  const isOperaio = !ctx.isHost && ctx.accessLevel === "operaio";

  const load = useCallback(async () => {
    const safe = (p) => p.catch(() => []);
    const [quotes, worksites, transactions, payments, attendance, employees] = await Promise.all([
      safe(db.Quote.list("-data", 5000)), safe(db.Worksite.list()), safe(db.WorksiteTransaction.list("-data", 10000)),
      safe(db.WorksitePayment.list("-data", 10000)), safe(db.DailyAttendance.list("-data", 10000)), safe(db.Employee.list()),
    ]);
    setData({ quotes, worksites, transactions, payments, attendance, employees });
  }, []);
  useEffect(() => { load(); }, [load]);

  const period = useMemo(() => periodOf(periodKey), [periodKey]);
  const a = useMemo(() => (data ? computeAnalytics(data, period) : null), [data, period]);
  const years = useMemo(() => {
    const ys = new Set([new Date().getFullYear()]);
    for (const list of [data?.payments, data?.transactions, data?.quotes]) for (const r of list || []) { const y = Number(String(r.data || "").slice(0, 4)); if (y > 2000) ys.add(y); }
    return [...ys].sort((x, y) => y - x).slice(0, 5);
  }, [data]);

  const switchTab = (k) => {
    setTab(k);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", k);
    window.history.replaceState(null, "", u);
  };

  const askAi = async () => {
    setAiBusy(true);
    try {
      const facts = {
        periodo: period.label, incassi: Math.round(a.cur.incassi), costi: Math.round(a.cur.costi), margine: Math.round(a.cur.margine),
        margine_percentuale: a.marginePct && Math.round(a.marginePct), variazioni_su_anno_prima_percento: a.deltas,
        costi_per_categoria: a.costCats, da_incassare: Math.round(a.daIncassare), rate_scadute: a.overdue.length,
        portafoglio_lavori_da_eseguire: Math.round(a.portafoglio),
        lavori: a.jobs.slice(0, 25).map((j) => ({ nome: j.nome, ricavo: Math.round(j.ricavo), costi: Math.round(j.costi), margine_pct: j.marginePct && Math.round(j.marginePct), avanzamento: j.avanzamento, sforamenti: j.sforamenti })),
        preventivi: { ...a.commercial, topClients: a.commercial.topClients.slice(0, 3) },
        personale: { ore: Math.round(a.staff.ore), costo: Math.round(a.staff.costo), straordinari: Math.round(a.staff.straordinari), assenze: a.staff.absences },
        mesi: a.monthly.map((m) => ({ mese: m.label, incassi: Math.round(m.incassi), costi: Math.round(m.costi) })),
      };
      const res = await api.integrations.Core.InvokeLLM({
        prompt: `Sei il controller di un'impresa edile/impiantistica italiana. Leggi questi numeri e scrivi al titolare una sintesi pratica, in italiano semplice, senza gergo.
Evidenzia cosa va bene, cosa preoccupa (margini bassi, lavori in perdita, sforamenti, crediti scaduti, calo incassi, troppi straordinari) e 3 azioni concrete per le prossime settimane. Cita cifre e nomi dei lavori. Non inventare dati che non ci sono.
DATI: ${JSON.stringify(facts)}`,
        response_json_schema: {
          type: "object",
          properties: {
            titolo: { type: "string", description: "una frase di sintesi" },
            positivi: { type: "array", items: { type: "string" } },
            attenzione: { type: "array", items: { type: "string" } },
            azioni: { type: "array", items: { type: "string" } },
          },
          required: ["titolo", "positivi", "attenzione", "azioni"],
        },
      });
      setAi({ ...res, periodo: period.label });
    } catch (e) {
      setAi({ errore: e?.message || "L'IA non ha risposto. Riprova tra poco." });
    } finally { setAiBusy(false); }
  };

  if (!a) return <LoadingSpinner />;
  if (isOperaio) return <div className="p-8 text-center text-slate-500">Le analisi economiche sono riservate al titolare e ai responsabili.</div>;

  return (
    <div className="space-y-4">
      <PageHeader title="Analisi" subtitle="Come sta andando l'impresa: soldi, lavori, preventivi e personale, calcolati dai dati che inserisci ogni giorno." />

      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 w-fit max-w-full overflow-x-auto no-scrollbar">
          {TABS.map(({ key, label, icon: I }) => (
            <button key={key} onClick={() => switchTab(key)} className={`flex items-center gap-1.5 px-3 h-9 rounded-md text-sm whitespace-nowrap ${tab === key ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}>
              <I className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        {tab !== "report" && (
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 w-fit md:ml-auto">
            {[{ k: "12m", l: "12 mesi" }, ...years.map((y) => ({ k: String(y), l: String(y) }))].map(({ k, l }) => (
              <button key={k} onClick={() => setPeriodKey(k)} className={`px-3 h-8 rounded-md text-sm tabular-nums ${periodKey === k ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900"}`}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {tab === "panoramica" && <Overview a={a} ai={ai} aiBusy={aiBusy} onAi={askAi} />}
      {tab === "lavori" && <Jobs a={a} />}
      {tab === "commerciale" && <Commercial a={a} />}
      {tab === "personale" && <Staff a={a} />}
      {tab === "report" && <AnnualReport embedded />}
    </div>
  );
}

/* ───────────── Componenti comuni ───────────── */

function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Delta({ value, inverse = false }) {
  if (value == null || !isFinite(value)) return <span className="text-xs text-slate-400">nessun confronto</span>;
  const good = inverse ? value <= 0 : value >= 0;
  const I = Math.abs(value) < 0.5 ? Minus : value > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${Math.abs(value) < 0.5 ? "text-slate-500" : good ? "text-emerald-700" : "text-red-600"}`}>
      <I className="w-3.5 h-3.5" />{value > 0 ? "+" : ""}{pct(value)} <span className="font-normal text-slate-500">vs anno prima</span>
    </span>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = "text-slate-900", accent, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 relative overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Icon className="w-4 h-4" style={{ color: accent }} />{label}</div>
      <p className={`text-2xl font-bold tabular-nums mt-2 tracking-tight ${tone}`}>{value}</p>
      <div className="mt-1 min-h-[18px]">{sub}</div>
      {children}
    </div>
  );
}

function ChartTip({ active, payload, label, money = true }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-900 mb-1">{label}</p>
      {payload.filter((p) => p.value != null).map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-700">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="flex-1">{p.name}</span>
          <span className="font-medium tabular-nums">{money ? eur(p.value) : `${fmtH(p.value)} h`}</span>
        </p>
      ))}
    </div>
  );
}

const axis = { stroke: "#94a3b8", fontSize: 11, tickLine: false, axisLine: false };

function Empty({ text }) {
  return <div className="py-10 text-center text-sm text-slate-500">{text}</div>;
}

/* ───────────── Panoramica ───────────── */

function Overview({ a, ai, aiBusy, onAi }) {
  const hasMoney = a.monthly.some((m) => m.incassi || m.costi);
  const totCat = a.costCats.reduce((s, c) => s + c.value, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi icon={HandCoins} label="Incassato" value={eur(a.cur.incassi)} accent={C.incassi} sub={<Delta value={a.deltas.incassi} />} />
        <Kpi icon={Wallet} label="Costi" value={eur(a.cur.costi)} accent={C.costi} sub={<Delta value={a.deltas.costi} inverse />} />
        <Kpi icon={PiggyBank} label="Margine" value={eur(a.cur.margine)} tone={a.cur.margine < 0 ? "text-red-600" : "text-slate-900"} accent={C.margine}
          sub={<span className="text-xs text-slate-600">{a.marginePct != null ? `${pct(a.marginePct)} sugli incassi` : "—"}</span>} />
        <Kpi icon={Clock} label="Da incassare" value={eur(a.daIncassare)} accent="#d97706"
          sub={a.overdue.length ? <span className="text-xs font-medium text-red-600">{a.overdue.length} {a.overdue.length === 1 ? "rata scaduta" : "rate scadute"}</span> : <span className="text-xs text-slate-500">nessuna rata scaduta</span>} />
        <Kpi icon={Briefcase} label="Lavori da eseguire" value={eur(a.portafoglio)} accent="#7c3aed"
          sub={<span className="text-xs text-slate-500">{a.openJobs.length} lavori aperti</span>} />
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Incassi e costi mese per mese" subtitle="La linea verde è il margine accumulato nel periodo">
          {!hasMoney ? <Empty text="Nessun movimento nel periodo: registra incassi e spese nei Lavori." /> : (
            <div className="h-[300px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={a.monthly} barGap={2}>
                  <defs>
                    <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.incassi} stopOpacity={1} /><stop offset="100%" stopColor={C.incassi} stopOpacity={0.7} /></linearGradient>
                    <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.costi} stopOpacity={0.95} /><stop offset="100%" stopColor={C.costi} stopOpacity={0.65} /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} width={56} tickFormatter={(v) => eur(v, true)} />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="incassi" name="Incassi" fill="url(#gIn)" radius={[5, 5, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="costi" name="Costi" fill="url(#gOut)" radius={[5, 5, 0, 0]} maxBarSize={22} />
                  <Line dataKey="cumulato" name="Margine accumulato" type="monotone" stroke={C.margine} strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-600">
            <Legend color={C.incassi} label="Incassi" /><Legend color={C.costi} label="Costi (spese + manodopera)" /><Legend color={C.margine} label="Margine accumulato" line />
          </div>
        </Card>

        <Card title="Dove vanno i soldi" subtitle="Costi del periodo per categoria">
          {!totCat ? <Empty text="Nessun costo registrato." /> : (
            <>
              <div className="h-[180px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={a.costCats} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="none">
                      {a.costCats.map((c) => <Cell key={c.name} fill={CAT_COLORS[c.name] || C.neutro} />)}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
                  <div><p className="text-xs text-slate-500">Totale</p><p className="text-base font-bold text-slate-900 tabular-nums">{eur(totCat, true)}</p></div>
                </div>
              </div>
              <ul className="space-y-2 mt-3">
                {a.costCats.sort((x, y) => y.value - x.value).map((c) => (
                  <li key={c.name} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CAT_COLORS[c.name] }} />
                      <span className="flex-1 text-slate-700">{c.name}</span>
                      <span className="tabular-nums font-medium text-slate-900">{eur(c.value)}</span>
                      <span className="w-10 text-right tabular-nums text-xs text-slate-500">{pct((c.value / totCat) * 100)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Sintesi del controller" subtitle="L'IA legge i numeri e ti dice cosa va bene, cosa preoccupa e cosa fare"
          action={<Button size="sm" onClick={onAi} disabled={aiBusy} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{ai ? "Aggiorna" : "Genera sintesi"}</Button>}>
          {!ai ? (
            <p className="text-sm text-slate-500">Premi "Genera sintesi" per un commento sui numeri di questo periodo.</p>
          ) : ai.errore ? (
            <p className="text-sm text-red-600">{ai.errore}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-base font-semibold text-slate-900">{ai.titolo}</p>
              <div className="grid md:grid-cols-3 gap-4">
                <AiList title="Va bene" items={ai.positivi} dot="bg-emerald-500" />
                <AiList title="Attenzione" items={ai.attenzione} dot="bg-amber-500" />
                <AiList title="Cosa fare" items={ai.azioni} dot="bg-brand-600" numbered />
              </div>
              <p className="text-xs text-slate-500">Sintesi automatica su {ai.periodo}: controlla sempre i dati di dettaglio.</p>
            </div>
          )}
        </Card>

        <Card title="Crediti da sollecitare" subtitle="Rate dei clienti scadute e non pagate">
          {a.overdue.length === 0 ? <Empty text="Nessuna rata scaduta. Ottimo." /> : (
            <ul className="divide-y divide-slate-100 -my-2">
              {a.overdue.slice(0, 6).map((o, i) => (
                <li key={i} className="py-2.5">
                  <Link to={`/lavori/${o.lavoroId}`} className="flex items-center gap-3 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate group-hover:text-brand-700">{o.cliente || o.lavoro}</p>
                      <p className="text-xs text-slate-500 truncate">{o.descrizione} · {o.lavoro} · scaduta il {new Date(o.scadenza).toLocaleDateString("it-IT")}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-red-600">{eur(o.residuo)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Legend({ color, label, line }) {
  return <span className="flex items-center gap-1.5">{line ? <span className="w-4 h-0.5 rounded" style={{ background: color }} /> : <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />}{label}</span>;
}

function AiList({ title, items = [], dot, numbered }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</p>
      <ul className="space-y-2">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-700 leading-snug">
            {numbered ? <span className="shrink-0 w-5 h-5 rounded-full bg-brand-600 text-white text-[11px] font-semibold grid place-items-center">{i + 1}</span> : <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${dot}`} />}
            <span>{t}</span>
          </li>
        ))}
        {!items.length && <li className="text-sm text-slate-400">—</li>}
      </ul>
    </div>
  );
}

/* ───────────── Lavori ───────────── */

function Jobs({ a }) {
  const [filter, setFilter] = useState("aperti");
  const list = (filter === "aperti" ? a.openJobs : a.jobs).filter((j) => j.ricavo || j.costi).sort((x, y) => (x.marginePct ?? 999) - (y.marginePct ?? 999));
  const chart = [...list].sort((x, y) => y.ricavo - x.ricavo).slice(0, 10).map((j) => ({ nome: j.nome.length > 18 ? `${j.nome.slice(0, 17)}…` : j.nome, Costi: Math.round(j.costi), Margine: Math.max(0, Math.round(j.margine)), Perdita: Math.min(0, Math.round(j.margine)) }));
  const loss = list.filter((j) => j.margine < 0);
  const avg = list.length ? list.reduce((s, j) => s + (j.marginePct || 0), 0) / list.length : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Briefcase} label="Lavori aperti" value={a.openJobs.length} accent="#7c3aed" sub={<span className="text-xs text-slate-500">{eur(a.portafoglio)} ancora da eseguire</span>} />
        <Kpi icon={PiggyBank} label="Margine medio" value={pct(avg)} accent={C.margine} sub={<span className="text-xs text-slate-500">ad oggi, sui lavori mostrati</span>} />
        <Kpi icon={AlertTriangle} label="In perdita" value={loss.length} tone={loss.length ? "text-red-600" : "text-slate-900"} accent="#dc2626" sub={<span className="text-xs text-slate-500">{loss.length ? eur(loss.reduce((s, j) => s + j.margine, 0)) : "nessuno"}</span>} />
        <Kpi icon={Clock} label="Da incassare" value={eur(a.daIncassare)} accent="#d97706" sub={<span className="text-xs text-slate-500">su tutti i lavori</span>} />
      </div>

      <Card title="Ricavo di ogni lavoro: quanto se ne va in costi e quanto resta" subtitle="I 10 lavori di valore maggiore"
        action={<Seg value={filter} onChange={setFilter} options={[["aperti", "Aperti"], ["tutti", "Tutti"]]} />}>
        {!chart.length ? <Empty text="Nessun lavoro con importi da analizzare." /> : (
          <div style={{ height: Math.max(180, chart.length * 38) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} layout="vertical" barSize={16} margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" {...axis} tickFormatter={(v) => eur(v, true)} />
                <YAxis type="category" dataKey="nome" {...axis} width={130} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="Costi" stackId="a" fill={C.costi} />
                <Bar dataKey="Margine" stackId="a" fill={C.margine} radius={[0, 4, 4, 0]} />
                <Bar dataKey="Perdita" stackId="b" fill="#dc2626" radius={[4, 0, 0, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Classifica dei lavori" subtitle="Dal margine più basso: in alto quelli da tenere d'occhio">
        {!list.length ? <Empty text="Nessun lavoro." /> : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100">
                  <th className="text-left font-medium px-4 sm:px-5 py-2">Lavoro</th>
                  <th className="text-right font-medium px-3 py-2">Ricavo</th>
                  <th className="text-right font-medium px-3 py-2">Costi</th>
                  <th className="text-right font-medium px-3 py-2" title="Per i lavori in corso: ricavo previsto meno costi sostenuti finora">Margine ad oggi</th>
                  <th className="text-left font-medium px-3 py-2 w-40">Avanzamento</th>
                  <th className="text-right font-medium px-4 sm:px-5 py-2">Da incassare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="px-4 sm:px-5 py-2.5">
                      <Link to={`/lavori/${j.id}`} className="font-medium text-slate-900 hover:text-brand-700">{j.nome}</Link>
                      <p className="text-xs text-slate-500">{j.cliente || "—"}{j.sforamenti.length ? <span className="text-amber-700"> · sforato: {j.sforamenti.join(", ")}</span> : null}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{eur(j.ricavo)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{eur(j.costi)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`tabular-nums font-semibold ${j.margine < 0 ? "text-red-600" : (j.marginePct ?? 0) < 10 ? "text-amber-700" : "text-emerald-700"}`}>{pct(j.marginePct)}</span>
                      <p className="text-xs tabular-nums text-slate-500">{eur(j.margine)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, j.avanzamento)}%` }} /></div>
                        <span className="text-xs tabular-nums text-slate-600 w-9 text-right">{Math.round(j.avanzamento)}%</span>
                      </div>
                    </td>
                    <td className={`px-4 sm:px-5 py-2.5 text-right tabular-nums ${j.rateScadute.length ? "text-red-600 font-medium" : ""}`}>{eur(j.daIncassare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Seg({ value, onChange, options }) {
  return (
    <div className="flex rounded-md border border-slate-200 p-0.5 shrink-0">
      {options.map(([k, l]) => <button key={k} onClick={() => onChange(k)} className={`px-2.5 h-7 rounded text-xs ${value === k ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}>{l}</button>)}
    </div>
  );
}

/* ───────────── Commerciale ───────────── */

function Commercial({ a }) {
  const c = a.commercial;
  const funnel = ["in_attesa", "inviato", "visto", "approvato", "rifiutato", "scaduto"].map((s) => ({ s, label: QUOTE_STATES[s]?.label || s, n: c.states[s] || 0 }));
  const maxF = Math.max(1, ...funnel.map((f) => f.n));
  const FCOL = { in_attesa: "#94a3b8", inviato: "#3b82f6", visto: "#6366f1", approvato: "#059669", rifiutato: "#dc2626", scaduto: "#d97706" };
  const maxC = Math.max(1, ...c.topClients.map((t) => t.value));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icon={FileText} label="Preventivi emessi" value={c.emessi} accent={C.incassi} sub={<span className="text-xs text-slate-500">{eur(c.valoreEmesso)} di imponibile</span>} />
        <Kpi icon={Target} label="Tasso di accettazione" value={pct(c.conversione)} accent={C.margine} sub={<span className="text-xs text-slate-500">{c.accettati} accettati · {eur(c.valoreAccettato)}</span>} />
        <Kpi icon={Timer} label="Tempo di risposta" value={c.tempoRisposta != null ? `${Math.round(c.tempoRisposta)} gg` : "—"} accent="#7c3aed" sub={<span className="text-xs text-slate-500">dall'invio all'accettazione</span>} />
        <Kpi icon={Briefcase} label="In attesa di risposta" value={eur(c.pipeline)} accent="#d97706" sub={<Link to="/preventivi" className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1">{c.pipelineCount} preventivi aperti <ArrowRight className="w-3 h-3" /></Link>} />
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Lavoro acquisito ogni mese" subtitle="Imponibile dei preventivi accettati">
          {!a.monthly.some((m) => m.accettati) ? <Empty text="Nessun preventivo accettato nel periodo." /> : (
            <div className="h-[260px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.monthly}>
                  <defs><linearGradient id="gAcc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.margine} /><stop offset="100%" stopColor={C.margine} stopOpacity={0.6} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} width={56} tickFormatter={(v) => eur(v, true)} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="accettati" name="Accettati" fill="url(#gAcc)" radius={[5, 5, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Dove sono i preventivi" subtitle={`Emessi nel periodo${c.avgQuoteMargin != null ? ` · margine medio previsto ${pct(c.avgQuoteMargin)}` : ""}`}>
          {!c.emessi ? <Empty text="Nessun preventivo nel periodo." /> : (
            <ul className="space-y-3">
              {funnel.map((f) => (
                <li key={f.s}>
                  <div className="flex justify-between text-sm mb-1"><span className="text-slate-700">{f.label}</span><span className="tabular-nums font-medium text-slate-900">{f.n}</span></div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(f.n / maxF) * 100}%`, background: FCOL[f.s] }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Clienti che hanno pagato di più" subtitle="Incassi del periodo">
        {!c.topClients.length ? <Empty text="Nessun incasso registrato nel periodo." /> : (
          <ul className="space-y-3">
            {c.topClients.map((t, i) => (
              <li key={t.nome} className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold grid place-items-center shrink-0">{i + 1}</span>
                <span className="w-40 sm:w-56 truncate text-slate-800">{t.nome}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(t.value / maxC) * 100}%` }} /></div>
                <span className="w-24 text-right tabular-nums font-medium">{eur(t.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ───────────── Personale ───────────── */

function Staff({ a }) {
  const s = a.staff;
  const abs = [["ferie", "Ferie", "#9333ea"], ["permesso", "Permessi", "#2563eb"], ["malattia", "Malattia", "#d97706"], ["assente", "Assenze", "#dc2626"]];
  const totAbs = abs.reduce((t, [k]) => t + s.absences[k], 0);
  const maxO = Math.max(1, ...s.people.map((p) => p.ore));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icon={Clock} label="Ore lavorate" value={`${fmtH(Math.round(s.ore))} h`} accent={C.incassi} sub={<span className="text-xs text-slate-500">{s.people.length} persone</span>} />
        <Kpi icon={Wallet} label="Costo manodopera" value={eur(s.costo)} accent="#7c3aed" sub={<span className="text-xs text-slate-500">{s.costoOrarioMedio ? `${eur(s.costoOrarioMedio)}/h in media` : "—"}</span>} />
        <Kpi icon={TrendingUp} label="Straordinari" value={`${fmtH(Math.round(s.straordinari))} h`} accent={C.costi} sub={<span className="text-xs text-slate-500">{s.ore ? `${pct((s.straordinari / s.ore) * 100, 1)} delle ore` : "—"}</span>} />
        <Kpi icon={Users} label="Giornate di assenza" value={totAbs} accent="#dc2626" sub={<span className="text-xs text-slate-500">ferie, permessi, malattia</span>} />
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Ore lavorate e costo manodopera per mese">
          {!a.monthly.some((m) => m.ore) ? <Empty text="Nessuna presenza registrata nel periodo." /> : (
            <div className="h-[260px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={a.monthly}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis yAxisId="h" {...axis} width={44} tickFormatter={(v) => `${v}h`} />
                  <YAxis yAxisId="e" orientation="right" {...axis} width={56} tickFormatter={(v) => eur(v, true)} />
                  <Tooltip content={({ active, payload, label }) => (active && payload?.length ? (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
                      <p className="font-semibold mb-1">{label}</p>
                      <p>Ore: <b className="tabular-nums">{fmtH(payload[0]?.payload.ore || 0)} h</b></p>
                      <p>Costo: <b className="tabular-nums">{eur(payload[0]?.payload.manodopera || 0)}</b></p>
                    </div>
                  ) : null)} cursor={{ fill: "#f1f5f9" }} />
                  <Bar yAxisId="h" dataKey="ore" name="Ore" fill="#d4d4d8" radius={[5, 5, 0, 0]} maxBarSize={26} />
                  <Line yAxisId="e" dataKey="manodopera" name="Costo" stroke="#c3122a" strokeWidth={2.5} dot={false} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Assenze nel periodo">
          {!totAbs ? <Empty text="Nessuna assenza registrata." /> : (
            <>
              <div className="flex h-3 rounded-full overflow-hidden mb-4">
                {abs.filter(([k]) => s.absences[k]).map(([k, , col]) => <span key={k} style={{ width: `${(s.absences[k] / totAbs) * 100}%`, background: col }} />)}
              </div>
              <ul className="space-y-2">
                {abs.map(([k, l, col]) => (
                  <li key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: col }} /><span className="flex-1 text-slate-700">{l}</span>
                    <span className="tabular-nums font-medium">{s.absences[k]} gg</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card title="Ore per dipendente" subtitle="Con giornate lavorate, straordinari e costo">
        {!s.people.length ? <Empty text="Nessuna presenza nel periodo." /> : (
          <ul className="space-y-3">
            {s.people.map((p) => (
              <li key={p.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[180px_1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                <Link to={`/dipendenti/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700 truncate">{p.nome}</Link>
                <div className="order-3 sm:order-none col-span-2 sm:col-span-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(p.ore / maxO) * 100}%` }} /></div>
                <span className="text-right tabular-nums text-slate-700 whitespace-nowrap">
                  <b className="text-slate-900">{fmtH(Math.round(p.ore))} h</b> · {p.giorni} gg{p.straordinari ? <span className="text-amber-700"> · +{fmtH(Math.round(p.straordinari))} str.</span> : null} · {eur(p.costo)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
