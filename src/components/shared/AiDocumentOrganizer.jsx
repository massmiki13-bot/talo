import React, { useState, useEffect } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Upload, FileText, Loader2, FolderTree, Check, AlertCircle, Save } from "lucide-react";
import AiWarning from "@/components/shared/AiWarning";

const DOC_TYPES = [
  { value: "contratto", label: "Contratto" },
  { value: "visita_medica", label: "Visita Medica" },
  { value: "documento_identita", label: "Documento d'Identità" },
  { value: "corso", label: "Certificato/Corso" },
  { value: "certificazione", label: "Certificazione" },
  { value: "assicurazione", label: "Assicurazione" },
  { value: "durc", label: "DURC" },
  { value: "bolla", label: "Bolla/Spesa" },
  { value: "altro", label: "Altro" },
];

export default function AiDocumentOrganizer({ open, onOpenChange }) {
  const [files, setFiles] = useState([]);
  const [uploadedUrls, setUploadedUrls] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [worksites, setWorksites] = useState([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) loadContext();
  }, [open]);

  const loadContext = async () => {
    try {
      const [emps, cls, sites] = await Promise.all([
        db.Employee.list(),
        db.Contact.list(),
        db.Worksite.list(),
      ]);
      setEmployees(emps);
      setContacts(cls);
      setWorksites(sites);
    } catch (e) { console.error(e); }
  };

  const reset = () => {
    setFiles([]);
    setUploadedUrls([]);
    setResults([]);
  };

  const handleFileSelect = async (e) => {
    const selected = Array.from(e.target.files);
    if (selected.length === 0) return;
    setFiles(selected);
    setResults([]);
    setAnalyzing(true);

    try {
      const urls = [];
      for (const file of selected) {
        const { file_url } = await api.integrations.Core.UploadFile({ file });
        urls.push({ name: file.name, url: file_url });
      }
      setUploadedUrls(urls);

      const context = {
        dipendenti: emps_nameList(employees),
        clienti: contacts.filter(c => c.tipo === "cliente").map(c => c.nome),
        lavori: worksites.map(w => ({ id: w.id, nome: w.nome })),
      };

      const allResults = [];
      for (const item of urls) {
        const result = await api.integrations.Core.InvokeLLM({
          prompt: `Analizza questo documento e determina:
1. Tipo di documento (uno tra: contratto, visita_medica, documento_identita, corso, certificazione, assicurazione, durc, bolla, altro)
2. A chi è associato: un dipendente, un cliente, un lavoro/progetto, o la ditta stessa.

Contesto disponibile:
- Dipendenti: ${JSON.stringify(context.dipendenti)}
- Clienti: ${JSON.stringify(context.clienti)}
- Lavori: ${JSON.stringify(context.lavori)}

Se riesci a identificare chiaramente l'associazione, indica entita_tipo e entita_nome.
Se NON sei sicuro a chi associare il documento, imposta "needs_clarification": true e scrivi una domanda specifica per l'utente in "domanda".
Non indovinare — se manca un'informazione, chiedi.`,
          file_urls: [item.url],
          response_json_schema: {
            type: "object",
            properties: {
              tipo_documento: { type: "string" },
              entita_tipo: { type: "string", description: "dipendente, cliente, lavoro, o ditta" },
              entita_nome: { type: "string" },
              needs_clarification: { type: "boolean" },
              domanda: { type: "string" },
              descrizione_breve: { type: "string" },
            },
          },
        });
        allResults.push({
          fileName: item.name,
          fileUrl: item.url,
          tipo: result.tipo_documento || "altro",
          entita_tipo: result.entita_tipo || "ditta",
          entita_nome: result.entita_nome || "",
          needs_clarification: result.needs_clarification || false,
          domanda: result.domanda || "",
          descrizione: result.descrizione_breve || "",
        });
      }
      setResults(allResults);
    } catch (e) {
      toast({ title: "Errore analisi", variant: "destructive" });
    } finally { setAnalyzing(false); }
  };

  const updateResult = (idx, field, value) => {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const r of results) {
        if (r.needs_clarification && !r.entita_nome) continue;

        if (r.entita_tipo === "dipendente") {
          const emp = employees.find(e => `${e.nome} ${e.cognome}` === r.entita_nome);
          if (emp) {
            await db.EmployeeDocument.create({
              dipendente_id: emp.id,
              tipo: mapEmpDocType(r.tipo),
              titolo: r.descrizione || r.fileName,
              file_url: r.fileUrl,
              data_emissione: new Date().toISOString().slice(0, 10),
            });
          }
        } else if (r.entita_tipo === "ditta") {
          await db.CompanyDocument.create({
            tipo: mapCompDocType(r.tipo),
            titolo: r.descrizione || r.fileName,
            file_url: r.fileUrl,
            data_emissione: new Date().toISOString().slice(0, 10),
          });
        } else if (r.entita_tipo === "lavoro") {
          const site = worksites.find(w => w.nome === r.entita_nome);
          if (site) {
            await db.WorksiteTransaction.create({
              worksite_id: site.id,
              worksite_nome: site.nome,
              tipo: "uscita",
              categoria: "Altro",
              descrizione: r.descrizione || r.fileName,
              importo: 0,
              data: new Date().toISOString().slice(0, 10),
              file_url: r.fileUrl,
            });
          }
        }
      }
      toast({ title: "Documenti salvati", description: `${results.filter(r => !r.needs_clarification || r.entita_nome).length} documenti archiviati` });
      reset();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Errore salvataggio", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const emps_nameList = (emps) => emps.map(e => `${e.nome} ${e.cognome}`);

  const mapEmpDocType = (tipo) => {
    const map = { contratto: "contratto", visita_medica: "visita_medica", documento_identita: "documento_identita", corso: "corso" };
    return map[tipo] || "altro";
  };
  const mapCompDocType = (tipo) => {
    const map = { certificazione: "certificazione", assicurazione: "assicurazione", durc: "durc", visura: "visura" };
    return map[tipo] || "altro";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-brand-600" /> Sistema i miei documenti
          </DialogTitle>
        </DialogHeader>

        {results.length === 0 && !analyzing && (
          <div className="mt-4">
            <label className="cursor-pointer block">
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:border-brand-400 transition-colors">
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">Carica uno o più documenti</p>
                <p className="text-xs text-slate-500 mt-1">L'IA li analizzerà e li smisterà automaticamente</p>
              </div>
              <input type="file" multiple className="hidden" onChange={handleFileSelect} />
            </label>
          </div>
        )}

        {analyzing && (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-3" />
            <p className="text-sm text-slate-600">Analisi documenti in corso…</p>
            <p className="text-xs text-slate-400 mt-1">Sto leggendo ogni documento e decidendo dove collocarlo</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-4 space-y-4">
            <AiWarning className="mb-3" />
            {results.map((r, idx) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-4 bg-white">
                <div className="flex items-start gap-3 mb-3">
                  <FileText className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.fileName}</p>
                    {r.descrizione && <p className="text-xs text-slate-500 mt-0.5">{r.descrizione}</p>}
                  </div>
                </div>

                {r.needs_clarification && !r.entita_nome && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-amber-800 font-medium">Domanda dell'IA:</p>
                      <p className="text-sm text-amber-700">{r.domanda}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Tipo documento</label>
                    <Select value={r.tipo} onValueChange={v => updateResult(idx, "tipo", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Associa a</label>
                    <Select value={r.entita_tipo} onValueChange={v => updateResult(idx, "entita_tipo", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dipendente">Dipendente</SelectItem>
                        <SelectItem value="cliente">Cliente</SelectItem>
                        <SelectItem value="lavoro">Lavoro/Progetto</SelectItem>
                        <SelectItem value="ditta">Ditta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {r.entita_tipo === "dipendente" && (
                  <div className="mt-2">
                    <label className="text-xs font-medium text-slate-600">Quale dipendente?</label>
                    <Select value={r.entita_nome} onValueChange={v => updateResult(idx, "entita_nome", v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                      <SelectContent>
                        {employees.map(e => <SelectItem key={e.id} value={`${e.nome} ${e.cognome}`}>{e.nome} {e.cognome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {r.entita_tipo === "cliente" && (
                  <div className="mt-2">
                    <label className="text-xs font-medium text-slate-600">Quale cliente?</label>
                    <Select value={r.entita_nome} onValueChange={v => updateResult(idx, "entita_nome", v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                      <SelectContent>
                        {contacts.filter(c => c.tipo === "cliente").map(c => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {r.entita_tipo === "lavoro" && (
                  <div className="mt-2">
                    <label className="text-xs font-medium text-slate-600">Quale lavoro?</label>
                    <Select value={r.entita_nome} onValueChange={v => updateResult(idx, "entita_nome", v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                      <SelectContent>
                        {worksites.map(w => <SelectItem key={w.id} value={w.nome}>{w.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => reset()}>Ricomincia</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-brand-600 hover:bg-brand-700 gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Conferma e salva ({results.filter(r => r.entita_nome || r.entita_tipo === "ditta").length})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}