// Qualificazioni dell'impresa per gli appalti pubblici: attestazione SOA e certificazione ISO 9001.
// Riferimenti: D.Lgs. 36/2023, art. 100 e Allegato II.12 (SOA); UNI EN ISO 9001 (sistema qualità).
// I calcoli sono stime di supporto: l'esito ufficiale lo dà l'organismo di attestazione (SOA) o l'ente di certificazione.
import { api } from "@/lib/db";

/** Categorie SOA: opere generali (OG) e specializzate (OS). */
export const SOA_CATEGORIES = [
  ["OG1", "Edifici civili e industriali"], ["OG2", "Restauro e manutenzione di beni immobili tutelati"], ["OG3", "Strade, autostrade, ponti, viadotti, ferrovie, metropolitane"],
  ["OG4", "Opere d'arte nel sottosuolo"], ["OG5", "Dighe"], ["OG6", "Acquedotti, gasdotti, oleodotti, opere di irrigazione ed evacuazione"],
  ["OG7", "Opere marittime e lavori di dragaggio"], ["OG8", "Opere fluviali, di difesa, sistemazione idraulica e bonifica"], ["OG9", "Impianti per la produzione di energia elettrica"],
  ["OG10", "Impianti di trasformazione e distribuzione dell'energia elettrica"], ["OG11", "Impianti tecnologici"], ["OG12", "Opere e impianti di bonifica e protezione ambientale"],
  ["OG13", "Opere di ingegneria naturalistica"],
  ["OS1", "Lavori in terra"], ["OS2-A", "Superfici decorate di beni culturali"], ["OS2-B", "Beni culturali mobili archivistici e librari"],
  ["OS3", "Impianti idrico-sanitari, cucine, lavanderie"], ["OS4", "Impianti elettromeccanici trasportatori"], ["OS5", "Impianti pneumatici e antintrusione"],
  ["OS6", "Finiture in materiali lignei, plastici, metallici e vetrosi"], ["OS7", "Finiture di natura edile e tecnica"], ["OS8", "Opere di impermeabilizzazione"],
  ["OS9", "Segnaletica luminosa e sicurezza del traffico"], ["OS10", "Segnaletica stradale non luminosa"], ["OS11", "Apparecchiature strutturali speciali"],
  ["OS12-A", "Barriere stradali di sicurezza"], ["OS12-B", "Barriere paramassi, fermaneve e simili"], ["OS13", "Strutture prefabbricate in cemento armato"],
  ["OS14", "Impianti di smaltimento e recupero rifiuti"], ["OS15", "Pulizia di acque marine, lacustri, fluviali"], ["OS16", "Impianti per centrali di produzione energia"],
  ["OS17", "Linee e impianti telefonici"], ["OS18-A", "Componenti strutturali in acciaio"], ["OS18-B", "Componenti per facciate continue"],
  ["OS19", "Reti di telecomunicazione e trasmissione dati"], ["OS20-A", "Rilevamenti topografici"], ["OS20-B", "Indagini geognostiche"],
  ["OS21", "Opere strutturali speciali"], ["OS22", "Impianti di potabilizzazione e depurazione"], ["OS23", "Demolizione di opere"],
  ["OS24", "Verde e arredo urbano"], ["OS25", "Scavi archeologici"], ["OS26", "Pavimentazioni e sovrastrutture speciali"],
  ["OS27", "Impianti per la trazione elettrica"], ["OS28", "Impianti termici e di condizionamento"], ["OS29", "Armamento ferroviario"],
  ["OS30", "Impianti interni elettrici, telefonici, radiotelefonici e televisivi"], ["OS31", "Impianti per la mobilità sospesa"], ["OS32", "Strutture in legno"],
  ["OS33", "Coperture speciali"], ["OS34", "Sistemi antirumore per infrastrutture di mobilità"], ["OS35", "Interventi a basso impatto ambientale"],
].map(([codice, nome]) => ({ codice, nome }));
export const categoryName = (c) => SOA_CATEGORIES.find((x) => x.codice === c)?.nome || "";

/** Classifiche SOA con l'importo massimo dei lavori (euro). La VIII non ha limite. */
export const CLASSIFICHE = [
  ["I", 258_000], ["II", 516_000], ["III", 1_033_000], ["III-bis", 1_500_000], ["IV", 2_582_000],
  ["IV-bis", 3_500_000], ["V", 5_165_000], ["VI", 10_329_000], ["VII", 15_494_000], ["VIII", Infinity],
].map(([codice, importo]) => ({ codice, importo }));
export const classLimit = (c) => CLASSIFICHE.find((x) => x.codice === c)?.importo ?? 0;
/** Soglia oltre la quale serve la SOA per i lavori pubblici (art. 100 c. 4 D.Lgs. 36/2023). */
export const SOGLIA_SOA = 150_000;
/** Dalla classifica III in su serve la certificazione del sistema qualità ISO 9001. */
export const needsIso = (classifica) => classLimit(classifica) >= classLimit("III");

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d || "");
const addMonths = (d, m) => { const x = new Date(`${d}T12:00:00`); x.setMonth(x.getMonth() + m); return iso(x); };
const addDaysIso = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return iso(x); };
export const daysTo = (d, today = new Date()) => (d ? Math.ceil((+new Date(`${d}T12:00:00`) - +new Date(`${iso(today)}T12:00:00`)) / 86_400_000) : null);

/**
 * Scadenze di un'attestazione SOA: verifica triennale (da chiedere 90 giorni prima) e scadenza
 * quinquennale (nuovo contratto con una SOA almeno 90 giorni prima).
 */
export function soaDeadlines(q) {
  if (!q?.data_rilascio && !q?.data_scadenza) return [];
  const scad = q.data_scadenza || addMonths(q.data_rilascio, 60);
  const verifica = q.data_verifica_triennale || (q.data_rilascio ? addMonths(q.data_rilascio, 36) : addMonths(scad, -24));
  const out = [];
  if (!q.verifica_triennale_fatta) out.push({ key: "verifica", data: addDaysIso(verifica, -90), titolo: "Chiedere la verifica triennale SOA", nota: `Entro 90 giorni dalla scadenza triennale del ${verifica}` });
  out.push({ key: "rinnovo", data: addDaysIso(scad, -90), titolo: "Firmare il contratto di rinnovo SOA", nota: `L'attestazione scade il ${scad}: il rinnovo va avviato almeno 90 giorni prima` });
  out.push({ key: "scadenza", data: scad, titolo: "Scadenza attestazione SOA", nota: "" });
  return out;
}

/** Scadenze ISO 9001: audit di sorveglianza annuale e scadenza triennale del certificato. */
export function isoDeadlines(q, today = new Date()) {
  if (!q?.data_rilascio && !q?.data_scadenza) return [];
  const scad = q.data_scadenza || addMonths(q.data_rilascio, 36);
  const out = [];
  let audit = q.data_prossimo_audit;
  if (!audit && q.data_rilascio) {
    audit = addMonths(q.data_rilascio, 12);
    while (audit < iso(today) && audit < scad) audit = addMonths(audit, 12);
  }
  if (audit && audit < scad) out.push({ key: "audit", data: audit, titolo: "Audit di sorveglianza ISO 9001", nota: "Prepara riesame della direzione, audit interno e registrazioni" });
  out.push({ key: "ricertificazione", data: addMonths(scad, -3), titolo: "Avviare la ricertificazione ISO 9001", nota: `Il certificato scade il ${scad}` });
  out.push({ key: "scadenza", data: scad, titolo: "Scadenza certificato ISO 9001", nota: "" });
  return out;
}

/** Stato di una scadenza per colore e testo. */
export function deadlineState(d, today = new Date()) {
  const g = daysTo(d, today);
  if (g === null) return { tone: "zinc", label: "" };
  if (g < 0) return { tone: "red", label: `scaduta da ${-g} gg` };
  if (g <= 90) return { tone: "amber", label: `tra ${g} gg` };
  return { tone: "green", label: `tra ${g} gg` };
}

/**
 * Posso partecipare a una gara? Con la SOA si partecipa fino alla propria classifica aumentata di un quinto.
 * Restituisce { ok, motivo, classifica }.
 */
export function canBid(soa, categoria, importo) {
  const imp = Number(importo) || 0;
  if (imp > 0 && imp <= SOGLIA_SOA) return { ok: true, motivo: `Sotto i ${SOGLIA_SOA.toLocaleString("it-IT")} € la SOA non è obbligatoria: bastano i requisiti semplificati (lavori analoghi, costo del personale, attrezzatura).` };
  const cat = (soa?.categorie || []).find((c) => c.codice === categoria);
  if (!cat) return { ok: false, motivo: `L'attestazione non contiene la categoria ${categoria}. Si può valutare un raggruppamento (RTI) o l'avvalimento con un'impresa qualificata.` };
  const lim = classLimit(cat.classifica);
  if (lim === Infinity || imp <= +lim * 1.2) return { ok: true, classifica: cat.classifica, motivo: `Qualificata in ${categoria} classifica ${cat.classifica}${lim !== Infinity && imp > +lim ? " grazie all'aumento di un quinto" : ""}.` };
  return { ok: false, classifica: cat.classifica, motivo: `La classifica ${cat.classifica} copre fino a ${(+lim * 1.2).toLocaleString("it-IT")} € (con l'aumento di un quinto): l'importo è superiore.` };
}

/**
 * Requisito dei lavori eseguiti per categoria (stima): importo complessivo nella categoria nel periodo di
 * riferimento ≥ 90% della classifica, e in più un lavoro ≥ 40% oppure due ≥ 55% oppure tre ≥ 65% della classifica.
 * worksites: lavori con categoria_soa, importo (eseguito) e data di fine.
 */
export function reachableClass(lavori) {
  const imps = lavori.map((l) => Number(l.importo) || 0).filter((x) => x > 0).sort((a, b) => b - a);
  const tot = imps.reduce((s, x) => s + x, 0);
  let best = null;
  for (const c of CLASSIFICHE) {
    if (c.importo === Infinity) break;
    const L = c.importo;
    const top = (k) => imps.slice(0, k).reduce((s, x) => s + x, 0);
    const ok = tot >= 0.9 * +L && (imps[0] >= 0.4 * +L || (imps.length >= 2 && top(2) >= 0.55 * +L) || (imps.length >= 3 && top(3) >= 0.65 * +L));
    if (ok) best = c; else break;
  }
  const next = CLASSIFICHE[best ? CLASSIFICHE.indexOf(best) + 1 : 0];
  return { totale: tot, classifica: best?.codice || null, prossima: next && next.importo !== Infinity ? { codice: next.codice, mancano: Math.max(0, 0.9 * +next.importo - tot) } : null };
}

/** Lavori finiti nel periodo (anni) raggruppati per categoria SOA, con la classifica raggiungibile. */
export function requirementsByCategory(worksites, anni = 10, today = new Date()) {
  const from = `${today.getFullYear() - anni}-${iso(today).slice(5)}`;
  const groups = {};
  for (const w of worksites) {
    if (!w.categoria_soa) continue;
    const fine = w.data_fine_effettiva || w.data_fine_prevista || "";
    if (w.stato !== "finito" || (fine && fine < from)) continue;
    (groups[w.categoria_soa] ||= []).push({ id: w.id, nome: w.nome, importo: Number(w.importo_eseguito ?? w.importo_totale) || 0, fine, pubblico: !!w.committente_pubblico, cel: w.cel_stato || "" });
  }
  return Object.entries(groups).map(([codice, lavori]) => ({ codice, nome: categoryName(codice), lavori, ...reachableClass(lavori) }))
    .sort((a, b) => b.totale - a.totale);
}

/** Lavori pubblici finiti senza Certificato di Esecuzione Lavori (CEL): servono alla SOA. */
export const missingCel = (worksites) => worksites.filter((w) => w.stato === "finito" && w.committente_pubblico && w.cel_stato !== "ricevuto");

/** Indicatori del sistema qualità calcolati dai dati che l'app ha già (nessun inserimento a mano). */
export function qualityRecords({ segnalazioni = [], employeeDocs = [], equipment = [], transactions = [], today = new Date() }) {
  const t = iso(today);
  const nc = segnalazioni.filter((s) => ["sicurezza", "guasto", "materiale", "infortunio"].includes(s.tipo));
  const corsi = employeeDocs.filter((d) => ["corso", "visita_medica"].includes(d.tipo) && d.data_scadenza);
  const fornitori = {};
  for (const x of transactions) {
    if (x.tipo !== "uscita" || !x.fornitore) continue;
    const f = (fornitori[x.fornitore] ||= { nome: x.fornitore, consegne: 0, problemi: 0, importo: 0 });
    f.importo += Number(x.importo) || 0;
    if (x.ddt) { f.consegne++; if (x.ddt.conforme === false) f.problemi++; }
  }
  const scadMezzi = equipment.flatMap((m) => Object.entries(m.scadenze || {}).filter(([, d]) => d).map(([k, d]) => ({ mezzo: m.nome, voce: k, data: d })));
  return {
    nonConformita: { totale: nc.length, aperte: nc.filter((s) => s.stato !== "chiusa").length, elenco: nc },
    formazione: { totale: corsi.length, scaduti: corsi.filter((d) => d.data_scadenza < t).length, elenco: corsi },
    attrezzature: { totale: scadMezzi.length, scadute: scadMezzi.filter((s) => s.data < t).length, elenco: scadMezzi },
    fornitori: Object.values(fornitori).map((f) => ({ ...f, esito: f.consegne && f.problemi / f.consegne > 0.2 ? "da monitorare" : "qualificato" })).sort((a, b) => b.importo - a.importo),
  };
}

const str = { type: "string" };

/** Legge un attestato SOA o un certificato ISO 9001 caricato (PDF o foto) e restituisce i dati. */
export async function readCertificate(fileUrl, tipo) {
  const isSoa = tipo === "soa";
  const r = await api.integrations.Core.InvokeLLM({
    prompt: isSoa
      ? `Questo è un attestato di qualificazione SOA di un'impresa di costruzioni italiana. Estrai: organismo (nome della SOA), numero dell'attestazione, data_rilascio (data di rilascio dell'attestazione in corso, AAAA-MM-GG), data_verifica_triennale (scadenza della validità triennale, se indicata), data_scadenza (scadenza quinquennale), direttore_tecnico, iso9001 (true se è riportato il possesso della certificazione di qualità), e TUTTE le categorie con la classifica (codici come OG1, OS30, OS18-A; classifiche I, II, III, III-bis, IV, IV-bis, V, VI, VII, VIII).`
      : `Questo è un certificato di sistema di gestione per la qualità UNI EN ISO 9001 di un'impresa. Estrai: organismo (ente di certificazione), numero del certificato, data_rilascio (emissione corrente o prima emissione, AAAA-MM-GG), data_scadenza, settore_ea (codice/i EA), scopo (campo di applicazione, testo breve), accreditamento (es. ACCREDIA).`,
    file_urls: [fileUrl],
    response_json_schema: {
      type: "object",
      properties: {
        organismo: str, numero: str, data_rilascio: str, data_verifica_triennale: str, data_scadenza: str, direttore_tecnico: str, iso9001: { type: "boolean" },
        settore_ea: str, scopo: str, accreditamento: str,
        categorie: { type: "array", items: { type: "object", properties: { codice: str, classifica: { type: "string", enum: CLASSIFICHE.map((c) => c.codice) } }, required: ["codice", "classifica"] } },
      },
      required: isSoa ? ["organismo", "data_rilascio", "categorie"] : ["organismo", "data_scadenza"],
    },
  });
  const d = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || "") ? x : "");
  const codes = new Set(SOA_CATEGORIES.map((c) => c.codice));
  return {
    tipo, file_url: fileUrl, organismo: r.organismo || "", numero: r.numero || "",
    data_rilascio: d(r.data_rilascio), data_verifica_triennale: d(r.data_verifica_triennale), data_scadenza: d(r.data_scadenza),
    ...(isSoa
      ? { direttore_tecnico: r.direttore_tecnico || "", iso9001: !!r.iso9001, categorie: (r.categorie || []).map((c) => ({ codice: String(c.codice || "").toUpperCase().replace(/\s+/g, ""), classifica: c.classifica })).filter((c) => codes.has(c.codice) && classLimit(c.classifica)) }
      : { settore_ea: r.settore_ea || "", scopo: r.scopo || "", accreditamento: r.accreditamento || "" }),
  };
}

/** Assegna con l'IA la categoria SOA ai lavori che non ce l'hanno (in un solo passaggio). */
export async function classifyWorksites(worksites) {
  const todo = worksites.filter((w) => !w.categoria_soa).slice(0, 80);
  if (!todo.length) return [];
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Assegna a ciascun lavoro edile la categoria SOA prevalente (D.Lgs. 36/2023). Categorie: ${SOA_CATEGORIES.map((c) => `${c.codice} ${c.nome}`).join("; ")}.
Indicazioni: ristrutturazioni e nuove costruzioni di edifici → OG1; impianti elettrici interni → OS30; idraulici → OS3; termici/climatizzazione → OS28; impianti tecnologici completi → OG11; strade → OG3; demolizioni → OS23; impermeabilizzazioni → OS8; finiture edili → OS7; strutture in legno → OS32.
Se il lavoro è per un ente pubblico (comune, provincia, regione, scuola, ASL, ministero, consorzio pubblico…), pubblico = true.
Lavori: ${JSON.stringify(todo.map((w) => ({ id: w.id, nome: w.nome, tipo: w.tipo_intervento, descrizione: (w.descrizione || "").slice(0, 200), cliente: w.cliente_nome })))}`,
    response_json_schema: { type: "object", properties: { lavori: { type: "array", items: { type: "object", properties: { id: str, categoria: { type: "string", enum: SOA_CATEGORIES.map((c) => c.codice) }, pubblico: { type: "boolean" } }, required: ["id", "categoria"] } } }, required: ["lavori"] },
  });
  return (r.lavori || []).filter((x) => todo.some((w) => w.id === x.id));
}

/** Documento del sistema qualità scritto dall'IA con i dati dell'impresa: restituisce sezioni { titolo, testo }. */
export async function writeQualityDocument(kind, ctx) {
  const what = {
    riesame: "il RIESAME DELLA DIREZIONE annuale (ISO 9001 §9.3): input (stato delle azioni precedenti, cambiamenti, soddisfazione clienti, obiettivi, prestazioni dei processi, non conformità e azioni correttive, risultati di monitoraggio, audit, prestazioni dei fornitori, adeguatezza delle risorse, rischi e opportunità) e output (decisioni, opportunità di miglioramento, esigenze di risorse) con obiettivi misurabili per l'anno prossimo",
    audit: "il PIANO DI AUDIT INTERNO annuale (ISO 9001 §9.2) con calendario per processo (commerciale, progettazione/preventivi, approvvigionamento, esecuzione in cantiere, gestione personale e formazione, attrezzature, documenti) e una CHECKLIST di domande concrete per ogni processo, riferite ai punti della norma",
    politica: "la POLITICA PER LA QUALITÀ (ISO 9001 §5.2), breve e firmabile dal titolare, con impegni concreti coerenti con l'attività dell'impresa",
    fornitori: "la VALUTAZIONE ANNUALE DEI FORNITORI (ISO 9001 §8.4) con criteri, esito per fornitore e azioni per quelli da monitorare",
  }[kind];
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Sei un consulente di sistemi qualità per imprese edili italiane. Scrivi ${what}.
Usa SOLO i dati reali dell'impresa qui sotto (non inventare numeri, nomi o eventi; dove un dato manca scrivi "[da completare]"). Italiano chiaro, professionale, pronto da firmare.
Dati: ${JSON.stringify(ctx).slice(0, 12000)}`,
    response_json_schema: { type: "object", properties: { sezioni: { type: "array", items: { type: "object", properties: { titolo: str, testo: str }, required: ["titolo", "testo"] } } }, required: ["sezioni"] },
  });
  return r.sezioni || [];
}

/** Legge un bando o una lettera d'invito: importo dei lavori e categorie (prevalente e scorporabili). */
export async function readTender(fileUrl) {
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Questo è un bando di gara, disciplinare o lettera d'invito per lavori pubblici in Italia. Estrai: oggetto (breve), stazione_appaltante, scadenza_offerte (AAAA-MM-GG), importo_totale (euro, importo complessivo dei lavori a base di gara inclusi oneri della sicurezza), e l'elenco delle categorie SOA richieste con codice (OG1, OS30…), importo in euro e se è la prevalente.`,
    file_urls: [fileUrl],
    response_json_schema: {
      type: "object",
      properties: {
        oggetto: str, stazione_appaltante: str, scadenza_offerte: str, importo_totale: { type: "number" },
        categorie: { type: "array", items: { type: "object", properties: { codice: str, importo: { type: "number" }, prevalente: { type: "boolean" } }, required: ["codice", "importo"] } },
      },
      required: ["importo_totale", "categorie"],
    },
  });
  return { ...r, categorie: (r.categorie || []).map((c) => ({ ...c, codice: String(c.codice || "").toUpperCase().replace(/\s+/g, "") })) };
}

/** Promemoria automatici per le scadenze di una qualificazione (sostituisce quelli ancora aperti). */
export async function syncReminders(db, q) {
  const list = q.tipo === "soa" ? soaDeadlines(q) : isoDeadlines(q);
  const old = await db.Reminder.filter({ riferimento_id: q.id, riferimento_tipo: "Qualificazione" }, "data", 50).catch(() => []);
  for (const r of old.filter((x) => !x.completato)) await db.Reminder.delete(r.id).catch(() => {});
  const today = iso(new Date());
  for (const d of list.filter((x) => x.data >= today)) {
    await db.Reminder.create({
      titolo: d.titolo, descrizione: d.nota, data: d.data, tipo: "scadenza_documento", priorita: "alta", completato: false, is_preavviso: true,
      riferimento_id: q.id, riferimento_tipo: "Qualificazione",
    }).catch(() => {});
  }
  return list;
}
