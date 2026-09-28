import React, { useState, useEffect, useMemo } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Camera, X } from "lucide-react";
import { isValidCodiceFiscale, isValidIban, isValidEmail, formatIban } from "@/lib/validators";
import { TIPI_CONTRATTO, CCNL, PATENTI, fullName, initials } from "@/lib/employees";
import Field from "@/components/shared/FormField";

export const EMPTY_EMPLOYEE = {
  nome: "", cognome: "", codice_fiscale: "", data_nascita: "", luogo_nascita: "", nazionalita: "Italiana", indirizzo: "",
  telefono: "", cellulare: "", email: "", foto_url: "", matricola: "", ruolo: "", qualifica: "", livello: "", ccnl: "",
  tipo_contratto: "", data_assunzione: "", data_fine_contratto: "", ore_settimanali: 40, costo_orario: "", iban: "",
  permesso_soggiorno_scadenza: "", patenti: [], taglie: {}, contatto_emergenza: {}, note: "", stato: "attivo",
};


export default function EmployeeForm({ open, onOpenChange, employee = null, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_EMPLOYEE);
  const [tab, setTab] = useState("anagrafica");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = { ...EMPTY_EMPLOYEE, ...(employee || {}) };
    base.taglie = { ...(employee?.taglie || {}) };
    base.contatto_emergenza = { ...(employee?.contatto_emergenza || {}) };
    base.patenti = [...(employee?.patenti || [])];
    base.costo_orario = base.costo_orario ?? "";
    setForm(base);
    setTab("anagrafica");
  }, [open, employee]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const errors = useMemo(() => {
    const e = {};
    if (form.codice_fiscale && !isValidCodiceFiscale(form.codice_fiscale)) e.codice_fiscale = "Codice fiscale non valido";
    if (form.iban && !isValidIban(form.iban)) e.iban = "IBAN non valido";
    if (form.email && !isValidEmail(form.email)) e.email = "Email non valida";
    if (form.data_fine_contratto && form.data_assunzione && form.data_fine_contratto < form.data_assunzione) e.data_fine_contratto = "Precede la data di assunzione";
    return e;
  }, [form]);

  const uploadPhoto = async (file) => {
    if (!file?.type.startsWith("image/")) return toast({ title: "Scegli un'immagine", variant: "destructive" });
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      set({ foto_url: file_url });
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.nome.trim() || !form.cognome.trim()) {
      setTab("anagrafica");
      return toast({ title: "Nome e cognome sono obbligatori", variant: "destructive" });
    }
    if (Object.keys(errors).length) {
      setTab(errors.iban || errors.data_fine_contratto ? "contratto" : "anagrafica");
      return toast({ title: "Controlla i campi evidenziati", description: Object.values(errors).join(" · "), variant: "destructive" });
    }
    setSaving(true);
    try {
      const num = (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(",", ".")));
      const data = {
        ...form,
        codice_fiscale: form.codice_fiscale.replace(/\s+/g, "").toUpperCase(),
        email: form.email.trim().toLowerCase(),
        iban: form.iban ? formatIban(form.iban) : "",
        costo_orario: num(form.costo_orario),
        ore_settimanali: num(form.ore_settimanali),
      };
      for (const k of ["id", "created_date", "updated_date", "created_by", "created_by_id"]) delete data[k];
      for (const k of ["data_nascita", "data_assunzione", "data_fine_contratto", "permesso_soggiorno_scadenza", "data_cessazione"]) if (!data[k]) data[k] = null;
      const saved = employee?.id ? await db.Employee.update(employee.id, data) : await db.Employee.create(data);
      toast({ title: employee?.id ? "Dipendente aggiornato" : "Dipendente creato" });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      toast({ title: e.message || "Salvataggio non riuscito", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const togglePatente = (p) => set({ patenti: form.patenti.includes(p) ? form.patenti.filter((x) => x !== p) : [...form.patenti, p] });
  const straniero = form.nazionalita && !/^ital/i.test(form.nazionalita);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee?.id ? `Modifica ${fullName(employee)}` : "Nuovo dipendente"}</DialogTitle>
          <DialogDescription>Solo nome e cognome sono obbligatori: il resto si può completare dopo.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
            <TabsTrigger value="contratto">Contratto</TabsTrigger>
            <TabsTrigger value="sicurezza">DPI e patenti</TabsTrigger>
            <TabsTrigger value="emergenza">Emergenza</TabsTrigger>
          </TabsList>

          <TabsContent value="anagrafica" className="space-y-4 pt-3">
            <div className="flex items-center gap-4">
              <div className="relative">
                {form.foto_url
                  ? <img src={form.foto_url} alt="Foto del dipendente" className="w-20 h-20 rounded-full object-cover border border-slate-200" />
                  : <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-xl font-semibold text-slate-600">{initials(form)}</div>}
                {form.foto_url && <button type="button" aria-label="Rimuovi foto" onClick={() => set({ foto_url: "" })} className="absolute -top-1 -right-1 rounded-full bg-white border border-slate-200 p-0.5"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <label className="inline-flex items-center gap-1.5 text-sm text-brand-700 cursor-pointer hover:underline">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} {form.foto_url ? "Cambia foto" : "Aggiungi foto"}
                <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { uploadPhoto(e.target.files[0]); e.target.value = ""; }} />
              </label>
              <p className="text-xs text-slate-500 flex-1">Serve per il tesserino di riconoscimento di cantiere.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nome"><Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} autoComplete="given-name" /></Field>
              <Field label="Cognome"><Input value={form.cognome} onChange={(e) => set({ cognome: e.target.value })} autoComplete="family-name" /></Field>
              <Field label="Codice fiscale" error={errors.codice_fiscale}><Input value={form.codice_fiscale} onChange={(e) => set({ codice_fiscale: e.target.value })} autoCapitalize="characters" spellCheck={false} /></Field>
              <Field label="Matricola (facoltativa)"><Input value={form.matricola} onChange={(e) => set({ matricola: e.target.value })} /></Field>
              <Field label="Data di nascita"><Input type="date" value={form.data_nascita || ""} onChange={(e) => set({ data_nascita: e.target.value })} /></Field>
              <Field label="Luogo di nascita"><Input value={form.luogo_nascita} onChange={(e) => set({ luogo_nascita: e.target.value })} /></Field>
              <Field label="Nazionalità"><Input value={form.nazionalita} onChange={(e) => set({ nazionalita: e.target.value })} /></Field>
              {straniero && (
                <Field label="Scadenza permesso di soggiorno" hint="Ricevi un avviso 60 giorni prima">
                  <Input type="date" value={form.permesso_soggiorno_scadenza || ""} onChange={(e) => set({ permesso_soggiorno_scadenza: e.target.value })} />
                </Field>
              )}
              <Field label="Indirizzo di residenza" className="sm:col-span-2"><Input value={form.indirizzo} onChange={(e) => set({ indirizzo: e.target.value })} autoComplete="street-address" /></Field>
              <Field label="Cellulare"><Input value={form.cellulare} onChange={(e) => set({ cellulare: e.target.value })} inputMode="tel" /></Field>
              <Field label="Telefono"><Input value={form.telefono} onChange={(e) => set({ telefono: e.target.value })} inputMode="tel" /></Field>
              <Field label="Email" error={errors.email} className="sm:col-span-2"><Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            </div>
          </TabsContent>

          <TabsContent value="contratto" className="space-y-4 pt-3">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Mansione"><Input value={form.ruolo} onChange={(e) => set({ ruolo: e.target.value })} placeholder="Es. muratore, elettricista, capocantiere" /></Field>
              <Field label="Qualifica"><Input value={form.qualifica} onChange={(e) => set({ qualifica: e.target.value })} placeholder="Es. operaio specializzato" /></Field>
              <Field label="CCNL">
                <Select value={form.ccnl || "none"} onValueChange={(v) => set({ ccnl: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{CCNL.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Livello"><Input value={form.livello} onChange={(e) => set({ livello: e.target.value })} placeholder="Es. 3° livello" /></Field>
              <Field label="Tipo di contratto">
                <Select value={form.tipo_contratto || "none"} onValueChange={(v) => set({ tipo_contratto: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{[...new Set([...TIPI_CONTRATTO, form.tipo_contratto].filter(Boolean))].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Ore settimanali"><Input type="number" inputMode="numeric" value={form.ore_settimanali ?? ""} onChange={(e) => set({ ore_settimanali: e.target.value })} /></Field>
              <Field label="Data di assunzione"><Input type="date" value={form.data_assunzione || ""} onChange={(e) => set({ data_assunzione: e.target.value })} /></Field>
              <Field label="Fine contratto" error={errors.data_fine_contratto} hint="Solo per i contratti a termine"><Input type="date" value={form.data_fine_contratto || ""} onChange={(e) => set({ data_fine_contratto: e.target.value })} /></Field>
              <Field label="Costo orario aziendale €" hint="Costo pieno per l'azienda: serve a calcolare la manodopera dei lavori">
                <Input type="number" inputMode="decimal" step="0.01" value={form.costo_orario} onChange={(e) => set({ costo_orario: e.target.value })} />
              </Field>
              <Field label="IBAN" error={errors.iban}><Input value={form.iban} onChange={(e) => set({ iban: e.target.value })} autoCapitalize="characters" spellCheck={false} /></Field>
            </div>
          </TabsContent>

          <TabsContent value="sicurezza" className="space-y-4 pt-3">
            <div>
              <Label className="text-sm">Patenti e abilitazioni</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PATENTI.map((p) => (
                  <button key={p} type="button" onClick={() => togglePatente(p)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${form.patenti.includes(p) ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm">Taglie per i DPI</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1.5">
                {[["scarpe", "Scarpe"], ["pantaloni", "Pantaloni"], ["giacca", "Giacca/maglia"], ["guanti", "Guanti"]].map(([k, l]) => (
                  <Field key={k} label={l}><Input value={form.taglie[k] || ""} onChange={(e) => set({ taglie: { ...form.taglie, [k]: e.target.value } })} /></Field>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="emergenza" className="space-y-4 pt-3">
            <p className="text-sm text-slate-500">Chi avvisare in caso di infortunio in cantiere.</p>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Nome"><Input value={form.contatto_emergenza.nome || ""} onChange={(e) => set({ contatto_emergenza: { ...form.contatto_emergenza, nome: e.target.value } })} /></Field>
              <Field label="Relazione"><Input value={form.contatto_emergenza.relazione || ""} onChange={(e) => set({ contatto_emergenza: { ...form.contatto_emergenza, relazione: e.target.value } })} placeholder="Es. moglie, fratello" /></Field>
              <Field label="Telefono"><Input value={form.contatto_emergenza.telefono || ""} onChange={(e) => set({ contatto_emergenza: { ...form.contatto_emergenza, telefono: e.target.value } })} inputMode="tel" /></Field>
            </div>
            <Field label="Note"><textarea value={form.note || ""} onChange={(e) => set({ note: e.target.value })} rows={3} className="w-full rounded-md border border-input p-2 text-sm" placeholder="Allergie, esigenze particolari…" /></Field>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-brand-600 hover:bg-brand-700">{saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}{employee?.id ? "Salva modifiche" : "Crea dipendente"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
