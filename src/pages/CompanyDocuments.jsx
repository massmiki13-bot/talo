import React, { useState, useEffect } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { FolderOpen, Upload, Trash2, AlertTriangle, ScanLine, Bell, Eye, FileDown, Loader2, Sparkles } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import AiDocumentReader from "@/components/shared/AiDocumentReader";
import DocumentPreviewDialog, { downloadAsPdf } from "@/components/shared/DocumentPreviewDialog";
import { deleteRemindersForDoc, createDocumentReminder, getExpirationStatus } from "@/utils/expirationReminders";
import CreateReminderButton from "@/components/shared/CreateReminderButton";
import FolderTabs from "@/components/documents/FolderTabs";
import ContentSearchBar from "@/components/documents/ContentSearchBar";
import AiReorganizeDialog from "@/components/documents/AiReorganizeDialog";

const docTypes = [
  { value: "certificazione", label: "Certificazione" },
  { value: "assicurazione", label: "Assicurazione" },
  { value: "durc", label: "DURC" },
  { value: "visura", label: "Visura Camerale" },
  { value: "altro", label: "Altro" },
];

const emptyDoc = { titolo: "", tipo: "altro", descrizione: "", file_url: "", data_emissione: "", data_scadenza: "", giorni_preavviso_custom: null, ripeti_promemoria_custom: null, cartella_id: "", cartella_nome: "", contatto_id: "", contatto_nome: "" };

export default function CompanyDocuments() {
  const [docs, setDocs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyDoc);
  const [uploading, setUploading] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerFileUrl, setReaderFileUrl] = useState("");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [reorganizeOpen, setReorganizeOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const docId = urlParams.get("doc");
    load(docId);
  }, []);

  const load = async (highlightDocId) => {
    try {
      const [d, f, c] = await Promise.all([db.CompanyDocument.list(), db.DocumentFolder.list(), db.Contact.list()]);
      setDocs(d);
      setFolders(f.sort((a, b) => (a.ordine || 0) - (b.ordine || 0)));
      setContacts(c);
      if (highlightDocId) {
        const doc = d.find(doc => doc.id === highlightDocId);
        if (doc) setPreviewDoc(doc);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, file_url }));
    } catch (err) {
      toast({ title: "Errore upload", variant: "destructive" });
    } finally { setUploading(false); }
  };

  const handleSave = async (withReminder = false) => {
    try {
      const folder = folders.find(f => f.id === form.cartella_id);
      const contatto = contacts.find(c => c.id === form.contatto_id);
      const dataToSave = { ...form, data_scadenza: form.data_scadenza || null, cartella_nome: folder?.nome || "", contatto_nome: contatto ? (contatto.nome || contatto.nome_privato || "") : "" };
      const created = await db.CompanyDocument.create(dataToSave);
      if (withReminder && form.data_scadenza) {
        const tipoLabel = docTypes.find(t => t.value === form.tipo)?.label || form.tipo;
        await createDocumentReminder(form.titolo, form.data_scadenza, created.id, "CompanyDocument", tipoLabel, null);
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

  const handleDelete = async (id) => {
    if (!confirm("Eliminare questo documento?")) return;
    await deleteRemindersForDoc(id);
    await db.CompanyDocument.delete(id);
    load();
  };

  const openReader = (fileUrl) => { setReaderFileUrl(fileUrl); setReaderOpen(true); };

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
    }));
    toast({ title: "Dati estratti — verifica prima di salvare" });
  };

  const openNew = () => { setForm(emptyDoc); setDialogOpen(true); };

  // Folder management
  const handleCreateFolder = async (nome) => {
    try {
      await db.DocumentFolder.create({ nome, ordine: folders.length });
      load();
      toast({ title: "Cartella creata" });
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const handleRenameFolder = async (id, nome) => {
    try {
      await db.DocumentFolder.update(id, { nome });
      const docsInFolder = docs.filter(d => d.cartella_id === id);
      if (docsInFolder.length > 0) {
        await db.CompanyDocument.bulkUpdate(docsInFolder.map(d => ({ id: d.id, cartella_nome: nome })));
      }
      load();
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const handleDeleteFolder = async (id) => {
    try {
      const docsInFolder = docs.filter(d => d.cartella_id === id);
      if (docsInFolder.length > 0) {
        await db.CompanyDocument.bulkUpdate(docsInFolder.map(d => ({ id: d.id, cartella_id: "", cartella_nome: "" })));
      }
      await db.DocumentFolder.delete(id);
      if (selectedFolderId === id) setSelectedFolderId(null);
      load();
      toast({ title: "Cartella eliminata" });
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const handleMoveToFolder = async (docId, folderId) => {
    const folder = folders.find(f => f.id === folderId);
    try {
      await db.CompanyDocument.update(docId, { cartella_id: folderId || "", cartella_nome: folder?.nome || "" });
      load();
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const isExpired = (date) => getExpirationStatus(date) === "expired";
  const isExpiringSoon = (date) => getExpirationStatus(date) === "expiring_soon";

  const filteredDocs = selectedFolderId
    ? docs.filter(d => d.cartella_id === selectedFolderId)
    : docs;

  const docCounts = { all: docs.length };
  folders.forEach(f => { docCounts[f.id] = docs.filter(d => d.cartella_id === f.id).length; });

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Documenti Ditta" subtitle="Certificazioni, assicurazioni, DURC e altro" actionLabel="+ Carica Documento" onAction={openNew} actionIcon={Upload}>
        <Button variant="outline" onClick={() => setReorganizeOpen(true)} className="gap-2">
          <Sparkles className="w-4 h-4" /> Riordina con IA
        </Button>
      </PageHeader>

      <ContentSearchBar documents={docs} folders={folders} onResultClick={(doc) => setPreviewDoc(doc)} onDocumentsUpdated={load} />

      <FolderTabs
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        onCreate={handleCreateFolder}
        onRename={handleRenameFolder}
        onDelete={handleDeleteFolder}
        docCounts={docCounts}
      />

      {filteredDocs.length === 0 ? (
        <EmptyState icon={FolderOpen} title={selectedFolderId ? "Cartella vuota" : "Nessun documento"} actionLabel="+ Carica Documento" onAction={openNew} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Titolo</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Cartella</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3 hidden md:table-cell">Tipo</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3 hidden md:table-cell">Scadenza</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {doc.file_url ? (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{doc.titolo}</a>
                    ) : doc.titolo}
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={doc.cartella_id || "none"}
                      onValueChange={(v) => handleMoveToFolder(doc.id, v === "none" ? "" : v)}
                    >
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue placeholder="Nessuna" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nessuna —</SelectItem>
                        {folders.map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">{docTypes.find(t => t.value === doc.tipo)?.label || doc.tipo}</td>
                  <td className="px-4 py-3 text-sm hidden md:table-cell">
                    {doc.data_scadenza ? (
                      <div className="space-y-1.5">
                        <span className={`flex items-center gap-1 ${isExpired(doc.data_scadenza) ? "text-red-600" : isExpiringSoon(doc.data_scadenza) ? "text-amber-600" : "text-slate-600"}`}>
                          {(isExpired(doc.data_scadenza) || isExpiringSoon(doc.data_scadenza)) && <AlertTriangle className="w-3 h-3" />}
                          {new Date(doc.data_scadenza).toLocaleDateString("it-IT")}
                        </span>
                        <CreateReminderButton
                          docTitle={doc.titolo}
                          scadenzaDate={doc.data_scadenza}
                          docId={doc.id}
                          docType="CompanyDocument"
                          docTypeLabel={docTypes.find(t => t.value === doc.tipo)?.label || doc.tipo}
                        />
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {doc.file_url && (
                        <>
                          <button onClick={() => openReader(doc.file_url)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Leggi con IA">
                            <ScanLine className="w-4 h-4" />
                          </button>
                          <button onClick={() => setPreviewDoc(doc)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600" title="Anteprima">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDownloadPdf(doc)} disabled={downloadingId === doc.id} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 disabled:opacity-50" title="Scarica PDF">
                            {downloadingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                          </button>
                        </>
                      )}
                      <button onClick={() => handleDelete(doc.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
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
          <DialogHeader><DialogTitle>Carica Documento Ditta</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Titolo</Label><Input value={form.titolo} onChange={e => setForm({ ...form, titolo: e.target.value })} /></div>
            <div>
              <Label>Cartella</Label>
              <Select value={form.cartella_id || "none"} onValueChange={v => setForm({ ...form, cartella_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Nessuna cartella" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nessuna cartella —</SelectItem>
                  {folders.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{docTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cliente / Fornitore</Label>
              <Select value={form.contatto_id || "none"} onValueChange={v => setForm({ ...form, contatto_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Nessun collegamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nessuno —</SelectItem>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.nome || c.nome_privato} ({c.tipo})</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">Il documento apparirà automaticamente nella scheda del cliente/fornitore</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data Emissione</Label><Input type="date" value={form.data_emissione} onChange={e => setForm({ ...form, data_emissione: e.target.value })} /></div>
              <div><Label>Data Scadenza</Label><Input type="date" value={form.data_scadenza} onChange={e => setForm({ ...form, data_scadenza: e.target.value })} /></div>
            </div>
            <div><Label>Descrizione</Label><textarea value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2 text-sm min-h-[60px]" /></div>
            <div>
              <Label>File</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} disabled={uploading} />
              {uploading && <p className="text-xs text-slate-500 mt-1">Caricamento...</p>}
              {form.file_url && (
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-xs text-emerald-600">File caricato ✓</p>
                  <Button size="sm" variant="outline" onClick={() => openReader(form.file_url)} className="h-7 text-xs gap-1">
                    <ScanLine className="w-3 h-3" /> Leggi con IA
                  </Button>
                </div>
              )}
            </div>

            {form.data_scadenza && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-medium text-slate-600">Notifiche scadenza (personalizzate)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Giorni preavviso (vuoto = globale)</Label>
                    <Input type="number" value={form.giorni_preavviso_custom ?? ""} onChange={e => setForm({ ...form, giorni_preavviso_custom: e.target.value ? parseInt(e.target.value) : null })} />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <Switch checked={form.ripeti_promemoria_custom || false} onCheckedChange={v => setForm({ ...form, ripeti_promemoria_custom: v })} />
                    <span className="text-xs text-slate-600">Ripeti promemoria</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            {form.data_scadenza ? (
              <>
                <Button onClick={() => handleSave(false)} variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50" disabled={!form.titolo}>Salva</Button>
                <Button onClick={() => handleSave(true)} className="bg-blue-600 hover:bg-blue-700 gap-1.5" disabled={!form.titolo}>
                  <Bell className="w-4 h-4" /> Salva e aggiungi al promemoria
                </Button>
              </>
            ) : (
              <Button onClick={() => handleSave(false)} className="bg-blue-600 hover:bg-blue-700" disabled={!form.titolo}>Salva</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AiDocumentReader open={readerOpen} onOpenChange={setReaderOpen} fileUrl={readerFileUrl} onConfirm={handleReaderConfirm} />

      <DocumentPreviewDialog
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        fileUrl={previewDoc?.file_url}
        titolo={previewDoc?.titolo}
      />

      <AiReorganizeDialog
        open={reorganizeOpen}
        onOpenChange={setReorganizeOpen}
        documents={docs}
        onApplied={load}
      />
    </div>
  );
}