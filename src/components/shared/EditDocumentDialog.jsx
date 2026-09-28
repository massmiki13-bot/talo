import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, Bell, Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { deleteRemindersForDoc, createDocumentReminder } from "@/utils/expirationReminders";

const docTypes = [
  { value: "contratto", label: "Contratto" },
  { value: "corso", label: "Corso" },
  { value: "visita_medica", label: "Visita Medica" },
  { value: "documento_identita", label: "Documento d'Identità" },
  { value: "altro", label: "Altro" },
];

export default function EditDocumentDialog({ open, onOpenChange, doc, employeeName, onUpdated }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [readingDate, setReadingDate] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (doc) {
      setForm({
        titolo: doc.titolo || "",
        tipo: doc.tipo || "altro",
        tipo_altro: doc.tipo_altro || "",
        descrizione: doc.descrizione || "",
        data_emissione: doc.data_emissione || "",
        data_scadenza: doc.data_scadenza || "",
        scadenza_mode: doc.data_scadenza ? "manuale" : "nessuna",
        anticipo: "0",
        ripetizione: "nessuna",
      });
    }
  }, [doc]);

  if (!doc || !form) return null;

  const tipoLabel = () => form.tipo === "altro" ? (form.tipo_altro || "Altro") : (docTypes.find(t => t.value === form.tipo)?.label || form.tipo);

  const handleSave = async (withReminder = false) => {
    setSaving(true);
    try {
      const updateData = {
        titolo: form.titolo,
        tipo: form.tipo,
        tipo_altro: form.tipo === "altro" ? form.tipo_altro : "",
        descrizione: form.descrizione,
        data_emissione: form.data_emissione || null,
        data_scadenza: form.data_scadenza || null,
      };

      await db.EmployeeDocument.update(doc.id, updateData);

      // Sync reminders: always remove old ones first to avoid duplicates
      await deleteRemindersForDoc(doc.id);

      // If there's a scadenza and user chose to create/update reminder
      if (withReminder && form.data_scadenza) {
        await createDocumentReminder(
          form.titolo,
          form.data_scadenza,
          doc.id,
          "EmployeeDocument",
          tipoLabel(),
          employeeName,
          Number(form.anticipo) || 0,
          form.ripetizione || "nessuna"
        );
      }

      toast({
        title: withReminder && form.data_scadenza ? "Documento e promemoria aggiornati" : "Documento aggiornato",
        description: withReminder && form.data_scadenza ? "Promemoria sincronizzato nel calendario." : undefined,
        duration: 4000,
      });
      onUpdated?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ title: "Errore aggiornamento", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasScadenza = !!form.data_scadenza;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Modifica Documento</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label htmlFor="editdocumentdialog-titolo">Titolo</Label>
            <Input id="editdocumentdialog-titolo" value={form.titolo} onChange={e => setForm({ ...form, titolo: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="editdocumentdialog-tipo">Tipo</Label>
            <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
              <SelectTrigger id="editdocumentdialog-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {docTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.tipo === "altro" && (
              <Input
                value={form.tipo_altro}
                onChange={e => setForm({ ...form, tipo_altro: e.target.value })}
                placeholder="Specifica il tipo di documento..."
                className="mt-1.5"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="editdocumentdialog-data-emissione">Data Emissione</Label>
              <Input id="editdocumentdialog-data-emissione" type="date" value={form.data_emissione} onChange={e => setForm({ ...form, data_emissione: e.target.value })} />
            </div>
          </div>

          {/* Scadenza */}
          <div className="border-t border-slate-100 pt-3">
            <Label className="text-xs font-medium text-slate-600">Data scadenza</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, scadenza_mode: "manuale" }))}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${form.scadenza_mode === "manuale" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >Manuale</button>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, scadenza_mode: "nessuna", data_scadenza: "" }))}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${form.scadenza_mode === "nessuna" ? "bg-slate-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >Nessuna scadenza</button>
            </div>

            {form.scadenza_mode === "manuale" && (
              <div className="mt-2">
                <Input
                  type="date"
                  value={form.data_scadenza || ""}
                  onChange={e => setForm(prev => ({ ...prev, data_scadenza: e.target.value }))}
                />
                <p className="text-xs text-slate-500 mt-1">Inserisci o modifica la data di scadenza.</p>
              </div>
            )}

            {form.scadenza_mode === "nessuna" && (
              <p className="text-xs text-slate-500 mt-2">
                Il documento non ha scadenza — {doc.data_scadenza ? "il promemoria esistente verrà rimosso." : "nessun promemoria verrà creato."}
              </p>
            )}
          </div>

          {/* Anticipo + ripetizione (solo se c'è scadenza) */}
          {hasScadenza && form.scadenza_mode !== "nessuna" && (
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-brand-600" />
                <span className="text-xs font-medium text-slate-600">Avvisa con anticipo</span>
              </div>
              <Select value={form.anticipo} onValueChange={v => setForm({ ...form, anticipo: v })}>
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
                  <Label htmlFor="editdocumentdialog-ripeti-avviso" className="text-xs">Ripeti avviso</Label>
                  <Select value={form.ripetizione} onValueChange={v => setForm({ ...form, ripetizione: v })}>
                    <SelectTrigger id="editdocumentdialog-ripeti-avviso" className="mt-1"><SelectValue /></SelectTrigger>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          {hasScadenza && form.scadenza_mode !== "nessuna" ? (
            <>
              <Button
                onClick={() => handleSave(false)}
                variant="outline"
                className="border-brand-200 text-brand-700 hover:bg-brand-50"
                disabled={saving || !form.titolo}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salva"}
              </Button>
              <Button
                onClick={() => handleSave(true)}
                className="bg-brand-600 hover:bg-brand-700 gap-1.5"
                disabled={saving || !form.titolo}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                Salva e sincronizza promemoria
              </Button>
            </>
          ) : (
            <Button
              onClick={() => handleSave(false)}
              className="bg-brand-600 hover:bg-brand-700"
              disabled={saving || !form.titolo}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salva"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}