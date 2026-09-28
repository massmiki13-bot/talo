// Piano Operativo di Sicurezza (D.Lgs. 81/2008, art. 89 c.1 lett. h e Allegato XV punto 3.2).
import { api } from "@/lib/db";
import { CORSI, VISITA } from "@/lib/employees";

export const LAVORAZIONI = [
  "Allestimento del cantiere e recinzioni", "Montaggio e smontaggio ponteggi", "Demolizioni e rimozioni", "Scavi e movimento terra",
  "Fondazioni e opere in cemento armato", "Murature e tramezzature", "Intonaci e rasature", "Isolamento termico a cappotto",
  "Massetti e sottofondi", "Pavimenti e rivestimenti", "Opere in cartongesso", "Tinteggiature e verniciature",
  "Rifacimento coperture e lavori sul tetto", "Impermeabilizzazioni", "Lattonerie", "Posa serramenti",
  "Impianto elettrico", "Impianto idrico-sanitario", "Impianto termico e climatizzazione", "Impianto fotovoltaico",
  "Carico, trasporto e smaltimento macerie", "Smobilizzo del cantiere",
];

export const DPI = [
  "Casco di protezione (EN 397)", "Scarpe antinfortunistiche S3", "Guanti contro rischi meccanici (EN 388)", "Occhiali di protezione (EN 166)",
  "Otoprotettori (EN 352)", "Facciale filtrante FFP2/FFP3 (EN 149)", "Imbracatura anticaduta con cordino e assorbitore (EN 361/355)",
  "Indumenti ad alta visibilità (EN ISO 20471)", "Tuta da lavoro", "Guanti dielettrici (EN 60903)", "Ginocchiere",
];

export const SEZIONI = [
  { key: "impresa", n: 1, label: "Impresa e figure della sicurezza" },
  { key: "cantiere", n: 2, label: "Cantiere e committente" },
  { key: "lavoratori", n: 3, label: "Lavoratori e formazione" },
  { key: "lavorazioni", n: 4, label: "Lavorazioni e valutazione dei rischi" },
  { key: "attrezzature", n: 5, label: "Macchine, attrezzature e opere provvisionali" },
  { key: "sostanze", n: 6, label: "Sostanze pericolose e rumore" },
  { key: "dpi", n: 7, label: "DPI e misure integrative" },
  { key: "emergenze", n: 8, label: "Emergenze e primo soccorso" },
  { key: "firme", n: 9, label: "Dichiarazione e firme" },
];

const fullName = (e) => `${e?.nome || ""} ${e?.cognome || ""}`.trim();
const addr = (p) => [p?.indirizzo, [p?.cap, p?.citta].filter(Boolean).join(" "), p?.provincia && `(${p.provincia})`].filter(Boolean).join(", ");

/** Dati iniziali presi da Profilo ditta, lavoro e dipendenti. */
export function buildInitial({ profile, worksite, employees = [], empDocs = [], client }) {
  const s = profile?.sicurezza || {};
  const team = worksite?.squadra_ids?.length ? employees.filter((e) => worksite.squadra_ids.includes(e.id)) : employees.filter((e) => e.stato !== "cessato");
  return {
    impresa: {
      ragione_sociale: profile?.ragione_sociale || "", sede: addr(profile), partita_iva: profile?.partita_iva || "", telefono: profile?.telefono || "",
      email: profile?.email || "", pec: profile?.pec || "", posizione_inail: s.posizione_inail || "", posizione_inps: s.posizione_inps || "", cassa_edile: s.cassa_edile || "",
      datore_lavoro: s.datore_lavoro || "", rspp: s.rspp || "", medico_competente: s.medico_competente || "", rls: s.rls || "",
      addetti_primo_soccorso: s.addetti_primo_soccorso || [], addetti_antincendio: s.addetti_antincendio || [],
      direttore_tecnico: s.direttore_tecnico || "", capocantiere: s.capocantiere || "",
    },
    cantiere: {
      nome: worksite?.nome || "", indirizzo: worksite?.indirizzo || "", committente: worksite?.cliente_nome || client?.nome || "",
      committente_indirizzo: client ? addr(client) : "", responsabile_lavori: "", direttore_lavori: worksite?.direttore_lavori || "",
      csp: "", cse: worksite?.coordinatore_sicurezza || "", data_inizio: worksite?.data_inizio || "", data_fine: worksite?.data_fine_prevista || "",
      descrizione_opera: [worksite?.tipo_intervento, worksite?.nome].filter(Boolean).join(" – "), titolo_edilizio: worksite?.titolo_edilizio || "",
      orario: "08:00–12:00 / 13:00–17:00, dal lunedì al venerdì", turni: "Turno unico giornaliero", organizzazione: "",
      presenza_psc: true, subappaltatori: [],
    },
    lavoratori: team.map((e) => workerRow(e, empDocs)),
    lavorazioni: [],
    attrezzature: { macchine: [], opere_provvisionali: [], impianti: [] },
    sostanze: [],
    rumore: { esito: "Valutazione del rischio rumore effettuata ai sensi del Titolo VIII Capo II del D.Lgs. 81/2008.", livello: "", misure: "" },
    dpi: [],
    misure_integrative: "", procedure_psc: "",
    emergenze: {
      procedure: "In caso di emergenza il capocantiere interrompe le lavorazioni, allontana i lavoratori dalla zona di pericolo, chiama i soccorsi e attende il loro arrivo in un punto facilmente raggiungibile. Gli addetti al primo soccorso prestano le prime cure con la cassetta di pronto soccorso presente in cantiere.",
      ospedale: "", punto_raccolta: "", estintori: "Presente almeno un estintore portatile a polvere da 6 kg in prossimità delle aree di lavoro.",
    },
    formazione_note: "",
    firme: { luogo: profile?.citta || "", data: new Date().toISOString().slice(0, 10) },
  };
}

export function workerRow(e, empDocs = []) {
  const docs = empDocs.filter((d) => d.dipendente_id === e.id);
  const corsi = CORSI.map((c) => {
    const d = docs.filter((x) => x.corso_codice === c.codice).sort((a, b) => String(b.data_emissione).localeCompare(String(a.data_emissione)))[0];
    return d ? `${c.nome}${d.data_scadenza ? ` (scad. ${new Date(d.data_scadenza).toLocaleDateString("it-IT")})` : ""}` : null;
  }).filter(Boolean);
  const visita = docs.filter((x) => x.tipo === "visita_medica" || x.corso_codice === VISITA.codice).sort((a, b) => String(b.data_emissione).localeCompare(String(a.data_emissione)))[0];
  return {
    id: e.id, nome: fullName(e), qualifica: [e.qualifica || e.ruolo, e.livello].filter(Boolean).join(" – "), mansione: e.ruolo || e.qualifica || "",
    formazione: corsi.join("; "), idoneita: visita ? `Idoneo${visita.data_scadenza ? ` fino al ${new Date(visita.data_scadenza).toLocaleDateString("it-IT")}` : ""}` : "",
  };
}

// ─── Completezza ───

export function checkSections(d) {
  const miss = {};
  const need = (k, cond, msg) => { if (!cond) (miss[k] ||= []).push(msg); };
  need("impresa", d.impresa?.ragione_sociale, "ragione sociale");
  need("impresa", d.impresa?.datore_lavoro, "datore di lavoro");
  need("impresa", d.impresa?.rspp, "RSPP");
  need("impresa", d.impresa?.medico_competente, "medico competente");
  need("impresa", d.impresa?.rls, "RLS o RLST");
  need("impresa", d.impresa?.addetti_primo_soccorso?.length, "addetti al primo soccorso");
  need("impresa", d.impresa?.addetti_antincendio?.length, "addetti antincendio");
  need("cantiere", d.cantiere?.indirizzo, "indirizzo del cantiere");
  need("cantiere", d.cantiere?.committente, "committente");
  need("cantiere", d.cantiere?.data_inizio, "data di inizio");
  need("lavoratori", d.lavoratori?.length, "almeno un lavoratore");
  need("lavorazioni", d.lavorazioni?.length, "almeno una lavorazione");
  need("lavorazioni", (d.lavorazioni || []).every((l) => l.rischi?.length), "valutazione dei rischi di ogni lavorazione");
  need("dpi", d.dpi?.length, "elenco DPI");
  need("emergenze", d.emergenze?.ospedale, "pronto soccorso più vicino");
  return miss;
}

// ─── IA ───

export async function aiAssessLavorazione(nome, ctx) {
  return api.integrations.Core.InvokeLLM({
    prompt: `Sei un tecnico della sicurezza (RSPP) esperto di cantieri edili italiani. Redigi la scheda di valutazione dei rischi per il POS (D.Lgs. 81/2008, Allegato XV) della lavorazione: "${nome}".
Cantiere: ${ctx.cantiere || "—"}. Opera: ${ctx.opera || "—"}.${ctx.note ? ` Note: ${ctx.note}.` : ""}
Indica: breve descrizione operativa; fasi principali; attrezzature/macchine usate; rischi specifici con probabilità P (1-4) e danno D (1-4); misure di prevenzione e protezione concrete (riferimenti normativi quando utili); DPI necessari; eventuale sorveglianza/formazione specifica.
Linguaggio tecnico ma chiaro, niente frasi generiche.`,
    response_json_schema: {
      type: "object",
      properties: {
        descrizione: { type: "string" },
        fasi: { type: "array", items: { type: "string" } },
        attrezzature: { type: "array", items: { type: "string" } },
        rischi: { type: "array", items: { type: "object", properties: { rischio: { type: "string" }, p: { type: "number" }, d: { type: "number" } }, required: ["rischio", "p", "d"] } },
        misure: { type: "array", items: { type: "string" } },
        dpi: { type: "array", items: { type: "string" } },
        formazione: { type: "string" },
      },
      required: ["descrizione", "rischi", "misure", "dpi"],
    },
  });
}

export const riskLevel = (p, d) => {
  const r = (Number(p) || 1) * (Number(d) || 1);
  if (r >= 9) return { r, label: "Alto", className: "bg-red-100 text-red-800", rgb: [220, 38, 38] };
  if (r >= 5) return { r, label: "Medio", className: "bg-amber-100 text-amber-800", rgb: [217, 119, 6] };
  return { r, label: "Basso", className: "bg-emerald-100 text-emerald-800", rgb: [5, 150, 105] };
};

// ─── PDF ───

async function toDataUrl(url) {
  if (!url || url.startsWith("data:")) return url || null;
  try {
    const blob = await fetch(url).then((r) => (r.ok ? r.blob() : null));
    if (!blob) return null;
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
  } catch { return null; }
}

export async function buildPosPdf(plan, profile) {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF();
  const d = plan.dati || {};
  const W = 210, H = 297, M = 18, CW = W - M * 2;
  const hex = (profile?.colore_principale || "#1e3a8a").replace("#", "");
  const C = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  const logo = await toDataUrl(profile?.logo_url);
  const firma = await toDataUrl(profile?.firma_url);
  const it = (s) => (s ? new Date(s).toLocaleDateString("it-IT") : "—");
  let y = 0;

  const header = () => {
    doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
    doc.text(`POS – ${d.cantiere?.nome || plan.titolo || ""}`, M, 10);
    doc.text(`${d.impresa?.ragione_sociale || ""} · Rev. ${plan.revisione || 0} del ${it(plan.data)}`, W - M, 10, { align: "right" });
    doc.setDrawColor(...C); doc.setLineWidth(0.4); doc.line(M, 12, W - M, 12);
    doc.setTextColor(20, 20, 20);
    y = 20;
  };
  const ensure = (h) => { if (y + h > H - 18) { doc.addPage(); header(); } };
  const h1 = (n, t) => {
    ensure(18); y += 3;
    doc.setFillColor(...C); doc.rect(M, y - 5, CW, 8, "F");
    doc.setFontSize(10.5); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
    doc.text(`${n}. ${t.toUpperCase()}`, M + 2.5, y);
    doc.setTextColor(20, 20, 20); doc.setFont(undefined, "normal");
    y += 8;
  };
  const h2 = (t) => { ensure(12); doc.setFontSize(9.5); doc.setFont(undefined, "bold"); doc.setTextColor(...C); doc.text(t, M, y); doc.setTextColor(20, 20, 20); doc.setFont(undefined, "normal"); y += 5.5; };
  const para = (t, size = 9) => {
    if (!t) return;
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(String(t), CW)) { ensure(5); doc.text(line, M, y); y += size * 0.47; }
    y += 2;
  };
  const kv = (rows) => {
    doc.setFontSize(8.8);
    for (const [k, v] of rows) {
      const lines = doc.splitTextToSize(String(v || "—"), CW - 58);
      ensure(lines.length * 4.2 + 1.5);
      doc.setTextColor(100, 100, 100); doc.text(k, M, y);
      doc.setTextColor(20, 20, 20); doc.text(lines, M + 58, y);
      y += lines.length * 4.2 + 1.5;
    }
    y += 2;
  };
  const bullets = (items) => {
    doc.setFontSize(8.8);
    for (const t of items || []) {
      const lines = doc.splitTextToSize(String(t), CW - 6);
      ensure(lines.length * 4.2 + 1);
      doc.text("•", M + 1, y); doc.text(lines, M + 5, y);
      y += lines.length * 4.2 + 1;
    }
    y += 2;
  };
  // tabella semplice con ritorno a capo nelle celle
  const table = (cols, rows) => {
    const widths = cols.map((c) => c.w * CW);
    const drawHead = () => {
      ensure(9);
      doc.setFillColor(241, 245, 249); doc.rect(M, y - 4.5, CW, 7, "F");
      doc.setFontSize(8); doc.setFont(undefined, "bold");
      let x = M; cols.forEach((c, i) => { doc.text(c.label, x + 1.5, y); x += widths[i]; });
      doc.setFont(undefined, "normal"); y += 5;
    };
    drawHead();
    doc.setFontSize(8.3);
    for (const r of rows) {
      const cells = r.map((v, i) => doc.splitTextToSize(String(v ?? "—"), widths[i] - 3));
      const h = Math.max(...cells.map((c) => c.length)) * 3.9 + 2.5;
      if (y + h > H - 18) { doc.addPage(); header(); drawHead(); doc.setFontSize(8.3); }
      let x = M;
      cells.forEach((c, i) => {
        if (cols[i].color && r.__colors?.[i]) { doc.setTextColor(...r.__colors[i]); doc.setFont(undefined, "bold"); }
        doc.text(c, x + 1.5, y);
        doc.setTextColor(20, 20, 20); doc.setFont(undefined, "normal");
        x += widths[i];
      });
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.line(M, y + h - 3.2, M + CW, y + h - 3.2);
      y += h;
    }
    y += 3;
  };

  // ── Copertina ──
  if (logo) { try { doc.addImage(logo, /png/i.test(logo.slice(0, 30)) ? "PNG" : "JPEG", M, 20, profile?.logo_larghezza || 45, profile?.logo_altezza || 22); } catch { /* logo non valido */ } }
  doc.setFillColor(...C); doc.rect(0, 80, W, 60, "F");
  doc.setTextColor(255, 255, 255); doc.setFont(undefined, "bold"); doc.setFontSize(26);
  doc.text("PIANO OPERATIVO DI SICUREZZA", W / 2, 103, { align: "center" });
  doc.setFont(undefined, "normal"); doc.setFontSize(10.5);
  doc.text("ai sensi dell'art. 89, comma 1, lett. h) e dell'Allegato XV del D.Lgs. 81/2008 e s.m.i.", W / 2, 113, { align: "center" });
  doc.setFontSize(13); doc.setFont(undefined, "bold");
  doc.text(doc.splitTextToSize(d.cantiere?.nome || plan.titolo || "", CW), W / 2, 127, { align: "center" });
  doc.setTextColor(20, 20, 20); doc.setFont(undefined, "normal");
  y = 158;
  kv([["Impresa esecutrice", d.impresa?.ragione_sociale], ["Indirizzo del cantiere", d.cantiere?.indirizzo], ["Committente", d.cantiere?.committente],
    ["Coordinatore per l'esecuzione", d.cantiere?.cse], ["Inizio / fine lavori previsti", `${it(d.cantiere?.data_inizio)} – ${it(d.cantiere?.data_fine)}`], ["Revisione", `${plan.revisione || 0} del ${it(plan.data)}`]]);
  y = 240; doc.setFontSize(8); doc.setTextColor(110, 110, 110);
  doc.text(doc.splitTextToSize("Il presente POS è redatto dal datore di lavoro dell'impresa esecutrice ed è complementare di dettaglio al Piano di Sicurezza e Coordinamento (PSC), quando previsto. È custodito in cantiere e messo a disposizione del CSE, del RLS e degli organi di vigilanza.", CW), M, y);
  doc.setTextColor(20, 20, 20);

  // ── Indice ──
  doc.addPage(); header();
  doc.setFontSize(13); doc.setFont(undefined, "bold"); doc.text("Indice", M, y); doc.setFont(undefined, "normal"); y += 9;
  doc.setFontSize(10);
  SEZIONI.forEach((s) => { doc.text(`${s.n}.  ${s.label}`, M + 2, y); y += 7; });

  // ── 1 Impresa ──
  doc.addPage(); header();
  const i = d.impresa || {};
  h1(1, "Dati identificativi dell'impresa esecutrice");
  kv([["Ragione sociale", i.ragione_sociale], ["Sede legale", i.sede], ["Partita IVA", i.partita_iva], ["Telefono / email", [i.telefono, i.email].filter(Boolean).join(" · ")], ["PEC", i.pec],
    ["Posizione INAIL", i.posizione_inail], ["Posizione INPS", i.posizione_inps], ["Cassa Edile", i.cassa_edile]]);
  h2("Figure della sicurezza");
  kv([["Datore di lavoro", i.datore_lavoro], ["RSPP", i.rspp], ["Medico competente", i.medico_competente], ["RLS / RLST", i.rls],
    ["Addetti primo soccorso", (i.addetti_primo_soccorso || []).join(", ")], ["Addetti antincendio ed evacuazione", (i.addetti_antincendio || []).join(", ")],
    ["Direttore tecnico di cantiere", i.direttore_tecnico], ["Capocantiere / preposto", i.capocantiere]]);

  // ── 2 Cantiere ──
  const c = d.cantiere || {};
  h1(2, "Dati del cantiere e attività svolte");
  kv([["Cantiere", c.nome], ["Indirizzo", c.indirizzo], ["Opera", c.descrizione_opera], ["Titolo edilizio", c.titolo_edilizio], ["Committente", [c.committente, c.committente_indirizzo].filter(Boolean).join(" – ")],
    ["Responsabile dei lavori", c.responsabile_lavori], ["Direttore dei lavori", c.direttore_lavori], ["CSP", c.csp], ["CSE", c.cse],
    ["Durata prevista", `dal ${it(c.data_inizio)} al ${it(c.data_fine)}`], ["Orario di lavoro", c.orario], ["Turni", c.turni], ["PSC presente", c.presenza_psc ? "Sì" : "No"]]);
  if (c.organizzazione) { h2("Modalità organizzative del cantiere"); para(c.organizzazione); }
  if (c.subappaltatori?.length) { h2("Imprese subappaltatrici e lavoratori autonomi"); table([{ label: "Impresa", w: 0.4 }, { label: "Lavorazioni affidate", w: 0.6 }], c.subappaltatori.map((s) => [s.nome, s.lavorazioni])); }

  // ── 3 Lavoratori ──
  h1(3, "Lavoratori presenti in cantiere, mansioni e formazione");
  table([{ label: "Lavoratore", w: 0.22 }, { label: "Qualifica", w: 0.18 }, { label: "Mansione in cantiere", w: 0.18 }, { label: "Formazione", w: 0.3 }, { label: "Idoneità", w: 0.12 }],
    (d.lavoratori || []).map((l) => [l.nome, l.qualifica, l.mansione, l.formazione, l.idoneita]));
  if (d.formazione_note) para(d.formazione_note);

  // ── 4 Lavorazioni ──
  h1(4, "Lavorazioni, valutazione dei rischi e misure di prevenzione");
  para("Il livello di rischio è calcolato come R = P × D (probabilità × danno, scala 1–4): basso 1–4, medio 5–8, alto 9–16.", 8.5);
  (d.lavorazioni || []).forEach((l, k) => {
    h2(`4.${k + 1}  ${l.nome}`);
    para(l.descrizione);
    if (l.fasi?.length) { doc.setFontSize(8.5); doc.setFont(undefined, "bold"); ensure(6); doc.text("Fasi di lavoro", M, y); doc.setFont(undefined, "normal"); y += 4.5; bullets(l.fasi); }
    if (l.rischi?.length) {
      const rows = l.rischi.map((r) => { const lv = riskLevel(r.p, r.d); const row = [r.rischio, r.p, r.d, `${lv.r} ${lv.label}`]; row.__colors = { 3: lv.rgb }; return row; });
      table([{ label: "Rischio", w: 0.58 }, { label: "P", w: 0.08 }, { label: "D", w: 0.08 }, { label: "Livello R", w: 0.26, color: true }], rows);
    }
    if (l.misure?.length) { doc.setFontSize(8.5); doc.setFont(undefined, "bold"); ensure(6); doc.text("Misure di prevenzione e protezione", M, y); doc.setFont(undefined, "normal"); y += 4.5; bullets(l.misure); }
    if (l.dpi?.length) { doc.setFontSize(8.5); doc.setFont(undefined, "bold"); ensure(6); doc.text("DPI", M, y); doc.setFont(undefined, "normal"); y += 4.5; bullets(l.dpi); }
    if (l.formazione) para(`Formazione / sorveglianza: ${l.formazione}`, 8.5);
  });

  // ── 5 Attrezzature ──
  const a = d.attrezzature || {};
  h1(5, "Macchine, attrezzature, impianti e opere provvisionali");
  h2("Macchine e attrezzature"); bullets(a.macchine?.length ? a.macchine : ["—"]);
  h2("Ponteggi, trabattelli e opere provvisionali"); bullets(a.opere_provvisionali?.length ? a.opere_provvisionali : ["—"]);
  if (a.impianti?.length) { h2("Impianti di cantiere"); bullets(a.impianti); }
  para("Tutte le macchine e attrezzature sono conformi al D.Lgs. 17/2010 (Direttiva Macchine) o all'Allegato V del D.Lgs. 81/2008, sottoposte alle verifiche periodiche previste e usate da personale formato e, dove richiesto, abilitato (Accordo Stato-Regioni 22/02/2012).", 8.5);

  // ── 6 Sostanze e rumore ──
  h1(6, "Sostanze e preparati pericolosi, esposizione al rumore");
  if (d.sostanze?.length) table([{ label: "Sostanza / prodotto", w: 0.35 }, { label: "Impiego", w: 0.35 }, { label: "Scheda di sicurezza", w: 0.3 }], d.sostanze.map((s) => [s.nome, s.uso, s.scheda || "Disponibile in cantiere"]));
  else para("Non è previsto l'impiego di sostanze o preparati classificati pericolosi. Eventuali prodotti introdotti in corso d'opera saranno accompagnati dalla relativa scheda di sicurezza (SDS).");
  h2("Esito della valutazione del rumore");
  kv([["Esito", d.rumore?.esito], ["Livello di esposizione", d.rumore?.livello], ["Misure adottate", d.rumore?.misure]]);

  // ── 7 DPI e misure integrative ──
  h1(7, "Dispositivi di protezione individuale e misure integrative");
  h2("DPI forniti ai lavoratori"); bullets(d.dpi?.length ? d.dpi : ["—"]);
  para("I DPI sono consegnati con registrazione firmata, marcati CE, adeguati ai rischi e mantenuti in efficienza; i lavoratori sono formati e, per i DPI di III categoria, addestrati al loro uso.", 8.5);
  if (d.misure_integrative) { h2("Misure preventive e protettive integrative rispetto al PSC"); para(d.misure_integrative); }
  if (d.procedure_psc) { h2("Procedure complementari e di dettaglio richieste dal PSC"); para(d.procedure_psc); }

  // ── 8 Emergenze ──
  const em = d.emergenze || {};
  h1(8, "Gestione delle emergenze e primo soccorso");
  kv([["Numero unico emergenze", "112"], ["Pronto soccorso più vicino", em.ospedale], ["Punto di raccolta", em.punto_raccolta], ["Mezzi antincendio", em.estintori]]);
  para(em.procedure);

  // ── 9 Firme ──
  h1(9, "Dichiarazione e firme");
  para("Il datore di lavoro dell'impresa esecutrice dichiara che il presente POS è stato redatto ai sensi del D.Lgs. 81/2008, che i lavoratori sono stati informati e formati sui rischi e sulle misure in esso contenute e che il RLS ne ha preso visione.");
  y += 4;
  kv([["Luogo e data", `${d.firme?.luogo || ""}, ${it(d.firme?.data)}`]]);
  y += 6;
  const sig = (label, name, img) => {
    ensure(28);
    doc.setFontSize(8.5); doc.setTextColor(100, 100, 100); doc.text(label, M, y); doc.setTextColor(20, 20, 20);
    doc.text(name || "", M, y + 5);
    if (img) { try { doc.addImage(img, /png/i.test(img.slice(0, 30)) ? "PNG" : "JPEG", M + 95, y - 4, 40, 14); } catch { /* firma non valida */ } }
    doc.setDrawColor(150, 150, 150); doc.line(M + 90, y + 11, W - M, y + 11);
    y += 22;
  };
  sig("Il datore di lavoro", i.datore_lavoro, firma);
  sig("Il RSPP", i.rspp);
  sig("Il RLS / RLST (per presa visione)", i.rls);
  sig("Il CSE (per verifica di idoneità)", c.cse);

  // numeri di pagina
  const n = doc.internal.getNumberOfPages();
  for (let p = 2; p <= n; p++) { doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(140, 140, 140); doc.text(`Pagina ${p} di ${n}`, W - M, H - 8, { align: "right" }); }
  return doc;
}
