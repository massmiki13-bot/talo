// Client dati di Talo: Supabase (database, login, file) + funzioni server in /api.
//
// Espone la stessa forma usata dal resto dell'app:
//   api.entities.<Entity>.list/filter/get/create/update/delete/...
//   api.auth.*            (login, registrazione, reset password)
//   api.integrations.Core (UploadFile, InvokeLLM, SendEmail)
//   api.functions.invoke  (funzioni server)
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Configurazione mancante: VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY in .env.local");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function fail(error, fallback = "Errore di comunicazione con il server") {
  const status = error?.code === "28000" ? 401 : error?.code === "42501" ? 403 : error?.code === "P0002" ? 404 : error?.status || 500;
  throw new ApiError(error?.message || fallback, status, error);
}

// ─── Valori predefiniti dei campi (come faceva Base44 alla creazione) ───

const schemaFiles = import.meta.glob("../../schema/entities/*.jsonc", { eager: true, query: "?raw", import: "default" });
const DEFAULTS = {};
for (const [path, raw] of Object.entries(schemaFiles)) {
  try {
    const schema = JSON.parse(raw);
    const defaults = {};
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      if ("default" in prop) defaults[key] = prop.default;
    }
    DEFAULTS[schema.name || path.split("/").pop().replace(".jsonc", "")] = defaults;
  } catch {
    // schema non valido: nessun default
  }
}

const withDefaults = (entity, data) => ({ ...structuredClone(DEFAULTS[entity] || {}), ...(data || {}) });

// ─── Notifiche di modifica (sostituiscono le sottoscrizioni realtime) ───

const listeners = new Map();
function notify(entity, type, data) {
  for (const cb of listeners.get(entity) || []) {
    try { cb({ type, data }); } catch { /* il listener non deve bloccare */ }
  }
}
// Quando l'utente torna sulla scheda, le pagine aperte ricaricano i dati.
if (typeof window !== "undefined") {
  let last = Date.now();
  window.addEventListener("focus", () => {
    if (Date.now() - last < 15000) return;
    last = Date.now();
    for (const entity of listeners.keys()) notify(entity, "refresh", null);
  });
}

// ─── Entità ───

async function rpc(fn, params) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) fail(error);
  return data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function entityApi(entity) {
  const list = (filter = {}, sort = "-created_date", limit = null, skip = 0) =>
    rpc("entity_list", { p_entity: entity, p_filter: filter || {}, p_sort: sort || "-created_date", p_limit: limit ?? null, p_skip: skip || 0 })
      .then((rows) => rows || []);

  return {
    list: (sort, limit, skip) => list({}, sort, limit, skip),
    filter: (filter, sort, limit, skip) => list(filter, sort, limit, skip),
    get: (id) => {
      if (!UUID_RE.test(String(id))) return Promise.reject(new ApiError("Record non trovato", 404));
      return rpc("entity_get", { p_entity: entity, p_id: id });
    },
    create: async (data) => {
      const rec = await rpc("entity_create", { p_entity: entity, p_data: withDefaults(entity, data) });
      notify(entity, "create", rec);
      return rec;
    },
    bulkCreate: async (items) => {
      const recs = await rpc("entity_bulk_create", { p_entity: entity, p_items: (items || []).map((d) => withDefaults(entity, d)) });
      notify(entity, "create", recs);
      return recs || [];
    },
    update: async (id, data) => {
      const rec = await rpc("entity_update", { p_entity: entity, p_id: id, p_patch: data || {} });
      notify(entity, "update", rec);
      return rec;
    },
    bulkUpdate: async (items) => {
      const recs = await rpc("entity_bulk_update", { p_entity: entity, p_items: items || [] });
      notify(entity, "update", recs);
      return recs || [];
    },
    delete: async (id) => {
      const res = await rpc("entity_delete", { p_entity: entity, p_id: id });
      notify(entity, "delete", { id });
      return res;
    },
    deleteMany: async (filter) => {
      const n = await rpc("entity_delete_many", { p_entity: entity, p_filter: filter || {} });
      notify(entity, "delete", null);
      return n;
    },
    updateMany: async (filter, patch) => {
      const n = await rpc("entity_update_many", { p_entity: entity, p_filter: filter || {}, p_patch: patch || {} });
      notify(entity, "update", null);
      return n;
    },
    subscribe: (cb) => {
      if (!listeners.has(entity)) listeners.set(entity, new Set());
      listeners.get(entity).add(cb);
      return () => listeners.get(entity)?.delete(cb);
    },
    schema: () => ({ properties: {} }),
  };
}

const entityCache = {};
const entities = new Proxy({}, {
  get(_, name) {
    if (typeof name !== "string") return undefined;
    if (!entityCache[name]) entityCache[name] = entityApi(name);
    return entityCache[name];
  },
});

// ─── Autenticazione ───

function toUser(u) {
  if (!u) return null;
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email,
    full_name: meta.full_name || meta.name || "",
    role: "user",
    created_date: u.created_at,
  };
}

const appUrl = (path) => `${window.location.origin}${path}`;

const auth = {
  async me() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) throw new ApiError("Non autenticato", 401);
    return toUser(data.user);
  },
  async isAuthenticated() {
    const { data } = await supabase.auth.getSession();
    return !!data?.session;
  },
  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = /invalid login/i.test(error.message) ? "Email o password non corretti"
        : /not confirmed/i.test(error.message) ? "Email non ancora confermata: controlla la posta"
        : error.message;
      throw new ApiError(msg, 401, error);
    }
    return toUser(data.user);
  },
  async loginWithProvider(provider, returnTo = "/") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: appUrl(returnTo) },
    });
    if (error) throw new ApiError(error.message, 400, error);
  },
  async register({ email, password, full_name }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: full_name ? { full_name } : undefined, emailRedirectTo: appUrl("/") },
    });
    if (error) throw new ApiError(/already registered/i.test(error.message) ? "Esiste già un account con questa email" : error.message, 400, error);
    return { user: toUser(data.user), needsConfirmation: !data.session };
  },
  async verifyOtp({ email, otpCode }) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: "signup" });
    if (error) throw new ApiError("Codice non valido o scaduto", 400, error);
    return { user: toUser(data.user), access_token: data.session?.access_token };
  },
  async resendOtp(email) {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) throw new ApiError(error.message, 400, error);
  },
  // Con Supabase la sessione è già salvata da verifyOtp: nulla da fare.
  setToken() {},
  async resetPasswordRequest(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl("/reset-password") });
    if (error) throw new ApiError(error.message, 400, error);
  },
  async verifyRecovery({ email, code }) {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
    if (error) throw new ApiError("Codice non valido o scaduto", 400, error);
  },
  async resetPassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new ApiError(error.message, 400, error);
  },
  async updateMe(data) {
    const { data: res, error } = await supabase.auth.updateUser({ data });
    if (error) throw new ApiError(error.message, 400, error);
    return toUser(res.user);
  },
  async logout(redirectTo) {
    await supabase.auth.signOut();
    if (redirectTo) window.location.href = typeof redirectTo === "string" && redirectTo.startsWith("/") ? redirectTo : "/login";
  },
  redirectToLogin(fromUrl) {
    const from = fromUrl ? `?from=${encodeURIComponent(new URL(fromUrl, window.location.origin).pathname)}` : "";
    window.location.href = `/login${from}`;
  },
  onChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, toUser(session?.user)));
    return () => data.subscription.unsubscribe();
  },
};

// ─── Funzioni server (/api/*) ───

async function callServer(path, payload) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload || {}),
  });
  let body = null;
  try { body = await res.json(); } catch { /* risposta vuota */ }
  if (!res.ok) throw new ApiError(body?.error || `Errore server (${res.status})`, res.status, body);
  return body;
}

// Nomi delle vecchie funzioni Base44 → endpoint.
const FUNCTION_ROUTES = {
  sendEmailFromAccount: "send-email",
  verifyEmailConnection: "verify-email",
  confirmCollaboratorInvite: "confirm-invite",
};

const functions = {
  // Stessa forma di Base44: { data } anche in caso di errore applicativo.
  async invoke(name, payload) {
    const route = FUNCTION_ROUTES[name] || name;
    try {
      return { data: await callServer(route, payload) };
    } catch (e) {
      if (e instanceof ApiError && e.data) return { data: e.data, status: e.status };
      throw e;
    }
  },
};

// ─── Integrazioni: file, AI, email di sistema ───

const safeName = (name) =>
  (name || "file").normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-80);

const Core = {
  async UploadFile({ file }) {
    if (!file) throw new ApiError("Nessun file selezionato", 400);
    const { tenant_id } = await rpc("my_access");
    const path = `${tenant_id}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from("uploads").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) fail(error, "Caricamento file non riuscito");
    const { data } = supabase.storage.from("uploads").getPublicUrl(path);
    return { file_url: data.publicUrl };
  },
  async InvokeLLM(params) {
    const res = await callServer("llm", params);
    return res.result;
  },
  async SendEmail({ to, subject, body, from_name }) {
    return callServer("system-email", { to, subject, body, from_name });
  },
};

export const api = {
  entities,
  auth,
  functions,
  integrations: { Core },
  access: () => rpc("my_access"),
};

export default api;
