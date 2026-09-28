import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Bell, Loader2, CalendarClock } from "lucide-react";
import { db } from "@/lib/db";
import { deleteRemindersForDoc, createDocumentReminder } from "@/utils/expirationReminders";

export default function EditContractScadenzaDialog({ open, onOpenChange, contract, typeLabel, onUpdated }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (contract) {
      setForm({
        data_scadenza: contract.data_scadenza || "",
        scadenza_mode: contract.data_scadenza ? "manuale" : "nessuna",
        anticipo: String(contract.giorni_preavviso_custom ?? 0),
        ripetizione: contract.ripeti_promemoria_custom ? "settimanale" : "nessuna",
      });
    }
  }, [contract]);

  if (!contract || !form) return null;

  const handleSave = async (withReminder = false) => {
    setSaving(true);
    try {
      const updateData = {
        data_scadenza: form.data_scadenza || null,
        giorni_preavviso_custom: Number(form.anticipo) || 0,
        ripeti_promemoria_custom: form.ripetizione !== "nessuna",
      };

      await db.GeneratedContract.update(contract.id, updateData);

      // Always remove old reminders first to avoid duplicates
      await deleteRemindersForDoc(contract.id);

      if (withReminder && form.data_scadenza) {
        await createDocumentReminder(
          contract.titolo,
          form.data_scadenza,
          contract.id,
          "GeneratedContract",
          typeLabel || contract.tipo || "Contratto",
          contract.controparte_nome || "",
          Number(form.anticipo) || 0,
          form.ripetizione || "nessuna"
        );
      }

      toast({
        title: withReminder && form.data_scadenza ? "Contratto e promemoria aggiornati" : "Contratto aggiornato",
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

  const hasScadenza = !!form.data_scadenza && form.scadenza_mode !== "nessuna";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-brand-600" />
            Scadenza Contratto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <p className="text-sm font-medium text-slate-900">{contract.titolo}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {typeLabel || contract.tipo}
              {contract.controparte_nome ? ` · ${contract.controparte_nome}` : ""}
            </p>
          </div>

          {/* Scadenza mode */}
          <div className="border-t border-slate-100 pt-3">
            <Label className="text-xs font-medium text-slate-600">Data scadenza</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, scadenza_mode: "manuale" }))}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${form.scadenza_mode === "manuale" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >Imposta scadenza</button>
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
                <p className="text-xs text-slate-500 mt-1">Inserisci o modifica la data di scadenza del contratto.</p>
              </div>
            )}

            {form.scadenza_mode === "nessuna" && (
              <p className="text-xs text-slate-500 mt-2">
                Il contratto non ha scadenza — {contract.data_scadenza ? "il promemoria esistente verrà rimosso." : "nessun promemoria verrà creato."}
              </p>
            )}
          </div>

          {/* Anticipo + ripetizione (solo se c'è scadenza) */}
          {hasScadenza && (
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
                  <Label htmlFor="editcontractscadenzadialog-ripeti-avviso" className="text-xs">Ripeti avviso</Label>
                  <Select value={form.ripetizione} onValueChange={v => setForm({ ...form, ripetizione: v })}>
                    <SelectTrigger id="editcontractscadenzadialog-ripeti-avviso" className="mt-1"><SelectValue /></SelectTrigger>
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
          {hasScadenza ? (
            <>
              <Button
                onClick={() => handleSave(false)}
                variant="outline"
                className="border-brand-200 text-brand-700 hover:bg-brand-50"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salva"}
              </Button>
              <Button
                onClick={() => handleSave(true)}
                className="bg-brand-600 hover:bg-brand-700 gap-1.5"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                Salva e aggiungi al promemoria
              </Button>
            </>
          ) : (
            <Button
              onClick={() => handleSave(false)}
              className="bg-brand-600 hover:bg-brand-700"
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salva"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}