import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Search, Plus, Trash2, Loader2, Check, BookOpen } from "lucide-react";
import { UNIT_OPTIONS, fmtEur } from "@/lib/quotes";

// Listino delle voci ricorrenti: si cerca, si spunta, si aggiunge al preventivo.
export default function PriceListDialog({ open, onOpenChange, onAdd, showCosts }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [category, setCategory] = useState("");

  const load = async () => {
    setLoading(true);
    try { setItems(await db.PriceItem.list("-utilizzi", 2000)); } finally { setLoading(false); }
  };
  useEffect(() => { if (open) { setSelected(new Set()); setSearch(""); load(); } }, [open]);

  const categories = useMemo(() => [...new Set(items.map((i) => i.categoria).filter(Boolean))].sort(), [items]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => (!category || i.categoria === category) && (!q || [i.descrizione, i.codice, i.categoria].join(" ").toLowerCase().includes(q)));
  }, [items, search, category]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const add = async () => {
    const chosen = items.filter((i) => selected.has(i.id));
    onAdd(chosen.map((i) => ({
      tipo: "voce", descrizione: i.descrizione, unita_misura: i.unita_misura || "cad", quantita: 1,
      prezzo_unitario: Number(i.prezzo_unitario) || 0, sconto: 0, iva_percentuale: i.iva_percentuale ?? 22,
      costo_unitario: i.costo_unitario ?? null, opzionale: false, listino_id: i.id,
    })));
    onOpenChange(false);
    // Le voci più usate salgono in cima alla lista.
    for (const i of chosen) db.PriceItem.update(i.id, { utilizzi: (Number(i.utilizzi) || 0) + 1 }).catch(() => {});
  };

  const remove = async (i) => {
    if (!confirm(`Togliere "${i.descrizione.slice(0, 60)}" dal listino?`)) return;
    await db.PriceItem.delete(i.id);
    setItems((prev) => prev.filter((x) => x.id !== i.id));
    toast({ title: "Voce rimossa dal listino" });
  };

  const unitLabel = (u) => UNIT_OPTIONS.find((x) => x.value === u)?.label || u;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-blue-600" /> Listino voci</DialogTitle>
          <DialogDescription>Le voci che usi spesso, con prezzo e unità di misura. Per aggiungerne una: nel preventivo, menu della riga → "Salva nel listino".</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca nel listino…" className="pl-9" autoFocus aria-label="Cerca nel listino" />
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(category === c ? "" : c)} className={`rounded-full border px-2.5 py-0.5 text-xs ${category === c ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{c}</button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-[200px] rounded-lg border border-slate-200">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10 px-6">{items.length ? "Nessuna voce trovata." : "Il listino è vuoto. Salva qui le voci che ripeti spesso dal menu di ogni riga del preventivo."}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((i) => (
                <li key={i.id} className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer ${selected.has(i.id) ? "bg-blue-50" : "hover:bg-slate-50"}`} onClick={() => toggle(i.id)}>
                  <span className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${selected.has(i.id) ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                    {selected.has(i.id) && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 line-clamp-2">{i.descrizione}</p>
                    <p className="text-xs text-slate-600">{[i.categoria, i.codice].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-slate-900 tabular-nums">{fmtEur(i.prezzo_unitario)}<span className="text-xs text-slate-500">/{unitLabel(i.unita_misura)}</span></p>
                    {showCosts && i.costo_unitario != null && <p className="text-xs text-slate-600">costo {fmtEur(i.costo_unitario)}</p>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); remove(i); }} aria-label="Rimuovi dal listino" className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
          <Button onClick={add} disabled={!selected.size} className="gap-1.5"><Plus className="w-4 h-4" /> Aggiungi {selected.size || ""} {selected.size === 1 ? "voce" : "voci"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
