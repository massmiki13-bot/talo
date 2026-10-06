// Pagina pubblica del preventivo: il cliente la apre dal link, senza account.
// GET  ?t=<token>  → dati del preventivo (senza costi interni) e segna "visto"
// POST { token, esito: "accetta"|"rifiuta", nome, commento, firma } → risposta del cliente
// Firma da telefono di contratti e POS (stesso endpoint, limite funzioni Vercel):
// GET  ?f=<token>  → documento da firmare
// POST { documento: true, token, nome, firma, hash, accetto, firmatario_id? }
import { admin, HttpError, rateLimit, escapeHtml, updateRecordData, parseBody, publicMessage } from "./_lib/server.js";
import { getSignable, postSignature } from "./_lib/sign.js";
import { getClientArea } from "./_lib/clientArea.js";
// Area cliente del lavoro: GET ?c=<token>
import { systemTransport, systemFrom, sendMail } from "./_lib/mail.js";

const PUBLIC_QUOTE_FIELDS = [
  "numero", "revisione", "data", "cliente_nome", "oggetto", "righe", "imponibile", "iva_totale", "totale", "sconto_globale",
  "stato", "validita_giorni", "condizioni_pagamento", "tempi_esecuzione", "clausole", "note", "template_variante",
  "copertina", "allegati", "risposta_cliente", "firma_cliente_url", "data_firma_cliente",
];
const PUBLIC_PROFILE_FIELDS = [
  "ragione_sociale", "partita_iva", "codice_fiscale", "indirizzo", "citta", "cap", "provincia", "telefono", "email", "pec",
  "sito_web", "logo_url", "firma_url", "timbro_url", "colore_principale", "colore_secondario", "logo_larghezza", "logo_altezza",
  "logo_posizione", "logo_su_ogni_pagina", "iban",
];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

async function loadByToken(token) {
  if (!token || !/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new HttpError(404, "Link non valido");
  const { data, error } = await admin()
    .from("entity_records").select("*").eq("entity", "Quote").eq("data->>public_token", token).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Preventivo non trovato o link revocato");
  return data;
}

async function loadProfile(tenantId) {
  const { data } = await admin()
    .from("entity_records").select("data").eq("entity", "CompanyProfile").eq("tenant_id", tenantId)
    .order("created_date", { ascending: true }).limit(1).maybeSingle();
  return data?.data || {};
}

const saveQuote = (row, patch) => updateRecordData(row.id, patch);

async function notifyOwner(row, profile, subject, html) {
  try {
    const { data } = await admin().auth.admin.getUserById(row.created_by_id || row.tenant_id);
    const to = data?.user?.email;
    if (!to) return;
    await sendMail(systemTransport(), { fromName: "Talo", fromEmail: systemFrom(), to, subject, html });
  } catch (e) {
    console.error("Notifica preventivo non inviata:", e.message);
  }
}

// Una firma è un'immagine PNG piccola in data URL: niente altro è accettato.
const validSignature = (s) => typeof s === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 400_000;

export default async function quotePublic(req, res) {
  const send = (status, body) => { res.status(status).json(body); };
  try {
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
    await rateLimit(`pub:${ip}`, 60, 60_000);

    const c = req.query?.c || new URL(req.url, "http://x").searchParams.get("c");
    if (req.method === "GET" && c) {
      send(200, await getClientArea(c));
      return;
    }

    if (req.method === "GET" && (req.query?.f || new URL(req.url, "http://x").searchParams.get("f"))) {
      send(200, await getSignable(req.query?.f || new URL(req.url, "http://x").searchParams.get("f")));
      return;
    }

    if (req.method === "GET") {
      const token = req.query?.t || new URL(req.url, "http://x").searchParams.get("t");
      const row = await loadByToken(token);
      const q = row.data;
      const profile = await loadProfile(row.tenant_id);
      const righe = (q.righe || []).map(({ costo_unitario, listino_id, ...r }) => r);
      let cliente = null;
      if (q.cliente_id) {
        const { data: c } = await admin().from("entity_records").select("data").eq("id", q.cliente_id).eq("tenant_id", row.tenant_id).maybeSingle();
        cliente = c?.data ? pick(c.data, ["nome", "nome_privato", "indirizzo", "cap", "citta", "provincia", "partita_iva", "codice_fiscale"]) : null;
      }
      send(200, { quote: { ...pick(q, PUBLIC_QUOTE_FIELDS), righe }, profile: pick(profile, PUBLIC_PROFILE_FIELDS), cliente });
      return;
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      await rateLimit(`pubpost:${ip}`, 10, 60_000);
      if (body.documento === true) { send(200, await postSignature(req, body, ip)); return; }
      const row = await loadByToken(body.token);
      const q = row.data;
      // "Visto" lo segnala la pagina dopo essersi aperta nel browser del cliente: le anteprime dei link
      // (WhatsApp, filtri antispam) fanno solo una GET e non lo fanno più scattare.
      if (body.visto === true) {
        if (["in_attesa", "inviato"].includes(q.stato) && !q.visto_il) await saveQuote(row, { stato: "visto", visto_il: new Date().toISOString() });
        send(200, { success: true });
        return;
      }
      if (["approvato", "rifiutato"].includes(q.stato)) throw new HttpError(409, "Hai già risposto a questo preventivo");
      const exp = q.data && q.validita_giorni ? new Date(new Date(q.data).getTime() + Number(q.validita_giorni) * 86_400_000) : null;
      if (exp && exp < new Date(new Date().toDateString())) throw new HttpError(410, "L'offerta è scaduta: contatta l'azienda per un aggiornamento");

      const esito = body.esito === "accetta" ? "accetta" : body.esito === "rifiuta" ? "rifiuta" : null;
      const nome = String(body.nome || "").trim().slice(0, 120);
      const commento = String(body.commento || "").trim().slice(0, 2000);
      if (!esito) throw new HttpError(400, "Risposta non valida");
      if (!nome) throw new HttpError(400, "Inserisci nome e cognome");
      if (esito === "accetta" && !validSignature(body.firma)) throw new HttpError(400, "Per accettare serve la firma");

      const now = new Date().toISOString();
      const risposta = { esito, nome, commento, data: now, ip: ip.slice(0, 64), user_agent: String(req.headers["user-agent"] || "").slice(0, 200) };
      const patch = esito === "accetta"
        ? { stato: "approvato", risposta_cliente: risposta, firma_cliente_url: body.firma, data_firma_cliente: now.slice(0, 10) }
        : { stato: "rifiutato", risposta_cliente: risposta };
      await saveQuote(row, patch);

      const profile = await loadProfile(row.tenant_id);
      const appUrl = process.env.APP_URL || "";
      const title = `${q.numero || ""}${q.oggetto ? ` – ${q.oggetto}` : ""}`;
      await notifyOwner(row, profile,
        esito === "accetta" ? `✅ Preventivo accettato: ${title}` : `Preventivo rifiutato: ${title}`,
        `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">
          <p><strong>${escapeHtml(nome)}</strong> ha ${esito === "accetta" ? "<strong>accettato e firmato</strong>" : "<strong>rifiutato</strong>"} il preventivo <strong>${escapeHtml(title)}</strong> (${escapeHtml(q.cliente_nome || "")}).</p>
          ${commento ? `<p style="background:#f1f5f9;padding:10px;border-radius:8px">“${escapeHtml(commento)}”</p>` : ""}
          ${appUrl ? `<p><a href="${appUrl}/preventivi/${row.id}" style="color:#1d4ed8">Apri il preventivo in Talo</a></p>` : ""}
        </div>`);
      send(200, { success: true, stato: patch.stato });
      return;
    }
    throw new HttpError(405, "Metodo non consentito");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(e);
    send(status, { error: publicMessage(e) });
  }
}

