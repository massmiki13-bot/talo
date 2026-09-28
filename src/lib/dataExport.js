// Esportazione completa dei dati di un'azienda (portabilità, art. 20 GDPR): un archivio ZIP con
// tutti i record in JSON e CSV e tutti i documenti caricati (anche quelli privati).
import { zipSync, strToU8 } from "fflate";
import { db, api } from "@/lib/db";

export const ENTITIES = [
  "CompanyProfile", "Branch", "Collaborator", "Contact", "Quote", "QuoteFormat", "ReceivedQuote", "PriceItem", "Prezzario", "PrezzarioVoce",
  "Invoice", "Worksite", "WorksiteLog", "WorksitePayment", "WorksitePhoto", "WorksiteTransaction", "SafetyPlan", "Employee", "EmployeeDocument",
  "DailyAttendance", "CompanyDocument", "DocumentFolder", "GeneratedContract", "ContractTemplate", "Reminder", "EmailAccount", "EmailMessage",
  "EmailTemplate", "SavedTemplate",
];

const STORAGE = "/storage/v1/object/";
const fileUrlsIn = (value, out = new Set()) => {
  if (typeof value === "string") { if (value.includes(STORAGE)) out.add(value); }
  else if (Array.isArray(value)) value.forEach((v) => fileUrlsIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => fileUrlsIn(v, out));
  return out;
};

const csvCell = (v) => {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function toCsv(rows) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return "﻿" + [keys.join(";"), ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(";"))].join("\r\n");
}

async function listAll(entity) {
  const out = [];
  for (let skip = 0; ; skip += 5000) {
    const page = await db[entity].list("created_date", 5000, skip).catch(() => []);
    out.push(...page);
    if (page.length < 5000) break;
  }
  return out;
}

/** onProgress(testo) per mostrare l'avanzamento. Ritorna il Blob dello ZIP. */
export async function buildExport({ includeFiles = true, onProgress } = {}) {
  const zip = {};
  const summary = [];
  const urls = new Set();
  for (const e of ENTITIES) {
    onProgress?.(`Dati: ${e}`);
    const rows = await listAll(e);
    if (!rows.length) continue;
    zip[`dati/${e}.json`] = strToU8(JSON.stringify(rows, null, 2));
    zip[`excel/${e}.csv`] = strToU8(toCsv(rows));
    summary.push(`${e}: ${rows.length}`);
    if (includeFiles) fileUrlsIn(rows, urls);
  }
  let files = 0, missing = 0;
  if (includeFiles && urls.size) {
    const list = [...urls];
    const signed = await api.files.signedMany(list).catch(() => ({}));
    const used = new Set();
    for (let i = 0; i < list.length; i++) {
      onProgress?.(`Documenti: ${i + 1} di ${list.length}`);
      try {
        const res = await fetch(signed[list[i]] || list[i]);
        if (!res.ok) throw new Error(String(res.status));
        let name = decodeURIComponent(list[i].split("?")[0].split("/").pop()).replace(/^[0-9a-f-]{36}-/, "");
        while (used.has(name)) name = `1_${name}`;
        used.add(name);
        zip[`documenti/${name}`] = new Uint8Array(await res.arrayBuffer());
        files++;
      } catch { missing++; }
    }
  }
  zip["LEGGIMI.txt"] = strToU8([
    "Esportazione dei dati da Talo",
    `Data: ${new Date().toLocaleString("it-IT")}`,
    "",
    "dati/     tutti i record in formato JSON (completo, riutilizzabile)",
    "excel/    gli stessi dati in CSV (si aprono con Excel, separatore ;)",
    "documenti/ tutti i file caricati",
    "",
    ...summary,
    "",
    `Documenti inclusi: ${files}${missing ? ` (non recuperati: ${missing})` : ""}`,
  ].join("\r\n"));
  onProgress?.("Creo l'archivio…");
  return new Blob([zipSync(zip, { level: 6 })], { type: "application/zip" });
}
