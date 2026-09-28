// Importazione da Excel/CSV: riconoscimento delle colonne e conversione delle righe per ogni tipo di dato.
import { findDuplicates, displayName } from "@/lib/contacts";
import { validateContact, isValidCodiceFiscale } from "@/lib/validators";

/** Intestazione normalizzata: minuscole, senza accenti, spazi e simboli. */
export const headerKey = (h) => String(h ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

/** Date da Excel (numero seriale), "gg/mm/aaaa", "gg-mm-aa" o "aaaa-mm-gg" → "aaaa-mm-gg". */
export function toIsoDate(v) {
  if (v === "" || v == null) return "";
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = clean(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "";
}

/** "1.234,50 €" → 1234.5 */
export function toNumber(v) {
  if (typeof v === "number") return v;
  let s = clean(v).replace(/[€\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const CONTACT_COLUMNS = {
  tipo: "tipo", ragionesociale: "nome", denominazione: "nome", azienda: "nome", societa: "nome", cliente: "nome", fornitore: "nome",
  nome: "nome_privato", nomecognome: "nome_privato", nomeecognome: "nome_privato", cognomenome: "nome_privato", cognomeenome: "nome_privato", referente: "nome_privato",
  partitaiva: "partita_iva", piva: "partita_iva", pi: "partita_iva",
  codicefiscale: "codice_fiscale", cf: "codice_fiscale",
  indirizzo: "indirizzo", via: "indirizzo", cap: "cap", citta: "citta", comune: "citta", localita: "citta",
  provincia: "provincia", prov: "provincia", telefono: "telefono", tel: "telefono", cellulare: "cellulare", cell: "cellulare",
  email: "email", mail: "email", pec: "pec", sdi: "codice_sdi", codicesdi: "codice_sdi", codicedestinatario: "codice_sdi",
  iban: "iban", note: "note", categoria: "categorie", categorie: "categorie",
};

const EMPLOYEE_COLUMNS = {
  nome: "nome", cognome: "cognome", nomecognome: "nome_completo", nomeecognome: "nome_completo", cognomenome: "cognome_nome", cognomeenome: "cognome_nome",
  dipendente: "nome_completo", nominativo: "nome_completo", lavoratore: "nome_completo",
  codicefiscale: "codice_fiscale", cf: "codice_fiscale", datadinascita: "data_nascita", datanascita: "data_nascita", natoil: "data_nascita",
  luogodinascita: "luogo_nascita", luogonascita: "luogo_nascita", natoa: "luogo_nascita",
  indirizzo: "indirizzo", residenza: "indirizzo", telefono: "telefono", cellulare: "cellulare", cell: "cellulare", email: "email", mail: "email",
  mansione: "ruolo", ruolo: "ruolo", qualifica: "qualifica", livello: "livello", ccnl: "ccnl", contratto: "tipo_contratto", tipocontratto: "tipo_contratto",
  dataassunzione: "data_assunzione", assunzione: "data_assunzione", assuntoil: "data_assunzione", scadenzacontratto: "data_fine_contratto",
  costoorario: "costo_orario", costo: "costo_orario", matricola: "matricola", iban: "iban", oresettimanali: "ore_settimanali", note: "note",
};

const WORKSITE_COLUMNS = {
  nome: "nome", lavoro: "nome", cantiere: "nome", commessa: "nome", descrizione: "nome", indirizzo: "indirizzo", luogo: "indirizzo",
  cliente: "cliente", committente: "cliente", stato: "stato", importo: "importo_totale", importocontratto: "importo_totale", totale: "importo_totale",
  inizio: "data_inizio", datainizio: "data_inizio", fine: "data_fine_prevista", datafine: "data_fine_prevista", fineprevista: "data_fine_prevista",
  tipointervento: "tipo_intervento", tipo: "tipo_intervento", note: "note",
};

const stateOf = (v) => (/fin|chius|conclus|termin/i.test(v) ? "finito" : /cors|aper|attiv/i.test(v) ? "in_corso" : "da_iniziare");

export const IMPORTERS = {
  contatti: {
    entity: "Contact",
    label: "clienti e fornitori",
    columns: CONTACT_COLUMNS,
    required: ["nome", "nome_privato"],
    requiredHint: "una colonna \"Ragione sociale\" o \"Nome\"",
    template: {
      name: "modello-clienti-talo.xlsx",
      headers: ["Tipo", "Ragione sociale", "Nome", "Partita IVA", "Codice fiscale", "Indirizzo", "CAP", "Città", "Provincia", "Telefono", "Cellulare", "Email", "PEC", "Codice SDI", "IBAN", "Categorie", "Note"],
      example: ["Cliente", "Edil Verdi Srl", "", "01234567897", "", "Via Roma 1", "39100", "Bolzano", "BZ", "0471 123456", "", "info@edilverdi.it", "", "ABC1234", "", "Impresa", ""],
    },
    preview: [["Nome", (d) => d.nome || d.nome_privato], ["P.IVA / CF", (d) => d.partita_iva || d.codice_fiscale], ["Città", (d) => d.citta]],
    toRecord(raw) {
      const d = { tipo: "cliente", categorie: [] };
      for (const [f, v] of Object.entries(raw)) {
        const s = clean(v);
        if (!s) continue;
        if (f === "categorie") d.categorie = s.split(/[,|;]/).map((x) => x.trim()).filter(Boolean);
        else if (f === "tipo") d.tipo = /forn/i.test(s) ? "fornitore" : /entramb/i.test(s) ? "entrambi" : "cliente";
        else d[f] = s;
      }
      d.tipo_soggetto = d.nome ? "azienda" : "privato";
      return d;
    },
    check(d, seen) {
      const issues = [];
      if (!d.nome && !d.nome_privato) return { issues: ["nome mancante"], skip: true };
      issues.push(...Object.values(validateContact(d)));
      // le righe già lette dal file non hanno id: serve un id da escludere che non esiste
      const dup = findDuplicates(seen, d, "__nessuno__");
      if (dup.length) return { issues: [...issues, `già presente (${dup[0].field})`], skip: true };
      return { issues, skip: false };
    },
  },

  dipendenti: {
    entity: "Employee",
    label: "dipendenti",
    columns: EMPLOYEE_COLUMNS,
    required: ["nome", "cognome", "nome_completo", "cognome_nome"],
    requiredHint: "le colonne \"Nome\" e \"Cognome\" (oppure \"Nome e cognome\")",
    template: {
      name: "modello-dipendenti-talo.xlsx",
      headers: ["Nome", "Cognome", "Codice fiscale", "Data di nascita", "Luogo di nascita", "Mansione", "Qualifica", "Livello", "CCNL", "Tipo contratto", "Data assunzione", "Costo orario", "Cellulare", "Email", "IBAN", "Note"],
      example: ["Mario", "Rossi", "RSSMRA80A01H501U", "01/01/1980", "Roma", "Muratore", "Operaio specializzato", "3", "Edilizia industria", "Indeterminato", "15/03/2020", "28,50", "333 1234567", "", "", ""],
    },
    preview: [["Nome", (d) => `${d.nome || ""} ${d.cognome || ""}`.trim()], ["Mansione", (d) => d.ruolo || d.qualifica], ["Assunto il", (d) => d.data_assunzione && new Date(d.data_assunzione).toLocaleDateString("it-IT")]],
    toRecord(raw) {
      const d = { stato: "attivo" };
      for (const [f, v] of Object.entries(raw)) {
        if (v === "" || v == null) continue;
        if (["data_nascita", "data_assunzione", "data_fine_contratto"].includes(f)) { const iso = toIsoDate(v); if (iso) d[f] = iso; continue; }
        if (["costo_orario", "ore_settimanali"].includes(f)) { const n = toNumber(v); if (n != null) d[f] = n; continue; }
        d[f] = clean(v);
      }
      // "Mario Rossi" o "ROSSI MARIO"
      if (d.nome_completo && !d.nome) { const p = d.nome_completo.split(" "); d.nome = p.slice(0, -1).join(" ") || p[0]; d.cognome = p.length > 1 ? p.at(-1) : ""; }
      if (d.cognome_nome && !d.nome) { const p = d.cognome_nome.split(" "); d.cognome = p[0]; d.nome = p.slice(1).join(" "); }
      delete d.nome_completo; delete d.cognome_nome;
      if (d.codice_fiscale) d.codice_fiscale = d.codice_fiscale.toUpperCase().replace(/\s/g, "");
      return d;
    },
    check(d, seen) {
      if (!d.nome && !d.cognome) return { issues: ["nome mancante"], skip: true };
      const issues = [];
      if (d.codice_fiscale && !isValidCodiceFiscale(d.codice_fiscale)) issues.push("codice fiscale non valido");
      const same = seen.find((e) => (d.codice_fiscale && e.codice_fiscale?.toUpperCase() === d.codice_fiscale)
        || (`${e.nome} ${e.cognome}`.toLowerCase().trim() === `${d.nome} ${d.cognome}`.toLowerCase().trim()));
      if (same) return { issues: [...issues, "già presente"], skip: true };
      return { issues, skip: false };
    },
  },

  lavori: {
    entity: "Worksite",
    label: "lavori",
    columns: WORKSITE_COLUMNS,
    required: ["nome"],
    requiredHint: "una colonna \"Nome\" (o \"Cantiere\", \"Lavoro\")",
    template: {
      name: "modello-lavori-talo.xlsx",
      headers: ["Nome", "Cliente", "Indirizzo", "Stato", "Importo", "Inizio", "Fine prevista", "Tipo intervento", "Note"],
      example: ["Ristrutturazione Villa Bianchi", "Mario Bianchi", "Via dei Colli 3, Bolzano", "In corso", "85.000", "01/09/2026", "20/12/2026", "Ristrutturazione", ""],
    },
    preview: [["Lavoro", (d) => d.nome], ["Cliente", (d) => d.cliente_nome], ["Importo", (d) => d.importo_totale != null ? `${d.importo_totale.toLocaleString("it-IT")} €` : ""]],
    toRecord(raw, ctx = {}) {
      const d = { stato: "da_iniziare" };
      for (const [f, v] of Object.entries(raw)) {
        if (v === "" || v == null) continue;
        if (["data_inizio", "data_fine_prevista"].includes(f)) { const iso = toIsoDate(v); if (iso) d[f] = iso; continue; }
        if (f === "importo_totale") { const n = toNumber(v); if (n != null) d[f] = n; continue; }
        if (f === "stato") { d.stato = stateOf(clean(v)); continue; }
        d[f] = clean(v);
      }
      if (d.cliente) {
        const c = (ctx.contacts || []).find((x) => displayName(x).toLowerCase() === d.cliente.toLowerCase());
        d.cliente_nome = c ? displayName(c) : d.cliente;
        if (c) d.cliente_id = c.id;
        delete d.cliente;
      }
      d.attivo = d.stato !== "finito";
      return d;
    },
    check(d, seen) {
      if (!d.nome) return { issues: ["nome mancante"], skip: true };
      if (seen.some((w) => clean(w.nome).toLowerCase() === d.nome.toLowerCase())) return { issues: ["già presente"], skip: true };
      return { issues: d.cliente_nome && !d.cliente_id ? ["cliente non in rubrica: solo il nome"] : [], skip: false };
    },
  },
};

/** Righe del foglio → record pronti con avvisi. Restituisce null se manca la colonna obbligatoria. */
export function parseRows(kind, table, ctx = {}) {
  const cfg = IMPORTERS[kind];
  // intestazione: la prima riga (entro le prime 10) che contiene una colonna obbligatoria
  let headerRow = -1;
  let cols = [];
  for (let r = 0; r < Math.min(10, table.length); r++) {
    const c = (table[r] || []).map((h) => cfg.columns[headerKey(h)] || null);
    if (cfg.required.some((f) => c.includes(f))) { headerRow = r; cols = c; break; }
  }
  if (headerRow < 0) return null;
  const seen = [...(ctx.existing || [])];
  return table.slice(headerRow + 1)
    .filter((r) => (r || []).some((v) => clean(v)))
    .map((r) => {
      const raw = {};
      cols.forEach((f, i) => { if (f && raw[f] == null) raw[f] = r[i]; });
      const data = cfg.toRecord(raw, ctx);
      const { issues, skip } = cfg.check(data, seen);
      if (!skip) seen.push(data);
      return { data, issues, skip };
    });
}
