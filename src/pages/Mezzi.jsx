import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Truck, Plus, Wrench, AlertTriangle, Trash2, Pencil, HardHat, User, Loader2, Search } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import Field from "@/components/shared/FormField";
import { TIPI_MEZZO, SCADENZE, deadlines, statusOf } from "@/lib/equipment";

const NONE = "__none__";
const EMPTY = { nome: "", tipo: "Autocarro", targa: "", anno: "", ore_km: "", scadenze: {}, manutenzioni: [], assegnazione: {}, fuori_servizio: false, note: "" };
const fmt = (d) => (d ? new Date(d).toLocaleDateString("it-IT") : "");
const eur = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v) || 0);

function EquipmentForm({ open, onOpenChange, item, worksites, employees, onSaved }) {
  const { toast } = useToast();
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [man, setMan] = useState({ data: new Date().toISOString().slice(0, 10), descrizione: "", costo: "" });
  useEffect(() => { if (open) setF({ ...EMPTY, ...(item || {}), scadenze: { ...(item?.scadenze || {}) }, assegnazione: { ...(item?.assegnazione || {}) }, manutenzioni: [...(item?.manutenzioni || [])] }); }, [open, item]);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  const addMan = () => {
    if (!man.descrizione.trim()) return;
    set({ manutenzioni: [{ ...man, costo: Number(String(man.costo).replace(",", ".")) || 0 }, ...f.manutenzioni] });
    setMan({ data: new Date().toISOString().slice(0, 10), descrizione: "", costo: "" });
  };

  const save = async () => {
    if (!f.nome.trim()) return toast({ title: "Dai un nome al mezzo", variant: "destructive" });
    setSaving(true);
    try {
      const w = worksites.find((x) => x.id === f.assegnazione.worksite_id);
      const e = employees.find((x) => x.id === f.assegnazione.dipendente_id);
      const data = { ...f, assegnazione: { ...f.assegnazione, worksite_nome: w?.nome || "", dipendente_nome: e ? `${e.nome} ${e.cognome}` : "" } };
      for (const k of ["id", "created_date", "updated_date", "created_by_id", "created_by"]) delete data[k];
      onSaved(item?.id ? await db.Equipment.update(item.id, data) : await db.Equipment.create(data));
      onOpenChange(false);
    } catch (err) { toast({ title: "Salvataggio non riuscito", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item?.id ? "Modifica mezzo" : "Nuovo mezzo o attrezzatura"}</DialogTitle>
          <DialogDescription>Le scadenze compaiono nella Dashboard e nel report settimanale.</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome" className="sm:col-span-2"><Input value={f.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Es. Iveco Daily 35C, Escavatore Kubota KX019" /></Field>
          <Field label="Tipo">
            <Select value={f.tipo} onValueChange={(v) => set({ tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPI_MEZZO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          </Field>
          <Field label="Targa / matricola"><Input value={f.targa} onChange={(e) => set({ targa: e.target.value.toUpperCase() })} /></Field>
          <Field label="Anno"><Input inputMode="numeric" value={f.anno} onChange={(e) => set({ anno: e.target.value })} /></Field>
          <Field label="Km o ore di lavoro"><Input inputMode="numeric" value={f.ore_km} onChange={(e) => set({ ore_km: e.target.value })} /></Field>
        </div>

        <p className="text-sm font-semibold text-zinc-900 mt-2">Scadenze</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {SCADENZE.map((s) => (
            <Field key={s.key} label={s.label}><Input type="date" value={f.scadenze[s.key] || ""} onChange={(e) => set({ scadenze: { ...f.scadenze, [s.key]: e.target.value } })} /></Field>
          ))}
        </div>

        <p className="text-sm font-semibold text-zinc-900 mt-2">Dove e con chi</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Cantiere">
            <Select value={f.assegnazione.worksite_id || NONE} onValueChange={(v) => set({ assegnazione: { ...f.assegnazione, worksite_id: v === NONE ? "" : v } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>In deposito</SelectItem>{worksites.map((w) => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="In uso a">
            <Select value={f.assegnazione.dipendente_id || NONE} onValueChange={(v) => set({ assegnazione: { ...f.assegnazione, dipendente_id: v === NONE ? "" : v } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Nessuno</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome} {e.cognome}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Dal"><Input type="date" value={f.assegnazione.dal || ""} onChange={(e) => set({ assegnazione: { ...f.assegnazione, dal: e.target.value } })} /></Field>
          <Field label="Al"><Input type="date" value={f.assegnazione.al || ""} onChange={(e) => set({ assegnazione: { ...f.assegnazione, al: e.target.value } })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm mt-1"><input type="checkbox" checked={!!f.fuori_servizio} onChange={(e) => set({ fuori_servizio: e.target.checked })} className="accent-[#c3122a] w-4 h-4" />Fuori servizio (guasto o in officina)</label>

        <p className="text-sm font-semibold text-zinc-900 mt-2">Manutenzioni e riparazioni</p>
        <div className="grid grid-cols-[130px_1fr_100px_auto] gap-2 items-end">
          <Input type="date" value={man.data} onChange={(e) => setMan({ ...man, data: e.target.value })} aria-label="Data intervento" />
          <Input value={man.descrizione} onChange={(e) => setMan({ ...man, descrizione: e.target.value })} placeholder="Tagliando, cambio olio, gomme…" aria-label="Descrizione intervento" />
          <Input inputMode="decimal" value={man.costo} onChange={(e) => setMan({ ...man, costo: e.target.value })} placeholder="€" aria-label="Costo" />
          <Button type="button" variant="outline" onClick={addMan} aria-label="Aggiungi intervento"><Plus className="w-4 h-4" /></Button>
        </div>
        {f.manutenzioni.length > 0 && (
          <ul className="divide-y divide-zinc-100 text-sm">
            {f.manutenzioni.map((m, i) => (
              <li key={i} className="py-1.5 flex gap-3 items-center">
                <span className="tabular-nums text-zinc-500 w-24">{fmt(m.data)}</span><span className="flex-1">{m.descrizione}</span><span className="tabular-nums">{m.costo ? eur(m.costo) : ""}</span>
                <button type="button" onClick={() => set({ manutenzioni: f.manutenzioni.filter((_, j) => j !== i) })} className="text-zinc-500 hover:text-red-600" aria-label="Rimuovi"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <Field label="Note"><Input value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Mezzi() {
  const { toast } = useToast();
  const [items, setItems] = useState(null);
  const [worksites, setWorksites] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    Promise.all([db.Equipment.list("nome", 1000), db.Worksite.fields(["nome", "stato"], { limit: 1000 }), db.Employee.fields(["nome", "cognome", "stato"], { limit: 1000 })])
      .then(([e, w, emp]) => { setItems(e); setWorksites(w.filter((x) => x.stato !== "finito")); setEmployees(emp.filter((x) => x.stato !== "cessato")); })
      .catch((err) => { toast({ title: err.message, variant: "destructive" }); setItems([]); });
  }, [toast]);

  const list = useMemo(() => (items || []).filter((m) => !q || [m.nome, m.tipo, m.targa, m.assegnazione?.worksite_nome, m.assegnazione?.dipendente_nome].join(" ").toLowerCase().includes(q.toLowerCase())), [items, q]);
  const alerts = useMemo(() => (items || []).flatMap((m) => deadlines(m).filter((d) => d.stato !== "ok").map((d) => ({ ...d, m }))), [items]);

  const saved = (u) => setItems((l) => (l.some((x) => x.id === u.id) ? l.map((x) => (x.id === u.id ? u : x)) : [...l, u]));
  const remove = async (m) => { if (!confirm(`Eliminare ${m.nome}?`)) return; await db.Equipment.delete(m.id); setItems((l) => l.filter((x) => x.id !== m.id)); };

  if (!items) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <PageHeader title="Mezzi e attrezzature" subtitle="Revisioni, assicurazioni, verifiche e manutenzioni sempre sotto controllo, e dove si trova ogni mezzo." actionLabel="Nuovo mezzo" actionIcon={Plus} onAction={() => setForm({})} />

      {alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4" aria-hidden="true" />{alerts.length} scadenze da gestire</p>
          <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {alerts.map((a, i) => (
              <li key={i} className="flex gap-2"><span className={a.stato === "scaduta" ? "text-red-700 font-medium" : "text-amber-900"}>{a.label} {a.m.nome}</span><span className="text-zinc-600 tabular-nums ml-auto">{a.stato === "scaduta" ? `scaduta il ${fmt(a.data)}` : `tra ${a.giorni} gg (${fmt(a.data)})`}</span></li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-zinc-300 py-14 px-6 text-center">
          <Truck className="w-10 h-10 text-zinc-300 mx-auto" aria-hidden="true" />
          <p className="mt-3 font-semibold text-zinc-900">Nessun mezzo registrato</p>
          <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">Aggiungi furgoni, escavatori, gru, ponteggi e attrezzature: Talo ti avvisa prima di revisioni, assicurazioni e verifiche periodiche.</p>
          <Button onClick={() => setForm({})} className="mt-4 bg-brand-600 hover:bg-brand-700 gap-2"><Plus className="w-4 h-4" />Nuovo mezzo</Button>
        </div>
      ) : (
        <>
          <div className="relative max-w-sm"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, targa, cantiere…" className="pl-9" aria-label="Cerca mezzi" /></div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map((m) => {
              const st = statusOf(m);
              const next = deadlines(m)[0];
              const spese = (m.manutenzioni || []).reduce((s, x) => s + (Number(x.costo) || 0), 0);
              return (
                <div key={m.id} className="bg-white rounded-2xl border border-zinc-200 p-4 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid place-items-center w-10 h-10 rounded-xl bg-zinc-950 text-white shrink-0"><Truck className="w-5 h-5" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900 truncate">{m.nome}</p>
                      <p className="text-xs text-zinc-500">{[m.tipo, m.targa, m.anno].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-2 text-zinc-700"><HardHat className="w-4 h-4 text-zinc-400" aria-hidden="true" />{m.assegnazione?.worksite_id ? <Link to={`/lavori/${m.assegnazione.worksite_id}`} className="hover:underline truncate">{m.assegnazione.worksite_nome}</Link> : "In deposito"}{m.assegnazione?.al ? <span className="text-xs text-zinc-500">fino al {fmt(m.assegnazione.al)}</span> : null}</p>
                    {m.assegnazione?.dipendente_nome && <p className="flex items-center gap-2 text-zinc-700"><User className="w-4 h-4 text-zinc-400" aria-hidden="true" />{m.assegnazione.dipendente_nome}</p>}
                    {next && <p className="flex items-center gap-2 text-zinc-700"><AlertTriangle className={`w-4 h-4 ${next.stato === "ok" ? "text-zinc-400" : "text-amber-600"}`} aria-hidden="true" />{next.label}: {fmt(next.data)}</p>}
                    {spese > 0 && <p className="flex items-center gap-2 text-zinc-700"><Wrench className="w-4 h-4 text-zinc-400" aria-hidden="true" />{m.manutenzioni.length} interventi · {eur(spese)}</p>}
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={() => setForm(m)}><Pencil className="w-4 h-4" />Modifica</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(m)} aria-label={`Elimina ${m.nome}`}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <EquipmentForm open={!!form} onOpenChange={(v) => !v && setForm(null)} item={form?.id ? form : null} worksites={worksites} employees={employees} onSaved={saved} />
    </div>
  );
}
