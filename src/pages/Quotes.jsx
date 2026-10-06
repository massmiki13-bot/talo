import React, { useState, useEffect, useMemo } from "react";
import { onEnter } from "@/lib/utils";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { db } from "@/lib/db";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { FileText, Search, Copy, Bookmark, Upload, Plus, Inbox, Trash2, CheckSquare, Download, MoreHorizontal, X, Eye, ArrowUpDown } from "lucide-react";
import QuoteImportDialog from "@/components/shared/QuoteImportDialog";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";
import ReceivedQuotesSection from "@/components/quotes/ReceivedQuotesSection";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { generateQuoteNumber } from "@/utils/quoteNumbering";
import { QUOTE_STATES, OPEN_STATES, effectiveState, expiryDate, fmtEur } from "@/lib/quotes";
import { downloadCsv } from "@/lib/csv";

const PERIODS = {
  tutti: { label: "Sempre", from: () => null },
  mese: { label: "Questo mese", from: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
  trimestre: { label: "Ultimi 3 mesi", from: () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d; } },
  anno: { label: "Quest'anno", from: () => new Date(new Date().getFullYear(), 0, 1) },
  anno_scorso: { label: "Anno scorso", from: () => new Date(new Date().getFullYear() - 1, 0, 1), to: () => new Date(new Date().getFullYear(), 0, 1) },
};

const SORTS = {
  data: { label: "Più recenti", fn: (a, b) => String(b.data || b.created_date).localeCompare(String(a.data || a.created_date)) },
  importo: { label: "Importo", fn: (a, b) => (Number(b.totale) || 0) - (Number(a.totale) || 0) },
  scadenza: { label: "In scadenza", fn: (a, b) => (expiryDate(a)?.getTime() || Infinity) - (expiryDate(b)?.getTime() || Infinity) },
  cliente: { label: "Cliente A→Z", fn: (a, b) => String(a.cliente_nome || "~").localeCompare(String(b.cliente_nome || "~"), "it") },
};

function StateBadge({ state }) {
  const s = QUOTE_STATES[state] || QUOTE_STATES.in_attesa;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.className}`}>{s.label}</span>;
}

export default function Quotes() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "ricevuti" ? "ricevuti" : "emessi";
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => params.get("q") || "");
  const [stateFilter, setStateFilter] = useState(params.get("stato") || "tutti");
  const [period, setPeriod] = useState("tutti");
  const [clientFilter, setClientFilter] = useState("tutti");
  const [sort, setSort] = useState("data");
  const [templates, setTemplates] = useState([]);
  const [tplDialog, setTplDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [profile, setProfile] = useState(null);
  const [worksites, setWorksites] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const [qs, tpls, profs, sites] = await Promise.all([
        // solo i campi della testata: le righe dei preventivi restano sul server
        db.Quote.fields(["numero", "anno", "revisione", "data", "stato", "cliente_id", "cliente_nome", "oggetto", "imponibile", "iva_totale", "totale", "margine", "validita_giorni", "worksite_id", "worksite_nome", "inviato_a", "visto_il", "data_firma_cliente"], { sort: "-created_date", limit: 5000 }),
        db.SavedTemplate.filter({ tipo: "preventivo" }),
        db.CompanyProfile.list(),
        db.Worksite.list("-created_date", 1000),
      ]);
      setQuotes(qs.map((q) => ({ ...q, _state: effectiveState(q) })));
      setTemplates(tpls);
      setProfile(profs[0]);
      setWorksites(sites);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const clients = useMemo(() => [...new Map(quotes.filter((q) => q.cliente_nome).map((q) => [q.cliente_id || q.cliente_nome, q.cliente_nome])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "it")), [quotes]);

  const inPeriod = useMemo(() => {
    const p = PERIODS[period];
    const from = p.from();
    const to = p.to?.();
    return quotes.filter((q) => {
      const d = new Date(q.data || q.created_date);
      return (!from || d >= from) && (!to || d < to);
    });
  }, [quotes, period]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return inPeriod
      .filter((q) => stateFilter === "tutti" || (stateFilter === "aperti" ? OPEN_STATES.includes(q._state) : q._state === stateFilter))
      .filter((q) => clientFilter === "tutti" || (q.cliente_id || q.cliente_nome) === clientFilter)
      .filter((q) => !s || [q.numero, q.cliente_nome, q.oggetto, q.worksite_nome].join(" ").toLowerCase().includes(s))
      .sort(SORTS[sort].fn);
  }, [inPeriod, stateFilter, clientFilter, search, sort]);

  // Indicatori sul periodo scelto.
  const kpi = useMemo(() => {
    const sum = (arr) => arr.reduce((s, q) => s + (Number(q.totale) || 0), 0);
    const open = inPeriod.filter((q) => OPEN_STATES.includes(q._state));
    const won = inPeriod.filter((q) => q._state === "approvato");
    const lost = inPeriod.filter((q) => q._state === "rifiutato");
    const soon = open.filter((q) => { const e = expiryDate(q); return e && (e - new Date()) / 86_400_000 <= 7; });
    return {
      open: { n: open.length, v: sum(open) }, won: { n: won.length, v: sum(won) },
      rate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
      soon: soon.length, total: { n: inPeriod.length, v: sum(inPeriod) },
    };
  }, [inPeriod]);

  const setFilterState = (s) => { setStateFilter(s); };

  const duplicate = async (row) => {
    try {
      const q = await db.Quote.get(row.id);
      const existing = await db.Quote.fields(["numero", "anno"], { limit: 10000 });
      const { numero, anno } = generateQuoteNumber(profile, existing);
      const { id, created_date, updated_date, created_by, created_by_id, _state, ...rest } = q;
      const created = await db.Quote.create({
        ...rest, numero, anno, data: new Date().toISOString().slice(0, 10), stato: "in_attesa",
        firma_cliente_url: "", data_firma_cliente: "", data_invio: "", inviato_a: "", public_token: null, visto_il: null,
        risposta_cliente: null, revisione: 0, revisioni: [], worksite_id: "", worksite_nome: "",
      });
      toast({ title: "Preventivo duplicato", description: `Nuovo n. ${numero}` });
      navigate(`/preventivi/${created.id}`);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    }
  };

  const exportCsv = () => downloadCsv(`preventivi-${new Date().toISOString().slice(0, 10)}.csv`,
    ["Numero", "Revisione", "Data", "Cliente", "Oggetto", "Imponibile", "IVA", "Totale", "Stato", "Scadenza", "Lavoro", "Inviato a", "Margine"],
    filtered.map((q) => [q.numero, q.revisione || 0, q.data, q.cliente_nome, q.oggetto, (q.imponibile || 0).toFixed(2).replace(".", ","),
      (q.iva_totale || 0).toFixed(2).replace(".", ","), (q.totale || 0).toFixed(2).replace(".", ","), QUOTE_STATES[q._state]?.label,
      expiryDate(q)?.toISOString().slice(0, 10) || "", q.worksite_nome, q.inviato_a, q.margine != null ? Number(q.margine).toFixed(2).replace(".", ",") : ""]));

  const toggleSelect = (id) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const confirmDelete = async () => {
    const ids = deleteTarget?.ids || [];
    setDeleting(true);
    try {
      for (const id of ids) await db.Quote.delete(id);
      toast({ title: ids.length === 1 ? "Preventivo eliminato" : `${ids.length} preventivi eliminati` });
      exitSelect();
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast({ title: "Eliminazione non riuscita", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const activeFilters = [stateFilter !== "tutti", period !== "tutti", clientFilter !== "tutti", !!search].filter(Boolean).length;
  const resetFilters = () => { setStateFilter("tutti"); setPeriod("tutti"); setClientFilter("tutti"); setSearch(""); };

  if (loading) return <LoadingSpinner />;

  const actions = (q) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button onClick={(e) => e.stopPropagation()} aria-label="Azioni" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><MoreHorizontal className="w-4 h-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => navigate(`/preventivi/${q.id}`)}><Eye className="w-4 h-4 mr-2" /> Apri</DropdownMenuItem>
        <DropdownMenuItem onClick={() => duplicate(q)}><Copy className="w-4 h-4 mr-2" /> Duplica</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setDeleteTarget({ ids: [q.id] })} className="text-red-700 focus:text-red-700"><Trash2 className="w-4 h-4 mr-2" /> Elimina</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div>
      <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="font-display text-[28px] sm:text-[34px] leading-none font-bold uppercase tracking-[0.02em] text-zinc-950 border-l-[6px] border-brand-600 pl-3">Preventivi</h1>
          <p className="text-slate-500 mt-1 text-sm">Emessi ai clienti e ricevuti dai fornitori</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.length > 0 && <Button variant="outline" size="sm" onClick={() => setTplDialog(true)} className="gap-1.5"><Bookmark className="w-4 h-4" /> Modelli</Button>}
          <Button variant="outline" size="sm" onClick={() => setImportDialog(true)} className="gap-1.5"><Upload className="w-4 h-4" /> Importa da PDF</Button>
          <Button size="sm" onClick={() => navigate("/preventivi/nuovo")} className="gap-1.5 bg-brand-600 hover:bg-brand-700"><Plus className="w-4 h-4" /> Nuovo preventivo</Button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {[["emessi", "Emessi", FileText], ["ricevuti", "Ricevuti dai fornitori", Inbox]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setParams(k === "emessi" ? {} : { tab: k })}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            <Icon className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>

      {tab === "ricevuti" ? (
        <ReceivedQuotesSection profile={profile} worksites={worksites} />
      ) : (
        <>
          {/* Indicatori */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <button onClick={() => setFilterState("aperti")} className="text-left bg-white rounded-xl border border-slate-200 p-3.5 hover:border-brand-300">
              <p className="text-xs text-slate-500">In attesa di risposta</p>
              <p className="text-lg font-bold text-slate-900 tabular-nums">{fmtEur(kpi.open.v)}</p>
              <p className="text-xs text-slate-500">{kpi.open.n} preventivi</p>
            </button>
            <button onClick={() => setFilterState("approvato")} className="text-left bg-white rounded-xl border border-slate-200 p-3.5 hover:border-brand-300">
              <p className="text-xs text-slate-500">Accettati</p>
              <p className="text-lg font-bold text-emerald-700 tabular-nums">{fmtEur(kpi.won.v)}</p>
              <p className="text-xs text-slate-500">{kpi.won.n} preventivi</p>
            </button>
            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">Tasso di accettazione</p>
              <p className="text-lg font-bold text-slate-900">{kpi.rate === null ? "—" : `${kpi.rate}%`}</p>
              <p className="text-xs text-slate-500">su accettati e rifiutati</p>
            </div>
            <button onClick={() => { setFilterState("aperti"); setSort("scadenza"); }} className="text-left bg-white rounded-xl border border-slate-200 p-3.5 hover:border-brand-300">
              <p className="text-xs text-slate-500">In scadenza entro 7 giorni</p>
              <p className={`text-lg font-bold ${kpi.soon ? "text-amber-700" : "text-slate-900"}`}>{kpi.soon}</p>
              <p className="text-xs text-slate-500">da sollecitare</p>
            </button>
          </div>

          {/* Filtri */}
          <div className="flex flex-col xl:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input placeholder="Cerca per numero, cliente, oggetto, lavoro…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10" aria-label="Cerca preventivi" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:flex gap-2">
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger aria-label="Filtra per stato" className="xl:w-44 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutti">Tutti gli stati</SelectItem>
                  <SelectItem value="aperti">Aperti (senza risposta)</SelectItem>
                  {Object.entries(QUOTE_STATES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger aria-label="Filtra per periodo" className="xl:w-40 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PERIODS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger aria-label="Filtra per cliente" className="xl:w-48 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutti">Tutti i clienti</SelectItem>
                  {clients.map(([k, name]) => <SelectItem key={k} value={k}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger aria-label="Ordina per" className="xl:w-40 h-10"><ArrowUpDown className="w-4 h-4 text-slate-500" /><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SORTS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
            <span className="text-slate-600">{filtered.length} preventivi · <strong className="tabular-nums">{fmtEur(filtered.reduce((s, q) => s + (Number(q.totale) || 0), 0))}</strong></span>
            {activeFilters > 0 && <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-brand-700 hover:underline"><X className="w-3.5 h-3.5" /> Azzera filtri</button>}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={exportCsv} disabled={!filtered.length}><Download className="w-4 h-4" /> Esporta</Button>
            <Button variant={selectMode ? "default" : "ghost"} size="sm" className="gap-1.5" onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}><CheckSquare className="w-4 h-4" /> {selectMode ? "Fine" : "Seleziona"}</Button>
          </div>

          {selectMode && (
            <div className="flex items-center justify-between gap-2 bg-brand-50 border border-brand-200 rounded-lg px-4 py-2 mb-3">
              <span className="text-sm font-medium text-brand-800">{selectedIds.size} selezionati</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((q) => q.id)))}>
                  {selectedIds.size === filtered.length ? "Nessuno" : "Tutti"}
                </Button>
                <Button variant="destructive" size="sm" disabled={!selectedIds.size} onClick={() => setDeleteTarget({ ids: [...selectedIds] })} className="gap-1.5"><Trash2 className="w-4 h-4" /> Elimina</Button>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            activeFilters
              ? <EmptyState icon={Search} title="Nessun preventivo trovato" description="Prova a cambiare o azzerare i filtri." />
              : <EmptyState icon={FileText} title="Nessun preventivo" description="Crea il primo preventivo o importane uno da PDF." actionLabel="Nuovo preventivo" onAction={() => navigate("/preventivi/nuovo")} />
          ) : (
            <>
              <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                      {selectMode && <th className="px-3 py-3 w-10" />}
                      <th className="px-4 py-3">N° / data</th>
                      <th className="px-4 py-3">Cliente e oggetto</th>
                      <th className="px-4 py-3 text-right">Totale</th>
                      <th className="px-4 py-3">Stato</th>
                      <th className="px-4 py-3 hidden lg:table-cell">Scadenza</th>
                      <th className="px-2 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((q) => {
                      const e = expiryDate(q);
                      const days = e ? Math.ceil((e - new Date(new Date().toDateString())) / 86_400_000) : null;
                      return (
                        <tr key={q.id} className={`cursor-pointer ${selectedIds.has(q.id) ? "bg-brand-50" : "hover:bg-slate-50"}`} onClick={() => (selectMode ? toggleSelect(q.id) : navigate(`/preventivi/${q.id}`))} tabIndex={0} onKeyDown={onEnter(() => (selectMode ? toggleSelect(q.id) : navigate(`/preventivi/${q.id}`)))}>
                          {selectMode && <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(q.id)} onChange={() => toggleSelect(q.id)} onClick={(ev) => ev.stopPropagation()} className="w-4 h-4" aria-label={`Seleziona ${q.numero}`} /></td>}
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">{q.numero || "—"}{q.revisione ? <span className="text-xs text-slate-500 font-normal"> · Rev.{q.revisione}</span> : null}</p>
                            <p className="text-xs text-slate-500">{q.data ? new Date(q.data).toLocaleDateString("it-IT") : ""}</p>
                          </td>
                          <td className="px-4 py-3 max-w-[340px]">
                            <p className="text-sm text-slate-900 truncate">{q.cliente_nome || "—"}</p>
                            <p className="text-xs text-slate-500 truncate">{q.oggetto || ""}</p>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900 tabular-nums">{fmtEur(q.totale)}</td>
                          <td className="px-4 py-3"><StateBadge state={q._state} /></td>
                          <td className="px-4 py-3 hidden lg:table-cell text-sm">
                            {e && OPEN_STATES.includes(q._state)
                              ? <span className={days <= 7 ? "text-amber-700 font-medium" : "text-slate-600"}>{days === 0 ? "oggi" : days === 1 ? "domani" : `tra ${days} gg`}</span>
                              : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-2 py-3">{actions(q)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2">
                {filtered.map((q) => (
                  <div key={q.id} className={`bg-white rounded-xl border p-3.5 ${selectedIds.has(q.id) ? "border-brand-400 bg-brand-50" : "border-slate-200"}`} onClick={() => (selectMode ? toggleSelect(q.id) : navigate(`/preventivi/${q.id}`))} role="link" tabIndex={0} onKeyDown={onEnter(() => (selectMode ? toggleSelect(q.id) : navigate(`/preventivi/${q.id}`)))}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{q.cliente_nome || "—"}</p>
                        <p className="text-xs text-slate-500 truncate">{q.numero}{q.revisione ? ` Rev.${q.revisione}` : ""} · {q.oggetto || "senza oggetto"}</p>
                      </div>
                      <StateBadge state={q._state} />
                      {actions(q)}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-slate-500">{q.data ? new Date(q.data).toLocaleDateString("it-IT") : ""}</span>
                      <span className="text-base font-bold text-slate-900 tabular-nums">{fmtEur(q.totale)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Dialog open={tplDialog} onOpenChange={setTplDialog}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modelli di preventivo</DialogTitle>
            <DialogDescription>Parti da un preventivo già impostato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{tpl.nome}</p>
                  <p className="text-xs text-slate-500 truncate">{tpl.oggetto ? `${tpl.oggetto} · ` : ""}{tpl.righe?.length || 0} voci</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button asChild size="sm"><Link to={`/preventivi/nuovo?template=${tpl.id}`} onClick={() => setTplDialog(false)}>Usa</Link></Button>
                  <Button size="icon" variant="ghost" aria-label="Elimina modello" onClick={async () => { if (confirm("Eliminare questo modello?")) { await db.SavedTemplate.delete(tpl.id); load(); } }}><Trash2 className="w-4 h-4 text-red-700" /></Button>
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
        title={deleteTarget?.ids.length > 1 ? `Elimina ${deleteTarget.ids.length} preventivi` : "Elimina preventivo"}
        description="L'eliminazione è definitiva. Se il preventivo è già stato inviato, valuta di segnarlo come rifiutato invece di eliminarlo."
        confirmLabel={deleting ? "Eliminazione…" : "Elimina"}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
