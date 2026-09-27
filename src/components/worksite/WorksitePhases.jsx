import React, { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, ListChecks, Wand2, Receipt, Loader2 } from "lucide-react";
import { FASI_TIPO, progress, fmtDate } from "@/lib/worksites";
import { fmtEur } from "@/lib/quotes";

// Fasi del lavoro con avanzamento pesato e SAL (stato avanzamento lavori).
export default function WorksitePhases({ worksite, contractAmount, onSaved, readOnly }) {
  const { toast } = useToast();
  const [fasi, setFasi] = useState(worksite.fasi || []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setFasi(worksite.fasi || []); setDirty(false); }, [worksite.id, worksite.updated_date]);

  const update = (i, patch) => { setFasi((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const pct = progress(fasi);
  const pesoTot = fasi.reduce((s, f) => s + (Number(f.peso) || 0), 0);

  const save = async (next = fasi, extra = {}) => {
    setSaving(true);
    try {
      const saved = await db.Worksite.update(worksite.id, { fasi: next, avanzamento: progress(next), ...extra });
      setDirty(false);
      onSaved?.(saved);
      return saved;
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
      return null;
    } finally {
      setSaving(false);
    }
  };

  // SAL: l'importo maturato dall'ultimo SAL diventa una rata del piano pagamenti.
  const emitSal = async () => {
    if (!contractAmount) return toast({ title: "Imposta prima l'importo del contratto", variant: "destructive" });
    const already = (worksite.piano_pagamenti || []).filter((r) => r.sal).reduce((s, r) => s + (Number(r.importo) || 0), 0);
    const maturato = Math.round(contractAmount * (pct / 100) * 100) / 100;
    const importo = Math.round((maturato - already) * 100) / 100;
    if (importo <= 0) return toast({ title: "Nessun nuovo importo maturato", description: `Avanzamento ${pct}%: i SAL già emessi coprono ${fmtEur(already)}.` });
    const n = (worksite.piano_pagamenti || []).filter((r) => r.sal).length + 1;
    const scadenza = new Date(); scadenza.setDate(scadenza.getDate() + 30);
    if (!confirm(`Emettere il SAL n. ${n} al ${pct}% per ${fmtEur(importo)}? Verrà aggiunto al piano pagamenti con scadenza a 30 giorni.`)) return;
    const rata = { descrizione: `SAL n. ${n} – avanzamento ${pct}%`, importo, scadenza: scadenza.toISOString().slice(0, 10), sal: true, emesso_il: new Date().toISOString().slice(0, 10) };
    const saved = await save(fasi, { piano_pagamenti: [...(worksite.piano_pagamenti || []), rata] });
    if (saved) toast({ title: `SAL n. ${n} emesso`, description: `${fmtEur(importo)} nel piano pagamenti.` });
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 flex-1"><ListChecks className="w-4 h-4 text-blue-600" /> Fasi e avanzamento</h3>
        {!readOnly && fasi.length > 0 && <Button size="sm" variant="outline" className="gap-1.5" onClick={emitSal} disabled={saving}><Receipt className="w-4 h-4" /> Emetti SAL</Button>}
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Avanzamento complessivo</span><strong className="tabular-nums">{pct}%</strong></div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} /></div>
        {contractAmount > 0 && <p className="text-xs text-slate-500 mt-1">Lavori maturati: {fmtEur(contractAmount * pct / 100)} su {fmtEur(contractAmount)}</p>}
      </div>

      {fasi.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-slate-500 mb-3">Dividi il lavoro in fasi per seguire l'avanzamento e fatturare a stati di avanzamento (SAL).</p>
          {!readOnly && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setFasi(FASI_TIPO.map((f) => ({ ...f, completamento: 0 }))); setDirty(true); }}><Wand2 className="w-4 h-4" /> Usa fasi tipo</Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setFasi([{ nome: "", peso: 10, completamento: 0 }]); setDirty(true); }}><Plus className="w-4 h-4" /> Fase vuota</Button>
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {fasi.map((f, i) => (
            <li key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <Input value={f.nome} onChange={(e) => update(i, { nome: e.target.value })} disabled={readOnly} placeholder="Nome della fase" className="h-8 flex-1" aria-label="Nome fase" />
                <label className="text-xs text-slate-600 flex items-center gap-1 shrink-0">Peso
                  <Input type="number" min="0" value={f.peso ?? ""} onChange={(e) => update(i, { peso: Number(e.target.value) || 0 })} disabled={readOnly} className="h-8 w-16" aria-label="Peso della fase" />
                </label>
                {!readOnly && <button aria-label="Elimina fase" onClick={() => { setFasi((x) => x.filter((_, j) => j !== i)); setDirty(true); }} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <input type="range" min="0" max="100" step="5" value={Number(f.completamento) || 0} onChange={(e) => update(i, { completamento: Number(e.target.value) })} disabled={readOnly}
                  className="flex-1 accent-blue-600" aria-label={`Completamento ${f.nome}`} />
                <span className={`text-sm font-semibold tabular-nums w-12 text-right ${Number(f.completamento) >= 100 ? "text-emerald-700" : "text-slate-800"}`}>{Number(f.completamento) || 0}%</span>
                <Input type="date" value={f.data_prevista || ""} onChange={(e) => update(i, { data_prevista: e.target.value })} disabled={readOnly} className="h-8 w-36" aria-label="Data prevista" title="Data prevista di fine fase" />
              </div>
              {f.data_prevista && Number(f.completamento) < 100 && new Date(f.data_prevista) < new Date(new Date().toDateString()) && (
                <p className="text-xs text-red-700 mt-1">In ritardo: prevista entro il {fmtDate(f.data_prevista)}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && fasi.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => { setFasi((x) => [...x, { nome: "", peso: 10, completamento: 0 }]); setDirty(true); }}><Plus className="w-4 h-4" /> Fase</Button>
          <span className="text-xs text-slate-500">Somma pesi: {pesoTot}</span>
          <div className="flex-1" />
          {dirty && <Button size="sm" onClick={() => save().then((s) => s && toast({ title: "Avanzamento salvato" }))} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Salva avanzamento</Button>}
        </div>
      )}
    </section>
  );
}
