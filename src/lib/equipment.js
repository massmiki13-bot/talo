// Mezzi e attrezzature: tipi, scadenze e stato.
export const TIPI_MEZZO = ["Autocarro", "Furgone", "Auto aziendale", "Escavatore", "Minipala / Bobcat", "Gru su autocarro", "Gru a torre", "Piattaforma aerea (PLE)", "Ponteggio", "Betoniera", "Generatore", "Attrezzatura elettrica", "Altro"];

export const SCADENZE = [
  { key: "revisione", label: "Revisione" },
  { key: "assicurazione", label: "Assicurazione" },
  { key: "bollo", label: "Bollo" },
  { key: "verifica_periodica", label: "Verifica periodica (INAIL / ente)" },
  { key: "manutenzione", label: "Prossima manutenzione" },
];

const dayMs = 86_400_000;
export const daysTo = (iso) => (iso ? Math.ceil((new Date(iso) - new Date(new Date().toDateString())) / dayMs) : null);

/** Scadenze di un mezzo ordinate, con stato: scaduta, entro 30 giorni, ok. */
export function deadlines(m) {
  return SCADENZE.map((s) => ({ ...s, data: m.scadenze?.[s.key] || "" }))
    .filter((s) => s.data)
    .map((s) => {
      const d = daysTo(s.data);
      return { ...s, giorni: d, stato: d < 0 ? "scaduta" : d <= 30 ? "vicina" : "ok" };
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}

export function statusOf(m) {
  const ds = deadlines(m);
  if (ds.some((d) => d.stato === "scaduta")) return { key: "scaduta", label: "Scadenza superata", cls: "bg-red-100 text-red-800" };
  if (ds.some((d) => d.stato === "vicina")) return { key: "vicina", label: "In scadenza", cls: "bg-amber-100 text-amber-900" };
  if (m.fuori_servizio) return { key: "fermo", label: "Fuori servizio", cls: "bg-zinc-200 text-zinc-700" };
  return { key: "ok", label: "In regola", cls: "bg-emerald-100 text-emerald-800" };
}

/** Il mezzo è impegnato su un cantiere in quel giorno? */
export const busyOn = (m, iso) => !!(m.assegnazione?.worksite_id && (!m.assegnazione.dal || m.assegnazione.dal <= iso) && (!m.assegnazione.al || m.assegnazione.al >= iso));
