// Traduzioni dell'interfaccia (rumeno, albanese): estrae i testi italiani dai componenti e traduce solo quelli nuovi con Gemini.
// Uso: node scripts/i18n-build.mjs            → aggiorna src/i18n/ro.json e src/i18n/sq.json
//      node scripts/i18n-build.mjs --dry      → mostra solo quanti testi ci sono da tradurre
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(SRC, "i18n");
// Esclusi: app operai (ha già le sue traduzioni), testi legali (valgono in italiano), generatori di documenti.
const SKIP = [/components[\\/]worker/, /i18n/i, /workerFields/, /templates/i, /documentAi|documentsAi|Ai\.js$/,/lib[\\/]legal/, /pages[\\/]Legal/, /Pdf\.js$/, /pdf/i, /xml/i, /\.test\./];
const LANGS = { ro: "rumeno", sq: "albanese" };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(e.name) && !SKIP.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

const hasWord = (s) => /[A-Za-zÀ-ÿ]{2,}/.test(s);
const looksLikeCode = (s) =>
  /^[a-z0-9_.:/#%()[\]\-!&>=<*+ ]+$/.test(s) && (/[-:[\]/]/.test(s) || !/\s/.test(s)) // classi Tailwind, chiavi, percorsi
  || /^(https?:|mailto:|tel:|\/|@|\.|#)/.test(s) || /\$\{|=>|&&|\|\||==/.test(s) || /^[A-Z_0-9]+$/.test(s)
  || /^[\w.-]+\.(js|jsx|json|png|jpg|svg|pdf|xml|css)$/i.test(s) || /^(application|image|text|audio|video)\//.test(s);

/** Testi candidati: testo JSX tra tag e stringhe tra virgolette che sembrano frasi o etichette. */
export function extract(code) {
  const out = new Set();
  const add = (raw) => {
    const s = raw.replace(/\s+/g, " ").trim();
    if (s.length < 2 || s.length > 200 || !hasWord(s) || looksLikeCode(s)) return;
    if (/[{}<>=;\\]|\breturn\b|className|style|\bconst\b|\?\.|\|\|/.test(s)) return; // codice o HTML
    if (!/^[\p{L}\d(€+"«“…]/u.test(s)) return; // frammenti che iniziano con punteggiatura: pezzi di espressioni
    if (/^[A-Z][a-z]+[A-Z]\w*$/.test(s) || /^[a-z]+[A-Z]\w*$/.test(s)) return; // nomi di componenti o variabili
    if (/^[a-z_]+$/.test(s)) return; // chiavi interne
    if (/\b(Restituisci|Estrai|JSON|schema|Rispondi|Indica|Regole)\b/.test(s)) return; // istruzioni per l'IA
    out.add(s);
  };
  const noImports = code.replace(/^\s*(import|export \* from)[^\n]*$/gm, "").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  for (const m of noImports.matchAll(/>([^<>{}`]+)</g)) add(m[1]);
  // testo JSX con espressioni in mezzo: <p>Ciao, {nome}. Hai {n} avvisi</p> → "Ciao,", "Hai", "avvisi"
  for (const m of noImports.matchAll(/>((?:[^<>{}`]|\{[^{}<>]*\})+)</g)) if (m[1].includes("{")) for (const part of m[1].split(/\{[^{}]*\}/)) add(part.replace(/^[\s.,;:·–)-]+/, "").replace(/[\s,;:·–(-]+$/, ""));
  for (const m of noImports.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
    const s = m[1];
    if (/[A-ZÀ-Ý]/.test(s[0] || "") || / /.test(s)) add(s.replace(/\\"/g, '"'));
  }
  for (const m of noImports.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) if (/ /.test(m[1])) add(m[1]);
  // parti fisse dei template: `Ciao, ${nome}` → "Ciao,"
  for (const m of noImports.matchAll(/`([^`]*)`/g)) {
    if (m[1].length > 160 || /\n/.test(m[1])) continue; // prompt e modelli lunghi
    for (const part of m[1].split(/\$\{[^}]*\}/)) if (/^[A-ZÀ-Ý]/.test(part.trim()) && / /.test(part.trim())) add(part);
  }
  return out;
}

async function gemini(prompt, schema) {
  const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  const models = (env.GEMINI_MODELS || "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite").split(",");
  let last;
  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 } }),
    });
    if (r.ok) {
      const j = await r.json();
      return JSON.parse(j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}");
    }
    last = `${model}: ${r.status}`;
  }
  throw new Error(`Gemini non disponibile (${last})`);
}

async function translateBatch(texts, lang) {
  const r = await gemini(
    `Traduci in ${LANGS[lang]} i testi dell'interfaccia di Talo, un gestionale per imprese edili e impiantistiche italiane (preventivi, cantieri, fatture, dipendenti, sicurezza).
Regole: traduzione naturale e professionale per l'interfaccia di un'app; mantieni maiuscole iniziali, punteggiatura, spazi finali o iniziali significativi, simboli (€, %, →, ·, …) e numeri; lascia identici i segnaposto {n} (sono numeri inseriti dall'app), nello stesso numero;
non tradurre sigle e termini tecnici normativi italiani (IVA, P.IVA, SAL, POS, PSC, DURC, DDT, SdI, PEC, CIG, CUP, INPS, INAIL, CCNL), nomi propri e il nome "Talo".
Restituisci un elenco con la stessa lunghezza e lo stesso ordine: per ogni testo i (indice) e t (traduzione).
Testi: ${JSON.stringify(texts.map((s, i) => ({ i, s })))}`,
    { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, t: { type: "string" } }, required: ["i", "t"] } } }, required: ["items"] },
  );
  const out = {};
  for (const { i, t } of r.items || []) if (texts[i] && t && t.trim()) out[texts[i]] = t;
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === HERE) {
  const all = new Set();
  for (const f of walk(SRC)) for (const s of extract(fs.readFileSync(f, "utf8"))) all.add(s);
  // testi raccolti dalle schermate (frasi composte a runtime), uno per riga
  const extraFile = path.join(ROOT, "scripts", "i18n-extra.txt");
  if (fs.existsSync(extraFile)) for (const l of fs.readFileSync(extraFile, "utf8").split(/\r?\n/)) if (l.trim() && !l.startsWith("#")) all.add(l.replace(/\s+/g, " ").trim());
  const texts = [...all].sort();
  fs.mkdirSync(OUT, { recursive: true });
  for (const lang of Object.keys(LANGS)) {
    const file = path.join(OUT, `${lang}.json`);
    const dict = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    const todo = texts.filter((s) => !(s in dict));
    console.log(`${lang}: ${texts.length} testi, ${todo.length} da tradurre`);
    if (process.argv.includes("--dry")) { if (process.argv.includes("--list")) console.log(todo.slice(0, 400).join("\n")); continue; }
    for (let i = 0; i < todo.length; i += 120) {
      const batch = todo.slice(i, i + 120);
      try { Object.assign(dict, await translateBatch(batch, lang)); }
      catch (e) { console.log(`  lotto ${i}: ${e.message}`); }
      // salvataggio progressivo: se si interrompe, al prossimo giro riparte da dove era
      const sorted = Object.fromEntries(Object.keys(dict).filter((k) => all.has(k)).sort().map((k) => [k, dict[k]]));
      fs.writeFileSync(file, JSON.stringify(sorted, null, 0).replace(/","/g, '",\n"') + "\n");
      process.stdout.write(`  ${Math.min(i + 120, todo.length)}/${todo.length}\r`);
    }
    console.log();
  }
}
