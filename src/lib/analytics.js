// Analisi: indicatori economici, commerciali e del personale calcolati dai dati dell'app.
// Criterio di cassa: entrate = incassi dai clienti (WorksitePayment) + altre entrate dei lavori;
// costi = uscite dei lavori + manodopera dalle presenze (ore × costo orario).
import { COST_CATEGORIES, economics, laborFromAttendance, installments } from "@/lib/worksites";
import { OPEN_STATES, effectiveState } from "@/lib/quotes";
import { overtime, STD_HOURS } from "@/lib/attendance";

const n = (v) => Number(v) || 0;
export const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const ym = (d) => String(d || "").slice(0, 7);
const inRange = (d, from, to) => !!d && d >= from && d <= to;
const stdOf = (e) => (n(e?.ore_settimanali) > 0 ? n(e.ore_settimanali) / 5 : STD_HOURS);

/** Periodo: anno intero, oppure ultimi 12 mesi. */
export function periodOf(key) {
  const now = new Date();
  if (key === "12m") {
    const months = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
    return { key, label: "Ultimi 12 mesi", months, from: `${months[0]}-01`, to: `${months[11]}-31` };
  }
  const y = Number(key);
  const months = MESI.map((_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
  return { key, label: String(y), months, from: `${y}-01-01`, to: `${y}-12-31` };
}

// Stesso periodo dell'anno precedente (per l'anno in corso: fino alla stessa data).
export function previousOf(p) {
  const shift = (s) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
  const today = new Date().toISOString().slice(0, 10);
  return { from: shift(p.from), to: p.to > today ? shift(today) : shift(p.to) };
}

function laborRows(attendance, employees) {
  const rate = new Map(employees.map((e) => [e.id, n(e.costo_orario)]));
  const out = [];
  for (const a of attendance) for (const p of a.presenze || []) {
    const stato = p.stato || "presente";
    const ore = stato === "presente" ? n(p.ore) : 0;
    out.push({ data: a.data, emp: p.dipendente_id, nome: p.dipendente_nome, stato, ore, costo: ore * (rate.get(p.dipendente_id) || 0) });
  }
  return out;
}

function totalsBetween({ payments, transactions, labor }, from, to) {
  const incassi = payments.filter((p) => inRange(p.data, from, to)).reduce((s, p) => s + n(p.importo), 0)
    + transactions.filter((t) => t.tipo === "entrata" && inRange(t.data, from, to)).reduce((s, t) => s + n(t.importo), 0);
  const uscite = transactions.filter((t) => t.tipo === "uscita" && inRange(t.data, from, to)).reduce((s, t) => s + n(t.importo), 0);
  const manodopera = labor.filter((l) => inRange(l.data, from, to)).reduce((s, l) => s + l.costo, 0);
  return { incassi, costi: uscite + manodopera, margine: incassi - uscite - manodopera };
}

export function computeAnalytics(data, period) {
  const { quotes = [], worksites = [], transactions = [], payments = [], attendance = [], employees = [] } = data;
  const labor = laborRows(attendance, employees);
  const { from, to, months } = period;
  const prev = previousOf(period);
  const cur = totalsBetween({ payments, transactions, labor }, from, to);
  const old = totalsBetween({ payments, transactions, labor }, prev.from, prev.to);
  const delta = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
  const today = new Date().toISOString().slice(0, 10);

  // Andamento mensile
  const monthly = months.map((m) => {
    const incassi = payments.filter((p) => ym(p.data) === m).reduce((s, p) => s + n(p.importo), 0)
      + transactions.filter((t) => t.tipo === "entrata" && ym(t.data) === m).reduce((s, t) => s + n(t.importo), 0);
    const uscite = transactions.filter((t) => t.tipo === "uscita" && ym(t.data) === m).reduce((s, t) => s + n(t.importo), 0);
    const lm = labor.filter((l) => ym(l.data) === m);
    const manodopera = lm.reduce((s, l) => s + l.costo, 0);
    const accettati = quotes.filter((q) => q.stato === "approvato" && ym(q.data_firma_cliente || q.data) === m).reduce((s, q) => s + n(q.imponibile || q.totale), 0);
    return {
      m, label: `${MESI[Number(m.slice(5)) - 1]}${period.key === "12m" ? ` ${m.slice(2, 4)}` : ""}`,
      incassi, uscite, manodopera, costi: uscite + manodopera, margine: incassi - uscite - manodopera,
      ore: lm.reduce((s, l) => s + l.ore, 0), accettati,
    };
  });
  let cum = 0;
  const thisMonth = today.slice(0, 7);
  for (const r of monthly) { cum += r.margine; r.cumulato = r.m <= thisMonth ? cum : null; }

  // Costi per categoria
  const byCat = Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0]));
  for (const t of transactions.filter((x) => x.tipo === "uscita" && inRange(x.data, from, to))) byCat[COST_CATEGORIES.includes(t.categoria) ? t.categoria : "Altro"] += n(t.importo);
  byCat.Manodopera += labor.filter((l) => inRange(l.data, from, to)).reduce((s, l) => s + l.costo, 0);
  const costCats = COST_CATEGORIES.map((c) => ({ name: c, value: byCat[c] })).filter((x) => x.value > 0);

  // Lavori
  const jobs = worksites.map((w) => {
    const tx = transactions.filter((t) => t.worksite_id === w.id);
    const pays = payments.filter((p) => p.worksite_id === w.id);
    const lab = laborFromAttendance(attendance, employees, w.id);
    const q = quotes.find((x) => x.id === w.preventivo_id || (x.worksite_id === w.id && x.stato === "approvato"));
    const eco = economics({ worksite: w, transactions: tx, labor: lab, quoteTotal: n(q?.imponibile || q?.totale) });
    const incassato = pays.reduce((s, p) => s + n(p.importo), 0);
    const rate = installments(w.piano_pagamenti || [], pays);
    return {
      id: w.id, nome: w.nome || "Lavoro", cliente: w.cliente_nome || "", stato: w.stato || (w.attivo === false ? "finito" : "in_corso"),
      avanzamento: n(w.avanzamento), ricavo: eco.ricavo, costi: eco.costi, margine: eco.margineReale,
      marginePct: eco.ricavo ? (eco.margineReale / eco.ricavo) * 100 : null, ore: lab.ore,
      incassato, daIncassare: Math.max(0, eco.ricavo - incassato),
      rateScadute: rate.filter((r) => r.residuo > 0.005 && r.scadenza && r.scadenza < today),
      sforamenti: eco.sforamenti,
    };
  });
  const openJobs = jobs.filter((j) => j.stato !== "finito");
  const portafoglio = openJobs.reduce((s, j) => s + Math.max(0, j.ricavo * (1 - j.avanzamento / 100)), 0);
  const daIncassare = jobs.reduce((s, j) => s + j.daIncassare, 0);
  const overdue = jobs.flatMap((j) => j.rateScadute.map((r) => ({ lavoro: j.nome, lavoroId: j.id, cliente: j.cliente, scadenza: r.scadenza, residuo: r.residuo, descrizione: r.descrizione || r.nome || "Rata" })))
    .sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)));

  // Commerciale
  const pq = quotes.filter((q) => inRange(q.data, from, to));
  const states = {};
  for (const q of pq) { const s = effectiveState(q); states[s] = (states[s] || 0) + 1; }
  const accepted = pq.filter((q) => q.stato === "approvato");
  const decided = pq.filter((q) => ["approvato", "rifiutato"].includes(q.stato));
  const valueOf = (list) => list.reduce((s, q) => s + n(q.imponibile || q.totale), 0);
  const respDays = accepted.filter((q) => q.data_firma_cliente && q.data).map((q) => (new Date(q.data_firma_cliente) - new Date(q.data)) / 86_400_000).filter((d) => d >= 0);
  const openPipeline = quotes.filter((q) => OPEN_STATES.includes(q.stato) && effectiveState(q) !== "scaduto");
  const clients = {};
  for (const p of payments.filter((x) => inRange(x.data, from, to))) {
    const k = p.cliente_nome || "Senza cliente";
    clients[k] = (clients[k] || 0) + n(p.importo);
  }
  const topClients = Object.entries(clients).map(([nome, value]) => ({ nome, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  const withCost = accepted.filter((q) => n(q.costo_totale) > 0 && n(q.imponibile) > 0);
  const avgQuoteMargin = withCost.length ? (withCost.reduce((s, q) => s + (n(q.imponibile) - n(q.costo_totale)) / n(q.imponibile), 0) / withCost.length) * 100 : null;

  // Personale
  const pl = labor.filter((l) => inRange(l.data, from, to));
  const empMap = {};
  const absences = { ferie: 0, permesso: 0, malattia: 0, assente: 0 };
  for (const l of pl) {
    if (l.stato !== "presente") { if (absences[l.stato] != null) absences[l.stato]++; continue; }
    const e = (empMap[l.emp] ||= { id: l.emp, nome: l.nome, ore: 0, costo: 0, days: {} });
    e.ore += l.ore; e.costo += l.costo; e.days[l.data] = (e.days[l.data] || 0) + l.ore;
  }
  const empById = new Map(employees.map((e) => [e.id, e]));
  const people = Object.values(empMap).map((e) => {
    const emp = empById.get(e.id);
    return {
      id: e.id, nome: emp ? `${emp.nome || ""} ${emp.cognome || ""}`.trim() : e.nome || "Dipendente", ore: e.ore, costo: e.costo,
      giorni: Object.keys(e.days).length, straordinari: Object.values(e.days).reduce((s, h) => s + overtime(h, stdOf(emp)), 0),
    };
  }).sort((a, b) => b.ore - a.ore);
  const oreTot = pl.reduce((s, l) => s + l.ore, 0);
  const costoTot = pl.reduce((s, l) => s + l.costo, 0);

  return {
    period, cur, old,
    deltas: { incassi: delta(cur.incassi, old.incassi), costi: delta(cur.costi, old.costi), margine: delta(cur.margine, old.margine) },
    marginePct: cur.incassi ? (cur.margine / cur.incassi) * 100 : null,
    monthly, costCats, jobs, openJobs, portafoglio, daIncassare, overdue,
    commercial: {
      emessi: pq.length, valoreEmesso: valueOf(pq), accettati: accepted.length, valoreAccettato: valueOf(accepted),
      conversione: decided.length ? (accepted.length / decided.length) * 100 : null, states,
      tempoRisposta: respDays.length ? respDays.reduce((s, d) => s + d, 0) / respDays.length : null,
      pipeline: valueOf(openPipeline), pipelineCount: openPipeline.length, topClients, avgQuoteMargin,
    },
    staff: { ore: oreTot, costo: costoTot, people, absences, straordinari: people.reduce((s, p) => s + p.straordinari, 0), costoOrarioMedio: oreTot ? costoTot / oreTot : null },
  };
}

export const eur = (v, compact = false) => new Intl.NumberFormat("it-IT", {
  style: "currency", currency: "EUR", useGrouping: "always",
  maximumFractionDigits: compact || Math.abs(Number(v) || 0) >= 1000 ? 0 : 2,
  ...(compact ? { notation: "compact" } : {}),
}).format(Number(v) || 0);
export const pct = (v, digits = 0) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(digits).replace(".", ",")}%`);
