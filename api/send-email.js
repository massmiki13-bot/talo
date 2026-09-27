// Invia un'email dalla casella aziendale collegata (SMTP).
import { handler, requireUser, admin, HttpError, rateLimit, toDoc } from "./_lib/server.js";
import { smtpTransport, sendMail, downloadAttachments } from "./_lib/mail.js";

export default handler(async (req, body) => {
  const { user, tenantId, accessLevel } = await requireUser(req);
  if (accessLevel === "operaio") throw new HttpError(403, "Non autorizzato a inviare email");
  rateLimit(`send:${user.id}`, 30, 60_000);

  const { to, subject, body: html, from_email, attachment_url, attachment_name, attachments } = body;
  if (!to || !subject || !from_email) {
    throw new HttpError(400, "Parametri mancanti: destinatario, oggetto e mittente sono obbligatori");
  }

  const { data: rows, error } = await admin()
    .from("entity_records")
    .select("*")
    .eq("entity", "EmailAccount")
    .eq("tenant_id", tenantId)
    .eq("data->>email_address", from_email);
  if (error) throw new HttpError(500, error.message);
  const account = rows.map(toDoc).find((a) => a.active !== false);
  if (!account) throw new HttpError(404, "Nessuna casella email configurata per questo indirizzo");

  if (account.provider !== "smtp") {
    throw new HttpError(400, "Collega la casella tramite SMTP con una password per app (Profilo Ditta → Caselle email).", { needs_smtp: true });
  }

  const { data: secret } = await admin()
    .from("email_secrets").select("smtp_password").eq("account_id", account.id).maybeSingle();
  if (!account.smtp_host || !secret?.smtp_password) {
    throw new HttpError(400, "Dati SMTP incompleti: inserisci server e password per app", { needs_smtp: true });
  }

  const list = Array.isArray(attachments) ? attachments
    : attachment_url ? [{ url: attachment_url, name: attachment_name || "documento.pdf" }] : [];

  const transport = smtpTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    user: account.smtp_username || account.email_address,
    pass: secret.smtp_password,
  });
  try {
    const info = await sendMail(transport, {
      fromName: account.display_name,
      fromEmail: account.email_address,
      to,
      subject,
      html,
      attachments: await downloadAttachments(list),
    });
    return { success: true, provider: "smtp", messageId: info.messageId };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const auth = /auth|credential|535|534/i.test(e.message || "");
    throw new HttpError(502, auth
      ? "Il server email ha rifiutato le credenziali: controlla utente e password per app"
      : `Invio non riuscito: ${e.message}`);
  }
});
