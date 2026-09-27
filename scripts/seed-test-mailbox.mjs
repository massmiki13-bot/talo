// Collega la casella di sistema (da .env.local) all'azienda di prova "titolare".
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const read = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const env = { ...read(".env.local"), ...read(".env.test.local") };
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const owner = users.users.find((u) => u.email === env.TEST_TITOLARE_EMAIL);
await admin.from("entity_records").delete().eq("entity", "EmailAccount").eq("tenant_id", owner.id).eq("data->>email_address", env.SMTP_USER);
const { data: row, error } = await admin.from("entity_records").insert({
  entity: "EmailAccount", tenant_id: owner.id, created_by_id: owner.id, created_by: owner.email,
  data: { email_address: env.SMTP_USER, display_name: "Edil Rossi Srl", provider: "smtp", smtp_host: env.SMTP_HOST, smtp_port: Number(env.SMTP_PORT), smtp_username: env.SMTP_USER, imap_host: "imap.gmail.com", imap_port: 993, ricezione_attiva: true, is_default: true, active: true, is_pec: false },
}).select("id").single();
if (error) throw error;
const s = await admin.from("email_secrets").insert({ account_id: row.id, smtp_password: env.SMTP_PASS });
if (s.error) throw s.error;
console.log("casella collegata:", row.id);
