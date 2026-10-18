// Assistente email: scrive, risponde e ritocca le email usando i dati veri dell'impresa; accetta anche la voce.
import { api } from "@/lib/db";
import { htmlToText } from "@/lib/email";

export const TONES = [
  { value: "cordiale", label: "Cordiale", hint: "caldo ma professionale, dà del Lei" },
  { value: "professionale", label: "Professionale", hint: "chiaro e cortese, dà del Lei" },
  { value: "formale", label: "Formale", hint: "registro formale da corrispondenza ufficiale, adatto a PEC ed enti" },
  { value: "deciso", label: "Deciso", hint: "fermo e diretto, senza essere scortese (solleciti, contestazioni)" },
];
export const LENGTHS = [
  { value: "breve", label: "Breve", hint: "3-5 righe" },
  { value: "normale", label: "Normale", hint: "2-3 paragrafi brevi" },
  { value: "dettagliata", label: "Dettagliata", hint: "completa, con elenchi puntati se servono" },
];
export const REFINES = [
  { value: "breve", label: "Più breve", instr: "Accorcia il testo di circa la metà mantenendo tutte le informazioni essenziali." },
  { value: "formale", label: "Più formale", instr: "Rendi il testo più formale, adatto a un ente pubblico o a una PEC." },
  { value: "cordiale", label: "Più cordiale", instr: "Rendi il testo più cordiale e caloroso, sempre professionale." },
  { value: "correggi", label: "Correggi", instr: "Correggi solo errori di grammatica, ortografia e punteggiatura. Non cambiare il contenuto né lo stile." },
  { value: "chiaro", label: "Più chiaro", instr: "Riscrivi in modo più chiaro e ordinato: frasi brevi, una richiesta per paragrafo, eventuali scadenze ben visibili." },
  { value: "conferma", label: "Chiedi conferma", instr: "Aggiungi in chiusura una richiesta di conferma di ricezione o di risposta entro una data ragionevole." },
];

/** Separa il testo nuovo dalla citazione del messaggio a cui si risponde ("Il …, X ha scritto:" + blockquote). */
export function splitQuote(html = "") {
  const s = String(html);
  const m = s.match(/<p>(?:<br\s*\/?>)?\s*Il [^<]{0,200}ha scritto:\s*<\/p>\s*<blockquote[\s\S]*$/i) || s.match(/<blockquote[\s\S]*$/i);
  if (!m) return { own: s, quote: "" };
  return { own: s.slice(0, m.index), quote: s.slice(m.index) };
}

const str = { type: "string" };
const fmtEur = (v) => (Number(v) ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v)) : "");

/**
 * Riassunto dei dati collegati all'email (cliente, lavoro, preventivo) da dare all'IA.
 * @param {{ contact?: any, worksite?: any, quote?: any }} [links]
 */
export function describeLinks({ contact, worksite, quote } = {}) {
  const out = [];
  if (contact) out.push(`Cliente/fornitore: ${contact.nome || contact.ragione_sociale || contact.nome_privato || ""}${contact.citta ? `, ${contact.citta}` : ""}${contact.tipo ? ` (${contact.tipo})` : ""}`);
  if (worksite) out.push(`Lavoro: ${worksite.nome}${worksite.indirizzo ? `, ${worksite.indirizzo}` : ""}${worksite.stato ? `, stato ${worksite.stato}` : ""}${worksite.data_inizio ? `, inizio ${worksite.data_inizio}` : ""}${worksite.data_fine_prevista ? `, fine prevista ${worksite.data_fine_prevista}` : ""}${worksite.avanzamento != null ? `, avanzamento ${worksite.avanzamento}%` : ""}`);
  if (quote) out.push(`Preventivo n. ${quote.numero}${quote.oggetto ? ` «${quote.oggetto}»` : ""}${quote.totale ? `, totale ${fmtEur(quote.totale)}` : ""}${quote.stato ? `, stato ${quote.stato}` : ""}${quote.data ? ` del ${quote.data}` : ""}`);
  return out.join("\n");
}

/**
 * Scrive (o riscrive) l'email. Con `audio` la richiesta arriva da un messaggio vocale.
 * Restituisce { oggetto, corpo, trascrizione }.
 * @param {any} opts
 */
export async function composeEmail({ request = "", audio = null, tone = "professionale", length = "normale", language = "italiano", isPec = false,
  company = /** @type {any} */ ({}), recipients = [], subject = "", currentBody = "", quotedText = "", context = "", linksText = "", attachments = [], refine = "" }) {
  const file_url = audio ? (await api.integrations.Core.UploadFile({ file: audio })).file_url : null;
  const t = TONES.find((x) => x.value === tone) || TONES[1];
  const l = LENGTHS.find((x) => x.value === length) || LENGTHS[1];
  const current = htmlToText(currentBody).trim();
  const task = refine
    ? `RITOCCA il testo attuale dell'email seguendo questa istruzione: ${refine}`
    : current
      ? `RISCRIVI o completa il testo attuale seguendo la richiesta dell'utente (se chiede solo di aggiungere qualcosa, mantieni il resto).`
      : quotedText
        ? "Scrivi la RISPOSTA al messaggio ricevuto riportato sotto, seguendo la richiesta dell'utente."
        : "Scrivi una NUOVA email seguendo la richiesta dell'utente.";
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Sei l'assistente di ${company.ragione_sociale || "un'impresa edile/impiantistica italiana"} e scrivi le sue email ${isPec ? "PEC (valore legale: precise, formali, con riferimenti chiari)" : ""}.
${task}

${file_url ? "La richiesta dell'utente è nel messaggio vocale allegato (può parlare in modo informale o dettare a pezzi): capiscila e usala come istruzione." : `Richiesta dell'utente: «${request || "(nessuna: migliora il testo)"}»`}
Tono: ${t.label} (${t.hint}). Lunghezza: ${l.label} (${l.hint}). Lingua dell'email: ${language}.

Dati veri da usare (non inventare nulla oltre a questi; se manca un dato necessario, come una data o un importo, scrivi [da completare]):
- Mittente: ${company.ragione_sociale || ""}${company.telefono ? `, tel. ${company.telefono}` : ""}
- Destinatari: ${recipients.map((x) => (x.name ? `${x.name} <${x.email}>` : x.email)).join(", ") || "non indicati"}
- Oggetto attuale: ${subject || "nessuno"}
${context ? `- Contesto: ${context}\n` : ""}${linksText ? `${linksText.split("\n").map((x) => `- ${x}`).join("\n")}\n` : ""}${attachments.length ? `- Allegati: ${attachments.join(", ")}\n` : ""}${quotedText ? `\nMessaggio ricevuto a cui si risponde:\n"""${quotedText.slice(0, 4000)}"""\n` : ""}${current ? `\nTesto attuale dell'email:\n"""${current.slice(0, 4000)}"""\n` : ""}
Regole: saluto iniziale adatto al destinatario (usa il nome se lo conosci), niente firma finale (la aggiunge l'app), paragrafi brevi separati da una riga vuota, elenchi con "- " se servono. Se l'oggetto attuale manca o non è adatto, proponi un oggetto breve e specifico; altrimenti restituisci quello attuale.${file_url ? ' In "trascrizione" riporta cosa ha detto l\'utente.' : ""}`,
    ...(file_url ? { file_urls: [file_url] } : {}),
    response_json_schema: { type: "object", properties: { oggetto: str, corpo: str, trascrizione: str }, required: ["oggetto", "corpo"] },
  });
  return { oggetto: String(r.oggetto || subject || "").trim(), corpo: String(r.corpo || "").trim(), trascrizione: String(r.trascrizione || "").trim() };
}

/** Dettatura: trascrive parola per parola, con punteggiatura, senza riscrivere. */
export async function dictate(audio, language = "italiano") {
  const { file_url } = await api.integrations.Core.UploadFile({ file: audio });
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Trascrivi fedelmente questo messaggio vocale dettato per un'email (lingua prevista: ${language}). Aggiungi punteggiatura e maiuscole, trasforma i comandi detti a voce ("punto", "virgola", "a capo", "nuovo paragrafo") nei segni corrispondenti, togli esitazioni ("ehm", ripetizioni). Non riassumere e non cambiare le parole.`,
    file_urls: [file_url],
    response_json_schema: { type: "object", properties: { testo: str }, required: ["testo"] },
  });
  return String(r.testo || "").trim();
}
