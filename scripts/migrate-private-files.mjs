// Sposta i documenti sensibili già caricati dall'archivio pubblico ("uploads") a quello privato ("private"),
// aggiorna i record e cancella la copia pubblica. Idempotente: i file già privati vengono saltati.
//   node scripts/migrate-private-files.mjs            → solo simulazione
//   node scripts/migrate-private-files.mjs --apply    → esegue
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const URL_BASE = env.VITE_SUPABASE_URL;
const db = createClient(URL_BASE, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");

const PUBLIC_PREFIX = `${URL_BASE}/storage/v1/object/public/uploads/`;
const PRIVATE_PREFIX = `${URL_BASE}/storage/v1/object/authenticated/private/`;

// Entità e campi con file sensibili.
const TARGETS = {
  EmployeeDocument: ["file_url"],
  CompanyDocument: ["file_url", "versioni[].file_url"],
  GeneratedContract: ["file_firmato_url"],
  WorksiteTransaction: ["file_url"],
};

const toMove = new Map(); // path pubblico → path privato (stesso nome)
let recordsToUpdate = 0;

async function moveFile(path) {
  if (toMove.get(path) === "done") return true;
  const { data, error } = await db.storage.from("uploads").download(path);
  if (error || !data) { console.warn("  file mancante, salto:", path); return false; }
  const up = await db.storage.from("private").upload(path, data, { contentType: data.type || undefined, upsert: true });
  if (up.error) { console.warn("  caricamento non riuscito:", path, up.error.message); return false; }
  toMove.set(path, "done");
  return true;
}

const convert = async (url) => {
  if (typeof url !== "string" || !url.startsWith(PUBLIC_PREFIX)) return url;
  const path = decodeURIComponent(url.slice(PUBLIC_PREFIX.length));
  if (!APPLY) { toMove.set(path, "todo"); return PRIVATE_PREFIX + path; }
  return (await moveFile(path)) ? PRIVATE_PREFIX + path : url;
};

for (const [entity, fields] of Object.entries(TARGETS)) {
  let from = 0;
  for (;;) {
    const { data: rows, error } = await db.from("entity_records").select("id, data").eq("entity", entity).range(from, from + 499);
    if (error) throw error;
    if (!rows.length) break;
    for (const row of rows) {
      const next = { ...row.data };
      let changed = false;
      for (const f of fields) {
        if (f.endsWith("[].file_url")) {
          const key = f.split("[]")[0];
          if (!Array.isArray(next[key])) continue;
          const arr = [];
          for (const v of next[key]) { const u = await convert(v?.file_url); if (u !== v?.file_url) changed = true; arr.push({ ...v, file_url: u }); }
          next[key] = arr;
        } else {
          const u = await convert(next[f]);
          if (u !== next[f]) { next[f] = u; changed = true; }
        }
      }
      if (!changed) continue;
      recordsToUpdate++;
      if (APPLY) {
        const { error: e2 } = await db.from("entity_records").update({ data: next }).eq("id", row.id);
        if (e2) console.warn("  aggiornamento non riuscito:", entity, row.id, e2.message);
      }
    }
    if (rows.length < 500) break;
    from += 500;
  }
}

if (APPLY) {
  // Tolta la copia pubblica solo dopo aver aggiornato tutti i record.
  const done = [...toMove.entries()].filter(([, s]) => s === "done").map(([p]) => p);
  for (let i = 0; i < done.length; i += 100) {
    const { error } = await db.storage.from("uploads").remove(done.slice(i, i + 100));
    if (error) console.warn("  rimozione copie pubbliche non riuscita:", error.message);
  }
}
console.log(`${APPLY ? "Eseguito" : "Simulazione"}: ${toMove.size} file, ${recordsToUpdate} record.`);
