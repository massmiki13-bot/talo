// Archivio documenti: tipi, albero delle cartelle, struttura consigliata.

export const DOC_TYPES = [
  { value: "fattura", label: "Fattura", group: "Amministrazione" },
  { value: "f24", label: "F24 / tributi", group: "Amministrazione" },
  { value: "estratto_conto", label: "Estratto conto / banca", group: "Amministrazione" },
  { value: "bilancio", label: "Bilancio / dichiarazione", group: "Amministrazione" },
  { value: "busta_paga", label: "Busta paga / LUL", group: "Personale" },
  { value: "contratto", label: "Contratto", group: "Contratti" },
  { value: "preventivo", label: "Preventivo / offerta", group: "Commerciale" },
  { value: "ordine", label: "Ordine / conferma d'ordine", group: "Commerciale" },
  { value: "ddt", label: "DDT / bolla", group: "Commerciale" },
  { value: "assicurazione", label: "Polizza assicurativa", group: "Assicurazioni" },
  { value: "durc", label: "DURC", group: "Regolarità" },
  { value: "visura", label: "Visura camerale", group: "Societari" },
  { value: "societario", label: "Atto societario / statuto", group: "Societari" },
  { value: "certificazione", label: "Certificazione (SOA, ISO, F-gas…)", group: "Qualità" },
  { value: "dvr", label: "DVR – Valutazione dei rischi", group: "Sicurezza" },
  { value: "pos", label: "POS", group: "Sicurezza" },
  { value: "psc", label: "PSC", group: "Sicurezza" },
  { value: "verbale", label: "Verbale / collaudo", group: "Cantieri" },
  { value: "permesso", label: "Titolo edilizio / permesso", group: "Cantieri" },
  { value: "dico", label: "Dichiarazione di conformità", group: "Cantieri" },
  { value: "planimetria", label: "Progetto / planimetria", group: "Cantieri" },
  { value: "mezzo", label: "Mezzo / attrezzatura (libretto, revisione)", group: "Mezzi" },
  { value: "scheda_tecnica", label: "Scheda tecnica / manuale", group: "Tecnico" },
  { value: "altro", label: "Altro", group: "Altro" },
];

export const typeLabel = (v) => DOC_TYPES.find((t) => t.value === v)?.label || (v ? v.charAt(0).toUpperCase() + v.slice(1) : "Documento");

export const FOLDER_COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#475569"];

// Struttura consigliata per un'impresa edile/impiantistica.
export const STANDARD_TREE = [
  { nome: "Amministrazione", colore: "#2563eb", figli: ["Fatture emesse", "Fatture fornitori", "Banca", "F24 e tributi", "Bilanci e dichiarazioni"] },
  { nome: "Societari", colore: "#475569", figli: ["Visure camerali", "Atti e statuto", "Deleghe e procure"] },
  { nome: "Regolarità e qualità", colore: "#059669", figli: ["DURC", "Certificazioni (SOA, ISO)", "Iscrizioni e albi"] },
  { nome: "Sicurezza", colore: "#dc2626", figli: ["DVR", "POS", "Nomine (RSPP, medico, preposti)", "Verbali e sopralluoghi"] },
  { nome: "Personale", colore: "#7c3aed", figli: ["Buste paga", "Contratti di lavoro", "Formazione", "Visite mediche"] },
  { nome: "Assicurazioni", colore: "#d97706", figli: ["Responsabilità civile RCT-RCO", "Polizze mezzi", "Fideiussioni"] },
  { nome: "Mezzi e attrezzature", colore: "#0891b2", figli: ["Libretti e revisioni", "Verifiche periodiche", "Manuali"] },
  { nome: "Clienti", colore: "#db2777", figli: ["Contratti clienti", "Preventivi firmati"] },
  { nome: "Fornitori", colore: "#0891b2", figli: ["Contratti e ordini", "DDT e bolle", "Listini e schede tecniche"] },
  { nome: "Cantieri", colore: "#059669", figli: [] },
];

// Il "/" separa i livelli nei percorsi: non può stare nel nome di una cartella.
export const cleanFolderName = (s) => String(s || "").replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);

// ─── Albero delle cartelle (DocumentFolder con parent_id) ───

export function buildTree(folders) {
  const byParent = new Map();
  for (const f of folders) {
    const p = f.parent_id || null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(f);
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0) || String(a.nome).localeCompare(String(b.nome), "it"));
  return byParent;
}

export function pathOf(folderId, folders) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = [];
  let cur = byId.get(folderId);
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = byId.get(cur.parent_id);
  }
  return out;
}

export const pathLabel = (folderId, folders) => pathOf(folderId, folders).map((f) => f.nome).join(" / ");

export function descendants(folderId, folders) {
  const byParent = buildTree(folders);
  const out = [];
  const stack = [...(byParent.get(folderId) || [])];
  while (stack.length) {
    const f = stack.pop();
    out.push(f);
    stack.push(...(byParent.get(f.id) || []));
  }
  return out;
}

// Confronto tollerante dei nomi di cartella: maiuscole, accenti, spazi e simboli non contano.
export const normName = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Trova (o crea) la cartella che corrisponde a "Personale/Formazione".
export async function ensurePath(path, folders, db) {
  const parts = String(path || "").replace(/\s*[>›»]\s*/g, "/").replace(/^\s*archivio\s*\//i, "")
    .split("/").map(cleanFolderName).filter(Boolean).slice(0, 4);
  let parent = null;
  let list = [...folders];
  for (const name of parts) {
    let f = list.find((x) => (x.parent_id || null) === parent && normName(x.nome) === normName(name));
    if (!f) {
      f = await db.DocumentFolder.create({ nome: name, parent_id: parent, ordine: list.filter((x) => (x.parent_id || null) === parent).length });
      list = [...list, f];
    }
    parent = f.id;
  }
  return { folderId: parent, folders: list };
}

// Cartella standard per ogni tipo di documento (quando l'IA non indica un percorso valido).
export const TYPE_FOLDER = {
  fattura: "Amministrazione/Fatture fornitori", f24: "Amministrazione/F24 e tributi", estratto_conto: "Amministrazione/Banca",
  bilancio: "Amministrazione/Bilanci e dichiarazioni", busta_paga: "Personale/Buste paga", contratto: "Clienti/Contratti clienti",
  preventivo: "Clienti/Preventivi firmati", ordine: "Fornitori/Contratti e ordini", ddt: "Fornitori/DDT e bolle",
  assicurazione: "Assicurazioni", durc: "Regolarità e qualità/DURC", visura: "Societari/Visure camerali", societario: "Societari/Atti e statuto",
  certificazione: "Regolarità e qualità/Certificazioni (SOA, ISO)", dvr: "Sicurezza/DVR", pos: "Sicurezza/POS", psc: "Sicurezza/POS",
  verbale: "Sicurezza/Verbali e sopralluoghi", permesso: "Cantieri", dico: "Cantieri", planimetria: "Cantieri",
  mezzo: "Mezzi e attrezzature/Libretti e revisioni", scheda_tecnica: "Fornitori/Listini e schede tecniche",
};

// Ultima risorsa se l'IA non risponde: tipo e cartella dedotti dal nome del file.
const NAME_RULES = [
  [/durc/, "durc"], [/visura/, "visura"], [/\bf ?24\b/, "f24"], [/busta|cedolin|\blul\b|paga/, "busta_paga"],
  [/fattur|\bft\b|invoice/, "fattura"], [/\bddt\b|bolla|documento di trasporto/, "ddt"], [/polizz|assicura|\brct\b|fideiuss/, "assicurazione"],
  [/\bdvr\b|valutazione (dei )?rischi/, "dvr"], [/\bpos\b|piano operativo/, "pos"], [/\bpsc\b/, "psc"], [/preventiv|offert/, "preventivo"],
  [/ordine|conferma d.?ordine/, "ordine"], [/contratt/, "contratto"], [/bilanci|dichiarazione dei redditi|\bunico\b/, "bilancio"],
  [/estratto conto|banca|bonifico/, "estratto_conto"], [/statuto|atto costitutivo|verbale assemblea/, "societario"],
  [/\bsoa\b|\biso ?9001\b|certificat/, "certificazione"], [/libretto|revisione|carta di circolazione/, "mezzo"],
  [/verbale|collaudo/, "verbale"], [/\bscia\b|\bcila\b|permesso di costruire|titolo edilizio/, "permesso"], [/conformit|\bdico\b/, "dico"],
  [/planimetr|progetto|tavola|\bdwg\b/, "planimetria"], [/scheda tecnica|manuale|datasheet/, "scheda_tecnica"],
];
export function guessFromName(fileName) {
  const n = normName(String(fileName || "").replace(/\.[^.]+$/, ""));
  if (/attestat|corso|formazion/.test(n)) return { tipo: "certificazione", cartella: "Personale/Formazione" };
  if (/idoneit|visita medica|sorveglianza sanitaria/.test(n)) return { tipo: "altro", cartella: "Personale/Visite mediche" };
  const hit = NAME_RULES.find(([re]) => /** @type {RegExp} */ (re).test(n));
  return hit ? { tipo: hit[1], cartella: TYPE_FOLDER[hit[1]] || "" } : null;
}

export const fileKind = (doc) => {
  const u = String(doc.file_url || "").toLowerCase().split("?")[0];
  if (/\.(png|jpe?g|webp|gif|heic)$/.test(u) || /^image\//.test(doc.mime || "")) return "image";
  if (/\.pdf$/.test(u) || doc.mime === "application/pdf") return "pdf";
  if (/\.(xlsx?|csv|ods)$/.test(u)) return "sheet";
  if (/\.(docx?|odt|rtf|txt)$/.test(u)) return "doc";
  return "file";
};

export const formatSize = (n) => (!n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const today0 = () => new Date(new Date().toDateString());
export function expiryState(date) {
  if (!date) return null;
  const d = Math.ceil((+new Date(date) - +today0()) / 86_400_000);
  if (d < 0) return { key: "scaduto", label: "Scaduto", days: d, className: "bg-red-100 text-red-700" };
  if (d <= 30) return { key: "in_scadenza", label: d === 0 ? "Scade oggi" : `Scade tra ${d} gg`, days: d, className: "bg-amber-100 text-amber-800" };
  return { key: "valido", label: `Valido fino al ${new Date(date).toLocaleDateString("it-IT")}`, days: d, className: "bg-emerald-50 text-emerald-800" };
}
