import React, { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { FileSignature, Search, Clock, PenLine, CheckCircle2, Euro, Plus, Bookmark, Trash2, AlertTriangle, Users, HardHat, Handshake } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import ContractWizard from "@/components/contracts/ContractWizard";
import ContractDetailSheet from "@/components/contracts/ContractDetailSheet";
import ContractPreviewDialog from "@/components/contracts/ContractPreviewDialog";
import { STATI, statoOf, categoryOf, typeTitle, summaryFields, fmtDate, CATEGORIES } from "@/lib/contracts";
import { deleteRemindersForDoc } from "@/utils/expirationReminders";
import { formatEuro } from "@/utils/pdfUtils";

const today = () => new Date().toISOString().slice(0, 10);
const daysTo = (d) => Math.ceil((new Date(d) - new Date(today())) / 86_400_000);
const CAT_ICON = { lavoro: Users, commerciale: HardHat, altro: Handshake, custom: Bookmark };

function expiry(c) {
  if (!c.data_scadenza || ["concluso", "annullato"].includes(c.stato)) return null;
  const d = daysTo(c.data_scadenza);
  if (d < 0) return { label: "Scaduto", className: "bg-red-100 text-red-700" };
  if (d <= 60) return { label: `Scade tra ${d} gg`, className: "bg-amber-100 text-amber-800" };
  return null;
}

export default function Contracts() {
  const { toast } = useToast();
  const [contracts, setContracts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [worksites, setWorksites] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [statoFilter, setStatoFilter] = useState("all");
  const [wizard, setWizard] = useState(null); // { initial }
  const [detailId, setDetailId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, t, e, k, w, p] = await Promise.all([
        db.GeneratedContract.list("-created_date"), db.ContractTemplate.list(), db.Employee.list(), db.Contact.list(), db.Worksite.list("-created_date"), db.CompanyProfile.list(),
      ]);
      setContracts(c); setTemplates(t); setEmployees(e); setContacts(k); setWorksites(w); setProfile(p[0] || null);
      return c;
    } catch (err) { console.error(err); return []; }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load().then((c) => {
      const p = new URLSearchParams(window.location.search);
      const id = p.get("id");
      if (id && c.some((x) => x.id === id)) setDetailId(id);
      // avvio da altre pagine: /contratti?nuovo=appalto&worksite=… / &dipendente=… / &contatto=…
      const nuovo = p.get("nuovo");
      if (nuovo || id) window.history.replaceState(null, "", window.location.pathname);
      if (nuovo) setWizard({ initial: { tipo: nuovo === "1" ? "" : nuovo, links: { worksite_id: p.get("worksite") || "", dipendente_id: p.get("dipendente") || "", contatto_id: p.get("contatto") || "" } } });
    });
  }, [load]);

  const kpi = useMemo(() => {
    const y = String(new Date().getFullYear());
    let firmati = 0, daFirmare = 0, inScadenza = 0, valore = 0;
    for (const c of contracts) {
      if (["firmato"].includes(c.stato)) firmati++;
      if (c.stato === "inviato") daFirmare++;
      if (expiry(c)) inScadenza++;
      if (["firmato", "concluso"].includes(c.stato) && categoryOf(c.tipo) === "commerciale" && String(c.firmato_il || c.data_creazione || "").startsWith(y)) valore += Number(c.importo) || 0;
    }
    return { firmati, daFirmare, inScadenza, valore };
  }, [contracts]);

  const q = query.trim().toLowerCase();
  const list = useMemo(() => contracts.filter((c) =>
    (cat === "all" || categoryOf(c.tipo) === cat) &&
    (statoFilter === "all" || (statoFilter === "scadenza" ? !!expiry(c) : (c.stato || "bozza") === statoFilter)) &&
    (!q || [c.titolo, c.controparte_nome, typeTitle(c.tipo, templates)].some((v) => String(v || "").toLowerCase().includes(q)))), [contracts, cat, statoFilter, q, templates]);

  const detail = contracts.find((c) => c.id === detailId) || null;
  const replaceOne = (u) => setContracts((all) => all.map((x) => (x.id === u.id ? u : x)));

  const save = async ({ tipo, variant, fields, links, content, templateText, saveAsTemplate, templateName }) => {
    try {
      const s = summaryFields(fields);
      const base = typeTitle(tipo, templates).replace(/^Contratto di /, "").replace(/^Contratto /, "");
      const created = await db.GeneratedContract.create({
        tipo, variante: variant, titolo: `${base.charAt(0).toUpperCase()}${base.slice(1)}${s.controparte_nome ? ` – ${s.controparte_nome}` : ""}`,
        dati_compilati: fields, contenuto_finale: content, data_creazione: today(), stato: "bozza",
        ...s, dipendente_id: links.dipendente_id || "", contatto_id: links.contatto_id || "", worksite_id: links.worksite_id || "",
      });
      if (saveAsTemplate) await db.ContractTemplate.create({ nome: templateName, tipo: tipo.startsWith("custom_") ? "generico" : tipo, contenuto: templateText });
      setContracts((all) => [created, ...all]);
      if (saveAsTemplate) setTemplates(await db.ContractTemplate.list());
      setWizard(null);
      setDetailId(created.id);
      toast({ title: "Contratto creato", description: "Ora puoi scaricarlo, inviarlo per la firma o controllarlo con l'IA." });
    } catch (e) {
      console.error(e);
      toast({ title: "Salvataggio non riuscito", variant: "destructive" });
    }
  };

  const duplicate = async (c) => {
    const { id, created_date, updated_date, created_by_id, stato, firmato_il, inviato_il, file_firmato_url, file_firmato_nome, revisione_ai, ...rest } = c;  
    const copy = await db.GeneratedContract.create({ ...rest, titolo: `${c.titolo} (copia)`, stato: "bozza", data_creazione: today() });
    setContracts((all) => [copy, ...all]);
    setDetailId(copy.id);
    toast({ title: "Contratto duplicato" });
  };

  const remove = async (c) => {
    if (!confirm(`Eliminare "${c.titolo}"? L'operazione non si può annullare.`)) return;
    await deleteRemindersForDoc(c.id).catch(() => null);
    await db.GeneratedContract.delete(c.id);
    setContracts((all) => all.filter((x) => x.id !== c.id));
    setDetailId(null);
    toast({ title: "Contratto eliminato" });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Contratti" subtitle="Assunzioni, appalti, subappalti e forniture: compilati dalle anagrafiche, controllati con l'IA, tracciati fino alla firma." actionLabel="Nuovo contratto" onAction={() => setWizard({ initial: null })} actionIcon={Plus}>
        <Button variant="outline" className="gap-2" onClick={() => setTemplatesOpen(true)}><Bookmark className="w-4 h-4" /> I miei modelli{templates.length ? ` (${templates.length})` : ""}</Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi icon={PenLine} label="Da firmare" value={kpi.daFirmare} tone="text-amber-700" onClick={() => setStatoFilter("inviato")} />
        <Kpi icon={CheckCircle2} label="Firmati in corso" value={kpi.firmati} tone="text-emerald-700" onClick={() => setStatoFilter("firmato")} />
        <Kpi icon={Clock} label="In scadenza (60 gg)" value={kpi.inScadenza} tone={kpi.inScadenza ? "text-red-700" : "text-slate-500"} onClick={() => setStatoFilter("scadenza")} />
        <Kpi icon={Euro} label={`Appalti firmati ${new Date().getFullYear()}`} value={formatEuro(kpi.valore)} tone="text-brand-600" />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 w-fit max-w-full overflow-x-auto no-scrollbar">
          {[{ key: "all", label: "Tutti" }, ...CATEGORIES, ...(templates.length ? [{ key: "custom", label: "Miei modelli" }] : [])].map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)} className={`px-3 h-8 rounded-md text-sm whitespace-nowrap ${cat === c.key ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}>{c.label}</button>
          ))}
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <div className="relative flex-1 lg:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca per titolo o controparte" className="pl-8 h-9" />
          </div>
          <Select value={statoFilter} onValueChange={setStatoFilter}>
            <SelectTrigger aria-label="Filtra per stato" className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ogni stato</SelectItem>
              {STATI.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              <SelectItem value="scadenza">In scadenza</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 py-14 px-6 text-center">
          <FileSignature className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="mt-3 font-semibold text-slate-900">{contracts.length ? "Nessun contratto con questi filtri" : "Nessun contratto ancora"}</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Scegli un modello, collega il dipendente o il cliente e descrivi l'accordo: l'IA compila i campi e prepara il documento con la tua intestazione.</p>
          {!contracts.length && <Button onClick={() => setWizard({ initial: null })} className="mt-4 bg-brand-600 hover:bg-brand-700 gap-2"><Plus className="w-4 h-4" /> Nuovo contratto</Button>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {list.map((c) => {
            const s = statoOf(c);
            const exp = expiry(c);
            const I = CAT_ICON[categoryOf(c.tipo)] || FileSignature;
            return (
              <button key={c.id} onClick={() => setDetailId(c.id)} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="w-9 h-9 rounded-lg bg-slate-100 grid place-items-center shrink-0"><I className="w-4 h-4 text-slate-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{c.titolo}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {typeTitle(c.tipo, templates)} · {fmtDate(c.data_creazione || c.created_date)}{c.importo ? ` · ${formatEuro(c.importo)}` : ""}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                  {exp && <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${exp.className}`}><AlertTriangle className="w-3 h-3" />{exp.label}</span>}
                  {!exp && c.data_scadenza && <span className="hidden md:inline text-xs text-slate-500">fino al {fmtDate(c.data_scadenza)}</span>}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.className}`}>{s.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ContractWizard
        open={!!wizard} onOpenChange={(v) => !v && setWizard(null)} initial={wizard?.initial}
        customTemplates={templates} employees={employees} contacts={contacts} worksites={worksites} profile={profile}
        onSave={save} onPreviewPdf={({ tipo, content, fields }) => setPreview({ tipo, titolo: typeTitle(tipo, templates), contenuto_finale: content, dati_compilati: fields })}
      />

      <ContractDetailSheet
        contract={detail} open={!!detail} onOpenChange={(v) => !v && setDetailId(null)} profile={profile} customTemplates={templates}
        contacts={contacts} employees={employees} onChanged={replaceOne} onDuplicate={duplicate} onDelete={remove} onPreview={(c) => setPreview(c)}
        onCreateLinked={(initial) => { setDetailId(null); setWizard({ initial }); }}
      />

      <ContractPreviewDialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)} contract={preview} profile={profile} mode="saved" />

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>I miei modelli</DialogTitle></DialogHeader>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-500">Nessun modello personalizzato. Quando crei un contratto puoi spuntare "Salva anche come mio modello".</p>
          ) : (
            <ul className="divide-y divide-slate-100 -mx-2">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-2 py-2">
                  <span className="flex-1 text-sm text-slate-900 truncate">{t.nome}</span>
                  <Button size="sm" variant="outline" onClick={() => { setTemplatesOpen(false); setWizard({ initial: { tipo: `custom_${t.id}` } }); }}>Usa</Button>
                  <button onClick={async () => { if (!confirm(`Eliminare il modello "${t.nome}"?`)) return; await db.ContractTemplate.delete(t.id); setTemplates((l) => l.filter((x) => x.id !== t.id)); }} className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50" aria-label="Elimina modello"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3 text-left ${onClick ? "hover:border-slate-300" : ""}`}>
      <Icon className={`w-5 h-5 shrink-0 ${tone}`} />
      <div className="min-w-0">
        <p className="text-xl font-bold text-slate-900 tabular-nums leading-none truncate">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </Tag>
  );
}
