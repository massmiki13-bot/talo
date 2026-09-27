// Invio tramite la casella di sistema di Talo, usato quando l'azienda non ha
// ancora collegato una propria casella.
import { handler, requireUser, HttpError, rateLimit, admin } from "./_lib/server.js";
import { systemTransport, systemFrom, sendMail } from "./_lib/mail.js";

export default handler(async (req, body) => {
  const { user, tenantId, accessLevel } = await requireUser(req);
  if (accessLevel === "operaio") throw new HttpError(403, "Non autorizzato a inviare email");
  // Limite stretto: la casella di sistema non deve diventare un canale di spam.
  rateLimit(`sys:${user.id}`, 10, 60 * 60_000);

  const { to, subject, body: html } = body;
  if (!to || !subject || !html) throw new HttpError(400, "Destinatario, oggetto e testo sono obbligatori");
  if (String(to).split(/[,;]/).length > 5) throw new HttpError(400, "Massimo 5 destinatari");

  const { data: profile } = await admin()
    .from("entity_records").select("data")
    .eq("entity", "CompanyProfile").eq("tenant_id", tenantId)
    .order("created_date", { ascending: true }).limit(1).maybeSingle();
  const company = profile?.data?.ragione_sociale || "Talo";

  await sendMail(systemTransport(), {
    fromName: company,
    fromEmail: systemFrom(),
    to,
    subject,
    html,
  });
  return { success: true };
});
