import React, { useState } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Camera, Loader2, Trash2, Plus, Sparkles } from "lucide-react";
import Field from "@/components/shared/FormField";
import { readDdt, ddtTransaction } from "@/lib/ddt";

// Carica una bolla: l'IA la legge, propone il cantiere e le righe dei materiali; tu controlli e salvi.
export default function DdtDialog({ open, onOpenChange, worksites, defaultWorksiteId = "", onSaved }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [d, setD] = useState(null);
  const [wid, setWid] = useState(defaultWorksiteId);

  const reset = () => { setBusy(""); setFileUrl(""); setD(null); setWid(defaultWorksiteId); };
  const close = (v) => { onOpenChange(v); if (!v) reset(); };

  const upload = async (file) => {
    if (!file) return;
    setBusy("Carico la bolla…");
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file, private: true });
      setFileUrl(file_url);
      setBusy("L'IA legge la bolla…");
      const r = await readDdt(file_url, worksites);
      setD(r);
      if (!defaultWorksiteId && r.worksite_id) setWid(r.worksite_id);
      else if (defaultWorksiteId && r.worksite_id && r.worksite_id !== defaultWorksiteId) toast({ title: "La bolla sembra di un altro cantiere", description: `Destinazione: ${r.destinazione || worksites.find((w) => w.id === r.worksite_id)?.nome}. Controlla il cantiere prima di salvare.` });
    } catch (e) {
      toast({ title: "Lettura non riuscita", description: e.message, variant: "destructive" });
      setD({ fornitore: "", numero: "", data: new Date().toISOString().slice(0, 10), destinazione: "", righe: [], importo: 0 });
    } finally { setBusy(""); }
  };

  const save = async () => {
    const w = worksites.find((x) => x.id === wid);
    if (!w) return toast({ title: "Scegli il cantiere", variant: "destructive" });
    setBusy("Salvo…");
    try {
      const importo = Number(String(d.importo).replace(",", ".")) || 0;
      onSaved?.(await db.WorksiteTransaction.create(ddtTransaction({ ...d, importo }, w, fileUrl)));
      toast({ title: "Bolla registrata", description: `${d.righe.length} righe di materiale su ${w.nome}.` });
      close(false);
    } catch (e) { toast({ title: "Salvataggio non riuscito", description: e.message, variant: "destructive" }); setBusy(""); }
  };

  const upd = (i, p) => setD((x) => ({ ...x, righe: x.righe.map((r, j) => (j === i ? { ...r, ...p } : r)) }));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carica una bolla (DDT)</DialogTitle>
          <DialogDescription>Fotografa la bolla o carica il PDF: l'IA legge fornitore, materiali e cantiere.</DialogDescription>
        </DialogHeader>
        {!d ? (
          <label className="block cursor-pointer">
            <div className="rounded-2xl border-2 border-dashed border-zinc-300 hover:border-brand-400 hover:bg-brand-50/40 p-8 text-center">
              {busy ? <Loader2 className="w-9 h-9 text-brand-600 mx-auto mb-2 animate-spin" /> : <Camera className="w-9 h-9 text-zinc-400 mx-auto mb-2" aria-hidden="true" />}
              <p className="font-medium text-zinc-900">{busy || "Scatta una foto o scegli il file"}</p>
            </div>
            <input type="file" accept="image/*,.pdf" capture="environment" className="hidden" disabled={!!busy} onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} aria-label="Bolla" />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Cantiere">
                <Select value={wid || "none"} onValueChange={(v) => setWid(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">— Scegli —</SelectItem>{worksites.map((w) => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Fornitore"><Input value={d.fornitore} onChange={(e) => setD({ ...d, fornitore: e.target.value })} /></Field>
              <Field label="Numero DDT"><Input value={d.numero} onChange={(e) => setD({ ...d, numero: e.target.value })} /></Field>
              <Field label="Data"><Input type="date" value={d.data} onChange={(e) => setD({ ...d, data: e.target.value })} /></Field>
              <Field label="Importo (IVA esclusa, se indicato)"><Input inputMode="decimal" value={d.importo} onChange={(e) => setD({ ...d, importo: e.target.value })} /></Field>
              {d.destinazione && <p className="text-xs text-zinc-500 self-end pb-2 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-brand-600" aria-hidden="true" />Destinazione letta: {d.destinazione}</p>}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5"><p className="text-sm font-medium text-zinc-900">Materiali ({d.righe.length})</p><Button size="sm" variant="outline" className="gap-1" onClick={() => setD({ ...d, righe: [...d.righe, { descrizione: "", quantita: 1, unita: "pz", prezzo_unitario: 0, importo: 0 }] })}><Plus className="w-3.5 h-3.5" />Riga</Button></div>
              <div className="space-y-1.5 max-h-[35vh] overflow-y-auto">
                {d.righe.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_60px_80px_auto] gap-1.5 items-center">
                    <Input value={r.descrizione} onChange={(e) => upd(i, { descrizione: e.target.value })} className="h-8 text-sm" aria-label="Materiale" />
                    <Input inputMode="decimal" value={r.quantita} onChange={(e) => upd(i, { quantita: Number(e.target.value.replace(",", ".")) || 0 })} className="h-8 text-sm" aria-label="Quantità" />
                    <Input value={r.unita} onChange={(e) => upd(i, { unita: e.target.value })} className="h-8 text-sm" aria-label="Unità" />
                    <Input inputMode="decimal" value={r.importo || ""} onChange={(e) => upd(i, { importo: Number(e.target.value.replace(",", ".")) || 0 })} className="h-8 text-sm" placeholder="€" aria-label="Importo riga" />
                    <button type="button" onClick={() => setD({ ...d, righe: d.righe.filter((_, j) => j !== i) })} className="p-1 text-zinc-500 hover:text-red-600" aria-label="Rimuovi"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {d && (
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>Annulla</Button>
            <Button onClick={save} disabled={!!busy} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Registra la bolla</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
