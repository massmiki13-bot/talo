// Cronoprogramma: periodi di lavori, fasi, squadre e mezzi, con le sovrapposizioni.
const dayMs = 86_400_000;
export const toDate = (iso) => new Date(`${iso}T00:00:00`);
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a, b) => Math.round((+toDate(b) - +toDate(a)) / dayMs);

/** Periodo del lavoro: date indicate, altrimenti inizio oggi e 30 giorni di durata. */
export function worksiteSpan(w, today = iso(new Date())) {
  const start = w.data_inizio || today;
  let end = w.data_fine_effettiva || w.data_fine_prevista || addDays(start, 30);
  if (end < start) end = start;
  return { start, end, stimato: !w.data_inizio || !(w.data_fine_effettiva || w.data_fine_prevista) };
}

/**
 * Periodi delle fasi: se la fase ha date proprie si usano, altrimenti il periodo del lavoro
 * viene diviso in proporzione al peso, in ordine.
 */
export function phaseSpans(w, today) {
  const { start, end } = worksiteSpan(w, today);
  const fasi = w.fasi || [];
  const tot = fasi.reduce((s, f) => s + (Number(f.peso) || 1), 0) || 1;
  const len = diffDays(start, end) + 1;
  let cursor = 0;
  return fasi.map((f) => {
    const days = Math.max(1, Math.round((len * (Number(f.peso) || 1)) / tot));
    const s = f.inizio || addDays(start, cursor);
    const e = f.fine || addDays(start, Math.min(len - 1, cursor + days - 1));
    cursor += days;
    return { nome: f.nome, start: s, end: e < s ? s : e, completamento: Number(f.completamento) || 0, stimato: !(f.inizio && f.fine) };
  });
}

const overlap = (a, b) => a.start <= b.end && b.start <= a.end;

/**
 * Impegni di persone e mezzi: per ognuno i periodi sui vari cantieri e i tratti in cui due cantieri si sovrappongono.
 * people: [{ id, nome }], equipment: [{ id, nome, assegnazione }]
 */
export function loads({ worksites = [], employees = [], equipment = [] }, today) {
  const active = worksites.filter((w) => w.stato !== "finito");
  const row = (id, nome, items) => {
    const clashes = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      if (overlap(items[i], items[j])) clashes.push({ start: items[i].start > items[j].start ? items[i].start : items[j].start, end: items[i].end < items[j].end ? items[i].end : items[j].end, tra: [items[i].nome, items[j].nome] });
    }
    return { id, nome, items, clashes };
  };
  const people = employees.map((e) => row(e.id, `${e.nome || ""} ${e.cognome || ""}`.trim(), active.filter((w) => (w.squadra_ids || []).includes(e.id)).map((w) => ({ ...worksiteSpan(w, today), nome: w.nome, worksite_id: w.id }))))
    .filter((r) => r.items.length);
  const machines = equipment.filter((m) => m.assegnazione?.worksite_id).map((m) => {
    const w = worksites.find((x) => x.id === m.assegnazione.worksite_id);
    const span = w ? worksiteSpan(w, today) : { start: today, end: today };
    return row(m.id, m.nome, [{ start: m.assegnazione.dal || span.start, end: m.assegnazione.al || span.end, nome: m.assegnazione.worksite_nome || w?.nome || "Cantiere", worksite_id: m.assegnazione.worksite_id }]);
  });
  return { people, machines };
}
