import React, { useState, useEffect } from "react";
import { confirmDialog } from "@/components/shared/ConfirmHost";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Pencil, Trash2, ArrowLeft, Loader2, Download } from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import { DEFAULT_TEMPLATES, TEMPLATE_TYPES, TEMPLATE_VARIABLES } from "@/lib/email";

const EMPTY = { nome: "", tipo: "generico", oggetto: "", corpo: "" };

// Gestione dei modelli email dell'azienda.
export default function TemplatesDialog({ open, onOpenChange }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = elenco, {} = modifica
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await db.EmailTemplate.list("nome")); } finally { setLoading(false); }
  };

  useEffect(() => { if (open) { setEditing(null); load(); } }, [open]);

  const importDefaults = async () => {
    setSaving(true);
    try {
      await db.EmailTemplate.bulkCreate(DEFAULT_TEMPLATES.map(({ id, ...t }) => t));
      await load();
      toast({ title: "Modelli pronti aggiunti" });
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const save = async () => {
    if (!editing.nome.trim() || !editing.oggetto.trim()) {
      toast({ title: "Nome e oggetto sono obbligatori", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { id, nome, tipo, oggetto, corpo } = editing;
      if (id) await db.EmailTemplate.update(id, { nome, tipo, oggetto, corpo });
      else await db.EmailTemplate.create({ nome, tipo, oggetto, corpo });
      setEditing(null);
      await load();
      toast({ title: "Modello salvato" });
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (t) => {
    if (!(await confirmDialog(`Eliminare il modello "${t.nome}"?`))) return;
    await db.EmailTemplate.delete(t.id);
    load();
  };

  const insertVar = (key) => setEditing((e) => ({ ...e, corpo: `${e.corpo || ""}<p>{{${key}}}</p>` }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing && <button onClick={() => setEditing(null)} aria-label="Torna all'elenco" className="p-1 rounded hover:bg-zinc-100"><ArrowLeft className="w-4 h-4" /></button>}
            {editing ? (editing.id ? "Modifica modello" : "Nuovo modello") : "Modelli email"}
          </DialogTitle>
          <DialogDescription>
            {editing ? "I campi tra doppie graffe vengono compilati in automatico quando usi il modello." : "Testi pronti da richiamare con un click quando scrivi un messaggio."}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tpl-nome">Nome</Label>
                <Input id="tpl-nome" className="mt-1" value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} placeholder="Es. Invio preventivo" />
              </div>
              <div>
                <Label htmlFor="templatesdialog-tipo">Tipo</Label>
                <Select value={editing.tipo || "generico"} onValueChange={(v) => setEditing({ ...editing, tipo: v })}>
                  <SelectTrigger id="templatesdialog-tipo" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{TEMPLATE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="tpl-oggetto">Oggetto</Label>
              <Input id="tpl-oggetto" className="mt-1" value={editing.oggetto} onChange={(e) => setEditing({ ...editing, oggetto: e.target.value })} />
            </div>
            <div>
              <Label>Testo</Label>
              <div className="flex flex-wrap gap-1.5 my-1.5">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button key={v.key} type="button" onClick={() => insertVar(v.key)} className="text-xs rounded-full border border-zinc-200 px-2 py-0.5 text-zinc-600 hover:bg-zinc-50">
                    + {v.label}
                  </button>
                ))}
              </div>
              <RichTextEditor value={editing.corpo} onChange={(corpo) => setEditing((e) => ({ ...e, corpo }))} minHeight={180} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditing(null)}>Annulla</Button>
              <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Salva modello</Button>
            </div>
          </div>
        ) : loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="gap-1.5" onClick={() => setEditing({ ...EMPTY })}><Plus className="w-4 h-4" /> Nuovo modello</Button>
              {items.length === 0 && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={importDefaults} disabled={saving}><Download className="w-4 h-4" /> Aggiungi i modelli pronti</Button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center">Nessun modello salvato. Finché non ne crei, quando scrivi trovi i 5 modelli pronti di Talo.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {items.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-800 truncate">{t.nome}</p>
                      <p className="text-xs text-zinc-500 truncate">{TEMPLATE_TYPES.find((x) => x.value === t.tipo)?.label || "Generico"} · {t.oggetto}</p>
                    </div>
                    <Button size="icon" variant="ghost" aria-label="Modifica" onClick={() => setEditing({ ...EMPTY, ...t })}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Elimina" onClick={() => remove(t)}><Trash2 className="w-4 h-4 text-red-700" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
