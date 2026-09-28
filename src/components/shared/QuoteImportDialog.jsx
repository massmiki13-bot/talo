import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Sparkles, Plus, Trash2 } from "lucide-react";
import AiWarning from "@/components/shared/AiWarning";
import { formatEuro } from "@/utils/pdfUtils";

const unitOptions = [
  { value: "mq", label: "m²" },
  { value: "mc", label: "m³" },
  { value: "m", label: "m" },
  { value: "ml", label: "ml" },
  { value: "cad", label: "cad" },
  { value: "ore", label: "ore" },
  { value: "corpo", label: "a corpo" },
  { value: "kg", label: "kg" },
];

const emptyRow = { descrizione: "", unita_misura: "cad", quantita: 1, prezzo_unitario: 0, sconto: 0, iva_percentuale: 22 };

export default function QuoteImportDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [data, setData] = useState(null);
  const [righe, setRighe] = useState([]);

  const reset = () => {
    setFileUrl("");
    setData(null);
    setRighe([]);
    setReviewing(false);
  };

  const handleClose = (v) => {
    onOpenChange(v);
    if (!v) reset();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      setFileUrl(file_url);
    } catch (err) {
      toast({ title: "Errore upload", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleExtract = async () => {
    if (!fileUrl) return;
    setAiLoading(true);
    try {
      const result = await api.integrations.Core.InvokeLLM({
        prompt: `Sei un assistente che analizza preventivi commerciali italiani.
Leggi il documento allegato (PDF, Word, Excel o foto di un preventivo).
Estrai TUTTI i dati strutturati del preventivo:

1. cliente_nome: nome o ragione sociale del cliente (se presente sul documento)
2. oggetto: oggetto/titolo del preventivo
3. righe: TUTTE le voci del preventivo, ciascuna con:
   - descrizione: descrizione della voce
   - unita_misura: scegli la più appropriata tra: "mq", "mc", "m", "ml", "cad", "ore", "corpo", "kg"
   - quantita: numero (se non specificato, usa 1)
   - prezzo_unitario: prezzo unitario in euro (numero)
   - sconto: percentuale sconto (0 se non presente)
   - iva_percentuale: percentuale IVA (22 se non specificata)
4. note: eventuali note o condizioni del preventivo
5. validita_giorni: giorni di validità (30 se non specificato)

Sii MOLTO preciso nella lettura di numeri, quantità e prezzi. Se un dato non è leggibile, usa valori predefiniti sensati. Non inventare dati che non ci sono.`,
        file_urls: [fileUrl],
        response_json_schema: {
          type: "object",
          properties: {
            cliente_nome: { type: "string" },
            oggetto: { type: "string" },
            righe: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  descrizione: { type: "string" },
                  unita_misura: { type: "string" },
                  quantita: { type: "number" },
                  prezzo_unitario: { type: "number" },
                  sconto: { type: "number" },
                  iva_percentuale: { type: "number" },
                },
              },
            },
            note: { type: "string" },
            validita_giorni: { type: "number" },
          },
        },
      });

      setData({
        cliente_nome: result.cliente_nome || "",
        oggetto: result.oggetto || "",
        note: result.note || "",
        validita_giorni: result.validita_giorni || 30,
      });
      setRighe(result.righe?.length ? result.righe.map(r => ({
        ...emptyRow,
        ...r,
        unita_misura: unitOptions.find(u => u.value === r.unita_misura) ? r.unita_misura : "cad",
      })) : [{ ...emptyRow }]);
      setReviewing(true);
      toast({ title: "Dati estratti — verifica prima di continuare" });
    } catch (err) {
      toast({ title: "Errore lettura IA", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const calcRowTotal = (row) => {
    const subtotal = (row.quantita || 0) * (row.prezzo_unitario || 0);
    return subtotal * (1 - (row.sconto || 0) / 100);
  };

  const updateRow = (idx, field, value) => {
    setRighe(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const addRow = () => setRighe(prev => [...prev, { ...emptyRow }]);
  const removeRow = (idx) => setRighe(prev => prev.filter((_, i) => i !== idx));

  const handleConfirm = () => {
    const importData = { ...data, righe };
    sessionStorage.setItem("quoteImport", JSON.stringify(importData));
    onOpenChange(false);
    reset();
    navigate("/preventivi/nuovo?import=1");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa preventivo esistente</DialogTitle>
        </DialogHeader>

        {!reviewing ? (
          <div className="space-y-4 mt-4">
            <p className="text-sm text-slate-600">
              Carica un preventivo che hai già (PDF, Word, Excel o foto). L'IA lo leggerà e ne estrarrà le voci per crearne uno nuovo nel tuo formato, pronto da modificare e inviare.
            </p>

            <div>
              <Label>Carica documento</Label>
              <label className="block cursor-pointer mt-1">
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-brand-400 transition-colors">
                  {uploading ? (
                    <p className="text-sm text-slate-500">Caricamento...</p>
                  ) : fileUrl ? (
                    <p className="text-sm text-emerald-600">✓ Documento caricato — pronto per la lettura</p>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">Clicca per caricare o scatta una foto</p>
                      <p className="text-xs text-slate-400 mt-1">PDF, Word, Excel, immagini</p>
                    </>
                  )}
                </div>
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>

            {fileUrl && !aiLoading && (
              <Button onClick={handleExtract} className="w-full gap-2 bg-brand-600 hover:bg-brand-700">
                <Sparkles className="w-4 h-4" /> Leggi documento con IA
              </Button>
            )}

            {aiLoading && (
              <div className="flex items-center justify-center py-8">
                <Sparkles className="w-6 h-6 text-brand-500 animate-spin mr-2" />
                <p className="text-sm text-slate-600">Lettura in corso... può richiedere qualche secondo</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AiWarning />
              <p className="text-xs text-amber-700 mt-1">Controlla ogni voce, quantità e prezzo prima di creare il preventivo. L'IA può aver sbagliato a leggere qualche dato.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cliente</Label>
                <Input value={data.cliente_nome} onChange={e => setData({ ...data, cliente_nome: e.target.value })} />
              </div>
              <div>
                <Label>Oggetto</Label>
                <Input value={data.oggetto} onChange={e => setData({ ...data, oggetto: e.target.value })} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Voci estratte ({righe.length})</Label>
                <Button size="sm" variant="outline" onClick={addRow} className="gap-1"><Plus className="w-3 h-3" />Riga</Button>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {righe.map((row, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-2 space-y-2">
                    <div className="flex gap-1">
                      <Input value={row.descrizione} onChange={e => updateRow(idx, "descrizione", e.target.value)} placeholder="Descrizione" className="text-sm" />
                      <button onClick={() => removeRow(idx)} className="p-1 text-slate-400 hover:text-red-600 flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      <Select value={row.unita_misura} onValueChange={v => updateRow(idx, "unita_misura", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {unitOptions.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="number" value={row.quantita} onChange={e => updateRow(idx, "quantita", parseFloat(e.target.value) || 0)} className="h-8 text-xs" placeholder="Qtà" />
                      <Input type="number" step="0.01" value={row.prezzo_unitario} onChange={e => updateRow(idx, "prezzo_unitario", parseFloat(e.target.value) || 0)} className="h-8 text-xs" placeholder="Prezzo" />
                      <Input type="number" value={row.sconto} onChange={e => updateRow(idx, "sconto", parseFloat(e.target.value) || 0)} className="h-8 text-xs" placeholder="Sconto%" />
                      <div className="flex items-center justify-end text-xs font-medium text-slate-700 px-1">
                        {formatEuro(calcRowTotal(row))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Note</Label>
              <textarea value={data.note} onChange={e => setData({ ...data, note: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2 text-sm min-h-[60px]" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReviewing(false)}>Indietro</Button>
              <Button onClick={handleConfirm} className="bg-brand-600 hover:bg-brand-700">Crea preventivo</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}