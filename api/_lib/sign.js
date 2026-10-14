// Firma da telefono di contratti e POS (firma elettronica semplice, art. 20 CAD).
// Il link contiene un token segreto (data.firma_token del record). Per ogni firma si registrano
// nome, data, IP, dispositivo e l'impronta SHA-256 del testo firmato.
import crypto from "crypto";
import { admin, HttpError, escapeHtml, updateRecordData, addPosSignature } from "./server.js";
import { systemTransport, systemFrom, sendMail } from "./mail.js";

const PROFILE_FIELDS = ["ragione_sociale", "partita_iva", "indirizzo", "citta", "cap", "provincia", "telefono", "email", "logo_url"];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

// Le stesse funzioni esistono nel browser (src/lib/signing.js): devono restare identiche.
export const contractHash = (d) => sha256(JSON.stringify([d.titolo || "", d.contenuto_finale || ""]));
export const posHash = (d) => sha256(JSON.stringify([d.titolo || "", Number(d.revisione) || 0, d.dati || {}]));

export const validSignature = (s) => typeof s === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 400_000;

export async function loadSignable(token) {
  if (!token || !/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new HttpError(404, "Link non valido");
  const { data, error } = await admin()
    .from("entity_records").select("*").in("entity", ["GeneratedContract", "SafetyPlan"]).eq("data->>firma_token", token).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Documento non trovato o link revocato");
  return data;
}

async function loadProfile(tenantId) {
  const { data } = await admin()
    .from("entity_records").select("data").eq("entity", "CompanyProfile").eq("tenant_id", tenantId)
    .order("created_date", { ascending: true }).limit(1).maybeSingle();
  return data?.data || {};
}

async function notifyOwner(row, subject, html) {
  try {
    const { data } = await admin().auth.admin.getUserById(row.created_by_id || row.tenant_id);
    if (data?.user?.email) await sendMail(systemTransport(), { fromName: "Talo", fromEmail: systemFrom(), to: data.user.email, subject, html });
  } catch (e) {
    console.error("Notifica firma non inviata:", e.message);
  }
}

/** Chi deve firmare la presa visione del POS: lavoratori, preposto, RLS, RSPP. */
export function posSigners(d) {
  const i = d.dati?.impresa || {};
  const list = (d.dati?.lavoratori || []).filter((l) => l.nome).map((l) => ({ id: `lav:${l.id || l.nome}`, nome: l.nome, ruolo: l.mansione || "Lavoratore" }));
  if (i.capocantiere) list.push({ id: "preposto", nome: i.capocantiere, ruolo: "Preposto / capocantiere" });
  if (i.rls) list.push({ id: "rls", nome: i.rls, ruolo: "RLS / RLST" });
  if (i.rspp) list.push({ id: "rspp", nome: i.rspp, ruolo: "RSPP" });
  return list;
}

const evidence = (req, ip) => ({ data: new Date().toISOString(), ip: ip.slice(0, 64), user_agent: String(req.headers["user-agent"] || "").slice(0, 200) });

export async function getSignable(token) {
  const row = await loadSignable(token);
  const d = row.data;
  const profile = pick(await loadProfile(row.tenant_id), PROFILE_FIELDS);
  if (row.entity === "GeneratedContract") {
    const f = d.firma_controparte;
    return {
      kind: "contratto", profile, titolo: d.titolo || "Contratto", contenuto: d.contenuto_finale || "", controparte_nome: d.controparte_nome || "",
      stato: d.stato || "bozza", hash: contractHash(d), firmato: f ? { nome: f.nome, data: f.data } : null,
    };
  }
  const dati = d.dati || {};
  const rev = Number(d.revisione) || 0;
  const signed = (d.firme_raccolte || []).filter((f) => f.revisione === rev);
  return {
    kind: "pos", profile, titolo: d.titolo || "POS", revisione: rev, data: d.data, hash: posHash(d),
    cantiere: pick(dati.cantiere, ["nome", "indirizzo", "committente", "data_inizio", "data_fine", "orario"]),
    impresa: pick(dati.impresa, ["ragione_sociale", "datore_lavoro", "rspp", "rls", "medico_competente", "capocantiere", "addetti_primo_soccorso", "addetti_antincendio"]),
    lavorazioni: (dati.lavorazioni || []).map((l) => ({ nome: l.nome, rischi: (l.rischi || []).map((r) => ({ rischio: r.rischio, r: (Number(r.p) || 1) * (Number(r.d) || 1) })), misure: l.misure || [], dpi: l.dpi || [] })),
    dpi: dati.dpi || [],
    emergenze: pick(dati.emergenze, ["procedure", "ospedale", "punto_raccolta", "estintori"]),
    firmatari: posSigners(d).map((s) => { const f = signed.find((x) => x.firmatario_id === s.id); return { ...s, firmato: f ? f.data : null }; }),
  };
}

export async function postSignature(req, body, ip) {
  const row = await loadSignable(body.token);
  const d = row.data;
  const nome = String(body.nome || "").trim().slice(0, 120);
  if (!nome) throw new HttpError(400, "Inserisci nome e cognome");
  if (!validSignature(body.firma)) throw new HttpError(400, "Firma nel riquadro");
  if (body.accetto !== true) throw new HttpError(400, "Conferma di aver letto il documento");

  if (row.entity === "GeneratedContract") {
    if (d.firma_controparte) throw new HttpError(409, "Il contratto è già stato firmato");
    if (["annullato", "concluso"].includes(d.stato)) throw new HttpError(409, "Il contratto non è più firmabile");
    const hash = contractHash(d);
    if (body.hash !== hash) throw new HttpError(409, "Il testo è stato aggiornato: ricarica la pagina e rileggilo prima di firmare");
    const firma_controparte = { nome, firma: body.firma, hash, ...evidence(req, ip) };
    await updateRecordData(row.id, { firma_controparte, stato: "firmato", firmato_il: firma_controparte.data.slice(0, 10) });
    const appUrl = process.env.APP_URL || "";
    await notifyOwner(row, `✍️ Contratto firmato: ${d.titolo || ""}`,
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a"><p><strong>${escapeHtml(nome)}</strong> ha firmato dal telefono il contratto <strong>${escapeHtml(d.titolo || "")}</strong>.</p>
      ${appUrl ? `<p><a href="${appUrl}/contratti?id=${row.id}" style="color:#b91c1c">Apri il contratto in Talo</a></p>` : ""}</div>`);
    return { success: true };
  }

  // POS: presa visione di un firmatario, una volta per revisione
  const rev = Number(d.revisione) || 0;
  const hash = posHash(d);
  if (body.hash !== hash) throw new HttpError(409, "Il POS è stato aggiornato: ricarica la pagina prima di firmare");
  const signer = posSigners(d).find((s) => s.id === body.firmatario_id);
  if (!signer) throw new HttpError(400, "Scegli il tuo nome dall'elenco");
  const prev = (d.firme_raccolte || []).filter((f) => !(f.firmatario_id === signer.id && f.revisione === rev));
  const firma = { firmatario_id: signer.id, nome_elenco: signer.nome, ruolo: signer.ruolo, nome, firma: body.firma, revisione: rev, hash, ...evidence(req, ip) };
  const saved = await addPosSignature(row.id, firma, [...prev, firma]);
  const firme_raccolte = saved?.firme_raccolte || [...prev, firma];
  const all = posSigners(d);
  if (all.every((s) => firme_raccolte.some((f) => f.firmatario_id === s.id && f.revisione === rev))) {
    const appUrl = process.env.APP_URL || "";
    await notifyOwner(row, `✅ POS firmato da tutti: ${d.titolo || ""}`,
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a"><p>Tutti i ${all.length} firmatari hanno preso visione del <strong>${escapeHtml(d.titolo || "POS")}</strong> (rev. ${rev}).</p>
      ${appUrl ? `<p><a href="${appUrl}/sicurezza?id=${row.id}" style="color:#b91c1c">Apri il POS in Talo</a></p>` : ""}</div>`);
  }
  return { success: true };
}
