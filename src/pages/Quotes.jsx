import React, { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Eye, Search, Copy, Bookmark, Upload, Plus, Inbox, Trash2, CheckSquare } from "lucide-react";
import QuoteImportDialog from "@/components/shared/QuoteImportDialog";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";
import ReceivedQuotesSection from "@/components/quotes/ReceivedQuotesSection";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import StatusBadge from "@/components/shared/StatusBadge";
import { generateQuoteNumber } from "@/utils/quoteNumbering";

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("tutti");
  const [yearFilter, setYearFilter] = useState("tutti");
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState([]);
  const [tplDialog, setTplDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [profile, setProfile] = useState(null);
  const [worksites, setWorksites] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null); // null | { type: "single"|"multi", ids: string[] }
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [qs, tpls, profs, sites] = await Promise.all([
        db.Quote.list("-created_date"),
        db.SavedTemplate.filter({ tipo: "preventivo" }),
        db.CompanyProfile.list(),
        db.Worksite.list(),
      ]);
      setQuotes(qs);
      setTemplates(tpls);
      setProfile(profs[0]);
      setWorksites(sites);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDuplicate = async (q) => {
    try {
      const profiles = await db.CompanyProfile.list();
      const profile = profiles[0];
      const existingQuotes = await db.Quote.list();
      const { numero, anno } = generateQuoteNumber(profile, existingQuotes);
      const created = await db.Quote.create({
        ...q,
        numero,
        anno,
        data: new Date().toISOString().slice(0, 10),
        stato: "in_attesa",
        firma_cliente_url: "",
        data_firma_cliente: "",
        data_invio: "",
        inviato_a: "",
      });
      delete created.id;
      toast({ title: "Preventivo duplicato", description: `Nuovo n. ${numero}` });
      load();
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const handleDeleteTemplate = async (tplId) => {
    if (!confirm("Eliminare questo modello?")) return;
    await db.SavedTemplate.delete(tplId);
    load();
    toast({ title: "Modello eliminato" });
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(q => q.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const requestDelete = (id) => {
    setDeleteTarget({ type: "single", ids: [id] });
  };

  const requestDeleteMulti = () => {
    if (selectedIds.size === 0) return;
    setDeleteTarget({ type: "multi", ids: [...selectedIds] });
  };

  const confirmDelete = async () => {
    const ids = deleteTarget?.ids || [];
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      for (const id of ids) {
        await db.Quote.delete(id);
      }
      toast({ title: ids.length === 1 ? "Preventivo eliminato" : `${ids.length} preventivi eliminati` });
      exitSelectMode();
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast({ title: "Errore eliminazione", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const years = [...new Set(quotes.map(q => q.anno).filter(Boolean))].sort((a, b) => b - a);

  const filtered = quotes.filter(q => {
    if (statusFilter !== "tutti" && q.stato !== statusFilter) return false;
    if (yearFilter !== "tutti" && q.anno !== parseInt(yearFilter)) return false;
    if (search && !q.cliente_nome?.toLowerCase().includes(search.toLowerCase()) && !q.oggetto?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Preventivi" subtitle="Preventivi emessi e ricevuti">
        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
          {templates.length > 0 && (
            <Button variant="outline" onClick={() => setTplDialog(true)} className="gap-2 flex-1 sm:flex-none justify-center">
              <Bookmark className="w-4 h-4" /> Modelli
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportDialog(true)} className="gap-2 flex-1 sm:flex-none justify-center">
            <Upload className="w-4 h-4" /> Importa
          </Button>
          <Button onClick={() => navigate("/preventivi/nuovo")} className="gap-2 flex-1 sm:flex-none justify-center">
            <Plus className="w-4 h-4" /> Nuovo Preventivo
          </Button>
        </div>
      </PageHeader>

      {/* Multi-select toolbar for emitted quotes */}
      {selectMode && (
        <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-blue-700">
              {selectedIds.size} selezionat{selectedIds.size === 1 ? "o" : "i"}
            </span>
            <button onClick={toggleSelectAll} className="text-xs text-blue-600 hover:text-blue-800 underline">
              {selectedIds.size === filtered.length ? "Deseleziona tutti" : "Seleziona tutti"}
            </button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exitSelectMode}>Annulla</Button>
            <Button variant="destructive" size="sm" onClick={requestDeleteMulti} disabled={selectedIds.size === 0} className="gap-1.5">
              <Trash2 className="w-4 h-4" /> Elimina selezionati
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="emessi" className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md mb-4">
          <TabsTrigger value="emessi" className="gap-1.5"><FileText className="w-4 h-4" /> Emessi</TabsTrigger>
          <TabsTrigger value="ricevuti" className="gap-1.5"><Inbox className="w-4 h-4" /> Ricevuti</TabsTrigger>
        </TabsList>

        <TabsContent value="emessi">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Cerca per cliente o oggetto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10" />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px] h-10"><SelectValue placeholder="Stato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutti">Tutti gli stati</SelectItem>
                  <SelectItem value="in_attesa">In Attesa</SelectItem>
                  <SelectItem value="inviato">Inviato</SelectItem>
                  <SelectItem value="approvato">Approvato</SelectItem>
                  <SelectItem value="rifiutato">Rifiutato</SelectItem>
                  <SelectItem value="scaduto">Scaduto</SelectItem>
                </SelectContent>
              </Select>
              {years.length > 0 && (
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="w-[100px] h-10"><SelectValue placeholder="Anno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tutti">Tutti</SelectItem>
                    {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant={selectMode ? "default" : "outline"}
                onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                className="h-10 gap-1.5"
              >
                <CheckSquare className="w-4 h-4" /> {selectMode ? "Fine" : "Seleziona"}
              </Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={FileText} title="Nessun preventivo" description="Crea il tuo primo preventivo" />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {selectMode && <th className="text-center text-xs font-medium text-slate-500 uppercase px-3 py-3 w-10">
                        <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="w-4 h-4 cursor-pointer" />
                      </th>}
                      <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">N°</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Data</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Cliente</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Oggetto</th>
                      <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3">Totale</th>
                      <th className="text-center text-xs font-medium text-slate-500 uppercase px-4 py-3">Stato</th>
                      <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(q => {
                      const isSelected = selectedIds.has(q.id);
                      return (
                        <tr key={q.id} className={`transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                          {selectMode && (
                            <td className="px-3 py-3 text-center">
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(q.id)} className="w-4 h-4 cursor-pointer" />
                            </td>
                          )}
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{q.numero || "—"}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{q.data ? new Date(q.data).toLocaleDateString("it-IT") : "—"}</td>
                          <td className="px-4 py-3 text-sm text-slate-900">{q.cliente_nome || "—"}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 truncate max-w-[200px]">{q.oggetto || "—"}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 text-right">€ {(q.totale || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={q.stato} /></td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Link to={`/preventivi/${q.id}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 inline-flex"><Eye className="w-4 h-4" /></Link>
                              <button onClick={() => handleDuplicate(q)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600" title="Duplica"><Copy className="w-4 h-4" /></button>
                              <button onClick={() => requestDelete(q.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Elimina"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {filtered.map(q => {
                  const isSelected = selectedIds.has(q.id);
                  return (
                    <div key={q.id} className={`bg-white rounded-xl border p-4 ${isSelected ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1 flex items-start gap-2">
                          {selectMode && (
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(q.id)} className="w-4 h-4 mt-1 cursor-pointer flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">{q.numero || "—"}</span>
                              <span className="text-xs text-slate-400">{q.data ? new Date(q.data).toLocaleDateString("it-IT") : ""}</span>
                            </div>
                            <p className="text-sm font-medium text-slate-900 mt-1 truncate">{q.cliente_nome || "—"}</p>
                            {q.oggetto && <p className="text-xs text-slate-500 truncate">{q.oggetto}</p>}
                          </div>
                        </div>
                        <StatusBadge status={q.stato} />
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                        <span className="text-base font-bold text-slate-900">€ {(q.totale || 0).toFixed(2)}</span>
                        <div className="flex gap-1">
                          <Link to={`/preventivi/${q.id}`} className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"><Eye className="w-4 h-4" /></Link>
                          <button onClick={() => handleDuplicate(q)} className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="Duplica"><Copy className="w-4 h-4" /></button>
                          <button onClick={() => requestDelete(q.id)} className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" title="Elimina"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="ricevuti">
          <ReceivedQuotesSection profile={profile} worksites={worksites} />
        </TabsContent>
      </Tabs>

      {/* Templates dialog */}
      <Dialog open={tplDialog} onOpenChange={setTplDialog}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Modelli salvati</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-4">
            {templates.map(tpl => (
              <div key={tpl.id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{tpl.nome}</p>
                  {tpl.oggetto && <p className="text-xs text-slate-500">{tpl.oggetto}</p>}
                  <p className="text-xs text-slate-400 mt-0.5">{tpl.righe?.length || 0} voci</p>
                </div>
                <div className="flex gap-1">
                  <Link to={`/preventivi/nuovo?template=${tpl.id}`} onClick={() => setTplDialog(false)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">Usa</Link>
                  <button onClick={() => handleDeleteTemplate(tpl.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 text-xs">Elimina</button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <QuoteImportDialog open={importDialog} onOpenChange={setImportDialog} />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={deleteTarget?.type === "multi" ? `Elimina ${deleteTarget?.ids.length} preventivi` : "Elimina preventivo"}
        description={deleteTarget?.type === "multi"
          ? `Sei sicuro di voler eliminare ${deleteTarget?.ids.length} preventivi? L'azione non può essere annullata.`
          : "Sei sicuro di voler eliminare questo preventivo? L'azione non può essere annullata."}
        confirmLabel={deleting ? "Eliminazione..." : "Elimina"}
        onConfirm={confirmDelete}
      />
    </div>
  );
}