import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Compute today's date in Europe/Rome timezone (YYYY-MM-DD)
    const now = new Date();
    const todayRome = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(now);

    // Get all reminders due today (both scadenze and preavvisi)
    const reminders = await base44.asServiceRole.entities.Reminder.filter({ data: todayRome }, '-created_date', 200);
    const activeReminders = reminders.filter(r => !r.completato);

    if (activeReminders.length === 0) {
      return Response.json({ sent: 0, total: 0, date: todayRome });
    }

    // Build user email lookup
    const users = await base44.asServiceRole.entities.User.list();
    const userEmailMap = {};
    for (const u of users) {
      if (u.email) userEmailMap[u.id] = u.email;
    }

    // Get company name for sender
    const profiles = await base44.asServiceRole.entities.CompanyProfile.list();
    const companyName = profiles[0]?.ragione_sociale || "Talo";

    // Group reminders by user (created_by_id)
    const byUser = {};
    for (const r of activeReminders) {
      const uid = r.created_by_id;
      if (!uid) continue;
      if (!byUser[uid]) byUser[uid] = [];
      byUser[uid].push(r);
    }

    let sent = 0;
    let errors = 0;
    for (const [uid, userReminders] of Object.entries(byUser)) {
      const email = userEmailMap[uid];
      if (!email) { errors++; continue; }

      const hasPreavviso = userReminders.some(r => r.is_preavviso);
      const hasScadenza = userReminders.some(r => !r.is_preavviso);

      let subject;
      if (hasPreavviso && hasScadenza) {
        subject = `Hai ${userReminders.length} promemoria per oggi (${todayRome})`;
      } else if (hasPreavviso) {
        subject = `${userReminders.length} avviso/i di scadenza imminente`;
      } else {
        subject = `${userReminders.length} scadenza/e oggi`;
      }

      let body = `Hai ${userReminders.length} promemoria per oggi (${todayRome}):\n\n`;
      for (const r of userReminders) {
        const icon = r.is_preavviso ? "AVVISO" : "SCADENZA";
        body += `[${icon}] ${r.titolo}\n`;
        if (r.descrizione) body += `   ${r.descrizione}\n`;
        body += `\n`;
      }
      body += `Apri l'app per gestire i promemoria.\n\n— ${companyName}`;

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject,
          body,
          from_name: companyName
        });
        sent++;
      } catch (e) {
        console.error(`Failed to send to ${email}:`, e.message);
        errors++;
      }
    }

    return Response.json({ sent, errors, total: activeReminders.length, date: todayRome });
  } catch (error) {
    console.error("checkRemindersAndNotify error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});