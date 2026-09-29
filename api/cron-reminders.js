// Ogni mattina: email a ciascun utente con i promemoria e le scadenze del giorno.
// Chiamata dal cron di Vercel (vercel.json) con l'intestazione CRON_SECRET.
import { admin, escapeHtml } from "./_lib/server.js";
import { systemTransport, systemFrom, sendMail } from "./_lib/mail.js";
import { resetDemo, demoUserId, isDemoTenant } from "./_lib/demo.js";
import { sendWeeklyReports } from "./_lib/weeklyReport.js";

export default async function cronReminders(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Non autorizzato" });
    return;
  }
  try {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
    const db = admin();
    // Ogni mattina l'azienda demo torna ai suoi dati di esempio (con date aggiornate).
    if (demoUserId()) await resetDemo(demoUserId(), process.env.DEMO_EMAIL).catch((e) => console.error("Ripristino demo non riuscito:", e.message));
    // Il lunedì: report settimanale ai titolari.
    const weekly = new Date(`${today}T12:00:00Z`).getUTCDay() === 1 ? await sendWeeklyReports().catch((e) => { console.error("Report settimanali:", e.message); return 0; }) : 0;

    const { data: rows, error } = await db
      .from("entity_records").select("tenant_id, created_by_id, data")
      .eq("entity", "Reminder").eq("data->>data", today);
    if (error) throw error;
    const active = rows.filter((r) => !r.data.completato && r.created_by_id && !isDemoTenant(r.tenant_id));
    if (active.length === 0) {
      res.status(200).json({ sent: 0, total: 0, date: today, weekly });
      return;
    }

    const tenants = [...new Set(active.map((r) => r.tenant_id))];
    const { data: profiles } = await db
      .from("entity_records").select("tenant_id, data")
      .eq("entity", "CompanyProfile").in("tenant_id", tenants);
    const companyOf = Object.fromEntries((profiles || []).map((p) => [p.tenant_id, p.data?.ragione_sociale]));

    const byUser = new Map();
    for (const r of active) {
      if (!byUser.has(r.created_by_id)) byUser.set(r.created_by_id, { tenant: r.tenant_id, items: [] });
      byUser.get(r.created_by_id).items.push(r.data);
    }

    const transport = systemTransport();
    const appUrl = process.env.APP_URL || "";
    let sent = 0;
    let errors = 0;
    for (const [userId, { tenant, items }] of byUser) {
      const { data: u } = await db.auth.admin.getUserById(userId);
      const email = u?.user?.email;
      if (!email) { errors++; continue; }
      const company = companyOf[tenant] || "Talo";
      const pre = items.filter((i) => i.is_preavviso).length;
      const due = items.length - pre;
      const subject = pre && due ? `Hai ${items.length} promemoria per oggi`
        : pre ? `${pre} ${pre === 1 ? "scadenza in arrivo" : "scadenze in arrivo"}`
        : `${due} ${due === 1 ? "scadenza oggi" : "scadenze oggi"}`;
      const list = items.sort((a, b) => String(a.ora || "99").localeCompare(String(b.ora || "99"))).map((i) => `
        <li style="margin:0 0 10px">
          <strong style="color:${i.is_preavviso ? "#b45309" : "#b91c1c"}">${i.is_preavviso ? "AVVISO" : "SCADENZA"}</strong>
          — ${i.ora ? `${escapeHtml(i.ora)} · ` : ""}${i.priorita === "alta" ? "<strong>[URGENTE]</strong> " : ""}${escapeHtml(i.titolo)}${i.luogo ? ` (${escapeHtml(i.luogo)})` : ""}${i.descrizione ? `<br><span style="color:#475569">${escapeHtml(i.descrizione)}</span>` : ""}
        </li>`).join("");
      const html = `
        <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;max-width:560px">
          <p>Promemoria di oggi (${today}):</p>
          <ul style="padding-left:18px">${list}</ul>
          ${appUrl ? `<p><a href="${appUrl}/promemoria" style="color:#1d4ed8">Apri i promemoria in Talo</a></p>` : ""}
          <p style="color:#64748b">— ${escapeHtml(company)}</p>
        </div>`;
      try {
        await sendMail(transport, { fromName: company, fromEmail: systemFrom(), to: email, subject, html });
        sent++;
      } catch (e) {
        console.error(`Promemoria non inviato a ${email}:`, e.message);
        errors++;
      }
    }
    res.status(200).json({ sent, errors, total: active.length, date: today });
  } catch (e) {
    console.error("cron-reminders:", e);
    res.status(500).json({ error: e.message });
  }
}
