import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Search, Loader2, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { validateContact, isValidPartitaIva, formatIban } from "@/lib/validators";
import { CATEGORIE_CLIENTE, CATEGORIE_FORNITORE, MODALITA_PAGAMENTO, findDuplicates, displayName } from "@/lib/contacts";
import Field from "@/components/shared/FormField";

export const EMPTY_CONTACT = {
  tipo: "cliente", tipo_soggetto: "azienda", nome: "", nome_privato: "", partita_iva: "", codice_fiscale: "",
  indirizzo: "", citta: "", cap: "", provincia: "", telefono: "", cellulare: "", email: "", pec: "", sito_web: "",
  codice_sdi: "", iban: "", categorie: [], categoria_fornitore: "", referenti: [], indirizzi: [],
  sconto_default: "", iva_default: "", pagamento_default: "", termini_pagamento_giorni: "", note: "",
};


export default function ContactForm({ open, onOpenChange, contact = null, defaultTipo = "cliente", onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_CONTACT);
  const [tab, setTab] = useState("anagrafica");
  const [all, setAll] = useState([]);
  const [saving, setSaving] = useState(false);
  const [vies, setVies] = useState({ loading: false, result: null });
  const [touched, setTouched] = useState(false);
  const [newCat, setNewCat] = useState("");

  useEffect(() => {
    if (!open) return;
    const base = { ...EMPTY_CONTACT, tipo: defaultTipo, ...(contact || {}) };
    for (const k of ["sconto_default", "iva_default", "termini_pagamento_giorni"]) base[k] = base[k] ?? "";
    setForm(base);
    setTab("anagrafica");
    setVies({ loading: false, result: null });
    setTouched(false);
    db.Contact.list("nome", 5000).then(setAll).catch(() => {});
  }, [open, contact, defaultTipo]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const errors = useMemo(() => validateContact(form), [form]);
  const duplicates = useMemo(() => findDuplicates(all, form, contact?.id), [all, form, contact]);
  const isPrivato = form.tipo_soggetto === "privato";
  const showFornitore = form.tipo === "fornitore" || form.tipo === "entrambi";
  const categoryOptions = [...new Set([
    ...(form.tipo !== "fornitore" ? CATEGORIE_CLIENTE : []),
    ...(showFornitore ? CATEGORIE_FORNITORE : []),
    ...all.flatMap((c) => c.categorie || []),
  ])];

  const lookupVies = async () => {
    setVies({ loading: true, result: null });
    try {
      const res = await api.functions.invoke("vies", { partita_iva: form.partita_iva });
      if (res.data?.error) throw new Error(res.data.error);
      if (!res.data.valid) {
        setVies({ loading: false, result: { ok: false, message: "Partita IVA non attiva nel registro europeo (VIES)" } });
        return;
      }
      const d = res.data;
      set({
        nome: form.nome || d.ragione_sociale,
        indirizzo: form.indirizzo || d.indirizzo,
        cap: form.cap || d.cap,
        citta: form.citta || d.citta,
        provincia: form.provincia || d.provincia,
        codice_fiscale: form.codice_fiscale || form.partita_iva.replace(/\D/g, ""),
      });
      setVies({ loading: false, result: { ok: true, message: `Trovata: ${d.ragione_sociale || "azienda attiva"}` } });
    } catch (e) {
      setVies({ loading: false, result: { ok: false, message: e.message } });
    }
  };

  const updateList = (key, index, patch) => set({ [key]: form[key].map((x, i) => (i === index ? { ...x, ...patch } : x)) });
  const removeFromList = (key, index) => set({ [key]: form[key].filter((_, i) => i !== index) });

  const toggleCat = (c) => set({ categorie: form.categorie.includes(c) ? form.categorie.filter((x) => x !== c) : [...form.categorie, c] });

  const save = async () => {
    setTouched(true);
    if (!form.nome.trim() && !form.nome_privato.trim()) {
      setTab("anagrafica");
      toast({ title: isPrivato ? "Inserisci nome e cognome" : "Inserisci la ragione sociale", variant: "destructive" });
      return;
    }
    if (Object.keys(errors).length) {
      const inCond = ["iban"].some((k) => errors[k]);
      setTab(inCond ? "condizioni" : "anagrafica");
      toast({ title: "Controlla i campi evidenziati", description: Object.values(errors).join(" · "), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const num = (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(",", ".")));
      const data = {
        ...form,
        partita_iva: form.partita_iva.replace(/\s+/g, "").toUpperCase().replace(/^IT/, ""),
        codice_fiscale: form.codice_fiscale.replace(/\s+/g, "").toUpperCase(),
        provincia: form.provincia.trim().toUpperCase(),
        codice_sdi: form.codice_sdi.trim().toUpperCase(),
        iban: form.iban ? formatIban(form.iban) : "",
        email: form.email.trim().toLowerCase(),
        pec: form.pec.trim().toLowerCase(),
        sconto_default: num(form.sconto_default),
        iva_default: num(form.iva_default),
        termini_pagamento_giorni: num(form.termini_pagamento_giorni),
        referenti: form.referenti.filter((r) => r.nome || r.email || r.telefono),
        indirizzi: form.indirizzi.filter((a) => a.indirizzo || a.citta),
      };
      delete data.id; delete data.created_date; delete data.updated_date; delete data.created_by; delete data.created_by_id;
      const saved = contact?.id ? await db.Contact.update(contact.id, data) : await db.Contact.create(data);
      toast({ title: contact?.id ? "Contatto aggiornato" : "Contatto creato" });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      toast({ title: e.message || "Salvataggio non riuscito", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const err = (k) => (touched || form[k] ? errors[k] : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact?.id ? `Modifica ${displayName(contact)}` : "Nuovo contatto"}</DialogTitle>
          <DialogDescription>I campi con il controllo automatico vengono verificati mentre scrivi.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[["cliente", "Cliente"], ["fornitore", "Fornitore"], ["entrambi", "Entrambi"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => set({ tipo: v })}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${form.tipo === v ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {l}
            </button>
          ))}
          <Select value={form.tipo_soggetto} onValueChange={(v) => set({ tipo_soggetto: v })}>
            <SelectTrigger className="h-auto py-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="azienda">Azienda</SelectItem>
              <SelectItem value="privato">Privato</SelectItem>
              <SelectItem value="ente">Ente pubblico</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {duplicates.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Esiste già un contatto con la stessa {duplicates[0].field}:{" "}
              <Link to={`/contatti/${duplicates[0].contact.id}`} className="font-semibold underline" onClick={() => onOpenChange(false)}>{displayName(duplicates[0].contact)}</Link>
              {duplicates.length > 1 && ` e altri ${duplicates.length - 1}`}.
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
            <TabsTrigger value="referenti">Referenti{form.referenti.length ? ` (${form.referenti.length})` : ""}</TabsTrigger>
            <TabsTrigger value="sedi">Sedi{form.indirizzi.length ? ` (${form.indirizzi.length})` : ""}</TabsTrigger>
            <TabsTrigger value="condizioni">Condizioni</TabsTrigger>
          </TabsList>

          <TabsContent value="anagrafica" className="space-y-4 pt-3">
            {!isPrivato && (
              <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
                <Field label="Partita IVA" error={err("partita_iva")} hint="Con la P.IVA puoi compilare in automatico ragione sociale e indirizzo.">
                  <Input value={form.partita_iva} onChange={(e) => set({ partita_iva: e.target.value })} inputMode="numeric" placeholder="01234567890" />
                </Field>
                <Button type="button" variant="outline" className="gap-1.5 sm:mb-6" onClick={lookupVies} disabled={vies.loading || !isValidPartitaIva(form.partita_iva)}>
                  {vies.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Compila da P.IVA
                </Button>
                {vies.result && (
                  <p className={`sm:col-span-2 -mt-2 text-xs flex items-center gap-1 ${vies.result.ok ? "text-emerald-700" : "text-red-700"}`}>
                    {vies.result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />} {vies.result.message}
                  </p>
                )}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              {!isPrivato && (
                <Field label={form.tipo_soggetto === "ente" ? "Denominazione" : "Ragione sociale"} className="sm:col-span-2">
                  <Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} />
                </Field>
              )}
              <Field label={isPrivato ? "Nome e cognome" : "Nome del titolare (facoltativo)"} className={isPrivato ? "sm:col-span-2" : ""}>
                <Input value={form.nome_privato} onChange={(e) => set({ nome_privato: e.target.value })} autoComplete="name" />
              </Field>
              <Field label="Codice fiscale" error={err("codice_fiscale")}>
                <Input value={form.codice_fiscale} onChange={(e) => set({ codice_fiscale: e.target.value })} autoCapitalize="characters" spellCheck={false} />
              </Field>
              <Field label="Indirizzo" className="sm:col-span-2">
                <Input value={form.indirizzo} onChange={(e) => set({ indirizzo: e.target.value })} autoComplete="street-address" />
              </Field>
              <div className="grid grid-cols-[90px_1fr_70px] gap-2 sm:col-span-2">
                <Field label="CAP" error={err("cap")}><Input value={form.cap} onChange={(e) => set({ cap: e.target.value })} inputMode="numeric" maxLength={5} /></Field>
                <Field label="Città"><Input value={form.citta} onChange={(e) => set({ citta: e.target.value })} /></Field>
                <Field label="Prov." error={err("provincia")}><Input value={form.provincia} onChange={(e) => set({ provincia: e.target.value })} maxLength={2} autoCapitalize="characters" /></Field>
              </div>
              <Field label="Telefono"><Input value={form.telefono} onChange={(e) => set({ telefono: e.target.value })} inputMode="tel" autoComplete="tel" /></Field>
              <Field label="Cellulare"><Input value={form.cellulare} onChange={(e) => set({ cellulare: e.target.value })} inputMode="tel" /></Field>
              <Field label="Email" error={err("email")}><Input value={form.email} onChange={(e) => set({ email: e.target.value })} type="email" autoComplete="email" /></Field>
              <Field label="PEC" error={err("pec")}><Input value={form.pec} onChange={(e) => set({ pec: e.target.value })} type="email" /></Field>
              {!isPrivato && (
                <>
                  <Field label="Codice destinatario SDI" error={err("codice_sdi")} hint="Per la fattura elettronica (7 caratteri)">
                    <Input value={form.codice_sdi} onChange={(e) => set({ codice_sdi: e.target.value })} maxLength={7} autoCapitalize="characters" />
                  </Field>
                  <Field label="Sito web"><Input value={form.sito_web} onChange={(e) => set({ sito_web: e.target.value })} inputMode="url" /></Field>
                </>
              )}
            </div>

            <div>
              <Label className="text-sm">Categorie</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {categoryOptions.map((c) => (
                  <button key={c} type="button" onClick={() => toggleCat(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${form.categorie.includes(c) ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    {c}
                  </button>
                ))}
                <form className="flex" onSubmit={(e) => { e.preventDefault(); if (newCat.trim()) { set({ categorie: [...new Set([...form.categorie, newCat.trim()])] }); setNewCat(""); } }}>
                  <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="+ nuova" className="h-7 w-28 text-xs rounded-full" />
                </form>
              </div>
            </div>
            {showFornitore && (
              <Field label="Categoria merceologica del fornitore">
                <Input value={form.categoria_fornitore} onChange={(e) => set({ categoria_fornitore: e.target.value })} placeholder="Es. laterizi, cartongesso, noleggio escavatori" />
              </Field>
            )}
            <Field label="Note">
              <textarea value={form.note} onChange={(e) => set({ note: e.target.value })} rows={3} className="w-full rounded-md border border-input p-2 text-sm" />
            </Field>
          </TabsContent>

          <TabsContent value="referenti" className="space-y-3 pt-3">
            <p className="text-sm text-slate-500">Le persone da contattare: amministrazione, ufficio tecnico, direttore lavori…</p>
            {form.referenti.map((r, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 grid sm:grid-cols-2 gap-2 relative">
                <button type="button" aria-label="Rimuovi referente" onClick={() => removeFromList("referenti", i)} className="absolute top-2 right-2 p-1 rounded hover:bg-slate-100"><Trash2 className="w-4 h-4 text-red-700" /></button>
                <Input placeholder="Nome e cognome" value={r.nome || ""} onChange={(e) => updateList("referenti", i, { nome: e.target.value })} />
                <Input placeholder="Ruolo (es. Amministrazione)" value={r.ruolo || ""} onChange={(e) => updateList("referenti", i, { ruolo: e.target.value })} className="sm:mr-8" />
                <Input placeholder="Telefono" value={r.telefono || ""} onChange={(e) => updateList("referenti", i, { telefono: e.target.value })} inputMode="tel" />
                <Input placeholder="Email" value={r.email || ""} onChange={(e) => updateList("referenti", i, { email: e.target.value })} type="email" />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => set({ referenti: [...form.referenti, { nome: "", ruolo: "", telefono: "", email: "" }] })}>
              <Plus className="w-4 h-4" /> Aggiungi referente
            </Button>
          </TabsContent>

          <TabsContent value="sedi" className="space-y-3 pt-3">
            <p className="text-sm text-slate-500">Altre sedi, magazzini o indirizzi dei cantieri di questo cliente.</p>
            {form.indirizzi.map((a, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2 relative">
                <button type="button" aria-label="Rimuovi indirizzo" onClick={() => removeFromList("indirizzi", i)} className="absolute top-2 right-2 p-1 rounded hover:bg-slate-100"><Trash2 className="w-4 h-4 text-red-700" /></button>
                <Input placeholder="Etichetta (es. Cantiere Via Roma, Magazzino)" value={a.etichetta || ""} onChange={(e) => updateList("indirizzi", i, { etichetta: e.target.value })} className="pr-10" />
                <Input placeholder="Indirizzo" value={a.indirizzo || ""} onChange={(e) => updateList("indirizzi", i, { indirizzo: e.target.value })} />
                <div className="grid grid-cols-[90px_1fr_70px] gap-2">
                  <Input placeholder="CAP" value={a.cap || ""} onChange={(e) => updateList("indirizzi", i, { cap: e.target.value })} inputMode="numeric" maxLength={5} />
                  <Input placeholder="Città" value={a.citta || ""} onChange={(e) => updateList("indirizzi", i, { citta: e.target.value })} />
                  <Input placeholder="Prov." value={a.provincia || ""} onChange={(e) => updateList("indirizzi", i, { provincia: e.target.value.toUpperCase() })} maxLength={2} />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => set({ indirizzi: [...form.indirizzi, { etichetta: "", indirizzo: "", cap: "", citta: "", provincia: "" }] })}>
              <Plus className="w-4 h-4" /> Aggiungi indirizzo
            </Button>
          </TabsContent>

          <TabsContent value="condizioni" className="space-y-4 pt-3">
            <p className="text-sm text-slate-500">Si applicano in automatico ai nuovi preventivi per questo {form.tipo === "fornitore" ? "fornitore" : "cliente"}.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Modalità di pagamento">
                <Select value={form.pagamento_default || "none"} onValueChange={(v) => set({ pagamento_default: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nessuna —</SelectItem>
                    {[...new Set([...MODALITA_PAGAMENTO, form.pagamento_default].filter(Boolean))].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Termini di pagamento (giorni)"><Input value={form.termini_pagamento_giorni} onChange={(e) => set({ termini_pagamento_giorni: e.target.value })} inputMode="numeric" placeholder="30" /></Field>
              <Field label="Sconto abituale %"><Input value={form.sconto_default} onChange={(e) => set({ sconto_default: e.target.value })} inputMode="decimal" placeholder="0" /></Field>
              <Field label="Aliquota IVA abituale">
                <Select value={form.iva_default === "" || form.iva_default === null ? "none" : String(form.iva_default)} onValueChange={(v) => set({ iva_default: v === "none" ? "" : Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Standard —</SelectItem>
                    <SelectItem value="22">22% ordinaria</SelectItem>
                    <SelectItem value="10">10% ristrutturazioni / manutenzioni</SelectItem>
                    <SelectItem value="4">4% prima casa / barriere architettoniche</SelectItem>
                    <SelectItem value="0">0% reverse charge / esente</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="IBAN" error={err("iban")} className="sm:col-span-2" hint={showFornitore ? "Per i pagamenti al fornitore" : undefined}>
                <Input value={form.iban} onChange={(e) => set({ iban: e.target.value })} autoCapitalize="characters" spellCheck={false} placeholder="IT60 X054 2811 1010 0000 0123 456" />
              </Field>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-brand-600 hover:bg-brand-700">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}{contact?.id ? "Salva modifiche" : "Crea contatto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
