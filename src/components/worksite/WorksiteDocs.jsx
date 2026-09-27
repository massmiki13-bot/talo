import React, { useState, useEffect } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { FolderOpen, Upload, Trash2, Loader2, FileText, AlertTriangle } from "lucide-react";
import { createDocumentReminder, getExpirationStatus, deleteRemindersForDoc } from "@/utils/expirationReminders";
import { fmtDate } from "@/lib/worksites";

export const WORKSITE_DOC_TYPES = {
  pos: "POS – Piano operativo di sicurezza",
  psc: "PSC – Piano di sicurezza e coordinamento",
  permesso: "Titolo edilizio / permesso",
  ddt: "DDT / bolla di consegna",
  collaudo: "Collaudo / verbale",
  dico: "Dichiarazione di conformità impianti",
  altro: "Altro",
};

// Documenti del cantiere (sicurezza, permessi, consegne, conformità).
export default function WorksiteDocs({ worksite, readOnly }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tipo: "pos", titolo: "", data_emissione: "", data_scadenza: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => setDocs(await db.CompanyDocument.filter({ worksite_id: worksite.id }, "-created_date").catch(() => []));
  useEffect(() => { load(); }, [worksite.id]);

  const save = async () => {
    if (!file) return toast({ title: "Scegli il file", variant: "destructive" });
    setSaving(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      const titolo = form.titolo.trim() || `${WORKSITE_DOC_TYPES[form.tipo].split(" – ")[0]} – ${worksite.nome}`;
      const d = await db.CompanyDocument.create({ ...form, titolo, file_url, data_emissione: form.data_emissione || null, data_scadenza: form.data_scadenza || null, worksite_id: worksite.id, worksite_nome: worksite.nome });
      if (form.data_scadenza) await createDocumentReminder(titolo, form.data_scadenza, d.id, "CompanyDocument", WORKSITE_DOC_TYPES[form.tipo], worksite.nome, 15);
      setOpen(false);
      setForm({ tipo: "pos", titolo: "", data_emissione: "", data_scadenza: "" });
      setFile(null);
      toast({ title: "Documento caricato" });
      load();
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    if (!confirm(`Eliminare "${d.titolo}"?`)) return;
    await deleteRemindersForDoc(d.id).catch(() => {});
    await db.CompanyDocument.delete(d.id);
    load();
  };

  const missingPos = !docs.some((d) => d.tipo === "pos") && worksite.stato !== "finito";

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 flex-1"><FolderOpen className="w-4 h-4 text-slate-500" /> Documenti di cantiere</h3>
        {!readOnly && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}><Upload className="w-4 h-4" /> Carica</Button>}
      </div>
      {missingPos && <p className="text-xs text-amber-900 bg-amber-50 rounded px-2 py-1.5 mb-2 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Manca il POS: è obbligatorio per ogni cantiere (D.Lgs. 81/08, art. 96).</p>}
      {docs.length === 0 ? <p className="text-sm text-slate-500">POS, PSC, titolo edilizio, DDT, dichiarazioni di conformità: tutto in un posto, con le scadenze.</p> : (
        <ul className="divide-y divide-slate-100">
          {docs.map((d) => {
            const st = getExpirationStatus(d.data_scadenza);
            return (
              <li key={d.id} className="py-2.5 flex items-center gap-3">
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-900 hover:underline truncate block">{d.titolo}</a>
                  <p className="text-xs text-slate-500">{WORKSITE_DOC_TYPES[d.tipo] || d.tipo}{d.data_scadenza ? ` · scade il ${fmtDate(d.data_scadenza)}` : ""}</p>
                </div>
                {st && <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${st === "expired" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{st === "expired" ? "Scaduto" : "In scadenza"}</span>}
                {!readOnly && <button aria-label="Elimina" onClick={() => remove(d)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Documento di cantiere</DialogTitle><DialogDescription>{worksite.nome}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(WORKSITE_DOC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Titolo (facoltativo)</Label><Input className="mt-1" value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><Input className="mt-1" type="date" value={form.data_emissione} onChange={(e) => setForm({ ...form, data_emissione: e.target.value })} /></div>
              <div><Label>Scadenza</Label><Input className="mt-1" type="date" value={form.data_scadenza} onChange={(e) => setForm({ ...form, data_scadenza: e.target.value })} /></div>
            </div>
            <div><Label>File</Label><Input className="mt-1" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
              <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Carica</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
