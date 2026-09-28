// Cancellazione definitiva dell'account aziendale (diritto all'oblio / recesso): solo il titolare.
// Elimina file (archivio pubblico e privato), tutti i record dell'azienda e l'utente titolare.
import { handler, requireUser, admin, HttpError, rateLimit } from "./_lib/server.js";

export const CONFIRM_TEXT = "ELIMINA DEFINITIVAMENTE";

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

export default handler(async (req, body) => {
  const { user, tenantId, accessLevel } = await requireUser(req);
  rateLimit(`account-delete:${user.id}`, 3, 60_000);
  if (accessLevel !== "host" || tenantId !== user.id) throw new HttpError(403, "Solo il titolare può eliminare l'account dell'azienda");
  if (String(body.confirm || "").trim().toUpperCase() !== CONFIRM_TEXT) throw new HttpError(400, `Per confermare scrivi: ${CONFIRM_TEXT}`);

  const db = admin();
  const files = (await removeFolder(db, "uploads", tenantId)) + (await removeFolder(db, "private", tenantId));
  // Le password delle caselle email (email_secrets) si cancellano a cascata con i record.
  const { error, count } = await db.from("entity_records").delete({ count: "exact" }).eq("tenant_id", tenantId);
  if (error) throw new HttpError(500, error.message);
  const { error: e3 } = await db.auth.admin.deleteUser(user.id);
  if (e3) throw new HttpError(500, `Dati eliminati, ma l'utente non è stato rimosso: ${e3.message}`);
  return { ok: true, records: count || 0, files };
});
