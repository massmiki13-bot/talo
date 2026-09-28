// Collaudo della cancellazione account: crea un'azienda usa e getta, con un record e un file privato,
// la elimina con /api/account-delete e verifica che non resti nulla.
//   APP_BASE=http://localhost:5330 node scripts/test-account-delete.mjs
import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const BASE = process.env.APP_BASE || "http://localhost:5330";
const adminDb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

const email = `cancella-${Date.now()}@talo.test`;
const password = crypto.randomBytes(18).toString("base64url");
let ok = 0, ko = 0;
const check = (name, cond) => { console.log(`  ${cond ? "✓" : "✗"} ${name}`); cond ? ok++ : ko++; };

const { data: created, error } = await adminDb.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
const uid = created.user.id;
await adminDb.from("entity_records").insert({ entity: "Contact", tenant_id: uid, created_by_id: uid, data: { nome: "Cliente prova" } });
await adminDb.storage.from("private").upload(`${uid}/prova.txt`, new Blob(["riservato"]), { contentType: "text/plain" });
const { data: session } = await anon.auth.signInWithPassword({ email, password });
const token = session.session.access_token;

const call = (confirm) => fetch(`${BASE}/api/account-delete`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ confirm }) });

check("senza la frase di conferma viene rifiutata", (await call("elimina")).status === 400);
const res = await call("ELIMINA DEFINITIVAMENTE");
check("cancellazione eseguita", res.status === 200);
const { count } = await adminDb.from("entity_records").select("id", { count: "exact", head: true }).eq("tenant_id", uid);
check("nessun record rimasto", count === 0);
const { data: left } = await adminDb.storage.from("private").list(uid);
check("nessun file rimasto", !left?.length);
const { data: u } = await adminDb.auth.admin.getUserById(uid);
check("utente eliminato", !u?.user);

if (ko) { await adminDb.auth.admin.deleteUser(uid).catch(() => {}); }
console.log(`\n${ok} superati, ${ko} falliti`);
process.exit(ko ? 1 : 0);
