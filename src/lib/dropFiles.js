// File trascinati o scelti, anche dentro cartelle (e sottocartelle). Ogni File riceve `relPath` (es. "Sicurezza/DVR/dvr.pdf").

const JUNK = /(^|\/)(\.ds_store|thumbs\.db|desktop\.ini|\._.*|~\$.*)$/i;

const readEntries = (reader) => new Promise((res, rej) => reader.readEntries(res, rej));
const entryFile = (entry) => new Promise((res, rej) => entry.file(res, rej));

async function walk(entry, prefix, out) {
  if (entry.isFile) {
    const f = await entryFile(entry).catch(() => null);
    if (f) { Object.defineProperty(f, "relPath", { value: prefix + f.name }); out.push(f); }
    return;
  }
  if (!entry.isDirectory) return;
  const reader = entry.createReader();
  // readEntries restituisce a blocchi (100 alla volta): si legge finché non torna vuoto
  for (;;) {
    const batch = await readEntries(reader).catch(() => []);
    if (!batch.length) break;
    for (const e of batch) await walk(e, `${prefix}${entry.name}/`, out);
  }
}

/** Da un evento drop: tutti i file, entrando nelle cartelle. */
export async function filesFromDrop(dataTransfer) {
  const items = [...(dataTransfer?.items || [])];
  const entries = items.map((it) => (it.kind === "file" && it.webkitGetAsEntry ? it.webkitGetAsEntry() : null));
  if (!entries.some(Boolean)) return clean([...(dataTransfer?.files || [])]);
  const out = [];
  for (const e of entries) if (e) await walk(e, "", out);
  return clean(out);
}

/** Da un <input type="file" webkitdirectory>: usa il percorso relativo fornito dal browser. */
export function filesFromInput(fileList) {
  return clean([...(fileList || [])].map((f) => {
    if (f.webkitRelativePath && !f.relPath) Object.defineProperty(f, "relPath", { value: f.webkitRelativePath });
    return f;
  }));
}

const clean = (files) => files.filter((f) => f && f.size > 0 && !JUNK.test(f.relPath || f.name));

/** Cartella di origine di un file (senza il nome del file), per dare un indizio all'IA. */
export const folderOf = (f) => String(f.relPath || "").split("/").slice(0, -1).join("/");
