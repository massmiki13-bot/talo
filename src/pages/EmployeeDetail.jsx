import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, Pencil, Phone, Mail, MessageCircle, IdCard, GraduationCap, Stethoscope, HardHat, Clock, ShieldCheck, AlertTriangle,
  CheckCircle2, MoreHorizontal, UserMinus, UserCheck, Plus, Trash2, FileDown, Loader2, Smartphone, Briefcase,
} from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmployeeForm from "@/components/employees/EmployeeForm";
import EmployeeDocuments from "@/components/employees/EmployeeDocuments";
import TrainingDialog from "@/components/employees/TrainingDialog";
import InviteDialog from "@/components/collaborators/InviteDialog";
import { useAuth } from "@/lib/AuthContext";
import { getAccessContext } from "@/lib/accessScope";
import { CORSI, DPI_ARTICOLI, compliance, COMPLIANCE_STYLE, fullName, initials, seniority } from "@/lib/employees";
import { ATTENDANCE_STATES } from "@/utils/attendanceStates";
import { generateBadgePdf, generateDpiPdf, downloadBlob } from "@/utils/employeePdf";
import { phoneHref, whatsappHref, fmtEur } from "@/lib/contacts";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("it-IT") : "—");
const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function Card({ icon: Icon, title, action, children }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <Icon className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-800 flex-1">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Info({ label, value }) {
  if (!value && value !== 0) return null;
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="text-sm text-slate-900 break-words">{value}</dd></div>;
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const access = getAccessContext();
  const readOnly = !access.isHost && access.accessLevel === "operaio";

  const [employee, setEmployee] = useState(null);
  const [docs, setDocs] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [worksites, setWorksites] = useState([]);
  const [profile, setProfile] = useState(null);
  const [collab, setCollab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("panoramica");
  const [editOpen, setEditOpen] = useState(false);
  const [training, setTraining] = useState(null); // { kind, preset }
  const [dpiOpen, setDpiOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const highlightDocId = new URLSearchParams(window.location.search).get("doc");

  const load = async () => {
    try {
      const [emp, documents, att, sites, profs, collabs] = await Promise.all([
        db.Employee.get(id),
        db.EmployeeDocument.filter({ dipendente_id: id }, "-data_emissione"),
        db.DailyAttendance.filter({ "presenze.dipendente_id": id }, "-data", 1000).catch(() => []),
        db.Worksite.list("-created_date", 1000).catch(() => []),
        db.CompanyProfile.list().catch(() => []),
        readOnly ? Promise.resolve([]) : db.Collaborator.filter({ employee_id: id }).catch(() => []),
      ]);
      setEmployee(emp);
      setDocs(documents);
      setAttendance(att);
      setWorksites(sites);
      setProfile(profs[0] || null);
      setCollab(collabs.find((c) => c.status !== "revoked") || null);
      if (highlightDocId) setTab("documenti");
    } catch {
      toast({ title: "Dipendente non trovato", variant: "destructive" });
      navigate(readOnly ? "/" : "/dipendenti");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  const status = useMemo(() => (employee ? compliance(employee, docs) : null), [employee, docs]);

  // Presenze del dipendente: riepilogo del mese scelto e dell'anno.
  const hours = useMemo(() => {
    const siteName = new Map(worksites.map((w) => [w.id, w.nome]));
    const month0 = { ore: 0, giorni: 0, stati: {}, cantieri: {} };
    const perMonth = Array.from({ length: 12 }, () => ({ ore: 0, giorni: 0 }));
    for (const a of attendance) {
      const d = new Date(a.data);
      for (const p of a.presenze || []) {
        if (p.dipendente_id !== id) continue;
        const stato = p.stato || "presente";
        const counts = ATTENDANCE_STATES[stato]?.countsAsHours ?? true;
        if (d.getFullYear() === month.y) {
          if (counts) { perMonth[d.getMonth()].ore += Number(p.ore) || 0; perMonth[d.getMonth()].giorni += 1; }
        }
        if (d.getFullYear() === month.y && d.getMonth() === month.m) {
          month0.stati[stato] = (month0.stati[stato] || 0) + 1;
          if (counts) {
            month0.ore += Number(p.ore) || 0;
            month0.giorni += 1;
            const cid = p.cantiere_id || a.cantiere_id;
            const name = siteName.get(cid) || a.cantiere_nome || "Senza cantiere";
            month0.cantieri[name] = (month0.cantieri[name] || 0) + (Number(p.ore) || 0);
          }
        }
      }
    }
    return { month: month0, perMonth, anno: perMonth.reduce((s, x) => s + x.ore, 0) };
  }, [attendance, worksites, month, id]);

  const sitesWorked = useMemo(() => {
    const ids = new Set();
    for (const a of attendance) for (const p of a.presenze || []) if (p.dipendente_id === id) ids.add(p.cantiere_id || a.cantiere_id);
    return worksites.filter((w) => ids.has(w.id));
  }, [attendance, worksites, id]);

  if (loading) return <LoadingSpinner />;
  if (!employee) return null;

  const st = COMPLIANCE_STYLE[status.livello];
  const phone = employee.cellulare || employee.telefono;
  const cessato = employee.stato === "cessato";
  const courses = docs.filter((d) => d.tipo === "corso");
  const visits = docs.filter((d) => d.tipo === "visita_medica");
  const dpi = employee.dpi_consegnati || [];

  const badge = async () => {
    setBusy("badge");
    try { downloadBlob(await generateBadgePdf(employee, profile), `Tesserino_${employee.cognome || ""}_${employee.nome || ""}.pdf`); }
    finally { setBusy(null); }
  };
  const dpiPdf = async (items = dpi) => {
    setBusy("dpi");
    try { downloadBlob(await generateDpiPdf(employee, profile, items), `Consegna_DPI_${employee.cognome || ""}.pdf`); }
    finally { setBusy(null); }
  };

  const setCessato = async (value) => {
    const data_cessazione = value ? new Date().toISOString().slice(0, 10) : null;
    if (value && !confirm(`Segnare ${fullName(employee)} come cessato? Resterà in archivio con tutti i documenti.`)) return;
    const saved = await db.Employee.update(id, { stato: value ? "cessato" : "attivo", data_cessazione });
    setEmployee(saved);
    toast({ title: value ? "Dipendente archiviato" : "Dipendente riattivato" });
  };

  const removeDpi = async (i) => {
    const saved = await db.Employee.update(id, { dpi_consegnati: dpi.filter((_, j) => j !== i) });
    setEmployee(saved);
  };

  const TABS = [
    ["panoramica", "Panoramica"],
    ["sicurezza", `Formazione e visite${status.problemi.length ? ` (${status.problemi.length})` : ""}`],
    ["dpi", `DPI (${dpi.length})`],
    ["ore", "Ore e cantieri"],
    ["documenti", `Documenti (${docs.length})`],
  ];

  return (
    <div className="space-y-4">
      {!readOnly && <Link to="/dipendenti" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="w-4 h-4" /> Dipendenti</Link>}

      {/* Intestazione */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
        {employee.foto_url
          ? <img src={employee.foto_url} alt={fullName(employee)} className="w-20 h-20 rounded-full object-cover border border-slate-200 shrink-0" />
          : <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-2xl font-semibold text-slate-600 shrink-0">{initials(employee)}</div>}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{fullName(employee)}</h1>
            {cessato
              ? <span className="text-xs font-semibold rounded-full bg-slate-200 text-slate-700 px-2 py-0.5">Cessato il {fmtDate(employee.data_cessazione)}</span>
              : <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full border px-2 py-0.5 ${st.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}</span>}
          </div>
          <p className="text-sm text-slate-600 mt-0.5">
            {[employee.ruolo, employee.qualifica, employee.livello].filter(Boolean).join(" · ") || "Mansione non indicata"}
            {employee.data_assunzione && ` · in azienda da ${seniority(employee.data_assunzione)}`}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {phone && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={phoneHref(phone)}><Phone className="w-4 h-4" /> Chiama</a></Button>}
            {employee.cellulare && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={whatsappHref(employee.cellulare)} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" /> WhatsApp</a></Button>}
            {employee.email && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={`mailto:${employee.email}`}><Mail className="w-4 h-4" /> Email</a></Button>}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={badge} disabled={busy === "badge"}>{busy === "badge" ? <Loader2 className="w-4 h-4 animate-spin" /> : <IdCard className="w-4 h-4" />} Tesserino</Button>
          </div>
        </div>
        {!readOnly && (
          <div className="flex sm:flex-col gap-2 sm:items-end">
            <Button size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4" /> Modifica</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><MoreHorizontal className="w-4 h-4" /> Altro</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!collab && <DropdownMenuItem onClick={() => setInviteOpen(true)}><Smartphone className="w-4 h-4 mr-2" /> Invita all'app</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => setTraining({ kind: "corso" })}><GraduationCap className="w-4 h-4 mr-2" /> Registra corso</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTraining({ kind: "visita_medica" })}><Stethoscope className="w-4 h-4 mr-2" /> Registra visita medica</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDpiOpen(true)}><HardHat className="w-4 h-4 mr-2" /> Consegna DPI</DropdownMenuItem>
                <DropdownMenuSeparator />
                {cessato
                  ? <DropdownMenuItem onClick={() => setCessato(false)}><UserCheck className="w-4 h-4 mr-2" /> Riattiva</DropdownMenuItem>
                  : <DropdownMenuItem onClick={() => setCessato(true)} className="text-red-600 focus:text-red-700"><UserMinus className="w-4 h-4 mr-2" /> Segna come cessato</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {!cessato && status.problemi.length > 0 && (
        <div className={`rounded-xl border p-4 ${status.livello === "critico" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <p className={`text-sm font-semibold flex items-center gap-2 ${status.livello === "critico" ? "text-red-800" : "text-amber-900"}`}><AlertTriangle className="w-4 h-4" /> Da sistemare per la sicurezza</p>
          <ul className="mt-1.5 text-sm text-slate-800 list-disc pl-6 space-y-0.5">{status.problemi.map((p, i) => <li key={i}>{p.testo}</li>)}</ul>
          {!readOnly && <Button size="sm" variant="outline" className="mt-2 bg-white" onClick={() => setTab("sicurezza")}>Vai a formazione e visite</Button>}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>
        ))}
      </div>

      {tab === "panoramica" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card icon={IdCard} title="Anagrafica">
            <dl className="grid grid-cols-2 gap-3">
              <Info label="Codice fiscale" value={employee.codice_fiscale} />
              <Info label="Matricola" value={employee.matricola} />
              <Info label="Nato il" value={employee.data_nascita && `${fmtDate(employee.data_nascita)}${employee.luogo_nascita ? ` a ${employee.luogo_nascita}` : ""}`} />
              <Info label="Nazionalità" value={employee.nazionalita} />
              <Info label="Permesso di soggiorno" value={employee.permesso_soggiorno_scadenza && `scade il ${fmtDate(employee.permesso_soggiorno_scadenza)}`} />
              <Info label="Residenza" value={employee.indirizzo} />
              <Info label="Cellulare" value={employee.cellulare} />
              <Info label="Telefono" value={employee.telefono} />
              <Info label="Email" value={employee.email} />
            </dl>
          </Card>
          <Card icon={Briefcase} title="Contratto">
            <dl className="grid grid-cols-2 gap-3">
              <Info label="Tipo" value={employee.tipo_contratto} />
              <Info label="CCNL" value={employee.ccnl} />
              <Info label="Assunto il" value={employee.data_assunzione && fmtDate(employee.data_assunzione)} />
              <Info label="Fine contratto" value={employee.data_fine_contratto && fmtDate(employee.data_fine_contratto)} />
              <Info label="Ore settimanali" value={employee.ore_settimanali} />
              {!readOnly && <Info label="Costo orario aziendale" value={employee.costo_orario ? `${fmtEur(employee.costo_orario)}/h` : null} />}
              {!readOnly && <Info label="IBAN" value={employee.iban} />}
            </dl>
          </Card>
          <Card icon={ShieldCheck} title="Abilitazioni e taglie">
            <dl className="grid grid-cols-2 gap-3">
              <Info label="Patenti e abilitazioni" value={(employee.patenti || []).join(", ")} />
              <Info label="Taglie" value={Object.entries(employee.taglie || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(" · ")} />
            </dl>
            {!(employee.patenti || []).length && !Object.values(employee.taglie || {}).some(Boolean) && <p className="text-sm text-slate-500">Nessuna informazione.</p>}
          </Card>
          <Card icon={Phone} title="Contatto di emergenza">
            {employee.contatto_emergenza?.nome || employee.contatto_emergenza?.telefono ? (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{employee.contatto_emergenza.nome} {employee.contatto_emergenza.relazione && <span className="text-slate-500 font-normal">· {employee.contatto_emergenza.relazione}</span>}</p>
                  <p className="text-sm text-slate-600">{employee.contatto_emergenza.telefono}</p>
                </div>
                {employee.contatto_emergenza.telefono && <Button asChild size="sm" variant="outline"><a href={phoneHref(employee.contatto_emergenza.telefono)}><Phone className="w-4 h-4" /></a></Button>}
              </div>
            ) : <p className="text-sm text-slate-500">Non indicato.</p>}
          </Card>
          {!readOnly && (
            <Card icon={Smartphone} title="Accesso all'app">
              {collab ? (
                <p className="text-sm text-slate-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Collegato come <strong>{collab.access_level === "operaio" ? "operaio" : "responsabile"}</strong> ({collab.email})</p>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <p className="text-sm text-slate-600 flex-1">Con l'accesso vede solo le sue ore, i suoi documenti e le sue scadenze.</p>
                  <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>Invita all'app</Button>
                </div>
              )}
            </Card>
          )}
          {employee.note && <Card icon={Pencil} title="Note"><p className="text-sm text-slate-700 whitespace-pre-wrap">{employee.note}</p></Card>}
        </div>
      )}

      {tab === "sicurezza" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card icon={GraduationCap} title="Formazione" action={!readOnly && <Button size="sm" variant="outline" className="gap-1" onClick={() => setTraining({ kind: "corso" })}><Plus className="w-4 h-4" /> Corso</Button>}>
            <ul className="divide-y divide-slate-100">
              {CORSI.filter((c) => c.obbligatorio || courses.some((d) => d.corso_codice === c.codice)).map((c) => {
                const list = courses.filter((d) => d.corso_codice === c.codice).sort((a, b) => String(b.data_emissione).localeCompare(String(a.data_emissione)));
                const last = list[0];
                const exp = last?.data_scadenza ? new Date(last.data_scadenza) : null;
                const days = exp ? Math.ceil((exp - new Date(new Date().toDateString())) / 86_400_000) : null;
                return (
                  <li key={c.codice} className="py-2.5 flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${!last ? "bg-red-500" : days !== null && days < 0 ? "bg-red-500" : days !== null && days <= 30 ? "bg-amber-500" : "bg-emerald-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900">{c.nome}</p>
                      <p className="text-xs text-slate-500">{last ? `Attestato del ${fmtDate(last.data_emissione)}${exp ? ` · ${days < 0 ? "scaduto il" : "scade il"} ${fmtDate(last.data_scadenza)}` : " · senza scadenza"}` : "Non registrato"}</p>
                    </div>
                    {!readOnly && (!last || (days !== null && days <= 30)) && <Button size="sm" variant="outline" onClick={() => setTraining({ kind: "corso", preset: c.codice })}>{last ? "Rinnova" : "Registra"}</Button>}
                  </li>
                );
              })}
              {courses.filter((d) => !CORSI.some((c) => c.codice === d.corso_codice && c.codice !== "altro")).map((d) => (
                <li key={d.id} className="py-2.5 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full shrink-0 bg-slate-400" />
                  <div className="flex-1 min-w-0"><p className="text-sm text-slate-900">{d.titolo}</p><p className="text-xs text-slate-500">{fmtDate(d.data_emissione)}{d.data_scadenza && ` · scade il ${fmtDate(d.data_scadenza)}`}</p></div>
                </li>
              ))}
            </ul>
          </Card>
          <Card icon={Stethoscope} title="Visite mediche" action={!readOnly && <Button size="sm" variant="outline" className="gap-1" onClick={() => setTraining({ kind: "visita_medica" })}><Plus className="w-4 h-4" /> Visita</Button>}>
            {visits.length ? (
              <ul className="divide-y divide-slate-100">
                {[...visits].sort((a, b) => String(b.data_emissione).localeCompare(String(a.data_emissione))).map((v, i) => (
                  <li key={v.id} className={`py-2.5 ${i > 0 ? "opacity-60" : ""}`}>
                    <p className="text-sm text-slate-900">{fmtDate(v.data_emissione)} · {v.esito || v.descrizione || "Visita"}</p>
                    <p className="text-xs text-slate-500">{[v.ente && `Dott. ${v.ente}`, v.data_scadenza && `prossima entro il ${fmtDate(v.data_scadenza)}`].filter(Boolean).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Nessuna visita registrata. La visita di idoneità è obbligatoria prima di adibire il lavoratore alla mansione.</p>}
          </Card>
          {status.prossima && (
            <p className="text-sm text-slate-600 lg:col-span-2">Prossima scadenza: <strong>{status.prossima.titolo}</strong> il {fmtDate(status.prossima.data)}.</p>
          )}
        </div>
      )}

      {tab === "dpi" && (
        <Card icon={HardHat} title="Dispositivi di protezione consegnati" action={!readOnly && (
          <div className="flex gap-2">
            {dpi.length > 0 && <Button size="sm" variant="outline" className="gap-1" onClick={() => dpiPdf()} disabled={busy === "dpi"}>{busy === "dpi" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Verbale</Button>}
            <Button size="sm" className="gap-1" onClick={() => setDpiOpen(true)}><Plus className="w-4 h-4" /> Consegna</Button>
          </div>
        )}>
          {dpi.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-100"><th className="py-2">Dispositivo</th><th className="py-2">Taglia</th><th className="py-2">Q.tà</th><th className="py-2">Consegnato il</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...dpi].map((d, i) => ({ ...d, i })).sort((a, b) => String(b.data_consegna).localeCompare(String(a.data_consegna))).map((d) => (
                  <tr key={d.i}>
                    <td className="py-2 text-slate-900">{d.articolo}</td><td className="py-2">{d.taglia || "—"}</td><td className="py-2">{d.quantita || 1}</td><td className="py-2">{fmtDate(d.data_consegna)}</td>
                    <td className="py-2 text-right">{!readOnly && <button aria-label="Elimina" onClick={() => removeDpi(d.i)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-slate-500">Nessun DPI registrato. Ogni consegna va documentata con il verbale firmato dal lavoratore.</p>}
        </Card>
      )}

      {tab === "ore" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(month.m)} onValueChange={(v) => setMonth((x) => ({ ...x, m: Number(v) }))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(month.y)} onValueChange={(v) => setMonth((x) => ({ ...x, y: Number(v) }))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{[0, 1, 2].map((d) => new Date().getFullYear() - d).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Link to="/presenze" className="text-sm text-blue-700 hover:underline ml-auto">Apri le presenze</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["Ore lavorate", `${hours.month.ore.toLocaleString("it-IT")} h`],
              ["Giorni di presenza", hours.month.giorni],
              ["Ferie · permessi", `${hours.month.stati.ferie || 0} · ${hours.month.stati.permesso || 0}`],
              [readOnly ? "Malattia · assenze" : "Costo del mese", readOnly ? `${hours.month.stati.malattia || 0} · ${hours.month.stati.assente || 0}` : employee.costo_orario ? fmtEur(hours.month.ore * employee.costo_orario) : "—"],
            ].map(([l, v]) => (
              <div key={l} className="bg-white rounded-xl border border-slate-200 p-3.5"><p className="text-xs text-slate-500">{l}</p><p className="text-lg font-bold text-slate-900 tabular-nums">{v}</p></div>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card icon={Briefcase} title={`Cantieri a ${MONTHS[month.m].toLowerCase()}`}>
              {Object.keys(hours.month.cantieri).length ? (
                <ul className="space-y-2">
                  {Object.entries(hours.month.cantieri).sort((a, b) => b[1] - a[1]).map(([name, ore]) => (
                    <li key={name}>
                      <div className="flex justify-between text-sm"><span className="text-slate-800 truncate pr-2">{name}</span><span className="tabular-nums text-slate-700">{ore} h</span></div>
                      <div className="h-1.5 rounded-full bg-slate-100 mt-1"><div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${Math.min(100, (ore / Math.max(1, hours.month.ore)) * 100)}%` }} /></div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">Nessuna ora registrata nel mese.</p>}
            </Card>
            <Card icon={Clock} title={`Anno ${month.y} · ${hours.anno.toLocaleString("it-IT")} ore`}>
              <div className="flex items-end gap-1 h-28" role="img" aria-label="Ore per mese">
                {hours.perMonth.map((x, i) => {
                  const max = Math.max(1, ...hours.perMonth.map((p) => p.ore));
                  return (
                    <button key={i} onClick={() => setMonth((m) => ({ ...m, m: i }))} className="flex-1 flex flex-col items-center gap-1 group" title={`${MONTHS[i]}: ${x.ore} h`}>
                      <div className={`w-full rounded-t ${i === month.m ? "bg-blue-600" : "bg-slate-300 group-hover:bg-slate-400"}`} style={{ height: `${(x.ore / max) * 88}px` }} />
                      <span className="text-[10px] text-slate-500">{MONTHS[i][0]}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
          {sitesWorked.length > 0 && (
            <p className="text-sm text-slate-600">Ha lavorato su {sitesWorked.length} {sitesWorked.length === 1 ? "cantiere" : "cantieri"}: {sitesWorked.map((w, i) => <span key={w.id}>{i > 0 && ", "}<Link to={`/lavori/${w.id}`} className="text-blue-700 hover:underline">{w.nome}</Link></span>)}.</p>
          )}
        </div>
      )}

      {tab === "documenti" && <EmployeeDocuments employee={employee} docs={docs} onChanged={load} highlightDocId={highlightDocId} readOnly={readOnly} />}

      <EmployeeForm open={editOpen} onOpenChange={setEditOpen} employee={employee} onSaved={(e) => e && setEmployee(e)} />
      <TrainingDialog open={!!training} onOpenChange={(v) => { if (!v) setTraining(null); }} employee={employee} kind={training?.kind} preset={training?.preset} onSaved={load} />
      <DpiDialog open={dpiOpen} onOpenChange={setDpiOpen} employee={employee}
        onSaved={async (items, print) => {
          const saved = await db.Employee.update(id, { dpi_consegnati: [...dpi, ...items] });
          setEmployee(saved);
          toast({ title: "Consegna registrata" });
          if (print) await dpiPdf(items);
        }} />
      <InviteDialog open={inviteOpen} onOpenChange={(v) => { setInviteOpen(v); if (!v) load(); }} hostUserId={user?.id} defaultAccessLevel="operaio" defaultEmployeeId={id} onCreated={load} />
    </div>
  );
}

function DpiDialog({ open, onOpenChange, employee, onSaved }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const sizeFor = (a) => {
    const t = employee?.taglie || {};
    if (/scarpe/i.test(a)) return t.scarpe || "";
    if (/pantaloni/i.test(a)) return t.pantaloni || "";
    if (/giacca|gilet|tuta/i.test(a)) return t.giacca || "";
    if (/guanti/i.test(a)) return t.guanti || "";
    return "";
  };
  useEffect(() => { if (open) setRows([]); }, [open]);
  const toggle = (a) => setRows((r) => (r.some((x) => x.articolo === a) ? r.filter((x) => x.articolo !== a) : [...r, { articolo: a, taglia: sizeFor(a), quantita: 1, data_consegna: today }]));

  const save = async (print) => {
    setSaving(true);
    try { await onSaved(rows, print); onOpenChange(false); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consegna DPI</DialogTitle>
          <DialogDescription>Seleziona i dispositivi consegnati. Le taglie arrivano dalla scheda del dipendente.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {DPI_ARTICOLI.map((a) => (
            <button key={a} type="button" onClick={() => toggle(a)}
              className={`rounded-full border px-2.5 py-1 text-xs ${rows.some((x) => x.articolo === a) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{a}</button>
          ))}
        </div>
        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.articolo} className="grid grid-cols-[1fr_70px_60px_130px] gap-2 items-center">
                <span className="text-sm text-slate-800 truncate">{r.articolo}</span>
                <Input aria-label="Taglia" placeholder="Taglia" value={r.taglia} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, taglia: e.target.value } : y)))} className="h-8" />
                <Input aria-label="Quantità" type="number" min="1" value={r.quantita} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, quantita: Number(e.target.value) || 1 } : y)))} className="h-8" />
                <Input aria-label="Data consegna" type="date" value={r.data_consegna} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, data_consegna: e.target.value } : y)))} className="h-8" />
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button variant="outline" onClick={() => save(false)} disabled={!rows.length || saving}>Registra</Button>
          <Button onClick={() => save(true)} disabled={!rows.length || saving} className="gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Registra e stampa verbale</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
