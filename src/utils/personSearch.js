import { db, base44 } from "@/lib/db";
import { getAccessContext } from "@/lib/accessScope";

export async function searchPerson(nomePersona) {
  const accessCtx = getAccessContext();
  const isOperaio = accessCtx.accessLevel === "operaio";

  const [employees, empDocs, attendance, worksites] = await Promise.all([
    db.Employee.list(),
    db.EmployeeDocument.list(),
    db.DailyAttendance.list(),
    db.Worksite.list(),
  ]);

  let contracts = [];
  let contacts = [];
  if (!isOperaio) {
    [contracts, contacts] = await Promise.all([
      db.GeneratedContract.list(),
      db.Contact.list(),
    ]);
  }

  if (isOperaio) {
    if (employees.length === 0) {
      return { notFound: true, name: nomePersona };
    }
    const emp = employees[0];
    const fullName = `${emp.nome} ${emp.cognome}`.toLowerCase();
    const nameLower = nomePersona.toLowerCase().trim();
    const matches =
      fullName.includes(nameLower) || nameLower.includes(fullName) ||
      nameLower.includes(emp.nome?.toLowerCase()) || nameLower.includes(emp.cognome?.toLowerCase()) ||
      emp.nome?.toLowerCase().includes(nameLower) || emp.cognome?.toLowerCase().includes(nameLower);
    if (!matches) {
      return { permissionDenied: true };
    }
    const docs = empDocs.filter(d => d.dipendente_id === emp.id);
    const att = attendance.filter(rec => rec.presenze?.some(p => p.dipendente_id === emp.id));
    const ws = worksites.filter(w => w.responsabile_id === emp.id);
    return {
      profiles: [{ employee: emp, documents: docs, attendanceRecords: att, worksites: ws, contracts: [], contacts: [], showCosti: false }],
    };
  }

  const matchResult = await base44.integrations.Core.InvokeLLM({
    prompt: `Trova tutti i record collegati alla persona: "${nomePersona}".
    Dipendenti: ${JSON.stringify(employees.map(e => ({ id: e.id, nome: e.nome, cognome: e.cognome })))}
    Contratti generati: ${JSON.stringify(contracts.map(c => ({ id: c.id, titolo: c.titolo, controparte: c.controparte_nome, dati: c.dati_compilati })))}
    Contatti: ${JSON.stringify(contacts.map(c => ({ id: c.id, nome: c.nome })))}

    Identifica TUTTI i record che si riferiscono a questa persona.
    Considera: corrispondenza esatta, parziale, nome invertito (cognome nome), diminutivi, e nome presente dentro i dati/contenuto dei contratti.
    Sii inclusivo: se c'e' una ragionevole somiglianza, includilo.
    Rispondi con JSON: {"employee_ids": [...], "contract_ids": [...], "contact_ids": [...]}`,
    response_json_schema: {
      type: "object",
      properties: {
        employee_ids: { type: "array", items: { type: "string" } },
        contract_ids: { type: "array", items: { type: "string" } },
        contact_ids: { type: "array", items: { type: "string" } },
      },
    },
  });

  const matchedEmployees = employees.filter(e => matchResult.employee_ids?.includes(e.id));
  const matchedContracts = contracts.filter(c => matchResult.contract_ids?.includes(c.id));
  const matchedContacts = contacts.filter(c => matchResult.contact_ids?.includes(c.id));

  if (matchedEmployees.length === 0 && matchedContracts.length === 0 && matchedContacts.length === 0) {
    return { notFound: true, name: nomePersona };
  }

  const profiles = matchedEmployees.map(emp => {
    const docs = empDocs.filter(d => d.dipendente_id === emp.id);
    const att = attendance.filter(rec => rec.presenze?.some(p => p.dipendente_id === emp.id));
    const ws = worksites.filter(w => w.responsabile_id === emp.id);
    const empName = `${emp.nome} ${emp.cognome}`.toLowerCase();
    const empContracts = matchedContracts.filter(c => {
      const controparte = c.controparte_nome?.toLowerCase() || "";
      const datiStr = JSON.stringify(c.dati_compilati || {}).toLowerCase();
      return controparte.includes(empName) || datiStr.includes(empName) || datiStr.includes(emp.id);
    });
    const empContacts = matchedContacts.filter(c => {
      const cName = c.nome?.toLowerCase() || "";
      return cName.includes(emp.nome?.toLowerCase()) || cName.includes(emp.cognome?.toLowerCase()) || cName.includes(empName);
    });
    return { employee: emp, documents: docs, attendanceRecords: att, worksites: ws, contracts: empContracts, contacts: empContacts, showCosti: true };
  });

  const linkedContractIds = profiles.flatMap(p => p.contracts.map(c => c.id));
  const unlinkedContracts = matchedContracts.filter(c => !linkedContractIds.includes(c.id));
  const linkedContactIds = profiles.flatMap(p => p.contacts.map(c => c.id));
  const unlinkedContacts = matchedContacts.filter(c => !linkedContactIds.includes(c.id));

  return { profiles, unlinkedContracts, unlinkedContacts, showCosti: true };
}