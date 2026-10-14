// Pratiche SOA e ISO 9001: i dati che servono, da dove si prendono, compilazione dai documenti con l'IA.
// I campi già presenti nell'app (profilo ditta, dipendenti, mezzi, lavori) si compilano da soli;
// quelli nei documenti li legge l'IA; il resto si completa a mano con la guida.
import { api } from "@/lib/db";

/** Documenti utili e cosa contengono (per la lista "cosa caricare"). */
export const DOC_TYPES = {
  soa: [
    { k: "visura", label: "Visura camerale", why: "Dati societari, legale rappresentante, soci, oggetto sociale, REA" },
    { k: "bilancio", label: "Bilanci degli ultimi anni (o dichiarazioni dei redditi)", why: "Fatturato lavori, costo del personale, ammortamenti, patrimonio netto" },
    { k: "cel", label: "Certificati di esecuzione lavori (CEL)", why: "Lavori pubblici eseguiti: committente, categoria, importo, date" },
    { k: "contratto_lavori", label: "Contratti e fatture dei lavori privati", why: "Lavori privati eseguiti, importi e periodo" },
    { k: "durc", label: "DURC", why: "Regolarità contributiva e scadenza" },
    { k: "cv_dt", label: "CV del direttore tecnico", why: "Titolo di studio ed esperienza" },
    { k: "lul", label: "Libro unico / UNIEMENS / F24", why: "Organico medio e costo del personale" },
    { k: "beni", label: "Registro dei beni ammortizzabili o contratti di noleggio", why: "Attrezzatura tecnica" },
  ],
  iso: [
    { k: "visura", label: "Visura camerale", why: "Ragione sociale, sedi, attività" },
    { k: "organigramma", label: "Organigramma o mansionario", why: "Ruoli e responsabilità" },
    { k: "manuale", label: "Manuale qualità o procedure esistenti", why: "Processi, politica, obiettivi già definiti" },
    { k: "certificato_iso", label: "Certificato ISO precedente e rapporti di audit", why: "Ente, scopo, settore EA, rilievi da chiudere" },
    { k: "formazione", label: "Attestati di formazione", why: "Competenze del personale" },
    { k: "fornitori", label: "Elenco fornitori o subappaltatori", why: "Fornitori da qualificare" },
  ],
};

const t = (k, label, extra = {}) => ({ k, label, type: "text", ...extra });
const n = (k, label, extra = {}) => ({ k, label, type: "number", ...extra });
const d = (k, label, extra = {}) => ({ k, label, type: "date", ...extra });
const ta = (k, label, extra = {}) => ({ k, label, type: "textarea", ...extra });

/** Campi della pratica SOA, divisi per sezione. hint = dove trovarlo; ai = l'IA può proporlo dai dati dell'impresa. */
export const SOA_SECTIONS = [
  { titolo: "Dati dell'impresa", campi: [
    t("ragione_sociale", "Ragione sociale", { hint: "Visura camerale" }), t("forma_giuridica", "Forma giuridica", { hint: "Visura (es. S.r.l.)" }),
    t("partita_iva", "Partita IVA"), t("codice_fiscale", "Codice fiscale"), t("sede_legale", "Sede legale"),
    t("rea", "Numero REA", { hint: "Visura camerale" }), d("data_iscrizione_cciaa", "Data di iscrizione alla Camera di Commercio", { hint: "Visura camerale" }),
    ta("oggetto_sociale", "Oggetto sociale / attività", { hint: "Visura camerale" }), t("pec", "PEC"),
  ] },
  { titolo: "Persone", campi: [
    t("legale_rappresentante", "Legale rappresentante", { hint: "Visura camerale" }), t("cf_legale_rappresentante", "Codice fiscale del legale rappresentante"),
    ta("soci_amministratori", "Soci, amministratori e procuratori", { hint: "Visura camerale (sezione soci e cariche)" }),
    t("direttore_tecnico", "Direttore tecnico", { hint: "Persona che firma tecnicamente i lavori" }), t("titolo_studio_dt", "Titolo di studio del direttore tecnico", { hint: "CV del direttore tecnico (laurea, diploma di geometra…)" }),
    n("anni_esperienza_dt", "Anni di esperienza del direttore tecnico", { hint: "CV del direttore tecnico" }),
  ] },
  { titolo: "Regolarità", campi: [
    t("durc_esito", "DURC: esito", { hint: "DURC on line (regolare / non regolare)" }), d("durc_scadenza", "DURC: scadenza validità", { hint: "DURC on line" }),
    t("iso9001", "Certificazione ISO 9001 (ente e numero)", { hint: "Necessaria dalla classifica III" }),
    ta("categorie_richieste", "Categorie e classifiche che vuoi chiedere", { hint: "Es. OG1 III, OS30 II: la sezione «SOA e requisiti» ti dice quelle raggiungibili" }),
  ] },
  { titolo: "Organico e attrezzatura", campi: [
    n("organico_medio", "Organico medio annuo (dipendenti)", { hint: "Libro unico / UNIEMENS" }), n("operai", "Di cui operai"), n("tecnici", "Di cui tecnici e impiegati"),
    ta("attrezzature", "Attrezzatura tecnica principale (proprietà, leasing, noleggio)", { hint: "Registro beni ammortizzabili, contratti di noleggio" }),
  ] },
];

/** Dati economici per anno (requisiti: cifra d'affari lavori, costo del personale ≥15%, attrezzatura ≥2%). */
export const ANNO_FIELDS = [
  ["anno", "Anno"], ["fatturato_lavori", "Fatturato lavori €"], ["costo_personale", "Costo del personale €"],
  ["ammortamenti_noleggi", "Ammortamenti e noleggi attrezzatura €"], ["patrimonio_netto", "Patrimonio netto €"],
];
/** Lavori eseguiti da presentare alla SOA. */
export const LAVORO_FIELDS = [
  ["committente", "Committente"], ["oggetto", "Oggetto"], ["categoria", "Cat."], ["importo", "Importo €"], ["inizio", "Inizio"], ["fine", "Fine"], ["documento", "CEL / contratto"],
];

export const ISO_SECTIONS = [
  { titolo: "Contesto dell'organizzazione (§4)", campi: [
    t("ragione_sociale", "Ragione sociale"), ta("sedi", "Sedi e cantieri tipici", { hint: "Visura, elenco cantieri" }),
    ta("scopo", "Campo di applicazione del sistema", { hint: "Es. «Costruzione e ristrutturazione di edifici civili e industriali»", ai: true }),
    t("settore_ea", "Settore EA", { hint: "Edilizia = EA 28", ai: true }), n("addetti", "Numero di addetti"),
    ta("parti_interessate", "Parti interessate e loro esigenze", { hint: "Clienti, committenti pubblici, dipendenti, fornitori, enti…", ai: true }),
    ta("rischi_opportunita", "Rischi e opportunità", { hint: "Cosa può andare storto e cosa può migliorare", ai: true }),
    ta("esclusioni", "Requisiti non applicabili (es. progettazione §8.3)", { hint: "Se non progettate, si esclude il §8.3 motivandolo", ai: true }),
  ] },
  { titolo: "Leadership e organizzazione (§5)", campi: [
    t("direzione", "Direzione (titolare / amministratore)"), t("responsabile_qualita", "Responsabile del sistema qualità"),
    ta("ruoli", "Ruoli e responsabilità (organigramma)", { hint: "Organigramma o mansionario", ai: true }),
    ta("politica", "Politica per la qualità", { hint: "Puoi generarla dalla sezione ISO 9001", ai: true }),
  ] },
  { titolo: "Pianificazione e processi (§6 – §8)", campi: [
    ta("obiettivi", "Obiettivi per la qualità misurabili", { hint: "Es. ridurre le non conformità del 20%, chiudere i lavori nei tempi", ai: true }),
    ta("processi", "Processi principali e loro sequenza", { hint: "Offerta, contratto, approvvigionamento, esecuzione, collaudo…", ai: true }),
    ta("processi_esterni", "Processi affidati all'esterno (subappalti, noli, progettisti)", { ai: true }),
    ta("controllo_fornitori", "Come scegliete e controllate i fornitori", { ai: true }),
  ] },
  { titolo: "Risorse e controllo (§7, §9, §10)", campi: [
    ta("competenze", "Competenze e formazione del personale", { hint: "Attestati di formazione, dalla sezione Dipendenti" }),
    ta("strumenti", "Strumenti di misura e attrezzature da controllare", { hint: "Dalla sezione Mezzi e attrezzature" }),
    d("ultimo_audit_interno", "Data dell'ultimo audit interno"), d("ultimo_riesame", "Data dell'ultimo riesame della direzione"),
    ta("non_conformita", "Come gestite non conformità e azioni correttive", { ai: true }),
  ] },
];

export const allFields = (tipo) => (tipo === "soa" ? SOA_SECTIONS : ISO_SECTIONS).flatMap((s) => s.campi);

/** Avanzamento: campi compilati sul totale (gli elenchi contano come un campo ciascuno). */
export function progress(tipo, p = {}) {
  const fields = allFields(tipo);
  const filled = fields.filter((f) => String(p.campi?.[f.k]?.value ?? "").trim() !== "").length;
  const extra = tipo === "soa" ? [(p.anni || []).length > 0, (p.lavori || []).length > 0] : [];
  const tot = fields.length + extra.length;
  const done = filled + extra.filter(Boolean).length;
  return { done, tot, pct: Math.round((done / tot) * 100) };
}
export const missingFields = (tipo, p = {}) => allFields(tipo).filter((f) => String(p.campi?.[f.k]?.value ?? "").trim() === "");

/** Unisce valori nuovi senza sovrascrivere quelli già compilati (a meno di force). */
export function mergeFields(p, values, fonte, { force = false } = {}) {
  const campi = { ...(p.campi || {}) };
  let n = 0;
  for (const [k, v] of Object.entries(values || {})) {
    if (v === null || v === undefined || String(v).trim() === "") continue;
    if (!force && String(campi[k]?.value ?? "").trim() !== "") continue;
    campi[k] = { value: typeof v === "number" ? v : String(v).trim(), fonte };
    n++;
  }
  return { p: { ...p, campi }, n };
}

/** Aggiunge anni e lavori evitando doppioni (stesso anno; stesso committente+oggetto). */
export function mergeRows(p, anni = [], lavori = []) {
  const byYear = Object.fromEntries((p.anni || []).map((a) => [String(a.anno), a]));
  for (const a of anni) {
    if (!a?.anno) continue;
    const cur = byYear[String(a.anno)] || { anno: String(a.anno) };
    for (const [k] of ANNO_FIELDS) if (k !== "anno" && (cur[k] === undefined || cur[k] === "" || cur[k] === null) && a[k] != null && a[k] !== "") cur[k] = a[k];
    byYear[String(a.anno)] = cur;
  }
  const key = (l) => `${String(l.committente || "").toLowerCase().trim()}|${String(l.oggetto || "").toLowerCase().slice(0, 40)}`;
  const rows = [...(p.lavori || [])];
  for (const l of lavori) if (l && (l.oggetto || l.committente) && !rows.some((r) => key(r) === key(l))) rows.push(l);
  return { ...p, anni: Object.values(byYear).sort((a, b) => String(b.anno).localeCompare(String(a.anno))), lavori: rows };
}

/** Campi che l'app conosce già: profilo ditta, dipendenti, mezzi, lavori finiti, certificati caricati. */
export function fromApp(tipo, { profile = /** @type {any} */ ({}), employees = [], equipment = [], worksites = [], soa, iso } = /** @type {any} */ ({})) {
  const sede = [profile.indirizzo, [profile.cap, profile.citta].filter(Boolean).join(" "), profile.provincia && `(${profile.provincia})`].filter(Boolean).join(", ");
  const attivi = employees.filter((e) => !e.data_cessazione);
  const operai = attivi.filter((e) => /operai|murator|manoval|carpentier|elettric|idraul|autist|gruist/i.test(`${e.ruolo || ""} ${e.qualifica || ""} ${e.mansione || ""}`)).length;
  const mezzi = equipment.map((m) => `${m.nome}${m.tipo ? ` (${m.tipo})` : ""}${m.targa ? ` ${m.targa}` : ""}`).join("\n");
  const common = { ragione_sociale: profile.ragione_sociale, partita_iva: profile.partita_iva, codice_fiscale: profile.codice_fiscale, sede_legale: sede, pec: profile.pec };
  if (tipo === "soa") {
    return {
      values: {
        ...common, organico_medio: attivi.length || "", operai: operai || "", tecnici: attivi.length ? attivi.length - operai : "", attrezzature: mezzi,
        iso9001: iso ? [iso.organismo, iso.numero && `n. ${iso.numero}`, iso.data_scadenza && `scad. ${iso.data_scadenza}`].filter(Boolean).join(" – ") : "",
        direttore_tecnico: soa?.direttore_tecnico || "",
      },
      lavori: worksites.filter((w) => w.stato === "finito").map((w) => ({
        committente: w.cliente_nome || "", oggetto: w.nome, categoria: w.categoria_soa || "", importo: Number(w.importo_totale) || "",
        inizio: w.data_inizio || "", fine: w.data_fine_effettiva || "", documento: w.committente_pubblico ? (w.cel_stato === "ricevuto" ? "CEL" : "CEL da chiedere") : "contratto e fatture",
      })),
    };
  }
  return {
    values: {
      ragione_sociale: profile.ragione_sociale, sedi: sede, addetti: attivi.length || "",
      strumenti: mezzi, settore_ea: iso?.settore_ea || "", scopo: iso?.scopo || "",
      competenze: attivi.length ? `${attivi.length} addetti: formazione e visite mediche registrate nella sezione Dipendenti, con scadenze e attestati.` : "",
    },
  };
}

const str = { type: "string" };
const num = { type: "number" };

/** Legge un documento qualsiasi e restituisce i campi della pratica che contiene. */
export async function readPracticeDocument(fileUrl, tipo, fileName = "") {
  const fields = allFields(tipo);
  const isSoa = tipo === "soa";
  // Ogni campo ha la sua descrizione e va sempre restituito (vuoto se assente): il modello non salta i campi.
  const desc = (f) => `${f.label}${f.hint ? ` — di solito in: ${f.hint}` : ""}. Vuoto se il documento non lo riporta.`;
  const props = Object.fromEntries(fields.map((f) => [f.k, { type: "string", description: desc(f) }]));
  const anno = { anno: { type: "string", description: "Anno dell'esercizio, es. 2025" }, fatturato_lavori: { type: "number", description: "Ricavi delle vendite e prestazioni (voce A1), in euro" },
    costo_personale: { type: "number", description: "SOMMA di salari e stipendi + oneri sociali + TFR + altri costi del personale (voce B9 totale), in euro" },
    ammortamenti_noleggi: { type: "number", description: "SOMMA di ammortamento immobilizzazioni materiali (B10b) + costi per godimento beni di terzi/noli/leasing (B8), in euro" },
    patrimonio_netto: { type: "number", description: "Totale patrimonio netto, in euro" } };
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Documento caricato da un'impresa edile italiana per preparare la pratica ${isSoa ? "di attestazione SOA (D.Lgs. 36/2023, Allegato II.12)" : "di certificazione ISO 9001"}${fileName ? ` (file: ${fileName})` : ""}.
Leggi tutto il documento con attenzione, comprese le tabelle.
1) tipo_documento: uno tra ${(isSoa ? DOC_TYPES.soa : DOC_TYPES.iso).map((x) => `${x.k} (${x.label})`).join(", ")}, altro.
2) campi: per OGNI campo riporta il valore come scritto nel documento, oppure stringa vuota se non c'è. Non dedurre e non inventare. Date in formato AAAA-MM-GG. Numeri senza punti delle migliaia.
Attenzione a non confondere i campi: la forma giuridica (S.r.l., S.p.A., ditta individuale…) va solo in forma_giuridica; il titolo di studio del direttore tecnico (laurea, diploma di geometra) si trova solo in un CV.
In una visura camerale: il legale rappresentante è chi ha la carica di amministratore unico, presidente del CdA o titolare; codice fiscale e partita IVA dell'impresa sono spesso lo stesso numero.
${isSoa ? `3) anni: una riga per OGNI esercizio presente nei bilanci o nelle dichiarazioni (anche gli anni di confronto), con tutti i valori economici calcolati come indicato.
4) lavori: una riga per ogni lavoro eseguito citato (CEL, contratti, fatture) con committente, oggetto, categoria SOA (OG1, OS30… solo se scritta o evidente), importo, inizio e fine (AAAA-MM-GG), documento (es. "CEL n. …").` : ""}`,
    file_urls: [fileUrl],
    response_json_schema: {
      type: "object",
      properties: {
        tipo_documento: str,
        campi: { type: "object", properties: props, required: fields.map((f) => f.k) },
        ...(isSoa ? {
          anni: { type: "array", items: { type: "object", properties: anno, required: Object.keys(anno) } },
          lavori: { type: "array", items: { type: "object", properties: { committente: str, oggetto: str, categoria: str, importo: num, inizio: str, fine: str, documento: str }, required: ["committente", "oggetto", "importo"] } },
        } : {}),
      },
      required: ["tipo_documento", "campi", ...(isSoa ? ["anni", "lavori"] : [])],
    },
  });
  const byKey = Object.fromEntries(fields.map((f) => [f.k, f]));
  const campi = {};
  for (const [k, v] of Object.entries(r.campi || {})) {
    const f = byKey[k];
    const s = String(v ?? "").trim();
    if (!f || !s || /^(n\/?d|non (indicat|present|riportat)|-|—|null|undefined)/i.test(s)) continue;
    if (f.type === "number") { const x = Number(s.replace(/\./g, "").replace(",", ".")); if (x > 0) campi[k] = x; }
    else if (f.type === "date") { const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/) || s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) campi[k] = m[1].length === 4 ? s : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    else campi[k] = s;
  }
  const clean = (a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== 0 && v !== "" && v != null));
  return { tipo_documento: r.tipo_documento || "altro", campi, anni: (r.anni || []).filter((a) => /^\d{4}$/.test(String(a.anno).trim())).map(clean), lavori: (r.lavori || []).filter((l) => l.oggetto || l.committente).map(clean) };
}

/** Bozze dell'IA per i campi descrittivi ancora vuoti (solo quelli con ai: true), dai dati reali dell'impresa. */
export async function draftDescriptiveFields(tipo, p, ctx) {
  const todo = /** @type {any[]} */ (allFields(tipo)).filter((f) => f.ai && String(p.campi?.[f.k]?.value ?? "").trim() === "");
  if (!todo.length) return {};
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Sei un consulente ISO 9001 per imprese edili italiane. Scrivi una bozza concreta e breve per ciascuno di questi campi del sistema qualità, adatta a QUESTA impresa (usa i dati sotto, niente frasi generiche, niente numeri inventati; dove serve un dato che non hai scrivi "[da completare]"):
${todo.map((f) => `- ${f.k}: ${f.label}${f.hint ? ` (${f.hint})` : ""}`).join("\n")}
Dati dell'impresa e campi già compilati: ${JSON.stringify({ ...ctx, compilati: Object.fromEntries(Object.entries(p.campi || {}).map(([k, v]) => [k, v.value])) }).slice(0, 10000)}`,
    response_json_schema: { type: "object", properties: Object.fromEntries(todo.map((f) => [f.k, str])), required: todo.map((f) => f.k) },
  });
  return Object.fromEntries(todo.map((f) => [f.k, r[f.k]]).filter(([, v]) => v && String(v).trim()));
}

/** Documenti suggeriti ancora da caricare. */
export const missingDocs = (tipo, p = {}) => DOC_TYPES[tipo === "soa" ? "soa" : "iso"].filter((x) => !(p.documenti || []).some((doc) => doc.tipo_documento === x.k));

/**
 * Requisiti economici (stima): nei migliori 5 anni degli ultimi 10, costo del personale ≥ 15% del fatturato lavori
 * e attrezzatura (ammortamenti + noleggi) ≥ 2%. La cifra d'affari deve coprire la somma delle classifiche richieste.
 */
export function checkEconomics(anni = [], thisYear = new Date().getFullYear()) {
  const num = (v) => Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const rows = anni.filter((a) => Number(a.anno) >= thisYear - 10 && num(a.fatturato_lavori) > 0)
    .sort((a, b) => num(b.fatturato_lavori) - num(a.fatturato_lavori)).slice(0, 5);
  if (!rows.length) return null;
  const fatt = rows.reduce((s, a) => s + num(a.fatturato_lavori), 0);
  const pers = rows.reduce((s, a) => s + num(a.costo_personale), 0);
  const attr = rows.reduce((s, a) => s + num(a.ammortamenti_noleggi), 0);
  return {
    anni: rows.map((a) => a.anno), fatturato: fatt,
    personale: { valore: pers, pct: fatt ? (pers / fatt) * 100 : 0, ok: pers >= fatt * 0.15 },
    attrezzatura: { valore: attr, pct: fatt ? (attr / fatt) * 100 : 0, ok: attr >= fatt * 0.02 },
  };
}
