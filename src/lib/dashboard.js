// Dashboard: numeri del giorno, previsione di cassa, agenda della settimana e urgenze.
import { OPEN_STATES, effectiveState, expiryDate } from "@/lib/quotes";
import { installments } from "@/lib/worksites";
import { computeInvoice } from "@/lib/invoices";
import { dayEntries, employedOn, isWorkingDay } from "@/lib/attendance";

const n = (v) => Number(v) || 0;
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, k) => { const d = new Date(s); d.setDate(d.getDate() + k); return iso(d); };
export const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const fmt = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n(v));
const it = (s) => new Date(s).toLocaleDateString("it-IT");

export function computeDashboard(d) {
  const now = new Date();
  const today = iso(now);
  const y = now.getFullYear();
  const mKey = today.slice(0, 7);
  const prev = new Date(y, now.getMonth() - 1, 1);
  const prevKey = iso(prev).slice(0, 7);
  const sumPay = (pred) => d.payments.filter(pred).reduce((s, p) => s + n(p.importo), 0);

  // ── Soldi ──
  const incassatoMese = sumPay((p) => String(p.data).startsWith(mKey));
  // stesso numero di giorni del mese precedente, per un confronto onesto
  const prevSameDay = `${prevKey}-${String(Math.min(now.getDate(), new Date(y, now.getMonth(), 0).getDate())).padStart(2, "0")}`;
  const incassatoPrev = sumPay((p) => String(p.data).startsWith(prevKey) && String(p.data) <= prevSameDay);
  const deltaMese = incassatoPrev ? ((incassatoMese - incassatoPrev) / incassatoPrev) * 100 : null;

  const trend = Array.from({ length: 12 }, (_, i) => {
    const dt = new Date(y, now.getMonth() - 11 + i, 1);
    const k = iso(dt).slice(0, 7);
    const kPrev = `${dt.getFullYear() - 1}${k.slice(4)}`;
    return { label: MESI[dt.getMonth()], incassi: sumPay((p) => String(p.data).startsWith(k)), annoPrima: sumPay((p) => String(p.data).startsWith(kPrev)) };
  });

  // Fatturato dell'anno: fatture emesse (imponibile, note di credito sottratte); se non si usano le fatture, gli incassi.
  const emesse = d.invoices.filter((i) => i.stato !== "bozza" && Number(i.anno) === y);
  const fatturatoAnno = emesse.length
    ? emesse.reduce((s, i) => s + (i.tipo_documento === "TD04" ? -1 : 1) * computeInvoice(i).imponibile, 0)
    : sumPay((p) => String(p.data).startsWith(String(y)));
  const fonteFatturato = emesse.length ? "fatture emesse" : "incassi";

  // ── Lavori ──
  const jobs = d.worksites.map((w) => {
    const pays = d.payments.filter((p) => p.worksite_id === w.id);
    const incassato = pays.reduce((s, p) => s + n(p.importo), 0);
    const totale = n(w.importo_totale);
    const rate = installments(w.piano_pagamenti || [], pays);
    const costi = d.transactions.filter((t) => t.worksite_id === w.id && t.tipo === "uscita").reduce((s, t) => s + n(t.importo), 0);
    const inRitardo = w.stato !== "finito" && w.data_fine_prevista && w.data_fine_prevista < today;
    // atteso: avanzamento in proporzione al tempo trascorso
    let atteso = null;
    if (w.data_inizio && w.data_fine_prevista && w.data_fine_prevista > w.data_inizio) {
      atteso = Math.max(0, Math.min(100, ((now - new Date(w.data_inizio)) / (new Date(w.data_fine_prevista) - new Date(w.data_inizio))) * 100));
    }
    return {
      ...w, incassato, totale, costi, daIncassare: Math.max(0, totale - incassato),
      scadute: rate.filter((r) => r.residuo > 0.005 && r.scadenza && r.scadenza < today),
      future: rate.filter((r) => r.residuo > 0.005 && (!r.scadenza || r.scadenza >= today)),
      inRitardo, atteso, indietro: atteso != null && n(w.avanzamento) + 15 < atteso,
    };
  });
  const running = jobs.filter((w) => w.stato === "in_corso").sort((a, b) => Number(b.inRitardo || b.indietro) - Number(a.inRitardo || a.indietro) || n(b.totale) - n(a.totale));
  const daIncassare = jobs.reduce((s, w) => s + w.daIncassare, 0);
  const scaduto = jobs.reduce((s, w) => s + w.scadute.reduce((t, r) => t + r.residuo, 0), 0);

  // ── Previsione di cassa: rate dei lavori e fatture emesse non pagate, per scadenza ──
  const openInv = d.invoices.filter((i) => ["emessa", "inviata"].includes(i.stato) && i.tipo_documento !== "TD04");
  const flows = [
    ...jobs.flatMap((w) => [...w.scadute, ...w.future].map((r) => ({ when: r.scadenza || null, amount: r.residuo, label: `${w.nome} · ${r.descrizione || "rata"}` }))),
    ...openInv.filter((i) => !i.worksite_id).map((i) => ({ when: i.scadenza || null, amount: computeInvoice(i).daPagare, label: `Fattura ${i.numero}` })),
  ];
  const bucket = (from, to) => flows.filter((f) => f.when && f.when > from && f.when <= to).reduce((s, f) => s + f.amount, 0);
  const forecast = [
    { label: "Già scaduto", value: flows.filter((f) => f.when && f.when <= today).reduce((s, f) => s + f.amount, 0), late: true },
    { label: "Entro 30 giorni", value: bucket(today, addDays(today, 30)) },
    { label: "31–60 giorni", value: bucket(addDays(today, 30), addDays(today, 60)) },
    { label: "61–90 giorni", value: bucket(addDays(today, 60), addDays(today, 90)) },
  ];

  // ── Oggi in cantiere ──
  const entries = dayEntries(d.attendance, today);
  const expected = d.employees.filter((e) => employedOn(e, today));
  const presentList = Object.values(entries).filter((e) => e.stato === "presente");
  const absentList = Object.values(entries).filter((e) => e.stato !== "presente");
  const bySite = {};
  for (const p of presentList) for (const c of p.cantieri.length ? p.cantieri : [{ cantiere_nome: "Senza cantiere" }]) (bySite[c.cantiere_nome || "Senza cantiere"] ||= []).push(p.dipendente_nome);

  // ── Agenda: prossimi 7 giorni ──
  const docs = [
    ...d.empDocs.map((x) => ({ ...x, _to: x.dipendente_id ? `/dipendenti/${x.dipendente_id}` : "/dipendenti" })),
    ...d.compDocs.map((x) => ({ ...x, _to: `/documenti-ditta?doc=${x.id}` })),
    ...d.contracts.filter((x) => !["concluso", "annullato"].includes(x.stato)).map((x) => ({ ...x, _to: `/contratti?id=${x.id}` })),
  ];
  const agenda = Array.from({ length: 7 }, (_, k) => {
    const day = addDays(today, k);
    const items = [
      ...d.reminders.filter((r) => !r.is_preavviso && r.data === day).map((r) => ({ kind: "promemoria", text: r.titolo, time: r.ora, to: "/promemoria" })),
      ...jobs.flatMap((w) => w.future.filter((r) => r.scadenza === day).map((r) => ({ kind: "incasso", text: `${w.cliente_nome || w.nome}: ${fmt(r.residuo)}`, to: `/lavori/${w.id}` }))),
      ...openInv.filter((i) => i.scadenza === day).map((i) => ({ kind: "incasso", text: `Fattura ${i.numero}: ${fmt(computeInvoice(i).daPagare)}`, to: `/fatture?id=${i.id}` })),
      ...docs.filter((x) => x.data_scadenza === day).map((x) => ({ kind: "scadenza", text: x.titolo || "Documento", to: x._to })),
      ...jobs.filter((w) => w.stato !== "finito" && w.data_fine_prevista === day).map((w) => ({ kind: "cantiere", text: `Fine prevista: ${w.nome}`, to: `/lavori/${w.id}` })),
    ];
    return { day, items, holiday: !isWorkingDay(day) };
  });

  // ── Urgenze ──
  const alerts = [];
  for (const w of jobs) for (const r of w.scadute) alerts.push({ sev: 3, kind: "soldi", text: `${w.cliente_nome || w.nome}: rata "${r.descrizione || "rata"}" non pagata`, meta: `${fmt(r.residuo)} · scaduta il ${it(r.scadenza)}`, to: `/lavori/${w.id}` });
  for (const i of openInv) if (i.scadenza && i.scadenza < today) alerts.push({ sev: 3, kind: "soldi", text: `Fattura ${i.numero} a ${i.cliente_nome || "cliente"} non pagata`, meta: `${fmt(computeInvoice(i).daPagare)} · scaduta il ${it(i.scadenza)}`, to: `/fatture?id=${i.id}` });
  for (const w of running) if (w.inRitardo) alerts.push({ sev: 2, kind: "cantiere", text: `${w.nome} oltre la fine prevista`, meta: `doveva finire il ${it(w.data_fine_prevista)} · al ${Math.round(n(w.avanzamento))}%`, to: `/lavori/${w.id}` });
  for (const x of docs.filter((z) => z.data_scadenza && z.data_scadenza <= addDays(today, 30))) {
    const late = x.data_scadenza < today;
    alerts.push({ sev: late ? 2 : 1, kind: "documento", text: `${x.titolo || "Documento"} ${late ? "scaduto" : "in scadenza"}`, meta: it(x.data_scadenza), to: x._to });
  }
  for (const q of d.quotes) {
    const st = effectiveState(q);
    if (st === "visto") alerts.push({ sev: 1, kind: "vendita", text: `${q.cliente_nome || "Il cliente"} ha aperto il preventivo ${q.numero}`, meta: "buon momento per chiamarlo", to: `/preventivi/${q.id}` });
    else if (OPEN_STATES.includes(q.stato)) { const exp = expiryDate(q); if (exp && iso(exp) >= today && iso(exp) <= addDays(today, 7)) alerts.push({ sev: 1, kind: "vendita", text: `Preventivo ${q.numero} (${q.cliente_nome || "—"}) scade presto`, meta: it(exp), to: `/preventivi/${q.id}` }); }
  }
  if (isWorkingDay(today) && expected.length && Object.keys(entries).length < expected.length && now.getHours() >= 10) {
    alerts.push({ sev: 1, kind: "cantiere", text: "Giornaliera di oggi incompleta", meta: `${expected.length - Object.keys(entries).length} dipendenti da registrare`, to: "/presenze" });
  }
  alerts.sort((a, b) => b.sev - a.sev);

  // ── Preventivi: imbuto degli ultimi 90 giorni ──
  const from90 = addDays(today, -90);
  const recent = d.quotes.filter((q) => q.data >= from90);
  const funnel = [
    { label: "Emessi", count: recent.length, value: recent.reduce((s, q) => s + n(q.imponibile || q.totale), 0) },
    { label: "Visti dal cliente", count: recent.filter((q) => q.visto_il || ["visto", "approvato", "rifiutato"].includes(q.stato)).length },
    { label: "Accettati", count: recent.filter((q) => q.stato === "approvato").length, value: recent.filter((q) => q.stato === "approvato").reduce((s, q) => s + n(q.imponibile || q.totale), 0) },
  ];
  const pending = d.quotes.filter((q) => OPEN_STATES.includes(q.stato) && effectiveState(q) !== "scaduto");

  return {
    today, incassatoMese, deltaMese, trend, fatturatoAnno, fonteFatturato, daIncassare, scaduto, running, forecast,
    presence: { present: presentList, absent: absentList, expected: expected.length, registered: Object.keys(entries).length, bySite, working: isWorkingDay(today) },
    agenda, alerts, funnel, pending, pipeline: pending.reduce((s, q) => s + n(q.imponibile || q.totale), 0),
  };
}
