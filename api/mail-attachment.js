// Scarica un allegato di un'email ricevuta (restituisce il file).
import { requireUser, HttpError, getRecord, toDoc } from "./_lib/server.js";
import { loadAccount, fetchAttachment, friendlyMailError } from "./_lib/mailbox.js";

export default async function mailAttachment(req, res) {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Metodo non consentito");
    const { tenantId, accessLevel } = await requireUser(req);
    if (accessLevel === "operaio") throw new HttpError(403, "Non autorizzato");
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const row = await getRecord("EmailMessage", body.message_id);
    if (!row || row.tenant_id !== tenantId) throw new HttpError(404, "Messaggio non trovato");
    const msg = toDoc(row);
    const index = Number(body.index);
    if (!msg.imap_uid || !Number.isInteger(index)) throw new HttpError(400, "Allegato non disponibile");

    const { account, password } = await loadAccount(tenantId, { id: msg.account_id });
    let att;
    try {
      att = await fetchAttachment({ account, password, uid: msg.imap_uid, index });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(502, friendlyMailError(e));
    }
    const name = encodeURIComponent(att.filename || `allegato-${index + 1}`);
    res.setHeader("Content-Type", att.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${name}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.statusCode = 200;
    res.end(att.content);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(e);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: e.message || "Errore interno" }));
  }
}
