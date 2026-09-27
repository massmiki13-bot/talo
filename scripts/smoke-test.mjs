// Collaudo end-to-end del backend (database, permessi, inviti, file, AI).
// Richiede il dev server su http://localhost:5330 e gli utenti di
// scripts/seed-test-users.mjs. Uso: node scripts/smoke-test.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const readEnv = (f) => Object.fromEntries(
  fs.readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const env = { ...readEnv(".env.local"), ...readEnv(".env.test.local") };
const BASE = process.env.APP_BASE || "http://localhost:5330";
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
async function expectError(promise, msg) {
  try { await promise; } catch { return; }
  throw new Error(msg);
}

async function login(key) {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: env[`TEST_${key}_EMAIL`], password: env[`TEST_${key}_PASSWORD`] });
  if (error) throw new Error(`login ${key}: ${error.message}`);
  const rpc = async (fn, params) => {
    const { data: d, error: e } = await c.rpc(fn, params);
    if (e) throw new Error(e.message);
    return d;
  };
  const e = (entity) => ({
    list: (filter = {}, sort = "-created_date", limit = null) => rpc("entity_list", { p_entity: entity, p_filter: filter, p_sort: sort, p_limit: limit, p_skip: 0 }),
    get: (id) => rpc("entity_get", { p_entity: entity, p_id: id }),
    create: (d) => rpc("entity_create", { p_entity: entity, p_data: d }),
    update: (id, d) => rpc("entity_update", { p_entity: entity, p_id: id, p_patch: d }),
    delete: (id) => rpc("entity_delete", { p_entity: entity, p_id: id }),
    deleteMany: (f) => rpc("entity_delete_many", { p_entity: entity, p_filter: f }),
  });
  const api = async (path, body) => {
    const res = await fetch(`${BASE}/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    return { ...j, status: res.status, body_status: j.status };
  };
  return { client: c, user: data.user, rpc, e, api };
}

// Pulizia: ripartiamo da zero per gli utenti di test.
async function reset(ids) {
  await admin.from("entity_records").delete().in("tenant_id", ids);
  const { data: files } = await admin.storage.from("uploads").list(ids[0]);
  if (files?.length) await admin.storage.from("uploads").remove(files.map((f) => `${ids[0]}/${f.name}`));
}

const T = await login("TITOLARE");
const R = await login("RESPONSABILE");
const O = await login("OPERAIO");
const X = await login("ALTRA_DITTA");
await reset([T.user.id, R.user.id, O.user.id, X.user.id]);

console.log("\nDatabase — titolare");
let cantiere, dip1, dip2, preventivo;
await check("crea profilo ditta", async () => {
  const p = await T.e("CompanyProfile").create({ ragione_sociale: "Edil Rossi Srl", partita_iva: "01234567890" });
  assert(p.id && p.created_by === env.TEST_TITOLARE_EMAIL, "profilo senza id/autore");
});
await check("crea cantiere, dipendenti, preventivo", async () => {
  cantiere = await T.e("Worksite").create({ nome: "Villa Bianchi", importo_totale: 85000, stato: "in_corso" });
  dip1 = await T.e("Employee").create({ nome: "Paolo", cognome: "Verdi", costo_orario: 22 });
  dip2 = await T.e("Employee").create({ nome: "Gino", cognome: "Neri", costo_orario: 20 });
  preventivo = await T.e("Quote").create({ numero: "PREV-2026-001", cliente_nome: "Bianchi", totale: 1200, righe: [{ descrizione: "Scavo", quantita: 2, prezzo: 600 }] });
  assert(cantiere.id && dip1.id && preventivo.righe.length === 1, "record incompleti");
});
await check("lista ordinata e con limite", async () => {
  await T.e("WorksiteTransaction").create({ worksite_id: cantiere.id, tipo: "uscita", importo: 300, data: "2026-09-01" });
  await T.e("WorksiteTransaction").create({ worksite_id: cantiere.id, tipo: "entrata", importo: 5000, data: "2026-09-10" });
  await T.e("WorksiteTransaction").create({ worksite_id: cantiere.id, tipo: "uscita", importo: 120, data: "2026-09-05" });
  const asc = await T.e("WorksiteTransaction").list({ worksite_id: cantiere.id }, "data");
  assert(asc.map((t) => t.data).join() === "2026-09-01,2026-09-05,2026-09-10", "ordinamento crescente errato");
  const top = await T.e("WorksiteTransaction").list({}, "-importo", 1);
  assert(top.length === 1 && top[0].importo === 5000, "ordinamento numerico/limite errato");
});
await check("filtri: uguaglianza, $or, $in, $gte, array annidati", async () => {
  const uscite = await T.e("WorksiteTransaction").list({ tipo: "uscita" });
  assert(uscite.length === 2, `uscite attese 2, trovate ${uscite.length}`);
  const or = await T.e("WorksiteTransaction").list({ $or: [{ importo: 300 }, { importo: 5000 }] });
  assert(or.length === 2, "$or errato");
  const inn = await T.e("WorksiteTransaction").list({ importo: { $in: [120, 300] } });
  assert(inn.length === 2, "$in errato");
  const gte = await T.e("WorksiteTransaction").list({ importo: { $gte: 300 } });
  assert(gte.length === 2, "$gte errato");
  await T.e("DailyAttendance").create({ data: "2026-09-15", presenze: [
    { dipendente_id: dip1.id, ore: 8, cantiere_id: cantiere.id, stato: "presente" },
    { dipendente_id: dip2.id, ore: 6, cantiere_id: cantiere.id, stato: "presente" },
  ] });
  const nested = await T.e("DailyAttendance").list({ "presenze.dipendente_id": dip1.id });
  assert(nested.length === 1, "filtro su array annidato errato");
  const none = await T.e("DailyAttendance").list({ "presenze.dipendente_id": "inesistente" });
  assert(none.length === 0, "filtro annidato dovrebbe essere vuoto");
});
await check("aggiorna (merge dei campi) ed elimina", async () => {
  const u = await T.e("Quote").update(preventivo.id, { stato: "approvato" });
  assert(u.stato === "approvato" && u.cliente_nome === "Bianchi" && u.righe.length === 1, "update ha perso campi");
  const tmp = await T.e("Contact").create({ nome: "Da cancellare" });
  await T.e("Contact").delete(tmp.id);
  await expectError(T.e("Contact").get(tmp.id), "record cancellato ancora leggibile");
});
await check("campi di sistema non modificabili", async () => {
  const c = await T.e("Contact").create({ nome: "Test", id: "00000000-0000-0000-0000-000000000000", created_by: "hacker@x.it" });
  assert(c.id !== "00000000-0000-0000-0000-000000000000" && c.created_by === env.TEST_TITOLARE_EMAIL, "campi di sistema sovrascritti");
});
await check("entità sconosciuta rifiutata", async () => {
  await expectError(T.e("pg_user").list(), "entità arbitraria accettata");
});
await check("accesso diretto alla tabella bloccato", async () => {
  const { data, error } = await T.client.from("entity_records").select("*").limit(1);
  assert(error || (data || []).length === 0, "la tabella è leggibile direttamente dal browser");
});

console.log("\nIsolamento tra aziende");
await check("un'altra ditta non vede né modifica i dati", async () => {
  const altri = await X.e("Worksite").list();
  assert(altri.length === 0, "l'altra ditta vede cantieri non suoi");
  await expectError(X.e("Worksite").get(cantiere.id), "get cross-azienda riuscito");
  await expectError(X.e("Worksite").update(cantiere.id, { nome: "hack" }), "update cross-azienda riuscito");
  await X.e("Worksite").delete(cantiere.id);
  const still = await T.e("Worksite").get(cantiere.id);
  assert(still.nome === "Villa Bianchi", "delete cross-azienda riuscito");
  const n = await X.e("WorksiteTransaction").deleteMany({});
  assert(n === 0, "deleteMany cross-azienda ha cancellato dati");
});

console.log("\nEmail: password SMTP protetta");
await check("password salvata a parte e mascherata", async () => {
  const acc = await T.e("EmailAccount").create({ email_address: "ufficio@edilrossi.it", provider: "smtp", smtp_host: "smtp.example.com", smtp_port: 587, smtp_password: "segreta-123", active: true });
  assert(acc.smtp_password === "********", "password non mascherata alla creazione");
  const again = await T.e("EmailAccount").get(acc.id);
  assert(again.smtp_password === "********", "password leggibile");
  const { data: raw } = await admin.from("entity_records").select("data").eq("id", acc.id).single();
  assert(!("smtp_password" in raw.data), "password salvata nel documento");
  const { data: sec } = await admin.from("email_secrets").select("smtp_password").eq("account_id", acc.id).single();
  assert(sec.smtp_password === "segreta-123", "password non salvata nella tabella protetta");
  await T.e("EmailAccount").update(acc.id, { smtp_password: "********", display_name: "Ufficio" });
  const { data: sec2 } = await admin.from("email_secrets").select("smtp_password").eq("account_id", acc.id).single();
  assert(sec2.smtp_password === "segreta-123", "la maschera ha sovrascritto la password");
});
await check("verifica casella con server inesistente → errore gestito", async () => {
  const [acc] = await T.e("EmailAccount").list({ email_address: "ufficio@edilrossi.it" });
  const r = await T.api("verify-email", { account_id: acc.id });
  assert(r.status === 200 && r.connected === false, `risposta inattesa ${JSON.stringify(r)}`);
});

console.log("\nInviti collaboratori");
async function invite(level, extra = {}) {
  const code = String(100000 + Math.floor(Math.random() * 900000));
  const inv = await T.e("CollaboratorInvite").create({ host_user_id: T.user.id, code, access_level: level, status: "pending", ...extra });
  return { inv, code };
}
let invR;
await check("info invito senza codice", async () => {
  invR = await invite("responsabile", { permissions: ["preventivi", "lavori"] });
  const info = await R.api("invite-info", { inviteId: invR.inv.id });
  assert(info.status === 200 && info.access_level === "responsabile" && !("code" in info), `info invito: ${JSON.stringify(info)}`);
  assert(info.company_name === "Edil Rossi Srl", "nome azienda mancante");
});
await check("codice errato rifiutato con tentativi rimanenti", async () => {
  const r = await R.api("confirm-invite", { inviteId: invR.inv.id, code: "000000" });
  assert(r.status === 400 && /Tentativi rimanenti: 4/.test(r.error), JSON.stringify(r));
});
await check("il responsabile accetta l'invito", async () => {
  const r = await R.api("confirm-invite", { inviteId: invR.inv.id, code: invR.code });
  assert(r.status === 200 && r.success, JSON.stringify(r));
  const access = await R.rpc("my_access");
  assert(access.access_level === "responsabile" && access.tenant_id === T.user.id, JSON.stringify(access));
});
await check("invito già usato non riutilizzabile", async () => {
  const r = await X.api("confirm-invite", { inviteId: invR.inv.id, code: invR.code });
  assert(r.status === 400, JSON.stringify(r));
});
await check("l'operaio accetta l'invito collegato al dipendente", async () => {
  const { inv, code } = await invite("operaio", { employee_id: dip1.id });
  const r = await O.api("confirm-invite", { inviteId: inv.id, code });
  assert(r.status === 200, JSON.stringify(r));
  const access = await O.rpc("my_access");
  assert(access.access_level === "operaio" && access.employee_id === dip1.id, JSON.stringify(access));
});

console.log("\nPermessi responsabile");
await check("vede e modifica i dati operativi del titolare", async () => {
  const c = await R.e("Worksite").list();
  assert(c.length === 1 && c[0].importo_totale === 85000, "il responsabile non vede i cantieri");
  const q = await R.e("Quote").create({ numero: "PREV-2026-002", cliente_nome: "Verdi" });
  assert(q.id, "il responsabile non crea preventivi");
  const tq = await T.e("Quote").list();
  assert(tq.length === 2, "il titolare non vede il preventivo del responsabile");
});
await check("non può modificare ditta, collaboratori, caselle email, inviti", async () => {
  const [prof] = await R.e("CompanyProfile").list();
  await expectError(R.e("CompanyProfile").update(prof.id, { ragione_sociale: "hack" }), "modifica profilo consentita");
  await expectError(R.e("Collaborator").create({ collaborator_user_id: R.user.id, access_level: "host" }), "creazione collaboratore consentita");
  await expectError(R.e("EmailAccount").create({ email_address: "x@x.it" }), "creazione casella consentita");
  const inv = await R.e("CollaboratorInvite").list();
  assert(inv.length === 0, "il responsabile legge i codici di invito");
});

console.log("\nPermessi operaio");
await check("vede solo il proprio dipendente e le proprie ore", async () => {
  const emps = await O.e("Employee").list();
  assert(emps.length === 1 && emps[0].id === dip1.id, `dipendenti visibili: ${emps.length}`);
  assert(!("costo_orario" in emps[0]), "l'operaio vede il proprio costo orario");
  const att = await O.e("DailyAttendance").list();
  const pres = att.flatMap((a) => a.presenze);
  assert(pres.length === 1 && pres[0].dipendente_id === dip1.id, "l'operaio vede le ore dei colleghi");
});
await check("nessun dato economico", async () => {
  const [w] = await O.e("Worksite").list();
  assert(w.nome === "Villa Bianchi" && !("importo_totale" in w), "l'operaio vede gli importi del cantiere");
  for (const ent of ["Quote", "WorksiteTransaction", "WorksitePayment", "Invoice", "Contact"]) {
    const rows = await O.e(ent).list();
    assert(rows.length === 0, `l'operaio vede ${ent}`);
  }
});
await check("sola lettura", async () => {
  await expectError(O.e("DailyAttendance").create({ data: "2026-09-16", presenze: [] }), "l'operaio può scrivere presenze");
  await expectError(O.e("Employee").update(dip1.id, { costo_orario: 99 }), "l'operaio modifica il dipendente");
});
await check("non invia email", async () => {
  const r = await O.api("system-email", { to: "a@b.it", subject: "x", body: "x" });
  assert(r.status === 403, JSON.stringify(r));
});

console.log("\nFile");
let fileUrl;
await check("caricamento nella cartella dell'azienda", async () => {
  const pdf = fs.readFileSync(new URL("./fixtures/preventivo-fornitore.pdf", import.meta.url));
  const path = `${T.user.id}/${crypto.randomUUID()}-preventivo-fornitore.pdf`;
  const { error } = await T.client.storage.from("uploads").upload(path, pdf, { contentType: "application/pdf" });
  if (error) throw new Error(error.message);
  fileUrl = T.client.storage.from("uploads").getPublicUrl(path).data.publicUrl;
  const res = await fetch(fileUrl);
  assert(res.ok, "file non raggiungibile");
});
await check("caricamento nella cartella di un'altra azienda bloccato", async () => {
  const { error } = await X.client.storage.from("uploads").upload(`${T.user.id}/intruso.txt`, Buffer.from("x"), { contentType: "text/plain" });
  assert(error, "upload in cartella altrui consentito");
});

console.log("\nAssistente AI");
await check("testo libero", async () => {
  const r = await T.api("llm", { prompt: "Scrivi una frase formale di saluto per un cliente edile, massimo 20 parole." });
  assert(r.status === 200 && typeof r.result === "string" && r.result.length > 10, JSON.stringify(r).slice(0, 300));
  console.log(`      modello: ${r.model}`);
});
await check("risposta strutturata (JSON schema)", async () => {
  const r = await T.api("llm", {
    prompt: "Estrai i dati: 'Fornitura di 12 sacchi di cemento a 8,50 euro l'uno, consegna il 3 ottobre 2026'",
    response_json_schema: { type: "object", properties: { descrizione: { type: "string" }, quantita: { type: "number" }, prezzo_unitario: { type: "number" }, data_consegna: { type: "string" } }, required: ["quantita", "prezzo_unitario"] },
  });
  assert(r.status === 200 && r.result?.quantita === 12 && Math.abs(r.result.prezzo_unitario - 8.5) < 0.01, JSON.stringify(r).slice(0, 300));
});
await check("lettura di un PDF caricato", async () => {
  const r = await T.api("llm", {
    prompt: "Leggi il preventivo allegato ed estrai fornitore e totale.",
    file_urls: [fileUrl],
    response_json_schema: { type: "object", properties: { fornitore: { type: "string" }, totale: { type: "number" } } },
  });
  assert(r.status === 200 && /ferramenta alpina/i.test(r.result?.fornitore || "") && Math.round(r.result?.totale) === 1830, JSON.stringify(r).slice(0, 300));
});
await check("URL esterni ignorati (niente SSRF)", async () => {
  const r = await T.api("llm", { prompt: "Rispondi solo: ok", file_urls: ["http://169.254.169.254/latest/meta-data"] });
  assert(r.status === 200, JSON.stringify(r).slice(0, 200));
});
await check("richiesta senza login rifiutata", async () => {
  const res = await fetch(`${BASE}/api/llm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert(res.status === 401, `stato ${res.status}`);
});

console.log(`\n${passed} superati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
