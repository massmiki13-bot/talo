import React, { useState } from "react";
import { User, FileText, Clock, HardHat, Phone, Mail, MapPin, Calendar, Briefcase, Link2, Loader2 } from "lucide-react";
import DocumentPreview, { DOC_TYPE_LABELS } from "./DocumentPreview";
import ContractCard from "./ContractCard";

const STATO_LABELS = {
  presente: "Presente",
  ferie: "Ferie",
  permesso: "Permesso",
  assente: "Assente",
  malattia: "Malattia",
};

const STATO_COLORS = {
  presente: "bg-green-100 text-green-700",
  ferie: "bg-zinc-200 text-zinc-800",
  permesso: "bg-amber-100 text-amber-700",
  assente: "bg-slate-100 text-slate-600",
  malattia: "bg-red-100 text-red-700",
};

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <span className="text-slate-500">{label}:</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children, count }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand-600" />
        {title}
        {count != null && <span className="text-xs text-slate-400">({count})</span>}
      </h3>
      {children}
    </div>
  );
}

export default function PersonProfileResult({ employee, documents, attendanceRecords, worksites, contracts = [], contacts = [], showCosti, searchedName, unlinkedDocIds = [], onLinkDoc }) {
  const fullName = `${employee.nome} ${employee.cognome}`;
  const [linking, setLinking] = useState({});

  const presenze = [];
  attendanceRecords.forEach(rec => {
    rec.presenze?.forEach(p => {
      if (p.dipendente_id === employee.id) {
        presenze.push({ ...p, data: rec.data, cantiere_nome: rec.cantiere_nome });
      }
    });
  });

  const totalOre = presenze.filter(p => p.stato === "presente").reduce((sum, p) => sum + (p.ore || 0), 0);
  const giorniPresente = presenze.filter(p => p.stato === "presente").length;
  const giorniAssente = presenze.filter(p => ["ferie", "permesso", "malattia"].includes(p.stato)).length;
  const cantieriSet = new Set(presenze.filter(p => p.cantiere_nome).map(p => p.cantiere_nome));

  const docsByType = {};
  documents.forEach(d => {
    const type = d.tipo || "altro";
    if (!docsByType[type]) docsByType[type] = [];
    docsByType[type].push(d);
  });

  presenze.sort((a, b) => new Date(b.data) - new Date(a.data));

  // Riepilogo trovato / non trovato
  const summaryParts = [];
  summaryParts.push("dati anagrafici");
  if (documents.length > 0) summaryParts.push(`${documents.length} document${documents.length === 1 ? "o" : "i"}`);
  if (contracts.length > 0) summaryParts.push(`${contracts.length} contratt${contracts.length === 1 ? "o" : "i"}`);
  if (presenze.length > 0) summaryParts.push(`${presenze.length} presenze`);
  if (worksites.length > 0) summaryParts.push(`${worksites.length} lavor${worksites.length === 1 ? "o" : "i"}`);
  if (contacts.length > 0) summaryParts.push(`${contacts.length} contatt${contacts.length === 1 ? "o" : "i"}`);
  const missingParts = [];
  if (documents.length === 0) missingParts.push("documenti");
  if (contracts.length === 0) missingParts.push("contratti");
  if (presenze.length === 0) missingParts.push("presenze");
  if (worksites.length === 0) missingParts.push("lavori assegnati");
  if (contacts.length === 0) missingParts.push("contatti in rubrica");

  const handleLink = async (doc) => {
    setLinking(prev => ({ ...prev, [doc.id]: true }));
    try {
      await onLinkDoc(doc.id, doc.source_type || "EmployeeDocument", employee.id, fullName);
    } finally {
      setLinking(prev => ({ ...prev, [doc.id]: false }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 rounded-xl p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{fullName}</h2>
            <p className="text-sm text-brand-100">{employee.ruolo || "Dipendente"}</p>
          </div>
        </div>
      </div>

      {/* Riepilogo trovato / non trovato */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-green-700">Trovato:</span> {summaryParts.join(", ")}.
          {missingParts.length > 0 && (
            <span className="text-slate-500"> <span className="font-semibold text-amber-600">Non trovato:</span> {missingParts.join(", ")}.</span>
          )}
        </p>
      </div>

      <Section icon={User} title="Dati Anagrafici">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <InfoRow icon={Calendar} label="Data di nascita" value={employee.data_nascita ? new Date(employee.data_nascita).toLocaleDateString("it-IT") : null} />
          <InfoRow icon={MapPin} label="Luogo di nascita" value={employee.luogo_nascita} />
          <InfoRow icon={FileText} label="Codice Fiscale" value={employee.codice_fiscale} />
          <InfoRow icon={MapPin} label="Indirizzo" value={employee.indirizzo} />
          <InfoRow icon={Phone} label="Telefono" value={employee.telefono} />
          <InfoRow icon={Mail} label="Email" value={employee.email} />
          <InfoRow icon={Briefcase} label="Ruolo" value={employee.ruolo} />
          <InfoRow icon={Calendar} label="Data assunzione" value={employee.data_assunzione ? new Date(employee.data_assunzione).toLocaleDateString("it-IT") : null} />
          <InfoRow icon={FileText} label="Tipo contratto" value={employee.tipo_contratto} />
          {showCosti && <InfoRow icon={Clock} label="Costo orario" value={employee.costo_orario ? `${employee.costo_orario} euro` : null} />}
          {employee.branch_nome && <InfoRow icon={MapPin} label="Sede" value={employee.branch_nome} />}
        </div>
        {employee.note && <p className="text-sm text-slate-600 mt-2 pt-2 border-t border-slate-100">Note: {employee.note}</p>}
      </Section>

      <Section icon={FileText} title="Documenti" count={documents.length}>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-400">Nessun documento trovato per {fullName}.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(docsByType).map(([type, docs]) => (
              <div key={type}>
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">{DOC_TYPE_LABELS[type] || type}</p>
                <div className="space-y-2">
                  {docs.map(d => (
                    <div key={d.id} className="relative">
                      <DocumentPreview doc={d} />
                      {unlinkedDocIds.includes(d.id) && onLinkDoc && (
                        <button
                          onClick={() => handleLink(d)}
                          disabled={linking[d.id]}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium"
                        >
                          {linking[d.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                          Collega a {fullName}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={FileText} title="Contratti" count={contracts.length}>
        {contracts.length === 0 ? (
          <p className="text-sm text-slate-400">Nessun contratto collegato a {fullName}.</p>
        ) : (
          <div className="space-y-2">
            {contracts.map(c => <ContractCard key={c.id} contract={c} />)}
          </div>
        )}
      </Section>

      <Section icon={User} title="Anche in Rubrica" count={contacts.length}>
        {contacts.length === 0 ? (
          <p className="text-sm text-slate-400">Nessun contatto in rubrica per {fullName}.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map(c => (
              <div key={c.id} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-slate-800">{c.nome}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{c.tipo === "cliente" ? "Cliente" : "Fornitore"}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>}
                  {c.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.telefono}</span>}
                  {c.indirizzo && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.indirizzo}</span>}
                  {c.partita_iva && <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> P.IVA {c.partita_iva}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={Clock} title="Presenze e Ore Lavorate">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-brand-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-brand-700">{totalOre.toFixed(1)}</p>
            <p className="text-xs text-slate-500">Ore totali</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{giorniPresente}</p>
            <p className="text-xs text-slate-500">Giorni presente</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{giorniAssente}</p>
            <p className="text-xs text-slate-500">Assenze/permessi</p>
          </div>
        </div>
        {cantieriSet.size > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-slate-500 mb-1">Cantieri:</p>
            <div className="flex flex-wrap gap-1">
              {Array.from(cantieriSet).map(c => (
                <span key={c} className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">{c}</span>
              ))}
            </div>
          </div>
        )}
        {presenze.length > 0 ? (
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="text-left py-1">Data</th>
                  <th className="text-left py-1">Cantiere</th>
                  <th className="text-left py-1">Stato</th>
                  <th className="text-right py-1">Ore</th>
                </tr>
              </thead>
              <tbody>
                {presenze.slice(0, 50).map((p, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1 text-slate-700">{new Date(p.data).toLocaleDateString("it-IT")}</td>
                    <td className="py-1 text-slate-600">{p.cantiere_nome || "-"}</td>
                    <td className="py-1">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${STATO_COLORS[p.stato] || ""}`}>{STATO_LABELS[p.stato] || p.stato}</span>
                    </td>
                    <td className="py-1 text-right text-slate-700">{p.ore ? p.ore.toFixed(1) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Nessuna presenza registrata</p>
        )}
      </Section>

      <Section icon={HardHat} title="Lavori Assegnati" count={worksites.length}>
        {worksites.length === 0 ? (
          <p className="text-sm text-slate-400">Nessun lavoro assegnato a {fullName}.</p>
        ) : (
          <div className="space-y-2">
            {worksites.map(w => (
              <div key={w.id} className="flex items-center justify-between border border-slate-100 rounded-lg p-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{w.nome}</p>
                  <p className="text-xs text-slate-500">{w.indirizzo || "Senza indirizzo"}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${w.stato === "in_corso" ? "bg-green-100 text-green-700" : w.stato === "finito" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"}`}>
                  {w.stato === "in_corso" ? "In corso" : w.stato === "finito" ? "Finito" : "Da iniziare"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}