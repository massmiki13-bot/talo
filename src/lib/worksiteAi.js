// L'IA compila la scheda del lavoro da una descrizione libera e/o dal preventivo collegato.
import { api } from "@/lib/db";
import { TIPI_INTERVENTO, TITOLI_EDILIZI, COST_CATEGORIES } from "@/lib/worksites";

const str = { type: "string" };
const num = { type: "number" };
const today = () => new Date().toISOString().slice(0, 10);

export async function aiFillWorksite({ descrizione, quote, cliente, employees = [] }) {
  const voci = (quote?.righe || []).filter((r) => !r.tipo || r.tipo === "voce" || r.tipo === "capitolo")
    .map((r) => (r.tipo === "capitolo" ? `## ${r.descrizione}` : `- ${r.descrizione} (${r.quantita} ${r.unita_misura}, ${r.prezzo_unitario} €)`)).join("\n").slice(0, 12000);
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Sei il direttore tecnico di un'impresa edile italiana. Prepara la scheda di un nuovo lavoro (cantiere) usando le informazioni disponibili.
Oggi è ${today()}.
${descrizione ? `Descrizione del titolare: """${descrizione}"""` : ""}
${cliente ? `Cliente: ${cliente}` : ""}
${quote ? `Preventivo accettato "${quote.oggetto || ""}" per ${quote.totale || 0} € IVA inclusa (imponibile ${quote.imponibile || 0} €). Voci:\n${voci}` : ""}
${employees.length ? `Dipendenti disponibili (id: nome – mansione): ${employees.map((e) => `${e.id}: ${e.nome} ${e.cognome} – ${e.ruolo || e.qualifica || ""}`).join("; ")}` : ""}

Compila:
- nome: titolo breve e chiaro del lavoro (es. "Ristrutturazione bagno – Via Roma 12").
- tipo_intervento: uno tra ${TIPI_INTERVENTO.filter((t) => t !== "Altro").join(", ")}; se nessuno è adatto scrivi un tipo specifico breve.
- indirizzo: solo se indicato nelle informazioni.
- durata_giorni_lavorativi: stima realistica dei giorni lavorativi.
- data_inizio: AAAA-MM-GG solo se indicata, altrimenti vuota.
- fasi: 4–8 fasi operative nell'ordine di esecuzione, con peso % sul totale (somma 100).
- budget: stima dei costi per categoria (${COST_CATEGORIES.join(", ")}) in euro, coerente con l'importo del preventivo (margine d'impresa tipico 20–30%); vuoto se non c'è un importo.
- titolo_edilizio: il titolo abilitativo più probabile tra ${TITOLI_EDILIZI.join(", ")}.
- squadra_ids: gli id dei dipendenti più adatti alle lavorazioni (massimo 5), solo tra quelli elencati.
- note: 2–4 punti operativi utili al capocantiere (materiali, accessi, permessi, rischi particolari).`,
    response_json_schema: {
      type: "object",
      properties: {
        nome: str, tipo_intervento: str, indirizzo: str, durata_giorni_lavorativi: num, data_inizio: str,
        fasi: { type: "array", items: { type: "object", properties: { nome: str, peso: num } } },
        budget: { type: "object", properties: Object.fromEntries(COST_CATEGORIES.map((c) => [c, num])) },
        titolo_edilizio: str, squadra_ids: { type: "array", items: str }, note: str,
      },
    },
  });

  const start = /^\d{4}-\d{2}-\d{2}$/.test(r.data_inizio || "") ? r.data_inizio : "";
  let fine = "";
  if (r.durata_giorni_lavorativi > 0) {
    const d = new Date(start || today());
    let left = Math.round(r.durata_giorni_lavorativi);
    while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left--; }
    fine = d.toISOString().slice(0, 10);
  }
  const ids = new Set(employees.map((e) => e.id));
  return {
    nome: r.nome || "", tipo_intervento: r.tipo_intervento || "", indirizzo: r.indirizzo || "",
    data_inizio: start, data_fine_prevista: fine,
    fasi: (r.fasi || []).filter((f) => f.nome).map((f) => ({ nome: f.nome, peso: Math.max(1, Math.round(Number(f.peso) || 10)), completamento: 0 })),
    budget: Object.fromEntries(COST_CATEGORIES.map((c) => [c, Number(r.budget?.[c]) > 0 ? Math.round(Number(r.budget[c])) : ""]).filter(([, v]) => v !== "")),
    titolo_edilizio: TITOLI_EDILIZI.includes(r.titolo_edilizio) ? r.titolo_edilizio : "",
    squadra_ids: (r.squadra_ids || []).filter((id) => ids.has(id)).slice(0, 5),
    note: r.note || "",
  };
}
