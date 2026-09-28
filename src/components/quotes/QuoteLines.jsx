import React, { useEffect, useState } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Sparkles, MoreVertical, ArrowUp, ArrowDown, Copy, BookmarkPlus, Heading, AlignLeft, BookOpen, Eye, EyeOff, BookOpenCheck, Loader2, Euro } from "lucide-react";
import AutoTextarea from "@/components/shared/AutoTextarea";
import PriceListDialog from "./PriceListDialog";
import PrezzarioPickDialog from "./PrezzarioPickDialog";
import { activePrezzari, aiPriceFor, mapUnit } from "@/lib/prezzari";
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
  const [prezzari, setPrezzari] = useState([]);
  const [source, setSource] = useState("all"); // "all" o id di un prezzario
  const [pickOpen, setPickOpen] = useState(false);
  const [pricing, setPricing] = useState(null); // indice riga oppure { done, total }
  useEffect(() => { activePrezzari().then((l) => { setPrezzari(l); const d = l.find((x) => x.predefinito); if (d && l.length > 1) setSource("all"); }).catch(() => {}); }, []);
  const usedPrezzari = source === "all" ? prezzari : prezzari.filter((p) => p.id === source);

  // Prezzo di una riga dal prezzario scelto: l'IA individua la voce corrispondente.
  const priceFromPrezzario = async (i, silent = false) => {
    const r = righe[i];
    if (!r?.descrizione?.trim() || !usedPrezzari.length) return false;
    const res = await aiPriceFor(r.descrizione, r.unita_misura, usedPrezzari);
    if (!res) { if (!silent) toast({ title: "Nessuna voce adatta nel prezzario", description: "Prova a descrivere la lavorazione con più dettagli." }); return false; }
    const um = mapUnit(res.voce.unita_misura);
    update(i, {
      prezzo_unitario: res.prezzo, ...(um && (!r.unita_misura || r.unita_misura === "cad") ? { unita_misura: um } : {}),
      fonte_prezzo: { prezzario: res.prezzario?.nome || "", codice: res.voce.codice || "", prezzo_base: res.voce.prezzo, um: res.voce.unita_misura || "", affidabilita: res.affidabilita, voce: res.voce.descrizione.slice(0, 300) },
    });
    if (!silent) toast({ title: `Prezzo ${fmtEur(res.prezzo)} da ${res.prezzario?.nome || "prezzario"}`, description: `Voce ${res.voce.codice || ""} · affidabilità ${res.affidabilita}` });
    return true;
  };
  const priceOne = async (i) => { setPricing(i); try { await priceFromPrezzario(i); } catch (e) { toast({ title: e.message || "IA non disponibile", variant: "destructive" }); } finally { setPricing(null); } };
  const priceAll = async () => {
    const todo = righe.map((r, i) => (isVoce(r) && r.descrizione?.trim() && !(Number(r.prezzo_unitario) > 0) ? i : -1)).filter((i) => i >= 0);
    if (!todo.length) { toast({ title: "Tutte le voci hanno già un prezzo" }); return; }
    let ok = 0;
    for (let k = 0; k < todo.length; k++) {
      setPricing({ done: k, total: todo.length });
      try { if (await priceFromPrezzario(todo[k], true)) ok++; } catch { /* continua con le altre */ }
    }
    setPricing(null);
    toast({ title: `Prezzate ${ok} voci su ${todo.length}`, description: ok < todo.length ? "Per le altre non c'era una voce adatta nel prezzario." : "Controlla i prezzi prima di inviare." });
  };
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
                  <Sparkles className={`w-4 h-4 ${aiIndex === i ? "animate-pulse text-brand-600" : "text-slate-400"}`} />
                </Button>
                {prezzari.length > 0 && (
                  <Button type="button" size="icon" variant="ghost" onClick={() => priceOne(i)} disabled={pricing != null || !r.descrizione?.trim()} title="Prezzo dal prezzario (IA)" aria-label="Prezzo dal prezzario" className="shrink-0">
                    {pricing === i ? <Loader2 className="w-4 h-4 animate-spin text-brand-600" /> : <Euro className="w-4 h-4 text-slate-400" />}
                  </Button>
                )}
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
              {r.fonte_prezzo?.prezzario && (
                <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1" title={r.fonte_prezzo.voce || ""}>
                  <BookOpenCheck className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                  <span className="truncate">{r.fonte_prezzo.prezzario}{r.fonte_prezzo.codice ? ` · voce ${r.fonte_prezzo.codice}` : ""} · {fmtEur(r.fonte_prezzo.prezzo_base)}{r.fonte_prezzo.um ? `/${r.fonte_prezzo.um}` : ""}{r.fonte_prezzo.affidabilita && r.fonte_prezzo.affidabilita !== "alta" ? ` · corrispondenza ${r.fonte_prezzo.affidabilita}` : ""}</span>
                </p>
              )}
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
        {prezzari.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => setPickOpen(true)} className="gap-1.5"><BookOpenCheck className="w-4 h-4" /> Dal prezzario</Button>}
      </div>

      {prezzari.length > 0 && (
        <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/60 p-2.5 flex flex-wrap items-center gap-2">
          <BookOpenCheck className="w-4 h-4 text-brand-700" />
          <span className="text-sm text-slate-800">Prezzi da</span>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-8 w-auto min-w-[200px] bg-white text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i prezzari attivi</SelectItem>
              {prezzari.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}{p.predefinito ? " (predefinito)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" onClick={priceAll} disabled={pricing != null} className="ml-auto bg-brand-600 hover:bg-brand-700 gap-1.5">
            {pricing && typeof pricing === "object" ? <><Loader2 className="w-4 h-4 animate-spin" /> {pricing.done}/{pricing.total}</> : <><Sparkles className="w-4 h-4" /> Prezza le voci senza prezzo</>}
          </Button>
        </div>
      )}

      <PrezzarioPickDialog open={pickOpen} onOpenChange={setPickOpen} prezzari={usedPrezzari} defaultIva={defaultIva} onAdd={(rows) => setRighe((prev) => [...prev, ...rows])} />
      <PriceListDialog open={listOpen} onOpenChange={setListOpen} showCosts={showCosts} onAdd={(rows) => setRighe((prev) => [...prev, ...rows])} />
    </section>
  );
}
