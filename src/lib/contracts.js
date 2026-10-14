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
  { value: "bozza", label: "Bozza", className: "bg-zinc-100 text-zinc-700" },
  { value: "inviato", label: "Da firmare", className: "bg-amber-100 text-amber-800" },
  { value: "firmato", label: "Firmato", className: "bg-emerald-100 text-emerald-800" },
  { value: "concluso", label: "Concluso", className: "bg-zinc-200 text-zinc-800" },
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

/**
 * Compila i campi del modello con l'IA: descrizione libera, dati collegati (lavoro, preventivi, controparte)
 * e documenti allegati (preventivo accettato, capitolato, offerta del subappaltatore…).
 */
export async function aiFillFields(tipo, keys, description, known = {}, { context = {}, fileUrls = [], optionalKeys = [] } = {}) {
  const props = Object.fromEntries(keys.map((k) => [k, { type: "string", description: fieldLabel(k) }]));
  const ctx = Object.fromEntries(Object.entries(context).filter(([, v]) => v && (typeof v !== "object" || Object.keys(v).length)));
  const res = await api.integrations.Core.InvokeLLM({
    prompt: `Sei un consulente di un'impresa edile italiana. Compila il maggior numero possibile di campi di un "${typeTitle(tipo)}".
${description ? `Descrizione dell'accordo: """${description}"""` : ""}
Dati già noti nei campi: ${JSON.stringify(Object.fromEntries(Object.entries(known).filter(([, v]) => v)))}
${Object.keys(ctx).length ? `Dati collegati in Talo (lavoro, preventivi, controparte, impresa): ${JSON.stringify(ctx).slice(0, 20000)}` : ""}
${fileUrls.length ? "Leggi anche i documenti allegati e usane i dati (oggetto, importi, tempi, pagamenti, penali, luogo)." : ""}
Regole:
- usa le informazioni fornite; date in formato AAAA-MM-GG; importi solo numero (es. 12500);
- ${optionalKeys.length ? `per le clausole facoltative (${optionalKeys.map(fieldLabel).join(", ")}) scrivi un testo formale e prudente, adatto a un'impresa edile italiana, quando sono pertinenti a questo contratto;` : ""}
- non inventare mai dati anagrafici, codici fiscali, partite IVA, IBAN, importi o date che non compaiono: lascia "" ciò che non è noto.`,
    response_json_schema: { type: "object", properties: props },
    ...(fileUrls.length ? { file_urls: fileUrls } : {}),
  });
  const out = {};
  for (const k of keys) {
    const v = res?.[k];
    if (v != null && String(v).trim()) out[k] = String(v).trim();
  }
  return out;
}

// ─── Contratti collegati: da un contratto se ne prepara un altro con i dati in comune ───

export const RELATED = {
  appalto: [["subappalto", "Subappalto di una parte dei lavori"], ["fornitura", "Fornitura dei materiali"], ["noleggio_comodato", "Noleggio di mezzi e attrezzature"], ["lettera_incarico", "Incarico a un professionista (DL, CSE)"]],
  subappalto: [["appalto", "Appalto con il committente"], ["fornitura", "Fornitura dei materiali"], ["noleggio_comodato", "Noleggio di mezzi e attrezzature"]],
  fornitura: [["noleggio_comodato", "Noleggio di mezzi e attrezzature"], ["appalto", "Appalto dei lavori"]],
  noleggio_comodato: [["fornitura", "Fornitura dei materiali"]],
  lettera_incarico: [["appalto", "Appalto dei lavori"]],
};

/** Dati iniziali del contratto collegato (per il wizard). */
export function linkedInitial(contract, target) {
  const f = contract.dati_compilati || {};
  const oggetto = f.OGGETTO_LAVORI || f.OGGETTO_FORNITURA || f.DESCRIZIONE_BENE || f.OGGETTO_INCARICO || contract.titolo || "";
  const luogo = f.LUOGO_ESECUZIONE || f.LUOGO_CONSEGNA || f.LUOGO_BENE || "";
  const base = { DATA_CONTRATTO: new Date().toISOString().slice(0, 10), ...(f.LUOGO_STIPULA ? { LUOGO_STIPULA: f.LUOGO_STIPULA } : {}) };
  const fields = {
    appalto: { ...base, OGGETTO_LAVORI: oggetto, LUOGO_ESECUZIONE: luogo, DATA_INIZIO: f.DATA_INIZIO || "", DATA_FINE: f.DATA_FINE || "" },
    subappalto: { ...base, OGGETTO_LAVORI: oggetto ? `Parte dei lavori di: ${oggetto}` : "", LUOGO_ESECUZIONE: luogo, DATA_INIZIO: f.DATA_INIZIO || "", DATA_FINE: f.DATA_FINE || "",
      RIFERIMENTO_APPALTO_PRINCIPALE: `${contract.titolo || "Contratto d'appalto"}${contract.data_creazione ? ` del ${fmtIt(contract.data_creazione)}` : ""}${contract.controparte_nome ? ` con ${contract.controparte_nome}` : ""}` },
    fornitura: { ...base, OGGETTO_FORNITURA: oggetto ? `Materiali per: ${oggetto}` : "", LUOGO_CONSEGNA: luogo, DATA_CONSEGNA: f.DATA_INIZIO || "" },
    noleggio_comodato: { ...base, DESCRIZIONE_BENE: "", LUOGO_BENE: luogo, DATA_INIZIO: f.DATA_INIZIO || "", DATA_FINE: f.DATA_FINE || "" },
    lettera_incarico: { ...base, OGGETTO_INCARICO: oggetto ? `Direzione dei lavori e/o coordinamento della sicurezza per: ${oggetto}${luogo ? `, ${luogo}` : ""}` : "", DATA_INIZIO: f.DATA_INIZIO || "", DATA_FINE: f.DATA_FINE || "" },
  }[target] || base;
  return { tipo: target, fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v)), links: { worksite_id: contract.worksite_id || "" } };
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
