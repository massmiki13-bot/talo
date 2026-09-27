// Verifica che una casella SMTP sia raggiungibile e le credenziali valide.
import { handler, requireUser, admin, HttpError, getRecord, toDoc, rateLimit } from "./_lib/server.js";
import { smtpTransport } from "./_lib/mail.js";

export default handler(async (req, body) => {
  const { user, tenantId } = await requireUser(req);
  rateLimit(`verify:${user.id}`, 10, 60_000);
  if (!body.account_id) throw new HttpError(400, "account_id mancante");

  const row = await getRecord("EmailAccount", body.account_id);
  if (!row || row.tenant_id !== tenantId) throw new HttpError(404, "Account non trovato");
  const account = toDoc(row);

  if (account.provider !== "smtp") {
    return { connected: false, status: "needs_smtp", message: "Collega la casella tramite SMTP con password per app" };
  }
  const { data: secret } = await admin()
    .from("email_secrets").select("smtp_password").eq("account_id", account.id).maybeSingle();
  if (!account.smtp_host || !secret?.smtp_password) {
    return { connected: false, status: "incomplete", message: "Dati SMTP incompleti — inserisci server e password per app" };
  }
  try {
    await smtpTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      user: account.smtp_username || account.email_address,
      pass: secret.smtp_password,
    }).verify();
    return { connected: true, status: "ready", message: "Pronta per l'invio" };
  } catch (e) {
    const auth = /auth|credential|535|534/i.test(e.message || "");
    return {
      connected: false,
      status: auth ? "auth_failed" : "connection_error",
      message: auth ? "Credenziali rifiutate: controlla la password per app" : `Server non raggiungibile: ${e.message}`,
    };
  }
});
