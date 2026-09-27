import { db } from "@/lib/db";
import { getAccessContext } from "@/lib/accessScope";

// Modello IA avanzato per il ragionamento dell'assistente
export const ASSISTANT_MODEL = "claude_sonnet_4_6";

const safe = (p) => p.then(r => r).catch(() => []);

/**
 * Costruisce un indice compatto di TUTTI i record accessibili dall'utente.
 * I permessi sono già applicati dal wrapper db (accessScope): per responsabile
 * viene filtrato per branch_id, per operaio solo i propri dati.
 * I costi/importi sono nascosti per gli operai.
 */
export async function buildSearchIndex() {
  const ctx = getAccessContext();
  const isOperaio = ctx.accessLevel === "operaio";
  const showCosti = !isOperaio;

  if (isOperaio) {
    const [employees, empDocs, attendance] = await Promise.all([
      safe(db.Employee.list()),
      safe(db.EmployeeDocument.list()),
      safe(db.DailyAttendance.list()),
    ]);
    const items = [];
    employees.forEach(e =>
      items.push(rec(e.id, "dipendente", `${e.nome} ${e.cognome}`, e.ruolo || "Dipendente", `${e.nome} ${e.cognome} ${e.ruolo || ""} ${e.email || ""} ${e.telefono || ""}`))
    );
    empDocs.forEach(d => {
      const emp = employees.find(e => e.id === d.dipendente_id);
      items.push(rec(d.id, "documento_dipendente", d.titolo, emp ? `${emp.nome} ${emp.cognome}` : "Non associato", `${d.titolo} ${d.tipo} ${d.descrizione || ""}`, { scadenza: d.data_scadenza, url: d.file_url }));
    });
    attendance.forEach(a =>
      items.push(rec(a.id, "presenze", `Presenze ${a.data}`, a.cantiere_nome || "", `${a.data} ${a.cantiere_nome || ""} ${a.note || ""}`))
    );
    return { items, showCosti, isOperaio, grouped: groupByType(items) };
  }

  const [employees, empDocs, compDocs, contacts, quotes, worksites, contracts, receivedQuotes, invoices, reminders, transactions] = await Promise.all([
    safe(db.Employee.list()),
    safe(db.EmployeeDocument.list()),
    safe(db.CompanyDocument.list()),
    safe(db.Contact.list()),
    safe(db.Quote.list()),
    safe(db.Worksite.list()),
    safe(db.GeneratedContract.list()),
    safe(db.ReceivedQuote.list()),
    safe(db.Invoice.list()),
    safe(db.Reminder.list()),
    safe(db.WorksiteTransaction.list()),
  ]);

  const items = [];
  employees.forEach(e =>
    items.push(rec(e.id, "dipendente", `${e.nome} ${e.cognome}`, e.ruolo || "Dipendente", `${e.nome} ${e.cognome} ${e.ruolo || ""} ${e.email || ""} ${e.telefono || ""}`))
  );
  empDocs.forEach(d => {
    const emp = employees.find(e => e.id === d.dipendente_id);
    items.push(rec(d.id, "documento_dipendente", d.titolo, emp ? `${emp.nome} ${emp.cognome}` : "Non associato", `${d.titolo} ${d.tipo} ${d.descrizione || ""}`, { scadenza: d.data_scadenza, url: d.file_url }));
  });
  compDocs.forEach(d =>
    items.push(rec(d.id, "documento_ditta", d.titolo, d.tipo || "Documento", `${d.titolo} ${d.tipo} ${d.descrizione || ""}`, { scadenza: d.data_scadenza, url: d.file_url }))
  );
  contacts.forEach(c =>
    items.push(rec(c.id, c.tipo === "cliente" ? "cliente" : "fornitore", c.nome, c.tipo || "", `${c.nome} ${c.email || ""} ${c.telefono || ""} ${c.citta || ""}`))
  );
  quotes.forEach(q =>
    items.push(rec(q.id, "preventivo", `Preventivo ${q.numero || ""}`.trim(), q.cliente_nome || q.oggetto || "", `${q.numero || ""} ${q.cliente_nome || ""} ${q.oggetto || ""} ${q.stato}`, { stato: q.stato, data: q.data, ...(showCosti && q.totale != null ? { totale: q.totale } : {}) }))
  );
  worksites.forEach(w =>
    items.push(rec(w.id, "lavoro", w.nome, w.stato || "", `${w.nome} ${w.indirizzo || ""} ${w.cliente_nome || ""} ${w.stato}`, { stato: w.stato, ...(showCosti && w.importo_totale != null ? { importo: w.importo_totale } : {}) }))
  );
  contracts.forEach(c =>
    items.push(rec(c.id, "contratto", c.titolo, c.controparte_nome || c.tipo || "", `${c.titolo} ${c.controparte_nome || ""} ${c.tipo || ""}`, { data: c.data_creazione }))
  );
  receivedQuotes.forEach(r =>
    items.push(rec(r.id, "preventivo_ricevuto", `Preventivo da ${r.fornitore || ""}`, r.descrizione || "", `${r.fornitore || ""} ${r.descrizione || ""}`, { stato: r.stato, data: r.data, url: r.file_url, ...(showCosti && r.importo != null ? { importo: r.importo } : {}) }))
  );
  invoices.forEach(i =>
    items.push(rec(i.id, "fattura", `Fattura ${i.numero || ""}`.trim(), i.cliente_nome || i.oggetto || "", `${i.numero || ""} ${i.cliente_nome || ""} ${i.oggetto || ""} ${i.stato}`, { stato: i.stato, data: i.data, ...(showCosti && i.totale != null ? { totale: i.totale } : {}) }))
  );
  reminders.forEach(r =>
    items.push(rec(r.id, "promemoria", r.titolo, r.tipo || "", `${r.titolo} ${r.descrizione || ""} ${r.tipo || ""}`, { data: r.data, completato: r.completato }))
  );
  transactions.forEach(t =>
    items.push(rec(t.id, "movimento", `${t.tipo} ${t.worksite_nome || ""}`.trim(), t.categoria || t.descrizione || "", `${t.worksite_nome || ""} ${t.tipo} ${t.categoria || ""} ${t.descrizione || ""}`, { data: t.data, ...(showCosti && t.importo != null ? { importo: t.importo } : {}) }))
  );

  return { items, showCosti, isOperaio, grouped: groupByType(items) };
}

function groupByType(items) {
  const groups = {};
  for (const it of items) {
    if (!groups[it.type]) groups[it.type] = [];
    groups[it.type].push(it);
  }
  return groups;
}

// --- Normalizzazione e fuzzy matching nomi ---

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Verifica se un nome cercato corrisponde a uno o più target.
 * Gestisce: maiuscole/minuscole, accenti, nome/cognome invertiti, corrispondenze parziali.
 */
function nameMatches(searchName, ...targetNames) {
  const sn = normalize(searchName);
  if (!sn) return false;
  const parts = sn.split(" ").filter(p => p.length > 1);

  return targetNames.some(target => {
    const tn = normalize(target);
    if (!tn) return false;
    if (tn.includes(sn) || sn.includes(tn)) return true;
    if (parts.length > 0 && parts.every(p => tn.includes(p))) return true;
    const targetParts = tn.split(" ").filter(p => p.length > 1);
    if (targetParts.length > 0 && targetParts.every(p => sn.includes(p))) return true;
    return false;
  });
}

/**
 * Ricerca comprehensiva di una persona per nome.
 * Cerca in TUTTE le sezioni: dipendenti, documenti (dipendente + ditta),
 * contratti, contatti, presenze, cantieri, preventivi ricevuti.
 * Usa fuzzy matching programmatico (non dipende dal LLM per gli ID).
 */
export async function searchPersonComprehensive(nomePersona) {
  const ctx = getAccessContext();
  const isOperaio = ctx.accessLevel === "operaio";
  const showCosti = !isOperaio;

  const [employees, empDocs, compDocs, attendance, worksites, contracts, contacts, receivedQuotes] = await Promise.all([
    safe(db.Employee.list()),
    safe(db.EmployeeDocument.list()),
    safe(db.CompanyDocument.list()),
    safe(db.DailyAttendance.list()),
    safe(db.Worksite.list()),
    safe(db.GeneratedContract.list()),
    safe(db.Contact.list()),
    safe(db.ReceivedQuote.list()),
  ]);

  // --- Caso operaio: vede solo i propri dati ---
  if (isOperaio) {
    if (employees.length === 0) return { notFound: true, name: nomePersona };
    const emp = employees[0];
    const matches = nameMatches(nomePersona, `${emp.nome} ${emp.cognome}`, `${emp.cognome} ${emp.nome}`, emp.nome, emp.cognome);
    if (!matches) return { permissionDenied: true };

    const docs = empDocs.filter(d => d.dipendente_id === emp.id).map(d => ({ ...d, source_type: "EmployeeDocument" }));
    const nameDocs = [
      ...empDocs.filter(d => d.dipendente_id !== emp.id && nameMatches(nomePersona, d.titolo, d.descrizione)).map(d => ({ ...d, source_type: "EmployeeDocument" })),
      ...compDocs.filter(d => nameMatches(nomePersona, d.titolo, d.descrizione)).map(d => ({ ...d, source_type: "CompanyDocument" })),
    ];
    const allDocs = [...docs, ...nameDocs];
    const docIds = new Set();
    const uniqueDocs = allDocs.filter(d => !docIds.has(d.id) && docIds.add(d.id));
    const unlinkedDocIds = nameDocs.map(d => d.id);

    const att = attendance.filter(rec => rec.presenze?.some(p => p.dipendente_id === emp.id));
    const ws = worksites.filter(w => w.responsabile_id === emp.id);
    return {
      profiles: [{
        employee: emp, documents: uniqueDocs, attendanceRecords: att, worksites: ws,
        contracts: [], contacts: [], showCosti: false, searchedName: nomePersona, unlinkedDocIds,
      }],
    };
  }

  // --- Fuzzy match dipendenti ---
  const matchedEmployees = employees.filter(e =>
    nameMatches(nomePersona, `${e.nome} ${e.cognome}`, `${e.cognome} ${e.nome}`, e.nome, e.cognome)
  );

  // Match indipendenti: contratti, contatti, documenti per nome
  const matchedContracts = contracts.filter(c =>
    nameMatches(nomePersona, c.controparte_nome) ||
    nameMatches(nomePersona, JSON.stringify(c.dati_compilati || {}))
  );
  const matchedContacts = contacts.filter(c => nameMatches(nomePersona, c.nome));

  // Documenti trovati per nome (non collegati per ID)
  const empDocsByName = empDocs.filter(d => nameMatches(nomePersona, d.titolo, d.descrizione));
  const compDocsByName = compDocs.filter(d => nameMatches(nomePersona, d.titolo, d.descrizione));
  const receivedQuotesByName = receivedQuotes.filter(r => nameMatches(nomePersona, r.fornitore, r.descrizione));

  // Se nessun match diretto, cerca di recuperare dipendenti dai documenti/contratti trovati per nome
  if (matchedEmployees.length === 0) {
    // Nessuna persona trovata in nessuna sezione
    const allNameDocs = [...empDocsByName, ...compDocsByName];
    if (matchedContracts.length === 0 && matchedContacts.length === 0 && allNameDocs.length === 0 && receivedQuotesByName.length === 0) {
      return { notFound: true, name: nomePersona };
    }
    // Trovati documenti/contratti per nome ma nessuna scheda dipendente
    const taggedDocs = [
      ...empDocsByName.map(d => ({ ...d, source_type: "EmployeeDocument" })),
      ...compDocsByName.map(d => ({ ...d, source_type: "CompanyDocument" })),
    ];
    return {
      notFoundPerson: true,
      name: nomePersona,
      unlinkedDocuments: taggedDocs,
      unlinkedContracts: matchedContracts,
      unlinkedContacts: matchedContacts,
      unlinkedReceivedQuotes: receivedQuotesByName,
    };
  }

  // --- Costruzione profili per ogni dipendente matched ---
  const profiles = matchedEmployees.map(emp => {
    const empName = `${emp.nome} ${emp.cognome}`;

    // Documenti collegati per ID
    const linkedEmpDocs = empDocs.filter(d => d.dipendente_id === emp.id).map(d => ({ ...d, source_type: "EmployeeDocument" }));
    const linkedCompDocs = compDocs.filter(d => d.dipendente_id === emp.id).map(d => ({ ...d, source_type: "CompanyDocument" }));

    // Documenti trovati per nome (questo dipendente) ma non collegati per ID
    const nameMatchedEmpDocs = empDocs.filter(d =>
      d.dipendente_id !== emp.id && nameMatches(empName, d.titolo, d.descrizione)
    ).map(d => ({ ...d, source_type: "EmployeeDocument" }));
    const nameMatchedCompDocs = compDocs.filter(d =>
      d.dipendente_id !== emp.id && nameMatches(empName, d.titolo, d.descrizione)
    ).map(d => ({ ...d, source_type: "CompanyDocument" }));

    const allDocs = [...linkedEmpDocs, ...linkedCompDocs, ...nameMatchedEmpDocs, ...nameMatchedCompDocs];
    const docIds = new Set();
    const uniqueDocs = allDocs.filter(d => !docIds.has(d.id) && docIds.add(d.id));
    const unlinkedDocIds = [...nameMatchedEmpDocs, ...nameMatchedCompDocs].map(d => d.id);

    const att = attendance.filter(rec => rec.presenze?.some(p => p.dipendente_id === emp.id));
    const ws = worksites.filter(w => w.responsabile_id === emp.id);

    // Contratti collegati a questo dipendente
    const empContracts = contracts.filter(c => {
      const controparte = c.controparte_nome || "";
      const datiStr = JSON.stringify(c.dati_compilati || {});
      return nameMatches(empName, controparte) || datiStr.toLowerCase().includes(empName.toLowerCase()) || datiStr.includes(emp.id);
    });

    // Contatti corrispondenti a questo dipendente
    const empContacts = contacts.filter(c => nameMatches(empName, c.nome));

    return {
      employee: emp, documents: uniqueDocs, attendanceRecords: att, worksites: ws,
      contracts: empContracts, contacts: empContacts, showCosti, searchedName: nomePersona, unlinkedDocIds,
    };
  });

  // Contratti/contatti trovati per nome ma non collegati a nessun dipendente matched
  const linkedContractIds = profiles.flatMap(p => p.contracts.map(c => c.id));
  const unlinkedContracts = matchedContracts.filter(c => !linkedContractIds.includes(c.id));
  const linkedContactIds = profiles.flatMap(p => p.contacts.map(c => c.id));
  const unlinkedContacts = matchedContacts.filter(c => !linkedContactIds.includes(c.id));

  return { profiles, unlinkedContracts, unlinkedContacts, showCosti, searchedName: nomePersona };
}

/**
 * Collega un documento a un dipendente (permette all'IA di associare documenti non collegati).
 */
export async function linkDocumentToEmployee(docId, docType, employeeId, employeeName) {
  if (docType === "EmployeeDocument") {
    return db.EmployeeDocument.update(docId, { dipendente_id: employeeId });
  } else if (docType === "CompanyDocument") {
    return db.CompanyDocument.update(docId, { dipendente_id: employeeId, dipendente_nome: employeeName });
  }
  throw new Error("Tipo documento non supportato per il collegamento");
}

// Etichette leggibili per i tipi di record
export const TYPE_LABELS = {
  dipendente: "Dipendente",
  documento_dipendente: "Doc. Dipendente",
  documento_ditta: "Doc. Ditta",
  cliente: "Cliente",
  fornitore: "Fornitore",
  preventivo: "Preventivo",
  lavoro: "Lavoro",
  contratto: "Contratto",
  preventivo_ricevuto: "Prev. Ricevuto",
  fattura: "Fattura",
  promemoria: "Promemoria",
  movimento: "Movimento",
  presenze: "Presenze",
};

function rec(id, type, title, subtitle, search, extra = {}) {
  return { id, type, title, subtitle, search, ...extra };
}