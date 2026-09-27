import React, { useState, useEffect } from "react";
import { base44, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Upload, FileText, Loader2, FolderTree, AlertCircle, Save, X, FileUp, Sparkles, Bell } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import AiWarning from "@/components/shared/AiWarning";
import { ExternalLink } from "lucide-react";
import { createDocumentReminder } from "@/utils/expirationReminders";
import { readDocumentWithAi } from "@/utils/documentAi";

function getFileExt(url) {
  if (!url) return "";
  const match = url.match(/\.(\w+)(\?|$)/);
  return match ? match[1].toLowerCase() : "";
}
function isImageUrl(url) {
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(getFileExt(url));
}
function isPdfUrl(url) {
  return getFileExt(url) === "pdf";
}

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

export default function AIAssistant() {
  const [files, setFiles] = useState([]);
  const [uploadedUrls, setUploadedUrls] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [worksites, setWorksites] = useState([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { loadContext(); }, []);

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
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        urls.push({ name: file.name, url: file_url });
      }
      setUploadedUrls(urls);

      const context = {
        dipendenti: employees.map(e => `${e.nome} ${e.cognome}`),
        clienti: contacts.filter(c => c.tipo === "cliente").map(c => c.nome),
        lavori: worksites.map(w => ({ id: w.id, nome: w.nome })),
      };

      const allResults = [];
      for (const item of urls) {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Sei un assistente che aiuta a organizzare i documenti aziendali. Analizza questo documento caricato e determina:

1. Tipo di documento (uno tra: contratto, visita_medica, documento_identita, corso, certificazione, assicurazione, durc, bolla, altro)
2. Se il tipo è "altro", scrivi una breve etichetta personalizzata nel campo tipo_altro
3. Data di emissione/inizio se presente (formato YYYY-MM-DD, altrimenti vuoto)
4. Data di scadenza se presente nel documento (formato YYYY-MM-DD). Se il documento non ha una scadenza, lascia il campo vuoto.
5. A chi o a cosa è associato: un dipendente, un cliente, un lavoro/progetto, o la ditta stessa.

Contesto disponibile nell'app:
- Dipendenti: ${JSON.stringify(context.dipendenti)}
- Clienti: ${JSON.stringify(context.clienti)}
- Lavori: ${JSON.stringify(context.lavori)}

REGOLE:
- Se riesci a identificare chiaramente l'associazione dal contenuto del documento, indica entita_tipo e entita_nome.
- Se NON sei sicuro a chi associare il documento (es. una visita medica senza nome leggibile, o un nome che non corrisponde a nessun dipendente), imposta "needs_clarification": true e scrivi una domanda specifica e utile per l'utente nel campo "domanda".
- Non indovinare mai: se manca un'informazione, chiedi.
- Fornisci una breve descrizione del documento.`,
          file_urls: [item.url],
          response_json_schema: {
            type: "object",
            properties: {
              tipo_documento: { type: "string" },
              tipo_altro: { type: "string", description: "etichetta personalizzata quando tipo=altro" },
              data_emissione: { type: "string", description: "formato YYYY-MM-DD o vuoto" },
              data_scadenza: { type: "string", description: "formato YYYY-MM-DD o vuoto se non presente" },
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
          tipo_altro: result.tipo_altro || "",
          data_emissione: result.data_emissione || "",
          data_scadenza: result.data_scadenza || "",
          data_scadenza_ia: result.data_scadenza || "",
          scadenza_mode: result.data_scadenza ? "ia" : "nessuna",
          entita_tipo: result.entita_tipo || "ditta",
          entita_nome: result.entita_nome || "",
          needs_clarification: result.needs_clarification || false,
          domanda: result.domanda || "",
          descrizione: result.descrizione_breve || "",
          anticipo: "30",
          ripetizione: "nessuna",
        });
      }
      setResults(allResults);
    } catch (e) {
      toast({ title: "Errore analisi", description: "Impossibile analizzare i documenti", variant: "destructive" });
    } finally { setAnalyzing(false); }
  };

  const updateResult = (idx, field, value) => {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const [readingDateIdx, setReadingDateIdx] = useState(null);

  const handleReadWithAi = async (idx) => {
    const r = results[idx];
    updateResult(idx, "scadenza_mode", "ia");
    setReadingDateIdx(idx);
    try {
      const context = {
        dipendenti: employees.map(e => `${e.nome} ${e.cognome}`),
        clienti: contacts.filter(c => c.tipo === "cliente").map(c => c.nome),
        lavori: worksites.map(w => ({ id: w.id, nome: w.nome })),
      };
      const extracted = await readDocumentWithAi(r.fileUrl, context);
      updateResult(idx, "tipo", extracted.tipo || r.tipo);
      updateResult(idx, "tipo_altro", extracted.tipo_altro || "");
      updateResult(idx, "data_emissione", extracted.data_emissione || "");
      updateResult(idx, "data_scadenza", extracted.data_scadenza || "");
      updateResult(idx, "data_scadenza_ia", extracted.data_scadenza || "");
      updateResult(idx, "descrizione", extracted.descrizione || r.descrizione);
      if (extracted.entita_tipo) updateResult(idx, "entita_tipo", extracted.entita_tipo);
      if (extracted.entita_nome) updateResult(idx, "entita_nome", extracted.entita_nome);
      if (extracted.needs_clarification !== undefined) updateResult(idx, "needs_clarification", extracted.needs_clarification);
      if (extracted.domanda) updateResult(idx, "domanda", extracted.domanda);
      if (!extracted.data_scadenza) {
        toast({ title: "Nessuna scadenza trovata", description: "L'IA non ha rilevato una data di scadenza. Inseriscila manualmente se necessario." });
      }
    } catch (e) {
      toast({ title: "Errore lettura IA", variant: "destructive" });
    } finally {
      setReadingDateIdx(null);
    }
  };

  const removeResult = (idx) => {
    setResults(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async (withReminder = false) => {
    setSaving(true);
    const toSave = results.filter(r => r.entita_nome || r.entita_tipo === "ditta");
    try {
      let savedCount = 0;
      let remindersCreated = 0;
      for (const r of toSave) {
        const scadenzaFields = {};
        if (r.data_scadenza) {
          scadenzaFields.data_scadenza = r.data_scadenza;
        }

        let createdDoc = null;
        let refType = null;
        let tipoLabel = "";
        let personName = "";

        if (r.entita_tipo === "dipendente") {
          const emp = employees.find(e => `${e.nome} ${e.cognome}` === r.entita_nome);
          if (emp) {
            createdDoc = await db.EmployeeDocument.create({
              dipendente_id: emp.id,
              tipo: mapEmpDocType(r.tipo),
              titolo: r.descrizione || r.fileName,
              file_url: r.fileUrl,
              data_emissione: r.data_emissione || new Date().toISOString().slice(0, 10),
              ...scadenzaFields,
            });
            refType = "EmployeeDocument";
            tipoLabel = r.tipo === "altro" ? (r.tipo_altro || "Altro") : (DOC_TYPES.find(t => t.value === r.tipo)?.label || r.tipo);
            personName = r.entita_nome;
            savedCount++;
          }
        } else if (r.entita_tipo === "ditta") {
          createdDoc = await db.CompanyDocument.create({
            tipo: mapCompDocType(r.tipo),
            titolo: r.descrizione || r.fileName,
            file_url: r.fileUrl,
            data_emissione: r.data_emissione || new Date().toISOString().slice(0, 10),
            ...scadenzaFields,
          });
          refType = "CompanyDocument";
          tipoLabel = r.tipo === "altro" ? (r.tipo_altro || "Altro") : (DOC_TYPES.find(t => t.value === r.tipo)?.label || r.tipo);
          savedCount++;
        } else if (r.entita_tipo === "lavoro") {
          const site = worksites.find(w => w.nome === r.entita_nome);
          if (site) {
            createdDoc = await db.WorksiteTransaction.create({
              worksite_id: site.id,
              worksite_nome: site.nome,
              tipo: "uscita",
              categoria: "Altro",
              descrizione: r.descrizione || r.fileName,
              importo: 0,
              data: new Date().toISOString().slice(0, 10),
              file_url: r.fileUrl,
            });
            savedCount++;
          }
        }

        if (withReminder && r.data_scadenza && createdDoc && refType) {
          await createDocumentReminder(r.descrizione || r.fileName, r.data_scadenza, createdDoc.id, refType, tipoLabel, personName, Number(r.anticipo) || 0, r.ripetizione || "nessuna");
          remindersCreated++;
        }
      }
      toast({
        title: withReminder && remindersCreated > 0 ? "Documenti e promemoria salvati" : "Documenti salvati",
        description: withReminder && remindersCreated > 0
          ? `${savedCount} documento/i archiviato/i · ${remindersCreated} promemoria creati (visibili in Attivi e Calendario).`
          : `${savedCount} documento/i archiviato/i.`,
        duration: 7000,
      });
      reset();
    } catch (e) {
      toast({ title: "Errore salvataggio", description: "Impossibile salvare i documenti", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const mapEmpDocType = (tipo) => {
    const map = { contratto: "contratto", visita_medica: "visita_medica", documento_identita: "documento_identita", corso: "corso" };
    return map[tipo] || "altro";
  };
  const mapCompDocType = (tipo) => {
    const map = { certificazione: "certificazione", assicurazione: "assicurazione", durc: "durc", visura: "visura" };
    return map[tipo] || "altro";
  };

  const readyToSave = results.filter(r => r.entita_nome || r.entita_tipo === "ditta").length;
  const pendingClarification = results.filter(r => r.needs_clarification && !r.entita_nome).length;
  const hasScadenzaDocs = results.some(r => (r.entita_nome || r.entita_tipo === "ditta") && r.data_scadenza && r.scadenza_mode !== "nessuna");

  return (
    <div>
      <PageHeader title="Organizza Documenti" subtitle="L'IA legge i tuoi documenti e li archivia al posto giusto — tu confermi" />

      {/* How it works */}
      {results.length === 0 && !analyzing && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Come funziona</h3>
              <p className="text-sm text-slate-600 mt-1">Carica i tuoi documenti (PDF, immagini, Word). L'IA li legge, capisce di che tipo sono e propone dove archiviarli. Tu rivedi e confermi prima del salvataggio.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
              Carica i documenti
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
              L'IA propone la sistemazione
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
              Tu confermi e salva
            </div>
          </div>
        </div>
      )}

      {/* Upload area */}
      {results.length === 0 && !analyzing && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <label className="cursor-pointer block">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
              <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">Carica uno o più documenti</p>
              <p className="text-xs text-slate-500 mt-1">PDF, immagini o Word — l'IA li analizzerà uno per uno</p>
            </div>
            <input type="file" multiple className="hidden" onChange={handleFileSelect} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
          </label>
        </div>
      )}

      {/* Analyzing */}
      {analyzing && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-700">Analisi documenti in corso…</p>
          <p className="text-xs text-slate-500 mt-1">Sto leggendo ogni documento e decidendo dove collocarlo</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <AiWarning className="mb-2" />

          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-blue-600" />
              Sistemazione proposta ({results.length})
            </h3>
            {pendingClarification > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {pendingClarification} da completare
              </span>
            )}
          </div>

          {results.map((r, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start gap-3 mb-3">
                <FileText className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{r.fileName}</p>
                  {r.descrizione && <p className="text-xs text-slate-500 mt-0.5">{r.descrizione}</p>}
                </div>
                <button onClick={() => removeResult(idx)} className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Anteprima documento */}
              <div className="mb-3 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Anteprima documento</span>
                  <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <ExternalLink className="w-3 h-3" /> Apri
                  </a>
                </div>
                {isImageUrl(r.fileUrl) ? (
                  <img src={r.fileUrl} alt={r.fileName} className="max-w-full max-h-[400px] object-contain mx-auto" />
                ) : isPdfUrl(r.fileUrl) ? (
                  <iframe src={r.fileUrl} className="w-full" style={{ height: "400px", border: "none" }} title={r.fileName} />
                ) : (
                  <div className="p-8 text-center">
                    <FileText className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Anteprima non disponibile per questo formato</p>
                  </div>
                )}
              </div>

              {r.needs_clarification && !r.entita_nome && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium">L'IA ha bisogno di un'informazione:</p>
                    <p className="text-sm text-amber-700">{r.domanda}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Tipo documento</label>
                  <Select value={r.tipo} onValueChange={v => updateResult(idx, "tipo", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {r.tipo === "altro" && (
                    <Input
                      value={r.tipo_altro || ""}
                      onChange={e => updateResult(idx, "tipo_altro", e.target.value)}
                      placeholder="Specifica il tipo di documento..."
                      className="mt-1.5"
                    />
                  )}
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

              {/* Scadenza + Promemoria */}
              <div className="mt-3 pt-3 border-t border-slate-100">
                <label className="text-xs font-medium text-slate-600">Data scadenza</label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => updateResult(idx, "scadenza_mode", "manuale")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${r.scadenza_mode === "manuale" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >Manuale</button>
                  <button
                    type="button"
                    onClick={() => handleReadWithAi(idx)}
                    disabled={readingDateIdx === idx}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${r.scadenza_mode === "ia" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"} disabled:opacity-60`}
                  >
                    {readingDateIdx === idx && <Loader2 className="w-3 h-3 animate-spin" />}
                    Lettura IA
                  </button>
                  <button
                    type="button"
                    onClick={() => { updateResult(idx, "scadenza_mode", "nessuna"); updateResult(idx, "data_scadenza", ""); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${r.scadenza_mode === "nessuna" ? "bg-slate-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >Nessuna scadenza</button>
                </div>

                {r.scadenza_mode === "ia" && r.data_scadenza_ia && (
                  <div className="mt-2">
                    <Input
                      type="date"
                      value={r.data_scadenza || ""}
                      onChange={e => updateResult(idx, "data_scadenza", e.target.value)}
                      className="mt-1"
                    />
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Data rilevata dall'IA — verifica e correggi se necessario.
                    </p>
                  </div>
                )}
                {r.scadenza_mode === "manuale" && (
                  <div className="mt-2">
                    <Input
                      type="date"
                      value={r.data_scadenza || ""}
                      onChange={e => updateResult(idx, "data_scadenza", e.target.value)}
                      className="mt-1"
                    />
                    <p className="text-xs text-slate-400 mt-1">Inserisci la data di scadenza manualmente.</p>
                  </div>
                )}
                {r.scadenza_mode === "nessuna" && (
                  <p className="text-xs text-slate-400 mt-2">Il documento non ha scadenza — nessun promemoria verrà creato.</p>
                )}

                {(r.scadenza_mode === "ia" || r.scadenza_mode === "manuale") && r.data_scadenza && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Avvisa con anticipo</label>
                      <Select value={r.anticipo || "0"} onValueChange={v => updateResult(idx, "anticipo", v)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Nessun preavviso (solo alla scadenza)</SelectItem>
                          <SelectItem value="7">1 settimana prima</SelectItem>
                          <SelectItem value="14">2 settimane prima</SelectItem>
                          <SelectItem value="30">1 mese prima</SelectItem>
                          <SelectItem value="60">2 mesi prima</SelectItem>
                          <SelectItem value="90">3 mesi prima</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {Number(r.anticipo) > 0 && (
                      <div>
                        <label className="text-xs font-medium text-slate-600">Ripeti avviso</label>
                        <Select value={r.ripetizione || "nessuna"} onValueChange={v => updateResult(idx, "ripetizione", v)}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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

              {r.data_scadenza && r.scadenza_mode !== "nessuna" && (
                <div className="mt-3 bg-blue-50/50 border border-blue-100 rounded-lg p-3 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <p className="text-xs text-slate-600">
                    Al salvataggio, usa <span className="font-medium text-blue-600">"Salva e aggiungi al promemoria"</span> per creare automaticamente il promemoria con scadenza {new Date(r.data_scadenza).toLocaleDateString("it-IT")}.
                  </p>
                </div>
              )}
            </div>
          ))}

          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 pt-2">
            <Button variant="outline" onClick={() => reset()} className="gap-2">
              <X className="w-4 h-4" /> Ricomincia
            </Button>
            {hasScadenzaDocs ? (
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <Button onClick={() => handleSave(false)} variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50 gap-2" disabled={saving || readyToSave === 0}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salva ({readyToSave})
                </Button>
                <Button onClick={() => handleSave(true)} className="bg-blue-600 hover:bg-blue-700 gap-2" disabled={saving || readyToSave === 0}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                  Salva e aggiungi al promemoria ({readyToSave})
                </Button>
              </div>
            ) : (
              <Button onClick={() => handleSave(false)} disabled={saving || readyToSave === 0} className="bg-blue-600 hover:bg-blue-700 gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Conferma e salva ({readyToSave})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Add more documents when results exist */}
      {results.length > 0 && (
        <div className="mt-6">
          <label className="cursor-pointer block">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
              <FileUp className="w-6 h-6 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600">Aggiungi altri documenti</p>
            </div>
            <input type="file" multiple className="hidden" onChange={handleFileSelect} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
          </label>
        </div>
      )}
    </div>
  );
}