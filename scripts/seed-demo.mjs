// Crea (la prima volta) l'utente dell'azienda demo e ne ripristina i dati.
//   node scripts/seed-demo.mjs
// Le credenziali generate finiscono solo in .env.local (DEMO_EMAIL, DEMO_PASSWORD, DEMO_USER_ID):
// vanno copiate anche nelle variabili d'ambiente di Vercel. Non vengono mai stampate.
import fs from "fs";
import crypto from "crypto";

const ENV_FILE = ".env.local";
const readEnv = () => Object.fromEntries(fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
let env = readEnv();
Object.assign(process.env, env);

const { admin } = await import("../api/_lib/server.js");
const { resetDemo } = await import("../api/_lib/demo.js");
const db = admin();

const email = env.DEMO_EMAIL || "demo@talo.app";
let userId = env.DEMO_USER_ID;

if (!userId) {
  const password = crypto.randomBytes(24).toString("base64url");
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Mario Demo", demo: true } });
  if (error) throw error;
  userId = data.user.id;
  fs.appendFileSync(ENV_FILE, `\n# Azienda demo (creata da scripts/seed-demo.mjs)\nDEMO_EMAIL=${email}\nDEMO_PASSWORD=${password}\nDEMO_USER_ID=${userId}\n`);
  console.log("Utente demo creato; credenziali salvate in .env.local");
}

const n = await resetDemo(userId, email);
console.log(`Azienda demo ripristinata: ${n} record`);
