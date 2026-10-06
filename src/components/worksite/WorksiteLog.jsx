import React, { useState, useEffect } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { BookOpen, Plus, Loader2, Camera, X, Pencil, Trash2, Users, CloudSun, AlertTriangle, Truck } from "lucide-react";
import { METEO, fmtDate } from "@/lib/worksites";
import { fullName } from "@/lib/employees";
import { useAuth } from "@/lib/AuthContext";

const today = () => new Date().toISOString().slice(0, 10);

// Giornale dei lavori: una voce al giorno con presenti (dalle presenze), meteo,
// lavorazioni, forniture, problemi e foto.
export default function WorksiteLog({ worksite, attendance, employees, readOnly }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);

  const load = async () => {
    try { setEntries(await db.WorksiteLog.filter({ worksite_id: worksite.id }, "-data", 500)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [worksite.id]);

  const empName = new Map(employees.map((e) => [e.id, fullName(e)]));
  const presentOn = (date) => {
    const names = new Set();
    for (const a of attendance.filter((x) => x.data === date)) {
      for (const p of a.presenze || []) {
        if ((p.cantiere_id || a.cantiere_id) === worksite.id && (!p.stato || p.stato === "presente")) names.add(empName.get(p.dipendente_id) || "Dipendente");
      }
    }
    return [...names];
  };

  const openNew = () => {
    const d = today();
    const existing = entries.find((e) => e.data === d);
    setEdit(existing ? { ...existing } : { data: d, meteo: "Sereno", presenti: presentOn(d), attivita: "", forniture: "", problemi: "", foto: [] });
  };

  const remove = async (e) => {
    if (!confirm(`Eliminare la voce del ${fmtDate(e.data)}?`)) return;
    await db.WorksiteLog.delete(e.id);
    load();
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 flex-1"><BookOpen className="w-4 h-4 text-brand-600" /> Giornale dei lavori</h3>
        {!readOnly && <Button size="sm" className="gap-1.5" onClick={openNew}><Plus className="w-4 h-4" /> Oggi</Button>}
      </div>
      {loading ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
        : entries.length === 0 ? <p className="text-sm text-slate-500 py-3">Annota ogni giorno cosa si è fatto, chi c'era e cosa è successo: è la memoria del cantiere e la prova in caso di contestazioni.</p>
        : (
          <ol className="relative border-l border-slate-200 ml-2 space-y-4">
            {entries.map((e) => (
              <li key={e.id} className="ml-4">
                <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-brand-600" />
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{new Date(e.data).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
                    <p className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                      {e.meteo && <span className="flex items-center gap-1"><CloudSun className="w-3.5 h-3.5" />{e.meteo}</span>}
                      {e.presenti?.length > 0 && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{e.presenti.join(", ")}</span>}
                    </p>
                  </div>
                  {!readOnly && (
                    <>
                      <button aria-label="Modifica" onClick={() => setEdit({ ...e })} className="p-1 rounded hover:bg-slate-100 text-slate-500"><Pencil className="w-4 h-4" /></button>
                      <button aria-label="Elimina" onClick={() => remove(e)} className="p-1 rounded hover:bg-red-50 text-slate-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
                {e.attivita && <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{e.attivita}</p>}
                {e.forniture && <p className="text-sm text-slate-600 mt-1 flex gap-1.5"><Truck className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" /><span className="whitespace-pre-wrap">{e.forniture}</span></p>}
                {e.problemi && <p className="text-sm text-amber-900 bg-amber-50 rounded px-2 py-1 mt-1 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span className="whitespace-pre-wrap">{e.problemi}</span></p>}
                {e.foto?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {e.foto.map((f, i) => <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"><img src={f.url} alt={`Foto del ${fmtDate(e.data)}`} className="w-20 h-16 object-cover rounded border border-slate-200" /></a>)}
                  </div>
                )}
                {e.autore && <p className="text-[11px] text-slate-500 mt-1">Compilato da {e.autore}</p>}
              </li>
            ))}
          </ol>
        )}

      <LogDialog open={!!edit} entry={edit} onOpenChange={(v) => { if (!v) setEdit(null); }} presentOn={presentOn}
        onSave={async (data) => {
          const payload = { ...data, worksite_id: worksite.id, autore: data.autore || user?.full_name || user?.email || "" };
          for (const k of ["id", "created_date", "updated_date", "created_by", "created_by_id"]) delete payload[k];
          if (data.id) await db.WorksiteLog.update(data.id, payload);
          else await db.WorksiteLog.create(payload);
          toast({ title: "Giornale aggiornato" });
          setEdit(null);
          load();
        }} />
    </section>
  );
}

function LogDialog({ open, entry, onOpenChange, onSave, presentOn }) {
  const [form, setForm] = useState(entry || {});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (entry) setForm(entry); }, [entry]);
  if (!entry) return null;

  const upload = async (files) => {
    setUploading(true);
    try {
      const out = [];
      for (const f of files) out.push({ url: (await api.integrations.Core.UploadFile({ file: f })).file_url, name: f.name });
      setForm((x) => ({ ...x, foto: [...(x.foto || []), ...out] }));
    } finally { setUploading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Modifica giornata" : "Nuova giornata"}</DialogTitle><DialogDescription>I presenti arrivano dalle presenze: puoi correggerli.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="worksitelog-data">Data</Label><Input id="worksitelog-data" className="mt-1" type="date" value={form.data || ""} onChange={(e) => setForm({ ...form, data: e.target.value, presenti: form.id ? form.presenti : presentOn(e.target.value) })} /></div>
            <div>
              <Label htmlFor="worksitelog-meteo">Meteo</Label>
              <Select value={form.meteo || "Sereno"} onValueChange={(v) => setForm({ ...form, meteo: v })}>
                <SelectTrigger id="worksitelog-meteo" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{METEO.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label htmlFor="worksitelog-presenti">Presenti</Label><Input id="worksitelog-presenti" className="mt-1" value={(form.presenti || []).join(", ")} onChange={(e) => setForm({ ...form, presenti: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="Nomi separati da virgola" /></div>
          <div><Label htmlFor="worksitelog-lavorazioni-eseguite">Lavorazioni eseguite</Label><textarea id="worksitelog-lavorazioni-eseguite" value={form.attivita || ""} onChange={(e) => setForm({ ...form, attivita: e.target.value })} rows={4} className="mt-1 w-full rounded-md border border-input p-2 text-sm" placeholder="Es. getto massetto piano terra, posa tubazioni bagno…" /></div>
          <div><Label htmlFor="worksitelog-forniture-e-mezzi">Forniture e mezzi</Label><Input id="worksitelog-forniture-e-mezzi" className="mt-1" value={form.forniture || ""} onChange={(e) => setForm({ ...form, forniture: e.target.value })} placeholder="Es. consegna 40 sacchi di cemento, noleggio miniescavatore" /></div>
          <div><Label htmlFor="worksitelog-problemi-sospensioni-variant">Problemi, sospensioni, varianti</Label><textarea id="worksitelog-problemi-sospensioni-variant" value={form.problemi || ""} onChange={(e) => setForm({ ...form, problemi: e.target.value })} rows={2} className="mt-1 w-full rounded-md border border-input p-2 text-sm" /></div>
          <div>
            <Label>Foto</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(form.foto || []).map((f, i) => (
                <div key={i} className="relative">
                  <img src={f.url} alt="" className="w-20 h-16 object-cover rounded border border-slate-200" />
                  <button type="button" aria-label="Rimuovi foto" onClick={() => setForm({ ...form, foto: form.foto.filter((_, j) => j !== i) })} className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <label className="w-20 h-16 rounded border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer text-slate-500">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-5 h-5" />}
                <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => { upload([...e.target.files]); e.target.value = ""; }} />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button disabled={saving || uploading} onClick={async () => { setSaving(true); try { await onSave(form); } finally { setSaving(false); } }}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Salva</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
