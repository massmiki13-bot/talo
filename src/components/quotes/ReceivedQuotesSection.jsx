import React, { useState, useEffect, useRef } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Inbox, Upload, Trash2, Eye, FileText, FileImage, FileCheck, Send, Search, CheckSquare } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";
import SignStampDialog from "./SignStampDialog";

function getFileType(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  return "document";
}

function fileTypeIcon(tipo) {
  if (tipo === "image") return FileImage;
  if (tipo === "pdf") return FileText;
  return FileText;
}

export default function ReceivedQuotesSection({ profile, worksites }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [signTarget, setSignTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ fornitore: "", data: new Date().toISOString().slice(0, 10), importo: 0, descrizione: "", worksite_id: "", note: "" });
  const [fileUrl, setFileUrl] = useState("");
  const [fileTipo, setFileTipo] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await db.ReceivedQuote.list("-data");
      setItems(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setAiSuggestion(null);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      setFileUrl(file_url);
      setFileTipo(getFileType(file));
      extractAmount(file_url);
    } catch (e) {
      toast({ title: "Errore upload", variant: "destructive" });
    } finally { setUploading(false); }
  };

  const extractAmount = async (url) => {
    setAiExtracting(true);
    try {
      const result = await api.integrations.Core.InvokeLLM({
        prompt: `Analizza il documento allegato (preventivo, offerta o fattura ricevuta). Estrai l'importo TOTALE finale del documento (iva inclusa). Se trovi più cifre, scegli quella etichettata come "Totale", "Totale fattura", "Importo a pagare", "Totale IVA inclusa" o simili. Restituisci SOLO l'importo numerico (senza simboli € o valuta), usando il punto come separatore decimale. Se non riesci a individuarlo con ragionevole certezza, restituisci null.`,
        file_urls: [url],
        response_json_schema: {
          type: "object",
          properties: {
            importo_totale: { type: ["number", "null"] },
            valuta: { type: "string" }
          },
          required: ["importo_totale"]
        }
      });
      if (result?.importo_totale != null && !isNaN(result.importo_totale)) {
        setAiSuggestion({ importo: result.importo_totale, valuta: result.valuta || "EUR" });
      } else {
        setAiSuggestion({ importo: null, notFound: true });
      }
    } catch (e) {
      setAiSuggestion({ importo: null, notFound: true });
    } finally {
      setAiExtracting(false);
    }
  };

  const acceptAiSuggestion = () => {
    if (aiSuggestion?.importo != null) {
      setForm(f => ({ ...f, importo: aiSuggestion.importo }));
    }
    setAiSuggestion(null);
  };

  const rejectAiSuggestion = () => setAiSuggestion(null);

  const handleSave = async () => {
    if (!form.fornitore || !form.data || !fileUrl) {
      toast({ title: "Mittente, data e file sono obbligatori", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const ws = worksites.find(w => w.id === form.worksite_id);
      await db.ReceivedQuote.create({
        fornitore: form.fornitore,
        data: form.data,
        importo: parseFloat(form.importo) || 0,
        descrizione: form.descrizione,
        file_url: fileUrl,
        file_tipo: fileTipo,
        worksite_id: form.worksite_id || "",
        worksite_nome: ws?.nome || "",
        stato: "ricevuto",
        note: form.note,
      });
      toast({ title: "Preventivo ricevuto salvato" });
      setDialogOpen(false);
      setForm({ fornitore: "", data: new Date().toISOString().slice(0, 10), importo: 0, descrizione: "", worksite_id: "", note: "" });
      setFileUrl("");
      setFileTipo("");
      load();
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    setDeleteTarget({ type: "single", ids: [id] });
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(rq => rq.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const requestDeleteMulti = () => {
    if (selectedIds.size === 0) return;
    setDeleteTarget({ type: "multi", ids: [...selectedIds] });
  };

  const confirmDelete = async () => {
    const ids = deleteTarget?.ids || [];
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      for (const id of ids) {
        await db.ReceivedQuote.delete(id);
      }
      toast({ title: ids.length === 1 ? "Preventivo eliminato" : `${ids.length} preventivi eliminati` });
      exitSelectMode();
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast({ title: "Errore eliminazione", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (id, stato) => {
    await db.ReceivedQuote.update(id, { stato });
    load();
  };

  const handleSigned = () => {
    setSignTarget(null);
    load();
  };

  const filtered = items.filter(rq => {
    if (search && !rq.fornitore?.toLowerCase().includes(search.toLowerCase()) && !rq.descrizione?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="py-8 text-center text-sm text-slate-400">Caricamento...</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Cerca per mittente o descrizione..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10" />
        </div>
        <Button
          variant={selectMode ? "default" : "outline"}
          onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
          className="gap-2 h-10 flex-shrink-0"
        >
          <CheckSquare className="w-4 h-4" /> {selectMode ? "Fine" : "Seleziona"}
        </Button>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 h-10 flex-shrink-0">
          <Upload className="w-4 h-4" /> Carica preventivo
        </Button>
      </div>

      {selectMode && (
        <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-blue-700">
              {selectedIds.size} selezionat{selectedIds.size === 1 ? "o" : "i"}
            </span>
            <button onClick={toggleSelectAll} className="text-xs text-blue-600 hover:text-blue-800 underline">
              {selectedIds.size === filtered.length ? "Deseleziona tutti" : "Seleziona tutti"}
            </button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exitSelectMode}>Annulla</Button>
            <Button variant="destructive" size="sm" onClick={requestDeleteMulti} disabled={selectedIds.size === 0} className="gap-1.5">
              <Trash2 className="w-4 h-4" /> Elimina selezionati
            </Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={Inbox} title="Nessun preventivo ricevuto" description="Carica i preventivi che ricevi da fornitori e subappaltatori" />
      ) : (
        <div className="space-y-3">
          {filtered.map(rq => {
            const Icon = fileTypeIcon(rq.file_tipo);
            const isSelected = selectedIds.has(rq.id);
            return (
              <div key={rq.id} className={`bg-white rounded-xl border p-4 ${isSelected ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
                <div className="flex items-start gap-3">
                  {selectMode && (
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(rq.id)} className="w-4 h-4 mt-3 cursor-pointer flex-shrink-0" />
                  )}
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-900">{rq.fornitore}</p>
                      <span className="text-xs text-slate-400">{rq.data ? new Date(rq.data).toLocaleDateString("it-IT") : ""}</span>
                      {rq.importo > 0 && <span className="text-sm font-semibold text-slate-700">€ {rq.importo.toFixed(2)}</span>}
                      <Select value={rq.stato} onValueChange={v => handleStatusChange(rq.id, v)}>
                        <SelectTrigger className="h-6 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ricevuto">Ricevuto</SelectItem>
                          <SelectItem value="approvato">Approvato</SelectItem>
                          <SelectItem value="rifiutato">Rifiutato</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {rq.descrizione && <p className="text-xs text-slate-500 mt-1">{rq.descrizione}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {rq.worksite_nome && (
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                          <FileCheck className="w-3 h-3" /> {rq.worksite_nome}
                        </span>
                      )}
                      {rq.file_firmato_url && (
                        <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          <FileCheck className="w-3 h-3" /> Firmato
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-slate-100">
                  {rq.file_url && (
                    <a href={rq.file_url} target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="Vedi originale">
                      <Eye className="w-4 h-4" />
                    </a>
                  )}
                  {rq.file_firmato_url && (
                    <a href={rq.file_firmato_url} target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200" title="Vedi firmato">
                      <FileCheck className="w-4 h-4" />
                    </a>
                  )}
                  {(rq.file_tipo === "image" || rq.file_tipo === "pdf") && profile && profile.firma_url && (
                    <Button size="sm" variant="outline" onClick={() => setSignTarget({ ...rq, _mode: "firma" })} className="gap-1 h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50">
                      <FileCheck className="w-3 h-3" /> Firma
                    </Button>
                  )}
                  {(rq.file_tipo === "image" || rq.file_tipo === "pdf") && profile && profile.timbro_url && (
                    <Button size="sm" variant="outline" onClick={() => setSignTarget({ ...rq, _mode: "timbro" })} className="gap-1 h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                      <FileCheck className="w-3 h-3" /> Timbro
                    </Button>
                  )}
                  <button onClick={() => handleDelete(rq.id)} className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" title="Elimina">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setFileUrl(""); setFileTipo(""); setAiSuggestion(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Carica preventivo ricevuto</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Mittente/Fornitore *</Label>
              <Input value={form.fornitore} onChange={e => setForm({ ...form, fornitore: e.target.value })} placeholder="Es. Mario Rossi Srl" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data *</Label>
                <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Importo (€)</Label>
                <Input type="number" step="0.01" value={form.importo} onChange={e => setForm({ ...form, importo: e.target.value })} className="mt-1" />
              </div>
            </div>

            {aiExtracting && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                <p className="text-xs text-blue-700">Lettura documento in corso... estrazione automatica del totale</p>
              </div>
            )}

            {!aiExtracting && aiSuggestion && !aiSuggestion.notFound && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                <p className="text-xs text-emerald-700 mb-2">
                  Totale rilevato dal documento: <strong>{aiSuggestion.importo.toFixed(2)} €</strong>
                </p>
                <p className="text-xs text-slate-500 mb-2">Confermi che questo importo è corretto?</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={acceptAiSuggestion} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700">Sì, conferma</Button>
                  <Button size="sm" variant="outline" onClick={rejectAiSuggestion} className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-100">No, lo correggo a mano</Button>
                </div>
              </div>
            )}

            {!aiExtracting && aiSuggestion?.notFound && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-xs text-amber-700">Impossibile rilevare il totale dal documento. Inseriscilo manualmente.</p>
                <Button size="sm" variant="ghost" onClick={rejectAiSuggestion} className="h-7 text-xs text-amber-700 hover:bg-amber-100">Ok</Button>
              </div>
            )}
            <div>
              <Label>Descrizione</Label>
              <Input value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })} placeholder="Es. Preventivo fornitura materiali" className="mt-1" />
            </div>
            <div>
              <Label>Cantiere/Lavoro collegato (opzionale)</Label>
              <Select value={form.worksite_id || "none"} onValueChange={v => setForm({ ...form, worksite_id: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Nessun cantiere" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nessun cantiere —</SelectItem>
                  {worksites.map(w => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">Se collegato, il preventivo comparirà anche nella cartella del lavoro.</p>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <Label>File del preventivo *</Label>
              <div className="mt-1">
                <label className="cursor-pointer">
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors min-h-[56px] flex items-center justify-center">
                    {uploading ? <p className="text-xs text-slate-500">Caricamento...</p> : fileUrl ? <p className="text-xs text-emerald-600">✓ File caricato — tocca per cambiare</p> : <><Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" /><p className="text-xs text-slate-500">Carica PDF, immagine o documento</p></>}
                  </div>
                  <input type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} disabled={saving || !fileUrl} className="bg-blue-600 hover:bg-blue-700">{saving ? "..." : "Salva"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sign/Stamp dialog */}
      {signTarget && (
        <SignStampDialog
          open={!!signTarget}
          onOpenChange={(v) => { if (!v) setSignTarget(null); }}
          receivedQuote={signTarget}
          profile={profile}
          mode={signTarget?._mode}
          onSaved={handleSigned}
        />
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={deleteTarget?.type === "multi" ? `Elimina ${deleteTarget?.ids.length} preventivi` : "Elimina preventivo"}
        description={deleteTarget?.type === "multi"
          ? `Sei sicuro di voler eliminare ${deleteTarget?.ids.length} preventivi? L'azione non può essere annullata.`
          : "Sei sicuro di voler eliminare questo preventivo? L'azione non può essere annullata."}
        confirmLabel={deleting ? "Eliminazione..." : "Elimina"}
        onConfirm={confirmDelete}
      />
    </div>
  );
}