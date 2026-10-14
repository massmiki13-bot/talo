// Verifica invio (SMTP) e ricezione (IMAP) di una casella.
import { handler, requireUser, HttpError, rateLimit } from "./_lib/server.js";
import { smtpTransport } from "./_lib/mail.js";
import { loadAccount, login, imapClient, friendlyMailError } from "./_lib/mailbox.js";

export default handler(async (req, body) => {
  const { user, tenantId } = await requireUser(req);
  await rateLimit(`verify:${user.id}`, 10, 60_000);
  if (!body.account_id) throw new HttpError(400, "account_id mancante");

  const { account, password } = await loadAccount(tenantId, { id: body.account_id });
  if (account.provider !== "smtp") {
    return { connected: false, status: "needs_smtp", message: "Collega la casella tramite SMTP con password per app" };
  }
  if (!account.smtp_host || !password) {
    return { connected: false, status: "incomplete", message: "Dati incompleti — inserisci server e password per app" };
  }

  const result = { connected: false, status: "ready", message: "Pronta per l'invio", imap: null };
  try {
    await smtpTransport({ host: account.smtp_host, port: account.smtp_port, user: login(account), pass: password }).verify();
    result.connected = true;
  } catch (e) {
    const msg = friendlyMailError(e);
    return { connected: false, status: /Credenziali/.test(msg) ? "auth_failed" : "connection_error", message: `Invio: ${msg}` };
  }

  if (account.imap_host && account.ricezione_attiva !== false) {
    const client = imapClient(account, password);
    try {
      await client.connect();
      result.imap = { ok: true };
      result.message = "Pronta per invio e ricezione";
    } catch (e) {
      result.imap = { ok: false, message: friendlyMailError(e) };
      result.message = `Invio ok · Ricezione: ${friendlyMailError(e)}`;
    } finally {
      await client.logout().catch(() => {});
    }
  }
  return result;
});
