// Invio email: caselle SMTP delle aziende e casella di sistema di Talo.
import nodemailer from "nodemailer";
import { HttpError, supabaseHost } from "./server.js";

const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024;

// Allegati solo dall'archivio file di Talo (niente URL arbitrari: SSRF).
export function isAllowedFileUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === supabaseHost() && u.pathname.startsWith("/storage/v1/object/");
  } catch {
    return false;
  }
}

export async function downloadAttachments(list) {
  const out = [];
  let total = 0;
  for (const att of list || []) {
    if (!att?.url || !isAllowedFileUrl(att.url)) continue;
    const res = await fetch(att.url);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    total += buf.length;
    if (total > MAX_ATTACHMENTS_BYTES) throw new HttpError(413, "Allegati troppo grandi (massimo 20 MB)");
    out.push({ filename: String(att.name || "documento").replace(/[\r\n]+/g, " "), content: buf });
  }
  return out;
}

const clean = (v) => String(v || "").replace(/[\r\n]+/g, " ").trim();

export function smtpTransport({ host, port, user, pass }) {
  const p = Number(port) || 587;
  return nodemailer.createTransport({
    host,
    port: p,
    secure: p === 465,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });
}

export async function sendMail(transport, { fromName, fromEmail, to, subject, html, text, attachments }) {
  return transport.sendMail({
    from: { name: clean(fromName) || clean(fromEmail), address: clean(fromEmail) },
    to: clean(to),
    subject: clean(subject),
    html,
    text,
    attachments,
  });
}

// Casella di sistema (promemoria, avvisi): configurata con variabili d'ambiente.
export function systemTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new HttpError(503, "Email di sistema non configurata. Collega una casella in Profilo Ditta → Caselle email.");
  }
  return smtpTransport({ host: SMTP_HOST, port: SMTP_PORT, user: SMTP_USER, pass: SMTP_PASS });
}

export function systemFrom() {
  return process.env.SMTP_FROM || process.env.SMTP_USER;
}
