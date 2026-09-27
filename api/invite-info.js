// Dati pubblici di un invito (senza il codice di conferma).
import { handler, requireUser, admin, HttpError, getRecord, toDoc } from "./_lib/server.js";

export const INVITE_TTL_DAYS = 14;

export function isExpired(invite) {
  const created = new Date(invite.created_date).getTime();
  return Date.now() - created > INVITE_TTL_DAYS * 86_400_000;
}

export default handler(async (req, body) => {
  await requireUser(req);
  if (!body.inviteId) throw new HttpError(400, "Invito mancante");
  const row = await getRecord("CollaboratorInvite", body.inviteId).catch(() => null);
  if (!row) throw new HttpError(404, "Invito non valido");
  const invite = toDoc(row);

  const { data: profile } = await admin()
    .from("entity_records").select("data")
    .eq("entity", "CompanyProfile").eq("tenant_id", row.tenant_id)
    .order("created_date", { ascending: true }).limit(1).maybeSingle();

  return {
    id: invite.id,
    status: invite.status === "pending" && isExpired(invite) ? "expired" : invite.status,
    access_level: invite.access_level,
    permissions: invite.permissions || [],
    email: invite.email,
    display_name: invite.display_name,
    company_name: profile?.data?.ragione_sociale || null,
  };
});
