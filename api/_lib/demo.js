// Azienda dimostrativa: dati realistici e fissi, con date sempre relative a oggi.
// Usata dall'accesso "Prova la demo" e ripristinata ogni notte (cron) o con scripts/seed-demo.mjs.
import crypto from "crypto";
import { admin, HttpError } from "./server.js";

export const demoUserId = () => process.env.DEMO_USER_ID || "";
export const isDemoTenant = (tenantId) => !!demoUserId() && tenantId === demoUserId();

const uuid = () => crypto.randomUUID();
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const isWeekday = (iso) => { const w = new Date(iso).getDay(); return w !== 0 && w !== 6; };
const r2 = (v) => Math.round(v * 100) / 100;

function build() {
  const out = [];
  const add = (entity, data, id = uuid()) => { out.push({ id, entity, data }); return { id, ...data }; };

  add("CompanyProfile", {
    ragione_sociale: "Edilizia Dolomiti Srl", partita_iva: "02468135799", codice_fiscale: "02468135799", indirizzo: "Via Galvani 12", cap: "39100", citta: "Bolzano", provincia: "BZ",
    telefono: "0471 555 120", email: "info@edilizia-dolomiti.example", pec: "edilizia-dolomiti@pec.example", sito_web: "www.edilizia-dolomiti.example",
    iban: "IT60X0542811101000000123456", regime_fiscale: "RF01", numero_rea: "BZ-204518", termine_sezioni: "Cantiere",
    obiettivo_fatturato: 450000, onboarding_nascosto: true,
    timbrature: { gps: true, raggio_m: 300, pausa_minuti: 60, pausa_oltre_ore: 6, gps_attivato_il: new Date().toISOString() },
    sicurezza: { datore_lavoro: "Luca Pichler", rspp: "Ing. Marta Rainer", medico_competente: "Dott. Paolo Gasser", rls: "Stefan Mair", addetti_primo_soccorso: ["Stefan Mair", "Andrea Conti"], addetti_antincendio: ["Marco Ferrari"], capocantiere: "Marco Ferrari", posizione_inail: "12345678/90", cassa_edile: "Cassa Edile Bolzano n. 4521" },
  });

  // ── Clienti e fornitori ──
  const C = [
    ["cliente", "azienda", "Hotel Alpenrose Srl", "01234567897", "Via Dolomiti 4", "39046", "Ortisei", "BZ", "Albergo"],
    ["cliente", "privato", "", "", "Via Roma 88", "39100", "Bolzano", "BZ", "Privato", "Giulia Bianchi", "BNCGLI85M41A952X"],
    ["cliente", "ente", "Comune di Laives", "00413480212", "Piazza Municipio 1", "39055", "Laives", "BZ", "Ente pubblico"],
    ["cliente", "azienda", "Condominio Parco Talvera", "94012345678", "Via Talvera 21", "39100", "Bolzano", "BZ", "Condominio"],
    ["cliente", "privato", "", "", "Via Merano 5", "39011", "Lana", "BZ", "Privato", "Thomas Egger", "GGRTMS78A01E421Z"],
    ["cliente", "azienda", "Cantina Santa Maddalena Sca", "00123450213", "Via Rencio 3", "39100", "Bolzano", "BZ", "Azienda"],
    ["fornitore", "azienda", "Würth Srl", "00125230215", "Via Stazione 51", "39044", "Egna", "BZ", "Materiali"],
    ["fornitore", "azienda", "Calcestruzzi Adige Spa", "01987650211", "Zona Industriale 8", "39055", "Laives", "BZ", "Calcestruzzo"],
    ["fornitore", "azienda", "Noleggi Alto Adige Srl", "02233440216", "Via Macello 40", "39100", "Bolzano", "BZ", "Noleggi"],
    ["fornitore", "azienda", "Elettro Rainer Snc", "01122330219", "Via Resia 110", "39100", "Bolzano", "BZ", "Subappalto impianti"],
  ].map(([tipo, sogg, nome, piva, ind, cap, citta, prov, cat, privato, cf]) => add("Contact", {
    tipo, tipo_soggetto: sogg, nome, nome_privato: privato || "", partita_iva: piva, codice_fiscale: cf || (sogg === "privato" ? "" : piva), indirizzo: ind, cap, citta, provincia: prov,
    categorie: tipo === "cliente" ? [cat] : [], categoria_fornitore: tipo === "fornitore" ? cat : "", email: `amministrazione@${(nome || privato).toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}.example`,
    telefono: "0471 " + String(200000 + Math.floor(Math.random() * 700000)).slice(0, 6), codice_sdi: sogg === "ente" ? "UF7K2Q" : sogg === "privato" ? "" : "M5UXCR1", archiviato: false,
  }));
  const clienti = C.filter((c) => c.tipo === "cliente");
  const nameOf = (c) => c.nome || c.nome_privato;

  // ── Dipendenti ──
  const E = [
    ["Marco", "Ferrari", "Capocantiere", "Operaio specializzato", "4", 34, -3200],
    ["Stefan", "Mair", "Muratore", "Operaio specializzato", "3", 29.5, -2400],
    ["Andrea", "Conti", "Muratore", "Operaio qualificato", "2", 27, -1500],
    ["Lukas", "Hofer", "Carpentiere", "Operaio qualificato", "2", 27, -900],
    ["Ahmed", "Benali", "Manovale", "Operaio comune", "1", 24, -400],
    ["Giorgio", "Rossi", "Escavatorista", "Operaio specializzato", "3", 31, -2100],
  ].map(([nome, cognome, ruolo, qualifica, livello, costo, ass]) => add("Employee", {
    nome, cognome, ruolo, qualifica, livello, costo_orario: costo, data_assunzione: day(ass), tipo_contratto: "Tempo indeterminato", ccnl: "Edilizia industria",
    ore_settimanali: 40, stato: "attivo", cellulare: `333 ${Math.floor(1000000 + Math.random() * 8999999)}`,
  }));
  // formazione e visite (una scaduta e una in scadenza per rendere viva la sezione)
  E.forEach((e, i) => {
    add("EmployeeDocument", { dipendente_id: e.id, tipo: "corso", corso_codice: "generale", titolo: "Formazione generale lavoratori", data_emissione: day(-1000), ente: "Scuola Edile Bolzano", ore_corso: 4 });
    add("EmployeeDocument", { dipendente_id: e.id, tipo: "corso", corso_codice: "specifica_alto", titolo: "Formazione specifica rischio alto (edilizia)", data_emissione: day(-1000 + i * 40), data_scadenza: day(-1000 + i * 40 + 1826), ente: "Scuola Edile Bolzano", ore_corso: 12 });
    add("EmployeeDocument", { dipendente_id: e.id, tipo: "visita_medica", corso_codice: "visita_medica", titolo: "Visita medica di idoneità", data_emissione: day(i === 4 ? -380 : -200 + i * 10), data_scadenza: day(i === 4 ? -15 : 165 + i * 10), esito: "Idoneo" });
  });
  add("EmployeeDocument", { dipendente_id: E[0].id, tipo: "corso", corso_codice: "preposto", titolo: "Preposto", data_emissione: day(-700), data_scadenza: day(20), ente: "Scuola Edile Bolzano", ore_corso: 12 });
  add("EmployeeDocument", { dipendente_id: E[5].id, tipo: "corso", corso_codice: "mmt", titolo: "Macchine movimento terra", data_emissione: day(-500), data_scadenza: day(1300), ente: "CFP Alto Adige", ore_corso: 16 });

  // ── Preventivi ──
  const voce = (descrizione, unita_misura, quantita, prezzo_unitario, costo_unitario, iva = 10) => ({ tipo: "voce", descrizione, unita_misura, quantita, prezzo_unitario, sconto: 0, iva_percentuale: iva, costo_unitario, opzionale: false });
  const cap = (descrizione) => ({ tipo: "capitolo", descrizione });
  const tot = (righe) => {
    const imp = righe.filter((r) => r.tipo === "voce").reduce((s, r) => s + r.quantita * r.prezzo_unitario, 0);
    const iva = righe.filter((r) => r.tipo === "voce").reduce((s, r) => s + (r.quantita * r.prezzo_unitario * r.iva_percentuale) / 100, 0);
    return { imponibile: r2(imp), iva_totale: r2(iva), totale: r2(imp + iva) };
  };
  const Q = [
    [clienti[0], "Ristrutturazione 12 camere e bagni – ala nord", "approvato", -95, [cap("Demolizioni"), voce("Demolizione di pavimenti e rivestimenti ceramici compreso trasporto a discarica", "mq", 420, 18.5, 11), voce("Rimozione sanitari e rubinetterie", "cad", 36, 45, 22), cap("Impianti"), voce("Rifacimento impianto idrico-sanitario bagno completo", "cad", 12, 2850, 1900), cap("Finiture"), voce("Posa gres porcellanato 60x60 compresa colla e fugatura", "mq", 420, 42, 26), voce("Tinteggiatura pareti e soffitti idropittura traspirante", "mq", 1650, 9.8, 5.2)]],
    [clienti[1], "Ristrutturazione bagno e cucina", "approvato", -60, [voce("Demolizione rivestimenti bagno", "mq", 28, 19, 11), voce("Impianto idrico bagno completo", "corpo", 1, 3200, 2100), voce("Fornitura e posa piatto doccia filo pavimento 80x140", "cad", 1, 890, 540), voce("Posa rivestimento bagno", "mq", 32, 48, 29), voce("Rifacimento impianto elettrico cucina", "corpo", 1, 1850, 1150)]],
    [clienti[2], "Manutenzione straordinaria scuola primaria – copertura", "approvato", -120, [voce("Montaggio ponteggio di facciata, compreso nolo per 60 giorni", "mq", 680, 14, 9, 22), voce("Rifacimento manto di copertura in lamiera coibentata", "mq", 540, 68, 44, 22), voce("Lattonerie in rame", "ml", 120, 55, 34, 22)]],
    [clienti[3], "Cappotto termico e tinteggiatura facciate", "visto", -12, [voce("Isolamento termico a cappotto EPS grafite sp. 12 cm", "mq", 1450, 78, 52), voce("Tinteggiatura facciate silossanica", "mq", 1450, 14, 7.5), voce("Ponteggio di facciata", "mq", 1600, 12, 8)]],
    [clienti[4], "Ampliamento abitazione – nuovo soggiorno", "inviato", -6, [voce("Scavo di sbancamento", "mc", 85, 22, 14, 22), voce("Fondazioni in c.a.", "mc", 18, 310, 205, 22), voce("Murature in blocchi di laterizio porizzato sp. 30", "mq", 96, 72, 46, 22)]],
    [clienti[5], "Nuova cantina di invecchiamento – opere murarie", "in_attesa", -3, [voce("Solaio in latero-cemento", "mq", 240, 88, 60, 22), voce("Intonaco civile interno", "mq", 780, 24, 14, 22)]],
    [clienti[0], "Rifacimento terrazza panoramica", "rifiutato", -150, [voce("Impermeabilizzazione con guaina liquida", "mq", 180, 38, 22), voce("Pavimentazione in pietra naturale", "mq", 180, 115, 78)]],
  ];
  const quotes = Q.map(([cli, oggetto, stato, off, righe], i) => add("Quote", {
    numero: `${i + 1}/${new Date().getFullYear()}`, anno: new Date().getFullYear(), data: day(off), cliente_id: cli.id, cliente_nome: nameOf(cli), oggetto, stato, righe, ...tot(righe),
    validita_giorni: 30, condizioni_pagamento: "30% all'accettazione, SAL mensili, saldo a fine lavori", tempi_esecuzione: "Da concordare",
    ...(stato === "approvato" ? { data_firma_cliente: day(off + 5) } : {}), ...(stato === "visto" ? { visto_il: new Date(Date.now() - 2 * 86400000).toISOString() } : {}),
  }));

  // ── Lavori ──
  const fasi = (pcts) => [["Allestimento cantiere", 5], ["Demolizioni e rimozioni", 10], ["Opere murarie", 25], ["Impianti", 25], ["Finiture", 25], ["Pulizia e consegna", 10]].map(([nome, peso], i) => ({ nome, peso, completamento: pcts[i] ?? 0 }));
  const avz = (f) => Math.round(f.reduce((s, x) => s + x.peso * x.completamento, 0) / f.reduce((s, x) => s + x.peso, 0));
  const W = [
    { q: quotes[0], nome: "Hotel Alpenrose – ristrutturazione ala nord", indirizzo: "Via Dolomiti 4, Ortisei", lat: 46.5752, lng: 11.6723, stato: "in_corso", inizio: -80, fine: 25, pcts: [100, 100, 90, 70, 35, 0], team: [0, 1, 2, 4], tipo: "Ristrutturazione" },
    { q: quotes[1], nome: "Casa Bianchi – bagno e cucina", indirizzo: "Via Roma 88, Bolzano", lat: 46.4933, lng: 11.3317, stato: "in_corso", inizio: -40, fine: -3, pcts: [100, 100, 100, 80, 40, 0], team: [3, 4], tipo: "Manutenzione straordinaria" },
    { q: quotes[2], nome: "Scuola primaria Laives – copertura", indirizzo: "Via Kennedy 12, Laives", lat: 46.4271, lng: 11.3386, stato: "finito", inizio: -110, fine: -20, pcts: [100, 100, 100, 100, 100, 100], team: [0, 1, 5], tipo: "Manutenzione straordinaria" },
    { q: null, nome: "Condominio Talvera – sopralluogo e rilievi", indirizzo: "Via Talvera 21, Bolzano", lat: 46.5021, lng: 11.3469, stato: "da_iniziare", inizio: 14, fine: 120, pcts: [], team: [], tipo: "Efficientamento energetico", cliente: clienti[3] },
  ];
  const worksites = W.map((w, wi) => {
    const f = w.pcts.length ? fasi(w.pcts) : [];
    const cli = w.cliente || clienti.find((c) => c.id === w.q?.cliente_id);
    const importo = w.q?.totale || 0;
    const piano = importo ? [
      { descrizione: "Acconto 30% all'accettazione", importo: r2(importo * 0.3), scadenza: day(w.inizio - 5) },
      { descrizione: "SAL n. 1", importo: r2(importo * 0.3), scadenza: day(w.inizio + 30), sal: true },
      { descrizione: "SAL n. 2", importo: r2(importo * 0.25), scadenza: day(w.inizio + 60), sal: true },
      { descrizione: "Saldo a fine lavori", importo: r2(importo * 0.15), scadenza: day(w.fine + 30) },
    ] : [];
    return add("Worksite", {
      nome: w.nome, indirizzo: w.indirizzo, lat: w.lat, lng: w.lng, stato: w.stato, attivo: w.stato !== "finito", cliente_id: cli?.id || "", cliente_nome: cli ? nameOf(cli) : "",
      preventivo_id: w.q?.id || "", importo_totale: importo || null, tipo_intervento: w.tipo, data_inizio: day(w.inizio), data_fine_prevista: day(w.fine),
      ...(w.stato === "finito" ? { data_fine_effettiva: day(w.fine) } : {}), fasi: f, avanzamento: f.length ? avz(f) : 0, squadra_ids: w.team.map((i) => E[i].id),
      responsabile_id: w.team.length ? E[w.team[0]].id : "", budget: importo ? { Materiali: r2(importo * 0.28), Manodopera: r2(importo * 0.32), Noleggi: r2(importo * 0.05), Subappalti: r2(importo * 0.12) } : {},
      piano_pagamenti: piano, direttore_lavori: "Arch. Elena Kofler", coordinatore_sicurezza: "Geom. Martin Plattner", titolo_edilizio: { tipo: "CILA", numero: `${new Date().getFullYear()}/${140 + wi}` },
    });
  });
  // collega preventivi e lavori
  for (const w of worksites) { const q = out.find((x) => x.id === w.preventivo_id); if (q) q.data.worksite_id = w.id; }

  // incassi (rate passate pagate, una scaduta sul lavoro Bianchi)
  worksites.forEach((w, wi) => {
    const cli = clienti.find((c) => c.id === w.cliente_id);
    (w.piano_pagamenti || []).forEach((r, ri) => {
      const due = new Date(r.scadenza) < new Date();
      if (!due || (wi === 1 && ri === 1)) return;
      add("WorksitePayment", { worksite_id: w.id, worksite_nome: w.nome, cliente_id: cli?.id || "", cliente_nome: w.cliente_nome, importo: r.importo, data: r.scadenza, tipo: ri === 3 ? "saldo" : "acconto", metodo: "bonifico" });
    });
  });

  // costi di cantiere
  const forn = C.filter((c) => c.tipo === "fornitore");
  worksites.filter((w) => w.stato !== "da_iniziare").forEach((w, wi) => {
    const base = w.importo_totale || 20000;
    [["Materiali", forn[0], 0.09, "Materiale edile e ferramenta"], ["Materiali", forn[1], 0.07, "Calcestruzzo e massetti"], ["Noleggi", forn[2], 0.03, "Nolo ponteggio e mini escavatore"], ["Subappalti", forn[3], 0.08, "Impianto elettrico"], ["Materiali", forn[0], 0.05, "Piastrelle e collanti"]]
      .forEach(([categoria, f, pct, descr], k) => add("WorksiteTransaction", { worksite_id: w.id, worksite_nome: w.nome, tipo: "uscita", categoria, descrizione: descr, importo: r2(base * pct * (wi === 1 && k === 3 ? 1.9 : 1)), data: day(Number(w.data_inizio ? (+new Date(w.data_inizio) - +new Date()) / 86400000 : -30) + 5 + k * 9 | 0), fornitore: f.nome }));
  });

  // ── Presenze degli ultimi 45 giorni + timbrature di oggi ──
  for (let off = -45; off <= -1; off++) {
    const date = day(off);
    if (!isWeekday(date)) continue;
    for (const w of worksites) {
      if (!w.squadra_ids?.length || date < w.data_inizio || (w.data_fine_effettiva && date > w.data_fine_effettiva)) continue;
      const presenze = w.squadra_ids.map((eid, k) => {
        const e = E.find((x) => x.id === eid);
        const assente = (off + k) % 17 === 0;
        return { dipendente_id: eid, dipendente_nome: `${e.nome} ${e.cognome}`, stato: assente ? ((off + k) % 34 === 0 ? "ferie" : "malattia") : "presente", ore: assente ? 0 : (off + k) % 5 === 0 ? 9 : 8 };
      });
      add("DailyAttendance", { data: date, cantiere_id: w.id, cantiere_nome: w.nome, presenze });
    }
  }
  const today = day(0);
  if (isWeekday(today)) {
    worksites[0].squadra_ids.forEach((eid, k) => {
      const e = E.find((x) => x.id === eid);
      const at = new Date(); at.setHours(7, 2 + k * 4, 0, 0);
      add("ClockEvent", { tipo: "entrata", at: at.toISOString(), data: today, dipendente_id: eid, dipendente_nome: `${e.nome} ${e.cognome}`, worksite_id: worksites[0].id, worksite_nome: worksites[0].nome,
        posizione: { lat: 46.5752 + k * 0.0002, lng: 11.6723, accuratezza_m: 12 }, distanza_m: 20 + k * 25 + (k === 3 ? 900 : 0), stato: "da_confermare", inviata_dopo: false, note: "" });
    });
  }

  // ── Giornale di cantiere ──
  [-6, -4, -2].forEach((off, k) => add("WorksiteLog", { worksite_id: worksites[0].id, data: day(off), meteo: ["Sereno", "Nuvoloso", "Sereno"][k], presenti: 4,
    attivita: ["Posa gres camere 104–108", "Collaudo impianto idrico bagni piano secondo", "Tinteggiatura corridoio piano primo"][k], forniture: k === 1 ? "Consegna colla e fugante (Würth)" : "", problemi: k === 2 ? "Ritardo consegna porte interne: nuova data prevista la prossima settimana" : "", autore: "Marco Ferrari" }));

  // ── Fatture ──
  const inv = (w, q, numero, off, stato, perc, descr) => {
    const imp = r2((q.imponibile || 0) * perc);
    const aliq = q.righe.find((r) => r.tipo === "voce")?.iva_percentuale ?? 10;
    const iva = r2((imp * aliq) / 100);
    return add("Invoice", { numero: `${numero}/${new Date().getFullYear()}`, anno: new Date().getFullYear(), data: day(off), tipo_documento: "TD01", regime: "RF01", cliente_id: q.cliente_id, cliente_nome: q.cliente_nome,
      worksite_id: w.id, worksite_nome: w.nome, preventivo_id: q.id, oggetto: `${descr} – ${w.nome}`, righe: [{ descrizione: `${descr} – ${q.oggetto}`, quantita: 1, unita_misura: "corpo", prezzo_unitario: imp, aliquota_key: String(aliq) }],
      imponibile: imp, iva_totale: iva, totale: r2(imp + iva), stato, modalita_pagamento: "MP05", iban: "IT60X0542811101000000123456", scadenza: day(off + 30), ...(stato === "pagata" ? { data_pagamento: day(off + 20) } : {}) });
  };
  inv(worksites[0], quotes[0], 1, -85, "pagata", 0.3, "Acconto 30%");
  inv(worksites[2], quotes[2], 2, -75, "pagata", 0.6, "SAL n. 1");
  inv(worksites[0], quotes[0], 3, -48, "pagata", 0.3, "SAL n. 1");
  inv(worksites[1], quotes[1], 4, -30, "inviata", 0.3, "SAL n. 1");
  inv(worksites[2], quotes[2], 5, -18, "emessa", 0.4, "Saldo");

  // ── Documenti ditta ──
  [["DURC", "durc", -60, 60], ["Visura camerale", "visura", -30, null], ["Polizza RCT/RCO Allianz", "assicurazione", -300, 65], ["Certificazione SOA OG1 classe III", "certificazione", -600, 495], ["Iscrizione Cassa Edile", "altro", -365, null]]
    .forEach(([titolo, tipo, em, sc]) => add("CompanyDocument", { titolo, tipo, data_emissione: day(em), ...(sc != null ? { data_scadenza: day(sc) } : {}), riassunto: `${titolo} dell'impresa.`, nome_file: `${String(titolo).replace(/\W+/g, "_")}.pdf`, mime: "application/pdf" }));

  // ── Contratti ──
  add("GeneratedContract", { tipo: "subappalto", titolo: "Contratto di subappalto – impianto elettrico Hotel Alpenrose", controparte_nome: "Elettro Rainer Snc", contatto_id: forn[3].id, worksite_id: worksites[0].id, stato: "firmato", firmato_il: day(-70), data_creazione: day(-75), importo: 18500, data_scadenza: day(40),
    contenuto_finale: "CONTRATTO DI SUBAPPALTO\n\nTra Edilizia Dolomiti Srl (appaltatore) ed Elettro Rainer Snc (subappaltatore)\n\nART. 1 – OGGETTO\nRealizzazione dell'impianto elettrico delle 12 camere dell'ala nord dell'Hotel Alpenrose, Ortisei.\n\nART. 2 – CORRISPETTIVO\nEuro 18.500,00 oltre IVA, a stati di avanzamento mensili.\n\nART. 3 – SICUREZZA\nIl subappaltatore consegna il proprio POS e rispetta il PSC del cantiere." });
  add("GeneratedContract", { tipo: "appalto", titolo: "Contratto d'appalto – Casa Bianchi", controparte_nome: "Giulia Bianchi", contatto_id: clienti[1].id, worksite_id: worksites[1].id, stato: "inviato", inviato_il: day(-2), data_creazione: day(-3), importo: quotes[1].totale,
    contenuto_finale: "CONTRATTO D'APPALTO\n\nTra Giulia Bianchi (committente) ed Edilizia Dolomiti Srl (appaltatore)\n\nART. 1 – OGGETTO\nRistrutturazione di bagno e cucina presso l'abitazione di Via Roma 88, Bolzano, come da preventivo n. 2.\n\nART. 2 – TEMPI\nInizio lavori entro 10 giorni dalla firma, durata prevista 6 settimane.\n\nART. 3 – PAGAMENTI\n30% alla firma, SAL al raggiungimento del 50%, saldo a fine lavori." });

  // ── POS ──
  add("SafetyPlan", { titolo: `POS – ${worksites[0].nome}`, worksite_id: worksites[0].id, worksite_nome: worksites[0].nome, stato: "completo", revisione: 1, data: day(-82), dati: {
    impresa: { ragione_sociale: "Edilizia Dolomiti Srl", sede: "Via Galvani 12, 39100 Bolzano (BZ)", partita_iva: "02468135799", datore_lavoro: "Luca Pichler", rspp: "Ing. Marta Rainer", medico_competente: "Dott. Paolo Gasser", rls: "Stefan Mair", addetti_primo_soccorso: ["Stefan Mair", "Andrea Conti"], addetti_antincendio: ["Marco Ferrari"], capocantiere: "Marco Ferrari" },
    cantiere: { nome: worksites[0].nome, indirizzo: worksites[0].indirizzo, committente: "Hotel Alpenrose Srl", data_inizio: worksites[0].data_inizio, data_fine: worksites[0].data_fine_prevista, orario: "07:30–12:00 / 13:00–16:30, dal lunedì al venerdì" },
    lavoratori: worksites[0].squadra_ids.map((eid) => { const e = E.find((x) => x.id === eid); return { id: eid, nome: `${e.nome} ${e.cognome}`, mansione: e.ruolo, qualifica: e.qualifica }; }),
    lavorazioni: [
      { nome: "Demolizioni e rimozioni", descrizione: "Rimozione di pavimenti, rivestimenti e sanitari con utensili elettrici.", rischi: [{ rischio: "Proiezione di schegge", p: 3, d: 2 }, { rischio: "Rumore e vibrazioni", p: 3, d: 2 }, { rischio: "Polveri", p: 3, d: 2 }], misure: ["Delimitazione dell'area", "Bagnatura dei materiali", "Uso di aspiratori"], dpi: ["Occhiali di protezione (EN 166)", "Otoprotettori (EN 352)", "Facciale filtrante FFP2/FFP3 (EN 149)"] },
      { nome: "Impianto idrico-sanitario", descrizione: "Posa di tubazioni multistrato e scarichi.", rischi: [{ rischio: "Tagli e abrasioni", p: 2, d: 2 }, { rischio: "Movimentazione manuale dei carichi", p: 2, d: 3 }], misure: ["Attrezzi in buono stato", "Sollevamento in due per carichi oltre 25 kg"], dpi: ["Guanti contro rischi meccanici (EN 388)", "Scarpe antinfortunistiche S3"] },
    ],
    dpi: ["Casco di protezione (EN 397)", "Scarpe antinfortunistiche S3", "Guanti contro rischi meccanici (EN 388)", "Occhiali di protezione (EN 166)"],
    emergenze: { ospedale: "Ospedale di Bressanone, Via Dante 51", punto_raccolta: "Parcheggio lato est dell'hotel", procedure: "In caso di emergenza il capocantiere interrompe le lavorazioni e chiama il 112." },
    firme: { luogo: "Bolzano", data: day(-82) },
  } });

  // ── Mezzi e attrezzature ──
  add("Equipment", { nome: "Iveco Daily 35C15", tipo: "Furgone", targa: "GH123ZT", anno: "2021", ore_km: "84200", scadenze: { revisione: day(12), assicurazione: day(140), bollo: day(60) },
    assegnazione: { worksite_id: worksites[0].id, worksite_nome: worksites[0].nome, dipendente_id: E[0].id, dipendente_nome: "Marco Ferrari", dal: worksites[0].data_inizio, al: worksites[0].data_fine_prevista },
    manutenzioni: [{ data: day(-60), descrizione: "Tagliando 80.000 km", costo: 420 }] });
  add("Equipment", { nome: "Escavatore Kubota KX019", tipo: "Escavatore", targa: "MAT-KX019-4471", anno: "2019", ore_km: "3120", scadenze: { verifica_periodica: day(-5), assicurazione: day(200), manutenzione: day(25) },
    assegnazione: { worksite_id: worksites[1].id, worksite_nome: worksites[1].nome, dipendente_id: E[5].id, dipendente_nome: "Giorgio Rossi", dal: day(-20), al: day(10) },
    manutenzioni: [{ data: day(-120), descrizione: "Cambio olio idraulico e filtri", costo: 610 }] });
  add("Equipment", { nome: "Gru su autocarro Fassi F110", tipo: "Gru su autocarro", targa: "FL456KP", anno: "2017", scadenze: { revisione: day(90), verifica_periodica: day(170), assicurazione: day(45) }, assegnazione: {} });
  add("Equipment", { nome: "Ponteggio a telai (600 mq)", tipo: "Ponteggio", anno: "2020", scadenze: {}, assegnazione: { worksite_id: worksites[0].id, worksite_nome: worksites[0].nome } });

  // ── Promemoria ──
  [["Sopralluogo Condominio Talvera con l'amministratore", 1, "09:30", "appuntamento", "alta"], ["Rinnovo DURC", 3, "", "scadenza", "alta"], ["Chiamare Würth per consegna porte", 0, "11:00", "chiamata", "normale"], ["Riunione di coordinamento sicurezza Hotel Alpenrose", 4, "14:00", "appuntamento", "normale"], ["Inviare SAL n. 2 al Comune di Laives", 6, "", "altro", "normale"]]
    .forEach(([titolo, off, ora, tipo, priorita]) => add("Reminder", { titolo, data: day(off), ora, tipo, priorita, completato: false, ricorrenza: "nessuna", descrizione: "" }));

  return out;
}


/** Cancella e ricrea i dati dell'azienda demo. */
export async function resetDemo(tenantId = demoUserId(), email = "demo@talo.app") {
  if (!tenantId) throw new HttpError(500, "Azienda demo non configurata");
  const db = admin();
  const { error: e1 } = await db.from("entity_records").delete().eq("tenant_id", tenantId);
  if (e1) throw new HttpError(500, e1.message);
  await db.from("audit_log").delete().eq("tenant_id", tenantId);
  const rows = build().map((r) => ({ id: r.id, entity: r.entity, tenant_id: tenantId, created_by_id: tenantId, created_by: email, data: r.data }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("entity_records").insert(rows.slice(i, i + 200));
    if (error) throw new HttpError(500, error.message);
  }
  // il ripristino non deve comparire nel registro attività
  await db.from("audit_log").delete().eq("tenant_id", tenantId);
  // file caricati dai visitatori e password (se qualcuno l'ha cambiata)
  for (const bucket of ["uploads", "private"]) {
    for (let i = 0; i < 20; i++) {
      const { data } = await db.storage.from(bucket).list(tenantId, { limit: 1000 });
      if (!data?.length) break;
      await db.storage.from(bucket).remove(data.map((f) => `${tenantId}/${f.name}`));
      if (data.length < 1000) break;
    }
  }
  if (process.env.DEMO_PASSWORD) await db.auth.admin.updateUserById(tenantId, { password: process.env.DEMO_PASSWORD }).catch(() => {});
  return rows.length;
}
