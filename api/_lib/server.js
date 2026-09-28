// Utility condivise dalle funzioni server (Vercel Functions, Node).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function requireEnv(value, name) {
  if (!value) throw new HttpError(500, `Configurazione server mancante: ${name}`);
  return value;
}

// Client con privilegi di servizio: bypassa le regole di accesso, usare solo
// dopo aver verificato chi sta chiamando.
let adminClient;
export function admin() {
  if (!adminClient) {
    adminClient = createClient(requireEnv(SUPABASE_URL, "SUPABASE_URL"), requireEnv(SECRET_KEY, "SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

// Client che agisce come l'utente della richiesta (regole di accesso attive).
export function asUser(token) {
  return createClient(requireEnv(SUPABASE_URL, "SUPABASE_URL"), requireEnv(PUBLISHABLE_KEY, "SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function supabaseHost() {
  return new URL(requireEnv(SUPABASE_URL, "SUPABASE_URL")).host;
}

// Verifica il token di sessione e restituisce utente + contesto di accesso.
export async function requireUser(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Non autenticato");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Sessione scaduta, accedi di nuovo");
  const client = asUser(token);
  const { data: access, error: accessError } = await client.rpc("my_access");
  if (accessError) throw new HttpError(500, accessError.message);
  return {
    user: data.user,
    token,
    client,
    tenantId: access.tenant_id,
    accessLevel: access.access_level,
  };
}

// Documento di un record come lo vede il frontend.
export function toDoc(row) {
  if (!row) return null;
  return {
    ...row.data,
    id: row.id,
    created_date: row.created_date,
    updated_date: row.updated_date,
    created_by: row.created_by,
    created_by_id: row.created_by_id,
    tenant_id: row.tenant_id,
  };
}

export async function getRecord(entity, id) {
  const { data, error } = await admin()
    .from("entity_records").select("*").eq("entity", entity).eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data;
}

export async function updateRecordData(id, patch) {
  const row = await admin().from("entity_records").select("data").eq("id", id).single();
  if (row.error) throw new HttpError(500, row.error.message);
  const { error } = await admin()
    .from("entity_records")
    .update({ data: { ...row.data.data, ...patch }, updated_date: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new HttpError(500, error.message);
}

// Errori imprevisti delle funzioni: registrati in app_errors (senza mai bloccare la risposta).
async function logServerError(e, req) {
  try {
    await admin().from("app_errors").insert({
      source: "server",
      message: String(e?.message || e).slice(0, 1000),
      stack: String(e?.stack || "").slice(0, 4000),
      url: String(req.url || "").slice(0, 500),
      user_agent: String(req.headers?.["user-agent"] || "").slice(0, 300),
    });
  } catch { /* il registro non deve mai causare altri errori */ }
}

// Wrapper comune: solo POST, JSON in/out, errori uniformi.
export function handler(fn, { methods = ["POST"] } = {}) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, "Metodo non consentito");
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body || "{}"); } catch { throw new HttpError(400, "JSON non valido"); }
      }
      const result = await fn(req, body || {});
      res.status(200).json(result ?? { success: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) {
        console.error(e);
        await logServerError(e, req);
      }
      res.status(status).json({ error: e.message || "Errore interno", ...(e.extra || {}) });
    }
  };
}

// Limite semplice di richieste per utente (per istanza del server).
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > max) throw new HttpError(429, "Troppe richieste, riprova tra poco");
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
