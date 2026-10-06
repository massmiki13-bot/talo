// Lavori: stati, categorie di costo, avanzamento, economia e rate.

export const WORKSITE_STATES = {
  da_iniziare: { label: "Da iniziare", className: "bg-zinc-100 text-zinc-700 border-zinc-200", dot: "bg-zinc-400" },
  in_corso: { label: "In corso", className: "bg-zinc-200 text-zinc-800 border-zinc-300", dot: "bg-brand-500" },
  sospeso: { label: "Sospeso", className: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  finito: { label: "Finito", className: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
};

export const COST_CATEGORIES = ["Materiali", "Manodopera", "Noleggi", "Subappalti", "Altro"];
export const INCOME_CATEGORIES = ["Acconto", "SAL", "Saldo", "Extra / varianti", "Altro"];

export const TIPI_INTERVENTO = [
  "Ristrutturazione", "Nuova costruzione", "Manutenzione ordinaria", "Manutenzione straordinaria", "Impianto elettrico",
  "Impianto idraulico/termico", "Fotovoltaico", "Rifacimento tetto/copertura", "Facciata / cappotto", "Demolizione", "Altro",
];

export const TITOLI_EDILIZI = ["Edilizia libera", "CILA", "SCIA", "SCIA alternativa al PdC", "Permesso di costruire", "Altro"];

export const METEO = ["Sereno", "Nuvoloso", "Pioggia", "Neve", "Vento forte", "Nebbia"];

export const FASI_TIPO = [
  { nome: "Allestimento cantiere", peso: 5 },
  { nome: "Demolizioni e rimozioni", peso: 10 },
  { nome: "Opere murarie", peso: 25 },
  { nome: "Impianti", peso: 25 },
  { nome: "Finiture", peso: 25 },
  { nome: "Pulizia e consegna", peso: 10 },
];

const n = (v) => Number(v) || 0;

// Avanzamento pesato: somma(peso × completamento) / somma(pesi).
export function progress(fasi = []) {
  const tot = fasi.reduce((s, f) => s + n(f.peso || 1), 0);
  if (!tot) return 0;
  return Math.round(fasi.reduce((s, f) => s + n(f.peso || 1) * Math.min(100, n(f.completamento)), 0) / tot);
}

// Ore e costo manodopera del lavoro dalle presenze (anche giornate miste su più cantieri).
export function laborFromAttendance(attendance = [], employees = [], worksiteId) {
  const rate = new Map(employees.map((e) => [e.id, n(e.costo_orario)]));
  let ore = 0;
  let costo = 0;
  const giorni = new Set();
  const persone = new Map();
  for (const a of attendance) {
    for (const p of a.presenze || []) {
      const site = p.cantiere_id || a.cantiere_id;
      if (site !== worksiteId) continue;
      if (p.stato && p.stato !== "presente") continue;
      const h = n(p.ore);
      ore += h;
      costo += h * (rate.get(p.dipendente_id) || 0);
      giorni.add(a.data);
      persone.set(p.dipendente_id, (persone.get(p.dipendente_id) || 0) + h);
    }
  }
  return { ore, costo, giorni: giorni.size, persone };
}

/**
 * Economia del lavoro.
 * ricavo = importo del contratto (lavoro o preventivo) · costi reali per categoria (uscite + manodopera)
 */
export function economics({ worksite, transactions = [], labor, quoteTotal = 0 }) {
  const ricavo = n(worksite?.importo_totale) || n(quoteTotal);
  const budget = worksite?.budget || {};
  const byCat = Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0]));
  for (const t of transactions.filter((x) => x.tipo === "uscita")) {
    const c = COST_CATEGORIES.includes(t.categoria) ? t.categoria : "Altro";
    byCat[c] += n(t.importo);
  }
  const manodoperaManuale = worksite?.costo_manodopera_manuale;
  byCat.Manodopera += manodoperaManuale !== null && manodoperaManuale !== undefined && manodoperaManuale !== "" ? n(manodoperaManuale) : labor.costo;
  const costi = Object.values(byCat).reduce((s, v) => s + v, 0);
  const budgetTot = COST_CATEGORIES.reduce((s, c) => s + n(budget[c]), 0);
  const entrate = transactions.filter((x) => x.tipo === "entrata").reduce((s, t) => s + n(t.importo), 0);
  const avanzamento = n(worksite?.avanzamento);
  // Stima a finire: se il budget c'è, costi finali = max(costi reali, budget); altrimenti proiezione sull'avanzamento.
  const stimaFinale = budgetTot ? Math.max(costi, budgetTot) : avanzamento > 5 ? costi / (avanzamento / 100) : null;
  return {
    ricavo,
    costi,
    byCat,
    budget,
    budgetTot,
    entrate,
    margineReale: ricavo - costi,
    marginePrevisto: budgetTot ? ricavo - budgetTot : null,
    margineStimato: stimaFinale !== null ? ricavo - stimaFinale : null,
    sforamenti: COST_CATEGORIES.filter((c) => n(budget[c]) > 0 && byCat[c] > n(budget[c])),
    consumoBudget: budgetTot ? (costi / budgetTot) * 100 : null,
  };
}

/**
 * Tutti gli incassi di un lavoro: pagamenti registrati in "Incassi" più le entrate inserite tra i movimenti.
 * Così scheda del lavoro, elenco, Dashboard e analisi mostrano sempre gli stessi numeri.
 */
export function incomeOf(payments = [], transactions = []) {
  return [
    ...payments,
    ...transactions.filter((t) => t.tipo === "entrata").map((t) => ({ id: t.id, importo: t.importo, data: t.data, worksite_id: t.worksite_id, tipo: "entrata", descrizione: t.descrizione, da_movimenti: true })),
  ];
}

// Rate del piano pagamenti con lo stato calcolato dai pagamenti registrati (in ordine).
export function installments(piano = [], payments = []) {
  let paid = payments.reduce((s, p) => s + n(p.importo), 0);
  const today = new Date(new Date().toDateString());
  return [...piano]
    .sort((a, b) => String(a.scadenza || "9999").localeCompare(String(b.scadenza || "9999")))
    .map((r) => {
      const imp = n(r.importo);
      const covered = Math.min(imp, Math.max(0, paid));
      paid -= covered;
      const stato = covered >= imp - 0.005 ? "pagata" : covered > 0 ? "parziale" : r.scadenza && new Date(r.scadenza) < today ? "scaduta" : "da_pagare";
      return { ...r, pagato: covered, residuo: imp - covered, stato };
    });
}

export const INSTALLMENT_STATE = {
  pagata: { label: "Pagata", className: "bg-emerald-100 text-emerald-800" },
  parziale: { label: "Parziale", className: "bg-amber-100 text-amber-800" },
  scaduta: { label: "Scaduta", className: "bg-red-100 text-red-700" },
  da_pagare: { label: "Da pagare", className: "bg-zinc-100 text-zinc-700" },
};

export const daysBetween = (a, b) => Math.round((+new Date(b) - +new Date(a)) / 86_400_000);

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("it-IT") : "—");
