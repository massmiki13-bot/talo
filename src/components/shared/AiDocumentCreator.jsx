import React, { useState } from "react";
import { base44, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, FilePlus, RefreshCw, Check, Save } from "lucide-react";
import AiWarning from "./AiWarning";

export default function AiDocumentCreator({ open, onOpenChange }) {
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState("");
  const [docType, setDocType] = useState("");
  const [fields, setFields] = useState([]);
  const [fieldValues, setFieldValues] = useState({});
  const [generatedContent, setGeneratedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const reset = () => {
    setStep(1); setDescription(""); setDocType(""); setFields([]); setFieldValues({}); setGeneratedContent("");
  };

  const handleClose = (open) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const identifyDocument = async () => {
    setLoading(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `L'utente ha bisogno di un documento e ha descritto: "${description}".
Identifica il tipo di documento più appropriato tra: contratto di lavoro determinato, contratto di lavoro indeterminato, contratto di appalto, contratto di subappalto, lettera di assunzione, comunicazione variante, ricevuta, altro.
Elenca i campi necessari da compilare (nome, cognome, codice fiscale, data, importo, etc.).
Rispondi in JSON con: tipo_documento (stringa descrittiva), campi (array di oggetti con nome_campo, etichetta, esempio).`,
        response_json_schema: {
          type: "object",
          properties: {
            tipo_documento: { type: "string" },
            campi: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nome_campo: { type: "string" },
                  etichetta: { type: "string" },
                  esempio: { type: "string" },
                },
              },
            },
          },
        },
      });
      setDocType(result.tipo_documento);
      setFields(result.campi || []);
      setStep(2);
    } catch (e) {
      toast({ title: "Errore IA", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const generateDocument = async () => {
    setLoading(true);
    try {
      const profiles = await db.CompanyProfile.list();
      const profile = profiles[0];
      const profileInfo = profile ? `Dati ditta: ${profile.ragione_sociale}, P.IVA ${profile.partita_iva}, sede ${profile.indirizzo} ${profile.citta}` : "";

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Genera un documento formale in italiano di tipo: "${docType}".
Dati forniti dall'utente: ${JSON.stringify(fieldValues)}.
${profileInfo}

Il documento deve essere completo, formale e pronto per l'uso. Includi clausole standard appropriate per il tipo di documento.
Non includere intestazione o firma (verranno aggiunte automaticamente dal sistema).
Scrivi solo il contenuto del documento.`,
      });
      setGeneratedContent(result);
      setStep(3);
    } catch (e) {
      toast({ title: "Errore generazione", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await db.GeneratedContract.create({
        tipo: docType,
        titolo: `${docType} - ${fieldValues.nome || fieldValues.ragione_sociale || ""}`,
        dati_compilati: fieldValues,
        contenuto_finale: generatedContent,
        data_creazione: new Date().toISOString().slice(0, 10),
        controparte_nome: fieldValues.nome || fieldValues.ragione_sociale || "",
      });
      toast({ title: "Documento salvato" });
      handleClose(false);
    } catch (e) {
      toast({ title: "Errore salvataggio", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus className="w-5 h-5 text-blue-600" /> Crea Documento con IA
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Describe */}
        {step === 1 && (
          <div className="space-y-4 mt-4">
            <p className="text-sm text-slate-600">Descrivi cosa ti serve in linguaggio naturale.</p>
            <div>
              <Label>Cosa ti serve?</Label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-3 text-sm min-h-[80px]"
                placeholder={`Es. "mi serve un contratto d'appalto", "documento per assumere qualcuno"...`}
              />
            </div>
            <Button onClick={identifyDocument} disabled={loading || !description.trim()} className="bg-blue-600 hover:bg-blue-700 w-full gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Analisi..." : "Continua"}
            </Button>
          </div>
        )}

        {/* Step 2: Fill fields */}
        {step === 2 && (
          <div className="space-y-4 mt-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-600">Tipo identificato</p>
              <p className="text-sm font-semibold text-slate-900">{docType}</p>
            </div>
            <p className="text-sm text-slate-600">Compila i campi richiesti:</p>
            {fields.map(f => (
              <div key={f.nome_campo}>
                <Label>{f.etichetta}</Label>
                <Input
                  value={fieldValues[f.nome_campo] || ""}
                  onChange={e => setFieldValues(prev => ({ ...prev, [f.nome_campo]: e.target.value }))}
                  placeholder={f.esempio || ""}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Indietro</Button>
              <Button onClick={generateDocument} disabled={loading} className="bg-blue-600 hover:bg-blue-700 flex-1 gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Generazione..." : "Genera documento"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-4 mt-4">
            <AiWarning />
            <div>
              <Label>Documento generato (revisionabile)</Label>
              <textarea
                value={generatedContent}
                onChange={e => setGeneratedContent(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-3 text-sm min-h-[250px] font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={generateDocument} disabled={loading} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Rigenera
              </Button>
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Modifica dati</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 flex-1 gap-2">
                <Save className="w-4 h-4" />{saving ? "..." : "Salva"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}