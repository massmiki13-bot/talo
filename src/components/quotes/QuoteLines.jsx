import React, { useState } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Sparkles, MoreVertical, ArrowUp, ArrowDown, Copy, BookmarkPlus, Heading, AlignLeft, BookOpen, Eye, EyeOff } from "lucide-react";
import AutoTextarea from "@/components/shared/AutoTextarea";
import PriceListDialog from "./PriceListDialog";
import { UNIT_OPTIONS, emptyRow, chapterRow, textRow, rowTotal, rowCost, isVoce, chapterTotals, fmtEur } from "@/lib/quotes";

const num = (v) => (v === "" ? "" : Number(String(v).replace(",", ".")));

function NumberInput({ value, onChange, label, className = "", step = "any" }) {
  return (
    <div className={className}>
      <label className="text-[11px] text-slate-500">{label}</label>
      <Input type="number" inputMode="decimal" step={step} value={value ?? ""} onChange={(e) => onChange(num(e.target.value))} className="h-9 mt-0.5 tabular-nums" />
    </div>
  );
}

export default function QuoteLines({ righe, setRighe, defaultIva = 22, showCosts, setShowCosts }) {
  const { toast } = useToast();
  const [aiIndex, setAiIndex] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const chapters = chapterTotals(righe);

  const update = (i, patch) => setRighe((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = (row) => setRighe((prev) => [...prev, row]);
  const insertAfter = (i, row) => setRighe((prev) => [...prev.slice(0, i + 1), row, ...prev.slice(i + 1)]);
  const remove = (i) => setRighe((prev) => prev.filter((_, j) => j !== i));
  const move = (i, d) => setRighe((prev) => {
    const j = i + d;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const improve = async (i) => {
    const r = righe[i];
    if (!r.descrizione?.trim()) return;
    setAiIndex(i);
    try {
      const result = await api.integrations.Core.InvokeLLM({
        prompt: `Sei un esperto del settore edile e impiantistico italiano. Riscrivi questa voce di preventivo come voce di capitolato: linguaggio tecnico corretto, chiaro per il cliente, senza prezzi né quantità. Voce originale: "${r.descrizione}". Rispondi solo con la descrizione riscritta.`,
      });
      update(i, { descrizione: String(result).trim() });
    } catch (e) {
      toast({ title: e.message || "Errore dell'assistente AI", variant: "destructive" });
    } finally {
      setAiIndex(null);
    }
  };

  const saveToList = async (r) => {
    if (!r.descrizione?.trim()) return toast({ title: "Scrivi prima la descrizione", variant: "destructive" });
    await db.PriceItem.create({
      descrizione: r.descrizione.trim(), unita_misura: r.unita_misura, prezzo_unitario: Number(r.prezzo_unitario) || 0,
      costo_unitario: r.costo_unitario === "" || r.costo_unitario == null ? null : Number(r.costo_unitario),
      iva_percentuale: Number(r.iva_percentuale) || 0, utilizzi: 0,
    });
    toast({ title: "Voce salvata nel listino" });
  };

  const rowMenu = (r, i) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="Azioni riga" className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><MoreVertical className="w-4 h-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="w-4 h-4 mr-2" /> Sposta su</DropdownMenuItem>
        <DropdownMenuItem onClick={() => move(i, 1)} disabled={i === righe.length - 1}><ArrowDown className="w-4 h-4 mr-2" /> Sposta giù</DropdownMenuItem>
        <DropdownMenuItem onClick={() => insertAfter(i, { ...r })}><Copy className="w-4 h-4 mr-2" /> Duplica</DropdownMenuItem>
        {isVoce(r) && (
          <>
            <DropdownMenuItem onClick={() => update(i, { opzionale: !r.opzionale })}>{r.opzionale ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}{r.opzionale ? "Includi nel totale" : "Rendi opzionale"}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => saveToList(r)}><BookmarkPlus className="w-4 h-4 mr-2" /> Salva nel listino</DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => remove(i)} className="text-red-600 focus:text-red-700"><Trash2 className="w-4 h-4 mr-2" /> Elimina</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  let chapterIndex = -1;

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide flex-1">Voci del preventivo</h2>
        <button type="button" onClick={() => setShowCosts(!showCosts)} className={`text-xs rounded-full px-2.5 py-1 border ${showCosts ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          {showCosts ? "Costi interni visibili" : "Mostra costi e margine"}
        </button>
      </div>

      {righe.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">Nessuna voce. Aggiungi una voce, un capitolo o pesca dal listino.</p>}

      <div className="space-y-2">
        {righe.map((r, i) => {
          if (r.tipo === "capitolo") {
            chapterIndex++;
            const tot = chapters[chapterIndex]?.totale || 0;
            return (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 mt-3 first:mt-0">
                <Heading className="w-4 h-4 text-slate-300 shrink-0" />
                <Input value={r.descrizione} onChange={(e) => update(i, { descrizione: e.target.value })} placeholder="Titolo capitolo (es. Demolizioni)" aria-label="Titolo capitolo"
                  className="h-8 bg-transparent border-0 text-white placeholder:text-slate-400 font-semibold uppercase tracking-wide focus-visible:ring-1 focus-visible:ring-slate-500" />
                <span className="text-sm text-slate-200 tabular-nums shrink-0">{fmtEur(tot)}</span>
                <div className="[&_button]:text-slate-300 [&_button:hover]:bg-slate-700">{rowMenu(r, i)}</div>
              </div>
            );
          }
          if (r.tipo === "testo") {
            return (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2">
                <AlignLeft className="w-4 h-4 text-slate-400 mt-2 shrink-0" />
                <AutoTextarea value={r.descrizione} onChange={(e) => update(i, { descrizione: e.target.value })} placeholder="Testo descrittivo (senza prezzo)" className="flex-1 border-0 shadow-none px-0 focus-visible:ring-0" />
                {rowMenu(r, i)}
              </div>
            );
          }
          const total = rowTotal(r);
          const cost = rowCost(r);
          return (
            <div key={i} className={`rounded-lg border p-3 ${r.opzionale ? "border-dashed border-slate-300 bg-slate-50/60" : "border-slate-200"}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {r.opzionale && <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-slate-600 bg-slate-200 rounded px-1.5 py-0.5 mb-1">Opzionale · non nel totale</span>}
                  <AutoTextarea value={r.descrizione} onChange={(e) => update(i, { descrizione: e.target.value })} placeholder="Descrizione della voce…" aria-label="Descrizione" />
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => improve(i)} disabled={aiIndex === i || !r.descrizione?.trim()} title="Riscrivi come voce di capitolato" aria-label="Migliora con AI" className="shrink-0">
                  <Sparkles className={`w-4 h-4 ${aiIndex === i ? "animate-pulse text-blue-600" : "text-slate-400"}`} />
                </Button>
                {rowMenu(r, i)}
              </div>
              <div className={`grid grid-cols-3 sm:grid-cols-6 ${showCosts ? "lg:grid-cols-8" : "lg:grid-cols-7"} gap-2 mt-2 items-end`}>
                <div>
                  <label className="text-[11px] text-slate-500">U.M.</label>
                  <Select value={r.unita_misura || "cad"} onValueChange={(v) => update(i, { unita_misura: v })}>
                    <SelectTrigger className="h-9 mt-0.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.value} value={u.value} title={u.tooltip}>{u.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <NumberInput label="Quantità" value={r.quantita} onChange={(v) => update(i, { quantita: v })} />
                <NumberInput label="Prezzo unit. €" value={r.prezzo_unitario} onChange={(v) => update(i, { prezzo_unitario: v })} step="0.01" className="col-span-1 lg:col-span-2" />
                <NumberInput label="Sconto %" value={r.sconto} onChange={(v) => update(i, { sconto: v })} />
                <div>
                  <label className="text-[11px] text-slate-500">IVA</label>
                  <Select value={String(r.iva_percentuale ?? defaultIva)} onValueChange={(v) => update(i, { iva_percentuale: Number(v) })}>
                    <SelectTrigger className="h-9 mt-0.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{[22, 10, 5, 4, 0].map((a) => <SelectItem key={a} value={String(a)}>{a}%</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {showCosts && <NumberInput label="Costo unit. €" value={r.costo_unitario} onChange={(v) => update(i, { costo_unitario: v })} step="0.01" />}
                <div className="text-right col-span-3 sm:col-span-6 lg:col-span-1">
                  <p className="text-[11px] text-slate-500">Totale</p>
                  <p className={`text-sm font-semibold tabular-nums py-2 ${r.opzionale ? "text-slate-500" : "text-slate-900"}`}>{fmtEur(total)}</p>
                </div>
              </div>
              {showCosts && cost !== null && (
                <p className={`text-xs mt-1 text-right ${total - cost < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  Margine {fmtEur(total - cost)}{total ? ` (${Math.round(((total - cost) / total) * 100)}%)` : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <Button type="button" size="sm" onClick={() => add(emptyRow(defaultIva))} className="gap-1.5"><Plus className="w-4 h-4" /> Voce</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => add(chapterRow())} className="gap-1.5"><Heading className="w-4 h-4" /> Capitolo</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => add(textRow())} className="gap-1.5"><AlignLeft className="w-4 h-4" /> Testo</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setListOpen(true)} className="gap-1.5"><BookOpen className="w-4 h-4" /> Dal listino</Button>
      </div>

      <PriceListDialog open={listOpen} onOpenChange={setListOpen} showCosts={showCosts} onAdd={(rows) => setRighe((prev) => [...prev, ...rows])} />
    </section>
  );
}
