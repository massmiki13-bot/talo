import React, { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { UserCheck, Pencil, Trash2, Search, Eye } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

const emptyEmployee = { nome: "", cognome: "", codice_fiscale: "", data_nascita: "", luogo_nascita: "", indirizzo: "", telefono: "", email: "", ruolo: "", data_assunzione: "", tipo_contratto: "", costo_orario: "", note: "" };

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyEmployee);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const emps = await db.Employee.list();
      setEmployees(emps);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      if (editId) {
        await db.Employee.update(editId, form);
      } else {
        await db.Employee.create(form);
      }
      setDialogOpen(false);
      setForm(emptyEmployee);
      setEditId(null);
      load();
      toast({ title: "Salvato" });
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  const handleEdit = (emp) => {
    const data = {};
    Object.keys(emptyEmployee).forEach(k => data[k] = emp[k] || "");
    setForm(data);
    setEditId(emp.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare questo dipendente?")) return;
    await db.Employee.delete(id);
    load();
  };

  const openNew = () => { setForm(emptyEmployee); setEditId(null); setDialogOpen(true); };

  const filtered = employees.filter(e => `${e.nome} ${e.cognome}`.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Dipendenti" subtitle="Schede personali e documenti" actionLabel="+ Nuovo Dipendente" onAction={openNew} />

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Cerca dipendente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={UserCheck} title="Nessun dipendente" actionLabel="+ Nuovo Dipendente" onAction={openNew} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Nome</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Ruolo</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Telefono</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{emp.nome} {emp.cognome}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{emp.ruolo || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{emp.telefono || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/dipendenti/${emp.id}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600"><Eye className="w-4 h-4" /></Link>
                        <button onClick={() => handleEdit(emp)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(emp.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(emp => (
              <div key={emp.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{emp.nome} {emp.cognome}</p>
                    {emp.ruolo && <p className="text-xs text-slate-500 mt-0.5">{emp.ruolo}</p>}
                    {emp.telefono && <p className="text-xs text-slate-500">Tel: {emp.telefono}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Link to={`/dipendenti/${emp.id}`} className="p-2 rounded-lg bg-slate-100 text-slate-600"><Eye className="w-4 h-4" /></Link>
                    <button onClick={() => handleEdit(emp)} className="p-2 rounded-lg bg-slate-100 text-slate-600"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(emp.id)} className="p-2 rounded-lg bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Modifica Dipendente" : "Nuovo Dipendente"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 max-h-[60vh] overflow-y-auto pr-2">
            {[
              { key: "nome", label: "Nome" }, { key: "cognome", label: "Cognome" },
              { key: "codice_fiscale", label: "Codice Fiscale", span: 2 },
              { key: "data_nascita", label: "Data di Nascita", type: "date" },
              { key: "luogo_nascita", label: "Luogo di Nascita" },
              { key: "indirizzo", label: "Indirizzo", span: 2 },
              { key: "telefono", label: "Telefono" }, { key: "email", label: "Email" },
              { key: "ruolo", label: "Ruolo/Mansione" }, { key: "tipo_contratto", label: "Tipo Contratto" },
              { key: "data_assunzione", label: "Data Assunzione", type: "date" },
              { key: "costo_orario", label: "Costo Orario (€)", type: "number" },
            ].map(f => (
              <div key={f.key} className={f.span === 2 ? "sm:col-span-2" : ""}>
                <Label>{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="h-10" />
              </div>
            ))}
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