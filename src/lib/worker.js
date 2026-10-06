// App operai: invii con coda offline, trascrizione dei messaggi vocali e traduzioni.
import { api } from "@/lib/db";
import { isNetworkError, enqueue } from "@/lib/offlineStore";
import { supabase } from "@/api/client";
import { LANG_NAMES } from "@/lib/workerI18n";

const currentUid = async () => (await supabase.auth.getSession()).data?.session?.user?.id || null;

/** Tipo del file senza parametri (es. "audio/webm;codecs=opus" → "audio/webm"). */
export const cleanType = (t) => String(t || "").split(";")[0].trim();

async function uploadMany(files) {
  const urls = [];
  for (const f of files) urls.push((await api.integrations.Core.UploadFile({ file: f })).file_url);
  return urls;
}

/**
 * Invia al titolare (foto, bolla, segnalazione…). I file vanno caricati prima: `files` finiscono in data[field]
 * (stringa se field termina con "_url", altrimenti elenco). Senza rete l'invio resta sul telefono.
 */
export async function sendWorker(kind, data, { files = [], field } = /** @type {any} */ ({})) {
  try {
    if (!navigator.onLine) throw new TypeError("Failed to fetch");
    const urls = files.length ? await uploadMany(files) : [];
    const payload = field ? { ...data, [field]: field.endsWith("_url") ? urls[0] || "" : [...(data[field] || []), ...urls] } : data;
    await api.operaio.submit(kind, payload);
    return { queued: false };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await enqueue({ kind: "worker", uid: await currentUid(), submitKind: kind, data, field: field || "", blobs: files.map((f) => ({ blob: f, name: f.name, type: cleanType(f.type) })) });
    return { queued: true };
  }
}

/** Invio differito dalla coda (chiamato da offlineSync). */
export async function flushWorkerItem(item) {
  const files = (item.blobs || []).map((b) => new File([b.blob], b.name, { type: b.type }));
  const urls = files.length ? await uploadMany(files) : [];
  const f = item.field;
  const payload = f ? { ...item.data, [f]: f.endsWith("_url") ? urls[0] || "" : [...(item.data[f] || []), ...urls] } : item.data;
  await api.operaio.submit(item.submitKind, payload);
}

/** Trascrive un messaggio vocale: testo nella lingua parlata e traduzione in italiano per il capo. */
export async function transcribe(file) {
  const { file_url } = await api.integrations.Core.UploadFile({ file });
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Trascrivi fedelmente questo messaggio vocale di un operaio edile (può parlare italiano, rumeno, albanese o altre lingue, anche mescolate e con rumori di cantiere).
Restituisci: lingua (codice ISO di due lettere), testo_originale (la trascrizione nella lingua parlata, con punteggiatura), testo_italiano (traduzione in italiano chiaro per il capocantiere; se è già italiano ripeti il testo corretto).`,
    file_urls: [file_url],
    response_json_schema: { type: "object", properties: { lingua: { type: "string" }, testo_originale: { type: "string" }, testo_italiano: { type: "string" } } },
  });
  return { audio_url: file_url, lingua: r.lingua || "it", originale: r.testo_originale || "", italiano: r.testo_italiano || r.testo_originale || "" };
}

/** Traduce un testo (per esempio un avviso del titolare) nella lingua dell'operaio. */
export async function translate(text, lang) {
  if (!text || lang === "it") return text;
  const r = await api.integrations.Core.InvokeLLM({ prompt: `Traduci in ${LANG_NAMES[lang] || lang} questo messaggio di un'impresa edile ai suoi operai. Restituisci solo la traduzione, semplice e chiara:\n\n${text}` });
  return String(r).trim();
}

/** Registratore vocale: start() → stop() restituisce un File audio. */
export function createRecorder() {
  let rec = null;
  let chunks = [];
  let stream = null;
  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
      rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start();
    },
    stop() {
      return new Promise((resolve) => {
        if (!rec) return resolve(null);
        rec.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          const type = cleanType(rec.mimeType) || "audio/webm";
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          resolve(chunks.length ? new File(chunks, `vocale-${Date.now()}.${ext}`, { type }) : null);
        };
        rec.stop();
      });
    },
  };
}
