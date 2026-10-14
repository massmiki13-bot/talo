import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, AlertTriangle, Users, Truck, HardHat } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { iso, addDays, diffDays, toDate, worksiteSpan, phaseSpans, loads } from "@/lib/schedule";

const SPANS = [["6", "6 settimane", 42], ["12", "3 mesi", 91], ["26", "6 mesi", 182]];
const COLORS = ["#c3122a", "#18181b", "#0f766e", "#b45309", "#4338ca", "#be185d", "#0369a1", "#4d7c0f"];
const LABEL_W = "w-40 sm:w-56";
const fmt = (s) => toDate(s).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

// `soft`: barra chiara con testo scuro (fasi), per restare leggibile su ogni colore.
function Bar({ from, days, start, end, color, children, title, striped, soft }) {
  const a = Math.max(0, diffDays(from, start));
  const b = Math.min(days - 1, diffDays(from, end));
  if (b < 0 || a > days - 1) return null;
  return (
    <div className={`absolute top-1 bottom-1 rounded-md text-[11px] font-medium px-1.5 flex items-center overflow-hidden whitespace-nowrap ${soft ? "text-zinc-900" : "text-white"}`} title={title}
      style={{ left: `${(a / days) * 100}%`, width: `${((b - a + 1) / days) * 100}%`, border: soft ? `1px solid ${color}99` : undefined, background: soft ? `${color}33` : striped ? `repeating-linear-gradient(135deg, ${color}, ${color} 6px, ${color}cc 6px, ${color}cc 12px)` : color }}>
      {children}
    </div>
  );
}

function Row({ label, sub, to, children, danger }) {
  return (
    <div className="flex border-b border-zinc-100 min-h-[34px]">
      <div className={`${LABEL_W} shrink-0 pr-2 py-1.5 text-sm truncate ${danger ? "text-red-700 font-medium" : "text-zinc-800"}`}>
        {to ? <Link to={to} className="hover:underline">{label}</Link> : label}
        {sub && <span className="block text-[11px] text-zinc-500 truncate">{sub}</span>}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

export default function Cronoprogramma() {
  const [data, setData] = useState(null);
  const [span, setSpan] = useState("12");
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return iso(d); });
  const today = iso(new Date());

  useEffect(() => {
    Promise.all([db.Worksite.list("data_inizio", 1000), db.Employee.fields(["nome", "cognome", "stato"], { limit: 1000 }), db.Equipment.list("nome", 500).catch(() => [])])
      .then(([w, e, m]) => setData({ worksites: w.filter((x) => x.stato !== "finito" || (x.data_fine_effettiva || "") >= addDays(today, -60)), employees: e.filter((x) => x.stato !== "cessato"), equipment: m }))
      .catch(() => setData({ worksites: [], employees: [], equipment: [] }));
  }, [today]);

  const days = SPANS.find((s) => s[0] === span)[2];
  const weeks = useMemo(() => Array.from({ length: Math.ceil(days / 7) }, (_, i) => addDays(from, i * 7)), [from, days]);
  const load = useMemo(() => (data ? loads(data, today) : { people: [], machines: [] }), [data, today]);
  const clashCount = load.people.filter((p) => p.clashes.length).length + load.machines.filter((m) => m.clashes.length).length;
  const todayPos = diffDays(from, today);

  if (!data) return <LoadingSpinner />;
  const sites = data.worksites.filter((w) => { const s = worksiteSpan(w, today); return s.end >= from && s.start <= addDays(from, days - 1); });
  const colorOf = (id) => COLORS[Math.abs([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % COLORS.length];

  const grid = (children) => (
    <div className="relative">
      <div className="absolute inset-0 flex pointer-events-none" aria-hidden="true">
        <div className={`${LABEL_W} shrink-0`} />
        <div className="relative flex-1">
          {weeks.map((w, i) => <div key={w} className="absolute top-0 bottom-0 border-l border-zinc-100" style={{ left: `${((i * 7) / days) * 100}%` }} />)}
          {todayPos >= 0 && todayPos < days && <div className="absolute top-0 bottom-0 w-0.5 bg-brand-600/70" style={{ left: `${((todayPos + 0.5) / days) * 100}%` }} />}
        </div>
      </div>
      <div className="relative">{children}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Cronoprogramma" subtitle="Lavori e fasi nel tempo, con squadre e mezzi: vedi subito chi o cosa è impegnato su due cantieri insieme." />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-white rounded-xl border border-zinc-200 p-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setFrom(addDays(from, -7))} aria-label="Settimana precedente"><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); setFrom(iso(d)); }}>Oggi</Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setFrom(addDays(from, 7))} aria-label="Settimana successiva"><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex gap-1 bg-white rounded-xl border border-zinc-200 p-1" role="tablist">
          {SPANS.map(([k, l]) => <button key={k} role="tab" aria-selected={span === k} onClick={() => setSpan(k)} className={`px-3 h-8 rounded-lg text-sm ${span === k ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}>{l}</button>)}
        </div>
        {clashCount > 0 && <span className="ml-auto text-sm text-red-700 font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" aria-hidden="true" />{clashCount} {clashCount === 1 ? "sovrapposizione" : "sovrapposizioni"} tra cantieri</span>}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 p-4 overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="flex border-b border-zinc-200 pb-1.5 mb-1">
            <div className={`${LABEL_W} shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500`}>Settimana</div>
            <div className="relative flex-1 h-5">
              {weeks.map((w, i) => <span key={w} className="absolute text-[11px] text-zinc-500 tabular-nums" style={{ left: `${((i * 7) / days) * 100}%` }}>{fmt(w)}</span>)}
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 mt-3 mb-1 flex items-center gap-1.5"><HardHat className="w-3.5 h-3.5" aria-hidden="true" />Lavori e fasi</p>
          {grid(sites.length === 0 ? <p className="text-sm text-zinc-500 py-4">Nessun lavoro in questo periodo.</p> : sites.map((w) => {
            const s = worksiteSpan(w, today);
            const c = colorOf(w.id);
            return (
              <React.Fragment key={w.id}>
                <Row label={w.nome} sub={`${fmt(s.start)} → ${fmt(s.end)}${s.stimato ? " · date da completare" : ""}`} to={`/lavori/${w.id}`}>
                  <Bar from={from} days={days} start={s.start} end={s.end} color={c} striped={s.stimato} title={`${w.nome}: ${fmt(s.start)} → ${fmt(s.end)}`}>{Math.round(w.avanzamento || 0)}%</Bar>
                </Row>
                {phaseSpans(w, today).map((f) => (
                  <Row key={f.nome} label={<span className="pl-3 text-zinc-600">{f.nome}</span>}>
                    <Bar from={from} days={days} start={f.start} end={f.end} color={c} soft title={`${f.nome}: ${fmt(f.start)} → ${fmt(f.end)}${f.stimato ? " (stimata dal peso della fase)" : ""}`}>{f.completamento ? `${f.completamento}%` : ""}</Bar>
                  </Row>
                ))}
              </React.Fragment>
            );
          }))}

          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 mt-5 mb-1 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" aria-hidden="true" />Squadre</p>
          {grid(load.people.length === 0 ? <p className="text-sm text-zinc-500 py-3">Assegna le squadre nei lavori per vedere gli impegni di ognuno.</p> : load.people.map((p) => (
            <Row key={p.id} label={p.nome} danger={p.clashes.length > 0} sub={p.clashes.length ? `su due cantieri dal ${fmt(p.clashes[0].start)}` : undefined} to={`/dipendenti/${p.id}`}>
              {p.items.map((it) => <Bar key={it.worksite_id} from={from} days={days} start={it.start} end={it.end} color={colorOf(it.worksite_id)} title={it.nome}>{it.nome}</Bar>)}
              {p.clashes.map((cl, i) => <div key={i} className="absolute top-0 bottom-0 border-2 border-red-600 rounded-md pointer-events-none" style={{ left: `${(Math.max(0, diffDays(from, cl.start)) / days) * 100}%`, width: `${((Math.min(days - 1, diffDays(from, cl.end)) - Math.max(0, diffDays(from, cl.start)) + 1) / days) * 100}%` }} title={`Sovrapposizione: ${cl.tra.join(" e ")}`} />)}
            </Row>
          )))}

          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 mt-5 mb-1 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" aria-hidden="true" />Mezzi</p>
          {grid(load.machines.length === 0 ? <p className="text-sm text-zinc-500 py-3">Nessun mezzo assegnato a un cantiere. <Link to="/mezzi" className="text-brand-700 hover:underline">Vai ai mezzi</Link></p> : load.machines.map((m) => (
            <Row key={m.id} label={m.nome} to="/mezzi">
              {m.items.map((it, i) => <Bar key={i} from={from} days={days} start={it.start} end={it.end} color={colorOf(it.worksite_id)} title={it.nome}>{it.nome}</Bar>)}
            </Row>
          )))}
        </div>
      </div>
      <p className="text-xs text-zinc-500">Le barre a righe indicano date stimate; le fasi senza date proprie sono distribuite in base al loro peso. La linea rossa è oggi.</p>
    </div>
  );
}
