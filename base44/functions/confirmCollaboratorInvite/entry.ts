import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorizzato' }, { status: 401 });

    const { inviteId, code } = await req.json();
    if (!inviteId || !code) {
      return Response.json({ error: 'Parametri mancanti: inviteId e code sono obbligatori' }, { status: 400 });
    }

    // Fetch the invite server-side — do NOT trust any client-supplied role/permissions
    const invite = await base44.asServiceRole.entities.CollaboratorInvite.get(inviteId);
    if (!invite) {
      return Response.json({ error: 'Invito non valido' }, { status: 404 });
    }
    if (invite.status === 'used' || invite.status === 'expired') {
      return Response.json({ error: 'Questo invito è già stato utilizzato o è scaduto.' }, { status: 400 });
    }

    const MAX_ATTEMPTS = 5;
    const tentativi = Number(invite.tentativi_falliti) || 0;
    if (tentativi >= MAX_ATTEMPTS) {
      await base44.asServiceRole.entities.CollaboratorInvite.update(invite.id, { status: 'expired' });
      return Response.json({ error: 'Troppi tentativi errati. L\'invito è stato disattivato.' }, { status: 429 });
    }

    if (String(code).trim() !== String(invite.code)) {
      const nuoviTentativi = tentativi + 1;
      const updateData: Record<string, unknown> = { tentativi_falliti: nuoviTentativi };
      let msg = `Codice errato, riprova. Tentativi rimanenti: ${MAX_ATTEMPTS - nuoviTentativi}`;
      let status = 400;
      if (nuoviTentativi >= MAX_ATTEMPTS) {
        updateData.status = 'expired';
        msg = 'Troppi tentativi errati. L\'invito è stato disattivato.';
        status = 429;
      }
      await base44.asServiceRole.entities.CollaboratorInvite.update(invite.id, updateData);
      return Response.json({ error: msg }, { status });
    }

    // Use ONLY the values stored in the invite record — ignore any client-supplied fields
    const accessLevel = invite.access_level || 'responsabile';
    const employeeId = invite.employee_id || null;
    const permissions = accessLevel === 'responsabile' ? (invite.permissions || []) : [];

    // Check for existing collaborator record
    const existing = await base44.asServiceRole.entities.Collaborator.filter({
      collaborator_user_id: user.id,
      host_user_id: invite.host_user_id,
    });

    if (existing.length > 0) {
      await base44.asServiceRole.entities.Collaborator.update(existing[0].id, {
        status: 'active',
        access_level: accessLevel,
        branch_ids: [],
        employee_id: employeeId,
        permissions,
      });
    } else {
      await base44.asServiceRole.entities.Collaborator.create({
        host_user_id: invite.host_user_id,
        collaborator_user_id: user.id,
        email: user.email,
        display_name: user.full_name || user.email,
        access_level: accessLevel,
        branch_ids: [],
        employee_id: employeeId,
        permissions,
        status: 'active',
      });
    }

    // Mark invite as used
    await base44.asServiceRole.entities.CollaboratorInvite.update(invite.id, {
      status: 'used',
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});