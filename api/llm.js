// Assistente AI (Google Gemini). Stessi parametri della vecchia InvokeLLM:
//   prompt, response_json_schema, file_urls, add_context_from_internet
// Restituisce { result } — oggetto JSON se è stato chiesto uno schema, altrimenti testo.
import { handler, requireUser, HttpError, rateLimit } from "./_lib/server.js";
import { isAllowedFileUrl } from "./_lib/mail.js";
import { isDemoTenant } from "./_lib/demo.js";
import { fetchStoredFile } from "./_lib/files.js";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
// Dal più capace al più economico: se un modello non è disponibile o ha
// esaurito la quota si passa al successivo.
const MODELS = (process.env.GEMINI_MODELS || "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite")
  .split(",").map((m) => m.trim()).filter(Boolean);

const MAX_FILE_BYTES = 18 * 1024 * 1024;
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 400;
const DAILY_LIMIT_DEMO = Number(process.env.AI_DAILY_LIMIT_DEMO) || 40;
// Con documenti da leggere (preventivi, PSC) la risposta è lunga: più tempo per modello, con un tetto complessivo.
const MODEL_TIMEOUT_MS = 30_000;
const MODEL_TIMEOUT_FILES_MS = 90_000;
const TOTAL_BUDGET_MS = 240_000;
const SUPPORTED = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|audio\/(webm|ogg|mpeg|mp3|mp4|m4a|wav|aac|x-m4a)|text\/.+|application\/json)$/i;

const MIME_BY_EXT = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", webm: "audio/webm", ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", aac: "audio/aac", txt: "text/plain", csv: "text/csv", html: "text/html", json: "application/json",
};

async function loadFiles(urls, tenantId) {
  const parts = [];
  const skipped = [];
  let total = 0;
  for (const url of (urls || []).slice(0, 10)) {
    if (!isAllowedFileUrl(url)) { skipped.push(url); continue; }
    const file = await fetchStoredFile(url, tenantId).catch(() => null);
    if (!file) { skipped.push(url); continue; }
    const ext = decodeURIComponent(new URL(url).pathname).split(".").pop().toLowerCase();
    let mime = file.contentType;
    if (!SUPPORTED.test(mime)) mime = MIME_BY_EXT[ext] || mime;
    const buf = file.buffer;
    total += buf.length;
    if (!SUPPORTED.test(mime) || total > MAX_FILE_BYTES) { skipped.push(url); continue; }
    parts.push({ inline_data: { mime_type: mime, data: buf.toString("base64") } });
  }
  return { parts, skipped };
}

// Gemini accetta solo un sottoinsieme di JSON Schema: togliamo le chiavi non supportate.
const SCHEMA_KEYS = new Set(["type", "properties", "items", "required", "enum", "description", "nullable", "format", "anyOf", "minItems", "maxItems", "propertyOrdering"]);
function cleanSchema(s) {
  if (Array.isArray(s)) return s.map(cleanSchema);
  if (!s || typeof s !== "object") return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (!SCHEMA_KEYS.has(k)) continue;
    if (k === "properties") {
      out.properties = Object.fromEntries(Object.entries(v || {}).map(([pk, pv]) => [pk, cleanSchema(pv)]));
    } else if (k === "type" && Array.isArray(v)) {
      out.type = v.find((t) => t !== "null") || "string";
      if (v.includes("null")) out.nullable = true;
    } else {
      out[k] = cleanSchema(v);
    }
  }
  if (out.type === "object" && out.properties && Object.keys(out.properties).length === 0) delete out.properties;
  return out;
}

function parseJson(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch { /* prova a estrarre */ }
  const m = t.match(/[[{][\s\S]*[\]}]/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* niente */ } }
  throw new HttpError(502, "La risposta dell'AI non è in un formato valido, riprova");
}

async function callGemini(model, payload, timeoutMs = MODEL_TIMEOUT_MS) {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(payload),
    // Un modello lento non deve consumare tutto il tempo della funzione.
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e) => {
    const err = new Error(e.name === "TimeoutError" ? "Modello troppo lento" : e.message);
    err.status = 503;
    throw err;
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Gemini ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text) {
    const reason = cand?.finishReason || data.promptFeedback?.blockReason || "vuota";
    const err = new Error(`Risposta AI ${reason}`);
    err.status = 422;
    throw err;
  }
  return text;
}

export default handler(async (req, body) => {
  const { user, tenantId } = await requireUser(req);
  if (!process.env.GEMINI_API_KEY) throw new HttpError(503, "Assistente AI non configurato (manca GEMINI_API_KEY)");
  await rateLimit(`llm:${user.id}`, 20, 60_000);
  // Tetto giornaliero per azienda (più basso per la demo, che è aperta a tutti): protegge dai costi.
  const daily = isDemoTenant(tenantId) ? DAILY_LIMIT_DEMO : DAILY_LIMIT;
  await rateLimit(`llm-giorno:${tenantId}`, daily, 86_400_000, "Limite giornaliero dell'assistente AI raggiunto: riprova domani");

  const { prompt, response_json_schema, file_urls, add_context_from_internet } = body;
  if (!prompt || typeof prompt !== "string") throw new HttpError(400, "Richiesta AI vuota");
  if (prompt.length > 200_000) throw new HttpError(413, "Testo troppo lungo per l'AI");

  const { parts: fileParts, skipped } = await loadFiles(file_urls, tenantId);
  const wantJson = !!response_json_schema;
  const useSearch = !!add_context_from_internet;

  let text = prompt;
  if (skipped.length) text += `\n\n(Nota: ${skipped.length} file non leggibili sono stati ignorati.)`;
  // Con la ricerca web Gemini non accetta lo schema strutturato: lo chiediamo nel testo.
  if (wantJson && useSearch) {
    text += `\n\nRispondi SOLO con un JSON valido conforme a questo schema:\n${JSON.stringify(response_json_schema)}`;
  }

  const payload = {
    systemInstruction: { parts: [{ text: "Sei l'assistente di Talo, gestionale per imprese edili e di impianti italiane. Rispondi in italiano, in modo preciso e professionale, salvo diversa richiesta." }] },
    contents: [{ role: "user", parts: [...fileParts, { text }] }],
    generationConfig: { temperature: 0.4 },
  };
  if (useSearch) payload.tools = [{ google_search: {} }];
  if (wantJson && !useSearch) {
    payload.generationConfig.responseMimeType = "application/json";
    payload.generationConfig.responseSchema = cleanSchema(response_json_schema);
  }

  let lastError;
  const started = Date.now();
  const timeout = () => Math.max(10_000, Math.min(fileParts.length ? MODEL_TIMEOUT_FILES_MS : MODEL_TIMEOUT_MS, TOTAL_BUDGET_MS - (Date.now() - started)));
  for (const model of MODELS) {
    if (Date.now() - started > TOTAL_BUDGET_MS - 10_000) break;
    try {
      const out = await callGemini(model, payload, timeout());
      return { result: wantJson ? parseJson(out) : out, model };
    } catch (e) {
      lastError = e;
      // Schema rifiutato: riprova lo stesso modello chiedendo il JSON nel testo.
      if (e.status === 400 && payload.generationConfig.responseSchema) {
        delete payload.generationConfig.responseSchema;
        payload.contents[0].parts[payload.contents[0].parts.length - 1].text +=
          `\n\nRispondi SOLO con un JSON valido conforme a questo schema:\n${JSON.stringify(response_json_schema)}`;
        try {
          const out = await callGemini(model, payload, timeout());
          return { result: parseJson(out), model };
        } catch (e2) { lastError = e2; }
      }
      // Quota esaurita, modello non disponibile o sovraccarico → modello successivo.
      if (![400, 403, 404, 429, 500, 503].includes(e.status) && e.status !== undefined) break;
    }
  }
  console.error("Gemini:", lastError?.message);
  if (lastError?.status === 429) throw new HttpError(429, "Limite giornaliero dell'AI raggiunto, riprova più tardi");
  throw new HttpError(502, "L'assistente AI non è disponibile al momento, riprova tra poco");
});
