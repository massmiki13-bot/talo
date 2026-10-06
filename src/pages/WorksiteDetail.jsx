import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { Pencil, MapPin, Navigation, Users, CalendarDays, FileText, Inbox, Eye, FileDown, AlertTriangle, TrendingUp, Plus, Loader2, HardHat, ClipboardList, Edit3, CheckCircle2,
} from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { DetailHero, DetailCard, DetailTabs, HeroButton, StatusPill, Alerts, eurShort } from "@/components/shared/DetailLayout";
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
import ClientAreaDialog from "@/components/worksite/ClientAreaDialog";
import WorksiteMaterials from "@/components/worksite/WorksiteMaterials";
import { randomToken } from "@/lib/quotes";
import { getAccessContext } from "@/lib/accessScope";
import { WORKSITE_STATES, COST_CATEGORIES, laborFromAttendance, economics, installments, incomeOf, fmtDate, daysBetween } from "@/lib/worksites";
import { fmtEur } from "@/lib/quotes";
import { fullName } from "@/lib/employees";
import { exportWorksiteFolder } from "@/utils/worksiteExport";
import { generateWorksiteReport } from "@/utils/worksiteReport";
import { downloadBlob } from "@/utils/employeePdf";

const Card = ({ icon, title, action, children }) => <DetailCard icon={icon} title={title} action={action}>{children}</DetailCard>;

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
  const [clientArea, setClientArea] = useState(false);

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
  const income = useMemo(() => incomeOf(payments, transactions), [payments, transactions]);
  const rate = useMemo(() => installments(worksite?.piano_pagamenti || [], income), [worksite, income]);

  if (loading || !worksite) return <LoadingSpinner />;

  const st = WORKSITE_STATES[worksite.stato] || WORKSITE_STATES.da_iniziare;
  const team = (worksite.squadra_ids || []).map((eid) => employees.find((e) => e.id === eid)).filter(Boolean);
  const capo = employees.find((e) => e.id === worksite.responsabile_id);
  const incassato = income.reduce((s, p) => s + (Number(p.importo) || 0), 0);
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
      const blob = await generateWorksiteReport({ worksite, profile, econ, labor, payments: income, rate, photos, logsCount, team: team.map(fullName) }, { internal });
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
    ...(readOnly ? [] : [["economia", "Costi e margine", econ.sforamenti.length], ["incassi", "Incassi", overdueRates.length]]),
    ...(readOnly ? [] : [["materiali", "Materiali e DDT"]]),
    ["giornale", "Giornale"],
    ["foto", "Foto e documenti"],
    ...(readOnly ? [] : [["email", "Email"]]),
  ];

  return (
    <div className="space-y-5">
      <DetailHero
        back={{ to: "/lavori", label: "Lavori" }}
        eyebrow={worksite.tipo_intervento || "Lavoro"}
        title={worksite.nome}
        badge={readOnly
          ? <StatusPill className={st.className}>{st.label}</StatusPill>
          : (
            <Select value={worksite.stato || "da_iniziare"} onValueChange={changeState}>
              <SelectTrigger aria-label="Stato del lavoro" className={`h-7 w-auto gap-1.5 rounded-full border-0 text-xs font-semibold ${st.className}`}><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(WORKSITE_STATES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
        meta={[
          worksite.cliente_nome && (worksite.cliente_id ? <Link to={`/contatti/${worksite.cliente_id}`} className="hover:text-white underline-offset-4 hover:underline">{worksite.cliente_nome}</Link> : worksite.cliente_nome),
          worksite.indirizzo && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(worksite.indirizzo)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-white"><MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{worksite.indirizzo}</span><Navigation className="w-3 h-3 shrink-0" aria-hidden="true" /></a>,
          (worksite.data_inizio || worksite.data_fine_prevista) && <><CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />{worksite.data_inizio ? fmtDate(worksite.data_inizio) : "?"} → {fmtDate(worksite.data_fine_effettiva || worksite.data_fine_prevista)}{late && <span className="text-brand-400 font-medium">· in ritardo</span>}</>,
          capo && <><HardHat className="w-3.5 h-3.5" aria-hidden="true" />{fullName(capo)}</>,
        ]}
        actions={!readOnly && (
          <>
            <HeroButton primary onClick={() => setTab("economia")}><Plus className="w-4 h-4" aria-hidden="true" />Spesa</HeroButton>
            <HeroButton onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4" aria-hidden="true" />Modifica</HeroButton>
            <HeroButton onClick={async () => { if (!worksite.cliente_token) setWorksite(await db.Worksite.update(id, { cliente_token: randomToken() })); setClientArea(true); }}><Users className="w-4 h-4" aria-hidden="true" />Area cliente</HeroButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><HeroButton>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileDown className="w-4 h-4" aria-hidden="true" />}Documenti</HeroButton></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => report(true)}><FileDown className="w-4 h-4 mr-2" /> Resoconto interno (con costi)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => report(false)}><FileDown className="w-4 h-4 mr-2" /> Relazione per il cliente</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportFolder}><FileDown className="w-4 h-4 mr-2" /> Cartella completa (Excel)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        stats={[
          { label: "Avanzamento", value: `${Math.round(worksite.avanzamento || 0)}%`, progress: worksite.avanzamento || 0, sub: late ? "fine prevista superata" : worksite.data_fine_prevista ? `fine ${fmtDate(worksite.data_fine_prevista)}` : undefined, tone: late ? "bad" : undefined },
          { label: "Ore lavorate", value: `${labor.ore.toLocaleString("it-IT")} h`, sub: `${labor.giorni} giornate · ${labor.persone.size} persone` },
          ...(readOnly ? [] : [
            { label: "Incassato", value: eurShort(incassato), sub: contractAmount ? `${Math.round((incassato / contractAmount) * 100)}% di ${eurShort(contractAmount)}` : "nessun importo di contratto", progress: contractAmount ? (incassato / contractAmount) * 100 : undefined },
            { label: "Margine ad oggi", value: eurShort(econ.margineReale), sub: `costi ${eurShort(econ.costi)}${econ.ricavo ? ` · ${Math.round((econ.margineReale / econ.ricavo) * 100)}%` : ""}`, tone: econ.margineReale < 0 && econ.costi > 0 ? "bad" : "good" },
          ]),
        ]}
      />

      {!readOnly && <Alerts items={alerts.map((a) => ({ ...a, icon: AlertTriangle }))} />}

      <DetailTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "panoramica" && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <WorksitePhases worksite={worksite} contractAmount={contractAmount} readOnly={readOnly} onSaved={(s) => s && setWorksite(s)} />
          <div className="space-y-4">
            <Card icon={Users} title="Squadra">
              {team.length ? (
                <ul className="divide-y divide-slate-100">
                  {team.map((e) => (
                    <li key={e.id} className="py-2 flex items-center gap-3">
                      <Link to={`/dipendenti/${e.id}`} className="text-sm text-slate-900 hover:underline flex-1">{fullName(e)}{e.id === worksite.responsabile_id && <span className="ml-2 text-[10px] font-bold uppercase bg-zinc-200 text-zinc-800 rounded px-1.5">Capocantiere</span>}</Link>
                      <span className="text-xs text-slate-500">{e.ruolo}</span>
                      <span className="text-xs text-slate-700 tabular-nums w-14 text-right">{labor.persone.get(e.id) || 0} h</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">Nessuna squadra assegnata.{!readOnly && <> <button className="text-brand-700 underline" onClick={() => setEditOpen(true)}>Assegnala</button></>}</p>}
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
                            {c === "Manodopera" && <button aria-label="Modifica costo manodopera" onClick={() => setLaborEdit(worksite.costo_manodopera_manuale ?? "")} className="ml-1 text-slate-500 hover:text-brand-700"><Pencil className="w-3.5 h-3.5 inline" /></button>}
                          </>
                        )}
                      </span>
                    </div>
                    {b > 0 && <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className={`h-full ${r > b ? "bg-red-500" : pct > 85 ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${pct}%` }} /></div>}
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

      {tab === "materiali" && !readOnly && <WorksiteMaterials worksite={worksite} transactions={transactions} allWorksites={allWorksites} onChanged={load} />}

      {tab === "incassi" && !readOnly && (
        <WorksiteMoney worksite={worksite} contractAmount={contractAmount} extraIncome={income.filter((x) => x.da_movimenti)} onSaved={(s) => s && setWorksite(s)} onPaymentsChange={setPayments} />
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
                    {rq.file_firmato_url && <a href={rq.file_firmato_url} target="_blank" rel="noreferrer" aria-label="Vedi firmato" className="p-1.5 rounded hover:bg-slate-100 text-brand-700"><CheckCircle2 className="w-4 h-4" /></a>}
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

      {worksite.cliente_token && <ClientAreaDialog open={clientArea} onOpenChange={setClientArea} worksite={worksite} onChange={setWorksite} />}
      <WorksiteForm open={editOpen} onOpenChange={setEditOpen} worksite={worksite} quoteTotal={primaryQuote?.totale} onSaved={(s) => s && setWorksite(s)} />
      {signTarget && (
        <SignStampDialog open={!!signTarget} onOpenChange={(v) => { if (!v) { setSignTarget(null); load(); } }} receivedQuote={signTarget} profile={profile} onSaved={load} />
      )}
    </div>
  );
}
