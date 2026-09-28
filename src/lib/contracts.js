// Contratti: categorie dei modelli, stati, precompilazione dalle anagrafiche e IA.
import { api } from "@/api/client";
import { contractSchemas, fieldDefinitions } from "@/utils/contracts";

export const CATEGORIES = [
  { key: "lavoro", label: "Personale", desc: "Assunzioni e collaborazioni", types: ["indeterminato", "determinato", "part_time", "apprendistato", "prestazione_occasionale", "collaborazione"] },
  { key: "commerciale", label: "Appalti e forniture", desc: "Clienti, subappaltatori, fornitori", types: ["appalto", "subappalto", "fornitura", "noleggio_comodato", "lettera_incarico"] },
  { key: "altro", label: "Accordi e verbali", desc: "Riservatezza e intese", types: ["nda", "verbale_generico"] },
];
export const categoryOf = (tipo) => (tipo?.startsWith("custom_") ? "custom" : CATEGORIES.find((c) => c.types.includes(tipo))?.key || "altro");
export const typeTitle = (tipo, customTemplates = []) =>
  tipo?.startsWith("custom_") ? customTemplates.find((t) => `custom_${t.id}` === tipo)?.nome || "Modello personalizzato" : contractSchemas[tipo]?.title || tipo || "Contratto";

// Chi è la controparte per ogni modello: guida la precompilazione.
export const partyKind = (tipo) => (categoryOf(tipo) === "lavoro" ? "dipendente" : "contatto");

export const STATI = [
  { value: "bozza", label: "Bozza", className: "bg-slate-100 text-slate-700" },
  { value: "inviato", label: "Da firmare", className: "bg-amber-100 text-amber-800" },
  { value: "firmato", label: "Firmato", className: "bg-emerald-100 text-emerald-800" },
  { value: "concluso", label: "Concluso", className: "bg-blue-100 text-blue-800" },
  { value: "annullato", label: "Annullato", className: "bg-red-100 text-red-700" },
];
export const statoOf = (c) => STATI.find((s) => s.value === (c.stato || "bozza")) || STATI[0];

const fmtIt = (s) => (s ? new Date(s).toLocaleDateString("it-IT") : "");

export function fromEmployee(e) {
  if (!e) return {};
  return {
    NOME_CONTROPARTE: `${e.nome || ""} ${e.cognome || ""}`.trim(),
    CF_CONTROPARTE: e.codice_fiscale || "",
    DATA_NASCITA: e.data_nascita || "",
    LUOGO_NASCITA: e.luogo_nascita || "",
    INDIRIZZO_CONTROPARTE: e.indirizzo || "",
    MANSIONE: e.qualifica || e.ruolo || "",
    LIVELLO: e.livello || "",
    CCNL_APPLICABILE: e.ccnl || "",
    ORE_SETTIMANALI: e.ore_settimanali || "",
    DATA_INIZIO: e.data_assunzione || "",
    DATA_FINE: e.data_fine_contratto || "",
    IBAN_PAGAMENTO: e.iban || "",
  };
}

export function fromContact(c) {
  if (!c) return {};
  const addr = [c.indirizzo, [c.cap, c.citta].filter(Boolean).join(" "), c.provincia && `(${c.provincia})`].filter(Boolean).join(", ");
  return {
    NOME_CONTROPARTE: c.nome || c.ragione_sociale || c.nome_privato || "",
    PIVA_CONTROPARTE: c.partita_iva || "",
    CF_CONTROPARTE: c.codice_fiscale || "",
    SEDE_CONTROPARTE: addr,
    INDIRIZZO_CONTROPARTE: addr,
  };
}

export function fromWorksite(w) {
  if (!w) return {};
  return {
    OGGETTO_LAVORI: [w.tipo_intervento, w.nome].filter(Boolean).join(" – "),
    LUOGO_ESECUZIONE: w.indirizzo || w.nome || "",
    IMPORTO: w.importo_totale || "",
    DATA_INIZIO: w.data_inizio || "",
    DATA_FINE: w.data_fine_prevista || "",
  };
}

// Campi del contratto che finiscono nelle colonne della scheda (ricerca, scadenze, valore).
export function summaryFields(fields = {}) {
  const num = (v) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")) || null);
  return {
    controparte_nome: fields.NOME_CONTROPARTE || "",
    data_inizio: fields.DATA_INIZIO || null,
    data_scadenza: fields.DATA_FINE || fields.DATA_CONSEGNA || null,
    importo: num(fields.IMPORTO) ?? num(fields.COMPENSO) ?? num(fields.IMPORTO_CANONE) ?? null,
  };
}

export const missingRequired = (tipo, fields) => (contractSchemas[tipo]?.required || []).filter((k) => !String(fields[k] ?? "").trim());
export const fieldLabel = (k) => fieldDefinitions[k]?.label || k.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Compila i campi del modello a partire da una descrizione a parole. */
export async function aiFillFields(tipo, keys, description, known = {}) {
  const props = Object.fromEntries(keys.map((k) => [k, { type: "string", description: fieldLabel(k) }]));
  const res = await api.integrations.Core.InvokeLLM({
    prompt: `Sei un consulente di un'impresa edile italiana. Compila i campi di un "${typeTitle(tipo)}" usando SOLO le informazioni della descrizione e dei dati noti.
Descrizione dell'accordo: """${description}"""
Dati già noti: ${JSON.stringify(Object.fromEntries(Object.entries(known).filter(([, v]) => v)))}
Regole: date in formato YYYY-MM-DD; importi solo numero (es. 12500); testo formale e chiaro in italiano; lascia vuoto ("") ciò che non è indicato, non inventare dati anagrafici, codici fiscali o partite IVA.`,
    response_json_schema: { type: "object", properties: props },
  });
  const out = {};
  for (const k of keys) {
    const v = res?.[k];
    if (v != null && String(v).trim()) out[k] = String(v).trim();
  }
  return out;
}

/** Revisione del testo: lacune, rischi e clausole da aggiungere. */
export async function aiReview(contract) {
  return api.integrations.Core.InvokeLLM({
    prompt: `Sei un consulente legale esperto di contratti per imprese edili e impiantistiche italiane. Rivedi questo "${contract.titolo}".
Individua: dati mancanti o segnaposto non compilati (es. "__________"), incoerenze (date, importi, parti), clausole importanti assenti per questo tipo di contratto (es. sicurezza D.Lgs. 81/08, DURC, tracciabilità L. 136/2010 per appalti, penali, SAL, garanzie; per il lavoro: CCNL, periodo di prova, orario), e rischi per l'impresa.
Sii concreto e sintetico. Non è una consulenza legale formale.

TESTO:
${String(contract.contenuto_finale || "").slice(0, 24000)}`,
    response_json_schema: {
      type: "object",
      properties: {
        giudizio: { type: "string", description: "una frase di sintesi" },
        punteggio: { type: "number", description: "completezza da 1 a 10" },
        problemi: { type: "array", items: { type: "object", properties: { gravita: { type: "string", enum: ["alta", "media", "bassa"] }, testo: { type: "string" } }, required: ["gravita", "testo"] } },
      },
      required: ["giudizio", "problemi"],
    },
  });
}

export const fmtDate = fmtIt;
