// App operai: campi specifici per tipo di segnalazione, categorie delle foto e compilazione con l'IA.
import { api } from "@/lib/db";
import { T } from "@/lib/workerI18n";

/** Campi specifici per tipo di segnalazione. kind: text | choice | time. Le opzioni sono chiavi dei testi. */
export const REPORT_FIELDS = {
  materiale: [
    { k: "materiale", kind: "text", ph: "materiale_ph" },
    { k: "quantita", kind: "text", ph: "quantita_ph" },
    { k: "serve_entro", kind: "choice", options: ["entro_oggi", "entro_domani", "entro_settimana"] },
  ],
  guasto: [
    { k: "stato_mezzo", kind: "choice", options: ["fermo_si", "fermo_no"] },
  ],
  sicurezza: [
    { k: "evento", kind: "choice", options: ["ev_pericolo", "ev_quasi"] },
    { k: "categoria", kind: "choice", options: ["cat_caduta", "cat_ponteggio", "cat_scavo", "cat_elettrico", "cat_attrezzi", "cat_carichi", "cat_dpi", "cat_ordine", "cat_altro"] },
  ],
  infortunio: [
    { k: "chi_ferito", kind: "choice", options: ["io", "collega"] },
    { k: "nome_collega", kind: "text", when: (d) => d.chi_ferito === "collega" },
    { k: "parte_corpo", kind: "choice", options: ["p_testa", "p_occhi", "p_mani", "p_braccia", "p_schiena", "p_gambe", "p_piedi", "p_altro"] },
    { k: "soccorso", kind: "choice", options: ["si", "no"] },
    { k: "ora_evento", kind: "time" },
  ],
  altro: [],
};

export const PHOTO_CATEGORIES = ["lav_scavi", "lav_fondazioni", "lav_strutture", "lav_murature", "lav_impianti", "lav_intonaci", "lav_pavimenti", "lav_copertura", "lav_serramenti", "lav_finiture", "lav_sicurezza", "lav_materiali", "lav_altro"];

const it = (k) => T.it[k] || k;

/** Dettagli leggibili in italiano per il titolare: [[etichetta, valore], …]. */
export function detailRows(tipo, dettagli = {}) {
  return (REPORT_FIELDS[tipo] || [])
    .filter((f) => dettagli[f.k] && (!f.when || f.when(dettagli)))
    .map((f) => [it(f.k), f.kind === "choice" ? it(dettagli[f.k]) : String(dettagli[f.k])]);
}

const str = { type: "string" };

/**
 * Da testo scritto o messaggio vocale: trascrizione, traduzione per il capo e campi della segnalazione.
 * Restituisce { lingua, originale, italiano, tipo, urgente, dettagli, audio_url }.
 */
export async function aiReport({ file, text, mezzi = [] }) {
  const file_url = file ? (await api.integrations.Core.UploadFile({ file })).file_url : null;
  const spec = Object.entries(REPORT_FIELDS).map(([tipo, fields]) => `- ${tipo}: ${fields.map((f) => `${f.k}${f.options ? ` (uno tra: ${f.options.join(", ")})` : f.kind === "time" ? " (HH:MM)" : " (testo breve in italiano)"}`).join("; ") || "nessun campo"}`).join("\n");
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Sei l'assistente di un'impresa edile. Un operaio (può parlare italiano, rumeno, albanese o altre lingue, anche mescolate, con rumori di cantiere) segnala qualcosa al capo.
${file_url ? "Ascolta il messaggio vocale allegato." : `Testo scritto dall'operaio:\n"""${text}"""`}
Restituisci:
- lingua: codice ISO di due lettere della lingua usata;
- testo_originale: ${file_url ? "la trascrizione fedele nella lingua parlata, con punteggiatura" : "il testo così com'è"};
- testo_italiano: una frase chiara in italiano per il capocantiere (se è già italiano, correggilo e rendilo chiaro);
- tipo: uno tra materiale (manca materiale), guasto (guasto a mezzo/attrezzo), sicurezza (pericolo o quasi incidente), infortunio, altro;
- urgente: true solo se c'è un pericolo immediato, un infortunio o il lavoro è fermo;
- mezzo_id: se parla di uno di questi mezzi, il suo id: ${JSON.stringify(mezzi.map((m) => ({ id: m.id, nome: m.nome, tipo: m.tipo, targa: m.targa })))};
- dettagli: solo i campi del tipo scelto che si capiscono chiaramente dal messaggio, altrimenti omettili:
${spec}`,
    ...(file_url ? { file_urls: [file_url] } : {}),
    response_json_schema: {
      type: "object",
      properties: {
        lingua: str, testo_originale: str, testo_italiano: str, tipo: { type: "string", enum: Object.keys(REPORT_FIELDS) }, urgente: { type: "boolean" }, mezzo_id: str,
        dettagli: { type: "object", properties: Object.fromEntries(Object.values(REPORT_FIELDS).flat().map((f) => [f.k, f.options ? { type: "string", enum: f.options } : str])) },
      },
      required: ["lingua", "testo_originale", "testo_italiano", "tipo", "urgente", "dettagli"],
    },
  });
  const tipo = REPORT_FIELDS[r.tipo] ? r.tipo : "altro";
  const lingua = /^[a-z]{2}$/i.test(r.lingua || "") ? r.lingua.toLowerCase() : /rom|rum/i.test(r.lingua || "") ? "ro" : /alb|shq/i.test(r.lingua || "") ? "sq" : "it";
  const dettagli = {};
  for (const f of REPORT_FIELDS[tipo]) {
    const v = String(r.dettagli?.[f.k] || "").trim();
    if (!v) continue;
    if (f.kind === "choice" && !f.options.includes(v)) continue;
    if (f.kind === "time" && !/^\d{2}:\d{2}$/.test(v)) continue;
    dettagli[f.k] = v.slice(0, 200);
  }
  return {
    audio_url: file_url || "", lingua,
    originale: r.testo_originale || text || "", italiano: r.testo_italiano || r.testo_originale || text || "",
    tipo, urgente: !!r.urgente, dettagli, mezzo_id: mezzi.some((m) => m.id === r.mezzo_id) ? r.mezzo_id : "",
  };
}

/** Descrive una foto di cantiere: didascalia in italiano, lavorazione e fase. */
export async function aiPhoto(file) {
  const { file_url } = await api.integrations.Core.UploadFile({ file });
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Foto scattata da un operaio in un cantiere edile. Scrivi:
- didascalia: una frase in italiano (max 120 caratteri) che descrive cosa si vede e a che punto è il lavoro, utile al titolare e al direttore lavori; niente ipotesi su persone;
- categoria: la lavorazione principale, uno tra ${PHOTO_CATEGORIES.join(", ")};
- fase: prima (lavoro non iniziato), durante, dopo (lavoro finito).`,
    file_urls: [file_url],
    response_json_schema: { type: "object", properties: { didascalia: str, categoria: { type: "string", enum: PHOTO_CATEGORIES }, fase: { type: "string", enum: ["prima", "durante", "dopo"] } }, required: ["didascalia", "categoria", "fase"] },
  });
  return {
    file_url,
    didascalia: String(r.didascalia || "").slice(0, 300),
    categoria: PHOTO_CATEGORIES.includes(r.categoria) ? r.categoria : "",
    fase: ["prima", "durante", "dopo"].includes(r.fase) ? r.fase : "",
  };
}

/** Richiesta di ferie/permesso/malattia detta a voce o scritta: tipo, date, orari, note. */
export async function aiRequest({ file, text }) {
  const file_url = file ? (await api.integrations.Core.UploadFile({ file })).file_url : null;
  const today = new Date().toISOString().slice(0, 10);
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Oggi è ${today}. Un operaio edile chiede ferie, un permesso o comunica una malattia (può parlare italiano, rumeno o albanese).
${file_url ? "Ascolta il messaggio vocale allegato." : `Testo:\n"""${text}"""`}
Restituisci: tipo (ferie, permesso o malattia), dal e al (AAAA-MM-GG; se dice un solo giorno al = dal; interpreta "domani", "lunedì prossimo" ecc. rispetto a oggi),
dalle e alle (HH:MM, solo per un permesso di alcune ore), certificato (numero di protocollo, solo se lo detta), note (motivo breve in italiano, solo se lo dice).`,
    ...(file_url ? { file_urls: [file_url] } : {}),
    response_json_schema: { type: "object", properties: { tipo: { type: "string", enum: ["ferie", "permesso", "malattia"] }, dal: str, al: str, dalle: str, alle: str, certificato: str, note: str }, required: ["tipo", "dal", "al"] },
  });
  const d = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || "") ? x : "");
  const h = (x) => (/^\d{2}:\d{2}$/.test(x || "") ? x : "");
  const tipo = ["ferie", "permesso", "malattia"].includes(r.tipo) ? r.tipo : "ferie";
  const dal = d(r.dal) || today;
  const al = d(r.al) && d(r.al) >= dal ? d(r.al) : dal;
  return { tipo, dal, al, dalle: tipo === "permesso" ? h(r.dalle) : "", alle: tipo === "permesso" ? h(r.alle) : "", certificato: tipo === "malattia" ? String(r.certificato || "").slice(0, 60) : "", note: String(r.note || "").slice(0, 300) };
}

/** Giorni lavorativi (lun–ven) tra due date incluse. */
export function workingDays(dal, al) {
  if (!dal) return 0;
  let n = 0;
  for (let d = new Date(`${dal}T12:00:00`); d <= new Date(`${al || dal}T12:00:00`); d.setDate(d.getDate() + 1)) if (d.getDay() % 6 !== 0) n++;
  return n;
}

/** Ore tra due orari HH:MM (0 se incompleti o invertiti). */
export function hoursBetween(dalle, alle) {
  if (!/^\d{2}:\d{2}$/.test(dalle || "") || !/^\d{2}:\d{2}$/.test(alle || "")) return 0;
  const m = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  return Math.max(0, Math.round(((m(alle) - m(dalle)) / 60) * 100) / 100);
}
