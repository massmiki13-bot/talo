// Calcoli e costanti dei preventivi, condivisi da editor, elenco, PDF e pagina pubblica.

export const UNIT_OPTIONS = [
  { value: "mq", label: "m²", tooltip: "Metro quadrato" },
  { value: "mc", label: "m³", tooltip: "Metro cubo" },
  { value: "m", label: "m", tooltip: "Metro" },
  { value: "ml", label: "ml", tooltip: "Metro lineare" },
  { value: "cad", label: "cad", tooltip: "Cadauno" },
  { value: "ore", label: "ore", tooltip: "Ore lavorative" },
  { value: "gg", label: "gg", tooltip: "Giorni" },
  { value: "corpo", label: "a corpo", tooltip: "A corpo (prezzo fisso per intervento)" },
  { value: "kg", label: "kg", tooltip: "Chilogrammo" },
  { value: "t", label: "t", tooltip: "Tonnellata" },
  { value: "nr", label: "nr", tooltip: "Numero" },
];

// tipo: "voce" (riga con prezzo) · "capitolo" (titolo di sezione) · "testo" (solo descrizione)
export const emptyRow = (iva = 22) => ({ tipo: "voce", descrizione: "", unita_misura: "cad", quantita: 1, prezzo_unitario: 0, sconto: 0, iva_percentuale: iva, costo_unitario: null, opzionale: false });
export const chapterRow = () => ({ tipo: "capitolo", descrizione: "" });
export const textRow = () => ({ tipo: "testo", descrizione: "" });

export const isVoce = (r) => !r.tipo || r.tipo === "voce";

const n = (v) => Number(v) || 0;

export const rowTotal = (r) => (isVoce(r) ? n(r.quantita) * n(r.prezzo_unitario) * (1 - n(r.sconto) / 100) : 0);
export const rowCost = (r) => (isVoce(r) && r.costo_unitario !== null && r.costo_unitario !== undefined && r.costo_unitario !== "" ? n(r.quantita) * n(r.costo_unitario) : null);

// Totali: le voci opzionali sono mostrate ma escluse. Sconto globale sul totale imponibile.
export function calcQuote(righe = [], { sconto_globale = 0 } = {}) {
  const incluse = righe.filter((r) => isVoce(r) && !r.opzionale);
  const lordo = incluse.reduce((s, r) => s + rowTotal(r), 0);
  const factor = 1 - n(sconto_globale) / 100;
  const ivaMap = new Map();
  for (const r of incluse) {
    const base = rowTotal(r) * factor;
    const aliquota = n(r.iva_percentuale);
    ivaMap.set(aliquota, (ivaMap.get(aliquota) || 0) + base);
  }
  const iva = [...ivaMap.entries()].sort((a, b) => b[0] - a[0]).map(([aliquota, imponibile]) => ({ aliquota, imponibile, imposta: imponibile * aliquota / 100 }));
  const imponibile = lordo * factor;
  const iva_totale = iva.reduce((s, x) => s + x.imposta, 0);
  const opzionali = righe.filter((r) => isVoce(r) && r.opzionale).reduce((s, r) => s + rowTotal(r), 0);

  const costed = incluse.filter((r) => rowCost(r) !== null);
  const costo = costed.reduce((s, r) => s + rowCost(r), 0);
  const ricavoCosted = costed.reduce((s, r) => s + rowTotal(r) * factor, 0);
  const margine = costed.length ? ricavoCosted - costo : null;

  return {
    lordo,
    sconto_importo: lordo - imponibile,
    imponibile,
    iva,
    iva_totale,
    totale: imponibile + iva_totale,
    opzionali,
    costo: costed.length ? costo : null,
    margine,
    margine_pct: costed.length && ricavoCosted ? (margine / ricavoCosted) * 100 : null,
    voci_senza_costo: incluse.length - costed.length,
  };
}

// Subtotale di ogni capitolo (voci fino al capitolo successivo).
export function chapterTotals(righe = []) {
  const out = [];
  let current = null;
  for (const r of righe) {
    if (r.tipo === "capitolo") {
      current = { titolo: r.descrizione || "Capitolo", totale: 0 };
      out.push(current);
    } else if (current && isVoce(r) && !r.opzionale) {
      current.totale += rowTotal(r);
    }
  }
  return out;
}

export const QUOTE_STATES = {
  in_attesa: { label: "Da inviare", className: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  inviato: { label: "Inviato", className: "bg-zinc-200 text-zinc-800 border-zinc-300" },
  visto: { label: "Visto dal cliente", className: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  approvato: { label: "Accettato", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  rifiutato: { label: "Rifiutato", className: "bg-red-100 text-red-700 border-red-200" },
  scaduto: { label: "Scaduto", className: "bg-amber-100 text-amber-800 border-amber-200" },
};

export const OPEN_STATES = ["in_attesa", "inviato", "visto"];

export function expiryDate(q) {
  if (!q?.data || !q.validita_giorni) return null;
  const d = new Date(q.data);
  d.setDate(d.getDate() + Number(q.validita_giorni));
  return d;
}

// Stato mostrato: un preventivo aperto oltre la validità risulta scaduto.
export function effectiveState(q) {
  const exp = expiryDate(q);
  if (OPEN_STATES.includes(q.stato) && exp && exp < new Date(new Date().toDateString())) return "scaduto";
  return q.stato || "in_attesa";
}

export const fmtEur = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(Number(v) || 0);

export const DEFAULT_CLAUSOLE = [
  "I prezzi si intendono IVA esclusa, salvo diversa indicazione.",
  "Sono esclusi dal presente preventivo tutti i lavori e le forniture non espressamente indicati.",
  "Eventuali lavori aggiuntivi o varianti saranno quantificati a parte e concordati prima dell'esecuzione.",
  "Le misure indicate sono da verificare in contraddittorio a fine lavori; si contabilizzeranno le quantità effettivamente eseguite.",
  "I tempi di esecuzione decorrono dalla data di accettazione e dal versamento dell'eventuale acconto.",
].join("\n");

// Testo delle condizioni stampato nel PDF e mostrato al cliente.
export function conditionsText(q) {
  const lines = [];
  if (q.condizioni_pagamento) lines.push(`Pagamento: ${q.condizioni_pagamento}`);
  if (q.tempi_esecuzione) lines.push(`Tempi di esecuzione: ${q.tempi_esecuzione}`);
  if (q.validita_giorni) {
    const exp = expiryDate(q);
    lines.push(`Validità dell'offerta: ${q.validita_giorni} giorni${exp ? ` (fino al ${exp.toLocaleDateString("it-IT")})` : ""}`);
  }
  if (q.clausole?.trim()) lines.push("", q.clausole.trim());
  return lines.join("\n");
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
