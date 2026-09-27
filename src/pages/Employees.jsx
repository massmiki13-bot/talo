import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { UserCheck, Search, Plus, Download, X, Phone, ChevronRight, Archive, AlertTriangle } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmployeeForm from "@/components/employees/EmployeeForm";
import { compliance, COMPLIANCE_STYLE, fullName, initials, seniority } from "@/lib/employees";
import { phoneHref } from "@/lib/contacts";
import { downloadCsv } from "@/lib/csv";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("it-IT") : "");

function Avatar({ e, size = "w-10 h-10" }) {
  return e.foto_url
    ? <img src={e.foto_url} alt="" className={`${size} rounded-full object-cover border border-slate-200 shrink-0`} />
    : <div className={`${size} rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0`}>{initials(e)}</div>;
}

export default function Employees() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("tutte");
  const [status, setStatus] = useState("tutti");
  const [showCessati, setShowCessati] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const load = async () => {
    try {
      const [emps, allDocs] = await Promise.all([db.Employee.list("cognome", 2000), db.EmployeeDocument.list("-created_date", 10000).catch(() => [])]);
      setEmployees(emps);
      setDocs(allDocs);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const byEmp = new Map();
    for (const d of docs) {
      if (!byEmp.has(d.dipendente_id)) byEmp.set(d.dipendente_id, []);
      byEmp.get(d.dipendente_id).push(d);
    }
    return employees.map((e) => ({ ...e, _c: compliance(e, byEmp.get(e.id) || []) }));
  }, [employees, docs]);

  const active = rows.filter((e) => e.stato !== "cessato");
  const roles = useMemo(() => [...new Set(rows.map((e) => e.ruolo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it")), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((e) => (showCessati ? e.stato === "cessato" : e.stato !== "cessato"))
      .filter((e) => role === "tutte" || e.ruolo === role)
      .filter((e) => status === "tutti" || e._c.livello === status)
      .filter((e) => !q || [e.nome, e.cognome, e.codice_fiscale, e.ruolo, e.matricola, e.cellulare, e.telefono].join(" ").toLowerCase().includes(q))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "it"));
  }, [rows, search, role, status, showCessati]);

  const counts = {
    ok: active.filter((e) => e._c.livello === "ok").length,
    attenzione: active.filter((e) => e._c.livello === "attenzione").length,
    critico: active.filter((e) => e._c.livello === "critico").length,
  };

  const exportCsv = () => downloadCsv(`dipendenti-${new Date().toISOString().slice(0, 10)}.csv`,
    ["Cognome", "Nome", "Codice fiscale", "Mansione", "Qualifica", "Livello", "Contratto", "Assunto il", "Fine contratto", "Ore sett.", "Cellulare", "Email", "Stato sicurezza", "Prossima scadenza"],
    filtered.map((e) => [e.cognome, e.nome, e.codice_fiscale, e.ruolo, e.qualifica, e.livello, e.tipo_contratto, e.data_assunzione, e.data_fine_contratto, e.ore_settimanali,
      e.cellulare || e.telefono, e.email, COMPLIANCE_STYLE[e._c.livello].label, e._c.prossima ? `${e._c.prossima.titolo} ${fmtDate(e._c.prossima.data)}` : ""]));

  const filtersOn = search || role !== "tutte" || status !== "tutti";

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Dipendenti</h1>
          <p className="text-slate-500 mt-1 text-sm">Anagrafiche, contratti, formazione, visite mediche e DPI</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={!filtered.length}><Download className="w-4 h-4" /> Esporta</Button>
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => setFormOpen(true)}><Plus className="w-4 h-4" /> Nuovo dipendente</Button>
        </div>
      </div>

      {active.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {["ok", "attenzione", "critico"].map((k) => (
            <button key={k} onClick={() => setStatus(status === k ? "tutti" : k)}
              className={`text-left bg-white rounded-xl border p-3.5 transition-colors ${status === k ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 hover:border-slate-300"}`}>
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${COMPLIANCE_STYLE[k].dot}`} /> {COMPLIANCE_STYLE[k].label}</p>
              <p className="text-2xl font-bold text-slate-900">{counts[k]}</p>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Cerca per nome, codice fiscale, mansione…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10" aria-label="Cerca dipendenti" />
          {search && <button onClick={() => setSearch("")} aria-label="Cancella ricerca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100"><X className="w-3.5 h-3.5 text-slate-500" /></button>}
        </div>
        {roles.length > 0 && (
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="sm:w-52 h-10"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="tutte">Tutte le mansioni</SelectItem>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {rows.some((e) => e.stato === "cessato") && (
          <Button variant={showCessati ? "default" : "outline"} className="h-10 gap-1.5" onClick={() => setShowCessati(!showCessati)}><Archive className="w-4 h-4" /> {showCessati ? "Cessati" : "Cessati"}</Button>
        )}
      </div>
      {filtersOn && <button onClick={() => { setSearch(""); setRole("tutte"); setStatus("tutti"); }} className="flex items-center gap-1 text-xs text-blue-700 hover:underline mb-3"><X className="w-3.5 h-3.5" /> Azzera filtri</button>}

      {filtered.length === 0 ? (
        filtersOn || showCessati
          ? <EmptyState icon={Search} title="Nessun dipendente trovato" description="Prova a cambiare i filtri." />
          : <EmptyState icon={UserCheck} title="Nessun dipendente" description="Aggiungi la squadra: servirà per presenze, costi dei lavori e scadenze di sicurezza." actionLabel="Nuovo dipendente" onAction={() => setFormOpen(true)} />
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                  <th className="px-4 py-3">Dipendente</th>
                  <th className="px-4 py-3">Contratto</th>
                  <th className="px-4 py-3">Sicurezza</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Prossima scadenza</th>
                  <th className="px-2 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => {
                  const st = COMPLIANCE_STYLE[e._c.livello];
                  return (
                    <tr key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/dipendenti/${e.id}`)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar e={e} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{fullName(e)}</p>
                            <p className="text-xs text-slate-500 truncate">{e.ruolo || "Mansione non indicata"}{e.qualifica ? ` · ${e.qualifica}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <p>{e.tipo_contratto || "—"}</p>
                        <p className="text-xs text-slate-500">{e.stato === "cessato" ? `Cessato il ${fmtDate(e.data_cessazione)}` : e.data_assunzione ? `da ${seniority(e.data_assunzione)}` : ""}{e.data_fine_contratto && e.stato !== "cessato" ? ` · fino al ${fmtDate(e.data_fine_contratto)}` : ""}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full border px-2 py-0.5 ${st.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}</span>
                        {e._c.problemi.length > 0 && <p className="text-xs text-slate-600 mt-1 truncate max-w-[220px]" title={e._c.problemi.map((p) => p.testo).join("\n")}>{e._c.problemi[0].testo}{e._c.problemi.length > 1 ? ` +${e._c.problemi.length - 1}` : ""}</p>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-slate-700">{e._c.prossima ? <>{e._c.prossima.titolo}<p className="text-xs text-slate-500">{fmtDate(e._c.prossima.data)}</p></> : "—"}</td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-end" onClick={(ev) => ev.stopPropagation()}>
                          {(e.cellulare || e.telefono) && <a href={phoneHref(e.cellulare || e.telefono)} aria-label={`Chiama ${fullName(e)}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Phone className="w-4 h-4" /></a>}
                          <ChevronRight className="w-4 h-4 text-slate-300" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {filtered.map((e) => {
              const st = COMPLIANCE_STYLE[e._c.livello];
              return (
                <div key={e.id} onClick={() => navigate(`/dipendenti/${e.id}`)} className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center gap-3 active:bg-slate-50">
                  <Avatar e={e} size="w-11 h-11" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{fullName(e)}</p>
                    <p className="text-xs text-slate-500 truncate">{e.ruolo || "—"}</p>
                    <p className="text-xs mt-0.5 flex items-center gap-1.5 text-slate-700"><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{e._c.problemi[0]?.testo || st.label}</p>
                  </div>
                  {e._c.livello === "critico" && <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" aria-label="Non in regola" />}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-3">{filtered.length} {filtered.length === 1 ? "dipendente" : "dipendenti"}</p>
        </>
      )}

      <EmployeeForm open={formOpen} onOpenChange={setFormOpen} onSaved={(e) => { load(); if (e?.id) navigate(`/dipendenti/${e.id}`); }} />
    </div>
  );
}
