// Traduce i testi dell'app operai (src/lib/workerI18n.js + workerI18nExtra.js) nelle lingue aggiunte
// e scrive src/lib/workerI18nMore.js. Traduce solo le chiavi mancanti.  Uso: node scripts/worker-i18n-build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = { de: "tedesco", bs: "bosniaco (alfabeto latino)" };
const OUT = path.join(ROOT, "src/lib/workerI18nMore.js");

// Legge i dizionari senza passare dagli import del modulo (che usano i percorsi di Vite).
const strip = (src) => src.replace(/^import .*$/gm, "").replace(/^export (const|function) /gm, "$1 ");
const extraSrc = strip(fs.readFileSync(path.join(ROOT, "src/lib/workerI18nExtra.js"), "utf8"));
const mainSrc = strip(fs.readFileSync(path.join(ROOT, "src/lib/workerI18n.js"), "utf8")).replace(/^for \(const l of Object\.keys\((EXTRA|MORE)\)\).*$/gm, "").replace(/^const KEY[\s\S]*$/m, "");
const { T, EXTRA } = new Function(`${extraSrc}\n${mainSrc}\nreturn { T, EXTRA };`)();
const it = { ...T.it, ...EXTRA.it };

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
async function gemini(prompt, schema) {
  for (const model of (env.GEMINI_MODELS || "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite").split(",")) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 } }),
    });
    if (r.ok) return JSON.parse((await r.json()).candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}");
  }
  throw new Error("Gemini non disponibile");
}

const prev = fs.existsSync(OUT) ? new Function(`${strip(fs.readFileSync(OUT, "utf8"))}\nreturn MORE;`)() : {};
const MORE = {};
for (const [lang, name] of Object.entries(LANGS)) {
  MORE[lang] = { ...(prev[lang] || {}) };
  const todo = Object.keys(it).filter((k) => !MORE[lang][k]);
  for (let i = 0; i < todo.length; i += 80) {
    const keys = todo.slice(i, i + 80);
    const r = await gemini(`Traduci in ${name} i testi dell'app per gli OPERAI di un'impresa edile (cantieri, timbrature, buste paga, sicurezza).
Linguaggio semplice e diretto, come parlerebbe un capocantiere; dai del tu. Mantieni simboli, punteggiatura e maiuscole. Non tradurre sigle (POS, DDT, DPI, INPS, IA).
Restituisci per ogni chiave la traduzione. Testi: ${JSON.stringify(Object.fromEntries(keys.map((k) => [k, it[k]])))}`,
      { type: "object", properties: { voci: { type: "array", items: { type: "object", properties: { k: { type: "string" }, t: { type: "string" } }, required: ["k", "t"] } } }, required: ["voci"] });
    for (const { k, t } of r.voci || []) if (keys.includes(k) && t) MORE[lang][k] = t;
    console.log(`${lang}: ${Math.min(i + 80, todo.length)}/${todo.length}`);
  }
}
fs.writeFileSync(OUT, `// Generato da scripts/worker-i18n-build.mjs: testi dell'app operai in tedesco e bosniaco.\nexport const MORE = ${JSON.stringify(MORE, null, 1)};\n`);
console.log("scritto", OUT);
