// Invia un'email o una PEC dalla casella aziendale collegata e la registra
// nella posta inviata (anche in caso di errore, con il motivo).
import { handler, requireUser, admin, HttpError, rateLimit } from "./_lib/server.js";
import { isDemoTenant } from "./_lib/demo.js";
import { smtpTransport, sendMail, downloadAttachments } from "./_lib/mail.js";
import { loadAccount, login, parseAddresses, insertMessage, searchText, friendlyMailError } from "./_lib/mailbox.js";

const MAX_RECIPIENTS = 50;

export default handler(async (req, body) => {
  const { user, tenantId, accessLevel } = await requireUser(req);
  if (accessLevel === "operaio") throw new HttpError(403, "Non autorizzato a inviare email");
  rateLimit(`send:${user.id}`, 30, 60_000);
  if (isDemoTenant(tenantId)) throw new HttpError(403, "Nella demo l'invio di email è disattivato: crea il tuo account per usarlo.");

  const { subject, body: html, text, from_email, account_id, draft_id } = body;
  const to = parseAddresses(body.to);
  const cc = parseAddresses(body.cc);
  const bcc = parseAddresses(body.bcc);
  if (to.length === 0) throw new HttpError(400, "Inserisci almeno un destinatario");
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) throw new HttpError(400, `Massimo ${MAX_RECIPIENTS} destinatari per invio`);
  if (!subject?.trim()) throw new HttpError(400, "Inserisci l'oggetto");
  if (!from_email && !account_id) throw new HttpError(400, "Scegli la casella mittente");

  const { account, password } = await loadAccount(tenantId, account_id ? { id: account_id } : { email: from_email });
  if (account.provider !== "smtp") {
    throw new HttpError(400, "Collega la casella tramite SMTP con una password per app (Profilo Ditta → Caselle email).", { needs_smtp: true });
  }
  if (!account.smtp_host || !password) {
    throw new HttpError(400, "Dati SMTP incompleti: inserisci server e password per app", { needs_smtp: true });
  }

  const list = Array.isArray(body.attachments) ? body.attachments
    : body.attachment_url ? [{ url: body.attachment_url, name: body.attachment_name || "documento.pdf" }] : [];
  const files = await downloadAttachments(list, tenantId);

  const record = {
    account_id: account.id,
    account_email: account.email_address,
    direzione: "out",
    is_pec: !!account.is_pec,
    from_name: account.display_name || "",
    from_email: account.email_address,
    to, cc, bcc,
    subject,
    html: String(html || "").slice(0, 300_000),
    text: String(text || "").slice(0, 100_000),
    snippet: String(text || String(html || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 180),
    data: new Date().toISOString(),
    allegati: list.map((a, i) => ({ name: a.name || `allegato-${i + 1}`, url: a.url, size: files[i]?.content?.length })),
    letto: true,
    contact_id: body.contact_id || null,
    worksite_id: body.worksite_id || null,
    quote_id: body.quote_id || null,
    search_text: searchText([account.display_name, to, cc, subject, String(text || "").slice(0, 1500)]),
  };

  const transport = smtpTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    user: login(account),
    pass: password,
  });

  let info;
  try {
    info = await sendMail(transport, {
      fromName: account.display_name,
      fromEmail: account.email_address,
      to: to.join(", "),
      cc: cc.join(", ") || undefined,
      bcc: bcc.join(", ") || undefined,
      subject,
      html,
      text,
      attachments: files,
    });
  } catch (e) {
    const errore = friendlyMailError(e);
    await insertMessage(tenantId, user.id, user.email, { ...record, stato: "errore", errore }).catch(() => {});
    throw new HttpError(502, `Invio non riuscito: ${errore}`);
  }

  const saved = await insertMessage(tenantId, user.id, user.email, { ...record, stato: "inviata", message_id: info.messageId });
  // La bozza da cui è partito l'invio non serve più.
  if (draft_id) {
    await admin().from("entity_records").delete()
      .eq("id", draft_id).eq("tenant_id", tenantId).eq("entity", "EmailMessage").eq("data->>stato", "bozza");
  }
  return { success: true, provider: "smtp", is_pec: !!account.is_pec, messageId: info.messageId, message: saved };
});
