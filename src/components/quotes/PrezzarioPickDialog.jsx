import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, Loader2, Check } from "lucide-react";
import { searchVoci, rowFromVoce } from "@/lib/prezzari";
import { fmtEur } from "@/lib/quotes";

// Cerca nelle voci dei prezzari scelti e aggiunge al preventivo quelle spuntate.
export default function PrezzarioPickDialog({ open, onOpenChange, prezzari, defaultIva, onAdd }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Map());

  useEffect(() => { if (open) { setQuery(""); setResults(null); setSelected(new Map()); } }, [open]);
  const byId = Object.fromEntries(prezzari.map((p) => [p.id, p]));

  const run = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try { setResults(await searchVoci(query, prezzari.map((p) => p.id), 80)); } finally { setBusy(false); }
  };
  const toggle = (v) => setSelected((m) => { const n = new Map(m); n.has(v.id) ? n.delete(v.id) : n.set(v.id, v); return n; });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Aggiungi dal prezzario</DialogTitle>
          <DialogDescription>{prezzari.map((p) => p.nome).join(" · ")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={run} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="es. tramezzo forato, pittura lavabile, codice voce" className="pl-8" />
          </div>
          <Button type="submit" disabled={busy || !query.trim()} className="bg-blue-600 hover:bg-blue-700">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cerca"}</Button>
        </form>
        <div className="flex-1 overflow-y-auto -mx-2 min-h-[200px]">
          {results?.length === 0 && <p className="text-sm text-slate-500 p-4">Nessuna voce trovata. Prova con meno parole o con un sinonimo.</p>}
          {results?.map((v) => {
            const on = selected.has(v.id);
            return (
              <button key={v.id} onClick={() => toggle(v)} className={`w-full text-left flex gap-3 px-3 py-2.5 rounded-lg ${on ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                <span className={`mt-0.5 w-5 h-5 rounded border grid place-items-center shrink-0 ${on ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300"}`}>{on && <Check className="w-3.5 h-3.5" />}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-slate-500"><span className="font-mono text-slate-700">{v.codice || "—"}</span> · {byId[v.prezzario_id]?.nome}</span>
                  <span className="block text-sm text-slate-800 line-clamp-3">{v.descrizione}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-sm font-semibold tabular-nums">{fmtEur(v.prezzo)}</span>
                  <span className="block text-xs text-slate-500">{v.unita_misura}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <span className="text-sm text-slate-600">{selected.size} selezionate</span>
          <Button disabled={!selected.size} onClick={() => { onAdd([...selected.values()].map((v) => rowFromVoce(v, byId[v.prezzario_id], defaultIva))); onOpenChange(false); }} className="bg-blue-600 hover:bg-blue-700">Aggiungi al preventivo</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
