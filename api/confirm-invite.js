// Conferma un invito collaboratore con il codice ricevuto dal titolare.
import { handler, requireUser, admin, HttpError, getRecord, toDoc, updateRecordData, rateLimit } from "./_lib/server.js";
import { isExpired } from "./invite-info.js";

const MAX_ATTEMPTS = 5;

export default handler(async (req, body) => {
  const { user } = await requireUser(req);
  rateLimit(`invite:${user.id}`, 10, 60_000);
  const { inviteId, code } = body;
  if (!inviteId || !code) throw new HttpError(400, "Parametri mancanti: invito e codice sono obbligatori");

  const row = await getRecord("CollaboratorInvite", inviteId).catch(() => null);
  if (!row) throw new HttpError(404, "Invito non valido");
  const invite = toDoc(row);
  const hostId = row.tenant_id; // il titolare è chi ha creato l'invito, non un campo modificabile

  if (hostId === user.id) throw new HttpError(400, "Non puoi accettare un invito della tua stessa azienda");
  if (invite.status === "used" || invite.status === "expired") {
    throw new HttpError(400, "Questo invito è già stato utilizzato o è scaduto.");
  }
  if (isExpired(invite)) {
    await updateRecordData(invite.id, { status: "expired" });
    throw new HttpError(400, "Questo invito è scaduto: chiedi al titolare di generarne uno nuovo.");
  }

  const attempts = Number(invite.tentativi_falliti) || 0;
  if (attempts >= MAX_ATTEMPTS) {
    await updateRecordData(invite.id, { status: "expired" });
    throw new HttpError(429, "Troppi tentativi errati. L'invito è stato disattivato.");
  }
  if (String(code).trim() !== String(invite.code)) {
    const next = attempts + 1;
    await updateRecordData(invite.id, { tentativi_falliti: next, ...(next >= MAX_ATTEMPTS ? { status: "expired" } : {}) });
    throw new HttpError(next >= MAX_ATTEMPTS ? 429 : 400, next >= MAX_ATTEMPTS
      ? "Troppi tentativi errati. L'invito è stato disattivato."
      : `Codice errato, riprova. Tentativi rimanenti: ${MAX_ATTEMPTS - next}`);
  }

  // Solo i valori salvati nell'invito, mai quelli inviati dal browser.
  const accessLevel = invite.access_level === "operaio" ? "operaio" : "responsabile";
  const data = {
    host_user_id: hostId,
    collaborator_user_id: user.id,
    email: user.email,
    display_name: invite.display_name || user.user_metadata?.full_name || user.email,
    access_level: accessLevel,
    branch_ids: [],
    employee_id: invite.employee_id || null,
    permissions: accessLevel === "responsabile" ? invite.permissions || [] : [],
    status: "active",
  };

  // Un utente collabora con una sola azienda alla volta.
  const { data: existing, error } = await admin()
    .from("entity_records").select("id, tenant_id")
    .eq("entity", "Collaborator").eq("data->>collaborator_user_id", user.id);
  if (error) throw new HttpError(500, error.message);
  const other = existing.find((r) => r.tenant_id !== hostId);
  if (other) {
    await updateRecordData(other.id, { status: "revoked" });
  }
  const same = existing.find((r) => r.tenant_id === hostId);
  if (same) {
    await updateRecordData(same.id, data);
  } else {
    const ins = await admin().from("entity_records").insert({
      entity: "Collaborator",
      tenant_id: hostId,
      created_by_id: hostId,
      created_by: invite.created_by,
      data,
    });
    if (ins.error) throw new HttpError(500, ins.error.message);
  }

  await updateRecordData(invite.id, { status: "used" });
  return { success: true };
});
