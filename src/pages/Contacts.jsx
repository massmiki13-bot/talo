import React, { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Users, Pencil, Trash2, Search, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

const emptyContact = { tipo: "cliente", nome: "", nome_privato: "", partita_iva: "", codice_fiscale: "", indirizzo: "", citta: "", cap: "", provincia: "", telefono: "", email: "", pec: "", note: "" };

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyContact);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("cliente");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setContacts(await db.Contact.list()); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.nome?.trim() && !form.nome_privato?.trim()) {
      toast({ title: "Nome obbligatorio", description: "Compila almeno uno tra Ragione Sociale o Nome", variant: "destructive" });
      return;
    }
    try {
      if (editId) {
        await db.Contact.update(editId, form);
      } else {
        await db.Contact.create(form);
      }
      setDialogOpen(false);
      setForm(emptyContact);
      setEditId(null);
      load();
      toast({ title: editId ? "Aggiornato" : "Creato", description: `Contatto ${editId ? "aggiornato" : "creato"} con successo` });
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  const handleEdit = (c) => {
    setForm({ tipo: c.tipo, nome: c.nome || "", nome_privato: c.nome_privato || "", partita_iva: c.partita_iva || "", codice_fiscale: c.codice_fiscale || "", indirizzo: c.indirizzo || "", citta: c.citta || "", cap: c.cap || "", provincia: c.provincia || "", telefono: c.telefono || "", email: c.email || "", pec: c.pec || "", note: c.note || "" });
    setEditId(c.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare questo contatto?")) return;
    await db.Contact.delete(id);
    load();
  };

  const openNew = () => {
    setForm({ ...emptyContact, tipo: tab });
    setEditId(null);
    setDialogOpen(true);
  };

  const filtered = contacts.filter(c => c.tipo === tab && ((c.nome || c.nome_privato || "")).toLowerCase().includes(search.toLowerCase()));

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Clienti e Fornitori" subtitle="Anagrafica completa" actionLabel="+ Nuovo" onAction={openNew} />

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="cliente">Clienti</TabsTrigger>
          <TabsTrigger value="fornitore">Fornitori</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Cerca per nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title={`Nessun ${tab}`} description="Aggiungi il primo contatto" actionLabel="+ Nuovo" onAction={openNew} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Nome</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">P.IVA</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Telefono</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3 hidden lg:table-cell">Email</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => navigate(`/contatti/${c.id}`)}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      <span className="flex items-center gap-1 text-blue-600 hover:underline">{c.nome || c.nome_privato}<ChevronRight className="w-3.5 h-3.5 text-slate-300" /></span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{c.partita_iva || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{c.telefono || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 hidden lg:table-cell">{c.email || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(c)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-blue-300 transition-colors" onClick={() => navigate(`/contatti/${c.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-blue-600">{c.nome || c.nome_privato}</p>
                    {c.partita_iva && <p className="text-xs text-slate-500 mt-0.5">P.IVA: {c.partita_iva}</p>}
                    {c.telefono && <p className="text-xs text-slate-500">Tel: {c.telefono}</p>}
                    {c.email && <p className="text-xs text-slate-500 truncate">Email: {c.email}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => handleEdit(c)} className="p-2 rounded-lg bg-slate-100 text-slate-600"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Modifica Contatto" : "Nuovo Contatto"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="sm:col-span-2">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="fornitore">Fornitore</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {[
              { key: "nome", label: "Ragione Sociale" },
              { key: "nome_privato", label: "Nome" },
              { key: "partita_iva", label: "Partita IVA" },
              { key: "codice_fiscale", label: "Codice Fiscale" },
              { key: "indirizzo", label: "Indirizzo", span: 2 },
              { key: "citta", label: "Città" },
              { key: "cap", label: "CAP", autoComplete: "postal-code", autoCorrect: "off", autoCapitalize: "characters", spellCheck: false, inputMode: "numeric" },
              { key: "provincia", label: "Provincia", autoComplete: "address-level1", autoCapitalize: "characters" },
              { key: "telefono", label: "Telefono", autoComplete: "tel" },
              { key: "email", label: "Email", autoComplete: "email" },
              { key: "pec", label: "PEC" },
            ].map(f => (
              <div key={f.key} className={f.span === 2 ? "sm:col-span-2" : ""}>
                <Label>{f.label}</Label>
                <Input
                  value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  className="h-10"
                  autoComplete={f.autoComplete}
                  autoCorrect={f.autoCorrect}
                  autoCapitalize={f.autoCapitalize}
                  spellCheck={f.spellCheck}
                  inputMode={f.inputMode}
                />
              </div>
            ))}
            <p className="sm:col-span-2 text-xs text-slate-500 -mt-2">Compila almeno uno tra Ragione Sociale o Nome. Tutti gli altri campi sono facoltativi.</p>
            <div className="sm:col-span-2">
              <Label>Note</Label>
              <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2 text-sm min-h-[60px]" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">{editId ? "Aggiorna" : "Crea"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}