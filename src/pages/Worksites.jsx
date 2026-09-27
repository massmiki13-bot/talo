import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { FolderOpen, Plus, TrendingUp, TrendingDown, Eye, FileDown, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/shared/StatusBadge";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";
import { formatEuro } from "@/utils/pdfUtils";
import { exportWorksitesSummary } from "@/utils/worksiteSummaryExport";

export default function Worksites() {
  const [worksites, setWorksites] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", indirizzo: "", note: "", importo_totale: "", stato: "da_iniziare" });
  const [statusFilter, setStatusFilter] = useState("tutti");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [sites, txs] = await Promise.all([
        db.Worksite.list("-created_date"),
        db.WorksiteTransaction.list(),
      ]);
      setWorksites(sites);
      setTransactions(txs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.nome.trim()) return;
    try {
      await db.Worksite.create({ ...form, attivo: true });
      setForm({ nome: "", indirizzo: "", note: "", importo_totale: "", stato: "da_iniziare" });
      setDialogOpen(false);
      load();
      toast({ title: "Lavoro creato" });
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const getBudget = (siteId) => {
    const txs = transactions.filter(t => t.worksite_id === siteId);
    const entrate = txs.filter(t => t.tipo === "entrata").reduce((s, t) => s + (t.importo || 0), 0);
    const uscite = txs.filter(t => t.tipo === "uscita").reduce((s, t) => s + (t.importo || 0), 0);
    return { entrate, uscite, margine: entrate - uscite };
  };

  const [exporting, setExporting] = useState(false);

  const filtered = statusFilter === "tutti" ? worksites : worksites.filter(w => (w.stato || "da_iniziare") === statusFilter);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Delete linked data first
      const [txs, photos, payments, attendance, receivedQuotes, quotes] = await Promise.all([
        db.WorksiteTransaction.filter({ worksite_id: deleteTarget.id }),
        db.WorksitePhoto.filter({ worksite_id: deleteTarget.id }),
        db.WorksitePayment.filter({ worksite_id: deleteTarget.id }),
        db.DailyAttendance.filter({ cantiere_id: deleteTarget.id }),
        db.ReceivedQuote.filter({ worksite_id: deleteTarget.id }),
        db.Quote.filter({ worksite_id: deleteTarget.id }),
      ]);
      await Promise.all([
        txs.length && db.WorksiteTransaction.deleteMany({ worksite_id: deleteTarget.id }),
        photos.length && db.WorksitePhoto.deleteMany({ worksite_id: deleteTarget.id }),
        payments.length && db.WorksitePayment.deleteMany({ worksite_id: deleteTarget.id }),
        attendance.length && db.DailyAttendance.deleteMany({ cantiere_id: deleteTarget.id }),
        receivedQuotes.length && db.ReceivedQuote.deleteMany({ worksite_id: deleteTarget.id }),
        quotes.length && db.Quote.deleteMany({ worksite_id: deleteTarget.id }),
      ]);
      // Delete the worksite itself
      await db.Worksite.delete(deleteTarget.id);
      toast({ title: "Lavoro eliminato", className: "bg-green-600 text-white" });
      setDeleteTarget(null);
      load();
    } catch (e) {
      console.error(e);
      toast({ title: "Errore durante l'eliminazione", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleExportSummary = async () => {
    if (worksites.length === 0) return;
    setExporting(true);
    try {
      await exportWorksitesSummary(worksites);
      toast({ title: "Riepilogo esportato" });
    } catch (e) { console.error(e); toast({ title: "Errore export", variant: "destructive" }); }
    finally { setExporting(false); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Lavori" subtitle="Gestisci progetti, commesse, cantieri" actionLabel="+ Nuovo Lavoro" onAction={() => setDialogOpen(true)}>
        <Button variant="outline" onClick={handleExportSummary} disabled={exporting || worksites.length === 0} className="gap-2">
          <FileDown className="w-4 h-4" /> {exporting ? "Esportazione…" : "Esporta Riepilogo"}
        </Button>
      </PageHeader>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { value: "tutti", label: "Tutti" },
          { value: "da_iniziare", label: "Da Iniziare" },
          { value: "in_corso", label: "In Corso" },
          { value: "finito", label: "Finito" },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === f.value ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FolderOpen} title="Nessun lavoro" description="Crea il primo lavoro o progetto" actionLabel="+ Nuovo Lavoro" onAction={() => setDialogOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(w => {
            const budget = getBudget(w.id);
            const inPerdita = budget.margine < 0;
            return (
              <div key={w.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow relative group">
                <Link to={`/lavori/${w.id}`} className="block">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{w.nome}</h3>
                    {w.cliente_nome && <p className="text-xs text-slate-500 mt-0.5">{w.cliente_nome}</p>}
                    {w.indirizzo && <p className="text-xs text-slate-400 mt-0.5">{w.indirizzo}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={w.stato || "da_iniziare"} />
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${w.attivo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {w.attivo ? "Attivo" : "Chiuso"}
                    </span>
                    {w.stato_pagamento && w.stato_pagamento !== "non_pagato" && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${w.stato_pagamento === "saldato" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {w.stato_pagamento === "saldato" ? "Saldato" : "Parziale"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500">Entrate</p>
                    <p className="text-sm font-semibold text-emerald-600">{formatEuro(budget.entrate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Uscite</p>
                    <p className="text-sm font-semibold text-red-600">{formatEuro(budget.uscite)}</p>
                  </div>
                </div>
                <div className={`mt-2 pt-2 border-t border-slate-100 flex items-center justify-between`}>
                  <span className="text-xs text-slate-500">Margine</span>
                  <span className={`text-sm font-bold ${inPerdita ? "text-red-600" : "text-emerald-600"}`}>
                    {inPerdita ? <TrendingDown className="w-3.5 h-3.5 inline mr-1" /> : <TrendingUp className="w-3.5 h-3.5 inline mr-1" />}
                    {formatEuro(budget.margine)}
                  </span>
                </div>
                </Link>
                <button
                  onClick={() => setDeleteTarget(w)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Elimina lavoro"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuovo Lavoro</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-4">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Es. Ristrutturazione via Roma" />
            </div>
            <div>
              <Label>Indirizzo</Label>
              <Input value={form.indirizzo} onChange={e => setForm({ ...form, indirizzo: e.target.value })} />
            </div>
            <div>
              <Label>Importo totale contratto (€)</Label>
              <Input type="number" step="0.01" value={form.importo_totale} onChange={e => setForm({ ...form, importo_totale: parseFloat(e.target.value) || "" })} placeholder="Es. 15000" />
            </div>
            <div>
              <Label>Stato</Label>
              <Select value={form.stato} onValueChange={v => setForm({ ...form, stato: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="da_iniziare">Da Iniziare</SelectItem>
                  <SelectItem value="in_corso">In Corso</SelectItem>
                  <SelectItem value="finito">Finito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note</Label>
              <Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">Crea</Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
        title="Elimina lavoro"
        description="Sei sicuro di voler eliminare questo lavoro? Verranno rimossi anche tutti i dati collegati (spese, entrate, documenti, foto, ore di presenza e preventivi associati) e l'azione non può essere annullata."
        confirmLabel={deleting ? "Eliminazione…" : "Elimina"}
        onConfirm={handleDelete}
      />
    </div>
  );
}