// Report settimanale al titolare (ogni lunedì): incassi, crediti scaduti, lavori in ritardo o in perdita, scadenze.
import { admin, escapeHtml } from "./server.js";
import { systemTransport, systemFrom, sendMail } from "./mail.js";
import { isDemoTenant } from "./demo.js";

const n = (v) => Number(v) || 0;
const eur = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n(v));
const it = (d) => new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
const romeToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
const addDays = (iso, k) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };

async function load(tenantId) {
  const { data, error } = await admin().from("entity_records").select("entity, id, data").eq("tenant_id", tenantId)
    .in("entity", ["CompanyProfile", "Worksite", "WorksitePayment", "WorksiteTransaction", "Invoice", "CompanyDocument", "EmployeeDocument", "Employee", "Equipment", "Reminder"]);
  if (error) throw error;
  const by = {};
  for (const r of data || []) (by[r.entity] ||= []).push({ id: r.id, ...r.data });
  return by;
}

// Rate del piano pagamenti coperte dai pagamenti in ordine di scadenza (come nell'app).
function overdueRates(w, income, today) {
  let paid = income.reduce((s, p) => s + n(p.importo), 0);
  return [...(w.piano_pagamenti || [])].sort((a, b) => String(a.scadenza || "9999").localeCompare(String(b.scadenza || "9999"))).map((r) => {
    const covered = Math.min(n(r.importo), Math.max(0, paid)); paid -= covered;
    return { ...r, residuo: n(r.importo) - covered };
  }).filter((r) => r.residuo > 0.5 && r.scadenza && r.scadenza < today);
}

export async function buildWeeklyReport(tenantId, today = romeToday()) {
  const d = await load(tenantId);
  const profile = (d.CompanyProfile || [])[0] || {};
  const from = addDays(today, -7);
  const payments = d.WorksitePayment || [];
  const txs = d.WorksiteTransaction || [];
  const inWeek = (x) => x.data >= from && x.data < today;
  const incassi = payments.filter(inWeek).reduce((s, p) => s + n(p.importo), 0) + txs.filter((t) => t.tipo === "entrata" && inWeek(t)).reduce((s, t) => s + n(t.importo), 0);
  const spese = txs.filter((t) => t.tipo === "uscita" && inWeek(t)).reduce((s, t) => s + n(t.importo), 0);

  const invScadute = (d.Invoice || []).filter((i) => !["pagata", "bozza"].includes(i.stato) && i.tipo_documento !== "TD04" && (i.scadenza || i.data) < today);
  const works = (d.Worksite || []).filter((w) => w.stato !== "finito");
  const rateScadute = works.flatMap((w) => overdueRates(w, [...payments.filter((p) => p.worksite_id === w.id), ...txs.filter((t) => t.tipo === "entrata" && t.worksite_id === w.id)], today).map((r) => ({ ...r, lavoro: w.nome, cliente: w.cliente_nome })));
  const crediti = invScadute.reduce((s, i) => s + n(i.totale), 0) + rateScadute.reduce((s, r) => s + r.residuo, 0);

  const ritardi = works.filter((w) => w.stato === "in_corso" && w.data_fine_prevista && w.data_fine_prevista < today);
  const perdite = works.map((w) => {
    const costi = txs.filter((t) => t.worksite_id === w.id && t.tipo === "uscita").reduce((s, t) => s + n(t.importo), 0);
    return { w, costi, ricavo: n(w.importo_totale) };
  }).filter((x) => x.ricavo && x.costi > x.ricavo * 0.85);

  const limit = addDays(today, 14);
  const empName = (id) => { const e = (d.Employee || []).find((x) => x.id === id); return e ? `${e.nome} ${e.cognome}` : ""; };
  const scadenze = [
    ...(d.CompanyDocument || []).filter((x) => x.data_scadenza && x.data_scadenza <= limit).map((x) => ({ data: x.data_scadenza, testo: x.titolo })),
    ...(d.EmployeeDocument || []).filter((x) => x.data_scadenza && x.data_scadenza <= limit).map((x) => ({ data: x.data_scadenza, testo: `${x.titolo} – ${empName(x.dipendente_id)}` })),
    ...(d.Equipment || []).flatMap((m) => Object.entries(m.scadenze || {}).filter(([, v]) => v && v <= limit).map(([k, v]) => ({ data: v, testo: `${k.replace(/_/g, " ")} ${m.nome}` }))),
    ...(d.Reminder || []).filter((r) => !r.completato && r.data >= today && r.data <= addDays(today, 7)).map((r) => ({ data: r.data, testo: r.titolo })),
  ].sort((a, b) => a.data.localeCompare(b.data)).slice(0, 15);

  const appUrl = process.env.APP_URL || "";
  const kpi = (label, value, color = "#0f172a") => `<td style="padding:14px;border:1px solid #e4e4e7;border-radius:10px;width:33%"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#71717a">${label}</div><div style="font-size:22px;font-weight:700;color:${color};margin-top:4px">${value}</div></td>`;
  const list = (title, items) => items.length ? `<h3 style="font-size:14px;margin:22px 0 8px">${title}</h3><ul style="margin:0;padding-left:18px;color:#27272a">${items.map((x) => `<li style="margin:4px 0">${x}</li>`).join("")}</ul>` : "";

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#18181b;max-width:620px">
    <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#c3122a;margin:0">Report settimanale</p>
    <h2 style="margin:6px 0 16px">${escapeHtml(profile.ragione_sociale || "La tua impresa")} · settimana dal ${it(from)} al ${it(addDays(today, -1))}</h2>
    <table style="width:100%;border-collapse:separate;border-spacing:8px 0"><tr>${kpi("Incassato", eur(incassi), "#047857")}${kpi("Spese registrate", eur(spese))}${kpi("Crediti scaduti", eur(crediti), crediti ? "#b91c1c" : "#0f172a")}</tr></table>
    ${list("Da sollecitare", [...invScadute.map((i) => `Fattura ${escapeHtml(i.numero)} – ${escapeHtml(i.cliente_nome || "")}: ${eur(i.totale)} (scaduta il ${it(i.scadenza || i.data)})`), ...rateScadute.map((r) => `${escapeHtml(r.descrizione || "Rata")} – ${escapeHtml(r.lavoro)}: ${eur(r.residuo)} (scaduta il ${it(r.scadenza)})`)].slice(0, 10))}
    ${list("Lavori in ritardo", ritardi.map((w) => `${escapeHtml(w.nome)} – fine prevista il ${it(w.data_fine_prevista)}, avanzamento ${Math.round(n(w.avanzamento))}%`))}
    ${list("Lavori con margine a rischio", perdite.map((x) => `${escapeHtml(x.w.nome)} – costi ${eur(x.costi)} su ${eur(x.ricavo)} di contratto`))}
    ${list("Scadenze dei prossimi 14 giorni", scadenze.map((s) => `${it(s.data)} · ${escapeHtml(s.testo)}`))}
    ${!invScadute.length && !rateScadute.length && !ritardi.length && !perdite.length && !scadenze.length ? `<p style="margin-top:20px">Nessuna urgenza questa settimana. Buon lavoro!</p>` : ""}
    ${appUrl ? `<p style="margin-top:24px"><a href="${appUrl}/scadenzario" style="background:#c3122a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Apri lo scadenzario</a> &nbsp; <a href="${appUrl}/" style="color:#c3122a">Dashboard</a></p>` : ""}
    <p style="font-size:12px;color:#71717a;margin-top:24px">Ricevi questo report ogni lunedì. Puoi disattivarlo in Profilo ditta → Avvisi di scadenza.</p>
  </div>`;
  return { subject: `Talo · settimana: ${eur(incassi)} incassati${crediti ? `, ${eur(crediti)} da sollecitare` : ""}`, html, attivo: profile.report_settimanale !== false };
}

/** Invia il report a tutti i titolari (chiamata dal cron del lunedì). */
export async function sendWeeklyReports() {
  const { data } = await admin().from("entity_records").select("tenant_id").eq("entity", "CompanyProfile");
  const tenants = [...new Set((data || []).map((r) => r.tenant_id))].filter((t) => !isDemoTenant(t));
  const transport = systemTransport();
  let sent = 0;
  for (const t of tenants) {
    try {
      const { data: u } = await admin().auth.admin.getUserById(t);
      if (!u?.user?.email || /@talo\.test$/.test(u.user.email)) continue;
      const r = await buildWeeklyReport(t);
      if (!r.attivo) continue;
      await sendMail(transport, { fromName: "Talo", fromEmail: systemFrom(), to: u.user.email, subject: r.subject, html: r.html });
      sent++;
    } catch (e) { console.error("Report settimanale non inviato:", t, e.message); }
  }
  return sent;
}
