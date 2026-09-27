// Dipendenti: catalogo formazione sicurezza (D.Lgs. 81/08 e Accordi Stato-Regioni),
// visite mediche, conformità e utilità.

// validita_anni: null = nessuna scadenza. obbligatorio: richiesto a ogni lavoratore di cantiere.
export const CORSI = [
  { codice: "generale", nome: "Formazione generale lavoratori", ore: 4, validita_anni: null, obbligatorio: true },
  { codice: "specifica_alto", nome: "Formazione specifica rischio alto (edilizia)", ore: 12, validita_anni: 5, obbligatorio: true },
  { codice: "preposto", nome: "Preposto", ore: 12, validita_anni: 2 },
  { codice: "antincendio", nome: "Addetto antincendio", ore: 8, validita_anni: 5 },
  { codice: "primo_soccorso", nome: "Addetto primo soccorso", ore: 16, validita_anni: 3 },
  { codice: "quota_dpi3", nome: "Lavori in quota e DPI anticaduta (III cat.)", ore: 8, validita_anni: 5 },
  { codice: "ponteggi", nome: "Montaggio e smontaggio ponteggi (PiMUS)", ore: 28, validita_anni: 4 },
  { codice: "ple", nome: "Piattaforme di lavoro elevabili (PLE)", ore: 10, validita_anni: 5 },
  { codice: "carrellisti", nome: "Carrelli elevatori", ore: 12, validita_anni: 5 },
  { codice: "mmt", nome: "Macchine movimento terra (escavatori, pale)", ore: 16, validita_anni: 5 },
  { codice: "gru", nome: "Gru su autocarro / gru a torre", ore: 12, validita_anni: 5 },
  { codice: "spazi_confinati", nome: "Ambienti confinati", ore: 12, validita_anni: 5 },
  { codice: "rls", nome: "Rappresentante dei lavoratori (RLS)", ore: 32, validita_anni: 1 },
  { codice: "pes_pav", nome: "Lavori elettrici PES/PAV", ore: 16, validita_anni: 5 },
  { codice: "altro", nome: "Altro corso", ore: null, validita_anni: null },
];

export const VISITA = { codice: "visita_medica", nome: "Visita medica (sorveglianza sanitaria)", validita_anni: 1 };

export const TIPI_CONTRATTO = [
  "Tempo indeterminato", "Tempo determinato", "Apprendistato", "Part-time", "Stagionale",
  "Somministrazione", "Collaborazione", "Prestazione occasionale", "Tirocinio",
];

export const CCNL = ["Edilizia Industria", "Edilizia Artigianato", "Edilizia PMI (Confapi)", "Metalmeccanici Industria", "Metalmeccanici Artigianato", "Impianti elettrici e idraulici (Artigianato)", "Altro"];

export const PATENTI = ["B", "C", "CE", "D", "CQC merci", "Patentino gru", "Patentino PLE", "Patentino muletto", "Patentino escavatore"];

export const DPI_ARTICOLI = [
  "Casco di protezione", "Scarpe antinfortunistiche S3", "Guanti da lavoro", "Occhiali protettivi", "Otoprotettori",
  "Mascherina FFP2/FFP3", "Imbracatura anticaduta", "Cordino con assorbitore", "Gilet/giubbino alta visibilità",
  "Pantaloni da lavoro", "Giacca da lavoro", "Tuta monouso",
];

export const fullName = (e) => `${e?.nome || ""} ${e?.cognome || ""}`.trim() || "Senza nome";

export const initials = (e) => `${(e?.nome || "")[0] || ""}${(e?.cognome || "")[0] || ""}`.toUpperCase() || "?";

export function addYears(dateStr, years) {
  if (!dateStr || !years) return "";
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + Number(years));
  return d.toISOString().slice(0, 10);
}

const today = () => new Date(new Date().toDateString());
const daysTo = (dateStr) => Math.ceil((new Date(dateStr) - today()) / 86_400_000);

/**
 * Conformità alla sicurezza di un dipendente in base ai suoi documenti.
 * Per ogni corso (e per la visita medica) conta solo l'attestato più recente:
 * un corso scaduto ma già rinnovato non è un problema.
 * Restituisce { livello: "ok"|"attenzione"|"critico", problemi: [{livello, testo}], prossima }
 */
export function compliance(employee, docs = []) {
  const problems = [];
  const groups = new Map();
  for (const d of docs) {
    const key = d.tipo === "corso" ? `corso:${d.corso_codice || d.titolo}` : d.tipo === "visita_medica" ? "visita" : `doc:${d.id}`;
    const prev = groups.get(key);
    // Senza scadenza = valido per sempre, vince su qualsiasi data.
    const better = !prev || (prev.data_scadenza && (!d.data_scadenza || d.data_scadenza > prev.data_scadenza));
    if (better) groups.set(key, d);
  }
  const current = [...groups.values()];

  for (const d of current) {
    if (!d.data_scadenza) continue;
    const n = daysTo(d.data_scadenza);
    if (n < 0) problems.push({ livello: "critico", testo: `${d.titolo} scaduto il ${new Date(d.data_scadenza).toLocaleDateString("it-IT")}` });
    else if (n <= 30) problems.push({ livello: "attenzione", testo: `${d.titolo} scade tra ${n} giorni` });
  }
  for (const c of CORSI.filter((x) => x.obbligatorio)) {
    if (!groups.has(`corso:${c.codice}`)) problems.push({ livello: "critico", testo: `Manca: ${c.nome}` });
  }
  if (!groups.has("visita")) problems.push({ livello: "critico", testo: "Manca la visita medica di idoneità" });

  if (employee?.permesso_soggiorno_scadenza) {
    const n = daysTo(employee.permesso_soggiorno_scadenza);
    if (n < 0) problems.push({ livello: "critico", testo: "Permesso di soggiorno scaduto" });
    else if (n <= 60) problems.push({ livello: "attenzione", testo: `Permesso di soggiorno scade tra ${n} giorni` });
  }
  if (employee?.data_fine_contratto) {
    const n = daysTo(employee.data_fine_contratto);
    if (n >= 0 && n <= 30) problems.push({ livello: "attenzione", testo: `Contratto in scadenza tra ${n} giorni` });
  }

  const livello = problems.some((p) => p.livello === "critico") ? "critico" : problems.length ? "attenzione" : "ok";
  const upcoming = current.filter((d) => d.data_scadenza && daysTo(d.data_scadenza) >= 0).sort((x, y) => x.data_scadenza.localeCompare(y.data_scadenza))[0];
  return { livello, problemi: problems, prossima: upcoming ? { titolo: upcoming.titolo, data: upcoming.data_scadenza } : null };
}

export const COMPLIANCE_STYLE = {
  ok: { label: "In regola", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  attenzione: { label: "Scadenze vicine", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-900 border-amber-200" },
  critico: { label: "Non in regola", dot: "bg-red-500", badge: "bg-red-50 text-red-800 border-red-200" },
};

export const seniority = (dateStr) => {
  if (!dateStr) return null;
  const months = Math.floor((today() - new Date(dateStr)) / (30.44 * 86_400_000));
  if (months < 1) return "meno di un mese";
  if (months < 12) return `${months} ${months === 1 ? "mese" : "mesi"}`;
  const y = Math.floor(months / 12);
  return `${y} ${y === 1 ? "anno" : "anni"}`;
};
