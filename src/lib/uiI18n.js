// Lingua dell'interfaccia (italiano, rumeno, albanese) per l'app del titolare.
// I testi restano scritti in italiano nei componenti: qui si sostituiscono a video con i dizionari
// generati da scripts/i18n-build.mjs. Dati inseriti dall'utente, campi di testo e documenti non vengono toccati.
import { savedLang, saveLang } from "@/lib/workerI18n";

const LOADERS = { ro: () => import("@/i18n/ro.json"), sq: () => import("@/i18n/sq.json") };
const ATTRS = ["placeholder", "title", "aria-label"];
// Dove non tradurre: campi modificabili, codice, anteprime di documenti e app operai (ha le sue traduzioni).
const SKIP_SELECTOR = "input, textarea, script, style, code, pre, [contenteditable=''], [contenteditable='true'], [data-no-translate], .notranslate";

let dict = null;
let lang = "it";
let observer = null;
const listeners = new Set();
const textState = new WeakMap(); // nodo di testo → { orig, tr }
const attrState = new WeakMap(); // elemento → { [attr]: { orig, tr } }

// Date scritte in italiano (es. "mercoledì 30 settembre", "12 ott", "lun"): nomi di mesi e giorni dalla lingua scelta.
let dateWords = null; // { mesi: Map, giorni: Map }
function buildDateWords(l) {
  const loc = l === "ro" ? "ro-RO" : "sq-AL";
  const names = (locale, opts, list) => list.map((d) => new Intl.DateTimeFormat(locale, opts).format(d).replace(/\.$/, ""));
  const months = Array.from({ length: 12 }, (_, i) => new Date(2026, i, 15));
  const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 5 + i)); // da lunedì
  const mesi = new Map(), giorni = new Map();
  for (const style of ["long", "short"]) {
    names("it-IT", { month: style }, months).forEach((n, i) => mesi.set(n.toLowerCase(), names(loc, { month: style }, months)[i]));
    names("it-IT", { weekday: style }, days).forEach((n, i) => giorni.set(n.toLowerCase(), names(loc, { weekday: style }, days)[i]));
  }
  return { mesi, giorni };
}
function translateDate(s) {
  if (!dateWords || s.length > 40 || !/^[\p{L}\d\s,.:·–-]+$/u.test(s)) return null;
  const words = s.match(/\p{L}+/gu) || [];
  if (!words.length) return null;
  const hasNum = /\d/.test(s);
  let ok = true;
  const out = s.replace(/\p{L}+/gu, (w) => {
    const k = w.toLowerCase();
    // "mar" è sia marzo sia martedì: con un numero accanto è il mese
    const t = (hasNum ? dateWords.mesi.get(k) ?? dateWords.giorni.get(k) : dateWords.giorni.get(k) ?? dateWords.mesi.get(k));
    if (!t) { ok = false; return w; }
    return w[0] === w[0].toUpperCase() ? t[0].toUpperCase() + t.slice(1) : t;
  });
  return ok && out !== s ? out : null;
}

const lookup = (s) => {
  if (!dict) return null;
  const key = s.replace(/\s+/g, " ").trim();
  if (!key) return null;
  const hit = dict[key];
  if (hit) return hit;
  const date = translateDate(key);
  if (date) return date;
  // frasi con numeri: "4 di 5 completati" → modello "{n} di {n} completati"
  if (/\d/.test(key)) {
    const nums = key.match(/\d+(?:[.,]\d+)*/g);
    const tpl = dict[key.replace(/\d+(?:[.,]\d+)*/g, "{n}")];
    if (tpl) { let i = 0; return tpl.replace(/\{n\}/g, () => nums[i++] ?? ""); }
  }
  // "Testo:" / "Testo…" → traduzione del testo senza la punteggiatura finale
  const m = key.match(/^(.*?)([:…·.]+)$/);
  if (m && dict[m[1]]) return dict[m[1]] + m[2];
  // pezzi di frase tra due valori: ". Hai " / " · in attesa (" → punteggiatura attorno + traduzione
  const p = key.match(/^([\s.,;:·–)-]*)(.*?)([\s,;:·–(-]*)$/);
  if (p && (p[1] || p[3]) && p[2] && dict[p[2]]) return p[1] + dict[p[2]] + p[3];
  return null;
};

const skipped = (el) => !el || !!el.closest?.(SKIP_SELECTOR);

function translateText(node) {
  const v = node.nodeValue;
  const st = textState.get(node);
  if (st && v === st.tr) return; // è la nostra traduzione
  const orig = v;
  if (lang === "it" || skipped(node.parentElement)) { if (st) textState.delete(node); return; }
  const tr = lookup(orig);
  if (!tr) { if (st) textState.delete(node); return; }
  const out = orig.replace(orig.trim(), tr); // conserva gli spazi attorno
  textState.set(node, { orig, tr: out });
  node.nodeValue = out;
}

function translateAttrs(el) {
  if (skipped(el.parentElement) && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
  let st = attrState.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v == null) continue;
    if (st?.[a] && v === st[a].tr) continue;
    const tr = lang === "it" ? null : lookup(v);
    if (!tr) { if (st?.[a]) delete st[a]; continue; }
    st ||= {};
    st[a] = { orig: v, tr };
    attrState.set(el, st);
    el.setAttribute(a, tr);
  }
}

function walk(root) {
  if (root.nodeType === 3) return translateText(root);
  if (root.nodeType !== 1) return;
  if (root.matches?.("[data-no-translate]")) return;
  translateAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (/** @type {any} */ n) => (n.nodeType === 1 && n.hasAttribute("data-no-translate") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) (n.nodeType === 3 ? translateText(n) : translateAttrs(n));
}

/** Rimette i testi originali in italiano. */
function restore(root) {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = /** @type {any} */ (tw.currentNode); n; n = tw.nextNode()) {
    if (n.nodeType === 3) { const st = textState.get(n); if (st && n.nodeValue === st.tr) n.nodeValue = st.orig; textState.delete(n); }
    else { const st = attrState.get(n); if (st) { for (const [a, { orig, tr }] of Object.entries(st)) if (n.getAttribute(a) === tr) n.setAttribute(a, orig); attrState.delete(n); } }
  }
}

function start() {
  if (observer) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") translateText(m.target);
      else if (m.type === "attributes") translateAttrs(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(document.body);
}

export const uiLang = () => lang;
export const onUiLang = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Imposta la lingua dell'interfaccia (it | ro | sq) e la ricorda su questo dispositivo. */
export async function setUiLang(next, { remember = true } = {}) {
  if (!["it", "ro", "sq"].includes(next)) next = "it";
  if (remember) saveLang(next);
  if (next === "it") {
    lang = "it"; dict = null; dateWords = null;
    observer?.disconnect(); observer = null;
    restore(document.body);
  } else {
    dict = (await LOADERS[next]()).default;
    dateWords = buildDateWords(next);
    if (lang !== "it") restore(document.body);
    lang = next;
    start();
    walk(document.body);
  }
  document.documentElement.lang = next;
  listeners.forEach((fn) => fn(next));
}

/** All'avvio: lingua salvata su questo dispositivo. */
export function initUiLang() {
  const l = savedLang();
  if (l && l !== "it") setUiLang(l, { remember: false }).catch(() => {});
}
