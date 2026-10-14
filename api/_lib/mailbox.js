// Caselle email: credenziali, IMAP (posta in arrivo) e archivio messaggi.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { admin, HttpError, toDoc, updateRecordData } from "./server.js";

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

// "a@b.it, Mario <c@d.it>; e@f.it" oppure array → ["a@b.it", "c@d.it", "e@f.it"]
export function parseAddresses(value) {
  const parts = Array.isArray(value) ? value : String(value || "").split(/[,;\n]+/);
  const out = [];
  for (const raw of parts) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const m = s.match(/<([^>]+)>/);
    const email = (m ? m[1] : s).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, `Indirizzo email non valido: ${s}`);
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

export async function loadAccount(tenantId, where) {
  let q = admin().from("entity_records").select("*").eq("entity", "EmailAccount").eq("tenant_id", tenantId);
  if (where.id) q = q.eq("id", where.id);
  if (where.email) q = q.eq("data->>email_address", where.email);
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  const account = (data || []).map(toDoc).find((a) => a.active !== false);
  if (!account) throw new HttpError(404, "Casella email non trovata o disattivata");
  const { data: secret } = await admin()
    .from("email_secrets").select("smtp_password").eq("account_id", account.id).maybeSingle();
  return { account, password: secret?.smtp_password || null };
}

export function login(account) {
  return account.smtp_username || account.email_address;
}

export function imapClient(account, password) {
  if (!account.imap_host) throw new HttpError(400, "Server IMAP non configurato per questa casella", { needs_imap: true });
  if (!password) throw new HttpError(400, "Password della casella mancante", { needs_smtp: true });
  return new ImapFlow({
    host: account.imap_host,
    port: Number(account.imap_port) || 993,
    secure: (Number(account.imap_port) || 993) === 993,
    auth: { user: login(account), pass: password },
    logger: false,
    socketTimeout: 30000,
    greetingTimeout: 15000,
  });
}

export function friendlyMailError(e) {
  const msg = e?.responseText || e?.message || String(e);
  if (/auth|credential|login|535|534|invalid/i.test(msg)) return "Credenziali rifiutate: controlla utente e password per app";
  if (/ENOTFOUND|getaddrinfo/i.test(msg)) return "Server non trovato: controlla l'indirizzo del server";
  if (/ECONNREFUSED|ETIMEDOUT|timeout/i.test(msg)) return "Server non raggiungibile: controlla server e porta";
  if (/certificate|self.signed|CERT_/i.test(msg)) return "Connessione sicura non verificabile (certificato del server o antivirus che la intercetta)";
  return msg;
}

// Tipo di messaggio PEC dalle intestazioni standard (DPR 68/2005).
export function pecKind(headers) {
  const ricevuta = headers.get("x-ricevuta");
  const trasporto = headers.get("x-trasporto");
  if (ricevuta) return String(ricevuta); // accettazione, avvenuta-consegna, non-accettazione, errore-consegna, ...
  if (trasporto) return String(trasporto); // posta-certificata, errore
  return null;
}

export function searchText(fields) {
  return fields.flat().filter(Boolean).join(" ").toLowerCase().slice(0, 4000);
}

function snippetOf(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

async function findContactByEmail(tenantId, email) {
  if (!email) return null;
  // Due confronti esatti: l'indirizzo del mittente non entra mai nella sintassi del filtro.
  for (const field of ["email", "pec"]) {
    const { data } = await admin()
      .from("entity_records").select("id")
      .eq("entity", "Contact").eq("tenant_id", tenantId).eq(`data->>${field}`, email)
      .limit(1);
    if (data?.[0]?.id) return data[0].id;
  }
  return null;
}

export async function insertMessage(tenantId, userId, userEmail, data) {
  const { data: row, error } = await admin().from("entity_records").insert({
    entity: "EmailMessage",
    tenant_id: tenantId,
    created_by_id: userId,
    created_by: userEmail,
    data,
  }).select("*").single();
  if (error) throw new HttpError(500, error.message);
  return toDoc(row);
}

// Scarica i messaggi nuovi della cartella INBOX (massimo `limit` per chiamata).
export async function syncInbox({ tenantId, userId, userEmail, account, password, limit = 40 }) {
  const client = imapClient(account, password);
  let added = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const box = /** @type {any} */ (client.mailbox);
      const uidValidity = String(box.uidValidity);
      const sameBox = account.uidvalidity === uidValidity;
      const lastUid = sameBox ? Number(account.ultimo_uid) || 0 : 0;

      // Prima sincronizzazione: solo gli ultimi `limit` messaggi.
      const range = lastUid > 0 ? `${lastUid + 1}:*` : `${Math.max(1, (box.uidNext || 1) - limit)}:*`;
      const uids = [];
      for await (const msg of client.fetch(range, { uid: true }, { uid: true })) {
        if (msg.uid > lastUid) uids.push(msg.uid);
      }
      const toFetch = uids.sort((a, b) => a - b).slice(-limit);

      let maxUid = lastUid;
      for (const uid of toFetch) {
        const msg = /** @type {any} */ (await client.fetchOne(String(uid), { source: true, flags: true, uid: true }, { uid: true }));
        if (!msg?.source) continue;
        const parsed = await simpleParser(msg.source, { skipImageLinks: true });
        const from = parsed.from?.value?.[0] || {};
        const kind = pecKind(parsed.headers);
        const text = (parsed.text || "").slice(0, 100_000);
        const html = typeof parsed.html === "string" ? parsed.html.slice(0, 300_000) : "";
        const to = (parsed.to?.value || []).map((a) => a.address).filter(Boolean);
        const cc = (parsed.cc?.value || []).map((a) => a.address).filter(Boolean);
        // `index` = posizione nell'elenco completo, usata per riscaricare l'allegato.
        const allegati = (parsed.attachments || [])
          .map((a, index) => ({ a, index }))
          .filter(({ a }) => a.contentDisposition !== "inline" || !a.cid)
          .map(({ a, index }) => ({ name: a.filename || `allegato-${index + 1}`, size: a.size, content_type: a.contentType, index }));
        const subject = parsed.subject || "(senza oggetto)";
        const fromEmail = (from.address || "").toLowerCase();

        await insertMessage(tenantId, userId, userEmail, {
          account_id: account.id,
          account_email: account.email_address,
          direzione: "in",
          stato: "ricevuta",
          is_pec: !!account.is_pec || !!kind,
          pec_tipo: kind,
          from_name: from.name || "",
          from_email: fromEmail,
          to, cc, bcc: [],
          subject,
          html,
          text,
          snippet: snippetOf(text || html.replace(/<[^>]+>/g, " ")),
          data: (parsed.date || new Date()).toISOString(),
          message_id: parsed.messageId || null,
          in_reply_to: parsed.inReplyTo || null,
          imap_uid: uid,
          imap_uidvalidity: uidValidity,
          allegati,
          letto: msg.flags?.has("\\Seen") || false,
          contact_id: await findContactByEmail(tenantId, fromEmail),
          search_text: searchText([from.name, fromEmail, to, cc, subject, text.slice(0, 1500)]),
        });
        added++;
        if (uid > maxUid) maxUid = uid;
      }

      const patch = { ultimo_uid: maxUid, uidvalidity: uidValidity, ultima_sincronizzazione: new Date().toISOString() };
      await updateRecordData(account.id, patch);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return added;
}

// Scarica un allegato di un messaggio ricevuto rileggendolo dal server IMAP.
export async function fetchAttachment({ account, password, uid, index }) {
  const client = imapClient(account, password);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const msg = /** @type {any} */ (await client.fetchOne(String(uid), { source: true }, { uid: true }));
      if (!msg?.source) throw new HttpError(404, "Messaggio non più presente sul server");
      const parsed = await simpleParser(msg.source);
      const att = (parsed.attachments || [])[index];
      if (!att) throw new HttpError(404, "Allegato non trovato");
      return att;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
