// Collaudo posta: verifica casella, invio (con Cc e allegato), ricezione IMAP,
// ricerca, bozza, allegato ricevuto. Uso: node scripts/mail-test.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const read = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const env = { ...read(".env.local"), ...read(".env.test.local") };
const BASE = process.env.APP_BASE || "http://localhost:5330";
const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: s } = await c.auth.signInWithPassword({ email: env.TEST_TITOLARE_EMAIL, password: env.TEST_TITOLARE_PASSWORD });
const H = { "Content-Type": "application/json", Authorization: `Bearer ${s.session.access_token}` };
const call = async (p, b) => { const r = await fetch(`${BASE}/api/${p}`, { method: "POST", headers: H, body: JSON.stringify(b) }); const t = await r.text(); try { return { status: r.status, ...JSON.parse(t) }; } catch { return { status: r.status, raw: t.slice(0, 200) }; } };
const rpc = async (fn, p) => { const { data, error } = await c.rpc(fn, p); if (error) throw error; return data; };
let ok = 0, ko = 0;
const check = async (n, f) => { try { await f(); ok++; console.log("  ✓", n); } catch (e) { ko++; console.log("  ✗", n, "\n     ", e.message); } };
const assert = (x, m) => { if (!x) throw new Error(m); };

const [acc] = await rpc("entity_list", { p_entity: "EmailAccount", p_filter: { email_address: env.SMTP_USER }, p_sort: "-created_date", p_limit: 1, p_skip: 0 });
const tag = `T${Date.now().toString(36)}`;
let sentMsg;

await check("verifica casella: invio e ricezione", async () => {
  const r = await call("verify-email", { account_id: acc.id });
  assert(r.connected && r.imap?.ok, JSON.stringify(r));
});
await check("indirizzo non valido rifiutato", async () => {
  const r = await call("send-email", { account_id: acc.id, to: ["non-una-email"], subject: "x", body: "x" });
  assert(r.status === 400 && /non valido/.test(r.error), JSON.stringify(r));
});
await check("invio con Cc e allegato, salvato negli Inviati", async () => {
  const pdf = fs.readFileSync("scripts/fixtures/preventivo-fornitore.pdf");
  const path = `${s.user.id}/${crypto.randomUUID()}-preventivo.pdf`;
  const up = await c.storage.from("uploads").upload(path, pdf, { contentType: "application/pdf" });
  if (up.error) throw up.error;
  const url = c.storage.from("uploads").getPublicUrl(path).data.publicUrl;
  const r = await call("send-email", {
    account_id: acc.id, to: [env.SMTP_USER], cc: ["mass.miki13+talocc@gmail.com"],
    subject: `Prova Posta Talo ${tag}`, body: `<p>Messaggio di collaudo <strong>${tag}</strong>.</p>`, text: `Messaggio di collaudo ${tag}`,
    attachments: [{ url, name: "preventivo.pdf" }],
  });
  assert(r.status === 200 && r.message?.stato === "inviata", JSON.stringify(r).slice(0, 300));
  sentMsg = r.message;
  assert(sentMsg.cc?.[0] === "mass.miki13+talocc@gmail.com" && sentMsg.allegati.length === 1, "Cc/allegati non registrati");
});
await check("ricerca per testo trova l'inviato", async () => {
  const rows = await rpc("entity_list", { p_entity: "EmailMessage", p_filter: { search_text: { $regex: tag.toLowerCase() } }, p_sort: "-data", p_limit: 10, p_skip: 0 });
  assert(rows.some((m) => m.id === sentMsg.id), "non trovato");
});
let received;
await check("ricezione IMAP del messaggio inviato", async () => {
  for (let i = 0; i < 6 && !received; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await call("mail-sync", {});
    assert(r.status === 200, JSON.stringify(r));
    const errs = (r.results || []).filter((x) => x.error);
    assert(!errs.length, JSON.stringify(errs));
    const rows = await rpc("entity_list", { p_entity: "EmailMessage", p_filter: { direzione: "in", subject: `Prova Posta Talo ${tag}` }, p_sort: "-data", p_limit: 1, p_skip: 0 });
    received = rows[0];
  }
  assert(received, "messaggio non arrivato entro 30 secondi");
  assert(received.allegati?.length === 1 && received.from_email === env.SMTP_USER.toLowerCase(), JSON.stringify(received).slice(0, 300));
});
await check("seconda sincronizzazione non duplica", async () => {
  await call("mail-sync", {});
  const rows = await rpc("entity_list", { p_entity: "EmailMessage", p_filter: { direzione: "in", subject: `Prova Posta Talo ${tag}` }, p_sort: "-data", p_limit: 5, p_skip: 0 });
  assert(rows.length === 1, `trovati ${rows.length}`);
});
await check("scarico allegato ricevuto", async () => {
  const r = await fetch(`${BASE}/api/mail-attachment`, { method: "POST", headers: H, body: JSON.stringify({ message_id: received.id, index: received.allegati[0].index }) });
  const buf = Buffer.from(await r.arrayBuffer());
  assert(r.status === 200 && buf.slice(0, 4).toString() === "%PDF", `stato ${r.status}`);
});
await check("bozza salvata e cancellata all'invio", async () => {
  const d = await rpc("entity_create", { p_entity: "EmailMessage", p_data: { direzione: "out", stato: "bozza", to: [env.SMTP_USER], subject: `Bozza ${tag}`, html: "<p>bozza</p>" } });
  const r = await call("send-email", { account_id: acc.id, to: [env.SMTP_USER], subject: `Bozza ${tag}`, body: "<p>bozza</p>", draft_id: d.id });
  assert(r.status === 200, JSON.stringify(r).slice(0, 200));
  const left = await rpc("entity_list", { p_entity: "EmailMessage", p_filter: { stato: "bozza", subject: `Bozza ${tag}` }, p_sort: "-data", p_limit: 5, p_skip: 0 });
  assert(left.length === 0, "bozza rimasta");
});
await check("invio con credenziali errate registrato come errore", async () => {
  const bad = await rpc("entity_create", { p_entity: "EmailAccount", p_data: { email_address: `finta-${tag}@example.com`, provider: "smtp", smtp_host: "smtp.gmail.com", smtp_port: 587, smtp_password: "sbagliata", active: true } });
  const r = await call("send-email", { account_id: bad.id, to: [env.SMTP_USER], subject: `Errore ${tag}`, body: "x" });
  await rpc("entity_delete", { p_entity: "EmailAccount", p_id: bad.id });
  assert(r.status === 502 && /Credenziali/.test(r.error), JSON.stringify(r));
  const rows = await rpc("entity_list", { p_entity: "EmailMessage", p_filter: { stato: "errore", subject: `Errore ${tag}` }, p_sort: "-data", p_limit: 1, p_skip: 0 });
  assert(rows.length === 1 && /Credenziali/.test(rows[0].errore), "errore non registrato");
});
console.log(`\n${ok} superati, ${ko} falliti`);
process.exit(ko ? 1 : 0);
