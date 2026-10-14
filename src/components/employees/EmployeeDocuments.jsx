import React, { useState, useEffect } from "react";
import { confirmDialog } from "@/components/shared/ConfirmHost";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Trash2, FileText, AlertTriangle, ScanLine, Bell, Loader2, Pencil, Eye, FileDown } from "lucide-react";
import { readDocumentWithAi } from "@/utils/documentAi";
import EmptyState from "@/components/shared/EmptyState";
import AiDocumentReader from "@/components/shared/AiDocumentReader";
import { deleteRemindersForDoc, createDocumentReminder, getExpirationStatus } from "@/utils/expirationReminders";
import CreateReminderButton from "@/components/shared/CreateReminderButton";
import EditDocumentDialog from "@/components/shared/EditDocumentDialog";
import DocumentPreviewDialog, { downloadAsPdf } from "@/components/shared/DocumentPreviewDialog";

const docTypes = [
  { value: "contratto", label: "Contratto" },
  { value: "corso", label: "Corso" },
  { value: "visita_medica", label: "Visita Medica" },
  { value: "busta_paga", label: "Busta paga / LUL" },
  { value: "documento_identita", label: "Documento d'Identità" },
  { value: "altro", label: "Altro" },
];

const emptyDoc = { titolo: "", tipo: "altro", tipo_altro: "", descrizione: "", file_url: "", data_emissione: "", data_scadenza: "", scadenza_mode: "nessuna", anticipo: "0", ripetizione: "nessuna" };

// Documenti del dipendente (caricamento, lettura AI, scadenze e promemoria).
export default function EmployeeDocuments({ employee, docs, onChanged, highlightDocId, readOnly = false }) {
  const id = employee.id;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyDoc);
  const [uploading, setUploading] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerFileUrl, setReaderFileUrl] = useState("");
  const [readingDate, setReadingDate] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    if (highlightDocId) {
      const doc = docs.find(d => d.id === highlightDocId);
      if (doc) setEditDoc(doc);
    }
  }, [highlightDocId]);

  const load = () => onChanged?.();

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file, private: true });
      setForm(prev => ({ ...prev, file_url }));
    } catch (err) {
      toast({ title: "Errore upload", variant: "destructive" });
    } finally { setUploading(false); }
  };

  const handleSave = async (withReminder = false) => {
    try {
      const created = await db.EmployeeDocument.create({ ...form, data_scadenza: form.data_scadenza || null, dipendente_id: id });
      if (withReminder && form.data_scadenza) {
        const tipoLabel = form.tipo === "altro" ? (form.tipo_altro || "Altro") : (docTypes.find(t => t.value === form.tipo)?.label || form.tipo);
        const personName = `${employee.nome} ${employee.cognome}`;
        await createDocumentReminder(form.titolo, form.data_scadenza, created.id, "EmployeeDocument", tipoLabel, personName, Number(form.anticipo) || 0, form.ripetizione || "nessuna");
      }
      setDialogOpen(false);
      setForm(emptyDoc);
      load();
      toast({
        title: withReminder ? "Documento e promemoria creati" : "Documento aggiunto",
        description: withReminder ? "Promemoria visibile in Attivi e nel Calendario." : undefined,
        duration: withReminder ? 5000 : 2000,
      });
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!(await confirmDialog("Eliminare questo documento?"))) return;
    try {
      await deleteRemindersForDoc(docId);
      await db.EmployeeDocument.delete(docId);
    } catch (e) {
      console.error(e);
    } finally {
      load();
    }
  };

  const openReader = (fileUrl) => {
    setReaderFileUrl(fileUrl);
    setReaderOpen(true);
  };

  const handleDownloadPdf = async (doc) => {
    setDownloadingId(doc.id);
    try {
      await downloadAsPdf(doc.file_url, doc.titolo);
      toast({ title: "Download avviato", className: "bg-green-600 text-white" });
    } catch (e) {
      toast({ title: "Errore download", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleReaderConfirm = async (extracted) => {
    setForm(prev => ({
      ...prev,
      titolo: extracted.titolo || prev.titolo,
      tipo: extracted.tipo || prev.tipo,
      descrizione: extracted.descrizione || prev.descrizione,
      data_emissione: extracted.data_emissione || prev.data_emissione,
      data_scadenza: extracted.data_scadenza || prev.data_scadenza,
      scadenza_mode: extracted.data_scadenza ? "ia" : prev.scadenza_mode,
    }));
    toast({ title: "Dati estratti — verifica prima di salvare" });
  };

  const handleReadWithAi = async () => {
    if (!form.file_url) {
      toast({ title: "Carica prima un file", description: "Serve un documento per la lettura IA" });
      return;
    }
    setForm(prev => ({ ...prev, scadenza_mode: "ia" }));
    setReadingDate(true);
    try {
      const extracted = await readDocumentWithAi(form.file_url);
      setForm(prev => ({
        ...prev,
        tipo: extracted.tipo || prev.tipo,
        tipo_altro: extracted.tipo_altro || prev.tipo_altro,
        data_emissione: extracted.data_emissione || prev.data_emissione,
        data_scadenza: extracted.data_scadenza || prev.data_scadenza,
        descrizione: extracted.descrizione || prev.descrizione,
        titolo: prev.titolo || extracted.descrizione || "",
        scadenza_mode: extracted.data_scadenza ? "ia" : prev.scadenza_mode,
      }));
      if (!extracted.data_scadenza) {
        toast({ title: "Nessuna scadenza trovata", description: "L'IA non ha rilevato una data di scadenza. Inseriscila manualmente se necessario." });
      }
    } catch (e) {
      toast({ title: "Errore lettura IA", variant: "destructive" });
    } finally {
      setReadingDate(false);
    }
  };

  const isExpired = (date) => getExpirationStatus(date) === "expired";
  const isExpiringSoon = (date) => getExpirationStatus(date) === "expiring_soon";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900">Documenti</h2>
        {!readOnly && <Button onClick={() => { setForm(emptyDoc); setDialogOpen(true); }} className="bg-brand-600 hover:bg-brand-700 gap-2">
          <Upload className="w-4 h-4" /> Carica documento
        </Button>}
      </div>

      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="Nessun documento" description="Carica il primo documento per questo dipendente" />
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="text-left text-xs font-medium text-zinc-500 uppercase px-4 py-3">Titolo</th>
                <th className="text-left text-xs font-medium text-zinc-500 uppercase px-4 py-3">Tipo</th>
                <th className="text-left text-xs font-medium text-zinc-500 uppercase px-4 py-3 hidden md:table-cell">Scadenza</th>
                <th className="text-right text-xs font-medium text-zinc-500 uppercase px-4 py-3">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 text-sm font-medium text-zinc-900">
                    {doc.file_url ? (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{doc.titolo}</a>
                    ) : doc.titolo}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">{docTypes.find(t => t.value === doc.tipo)?.label || doc.tipo}</td>
                  <td className="px-4 py-3 text-sm hidden md:table-cell">
                    {doc.data_scadenza ? (
                      <div className="space-y-1.5">
                        <span className={`flex items-center gap-1 ${isExpired(doc.data_scadenza) ? "text-red-700" : isExpiringSoon(doc.data_scadenza) ? "text-amber-700" : "text-zinc-600"}`}>
                          {(isExpired(doc.data_scadenza) || isExpiringSoon(doc.data_scadenza)) && <AlertTriangle className="w-3 h-3" />}
                          {new Date(doc.data_scadenza).toLocaleDateString("it-IT")}
                        </span>
                        <CreateReminderButton
                          docTitle={doc.titolo}
                          scadenzaDate={doc.data_scadenza}
                          docId={doc.id}
                          docType="EmployeeDocument"
                          docTypeLabel={docTypes.find(t => t.value === doc.tipo)?.label || doc.tipo}
                          personName={`${employee.nome} ${employee.cognome}`}
                        />
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!readOnly && <button onClick={() => setEditDoc(doc)} className="p-1.5 rounded-lg hover:bg-brand-50 text-zinc-500 hover:text-brand-600" title="Modifica documento">
                        <Pencil className="w-4 h-4" />
                      </button>}
                      {doc.file_url && (
                        <>
                          <button onClick={() => openReader(doc.file_url)} className="p-1.5 rounded-lg hover:bg-brand-50 text-zinc-500 hover:text-brand-600" title="Leggi con IA">
                            <ScanLine className="w-4 h-4" />
                          </button>
                          <button onClick={() => setPreviewDoc(doc)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-zinc-500 hover:text-indigo-600" title="Anteprima">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDownloadPdf(doc)} disabled={downloadingId === doc.id} className="p-1.5 rounded-lg hover:bg-emerald-50 text-zinc-500 hover:text-emerald-600 disabled:opacity-50" title="Scarica PDF">
                            {downloadingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                          </button>
                        </>
                      )}
                      {!readOnly && <button onClick={() => handleDeleteDoc(doc.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Carica Documento</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label htmlFor="employeedocuments-titolo">Titolo</Label><Input id="employeedocuments-titolo" value={form.titolo} onChange={e => setForm({ ...form, titolo: e.target.value })} /></div>
            <div>
              <Label htmlFor="employeedocuments-tipo">Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger id="employeedocuments-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>{docTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              {form.tipo === "altro" && (
                <Input
                  value={form.tipo_altro || ""}
                  onChange={e => setForm({ ...form, tipo_altro: e.target.value })}
                  placeholder="Specifica il tipo di documento..."
                  className="mt-1.5"
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label htmlFor="employeedocuments-data-emissione">Data Emissione</Label><Input id="employeedocuments-data-emissione" type="date" value={form.data_emissione} onChange={e => setForm({ ...form, data_emissione: e.target.value })} /></div>
            </div>

            {/* Scadenza — tre opzioni coerenti con AIAssistant */}
            <div className="border-t border-zinc-100 pt-3">
              <Label className="text-xs font-medium text-zinc-600">Data scadenza</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, scadenza_mode: "manuale" }))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${form.scadenza_mode === "manuale" ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
                >Manuale</button>
                <button
                  type="button"
                  onClick={handleReadWithAi}
                  disabled={readingDate}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${form.scadenza_mode === "ia" ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"} disabled:opacity-60`}
                >
                  {readingDate && <Loader2 className="w-3 h-3 animate-spin" />}
                  Lettura IA
                </button>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, scadenza_mode: "nessuna", data_scadenza: "" }))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${form.scadenza_mode === "nessuna" ? "bg-zinc-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
                >Nessuna scadenza</button>
              </div>

              {(form.scadenza_mode === "manuale" || form.scadenza_mode === "ia") && (
                <div className="mt-2">
                  <Input
                    type="date"
                    value={form.data_scadenza || ""}
                    onChange={e => setForm(prev => ({ ...prev, data_scadenza: e.target.value }))}
                  />
                  {form.scadenza_mode === "ia" && form.data_scadenza && (
                    <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Data rilevata dall'IA — verifica e correggi se necessario.
                    </p>
                  )}
                  {form.scadenza_mode === "ia" && !form.data_scadenza && !readingDate && (
                    <p className="text-xs text-zinc-500 mt-1">L'IA non ha trovato una scadenza. Inseriscila manualmente sopra.</p>
                  )}
                  {form.scadenza_mode === "manuale" && (
                    <p className="text-xs text-zinc-500 mt-1">Inserisci la data di scadenza manualmente.</p>
                  )}
                </div>
              )}

              {form.scadenza_mode === "nessuna" && (
                <p className="text-xs text-zinc-500 mt-2">Il documento non ha scadenza — nessun promemoria verrà creato.</p>
              )}
            </div>
            <div>
              <Label htmlFor="employeedocuments-file">File</Label>
              <Input id="employeedocuments-file" type="file" accept="image/*,application/pdf" onChange={handleFileUpload} disabled={uploading} />
              {uploading && <p className="text-xs text-zinc-500 mt-1">Caricamento...</p>}
              {form.file_url && (
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-xs text-emerald-700">File caricato ✓</p>
                  <Button size="sm" variant="outline" onClick={() => openReader(form.file_url)} className="h-7 text-xs gap-1">
                    <ScanLine className="w-3 h-3" /> Leggi con IA
                  </Button>
                </div>
              )}
            </div>

            {/* Anticipo + ripetizione — coerente con AIAssistant */}
            {form.data_scadenza && (
              <div className="border-t border-zinc-100 pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5 text-brand-600" />
                  <span className="text-xs font-medium text-zinc-600">Avvisa con anticipo</span>
                </div>
                <Select value={form.anticipo || "0"} onValueChange={v => setForm({ ...form, anticipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Nessun preavviso (solo alla scadenza)</SelectItem>
                    <SelectItem value="7">1 settimana prima</SelectItem>
                    <SelectItem value="14">2 settimane prima</SelectItem>
                    <SelectItem value="30">1 mese prima</SelectItem>
                    <SelectItem value="60">2 mesi prima</SelectItem>
                    <SelectItem value="90">3 mesi prima</SelectItem>
                  </SelectContent>
                </Select>
                {Number(form.anticipo) > 0 && (
                  <div>
                    <Label htmlFor="employeedocuments-ripeti-avviso" className="text-xs">Ripeti avviso</Label>
                    <Select value={form.ripetizione || "nessuna"} onValueChange={v => setForm({ ...form, ripetizione: v })}>
                      <SelectTrigger id="employeedocuments-ripeti-avviso" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nessuna">Una volta sola</SelectItem>
                        <SelectItem value="giornaliera">Ogni giorno fino alla scadenza</SelectItem>
                        <SelectItem value="settimanale">Ogni settimana fino alla scadenza</SelectItem>
                        <SelectItem value="mensile">Ogni mese fino alla scadenza</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            {form.data_scadenza ? (
              <>
                <Button onClick={() => handleSave(false)} variant="outline" className="border-brand-200 text-brand-700 hover:bg-brand-50" disabled={!form.titolo}>Salva</Button>
                <Button onClick={() => handleSave(true)} className="bg-brand-600 hover:bg-brand-700 gap-1.5" disabled={!form.titolo}>
                  <Bell className="w-4 h-4" /> Salva e aggiungi al promemoria
                </Button>
              </>
            ) : (
              <Button onClick={() => handleSave(false)} className="bg-brand-600 hover:bg-brand-700" disabled={!form.titolo}>Salva</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AiDocumentReader open={readerOpen} onOpenChange={setReaderOpen} fileUrl={readerFileUrl} onConfirm={handleReaderConfirm} />

      <EditDocumentDialog
        open={!!editDoc}
        onOpenChange={(open) => !open && setEditDoc(null)}
        doc={editDoc}
        employeeName={employee ? `${employee.nome} ${employee.cognome}` : ""}
        onUpdated={load}
      />

      <DocumentPreviewDialog
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        fileUrl={previewDoc?.file_url}
        titolo={previewDoc?.titolo}
      />
    </div>
  );
}