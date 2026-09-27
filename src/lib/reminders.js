// Promemoria: categorie, date, ricorrenze e collegamenti ai record.
import { api } from "@/api/client";

export const REMINDER_TYPES = [
  { value: "appuntamento", label: "Appuntamento", color: "bg-blue-100 text-blue-800" },
  { value: "chiamata", label: "Chiamata", color: "bg-sky-100 text-sky-800" },
  { value: "cantiere", label: "Cantiere", color: "bg-emerald-100 text-emerald-800" },
  { value: "scadenza_documento", label: "Scadenza documento", color: "bg-amber-100 text-amber-800" },
  { value: "scadenza_contratto", label: "Scadenza contratto", color: "bg-orange-100 text-orange-800" },
  { value: "scadenza_fiscale", label: "Scadenza fiscale", color: "bg-red-100 text-red-800" },
  { value: "formazione", label: "Formazione / visite", color: "bg-violet-100 text-violet-800" },
  { value: "incasso", label: "Incasso", color: "bg-teal-100 text-teal-800" },
  { value: "pagamento", label: "Pagamento", color: "bg-rose-100 text-rose-800" },
  { value: "sollecito_preventivo", label: "Sollecito preventivo", color: "bg-indigo-100 text-indigo-800" },
  { value: "altro", label: "Altro", color: "bg-slate-100 text-slate-700" },
];
export const reminderType = (v) => REMINDER_TYPES.find((t) => t.value === v) || REMINDER_TYPES.at(-1);

export const PRIORITIES = [
  { value: "alta", label: "Alta", dot: "bg-red-500" },
  { value: "normale", label: "Normale", dot: "bg-slate-300" },
  { value: "bassa", label: "Bassa", dot: "bg-slate-200" },
];

export const RECURRENCES = [
  { value: "nessuna", label: "Non si ripete" },
  { value: "settimanale", label: "Ogni settimana" },
  { value: "mensile", label: "Ogni mese" },
  { value: "trimestrale", label: "Ogni 3 mesi" },
  { value: "annuale", label: "Ogni anno" },
];

export const ANTICIPI = [
  { value: "0", label: "Nessun avviso prima" },
  { value: "1", label: "1 giorno prima" },
  { value: "3", label: "3 giorni prima" },
  { value: "7", label: "1 settimana prima" },
  { value: "14", label: "2 settimane prima" },
  { value: "30", label: "1 mese prima" },
  { value: "60", label: "2 mesi prima" },
];

// Date locali come "YYYY-MM-DD" (niente UTC: evita slittamenti di un giorno).
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayIso = () => iso(new Date());
export const parseIso = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };

export function nextOccurrence(dateStr, ricorrenza) {
  const d = parseIso(dateStr);
  if (ricorrenza === "settimanale") d.setDate(d.getDate() + 7);
  else if (ricorrenza === "mensile") d.setMonth(d.getMonth() + 1);
  else if (ricorrenza === "trimestrale") d.setMonth(d.getMonth() + 3);
  else if (ricorrenza === "annuale") d.setFullYear(d.getFullYear() + 1);
  else return null;
  return iso(d);
}

export function bucketOf(r, today = todayIso()) {
  if (r.completato) return "done";
  if (r.data < today) return "overdue";
  if (r.data === today) return "today";
  if (r.data === addDays(today, 1)) return "tomorrow";
  if (r.data <= addDays(today, 7)) return "week";
  return "later";
}

export const BUCKETS = [
  { key: "overdue", label: "In ritardo", tone: "text-red-700" },
  { key: "today", label: "Oggi", tone: "text-blue-700" },
  { key: "tomorrow", label: "Domani", tone: "text-slate-900" },
  { key: "week", label: "Prossimi 7 giorni", tone: "text-slate-900" },
  { key: "later", label: "Più avanti", tone: "text-slate-900" },
];

export const fmtDay = (s) => {
  const d = parseIso(s);
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
};

// Pagina del record collegato (null se non navigabile).
export function linkFor(r) {
  if (!r.riferimento_id) return null;
  switch (r.riferimento_tipo) {
    case "CompanyDocument": return `/documenti-ditta?doc=${r.riferimento_id}`;
    case "Quote": return `/preventivi/${r.riferimento_id}`;
    case "Worksite": return `/lavori/${r.riferimento_id}`;
    case "Contact": return `/contatti/${r.riferimento_id}`;
    case "Employee": return `/dipendenti/${r.riferimento_id}`;
    default: return null;
  }
}
export const LINK_LABEL = { CompanyDocument: "Apri documento", Quote: "Apri preventivo", Worksite: "Apri lavoro", Contact: "Apri scheda", Employee: "Apri dipendente", EmployeeDocument: "Apri dipendente" };

/** Trasforma una frase ("chiamare Rossi venerdì alle 10") in un promemoria. */
export async function parseQuickReminder(text) {
  const today = todayIso();
  const weekday = new Date().toLocaleDateString("it-IT", { weekday: "long" });
  const res = await api.integrations.Core.InvokeLLM({
    prompt: `Oggi è ${weekday} ${today} (fuso Europe/Rome). Trasforma la frase in un promemoria per un'impresa edile.
Frase: "${text}"
- titolo: breve, all'infinito o come nota (es. "Chiamare Rossi per il sopralluogo").
- data YYYY-MM-DD: interpreta "domani", "lunedì", "fra 2 settimane", "fine mese"; se manca, usa oggi.
- ora HH:MM solo se indicata.
- tipo tra: ${REMINDER_TYPES.map((t) => t.value).join(", ")}.
- priorita: alta se c'è urgenza ("urgente", "assolutamente"), altrimenti normale.
- ricorrenza tra: ${RECURRENCES.map((r) => r.value).join(", ")}.`,
    response_json_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" }, descrizione: { type: "string" }, data: { type: "string" }, ora: { type: "string" },
        tipo: { type: "string" }, priorita: { type: "string" }, ricorrenza: { type: "string" }, luogo: { type: "string" },
      },
      required: ["titolo", "data"],
    },
  });
  const r = res || {};
  return {
    titolo: String(r.titolo || text).slice(0, 160),
    descrizione: r.descrizione || "",
    data: /^\d{4}-\d{2}-\d{2}$/.test(r.data || "") ? r.data : today,
    ora: /^\d{2}:\d{2}$/.test(r.ora || "") ? r.ora : "",
    tipo: REMINDER_TYPES.some((t) => t.value === r.tipo) ? r.tipo : "altro",
    priorita: ["alta", "normale", "bassa"].includes(r.priorita) ? r.priorita : "normale",
    ricorrenza: RECURRENCES.some((x) => x.value === r.ricorrenza) ? r.ricorrenza : "nessuna",
    luogo: r.luogo || "",
  };
}
