// PSC → POS: l'IA legge il Piano di Sicurezza e Coordinamento del cantiere e compila il POS dell'impresa.
import { api } from "@/lib/db";

const sArr = { type: "array", items: { type: "string" } };
const PSC_SCHEMA = {
  type: "object",
  properties: {
    cantiere: {
      type: "object",
      properties: {
        nome: { type: "string" }, indirizzo: { type: "string" }, committente: { type: "string" }, committente_indirizzo: { type: "string" },
        responsabile_lavori: { type: "string" }, direttore_lavori: { type: "string" }, csp: { type: "string" }, cse: { type: "string" },
        data_inizio: { type: "string" }, data_fine: { type: "string" }, descrizione_opera: { type: "string" }, titolo_edilizio: { type: "string" },
        orario: { type: "string" }, organizzazione: { type: "string" },
      },
    },
    imprese: { type: "array", items: { type: "object", properties: { nome: { type: "string" }, lavorazioni: { type: "string" } } } },
    lavorazioni: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" }, descrizione: { type: "string" }, fasi: sArr,
          rischi: { type: "array", items: { type: "object", properties: { rischio: { type: "string" }, p: { type: "number" }, d: { type: "number" } } } },
          misure: sArr, dpi: sArr, attrezzature: sArr,
        },
      },
    },
    macchine: sArr, opere_provvisionali: sArr, impianti: sArr,
    sostanze: { type: "array", items: { type: "object", properties: { nome: { type: "string" }, uso: { type: "string" } } } },
    rumore: { type: "object", properties: { esito: { type: "string" }, livello: { type: "string" }, misure: { type: "string" } } },
    dpi: sArr,
    emergenze: { type: "object", properties: { procedure: { type: "string" }, ospedale: { type: "string" }, punto_raccolta: { type: "string" }, estintori: { type: "string" } } },
    procedure_psc: { type: "string" }, misure_integrative: { type: "string" },
  },
};

/** Legge il PSC allegato (PDF o foto) e restituisce i dati da unire al POS con mergePsc. */
export async function extractFromPsc(fileUrl, { impresa, lavorazioniNote } = {}) {
  return api.integrations.Core.InvokeLLM({
    prompt: `Sei un tecnico della sicurezza (RSPP/CSE) esperto di cantieri edili italiani. Il documento allegato è il PSC (Piano di Sicurezza e Coordinamento, D.Lgs. 81/2008 Allegato XV) di un cantiere.
Estrai i dati necessari al POS dell'impresa esecutrice "${impresa || "impresa esecutrice"}".
- cantiere: nome, indirizzo, committente e suo indirizzo, responsabile dei lavori, direttore dei lavori, CSP, CSE (nome e recapiti), date di inizio e fine (AAAA-MM-GG), descrizione dell'opera, titolo edilizio, orario di lavoro, organizzazione del cantiere (recinzioni, accessi, viabilità, aree di stoccaggio, servizi, interferenze tra imprese).
- imprese: tutte le imprese e i subappaltatori indicati, con le lavorazioni affidate.
- lavorazioni: le fasi lavorative del cronoprogramma e delle schede del PSC (in particolare quelle di un'impresa edile), ciascuna con descrizione, fasi, rischi con probabilità P (1-4) e danno D (1-4), misure di prevenzione, DPI e attrezzature indicate dal PSC.${lavorazioniNote ? ` Lavorazioni già previste nel POS: ${lavorazioniNote}.` : ""}
- macchine, opere_provvisionali (ponteggi, trabattelli…), impianti di cantiere, sostanze pericolose, valutazione del rumore, DPI.
- emergenze: procedure, pronto soccorso o ospedale più vicino con indirizzo, punto di raccolta, presidi antincendio.
- procedure_psc: le prescrizioni del PSC da rispettare e le procedure complementari e di dettaglio richieste al POS.
- misure_integrative: eventuali misure integrative richieste dal CSE.
Riporta i contenuti del documento; non inventare nomi, date o indirizzi. Se un dato non c'è lascialo vuoto.`,
    file_urls: [fileUrl],
    response_json_schema: PSC_SCHEMA,
  });
}

const blank = (v) => v === undefined || v === null || String(v).trim() === "";
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const clamp = (v) => Math.min(4, Math.max(1, Math.round(Number(v) || 1)));
function union(a = [], b = []) {
  const seen = new Set(a.map(norm));
  const out = [...a];
  for (const x of b) if (x && !seen.has(norm(x))) { seen.add(norm(x)); out.push(x); }
  return out;
}

/**
 * Unisce i dati del PSC al POS senza toccare ciò che è già compilato: i campi vuoti si riempiono,
 * gli elenchi si completano, le lavorazioni già presenti ricevono rischi e misure solo se ne sono prive.
 * Restituisce { dati, count } con il numero di informazioni aggiunte.
 */
export function mergePsc(dati, psc) {
  let count = 0;
  const out = structuredClone(dati || {});
  const fill = (obj, src, keys) => { for (const k of keys) if (blank(obj[k]) && !blank(src?.[k])) { obj[k] = String(src[k]).trim(); count++; } };

  out.cantiere = out.cantiere || {};
  fill(out.cantiere, psc.cantiere, ["nome", "indirizzo", "committente", "committente_indirizzo", "responsabile_lavori", "direttore_lavori", "csp", "cse", "descrizione_opera", "titolo_edilizio", "organizzazione"]);
  // orario: il POS parte con un orario tipo, quello del PSC ha la precedenza se diverso da quello predefinito
  if (!blank(psc.cantiere?.orario) && (blank(out.cantiere.orario) || /^08:00–12:00 \/ 13:00–17:00/.test(out.cantiere.orario))) { out.cantiere.orario = psc.cantiere.orario.trim(); count++; }
  for (const k of ["data_inizio", "data_fine"]) if (blank(out.cantiere[k]) && /^\d{4}-\d{2}-\d{2}$/.test(psc.cantiere?.[k] || "")) { out.cantiere[k] = psc.cantiere[k]; count++; }
  out.cantiere.presenza_psc = true;

  const known = new Set((out.cantiere.subappaltatori || []).map((s) => norm(s.nome)));
  for (const s of psc.imprese || []) {
    if (!s.nome || norm(s.nome) === norm(out.impresa?.ragione_sociale) || known.has(norm(s.nome))) continue;
    (out.cantiere.subappaltatori ||= []).push({ nome: s.nome, lavorazioni: s.lavorazioni || "" });
    known.add(norm(s.nome)); count++;
  }

  out.lavorazioni = out.lavorazioni || [];
  for (const l of psc.lavorazioni || []) {
    if (!l.nome) continue;
    const r = {
      descrizione: l.descrizione || "", fasi: l.fasi || [], misure: l.misure || [], dpi: l.dpi || [], attrezzature: l.attrezzature || [],
      rischi: (l.rischi || []).filter((z) => z.rischio).map((z) => ({ rischio: z.rischio, p: clamp(z.p), d: clamp(z.d) })),
    };
    const ex = out.lavorazioni.find((x) => norm(x.nome) === norm(l.nome) || norm(x.nome).includes(norm(l.nome)) || norm(l.nome).includes(norm(x.nome)));
    if (ex) {
      if (!ex.rischi?.length && r.rischi.length) { Object.assign(ex, { ...r, descrizione: ex.descrizione || r.descrizione }); count++; }
    } else { out.lavorazioni.push({ nome: l.nome, ...r, da_psc: true }); count++; }
  }

  out.attrezzature = out.attrezzature || {};
  for (const [k, src] of [["macchine", psc.macchine], ["opere_provvisionali", psc.opere_provvisionali], ["impianti", psc.impianti]]) {
    const before = (out.attrezzature[k] || []).length;
    out.attrezzature[k] = union(out.attrezzature[k] || [], src || []);
    count += out.attrezzature[k].length - before;
  }
  const sKnown = new Set((out.sostanze || []).map((s) => norm(s.nome)));
  for (const s of psc.sostanze || []) {
    if (!s.nome || sKnown.has(norm(s.nome))) continue;
    (out.sostanze ||= []).push({ nome: s.nome, uso: s.uso || "", scheda: "Disponibile in cantiere" });
    sKnown.add(norm(s.nome)); count++;
  }
  out.rumore = out.rumore || {};
  fill(out.rumore, psc.rumore, ["livello", "misure"]);
  const dpiBefore = (out.dpi || []).length;
  out.dpi = union(out.dpi || [], psc.dpi || []);
  count += out.dpi.length - dpiBefore;
  out.emergenze = out.emergenze || {};
  fill(out.emergenze, psc.emergenze, ["ospedale", "punto_raccolta", "estintori"]);
  if (!blank(psc.emergenze?.procedure) && !String(out.emergenze.procedure || "").includes(psc.emergenze.procedure.slice(0, 40))) {
    out.emergenze.procedure = [out.emergenze.procedure, `Dal PSC: ${psc.emergenze.procedure.trim()}`].filter(Boolean).join("\n\n");
    count++;
  }
  fill(out, psc, ["procedure_psc", "misure_integrative"]);
  return { dati: out, count };
}
