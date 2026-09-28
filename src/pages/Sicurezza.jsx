import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  ShieldCheck, Plus, ArrowLeft, Sparkles, Loader2, FileDown, Trash2, Check, AlertTriangle, RefreshCw, X, Save, Mail, FolderInput, Copy, HardHat,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import ComposeDialog from "@/components/email/ComposeDialog";
import { LAVORAZIONI, DPI, SEZIONI, buildInitial, workerRow, checkSections, aiAssessLavorazione, riskLevel, buildPosPdf } from "@/lib/pos";
import PosSignatures from "@/components/pos/PosSignatures";

const STATI = { bozza: "Bozza", completo: "Completo", consegnato: "Consegnato al CSE" };
const lines = (arr) => (arr || []).join("\n");
const toLines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
const uniq = (a) => [...new Set(a.map((x) => String(x).trim()).filter(Boolean))];

export default function Sicurezza() {
  const { toast } = useToast();
  const [plans, setPlans] = useState([]);
  const [ctx, setCtx] = useState({ profile: null, worksites: [], employees: [], empDocs: [], contacts: [] });
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(() => new URLSearchParams(window.location.search).get("id"));
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    const safe = (p) => p.catch(() => []);
    const [p, prof, w, e, ed, c] = await Promise.all([
      safe(db.SafetyPlan.list("-updated_date")), safe(db.CompanyProfile.list()), safe(db.Worksite.list("-created_date")),
      safe(db.Employee.list()), safe(db.EmployeeDocument.list("-data_emissione", 5000)), safe(db.Contact.list()),
    ]);
    setPlans(p);
    setCtx({ profile: prof[0] || null, worksites: w, employees: e, empDocs: ed, contacts: c });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (id) => {
    setOpenId(id);
    const u = new URL(window.location.href);
    id ? u.searchParams.set("id", id) : u.searchParams.delete("id");
    window.history.replaceState(null, "", u);
  };

  const create = async (worksiteId) => {
    const w = ctx.worksites.find((x) => x.id === worksiteId);
    const client = w?.cliente_id ? ctx.contacts.find((c) => c.id === w.cliente_id) : null;
    const dati = buildInitial({ profile: ctx.profile, worksite: w, employees: ctx.employees, empDocs: ctx.empDocs, client });
    const plan = await db.SafetyPlan.create({ titolo: `POS – ${w?.nome || "Nuovo cantiere"}`, worksite_id: w?.id || "", worksite_nome: w?.nome || "", stato: "bozza", revisione: 0, data: new Date().toISOString().slice(0, 10), dati });
    setPlans((l) => [plan, ...l]);
    setNewOpen(false);
    open(plan.id);
  };

  const duplicate = async (p) => {
    const { id, created_date, updated_date, created_by_id, ...rest } = p; // eslint-disable-line no-unused-vars
    const copy = await db.SafetyPlan.create({ ...rest, titolo: `${p.titolo} (copia)`, stato: "bozza", revisione: 0, data: new Date().toISOString().slice(0, 10) });
    setPlans((l) => [copy, ...l]);
    toast({ title: "POS duplicato", description: "Aggiorna cantiere e lavorazioni." });
  };

  const remove = async (p) => {
    if (!confirm(`Eliminare "${p.titolo}"?`)) return;
    await db.SafetyPlan.delete(p.id);
    setPlans((l) => l.filter((x) => x.id !== p.id));
  };

  if (loading) return <LoadingSpinner />;
  const current = plans.find((p) => p.id === openId);
  if (current) return <Editor plan={current} ctx={ctx} onBack={() => { open(null); load(); }} onChange={(u) => setPlans((l) => l.map((x) => (x.id === u.id ? u : x)))} onProfile={(profile) => setCtx((c) => ({ ...c, profile }))} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Sicurezza · POS" subtitle="Il Piano Operativo di Sicurezza di ogni cantiere, completo secondo l'Allegato XV del D.Lgs. 81/2008: i dati arrivano dalle schede, l'IA valuta i rischi delle lavorazioni." actionLabel="Nuovo POS" onAction={() => setNewOpen(true)} actionIcon={Plus} />

      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-14 px-6 text-center">
          <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="mt-3 font-semibold text-slate-900">Nessun POS ancora</p>
          <p className="text-sm text-slate-500 mt-1 max-w-lg mx-auto">Scegli un cantiere: impresa, figure della sicurezza, lavoratori con i corsi e le visite e dati del committente si compilano da soli. Tu scegli le lavorazioni, l'IA scrive rischi, misure e DPI.</p>
          <Button onClick={() => setNewOpen(true)} className="mt-4 bg-brand-600 hover:bg-brand-700 gap-2"><Plus className="w-4 h-4" /> Nuovo POS</Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {plans.map((p) => {
            const miss = Object.values(checkSections(p.dati || {})).flat().length;
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col">
                <button onClick={() => open(p.id)} className="text-left flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 grid place-items-center shrink-0"><ShieldCheck className="w-5 h-5 text-emerald-700" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate hover:text-brand-700">{p.titolo}</p>
                    <p className="text-xs text-slate-500">Rev. {p.revisione || 0} · {new Date(p.data || p.created_date).toLocaleDateString("it-IT")} · {(p.dati?.lavorazioni || []).length} lavorazioni</p>
                  </div>
                </button>
                <div className="flex items-center gap-2 mt-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.stato === "consegnato" ? "bg-emerald-100 text-emerald-800" : p.stato === "completo" ? "bg-zinc-200 text-zinc-800" : "bg-slate-100 text-slate-700"}`}>{STATI[p.stato] || "Bozza"}</span>
                  {miss > 0 ? <span className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{miss} dati mancanti</span> : <span className="text-xs text-emerald-700 flex items-center gap-1"><Check className="w-3.5 h-3.5" />Completo</span>}
                  <div className="ml-auto flex">
                    <button onClick={() => duplicate(p)} className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100" title="Duplica per un altro cantiere" aria-label="Duplica"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => remove(p)} className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50" aria-label="Elimina"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo POS</DialogTitle>
            <DialogDescription>Per quale cantiere? I dati del lavoro e della squadra vengono copiati nel POS.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto -mx-2 space-y-0.5">
            {ctx.worksites.filter((w) => w.stato !== "finito").map((w) => (
              <button key={w.id} onClick={() => create(w.id)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50">
                <HardHat className="w-4 h-4 text-slate-500" />
                <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-slate-900 truncate">{w.nome}</span><span className="block text-xs text-slate-500 truncate">{[w.cliente_nome, w.indirizzo].filter(Boolean).join(" · ")}</span></span>
              </button>
            ))}
            <button onClick={() => create("")} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-sm text-slate-700"><Plus className="w-4 h-4" /> Cantiere non ancora inserito nei Lavori</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─────────────────────────── Editor ─────────────────────────── */

function Editor({ plan, ctx, onBack, onChange, onProfile }) {
  const { toast } = useToast();
  const [d, setD] = useState(plan.dati || {});
  const [meta, setMeta] = useState({ titolo: plan.titolo, stato: plan.stato || "bozza", revisione: plan.revisione || 0, data: plan.data });
  const [sec, setSec] = useState("impresa");
  const [saveState, setSaveState] = useState("saved");
  const [aiBusy, setAiBusy] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [compose, setCompose] = useState(null);
  const first = useRef(true);

  // salvataggio automatico
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaveState("dirty");
    const t = setTimeout(async () => {
      setSaveState("saving");
      try { onChange(await db.SafetyPlan.update(plan.id, { ...meta, dati: d })); setSaveState("saved"); }
      catch { setSaveState("error"); }
    }, 1200);
    return () => clearTimeout(t);
  }, [d, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const miss = useMemo(() => checkSections(d), [d]);
  const set = (path, value) => setD((prev) => {
    const [a, b] = path.split(".");
    return b ? { ...prev, [a]: { ...(prev[a] || {}), [b]: value } } : { ...prev, [a]: value };
  });

  const assess = async (idx) => {
    const l = d.lavorazioni[idx];
    setAiBusy(idx);
    try {
      const r = await aiAssessLavorazione(l.nome, { cantiere: [d.cantiere?.nome, d.cantiere?.indirizzo].filter(Boolean).join(", "), opera: d.cantiere?.descrizione_opera, note: l.note });
      setD((prev) => {
        const lav = prev.lavorazioni.map((x, k) => (k === idx ? { ...x, descrizione: r.descrizione || x.descrizione, fasi: r.fasi || [], rischi: (r.rischi || []).map((z) => ({ rischio: z.rischio, p: Math.min(4, Math.max(1, Math.round(z.p))), d: Math.min(4, Math.max(1, Math.round(z.d))) })), misure: r.misure || [], dpi: r.dpi || [], attrezzature: r.attrezzature || [], formazione: r.formazione || "" } : x));
        return {
          ...prev, lavorazioni: lav,
          attrezzature: { ...prev.attrezzature, macchine: uniq([...(prev.attrezzature?.macchine || []), ...(r.attrezzature || [])]) },
          dpi: uniq([...(prev.dpi || []), ...(r.dpi || [])]),
        };
      });
      return true;
    } catch (e) {
      toast({ title: `Non sono riuscito a valutare "${l.nome}"`, description: e.message, variant: "destructive" });
      return false;
    } finally { setAiBusy(null); }
  };
  const assessAll = async () => {
    const todo = d.lavorazioni.map((l, i) => (!l.rischi?.length ? i : -1)).filter((i) => i >= 0);
    for (const i of todo) { setAiBusy(i); await assess(i); } // eslint-disable-line no-await-in-loop
    toast({ title: "Valutazione dei rischi completata", description: "Controlla e adatta ogni scheda al tuo cantiere." });
  };
  const toggleLav = (nome) => setD((prev) => {
    const has = (prev.lavorazioni || []).some((l) => l.nome === nome);
    return { ...prev, lavorazioni: has ? prev.lavorazioni.filter((l) => l.nome !== nome) : [...(prev.lavorazioni || []), { nome, descrizione: "", rischi: [], misure: [], dpi: [] }] };
  });

  const pdf = async (mode) => {
    setPdfBusy(true);
    try {
      const doc = await buildPosPdf({ ...plan, ...meta, dati: d }, ctx.profile);
      const name = `POS_${(d.cantiere?.nome || "cantiere").replace(/[^\p{L}\p{N}]+/gu, "_")}_rev${meta.revisione}.pdf`;
      if (mode === "download") doc.save(name);
      if (mode === "email") setCompose({ attachment: { blob: doc.output("blob"), filename: name }, defaultSubject: `POS – ${d.cantiere?.nome || ""} – ${d.impresa?.ragione_sociale || ""}`, defaultBody: `Buongiorno,\n\nin allegato il Piano Operativo di Sicurezza (rev. ${meta.revisione}) per il cantiere ${d.cantiere?.nome || ""}${d.cantiere?.indirizzo ? `, ${d.cantiere.indirizzo}` : ""}, per la verifica di idoneità.\n\nCordiali saluti`, links: { worksite_id: plan.worksite_id || undefined } });
      if (mode === "archive") {
        const file = new File([doc.output("blob")], name, { type: "application/pdf" });
        const { file_url } = await api.integrations.Core.UploadFile({ file, private: true });
        await db.CompanyDocument.create({ titolo: `POS rev. ${meta.revisione} – ${d.cantiere?.nome || ""}`, tipo: "pos", file_url, nome_file: name, mime: "application/pdf", dimensione: file.size, data_emissione: meta.data, worksite_id: plan.worksite_id || "", worksite_nome: plan.worksite_nome || "" });
        toast({ title: "Salvato in Documenti ditta", description: "Lo trovi tra i documenti del cantiere." });
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Creazione del PDF non riuscita", variant: "destructive" });
    } finally { setPdfBusy(false); }
  };

  const saveDefaults = async () => {
    const i = d.impresa || {};
    const sicurezza = { datore_lavoro: i.datore_lavoro, rspp: i.rspp, medico_competente: i.medico_competente, rls: i.rls, addetti_primo_soccorso: i.addetti_primo_soccorso, addetti_antincendio: i.addetti_antincendio, direttore_tecnico: i.direttore_tecnico, capocantiere: i.capocantiere, posizione_inail: i.posizione_inail, posizione_inps: i.posizione_inps, cassa_edile: i.cassa_edile };
    if (!ctx.profile?.id) return;
    onProfile(await db.CompanyProfile.update(ctx.profile.id, { sicurezza }));
    toast({ title: "Salvato", description: "I prossimi POS partiranno da questi dati." });
  };

  const empNames = ctx.employees.map((e) => `${e.nome || ""} ${e.cognome || ""}`.trim());
  const totalMiss = Object.values(miss).flat().length;

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2"><ArrowLeft className="w-4 h-4" /> Tutti i POS</Button>
        <Input value={meta.titolo} onChange={(e) => setMeta({ ...meta, titolo: e.target.value })} className="flex-1 min-w-[220px] text-base font-semibold border-transparent hover:border-slate-200 focus:border-slate-300 bg-transparent" aria-label="Titolo" />
        <span className="text-xs text-slate-500 w-24 text-right">{saveState === "saving" ? "Salvataggio…" : saveState === "dirty" ? "Modifiche…" : saveState === "error" ? "Errore di salvataggio" : "Salvato"}</span>
        <Button variant="outline" size="sm" onClick={() => pdf("download")} disabled={pdfBusy} className="gap-1.5">{pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF</Button>
      </div>

      <div className="grid lg:grid-cols-[250px_minmax(0,1fr)] gap-4 items-start">
        <nav className="bg-white rounded-2xl border border-slate-200 p-1.5 lg:sticky lg:top-4 flex lg:flex-col gap-0.5 overflow-x-auto no-scrollbar min-w-0">
          {SEZIONI.map((s) => {
            const m = miss[s.key]?.length || 0;
            return (
              <button key={s.key} onClick={() => setSec(s.key)} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left whitespace-nowrap ${sec === s.key ? "bg-brand-50 text-brand-800 font-medium" : "text-slate-700 hover:bg-slate-50"}`}>
                <span className={`w-5 h-5 rounded-full text-[11px] font-semibold grid place-items-center shrink-0 ${m ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{m ? s.n : <Check className="w-3 h-3" />}</span>
                <span className="lg:whitespace-normal">{s.label}</span>
              </button>
            );
          })}
          <div className="hidden lg:block px-3 py-2 mt-1 border-t border-slate-100 text-xs text-slate-500">{totalMiss ? `${totalMiss} dati da completare` : "Tutte le sezioni sono complete"}</div>
        </nav>

        <div className="min-w-0 space-y-4">
          {miss[sec]?.length > 0 && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />Mancano: {miss[sec].join(", ")}</p>}

          {sec === "impresa" && (
            <Card title="Impresa e figure della sicurezza" action={<Button size="sm" variant="outline" onClick={saveDefaults} className="gap-1.5"><Save className="w-4 h-4" /> Usa per i prossimi POS</Button>}>
              <Grid>
                <F label="Ragione sociale" v={d.impresa?.ragione_sociale} on={(v) => set("impresa.ragione_sociale", v)} />
                <F label="Partita IVA" v={d.impresa?.partita_iva} on={(v) => set("impresa.partita_iva", v)} />
                <F label="Sede legale" v={d.impresa?.sede} on={(v) => set("impresa.sede", v)} wide />
                <F label="Telefono" v={d.impresa?.telefono} on={(v) => set("impresa.telefono", v)} />
                <F label="PEC" v={d.impresa?.pec} on={(v) => set("impresa.pec", v)} />
                <F label="Posizione INAIL" v={d.impresa?.posizione_inail} on={(v) => set("impresa.posizione_inail", v)} />
                <F label="Posizione INPS" v={d.impresa?.posizione_inps} on={(v) => set("impresa.posizione_inps", v)} />
                <F label="Cassa Edile" v={d.impresa?.cassa_edile} on={(v) => set("impresa.cassa_edile", v)} />
              </Grid>
              <Hr />
              <Grid>
                <F label="Datore di lavoro" v={d.impresa?.datore_lavoro} on={(v) => set("impresa.datore_lavoro", v)} list={empNames} />
                <F label="RSPP" v={d.impresa?.rspp} on={(v) => set("impresa.rspp", v)} />
                <F label="Medico competente" v={d.impresa?.medico_competente} on={(v) => set("impresa.medico_competente", v)} />
                <F label="RLS / RLST" v={d.impresa?.rls} on={(v) => set("impresa.rls", v)} list={empNames} />
                <F label="Direttore tecnico di cantiere" v={d.impresa?.direttore_tecnico} on={(v) => set("impresa.direttore_tecnico", v)} list={empNames} />
                <F label="Capocantiere / preposto" v={d.impresa?.capocantiere} on={(v) => set("impresa.capocantiere", v)} list={empNames} />
                <Tags label="Addetti al primo soccorso" v={d.impresa?.addetti_primo_soccorso} on={(v) => set("impresa.addetti_primo_soccorso", v)} options={empNames} />
                <Tags label="Addetti antincendio ed evacuazione" v={d.impresa?.addetti_antincendio} on={(v) => set("impresa.addetti_antincendio", v)} options={empNames} />
              </Grid>
            </Card>
          )}

          {sec === "cantiere" && (
            <Card title="Cantiere e committente">
              <Grid>
                <F label="Nome del cantiere" v={d.cantiere?.nome} on={(v) => set("cantiere.nome", v)} />
                <F label="Indirizzo" v={d.cantiere?.indirizzo} on={(v) => set("cantiere.indirizzo", v)} />
                <F label="Opera da realizzare" v={d.cantiere?.descrizione_opera} on={(v) => set("cantiere.descrizione_opera", v)} wide />
                <F label="Committente" v={d.cantiere?.committente} on={(v) => set("cantiere.committente", v)} />
                <F label="Indirizzo del committente" v={d.cantiere?.committente_indirizzo} on={(v) => set("cantiere.committente_indirizzo", v)} />
                <F label="Responsabile dei lavori" v={d.cantiere?.responsabile_lavori} on={(v) => set("cantiere.responsabile_lavori", v)} />
                <F label="Direttore dei lavori" v={d.cantiere?.direttore_lavori} on={(v) => set("cantiere.direttore_lavori", v)} />
                <F label="Coordinatore progettazione (CSP)" v={d.cantiere?.csp} on={(v) => set("cantiere.csp", v)} />
                <F label="Coordinatore esecuzione (CSE)" v={d.cantiere?.cse} on={(v) => set("cantiere.cse", v)} />
                <F label="Inizio lavori" type="date" v={d.cantiere?.data_inizio} on={(v) => set("cantiere.data_inizio", v)} />
                <F label="Fine lavori prevista" type="date" v={d.cantiere?.data_fine} on={(v) => set("cantiere.data_fine", v)} />
                <F label="Titolo edilizio" v={d.cantiere?.titolo_edilizio} on={(v) => set("cantiere.titolo_edilizio", v)} />
                <F label="Orario di lavoro" v={d.cantiere?.orario} on={(v) => set("cantiere.orario", v)} />
              </Grid>
              <label className="flex items-center gap-2 text-sm text-slate-700 mt-4"><Switch checked={d.cantiere?.presenza_psc !== false} onCheckedChange={(v) => set("cantiere.presenza_psc", v)} /> Nel cantiere c'è un PSC (più imprese presenti)</label>
              <Area label="Modalità organizzative (accessi, aree di stoccaggio, viabilità, servizi igienici…)" v={d.cantiere?.organizzazione} on={(v) => set("cantiere.organizzazione", v)} rows={4} />
              <p className="text-sm font-medium text-slate-800 mt-5 mb-2">Subappaltatori e lavoratori autonomi</p>
              {(d.cantiere?.subappaltatori || []).map((s, k) => (
                <div key={k} className="flex gap-2 mb-2">
                  <Input value={s.nome} placeholder="Impresa" onChange={(e) => set("cantiere.subappaltatori", d.cantiere.subappaltatori.map((x, j) => (j === k ? { ...x, nome: e.target.value } : x)))} />
                  <Input value={s.lavorazioni} placeholder="Lavorazioni affidate" onChange={(e) => set("cantiere.subappaltatori", d.cantiere.subappaltatori.map((x, j) => (j === k ? { ...x, lavorazioni: e.target.value } : x)))} />
                  <button onClick={() => set("cantiere.subappaltatori", d.cantiere.subappaltatori.filter((_, j) => j !== k))} className="p-2 text-slate-500 hover:text-red-600" aria-label="Rimuovi"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => set("cantiere.subappaltatori", [...(d.cantiere?.subappaltatori || []), { nome: "", lavorazioni: "" }])}><Plus className="w-4 h-4" /> Aggiungi</Button>
            </Card>
          )}

          {sec === "lavoratori" && (
            <Card title="Lavoratori e formazione" action={<Button size="sm" variant="outline" className="gap-1.5" onClick={() => set("lavoratori", (d.lavoratori || []).map((l) => { const e = ctx.employees.find((x) => x.id === l.id); return e ? { ...workerRow(e, ctx.empDocs), mansione: l.mansione } : l; }))}><RefreshCw className="w-4 h-4" /> Aggiorna corsi e visite</Button>}>
              <p className="text-sm text-slate-500 mb-3">Formazione e idoneità arrivano dalle schede dei dipendenti. Scrivi la mansione che ognuno svolgerà in questo cantiere.</p>
              <div className="space-y-2">
                {(d.lavoratori || []).map((l, k) => (
                  <div key={l.id || k} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{l.nome}</p>
                        <p className="text-xs text-slate-500">{l.qualifica || "—"}{l.idoneita ? ` · ${l.idoneita}` : " · idoneità non registrata"}</p>
                      </div>
                      <button onClick={() => set("lavoratori", d.lavoratori.filter((_, j) => j !== k))} className="p-1 text-slate-500 hover:text-red-600" aria-label="Rimuovi"><X className="w-4 h-4" /></button>
                    </div>
                    <Input className="mt-2" value={l.mansione || ""} placeholder="Mansione in cantiere (es. muratore, addetto ai ponteggi)" onChange={(e) => set("lavoratori", d.lavoratori.map((x, j) => (j === k ? { ...x, mansione: e.target.value } : x)))} />
                    <p className={`text-xs mt-1.5 ${l.formazione ? "text-slate-600" : "text-amber-700"}`}>{l.formazione ? `Formazione: ${l.formazione}` : "Nessun attestato di formazione registrato"}</p>
                  </div>
                ))}
              </div>
              <Select onValueChange={(id) => { const e = ctx.employees.find((x) => x.id === id); if (e && !(d.lavoratori || []).some((l) => l.id === id)) set("lavoratori", [...(d.lavoratori || []), workerRow(e, ctx.empDocs)]); }}>
                <SelectTrigger className="mt-3 w-64"><SelectValue placeholder="+ Aggiungi un dipendente" /></SelectTrigger>
                <SelectContent>{ctx.employees.filter((e) => !(d.lavoratori || []).some((l) => l.id === e.id)).map((e) => <SelectItem key={e.id} value={e.id}>{`${e.nome || ""} ${e.cognome || ""}`}</SelectItem>)}</SelectContent>
              </Select>
              <Area label="Note su informazione e formazione fornite ai lavoratori" v={d.formazione_note} on={(v) => set("formazione_note", v)} rows={3} />
            </Card>
          )}

          {sec === "lavorazioni" && (
            <>
              <Card title="Quali lavorazioni farete in questo cantiere">
                <div className="flex flex-wrap gap-1.5">
                  {LAVORAZIONI.map((n) => {
                    const on = (d.lavorazioni || []).some((l) => l.nome === n);
                    return <button key={n} onClick={() => toggleLav(n)} className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>{on && <Check className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />}{n}</button>;
                  })}
                </div>
                <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); const v = e.target.elements.nuova.value.trim(); if (v) { toggleLav(v); e.target.reset(); } }}>
                  <Input name="nuova" placeholder="Altra lavorazione (es. posa di pannelli radianti)" className="max-w-md" />
                  <Button type="submit" variant="outline" className="gap-1.5"><Plus className="w-4 h-4" /> Aggiungi</Button>
                </form>
                {(d.lavorazioni || []).some((l) => !l.rischi?.length) && (
                  <Button onClick={assessAll} disabled={aiBusy != null} className="mt-4 bg-brand-600 hover:bg-brand-700 gap-1.5">
                    {aiBusy != null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Valuta i rischi con l'IA ({(d.lavorazioni || []).filter((l) => !l.rischi?.length).length})
                  </Button>
                )}
              </Card>
              {(d.lavorazioni || []).map((l, k) => (
                <LavCard key={l.nome} l={l} idx={k} busy={aiBusy === k} onAssess={() => assess(k)}
                  onChange={(patch) => set("lavorazioni", d.lavorazioni.map((x, j) => (j === k ? { ...x, ...patch } : x)))}
                  onRemove={() => toggleLav(l.nome)} />
              ))}
            </>
          )}

          {sec === "attrezzature" && (
            <Card title="Macchine, attrezzature e opere provvisionali">
              <p className="text-sm text-slate-500 mb-2">Si riempie da solo con le attrezzature delle lavorazioni valutate dall'IA. Una per riga.</p>
              <Area label="Macchine e attrezzature (con marca/modello se utile)" v={lines(d.attrezzature?.macchine)} on={(v) => set("attrezzature.macchine", toLines(v))} rows={8} />
              <Area label="Ponteggi, trabattelli, parapetti e opere provvisionali" v={lines(d.attrezzature?.opere_provvisionali)} on={(v) => set("attrezzature.opere_provvisionali", toLines(v))} rows={4} placeholder="es. Ponteggio a telai prefabbricati con PiMUS" />
              <Area label="Impianti di cantiere (elettrico, messa a terra, idrico…)" v={lines(d.attrezzature?.impianti)} on={(v) => set("attrezzature.impianti", toLines(v))} rows={3} />
            </Card>
          )}

          {sec === "sostanze" && (
            <Card title="Sostanze pericolose e rumore">
              <p className="text-sm font-medium text-slate-800 mb-2">Sostanze e preparati pericolosi</p>
              {(d.sostanze || []).map((s, k) => (
                <div key={k} className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-2">
                  <Input value={s.nome} placeholder="Prodotto" onChange={(e) => set("sostanze", d.sostanze.map((x, j) => (j === k ? { ...x, nome: e.target.value } : x)))} />
                  <Input value={s.uso} placeholder="Impiego" onChange={(e) => set("sostanze", d.sostanze.map((x, j) => (j === k ? { ...x, uso: e.target.value } : x)))} />
                  <Input value={s.scheda} placeholder="Scheda di sicurezza" onChange={(e) => set("sostanze", d.sostanze.map((x, j) => (j === k ? { ...x, scheda: e.target.value } : x)))} />
                  <button onClick={() => set("sostanze", d.sostanze.filter((_, j) => j !== k))} className="p-2 text-slate-500 hover:text-red-600" aria-label="Rimuovi"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => set("sostanze", [...(d.sostanze || []), { nome: "", uso: "", scheda: "Disponibile in cantiere" }])}><Plus className="w-4 h-4" /> Aggiungi sostanza</Button>
              <Hr />
              <Area label="Esito della valutazione del rumore" v={d.rumore?.esito} on={(v) => set("rumore.esito", v)} rows={2} />
              <Grid>
                <F label="Livello di esposizione (es. LEX,8h 85 dB(A))" v={d.rumore?.livello} on={(v) => set("rumore.livello", v)} />
                <F label="Misure adottate" v={d.rumore?.misure} on={(v) => set("rumore.misure", v)} />
              </Grid>
            </Card>
          )}

          {sec === "dpi" && (
            <Card title="DPI e misure integrative">
              <div className="grid sm:grid-cols-2 gap-1.5">
                {uniq([...DPI, ...(d.dpi || [])]).map((x) => {
                  const on = (d.dpi || []).includes(x);
                  return (
                    <label key={x} className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 cursor-pointer ${on ? "border-brand-300 bg-brand-50/60" : "border-slate-200"}`}>
                      <input type="checkbox" checked={on} onChange={() => set("dpi", on ? d.dpi.filter((y) => y !== x) : [...(d.dpi || []), x])} /> {x}
                    </label>
                  );
                })}
              </div>
              <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); const v = e.target.elements.dpi.value.trim(); if (v) { set("dpi", uniq([...(d.dpi || []), v])); e.target.reset(); } }}>
                <Input name="dpi" placeholder="Altro DPI" className="max-w-sm" />
                <Button type="submit" variant="outline"><Plus className="w-4 h-4" /></Button>
              </form>
              <Area label="Misure preventive e protettive integrative rispetto al PSC" v={d.misure_integrative} on={(v) => set("misure_integrative", v)} rows={4} />
              <Area label="Procedure complementari e di dettaglio richieste dal PSC" v={d.procedure_psc} on={(v) => set("procedure_psc", v)} rows={4} />
            </Card>
          )}

          {sec === "emergenze" && (
            <Card title="Emergenze e primo soccorso">
              <Grid>
                <F label="Pronto soccorso più vicino (nome e indirizzo)" v={d.emergenze?.ospedale} on={(v) => set("emergenze.ospedale", v)} wide />
                <F label="Punto di raccolta" v={d.emergenze?.punto_raccolta} on={(v) => set("emergenze.punto_raccolta", v)} />
                <F label="Mezzi antincendio" v={d.emergenze?.estintori} on={(v) => set("emergenze.estintori", v)} />
              </Grid>
              <Area label="Procedura di emergenza" v={d.emergenze?.procedure} on={(v) => set("emergenze.procedure", v)} rows={5} />
            </Card>
          )}

          {sec === "firme" && (
            <Card title="Dichiarazione, firme e consegna">
              <Grid>
                <F label="Luogo" v={d.firme?.luogo} on={(v) => set("firme.luogo", v)} />
                <F label="Data" type="date" v={d.firme?.data} on={(v) => set("firme.data", v)} />
                <div>
                  <Label htmlFor="sicurezza-stato" className="text-sm text-slate-700">Stato</Label>
                  <Select value={meta.stato} onValueChange={(v) => setMeta({ ...meta, stato: v })}>
                    <SelectTrigger id="sicurezza-stato" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STATI).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="sicurezza-revisione" className="text-sm text-slate-700">Revisione</Label>
                  <div className="flex gap-2 mt-1">
                    <Input id="sicurezza-revisione" readOnly value={`Rev. ${meta.revisione} del ${new Date(meta.data).toLocaleDateString("it-IT")}`} />
                    <Button variant="outline" onClick={() => confirm("Creare una nuova revisione? Numero e data verranno aggiornati.") && setMeta({ ...meta, revisione: meta.revisione + 1, data: new Date().toISOString().slice(0, 10) })}>Nuova</Button>
                  </div>
                </div>
              </Grid>
              <p className="text-sm text-slate-600 mt-4">Nel PDF compaiono le righe per le firme di datore di lavoro, RSPP, RLS e CSE; la firma del datore di lavoro viene presa dal Profilo ditta. Le firme raccolte dal telefono vengono aggiunte in fondo.</p>
              <PosSignatures plan={plan} dati={d} revisione={meta.revisione} onChange={onChange} />
              {totalMiss > 0 && <p className="text-sm text-amber-800 mt-3 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Prima di consegnarlo completa i {totalMiss} dati mancanti (vedi le sezioni con il numero arancione).</p>}
              <div className="flex flex-wrap gap-2 mt-5">
                <Button onClick={() => pdf("download")} disabled={pdfBusy} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Scarica il PDF</Button>
                <Button variant="outline" onClick={() => pdf("email")} disabled={pdfBusy} className="gap-1.5"><Mail className="w-4 h-4" /> Invia al CSE</Button>
                <Button variant="outline" onClick={() => pdf("archive")} disabled={pdfBusy} className="gap-1.5"><FolderInput className="w-4 h-4" /> Salva in Documenti ditta</Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {compose && <ComposeDialog open onOpenChange={(v) => !v && setCompose(null)} {...compose} context="Invio del POS al coordinatore per la sicurezza in fase di esecuzione" onSent={() => setMeta((m) => ({ ...m, stato: "consegnato" }))} />}
    </div>
  );
}

function LavCard({ l, idx, busy, onAssess, onChange, onRemove }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div className="flex items-start gap-2">
        <h3 className="flex-1 text-sm font-semibold text-slate-900">4.{idx + 1} · {l.nome}</h3>
        <Button size="sm" variant="outline" onClick={onAssess} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{l.rischi?.length ? "Rigenera" : "Valuta con IA"}</Button>
        <button onClick={onRemove} className="p-1.5 text-slate-500 hover:text-red-600" aria-label="Rimuovi lavorazione"><X className="w-4 h-4" /></button>
      </div>
      <Input value={l.note || ""} onChange={(e) => onChange({ note: e.target.value })} placeholder="Dettagli per l'IA (es. copertura a 9 m, tegole in cotto, accesso da cortile)" className="mt-3" />
      {!l.rischi?.length ? <p className="text-sm text-slate-500 mt-3">Premi "Valuta con IA" per ottenere rischi, misure e DPI di questa lavorazione.</p> : (
        <>
          <Area label="Descrizione" v={l.descrizione} on={(v) => onChange({ descrizione: v })} rows={3} />
          <p className="text-sm font-medium text-slate-800 mt-4 mb-2">Rischi (P × D)</p>
          <div className="space-y-1.5">
            {l.rischi.map((r, k) => {
              const lv = riskLevel(r.p, r.d);
              const upd = (patch) => onChange({ rischi: l.rischi.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
              return (
                <div key={k} className="grid grid-cols-[1fr_56px_56px_84px_28px] gap-1.5 items-center">
                  <Input value={r.rischio} onChange={(e) => upd({ rischio: e.target.value })} className="h-8 text-sm" />
                  <Input type="number" min={1} max={4} value={r.p} onChange={(e) => upd({ p: Math.min(4, Math.max(1, Number(e.target.value) || 1)) })} className="h-8 text-sm" aria-label="Probabilità" />
                  <Input type="number" min={1} max={4} value={r.d} onChange={(e) => upd({ d: Math.min(4, Math.max(1, Number(e.target.value) || 1)) })} className="h-8 text-sm" aria-label="Danno" />
                  <span className={`text-xs font-semibold text-center rounded-md py-1.5 ${lv.className}`}>{lv.r} {lv.label}</span>
                  <button onClick={() => onChange({ rischi: l.rischi.filter((_, j) => j !== k) })} className="text-slate-500 hover:text-red-600" aria-label="Rimuovi rischio"><X className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
          <button onClick={() => onChange({ rischi: [...l.rischi, { rischio: "", p: 2, d: 2 }] })} className="text-sm text-brand-700 hover:underline mt-2">+ rischio</button>
          <div className="grid md:grid-cols-2 gap-3">
            <Area label="Misure di prevenzione e protezione (una per riga)" v={lines(l.misure)} on={(v) => onChange({ misure: toLines(v) })} rows={6} />
            <Area label="DPI (uno per riga)" v={lines(l.dpi)} on={(v) => onChange({ dpi: toLines(v) })} rows={6} />
          </div>
        </>
      )}
    </section>
  );
}

/* ─── piccoli componenti di modulo ─── */

function Card({ title, action, children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4"><h2 className="text-base font-semibold text-slate-900">{title}</h2>{action}</div>
      {children}
    </section>
  );
}
const Grid = ({ children }) => <div className="grid sm:grid-cols-2 gap-3">{children}</div>;
const Hr = () => <div className="border-t border-slate-100 my-5" />;
function F({ label, v, on, wide, type = "text", list }) {
  const id = `f-${label.replace(/\W+/g, "-")}`;
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <Label htmlFor={id} className="text-sm text-slate-700">{label}</Label>
      <Input id={id} type={type} value={v || ""} onChange={(e) => on(e.target.value)} className="mt-1" list={list ? `${id}-l` : undefined} />
      {list && <datalist id={`${id}-l`}>{list.map((x) => <option key={x} value={x} />)}</datalist>}
    </div>
  );
}
function Area({ label, v, on, rows = 3, placeholder }) {
  return (
    <div className="mt-4">
      <Label htmlFor="sicurezza-campo" className="text-sm text-slate-700">{label}</Label>
      <Textarea id="sicurezza-campo" value={v || ""} onChange={(e) => on(e.target.value)} rows={rows} className="mt-1" placeholder={placeholder} />
    </div>
  );
}
function Tags({ label, v = [], on, options = [] }) {
  const [text, setText] = useState("");
  const id = `t-${label.replace(/\W+/g, "-")}`;
  const add = (x) => { const s = x.trim(); if (s && !v.includes(s)) on([...v, s]); setText(""); };
  return (
    <div>
      <Label htmlFor={id} className="text-sm text-slate-700">{label}</Label>
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-input p-1.5 min-h-10">
        {v.map((x) => <span key={x} className="text-sm bg-slate-100 rounded px-2 py-0.5 flex items-center gap-1">{x}<button onClick={() => on(v.filter((y) => y !== x))} aria-label={`Rimuovi ${x}`}><X className="w-3 h-3" /></button></span>)}
        <input id={id} list={`${id}-l`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(text); } }} onBlur={() => text && add(text)} placeholder="Nome e invio" className="flex-1 min-w-[120px] text-sm outline-none px-1" />
        <datalist id={`${id}-l`}>{options.map((x) => <option key={x} value={x} />)}</datalist>
      </div>
    </div>
  );
}
