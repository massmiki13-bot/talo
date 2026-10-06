import React, { useState, useEffect } from "react";
import { api } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileSearch, Check } from "lucide-react";
import AiWarning from "./AiWarning";

export default function AiDocumentReader({ open, onOpenChange, fileUrl, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState(null);

  useEffect(() => {
    if (open && fileUrl) {
      setExtracted(null);
      readDocument();
    }
  }, [open, fileUrl]);

  const readDocument = async () => {
    setLoading(true);
    try {
      const result = await api.integrations.Core.InvokeLLM({
        prompt: `Leggi questo documento e estrai le informazioni principali. Identifica:
- Il tipo di documento (contratto, visita medica, certificato, assicurazione, DURC, corso, documento identità, etc.)
- La data di scadenza se presente (formato YYYY-MM-DD, se non presente lascia vuoto)
- Un titolo appropriato e descrittivo
- Una breve descrizione del contenuto

Se non riesci a leggere una data di scadenza, lascia il campo data_scadenza vuoto.`,
        file_urls: [fileUrl],
        response_json_schema: {
          type: "object",
          properties: {
            tipo: { type: "string" },
            data_scadenza: { type: "string" },
            data_emissione: { type: "string" },
            titolo: { type: "string" },
            descrizione: { type: "string" },
          },
        },
      });
      setExtracted(result);
    } catch (e) {
      setExtracted({ error: true });
    } finally { setLoading(false); }
  };

  const handleConfirm = () => {
    onConfirm(extracted);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="w-5 h-5 text-brand-600" /> Lettura Documento IA
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
            <p className="text-sm text-slate-500">Lettura del documento in corso...</p>
          </div>
        )}

        {!loading && extracted?.error && (
          <div className="py-6 text-center">
            <p className="text-sm text-red-600 mb-3">Impossibile leggere il documento.</p>
            <Button variant="outline" onClick={readDocument}>Riprova</Button>
          </div>
        )}

        {!loading && extracted && !extracted.error && (
          <div className="space-y-4 mt-4">
            <AiWarning />

            <div>
              <Label htmlFor="aidocumentreader-titolo">Titolo</Label>
              <Input id="aidocumentreader-titolo" value={extracted.titolo || ""} onChange={e => setExtracted({ ...extracted, titolo: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="aidocumentreader-descrizione">Descrizione</Label>
              <textarea id="aidocumentreader-descrizione" value={extracted.descrizione || ""} onChange={e => setExtracted({ ...extracted, descrizione: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2 text-sm min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="aidocumentreader-data-emissione">Data Emissione</Label>
                <Input id="aidocumentreader-data-emissione" type="date" value={extracted.data_emissione || ""} onChange={e => setExtracted({ ...extracted, data_emissione: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="aidocumentreader-data-scadenza-verifica">Data Scadenza (verifica!)</Label>
                <Input id="aidocumentreader-data-scadenza-verifica" type="date" value={extracted.data_scadenza || ""} onChange={e => setExtracted({ ...extracted, data_scadenza: e.target.value })} />
                <p className="text-xs text-amber-600 mt-1">Controlla che la data sia corretta</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={readDocument}>Rileggi</Button>
              <Button onClick={handleConfirm} className="bg-brand-600 hover:bg-brand-700 gap-2">
                <Check className="w-4 h-4" /> Conferma dati
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}