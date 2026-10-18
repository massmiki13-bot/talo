import React, { useMemo, useState } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Search, Loader2, Building2, Plus, X, CheckCircle2 } from "lucide-react";
import ContactForm from "@/components/contacts/ContactForm";

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const nameOf = (c) => c?.nome || c?.nome_privato || c?.ragione_sociale || "";

/**
 * Scelta del cliente in fattura: cerca per nome, P.IVA o codice fiscale tra i contatti;
 * se la P.IVA non è in rubrica la cerca nel registro europeo (VIES) e crea il cliente; oppure si inserisce a mano.
 */
export default function ClientPicker({ contacts, value, onPick, onContactCreated, disabled, id }) {
  const { toast } = useToast();
  const current = contacts.find((c) => c.id === value);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [vies, setVies] = useState(null); // { loading } | { ok, data } | { ok:false, message }
  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState(null); // fissato all'apertura: il modulo non si azzera mentre si scrive
  const [creating, setCreating] = useState(false);

  const digits = onlyDigits(q);
  const isPiva = /^\d{11}$/.test(digits);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return contacts.slice(0, 8);
    return contacts.filter((c) =>
      nameOf(c).toLowerCase().includes(t)
      || (digits.length >= 4 && (onlyDigits(c.partita_iva).includes(digits) || onlyDigits(c.codice_fiscale).includes(digits)))
      || String(c.codice_fiscale || "").toLowerCase().includes(t)).slice(0, 8);
  }, [contacts, q, digits]);

  const pick = (c) => { onPick(c); setQ(""); setOpen(false); setVies(null); };

  const lookup = async () => {
    setVies({ loading: true });
    try {
      const res = await api.functions.invoke("vies", { partita_iva: digits });
      if (res.data?.error) throw new Error(res.data.error);
      setVies(res.data.valid ? { ok: true, data: res.data } : { ok: false, message: "Partita IVA non attiva nel registro europeo (VIES): puoi inserire il cliente a mano." });
    } catch (e) { setVies({ ok: false, message: e.message || "Registro non raggiungibile: inserisci il cliente a mano." }); }
  };

  const createFromVies = async () => {
    setCreating(true);
    try {
      const d = vies.data;
      const c = await db.Contact.create({
        tipo: "cliente", tipo_soggetto: "azienda", nome: d.ragione_sociale || `P.IVA ${digits}`, partita_iva: digits, codice_fiscale: digits,
        indirizzo: d.indirizzo || "", cap: d.cap || "", citta: d.citta || "", provincia: d.provincia || "",
      });
      onContactCreated?.(c);
      pick(c);
      toast({ title: "Cliente aggiunto alla rubrica", description: "Aggiungi codice SDI o PEC per inviare la fattura elettronica." });
    } catch (e) { toast({ title: "Cliente non salvato", description: e.message, variant: "destructive" }); }
    finally { setCreating(false); }
  };

  return (
    <div className="mt-1 relative">
      {current && !open ? (
        <div className="flex items-center gap-2 h-9 rounded-md border border-input px-3 text-sm bg-white">
          <Building2 className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">{nameOf(current)}</span>
          {!disabled && <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-brand-700 hover:underline">Cambia</button>}
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <Input id={id} value={q} disabled={disabled} autoFocus={open} onFocus={() => setOpen(true)}
              onChange={(e) => { setQ(e.target.value); setVies(null); setOpen(true); }}
              placeholder="Nome, partita IVA o codice fiscale" className="pl-8 pr-8" aria-label="Cerca cliente" />
            {current && <button type="button" onClick={() => { setOpen(false); setQ(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700" aria-label="Chiudi ricerca"><X className="w-4 h-4" /></button>}
          </div>
          {open && !disabled && (
            <div className="absolute z-30 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg p-1.5 max-h-80 overflow-y-auto">
              {matches.map((c) => (
                <button key={c.id} type="button" onClick={() => pick(c)} className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-zinc-50">
                  <span className="block text-sm font-medium text-zinc-900 truncate">{nameOf(c)}</span>
                  <span className="block text-xs text-zinc-500">{[c.partita_iva && `P.IVA ${c.partita_iva}`, !c.partita_iva && c.codice_fiscale && `C.F. ${c.codice_fiscale}`, c.citta].filter(Boolean).join(" · ") || "senza dati fiscali"}</span>
                </button>
              ))}
              {!matches.length && <p className="px-2.5 py-2 text-sm text-zinc-500">Nessun cliente in rubrica con «{q}».</p>}
              {isPiva && !matches.some((c) => onlyDigits(c.partita_iva) === digits) && (
                <div className="border-t border-zinc-100 mt-1 pt-1.5 px-1">
                  {!vies && <Button type="button" size="sm" variant="outline" className="w-full gap-1.5" onClick={lookup}><Search className="w-4 h-4" /> Cerca la P.IVA {digits} nel registro</Button>}
                  {vies?.loading && <p className="text-sm text-zinc-600 flex items-center gap-2 px-1.5 py-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Cerco nel registro europeo…</p>}
                  {vies?.ok && (
                    <div className="rounded-lg bg-emerald-50 p-2.5 text-sm">
                      <p className="font-semibold text-emerald-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{vies.data.ragione_sociale || "Azienda attiva"}</p>
                      <p className="text-xs text-emerald-900/80 mt-0.5">{[vies.data.indirizzo, [vies.data.cap, vies.data.citta, vies.data.provincia && `(${vies.data.provincia})`].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
                      <Button type="button" size="sm" className="mt-2 w-full gap-1.5 bg-emerald-700 hover:bg-emerald-800" onClick={createFromVies} disabled={creating}>{creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Usa questo cliente</Button>
                    </div>
                  )}
                  {vies && vies.ok === false && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">{vies.message}</p>}
                </div>
              )}
              <button type="button" onClick={() => { setPrefill(isPiva ? { partita_iva: digits, codice_fiscale: digits } : q.trim() && !digits ? { nome: q.trim() } : null); setFormOpen(true); setOpen(false); }} className="w-full text-left rounded-lg px-2.5 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 flex items-center gap-1.5 border-t border-zinc-100 mt-1">
                <Plus className="w-4 h-4" /> Nuovo cliente inserito a mano
              </button>
            </div>
          )}
        </>
      )}
      <ContactForm open={formOpen} onOpenChange={setFormOpen} defaultTipo="cliente"
        contact={prefill}
        onSaved={(c) => { if (c?.id) { onContactCreated?.(c); pick(c); } }} />
    </div>
  );
}
