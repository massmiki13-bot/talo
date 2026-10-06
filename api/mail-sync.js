// Scarica la posta in arrivo (IMAP) delle caselle dell'azienda.
import { handler, requireUser, admin, HttpError, rateLimit, toDoc } from "./_lib/server.js";
import { loadAccount, syncInbox, friendlyMailError } from "./_lib/mailbox.js";

export default handler(async (req, body) => {
  const { user, tenantId, accessLevel } = await requireUser(req);
  if (accessLevel === "operaio") throw new HttpError(403, "Non autorizzato");
  await rateLimit(`sync:${user.id}`, 12, 60_000);

  let accounts;
  if (body.account_id) {
    accounts = [(await loadAccount(tenantId, { id: body.account_id })).account];
  } else {
    const { data, error } = await admin()
      .from("entity_records").select("*").eq("entity", "EmailAccount").eq("tenant_id", tenantId);
    if (error) throw new HttpError(500, error.message);
    accounts = data.map(toDoc).filter((a) => a.active !== false && a.ricezione_attiva !== false && a.imap_host);
  }

  const results = [];
  for (const acc of accounts) {
    try {
      const { account, password } = await loadAccount(tenantId, { id: acc.id });
      const added = await syncInbox({ tenantId, userId: user.id, userEmail: user.email, account, password });
      results.push({ account_id: acc.id, email: acc.email_address, added });
    } catch (e) {
      results.push({ account_id: acc.id, email: acc.email_address, error: e instanceof HttpError ? e.message : friendlyMailError(e) });
    }
  }
  return { results, added: results.reduce((n, r) => n + (r.added || 0), 0) };
});
