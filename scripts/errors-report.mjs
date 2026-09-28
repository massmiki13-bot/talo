// Ultimi errori registrati dall'app (browser e funzioni server), raggruppati per messaggio.
//   node scripts/errors-report.mjs            → ultime 24 ore
//   node scripts/errors-report.mjs 7          → ultimi 7 giorni
//   node scripts/errors-report.mjs 7 --full   → con stack e pagina
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const days = Number(process.argv[2]) || 1;
const full = process.argv.includes("--full");
const since = new Date(Date.now() - days * 86400000).toISOString();
const { data, error } = await db.from("app_errors").select("*").gte("at", since).order("at", { ascending: false }).limit(1000);
if (error) throw error;

const groups = new Map();
for (const e of data) {
  const k = `${e.source}|${e.message}`;
  const g = groups.get(k) || { ...e, count: 0, tenants: new Set(), first: e.at };
  g.count++; g.first = e.at; if (e.tenant_id) g.tenants.add(e.tenant_id);
  groups.set(k, g);
}

console.log(`${data.length} errori negli ultimi ${days} giorni, ${groups.size} diversi\n`);
for (const g of [...groups.values()].sort((a, b) => b.count - a.count)) {
  console.log(`[${g.source}] ×${g.count}  (${g.tenants.size} aziende)  ultimo ${new Date(g.at).toLocaleString("it-IT")}`);
  console.log(`  ${g.message}`);
  if (full) {
    if (g.url) console.log(`  pagina: ${g.url}`);
    if (g.stack) console.log(g.stack.split("\n").slice(0, 6).map((l) => `    ${l.trim()}`).join("\n"));
  }
  console.log();
}
