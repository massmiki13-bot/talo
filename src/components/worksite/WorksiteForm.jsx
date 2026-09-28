import React, { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Sparkles } from "lucide-react";
import { aiFillWorksite } from "@/lib/worksiteAi";
import { WORKSITE_STATES, TIPI_INTERVENTO, TITOLI_EDILIZI, COST_CATEGORIES } from "@/lib/worksites";
import { displayName } from "@/lib/contacts";
import { fullName } from "@/lib/employees";
import { fmtEur } from "@/lib/quotes";
import Field from "@/components/shared/FormField";
import SitePosition from "@/components/worksite/SitePosition";

const EMPTY = {
  nome: "", indirizzo: "", stato: "da_iniziare", tipo_intervento: "", cliente_id: "", cliente_nome: "", importo_totale: "",
  data_inizio: "", data_fine_prevista: "", data_fine_effettiva: "", responsabile_id: "", squadra_ids: [],
  direttore_lavori: "", coordinatore_sicurezza: "", titolo_edilizio: {}, budget: {}, note: "",
};


export default function WorksiteForm({ open, onOpenChange, worksite = null, onSaved, quoteTotal }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [tab, setTab] = useState("dati");
  const [contacts, setContacts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, ...(worksite || {}), squadra_ids: [...(worksite?.squadra_ids || [])], titolo_edilizio: { ...(worksite?.titolo_edilizio || {}) }, budget: { ...(worksite?.budget || {}) }, importo_totale: worksite?.importo_totale ?? "" });
    setTab("dati");
    setAltro(false);
    Promise.all([db.Contact.list("nome", 5000), db.Employee.list("cognome", 2000)]).then(([c, e]) => {
      setContacts(c.filter((x) => x.tipo !== "fornitore" && !x.archiviato));
      setEmployees(e.filter((x) => x.stato !== "cessato"));
    }).catch(() => {});
  }, [open, worksite]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  // "Altro": il tipo si scrive a mano (anche i tipi scritti a mano in passato risultano "Altro")
  const [altro, setAltro] = useState(false);
  const tipoCustom = !!form.tipo_intervento && !TIPI_INTERVENTO.includes(form.tipo_intervento);
  const tipoSel = altro || tipoCustom ? "Altro" : form.tipo_intervento || "none";
  // ── Compilazione con l'IA (descrizione libera e/o preventivo del cliente) ──
  const [ai, setAi] = useState({ open: false, testo: "", quoteId: "none", quotes: [], busy: false });
  useEffect(() => {
    if (!open) return;
    setAi({ open: !worksite?.id, testo: "", quoteId: "none", quotes: [], busy: false });
    db.Quote.fields(["numero", "oggetto", "cliente_id", "cliente_nome", "totale", "stato", "worksite_id"], { sort: "-data", limit: 500 })
      .then((qs) => setAi((a) => ({ ...a, quotes: qs.filter((q) => !q.worksite_id || q.worksite_id === worksite?.id) })))
      .catch(() => {});
  }, [open, worksite]);
  const aiQuotes = ai.quotes.filter((q) => !form.cliente_id || q.cliente_id === form.cliente_id);
  const runAi = async () => {
    if (!ai.testo.trim() && ai.quoteId === "none") return toast({ title: "Scrivi due righe sul lavoro o scegli un preventivo", variant: "destructive" });
    setAi((a) => ({ ...a, busy: true }));
    try {
      const quote = ai.quoteId !== "none" ? await db.Quote.get(ai.quoteId) : null;
      const cliente = quote?.cliente_nome || form.cliente_nome;
      const r = await aiFillWorksite({ descrizione: ai.testo, quote, cliente, employees });
      setForm((f) => ({
        ...f,
        nome: f.nome || r.nome,
        tipo_intervento: f.tipo_intervento || r.tipo_intervento,
        indirizzo: f.indirizzo || r.indirizzo,
        data_inizio: f.data_inizio || r.data_inizio,
        data_fine_prevista: f.data_fine_prevista || r.data_fine_prevista,
        fasi: f.fasi?.length ? f.fasi : r.fasi,
        budget: { ...r.budget, ...Object.fromEntries(Object.entries(f.budget || {}).filter(([, v]) => v !== "" && v != null)) },
        titolo_edilizio: f.titolo_edilizio?.tipo ? f.titolo_edilizio : { ...(f.titolo_edilizio || {}), tipo: r.titolo_edilizio },
        squadra_ids: f.squadra_ids.length ? f.squadra_ids : r.squadra_ids,
        responsabile_id: f.responsabile_id || r.squadra_ids[0] || "",
        note: [f.note, r.note].filter(Boolean).join("\n\n"),
        ...(quote ? { preventivo_id: quote.id, cliente_id: f.cliente_id || quote.cliente_id || "", cliente_nome: f.cliente_nome || quote.cliente_nome || "", importo_totale: f.importo_totale || quote.totale || "" } : {}),
      }));
      setAi((a) => ({ ...a, open: false }));
      toast({ title: "Scheda compilata dall'IA", description: "Controlla dati, fasi, squadra e budget prima di salvare." });
    } catch (e) {
      toast({ title: "Compilazione non riuscita", description: e.message, variant: "destructive" });
    } finally { setAi((a) => ({ ...a, busy: false })); }
  };

  const toggleTeam = (id) => set({ squadra_ids: form.squadra_ids.includes(id) ? form.squadra_ids.filter((x) => x !== id) : [...form.squadra_ids, id] });
  const budgetTot = COST_CATEGORIES.reduce((s, c) => s + (Number(form.budget[c]) || 0), 0);
  const importo = Number(form.importo_totale) || Number(quoteTotal) || 0;

  const save = async () => {
    if (!form.nome.trim()) return toast({ title: "Dai un nome al lavoro", variant: "destructive" });
    if (form.data_fine_prevista && form.data_inizio && form.data_fine_prevista < form.data_inizio) return toast({ title: "La fine prevista precede l'inizio", variant: "destructive" });
    setSaving(true);
    try {
      const num = (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(",", ".")));
      const data = {
        ...form,
        importo_totale: num(form.importo_totale),
        budget: Object.fromEntries(COST_CATEGORIES.map((c) => [c, num(form.budget[c])]).filter(([, v]) => v !== null)),
        attivo: form.stato !== "finito",
      };
      for (const k of ["id", "created_date", "updated_date", "created_by", "created_by_id"]) delete data[k];
      for (const k of ["data_inizio", "data_fine_prevista", "data_fine_effettiva"]) if (!data[k]) data[k] = null;
      if (data.stato === "finito" && !data.data_fine_effettiva) data.data_fine_effettiva = new Date().toISOString().slice(0, 10);
      const saved = worksite?.id ? await db.Worksite.update(worksite.id, data) : await db.Worksite.create(data);
      toast({ title: worksite?.id ? "Lavoro aggiornato" : "Lavoro creato" });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{worksite?.id ? "Modifica lavoro" : "Nuovo lavoro"}</DialogTitle>
          <DialogDescription>Basta il nome per iniziare: il resto si completa quando serve.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="dati">Dati</TabsTrigger>
            <TabsTrigger value="squadra">Squadra</TabsTrigger>
            <TabsTrigger value="pratiche">Pratiche</TabsTrigger>
            <TabsTrigger value="budget">Budget</TabsTrigger>
          </TabsList>

          <TabsContent value="dati" className="pt-3">
            {ai.open ? (
              <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5 mb-4 space-y-2.5">
                <p className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-brand-600" aria-hidden="true" />Compila con l'IA</p>
                <textarea value={ai.testo} onChange={(e) => setAi({ ...ai, testo: e.target.value })} rows={3} aria-label="Descrizione del lavoro per l'IA"
                  placeholder="Es. Rifacimento bagno e cucina per la signora Bianchi in via Roma 88, si parte lunedì, 5 settimane circa"
                  className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-sm" />
                <div className="flex flex-wrap gap-2 items-center">
                  <Select value={ai.quoteId} onValueChange={(v) => setAi({ ...ai, quoteId: v })}>
                    <SelectTrigger className="flex-1 min-w-[200px] bg-white" aria-label="Preventivo da cui partire"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Senza preventivo</SelectItem>
                      {aiQuotes.map((q) => <SelectItem key={q.id} value={q.id}>{q.numero} · {q.cliente_nome || "—"} · {q.oggetto || "senza oggetto"}{q.totale ? ` · ${fmtEur(q.totale)}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={runAi} disabled={ai.busy} className="gap-1.5 bg-brand-600 hover:bg-brand-700">{ai.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Compila</Button>
                </div>
                <p className="text-xs text-zinc-600">Propone nome, tipo, date, fasi, squadra, budget e pratica edilizia: i campi già compilati non vengono toccati.</p>
              </div>
            ) : (
              <button type="button" onClick={() => setAi({ ...ai, open: true })} className="mb-3 text-sm font-medium text-brand-700 hover:underline inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4" aria-hidden="true" />Compila con l'IA</button>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nome del lavoro" className="sm:col-span-2"><Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Es. Ristrutturazione bagno – Via Roma 12" /></Field>
              <Field label="Cliente">
                <Select value={form.cliente_id || "none"} onValueChange={(v) => { const c = contacts.find((x) => x.id === v); set({ cliente_id: c?.id || "", cliente_nome: c ? displayName(c) : "", indirizzo: form.indirizzo || (c ? [c.indirizzo, [c.cap, c.citta, c.provincia].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "") }); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">— Nessuno —</SelectItem>{contacts.map((c) => <SelectItem key={c.id} value={c.id}>{displayName(c)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Tipo di intervento">
                <Select value={tipoSel} onValueChange={(v) => { setAltro(v === "Altro"); set({ tipo_intervento: v === "none" || v === "Altro" ? "" : v }); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{TIPI_INTERVENTO.map((t) => <SelectItem key={t} value={t}>{t === "Altro" ? "Altro (specifica)" : t}</SelectItem>)}</SelectContent>
                </Select>
                {tipoSel === "Altro" && (
                  <Input value={form.tipo_intervento} onChange={(e) => set({ tipo_intervento: e.target.value })} autoFocus={altro && !form.tipo_intervento}
                    placeholder="Es. Bonifica amianto, Piscina, Recinzione…" aria-label="Specifica il tipo di intervento" className="mt-2" />
                )}
              </Field>
              <Field label="Indirizzo del cantiere" className="sm:col-span-2"><Input value={form.indirizzo} onChange={(e) => set({ indirizzo: e.target.value })} /></Field>
              <div className="sm:col-span-2"><SitePosition lat={form.lat} lng={form.lng} indirizzo={form.indirizzo} onChange={set} /></div>
              <Field label="Stato">
                <Select value={form.stato || "da_iniziare"} onValueChange={(v) => set({ stato: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(WORKSITE_STATES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Importo del contratto €" hint={quoteTotal && !form.importo_totale ? `Vuoto = totale del preventivo (${fmtEur(quoteTotal)})` : "IVA inclusa, come da preventivo accettato"}>
                <Input type="number" inputMode="decimal" step="0.01" value={form.importo_totale} onChange={(e) => set({ importo_totale: e.target.value })} />
              </Field>
              <Field label="Inizio lavori"><Input type="date" value={form.data_inizio || ""} onChange={(e) => set({ data_inizio: e.target.value })} /></Field>
              <Field label="Fine prevista"><Input type="date" value={form.data_fine_prevista || ""} onChange={(e) => set({ data_fine_prevista: e.target.value })} /></Field>
              {form.stato === "finito" && <Field label="Fine effettiva"><Input type="date" value={form.data_fine_effettiva || ""} onChange={(e) => set({ data_fine_effettiva: e.target.value })} /></Field>}
              <Field label="Note" className="sm:col-span-2"><textarea value={form.note || ""} onChange={(e) => set({ note: e.target.value })} rows={3} className="w-full rounded-md border border-input p-2 text-sm" /></Field>
            </div>
          </TabsContent>

          <TabsContent value="squadra" className="pt-3 space-y-4">
            <Field label="Capocantiere / responsabile">
              <Select value={form.responsabile_id || "none"} onValueChange={(v) => set({ responsabile_id: v === "none" ? "" : v, squadra_ids: v !== "none" && !form.squadra_ids.includes(v) ? [...form.squadra_ids, v] : form.squadra_ids })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">— Nessuno —</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{fullName(e)}{e.ruolo ? ` · ${e.ruolo}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div>
              <Label className="text-sm">Squadra assegnata</Label>
              {employees.length ? (
                <div className="grid sm:grid-cols-2 gap-1.5 mt-1.5">
                  {employees.map((e) => (
                    <label key={e.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${form.squadra_ids.includes(e.id) ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <input type="checkbox" className="w-4 h-4" checked={form.squadra_ids.includes(e.id)} onChange={() => toggleTeam(e.id)} />
                      <span className="text-sm text-slate-800">{fullName(e)}</span>
                      {e.ruolo && <span className="text-xs text-slate-600 ml-auto">{e.ruolo}</span>}
                    </label>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500 mt-1">Aggiungi prima i dipendenti.</p>}
            </div>
          </TabsContent>

          <TabsContent value="pratiche" className="pt-3">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Titolo edilizio">
                <Select value={form.titolo_edilizio.tipo || "none"} onValueChange={(v) => set({ titolo_edilizio: { ...form.titolo_edilizio, tipo: v === "none" ? "" : v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{TITOLI_EDILIZI.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Numero pratica / protocollo"><Input value={form.titolo_edilizio.numero || ""} onChange={(e) => set({ titolo_edilizio: { ...form.titolo_edilizio, numero: e.target.value } })} /></Field>
              <Field label="Data presentazione / rilascio"><Input type="date" value={form.titolo_edilizio.data || ""} onChange={(e) => set({ titolo_edilizio: { ...form.titolo_edilizio, data: e.target.value } })} /></Field>
              <Field label="Comune"><Input value={form.titolo_edilizio.comune || ""} onChange={(e) => set({ titolo_edilizio: { ...form.titolo_edilizio, comune: e.target.value } })} /></Field>
              <Field label="Direttore dei lavori"><Input value={form.direttore_lavori || ""} onChange={(e) => set({ direttore_lavori: e.target.value })} placeholder="Nome, studio, telefono" /></Field>
              <Field label="Coordinatore sicurezza (CSE)"><Input value={form.coordinatore_sicurezza || ""} onChange={(e) => set({ coordinatore_sicurezza: e.target.value })} /></Field>
            </div>
          </TabsContent>

          <TabsContent value="budget" className="pt-3 space-y-3">
            <p className="text-sm text-slate-500">Quanto prevedi di spendere per categoria. Talo confronta il budget con i costi reali e ti avvisa se sfori.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {COST_CATEGORIES.map((c) => (
                <Field key={c} label={`${c} €`}><Input type="number" inputMode="decimal" step="0.01" value={form.budget[c] ?? ""} onChange={(e) => set({ budget: { ...form.budget, [c]: e.target.value } })} /></Field>
              ))}
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
              <span>Budget costi: <strong className="tabular-nums">{fmtEur(budgetTot)}</strong></span>
              {importo > 0 && <span>Margine previsto: <strong className={`tabular-nums ${importo - budgetTot < 0 ? "text-red-700" : "text-emerald-700"}`}>{fmtEur(importo - budgetTot)}</strong>{budgetTot ? ` (${Math.round(((importo - budgetTot) / importo) * 100)}%)` : ""}</span>}
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}{worksite?.id ? "Salva" : "Crea lavoro"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
