import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { FolderOpen, Plus, Search, X, Download, MoreHorizontal, Trash2, MapPin, CalendarDays, AlertTriangle, HardHat, ArrowUpDown } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";
import WorksiteForm from "@/components/worksite/WorksiteForm";
import { WORKSITE_STATES, laborFromAttendance, economics, installments, fmtDate } from "@/lib/worksites";
import { fmtEur } from "@/lib/quotes";
import { fullName } from "@/lib/employees";
import { downloadCsv } from "@/lib/csv";

const SORTS = {
  recenti: { label: "Più recenti", fn: (a, b) => String(b.created_date).localeCompare(String(a.created_date)) },
  fine: { label: "Fine prevista", fn: (a, b) => String(a.data_fine_prevista || "9999").localeCompare(String(b.data_fine_prevista || "9999")) },
  margine: { label: "Margine più basso", fn: (a, b) => a._econ.margineReale - b._econ.margineReale },
  incassare: { label: "Da incassare", fn: (a, b) => b._residuo - a._residuo },
  nome: { label: "Nome A→Z", fn: (a, b) => String(a.nome).localeCompare(String(b.nome), "it") },
};

export default function Worksites() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [raw, setRaw] = useState(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("attivi");
  const [capo, setCapo] = useState("tutti");
  const [sort, setSort] = useState("recenti");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const [sites, txs, pays, att, emps, quotes] = await Promise.all([
        db.Worksite.list("-created_date", 2000),
        db.WorksiteTransaction.list("-data", 20000).catch(() => []),
        db.WorksitePayment.list("-data", 20000).catch(() => []),
        db.DailyAttendance.list("-data", 20000).catch(() => []),
        db.Employee.list("cognome", 2000).catch(() => []),
        db.Quote.list("-created_date", 5000).catch(() => []),
      ]);
      setRaw({ sites, txs, pays, att, emps, quotes });
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
      setRaw({ sites: [], txs: [], pays: [], att: [], emps: [], quotes: [] });
    }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    if (!raw) return [];
    const group = (list, key) => { const m = new Map(); for (const x of list) { if (!m.has(x[key])) m.set(x[key], []); m.get(x[key]).push(x); } return m; };
    const txBy = group(raw.txs, "worksite_id");
    const payBy = group(raw.pays, "worksite_id");
    const quoteById = new Map(raw.quotes.map((q) => [q.id, q]));
    return raw.sites.map((w) => {
      const q = quoteById.get(w.preventivo_id);
      const labor = laborFromAttendance(raw.att, raw.emps, w.id);
      const econ = economics({ worksite: w, transactions: txBy.get(w.id) || [], labor, quoteTotal: q?.totale });
      const pays = payBy.get(w.id) || [];
      const incassato = pays.reduce((s, p) => s + (Number(p.importo) || 0), 0);
      const rate = installments(w.piano_pagamenti || [], pays);
      const late = w.stato !== "finito" && w.data_fine_prevista && new Date(w.data_fine_prevista) < new Date(new Date().toDateString());
      return {
        ...w,
        _econ: econ,
        _incassato: incassato,
        _residuo: Math.max(0, econ.ricavo - incassato),
        _rateScadute: rate.filter((r) => r.stato === "scaduta").length,
        _late: late,
        _capo: raw.emps.find((e) => e.id === w.responsabile_id),
      };
    });
  }, [raw]);

  const capi = useMemo(() => [...new Map(rows.filter((r) => r._capo).map((r) => [r._capo.id, r._capo])).values()], [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((w) => state === "tutti" || (state === "attivi" ? w.stato !== "finito" : state === "perdita" ? w._econ.margineReale < 0 && w._econ.costi > 0 : state === "ritardo" ? w._late : w.stato === state))
      .filter((w) => capo === "tutti" || w.responsabile_id === capo)
      .filter((w) => !q || [w.nome, w.cliente_nome, w.indirizzo, w.tipo_intervento].join(" ").toLowerCase().includes(q))
      .sort(SORTS[sort].fn);
  }, [rows, state, capo, search, sort]);

  const kpi = useMemo(() => {
    const active = rows.filter((w) => w.stato !== "finito");
    return {
      inCorso: rows.filter((w) => w.stato === "in_corso").length,
      valore: active.reduce((s, w) => s + w._econ.ricavo, 0),
      daIncassare: rows.reduce((s, w) => s + w._residuo, 0),
      perdita: rows.filter((w) => w._econ.margineReale < 0 && w._econ.costi > 0).length,
      ritardo: rows.filter((w) => w._late).length,
    };
  }, [rows]);

  const exportCsv = () => downloadCsv(`lavori-${new Date().toISOString().slice(0, 10)}.csv`,
    ["Lavoro", "Cliente", "Stato", "Avanzamento %", "Inizio", "Fine prevista", "Contratto", "Costi", "Margine", "Incassato", "Da incassare", "Capocantiere"],
    filtered.map((w) => [w.nome, w.cliente_nome, WORKSITE_STATES[w.stato]?.label, w.avanzamento || 0, w.data_inizio, w.data_fine_prevista,
      w._econ.ricavo.toFixed(2).replace(".", ","), w._econ.costi.toFixed(2).replace(".", ","), w._econ.margineReale.toFixed(2).replace(".", ","),
      w._incassato.toFixed(2).replace(".", ","), w._residuo.toFixed(2).replace(".", ","), w._capo ? fullName(w._capo) : ""]));

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await db.Worksite.delete(deleteTarget.id);
      toast({ title: "Lavoro eliminato" });
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  if (!raw) return <LoadingSpinner />;

  return (
    <div>
      <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Lavori</h1>
          <p className="text-slate-500 mt-1 text-sm">Cantieri, avanzamento, costi, incassi e giornale dei lavori</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={!filtered.length}><Download className="w-4 h-4" /> Esporta</Button>
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => setFormOpen(true)}><Plus className="w-4 h-4" /> Nuovo lavoro</Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <button onClick={() => setState("in_corso")} className="text-left bg-white rounded-xl border border-slate-200 p-3.5 hover:border-blue-300">
            <p className="text-xs text-slate-500">In corso</p><p className="text-lg font-bold text-slate-900">{kpi.inCorso}</p><p className="text-xs text-slate-500">{fmtEur(kpi.valore)} di lavori aperti</p>
          </button>
          <button onClick={() => setSort("incassare")} className="text-left bg-white rounded-xl border border-slate-200 p-3.5 hover:border-blue-300">
            <p className="text-xs text-slate-500">Da incassare</p><p className="text-lg font-bold text-slate-900 tabular-nums">{fmtEur(kpi.daIncassare)}</p><p className="text-xs text-slate-500">su tutti i lavori</p>
          </button>
          <button onClick={() => setState("perdita")} className="text-left bg-white rounded-xl border border-slate-200 p-3.5 hover:border-blue-300">
            <p className="text-xs text-slate-500">In perdita</p><p className={`text-lg font-bold ${kpi.perdita ? "text-red-700" : "text-slate-900"}`}>{kpi.perdita}</p><p className="text-xs text-slate-500">costi oltre il contratto</p>
          </button>
          <button onClick={() => setState("ritardo")} className="text-left bg-white rounded-xl border border-slate-200 p-3.5 hover:border-blue-300">
            <p className="text-xs text-slate-500">In ritardo</p><p className={`text-lg font-bold ${kpi.ritardo ? "text-amber-700" : "text-slate-900"}`}>{kpi.ritardo}</p><p className="text-xs text-slate-500">oltre la fine prevista</p>
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Cerca per lavoro, cliente, indirizzo…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10" aria-label="Cerca lavori" />
          {search && <button onClick={() => setSearch("")} aria-label="Cancella ricerca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100"><X className="w-3.5 h-3.5 text-slate-500" /></button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:flex gap-2">
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="lg:w-44 h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="attivi">Non finiti</SelectItem>
              <SelectItem value="tutti">Tutti</SelectItem>
              {Object.entries(WORKSITE_STATES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              <SelectItem value="perdita">In perdita</SelectItem>
              <SelectItem value="ritardo">In ritardo</SelectItem>
            </SelectContent>
          </Select>
          {capi.length > 0 && (
            <Select value={capo} onValueChange={setCapo}>
              <SelectTrigger className="lg:w-48 h-10"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="tutti">Tutti i capocantiere</SelectItem>{capi.map((c) => <SelectItem key={c.id} value={c.id}>{fullName(c)}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="lg:w-44 h-10"><ArrowUpDown className="w-4 h-4 text-slate-500" /><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(SORTS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        rows.length
          ? <EmptyState icon={Search} title="Nessun lavoro trovato" description="Cambia i filtri o cerca un altro nome." />
          : <EmptyState icon={FolderOpen} title="Nessun lavoro" description="Crea un lavoro, oppure accetta un preventivo e crealo con un click." actionLabel="Nuovo lavoro" onAction={() => setFormOpen(true)} />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((w) => {
            const st = WORKSITE_STATES[w.stato] || WORKSITE_STATES.da_iniziare;
            const loss = w._econ.margineReale < 0 && w._econ.costi > 0;
            return (
              <div key={w.id} onClick={() => navigate(`/lavori/${w.id}`)} className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 truncate">{w.nome}</h3>
                    <p className="text-xs text-slate-500 truncate">{w.cliente_nome || "Senza cliente"}{w.tipo_intervento ? ` · ${w.tipo_intervento}` : ""}</p>
                  </div>
                  <span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 shrink-0 ${st.className}`}>{st.label}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button onClick={(e) => e.stopPropagation()} aria-label="Azioni" className="p-1 rounded hover:bg-slate-100 text-slate-500"><MoreHorizontal className="w-4 h-4" /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => setDeleteTarget(w)} className="text-red-600 focus:text-red-700"><Trash2 className="w-4 h-4 mr-2" /> Elimina</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-600 mb-1"><span>Avanzamento</span><span className="tabular-nums">{w.avanzamento || 0}%</span></div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${w.avanzamento || 0}%` }} /></div>
                </div>

                <dl className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Contratto</dt><dd className="text-sm font-semibold tabular-nums">{w._econ.ricavo ? fmtEur(w._econ.ricavo) : "—"}</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Margine</dt><dd className={`text-sm font-semibold tabular-nums ${loss ? "text-red-700" : "text-emerald-700"}`}>{w._econ.costi || w._econ.ricavo ? fmtEur(w._econ.margineReale) : "—"}</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Da incassare</dt><dd className="text-sm font-semibold tabular-nums">{w._econ.ricavo ? fmtEur(w._residuo) : "—"}</dd></div>
                </dl>

                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                  {w.indirizzo && <span className="flex items-center gap-1 truncate max-w-full"><MapPin className="w-3.5 h-3.5 shrink-0" />{w.indirizzo}</span>}
                  {w.data_fine_prevista && <span className={`flex items-center gap-1 ${w._late ? "text-amber-800 font-medium" : ""}`}><CalendarDays className="w-3.5 h-3.5" />fine {fmtDate(w.data_fine_prevista)}</span>}
                  {w._capo && <span className="flex items-center gap-1"><HardHat className="w-3.5 h-3.5" />{fullName(w._capo)}</span>}
                </div>
                {(loss || w._rateScadute > 0 || w._econ.sforamenti.length > 0) && (
                  <p className="mt-2 text-xs text-red-800 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />
                    {[loss && "in perdita", w._rateScadute > 0 && `${w._rateScadute} rate scadute`, w._econ.sforamenti.length > 0 && "budget superato"].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <WorksiteForm open={formOpen} onOpenChange={setFormOpen} onSaved={(w) => { if (w?.id) navigate(`/lavori/${w.id}`); }} />
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="Elimina lavoro"
        description={`Eliminare "${deleteTarget?.nome}"? Movimenti, foto e presenze collegate restano nell'archivio ma non saranno più associate a un lavoro.`}
        confirmLabel={deleting ? "Eliminazione…" : "Elimina"}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
