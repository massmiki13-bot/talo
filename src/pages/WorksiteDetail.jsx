import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, Pencil, MapPin, Navigation, Users, CalendarDays, FileText, Inbox, Eye, FileDown, AlertTriangle, TrendingUp, TrendingDown,
  MoreHorizontal, Plus, Loader2, HardHat, Receipt, ClipboardList, Edit3, CheckCircle2,
} from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import WorksiteForm from "@/components/worksite/WorksiteForm";
import WorksitePhases from "@/components/worksite/WorksitePhases";
import WorksiteMoney from "@/components/worksite/WorksiteMoney";
import WorksiteTransactions from "@/components/worksite/WorksiteTransactions";
import WorksiteLog from "@/components/worksite/WorksiteLog";
import WorksiteDocs from "@/components/worksite/WorksiteDocs";
import WorksitePhotos from "@/components/worksite/WorksitePhotos";
import WorksiteQuickNotes from "@/components/worksite/WorksiteQuickNotes";
import LinkedEmails from "@/components/email/LinkedEmails";
import SignStampDialog from "@/components/quotes/SignStampDialog";
import { getAccessContext } from "@/lib/accessScope";
import { WORKSITE_STATES, COST_CATEGORIES, laborFromAttendance, economics, installments, fmtDate, daysBetween } from "@/lib/worksites";
import { fmtEur } from "@/lib/quotes";
import { fullName } from "@/lib/employees";
import { exportWorksiteFolder } from "@/utils/worksiteExport";
import { generateWorksiteReport } from "@/utils/worksiteReport";
import { downloadBlob } from "@/utils/employeePdf";

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

export default function WorksiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const access = getAccessContext();
  const readOnly = !access.isHost && access.accessLevel === "operaio";

  const [worksite, setWorksite] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allWorksites, setAllWorksites] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [received, setReceived] = useState([]);
  const [payments, setPayments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [logsCount, setLogsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("panoramica");
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [signTarget, setSignTarget] = useState(null);
  const [laborEdit, setLaborEdit] = useState(null);

  const load = async () => {
    try {
      const [site, txs, phs, attA, attB, emps, sites, qs, recv, pays, profs, logs] = await Promise.all([
        db.Worksite.get(id),
        db.WorksiteTransaction.filter({ worksite_id: id }, "-data", 5000),
        db.WorksitePhoto.filter({ worksite_id: id }, "-data", 1000).catch(() => []),
        db.DailyAttendance.filter({ cantiere_id: id }, "-data", 5000).catch(() => []),
        db.DailyAttendance.filter({ "presenze.cantiere_id": id }, "-data", 5000).catch(() => []),
        db.Employee.list("cognome", 2000).catch(() => []),
        db.Worksite.list("-created_date", 1000).catch(() => []),
        db.Quote.list("-created_date", 5000).catch(() => []),
        db.ReceivedQuote.filter({ worksite_id: id }, "-data").catch(() => []),
        db.WorksitePayment.filter({ worksite_id: id }, "-data").catch(() => []),
        db.CompanyProfile.list().catch(() => []),
        db.WorksiteLog.filter({ worksite_id: id }, "-data", 1000).catch(() => []),
      ]);
      const att = [...new Map([...attA, ...attB].map((a) => [a.id, a])).values()];
      setWorksite(site);
      setTransactions(txs);
      setPhotos(phs);
      setAttendance(att);
      setEmployees(emps);
      setAllWorksites(sites);
      setQuotes(qs.filter((q) => q.worksite_id === id || q.id === site.preventivo_id));
      setReceived(recv);
      setPayments(pays);
      setProfile(profs[0] || null);
      setLogsCount(logs.length);
    } catch {
      toast({ title: "Lavoro non trovato", variant: "destructive" });
      navigate("/lavori");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  const primaryQuote = quotes.find((q) => q.id === worksite?.preventivo_id) || quotes.find((q) => q.stato === "approvato") || quotes[0];
  const contractAmount = Number(worksite?.importo_totale) || Number(primaryQuote?.totale) || 0;
  const labor = useMemo(() => laborFromAttendance(attendance, employees, id), [attendance, employees, id]);
  const econ = useMemo(() => (worksite ? economics({ worksite, transactions, labor, quoteTotal: primaryQuote?.totale }) : null), [worksite, transactions, labor, primaryQuote]);
  const rate = useMemo(() => installments(worksite?.piano_pagamenti || [], payments), [worksite, payments]);

  if (loading || !worksite) return <LoadingSpinner />;

  const st = WORKSITE_STATES[worksite.stato] || WORKSITE_STATES.da_iniziare;
  const team = (worksite.squadra_ids || []).map((eid) => employees.find((e) => e.id === eid)).filter(Boolean);
  const capo = employees.find((e) => e.id === worksite.responsabile_id);
  const incassato = payments.reduce((s, p) => s + (Number(p.importo) || 0), 0);
  const late = worksite.stato !== "finito" && worksite.data_fine_prevista && new Date(worksite.data_fine_prevista) < new Date(new Date().toDateString());
  const overdueRates = rate.filter((r) => r.stato === "scaduta");

  const alerts = [
    econ.margineReale < 0 && econ.costi > 0 && { level: "red", text: `Il lavoro è in perdita: costi ${fmtEur(econ.costi)} contro ${fmtEur(econ.ricavo)} di contratto.` },
    econ.sforamenti.length > 0 && { level: "amber", text: `Budget superato per: ${econ.sforamenti.join(", ")}.` },
    late && { level: "amber", text: `Fine lavori prevista il ${fmtDate(worksite.data_fine_prevista)}: in ritardo di ${daysBetween(worksite.data_fine_prevista, new Date())} giorni.` },
    overdueRates.length > 0 && { level: "red", text: `${overdueRates.length} ${overdueRates.length === 1 ? "rata scaduta" : "rate scadute"} da incassare (${fmtEur(overdueRates.reduce((s, r) => s + r.residuo, 0))}).` },
  ].filter(Boolean);

  const changeState = async (stato) => {
    const patch = { stato, attivo: stato !== "finito", ...(stato === "finito" && !worksite.data_fine_effettiva ? { data_fine_effettiva: new Date().toISOString().slice(0, 10) } : {}), ...(stato === "in_corso" && !worksite.data_inizio ? { data_inizio: new Date().toISOString().slice(0, 10) } : {}) };
    setWorksite(await db.Worksite.update(id, patch));
    toast({ title: `Stato: ${WORKSITE_STATES[stato].label}` });
  };

  const report = async (internal) => {
    setBusy(internal ? "rep-int" : "rep-cli");
    try {
      const blob = await generateWorksiteReport({ worksite, profile, econ, labor, payments, rate, photos, logsCount, team: team.map(fullName) }, { internal });
      downloadBlob(blob, `${internal ? "Resoconto" : "Relazione_fine_lavori"}_${(worksite.nome || "lavoro").replace(/[^\w-]+/g, "_")}.pdf`);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const exportFolder = async () => {
    setBusy("folder");
    try { await exportWorksiteFolder(worksite, transactions, photos, econ.byCat.Manodopera, employees, attendance); }
    catch (e) { toast({ title: "Esportazione non riuscita", variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const saveLabor = async () => {
    const v = laborEdit === "" ? null : Number(laborEdit);
    setWorksite(await db.Worksite.update(id, { costo_manodopera_manuale: v }));
    setLaborEdit(null);
  };

  const TABS = [
    ["panoramica", "Panoramica"],
    ...(readOnly ? [] : [["economia", "Costi e margine"], ["incassi", `Incassi${overdueRates.length ? ` (${overdueRates.length})` : ""}`]]),
    ["giornale", "Giornale"],
    ["foto", "Foto e documenti"],
    ...(readOnly ? [] : [["email", "Email"]]),
  ];

  return (
    <div className="space-y-4">
      <Link to="/lavori" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="w-4 h-4" /> Lavori</Link>

      {/* Intestazione */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{worksite.nome}</h1>
              {readOnly
                ? <span className={`text-xs font-semibold rounded-full border px-2 py-0.5 ${st.className}`}>{st.label}</span>
                : (
                  <Select value={worksite.stato || "da_iniziare"} onValueChange={changeState}>
                    <SelectTrigger className={`h-7 w-auto gap-1.5 rounded-full border text-xs font-semibold ${st.className}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(WORKSITE_STATES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
            </div>
            <div className="text-sm text-slate-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {worksite.cliente_nome && <span>{worksite.cliente_id ? <Link to={`/contatti/${worksite.cliente_id}`} className="hover:underline">{worksite.cliente_nome}</Link> : worksite.cliente_nome}</span>}
              {worksite.indirizzo && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(worksite.indirizzo)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline"><MapPin className="w-3.5 h-3.5" />{worksite.indirizzo}</a>}
              {(worksite.data_inizio || worksite.data_fine_prevista) && <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{worksite.data_inizio ? fmtDate(worksite.data_inizio) : "?"} → {fmtDate(worksite.data_fine_effettiva || worksite.data_fine_prevista)}</span>}
              {capo && <span className="flex items-center gap-1"><HardHat className="w-3.5 h-3.5" />{fullName(capo)}</span>}
            </div>
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4" /> Modifica</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><FileDown className="w-4 h-4" /> Documenti</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => report(true)}><FileDown className="w-4 h-4 mr-2" /> Resoconto interno (con costi)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => report(false)}><FileDown className="w-4 h-4 mr-2" /> Relazione per il cliente</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportFolder}><FileDown className="w-4 h-4 mr-2" /> Cartella completa (Excel)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {busy && <Loader2 className="w-5 h-5 animate-spin text-slate-400 self-center" />}
              <Button size="sm" className="gap-1.5" onClick={() => setTab("economia")}><Plus className="w-4 h-4" /> Spesa</Button>
            </div>
          )}
        </div>

        {/* Indicatori */}
        <div className={`grid grid-cols-2 ${readOnly ? "" : "lg:grid-cols-4"} gap-3 mt-4`}>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-600">Avanzamento</p>
            <p className="text-lg font-bold text-slate-900">{worksite.avanzamento || 0}%</p>
            <div className="h-1.5 rounded-full bg-white mt-1 overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${worksite.avanzamento || 0}%` }} /></div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-600">Ore lavorate</p>
            <p className="text-lg font-bold text-slate-900">{labor.ore.toLocaleString("it-IT")} h</p>
            <p className="text-xs text-slate-600">{labor.giorni} giornate · {labor.persone.size} persone</p>
          </div>
          {!readOnly && (
            <>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Incassato</p>
                <p className="text-lg font-bold text-slate-900 tabular-nums">{fmtEur(incassato)}</p>
                <p className="text-xs text-slate-600">su {fmtEur(contractAmount)}</p>
              </div>
              <div className={`rounded-lg p-3 ${econ.margineReale < 0 && econ.costi > 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                <p className="text-xs text-slate-700">Margine ad oggi</p>
                <p className={`text-lg font-bold tabular-nums ${econ.margineReale < 0 && econ.costi > 0 ? "text-red-700" : "text-emerald-800"}`}>{fmtEur(econ.margineReale)}</p>
                <p className="text-xs text-slate-700">costi {fmtEur(econ.costi)}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {!readOnly && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${a.level === "red" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {a.text}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>
        ))}
      </div>

      {tab === "panoramica" && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <WorksitePhases worksite={worksite} contractAmount={contractAmount} readOnly={readOnly} onSaved={(s) => s && setWorksite(s)} />
          <div className="space-y-4">
            <Card icon={Users} title="Squadra">
              {team.length ? (
                <ul className="divide-y divide-slate-100">
                  {team.map((e) => (
                    <li key={e.id} className="py-2 flex items-center gap-3">
                      <Link to={`/dipendenti/${e.id}`} className="text-sm text-slate-900 hover:underline flex-1">{fullName(e)}{e.id === worksite.responsabile_id && <span className="ml-2 text-[10px] font-bold uppercase bg-blue-100 text-blue-800 rounded px-1.5">Capocantiere</span>}</Link>
                      <span className="text-xs text-slate-500">{e.ruolo}</span>
                      <span className="text-xs text-slate-700 tabular-nums w-14 text-right">{labor.persone.get(e.id) || 0} h</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">Nessuna squadra assegnata.{!readOnly && <> <button className="text-blue-700 underline" onClick={() => setEditOpen(true)}>Assegnala</button></>}</p>}
            </Card>
            <Card icon={ClipboardList} title="Pratiche e figure">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-slate-500">Titolo edilizio</dt><dd>{worksite.titolo_edilizio?.tipo ? `${worksite.titolo_edilizio.tipo}${worksite.titolo_edilizio.numero ? ` n. ${worksite.titolo_edilizio.numero}` : ""}` : "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Tipo intervento</dt><dd>{worksite.tipo_intervento || "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Direttore lavori</dt><dd>{worksite.direttore_lavori || "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Coordinatore sicurezza</dt><dd>{worksite.coordinatore_sicurezza || "—"}</dd></div>
              </dl>
            </Card>
            {quotes.length > 0 && (
              <Card icon={FileText} title="Preventivi collegati">
                {quotes.map((q) => (
                  <Link key={q.id} to={`/preventivi/${q.id}`} className="flex items-center gap-2 py-1.5 hover:underline">
                    <span className="text-sm text-slate-900 flex-1 truncate">{q.numero}{q.revisione ? ` Rev.${q.revisione}` : ""} · {q.oggetto}</span>
                    <span className="text-sm tabular-nums">{fmtEur(q.totale)}</span>
                  </Link>
                ))}
              </Card>
            )}
            {worksite.note && <Card icon={Edit3} title="Note"><p className="text-sm text-slate-700 whitespace-pre-wrap">{worksite.note}</p></Card>}
          </div>
        </div>
      )}

      {tab === "economia" && !readOnly && (
        <div className="space-y-4">
          <Card icon={TrendingUp} title="Budget e costi reali" action={<Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>Imposta budget</Button>}>
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-600">Contratto</p><p className="text-lg font-bold tabular-nums">{fmtEur(econ.ricavo)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-600">Margine previsto</p><p className="text-lg font-bold tabular-nums">{econ.marginePrevisto === null ? "—" : fmtEur(econ.marginePrevisto)}</p><p className="text-xs text-slate-600">{econ.budgetTot ? `budget costi ${fmtEur(econ.budgetTot)}` : "imposta un budget"}</p></div>
              <div className={`rounded-lg p-3 ${econ.margineStimato !== null && econ.margineStimato < 0 ? "bg-red-50" : "bg-slate-50"}`}><p className="text-xs text-slate-600">Margine stimato a fine lavori</p><p className="text-lg font-bold tabular-nums">{econ.margineStimato === null ? "—" : fmtEur(econ.margineStimato)}</p></div>
            </div>
            <ul className="space-y-3">
              {COST_CATEGORIES.map((c) => {
                const b = Number(econ.budget?.[c]) || 0;
                const r = econ.byCat[c] || 0;
                if (!b && !r && c !== "Manodopera") return null;
                const pct = b ? Math.min(100, (r / b) * 100) : 0;
                return (
                  <li key={c}>
                    <div className="flex items-center justify-between text-sm gap-2">
                      <span className="text-slate-800">{c}{c === "Manodopera" && (worksite.costo_manodopera_manuale == null ? <span className="text-xs text-slate-500"> · da presenze ({labor.ore} h)</span> : <span className="text-xs text-slate-500"> · impostata a mano</span>)}</span>
                      <span className="tabular-nums">
                        {c === "Manodopera" && laborEdit !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Input type="number" value={laborEdit} onChange={(e) => setLaborEdit(e.target.value)} className="h-7 w-24" placeholder="auto" aria-label="Costo manodopera" />
                            <Button size="sm" className="h-7" onClick={saveLabor}>OK</Button>
                          </span>
                        ) : (
                          <>
                            <strong className={b && r > b ? "text-red-700" : "text-slate-900"}>{fmtEur(r)}</strong>{b ? <span className="text-slate-500"> / {fmtEur(b)}</span> : null}
                            {c === "Manodopera" && <button aria-label="Modifica costo manodopera" onClick={() => setLaborEdit(worksite.costo_manodopera_manuale ?? "")} className="ml-1 text-slate-400 hover:text-blue-700"><Pencil className="w-3.5 h-3.5 inline" /></button>}
                          </>
                        )}
                      </span>
                    </div>
                    {b > 0 && <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className={`h-full ${r > b ? "bg-red-500" : pct > 85 ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${pct}%` }} /></div>}
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-between text-sm font-semibold border-t border-slate-100 mt-4 pt-3">
              <span>Totale costi</span><span className="tabular-nums">{fmtEur(econ.costi)}{econ.budgetTot ? <span className="text-slate-500 font-normal"> / {fmtEur(econ.budgetTot)}</span> : null}</span>
            </div>
          </Card>
          <WorksiteTransactions worksite={worksite} transactions={transactions} allWorksites={allWorksites} onChanged={load} />
        </div>
      )}

      {tab === "incassi" && !readOnly && (
        <WorksiteMoney worksite={worksite} contractAmount={contractAmount} onSaved={(s) => s && setWorksite(s)} onPaymentsChange={setPayments} />
      )}

      {tab === "giornale" && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
          <WorksiteLog worksite={worksite} attendance={attendance} employees={employees} readOnly={readOnly} />
          <WorksiteQuickNotes worksite={worksite} />
        </div>
      )}

      {tab === "foto" && (
        <div className="space-y-4">
          <WorksitePhotos worksiteId={id} />
          <WorksiteDocs worksite={worksite} readOnly={readOnly} />
          {received.length > 0 && !readOnly && (
            <Card icon={Inbox} title="Preventivi dei fornitori">
              <ul className="divide-y divide-slate-100">
                {received.map((rq) => (
                  <li key={rq.id} className="py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900">{rq.fornitore}</p>
                      <p className="text-xs text-slate-500 truncate">{fmtDate(rq.data)} · {rq.descrizione || ""}{rq.importo ? ` · ${fmtEur(rq.importo)}` : ""}</p>
                    </div>
                    {rq.file_url && <a href={rq.file_url} target="_blank" rel="noreferrer" aria-label="Vedi originale" className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><Eye className="w-4 h-4" /></a>}
                    {rq.file_firmato_url && <a href={rq.file_firmato_url} target="_blank" rel="noreferrer" aria-label="Vedi firmato" className="p-1.5 rounded hover:bg-slate-100 text-blue-700"><CheckCircle2 className="w-4 h-4" /></a>}
                    {(rq.file_tipo === "image" || rq.file_tipo === "pdf") && profile && (profile.firma_url || profile.timbro_url) && (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setSignTarget(rq)}>{rq.file_firmato_url ? "Rifirma" : "Firma"}</Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === "email" && !readOnly && (
        <LinkedEmails field="worksite_id" id={id}
          composeDefaults={{ templateVars: { cantiere: worksite.nome, cliente: worksite.cliente_nome, totale: fmtEur(contractAmount) }, links: { contact_id: worksite.cliente_id || "" } }} />
      )}

      <WorksiteForm open={editOpen} onOpenChange={setEditOpen} worksite={worksite} quoteTotal={primaryQuote?.totale} onSaved={(s) => s && setWorksite(s)} />
      {signTarget && (
        <SignStampDialog open={!!signTarget} onOpenChange={(v) => { if (!v) { setSignTarget(null); load(); } }} receivedQuote={signTarget} profile={profile} onSaved={load} />
      )}
    </div>
  );
}
