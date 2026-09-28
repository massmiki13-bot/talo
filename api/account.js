// Account e file: link firmati per i documenti privati (action "file-url"), cancellazione definitiva
// dell'account aziendale (action "delete", solo titolare) e accesso all'azienda demo (action "demo", senza login).
// Riunite in una funzione per il limite del piano Vercel.
import { createClient } from "@supabase/supabase-js";
import { handler, requireUser, admin, HttpError, rateLimit } from "./_lib/server.js";
import { privatePath, signPrivateUrl } from "./_lib/files.js";
import { isDemoTenant } from "./_lib/demo.js";

const CONFIRM_TEXT = "ELIMINA DEFINITIVAMENTE";

async function signedUrls({ user, tenantId, accessLevel }, body) {
  rateLimit(`file-url:${user.id}`, 120, 60_000);
  const urls = Array.isArray(body.urls) ? body.urls.slice(0, 50) : [body.url];
  const out = {};
  let employeeId = null;
  for (const url of urls) {
    const path = privatePath(url);
    if (!path) continue;
    if (path.split("/")[0] !== String(tenantId)) throw new HttpError(403, "File non accessibile");
    if (accessLevel === "operaio") {
      // L'operaio apre solo i documenti della propria scheda.
      if (employeeId === null) {
        const { data: me } = await admin().from("entity_records").select("data").eq("entity", "Collaborator").eq("tenant_id", tenantId)
          .eq("data->>collaborator_user_id", user.id).limit(1).maybeSingle();
        employeeId = me?.data?.employee_id || "-";
      }
      const { data: doc } = await admin().from("entity_records").select("id").eq("entity", "EmployeeDocument").eq("tenant_id", tenantId)
        .eq("data->>dipendente_id", employeeId).eq("data->>file_url", url).limit(1).maybeSingle();
      if (!doc) throw new HttpError(403, "File non accessibile");
    }
    out[url] = await signPrivateUrl(path, 600, body.download ? String(body.download).slice(0, 120) : null);
  }
  return { urls: out };
}

async function removeFolder(db, bucket, folder) {
  let removed = 0;
  for (;;) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) throw new HttpError(500, `Archivio ${bucket}: ${error.message}`);
    const names = (data || []).filter((o) => o.name && o.id).map((o) => `${folder}/${o.name}`);
    if (!names.length) break;
    const { error: e2 } = await db.storage.from(bucket).remove(names);
    if (e2) throw new HttpError(500, `Archivio ${bucket}: ${e2.message}`);
    removed += names.length;
    if (names.length < 1000) break;
  }
  return removed;
}

async function deleteAccount({ user, tenantId, accessLevel }, body) {
  rateLimit(`account-delete:${user.id}`, 3, 60_000);
  if (accessLevel !== "host" || tenantId !== user.id) throw new HttpError(403, "Solo il titolare può eliminare l'account dell'azienda");
  if (isDemoTenant(tenantId)) throw new HttpError(403, "L'azienda demo non si può eliminare");
  if (String(body.confirm || "").trim().toUpperCase() !== CONFIRM_TEXT) throw new HttpError(400, `Per confermare scrivi: ${CONFIRM_TEXT}`);
  const db = admin();
  const files = (await removeFolder(db, "uploads", tenantId)) + (await removeFolder(db, "private", tenantId));
  // Le password delle caselle email (email_secrets) si cancellano a cascata con i record.
  const { error, count } = await db.from("entity_records").delete({ count: "exact" }).eq("tenant_id", tenantId);
  if (error) throw new HttpError(500, error.message);
  // Registri dell'azienda (compresi quelli appena scritti dalla cancellazione).
  await db.from("audit_log").delete().eq("tenant_id", tenantId);
  await db.from("app_errors").delete().eq("tenant_id", tenantId);
  const { error: e3 } = await db.auth.admin.deleteUser(user.id);
  if (e3) throw new HttpError(500, `Dati eliminati, ma l'utente non è stato rimosso: ${e3.message}`);
  return { ok: true, records: count || 0, files };
}

// Sessione dell'azienda demo: la password resta sul server, il browser riceve solo i token.
async function demoSession(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  rateLimit(`demo:${ip}`, 10, 60 * 60_000);
  const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
  if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new HttpError(503, "La demo non è disponibile in questo momento");
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (error || !data?.session) throw new HttpError(503, "La demo non è disponibile in questo momento");
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

export default handler(async (req, body) => {
  if (body.action === "demo") return demoSession(req);
  const ctx = await requireUser(req);
  if (body.action === "file-url") return signedUrls(ctx, body);
  if (body.action === "delete") return deleteAccount(ctx, body);
  throw new HttpError(400, "Azione non valida");
});
