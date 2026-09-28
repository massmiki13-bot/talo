// Lettura con l'IA di un preventivo esistente (PDF, Word, Excel, foto) per ricrearlo in Talo con tutti i dati.
import { api } from "@/lib/db";
import { UNIT_OPTIONS } from "@/lib/quotes";
import { displayName, normalize } from "@/lib/contacts";

const UNITS = UNIT_OPTIONS.map((u) => u.value);
const str = { type: "string" };
const num = { type: "number" };

const SCHEMA = {
  type: "object",
  properties: {
    numero_originale: str, data_documento: str, oggetto: str, luogo_lavori: str,
    cliente: { type: "object", properties: { ragione_sociale: str, nome_cognome: str, partita_iva: str, codice_fiscale: str, indirizzo: str, cap: str, citta: str, provincia: str, telefono: str, email: str, pec: str, codice_sdi: str, tipo_soggetto: str } },
    righe: {
      type: "array",
      items: { type: "object", properties: { tipo: str, descrizione: str, unita_misura: str, quantita: num, prezzo_unitario: num, sconto: num, iva_percentuale: num, opzionale: { type: "boolean" } } },
    },
    sconto_globale: num, validita_giorni: num, condizioni_pagamento: str, tempi_esecuzione: str, clausole: { type: "array", items: str }, note: str,
    totale_documento: num,
  },
};

const PROMPT = `Sei un esperto di preventivi edili e impiantistici italiani. Leggi il documento allegato (PDF, Word, Excel o foto) ed estrai TUTTO ciò che serve per ricreare il preventivo.

- numero_originale, data_documento (AAAA-MM-GG), oggetto (breve titolo del lavoro; se il documento non lo indica, proponine uno di poche parole che riassuma le voci), luogo_lavori (indirizzo del cantiere se diverso dal cliente).
- cliente: tutti i dati del destinatario del preventivo (non dell'impresa che lo emette): ragione_sociale se azienda/ente, nome_cognome se privato, partita_iva, codice_fiscale, indirizzo (via e numero), cap, citta, provincia (sigla 2 lettere), telefono, email, pec, codice_sdi; tipo_soggetto = "azienda" | "privato" | "ente".
- righe, nello stesso ordine del documento:
  • i titoli di sezione/capitolo (es. "DEMOLIZIONI", "1. Opere murarie") → tipo "capitolo" con la sola descrizione;
  • le righe di solo testo senza prezzo → tipo "testo";
  • le voci con prezzo → tipo "voce" con descrizione completa, unita_misura tra ${UNITS.join(", ")}, quantita, prezzo_unitario (IVA esclusa), sconto % della riga, iva_percentuale (22, 10, 4 o 0) e opzionale=true se indicata come facoltativa/opzionale/a scelta.
  Se c'è solo il totale della riga, metti quantita 1 e prezzo_unitario = totale.
- sconto_globale (% sul totale), validita_giorni, condizioni_pagamento, tempi_esecuzione, clausole (elenco delle condizioni generali, una per elemento), note.
- totale_documento: il totale imponibile indicato sul documento, per controllo.

Leggi con la massima precisione numeri e prezzi (attenzione a virgole e punti italiani). Non inventare nulla: lascia vuoti i campi assenti.`;

const clean = (v) => String(v ?? "").trim();

/** Estrae i dati; restituisce { data, righe, cliente, worksite, avvisi }. */
export async function extractQuote(fileUrl, { contacts = [], worksites = [] } = {}) {
  const r = await api.integrations.Core.InvokeLLM({ prompt: PROMPT, file_urls: [fileUrl], response_json_schema: SCHEMA });

  const righe = (r.righe || []).map((x) => {
    const tipo = ["capitolo", "testo"].includes(x.tipo) ? x.tipo : "voce";
    if (tipo !== "voce") return { tipo, descrizione: clean(x.descrizione) };
    return {
      tipo: "voce", descrizione: clean(x.descrizione), unita_misura: UNITS.includes(x.unita_misura) ? x.unita_misura : "cad",
      quantita: Number(x.quantita) || 1, prezzo_unitario: Number(x.prezzo_unitario) || 0, sconto: Number(x.sconto) || 0,
      iva_percentuale: [22, 10, 5, 4, 0].includes(Number(x.iva_percentuale)) ? Number(x.iva_percentuale) : 22, costo_unitario: null, opzionale: !!x.opzionale,
    };
  }).filter((x) => x.descrizione || x.prezzo_unitario);

  // cliente: già in rubrica (P.IVA, codice fiscale, email o nome) oppure da creare
  const c = r.cliente || {};
  const nome = clean(c.ragione_sociale) || clean(c.nome_cognome);
  const match = contacts.find((k) => (c.partita_iva && normalize(k.partita_iva) === normalize(c.partita_iva))
    || (c.codice_fiscale && normalize(k.codice_fiscale) === normalize(c.codice_fiscale))
    || (c.email && normalize(k.email) === normalize(c.email))
    || (nome && normalize(displayName(k)) === normalize(nome)));
  const nuovo = nome ? {
    tipo: "cliente", tipo_soggetto: ["azienda", "privato", "ente"].includes(c.tipo_soggetto) ? c.tipo_soggetto : c.ragione_sociale ? "azienda" : "privato",
    nome: clean(c.ragione_sociale), nome_privato: c.ragione_sociale ? "" : clean(c.nome_cognome),
    partita_iva: clean(c.partita_iva).replace(/^IT/i, ""), codice_fiscale: clean(c.codice_fiscale).toUpperCase(), indirizzo: clean(c.indirizzo), cap: clean(c.cap),
    citta: clean(c.citta), provincia: clean(c.provincia).toUpperCase().slice(0, 2), telefono: clean(c.telefono), email: clean(c.email), pec: clean(c.pec), codice_sdi: clean(c.codice_sdi).toUpperCase(),
    categorie: [], archiviato: false,
  } : null;

  const luogo = clean(r.luogo_lavori);
  const worksite = luogo ? worksites.find((w) => w.indirizzo && normalize(w.indirizzo).includes(normalize(luogo).slice(0, 20))) || null : null;

  const imponibile = righe.filter((x) => x.tipo === "voce" && !x.opzionale).reduce((s, x) => s + x.quantita * x.prezzo_unitario * (1 - x.sconto / 100), 0) * (1 - (Number(r.sconto_globale) || 0) / 100);
  const avvisi = [];
  if (r.totale_documento && Math.abs(imponibile - r.totale_documento) > Math.max(1, r.totale_documento * 0.01)) {
    avvisi.push(`Il totale delle voci lette (${imponibile.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}) non coincide con quello del documento (${Number(r.totale_documento).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}): controlla quantità e prezzi.`);
  }

  const noteParts = [clean(r.note), r.numero_originale ? `Rif. preventivo n. ${clean(r.numero_originale)}${r.data_documento ? ` del ${new Date(r.data_documento).toLocaleDateString("it-IT")}` : ""}` : ""].filter(Boolean);
  return {
    data: {
      oggetto: clean(r.oggetto), note: noteParts.join("\n"), validita_giorni: Number(r.validita_giorni) || 30,
      sconto_globale: Number(r.sconto_globale) || 0, condizioni_pagamento: clean(r.condizioni_pagamento), tempi_esecuzione: clean(r.tempi_esecuzione),
      clausole: (r.clausole || []).map(clean).filter(Boolean).join("\n"), luogo_lavori: luogo,
    },
    righe, cliente: { match: match || null, nuovo }, worksite, avvisi,
  };
}
