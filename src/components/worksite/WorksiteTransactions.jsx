import React, { useState } from "react";
import { confirmDialog } from "@/components/shared/ConfirmHost";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Eye, Camera, Sparkles, AlertCircle, Wallet, Loader2, Download } from "lucide-react";
import { COST_CATEGORIES, INCOME_CATEGORIES, fmtDate } from "@/lib/worksites";
import { fmtEur } from "@/lib/quotes";
import { downloadCsv } from "@/lib/csv";

const EMPTY = () => ({ tipo: "uscita", categoria: "Materiali", descrizione: "", importo: "", data: new Date().toISOString().slice(0, 10), fornitore: "" });

// Entrate e uscite del lavoro, con foto di bolle/scontrini letti dall'AI.
export default function WorksiteTransactions({ worksite, transactions, allWorksites, onChanged, readOnly }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY());
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [match, setMatch] = useState(null);
  const [filter, setFilter] = useState("tutti");
  const [category, setCategory] = useState("tutte");

  const list = transactions
    .filter((t) => filter === "tutti" || t.tipo === filter)
    .filter((t) => category === "tutte" || t.categoria === category);

  const reset = () => { setForm(EMPTY()); setFileUrl(""); setMatch(null); };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try { setFileUrl((await api.integrations.Core.UploadFile({ file, private: true })).file_url); }
    catch (e) { toast({ title: e.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const readWithAi = async () => {
    setAiLoading(true);
    setMatch(null);
    try {
      const r = await api.integrations.Core.InvokeLLM({
        prompt: `Analizza questo documento di spesa (bolla, DDT, scontrino, fattura, ricevuta).
Estrai: importo totale (numero, IVA inclusa), data (YYYY-MM-DD), fornitore, una breve descrizione della merce/servizio e la categoria tra: ${COST_CATEGORIES.join(", ")}.
Se sul documento c'è un indirizzo o nome di cantiere, confrontalo con questi lavori: ${JSON.stringify(allWorksites.map((w) => ({ id: w.id, nome: w.nome, indirizzo: w.indirizzo })))}.
Solo con corrispondenza chiara indica worksite_match_id; se incerto imposta needs_worksite_confirmation: true.`,
        file_urls: [fileUrl],
        response_json_schema: { type: "object", properties: { importo: { type: "number" }, data: { type: "string" }, fornitore: { type: "string" }, descrizione: { type: "string" }, categoria: { type: "string" }, worksite_match_id: { type: "string" }, worksite_match_nome: { type: "string" }, needs_worksite_confirmation: { type: "boolean" } } },
      });
      setForm((f) => ({
        ...f,
        importo: r.importo || f.importo,
        data: /^\d{4}-\d{2}-\d{2}$/.test(r.data || "") ? r.data : f.data,
        fornitore: r.fornitore || f.fornitore,
        descrizione: f.descrizione || r.descrizione || "",
        categoria: COST_CATEGORIES.includes(r.categoria) ? r.categoria : f.categoria,
      }));
      if (r.worksite_match_id && r.worksite_match_id !== worksite.id) setMatch({ id: r.worksite_match_id, nome: r.worksite_match_nome || "" });
      else if (r.needs_worksite_confirmation) setMatch({ id: null, nome: "" });
      toast({ title: "Dati letti dal documento", description: "Controllali prima di salvare." });
    } catch (e) {
      toast({ title: e.message || "Lettura non riuscita", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const save = async () => {
    const importo = Number(String(form.importo).replace(",", "."));
    if (!importo || !form.data) return toast({ title: "Importo e data sono obbligatori", variant: "destructive" });
    const targetId = match?.id || worksite.id;
    const target = allWorksites.find((w) => w.id === targetId) || worksite;
    await db.WorksiteTransaction.create({ ...form, importo, worksite_id: targetId, worksite_nome: target.nome, file_url: fileUrl || null });
    setOpen(false);
    reset();
    toast({ title: targetId === worksite.id ? "Movimento registrato" : `Registrato su ${target.nome}` });
    onChanged?.();
  };

  const remove = async (t) => {
    if (!(await confirmDialog(`Eliminare "${t.descrizione || t.categoria}" di ${fmtEur(t.importo)}?`))) return;
    await db.WorksiteTransaction.delete(t.id);
    onChanged?.();
  };

  const exportCsv = () => downloadCsv(`movimenti-${(worksite.nome || "lavoro").replace(/[^\w-]+/g, "_")}.csv`,
    ["Data", "Tipo", "Categoria", "Descrizione", "Fornitore", "Importo", "Documento"],
    list.map((t) => [t.data, t.tipo, t.categoria, t.descrizione, t.fornitore, (t.tipo === "uscita" ? -1 : 1) * (Number(t.importo) || 0), t.file_url || ""]));

  const cats = [...new Set(transactions.map((t) => t.categoria).filter(Boolean))];

  return (
    <section className="bg-white rounded-xl border border-zinc-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-zinc-800 flex items-center gap-2 flex-1"><Wallet className="w-4 h-4 text-zinc-500" /> Movimenti</h3>
        {transactions.length > 0 && <Button size="sm" variant="ghost" className="gap-1" onClick={exportCsv}><Download className="w-4 h-4" /> Esporta</Button>}
        {!readOnly && <Button size="sm" className="gap-1.5" onClick={() => { reset(); setOpen(true); }}><Plus className="w-4 h-4" /> Spesa o entrata</Button>}
      </div>

      {transactions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {[["tutti", "Tutti"], ["uscita", "Uscite"], ["entrata", "Entrate"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs ${filter === k ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}>{l}</button>
          ))}
          {cats.length > 1 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="tutte">Tutte le categorie</SelectItem>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4 text-center">{transactions.length ? "Nessun movimento con questi filtri." : "Registra spese e incassi: fotografa la bolla o lo scontrino e l'AI compila i dati."}</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {list.map((t) => (
            <li key={t.id} className="py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-900 truncate">{t.descrizione || t.categoria}</p>
                <p className="text-xs text-zinc-500 truncate">{fmtDate(t.data)} · {t.categoria}{t.fornitore ? ` · ${t.fornitore}` : ""}</p>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${t.tipo === "entrata" ? "text-emerald-700" : "text-red-700"}`}>{t.tipo === "entrata" ? "+" : "−"}{fmtEur(t.importo)}</span>
              {t.file_url && <a href={t.file_url} target="_blank" rel="noopener noreferrer" aria-label="Vedi documento" className="p-1.5 rounded hover:bg-zinc-100 text-zinc-500"><Eye className="w-4 h-4" /></a>}
              {!readOnly && <button aria-label="Elimina" onClick={() => remove(t)} className="p-1.5 rounded hover:bg-red-50 text-zinc-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuovo movimento</DialogTitle><DialogDescription>{worksite.nome}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[["uscita", "Spesa"], ["entrata", "Entrata"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, tipo: k, categoria: k === "entrata" ? INCOME_CATEGORIES[0] : COST_CATEGORIES[0] })}
                  className={`rounded-lg border py-2 text-sm font-medium ${form.tipo === k ? (k === "uscita" ? "border-red-500 bg-red-50 text-red-800" : "border-emerald-500 bg-emerald-50 text-emerald-800") : "border-zinc-200 text-zinc-600"}`}>{l}</button>
              ))}
            </div>
            {form.tipo === "uscita" && (
              <div className="rounded-lg border-2 border-dashed border-zinc-300 p-3">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <label className="flex-1 flex items-center gap-2 cursor-pointer text-sm text-zinc-700">
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin text-zinc-500" /> : <Camera className="w-5 h-5 text-zinc-500" />}
                    {fileUrl ? "Documento caricato · tocca per cambiarlo" : "Fotografa o carica bolla, scontrino o fattura"}
                    <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => upload(e.target.files[0])} />
                  </label>
                  {fileUrl && <Button type="button" size="sm" variant="outline" className="gap-1" onClick={readWithAi} disabled={aiLoading}>{aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Compila con l'AI</Button>}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="worksitetransactions-categoria">Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger id="worksitetransactions-categoria" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{(form.tipo === "entrata" ? INCOME_CATEGORIES : COST_CATEGORIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="worksitetransactions-importo">Importo €</Label><Input id="worksitetransactions-importo" className="mt-1" type="number" inputMode="decimal" step="0.01" value={form.importo} onChange={(e) => setForm({ ...form, importo: e.target.value })} /></div>
              <div><Label htmlFor="worksitetransactions-data">Data</Label><Input id="worksitetransactions-data" className="mt-1" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
              <div><Label htmlFor="worksitetransactions-campo">{form.tipo === "uscita" ? "Fornitore" : "Da"}</Label><Input id="worksitetransactions-campo" className="mt-1" value={form.fornitore} onChange={(e) => setForm({ ...form, fornitore: e.target.value })} /></div>
            </div>
            <div><Label htmlFor="worksitetransactions-descrizione">Descrizione</Label><Input id="worksitetransactions-descrizione" className="mt-1" value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} placeholder="Es. cemento e sabbia" /></div>
            {match && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p>{match.id ? <>Il documento sembra di un altro lavoro: <strong>{match.nome}</strong>.</> : "Non è chiaro a quale lavoro appartenga il documento."} Scegli dove registrarlo:</p>
                  <Select value={match.id || worksite.id} onValueChange={(v) => setMatch({ id: v, nome: allWorksites.find((w) => w.id === v)?.nome || "" })}>
                    <SelectTrigger className="mt-2 h-8 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{allWorksites.map((w) => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
              <Button onClick={save} disabled={uploading || aiLoading}>Salva</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
