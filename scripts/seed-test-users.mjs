// Crea (o ricrea) gli utenti di collaudo e salva le credenziali in
// .env.test.local (ignorato da git). Uso: node scripts/seed-test-users.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const users = [
  ["TITOLARE", "titolare@talo.test", "Mario Rossi (titolare)"],
  ["RESPONSABILE", "responsabile@talo.test", "Luca Bianchi (responsabile)"],
  ["OPERAIO", "operaio@talo.test", "Paolo Verdi (operaio)"],
  ["ALTRA_DITTA", "altraditta@talo.test", "Anna Neri (altra ditta)"],
];

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const lines = ["# Utenti di collaudo — generati da scripts/seed-test-users.mjs"];
for (const [key, email, name] of users) {
  const password = `Tt-${crypto.randomBytes(9).toString("base64url")}`;
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw error;
  } else {
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
  }
  lines.push(`TEST_${key}_EMAIL=${email}`, `TEST_${key}_PASSWORD=${password}`);
  console.log(`ok: ${email}`);
}
fs.writeFileSync(".env.test.local", lines.join("\n") + "\n");
