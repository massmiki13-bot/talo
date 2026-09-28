import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Euro, CalendarClock, Wand2, Bell, Loader2 } from "lucide-react";
import { installments, INSTALLMENT_STATE, fmtDate } from "@/lib/worksites";
import { fmtEur } from "@/lib/quotes";

const METODI = ["Bonifico", "Contanti", "Assegno", "Ri.Ba.", "Carta", "Altro"];
const today = () => new Date().toISOString().slice(0, 10);

// Incassi del lavoro: piano delle rate (acconto, SAL, saldo) e pagamenti ricevuti.
export default function WorksiteMoney({ worksite, contractAmount, onSaved, onPaymentsChange, readOnly }) {
  const { toast } = useToast();
  const [payments, setPayments] = useState([]);
  const [payOpen, setPayOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [pay, setPay] = useState({ importo: "", data: today(), tipo: "acconto", metodo: "Bonifico", note: "" });

  const load = async () => {
    const list = await db.WorksitePayment.filter({ worksite_id: worksite.id }, "-data");
    setPayments(list);
    onPaymentsChange?.(list);
  };
  useEffect(() => { load(); }, [worksite.id]);

  const incassato = payments.reduce((s, p) => s + (Number(p.importo) || 0), 0);
  const residuo = Math.max(0, contractAmount - incassato);
  const pct = contractAmount ? Math.min(100, (incassato / contractAmount) * 100) : 0;
  const rate = useMemo(() => installments(worksite.piano_pagamenti || [], payments), [worksite.piano_pagamenti, payments]);
  const pianificato = rate.reduce((s, r) => s + (Number(r.importo) || 0), 0);

  const savePayment = async () => {
    const importo = Number(String(pay.importo).replace(",", "."));
    if (!importo || !pay.data) return toast({ title: "Importo e data sono obbligatori", variant: "destructive" });
    await db.WorksitePayment.create({ ...pay, importo, worksite_id: worksite.id, worksite_nome: worksite.nome, cliente_id: worksite.cliente_id || "", cliente_nome: worksite.cliente_nome || "" });
    const tot = incassato + importo;
    const stato = contractAmount && tot >= contractAmount - 0.005 ? "saldato" : tot > 0 ? "parziale" : "non_pagato";
    const saved = await db.Worksite.update(worksite.id, { stato_pagamento: stato });
    onSaved?.(saved);
    setPayOpen(false);
    setPay({ importo: "", data: today(), tipo: "acconto", metodo: "Bonifico", note: "" });
    toast({ title: "Incasso registrato" });
    load();
  };

  const removePayment = async (p) => {
    if (!confirm(`Eliminare l'incasso di ${fmtEur(p.importo)} del ${fmtDate(p.data)}?`)) return;
    await db.WorksitePayment.delete(p.id);
    load();
  };

  const openPayForInstallment = (r) => {
    setPay({ importo: String(r.residuo.toFixed(2)), data: today(), tipo: /saldo/i.test(r.descrizione) ? "saldo" : "acconto", metodo: "Bonifico", note: r.descrizione });
    setPayOpen(true);
  };

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 flex-1"><Euro className="w-4 h-4 text-emerald-600" /> Incassi</h3>
          {!readOnly && <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setPayOpen(true)}><Plus className="w-4 h-4" /> Registra incasso</Button>}
        </div>
        {contractAmount > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-3 text-center mb-2">
              <div><p className="text-xs text-slate-500">Contratto</p><p className="text-base font-bold tabular-nums">{fmtEur(contractAmount)}</p></div>
              <div><p className="text-xs text-slate-500">Incassato</p><p className="text-base font-bold text-emerald-700 tabular-nums">{fmtEur(incassato)}</p></div>
              <div><p className="text-xs text-slate-500">Da incassare</p><p className={`text-base font-bold tabular-nums ${residuo > 0 ? "text-red-700" : "text-slate-900"}`}>{fmtEur(residuo)}</p></div>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
            <p className="text-xs text-slate-500 mt-1">{Math.round(pct)}% incassato</p>
          </>
        ) : <p className="text-sm text-slate-500">Imposta l'importo del contratto nei dati del lavoro per seguire gli incassi.</p>}

        {payments.length > 0 && (
          <ul className="divide-y divide-slate-100 mt-3">
            {payments.map((p) => (
              <li key={p.id} className="py-2 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${p.tipo === "saldo" ? "bg-emerald-500" : "bg-brand-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900">{fmtEur(p.importo)} · {p.tipo === "saldo" ? "Saldo" : p.tipo === "sal" ? "SAL" : "Acconto"}</p>
                  <p className="text-xs text-slate-500 truncate">{fmtDate(p.data)}{p.metodo ? ` · ${p.metodo}` : ""}{p.note ? ` · ${p.note}` : ""}</p>
                </div>
                {!readOnly && <button aria-label="Elimina incasso" onClick={() => removePayment(p)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 flex-1"><CalendarClock className="w-4 h-4 text-brand-600" /> Piano pagamenti</h3>
          {!readOnly && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPlanOpen(true)}>{rate.length ? "Modifica" : <><Plus className="w-4 h-4" /> Imposta rate</>}</Button>}
        </div>
        {rate.length ? (
          <>
            <ul className="divide-y divide-slate-100">
              {rate.map((r, i) => (
                <li key={i} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900">{r.descrizione}</p>
                    <p className="text-xs text-slate-500">{r.scadenza ? `entro il ${fmtDate(r.scadenza)}` : "senza scadenza"}{r.pagato > 0 && r.residuo > 0.005 ? ` · pagati ${fmtEur(r.pagato)}` : ""}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{fmtEur(r.importo)}</span>
                  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${INSTALLMENT_STATE[r.stato].className}`}>{INSTALLMENT_STATE[r.stato].label}</span>
                  {!readOnly && r.residuo > 0.005 && <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-700" onClick={() => openPayForInstallment(r)}>Incassa</Button>}
                </li>
              ))}
            </ul>
            {contractAmount > 0 && Math.abs(pianificato - contractAmount) > 1 && (
              <p className="text-xs text-amber-800 mt-2">Il piano copre {fmtEur(pianificato)} su un contratto di {fmtEur(contractAmount)}.</p>
            )}
          </>
        ) : <p className="text-sm text-slate-500">Definisci acconto, SAL e saldo con le scadenze: Talo ti ricorda quando incassare e segnala le rate scadute.</p>}
      </section>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registra incasso</DialogTitle><DialogDescription>{worksite.nome}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Importo €</Label><Input className="mt-1" type="number" inputMode="decimal" step="0.01" value={pay.importo} onChange={(e) => setPay({ ...pay, importo: e.target.value })} autoFocus /></div>
              <div><Label>Data</Label><Input className="mt-1" type="date" value={pay.data} onChange={(e) => setPay({ ...pay, data: e.target.value })} /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={pay.tipo} onValueChange={(v) => setPay({ ...pay, tipo: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="acconto">Acconto</SelectItem><SelectItem value="sal">SAL</SelectItem><SelectItem value="saldo">Saldo</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Metodo</Label>
                <Select value={pay.metodo} onValueChange={(v) => setPay({ ...pay, metodo: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{METODI.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Note</Label><Input className="mt-1" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayOpen(false)}>Annulla</Button>
              <Button onClick={savePayment} className="bg-emerald-600 hover:bg-emerald-700">Registra</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PlanDialog open={planOpen} onOpenChange={setPlanOpen} worksite={worksite} contractAmount={contractAmount} onSaved={onSaved} />
    </div>
  );
}

function PlanDialog({ open, onOpenChange, worksite, contractAmount, onSaved }) {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [remind, setRemind] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setRows((worksite.piano_pagamenti || []).map((r) => ({ ...r }))); }, [open]);

  const preset = (kind) => {
    const t = contractAmount || 0;
    const start = worksite.data_inizio || today();
    const end = worksite.data_fine_prevista || start;
    const plus = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };
    const r2 = (v) => Math.round(v * 100) / 100;
    if (kind === "30-70") setRows([{ descrizione: "Acconto 30% all'accettazione", importo: r2(t * 0.3), scadenza: start }, { descrizione: "Saldo a fine lavori", importo: r2(t * 0.7), scadenza: plus(end, 30) }]);
    if (kind === "sal") setRows([{ descrizione: "Acconto 20%", importo: r2(t * 0.2), scadenza: start }, { descrizione: "SAL al 50%", importo: r2(t * 0.3), scadenza: plus(start, Math.max(15, Math.round((new Date(end) - new Date(start)) / 172_800_000))) }, { descrizione: "SAL al 90%", importo: r2(t * 0.4), scadenza: end }, { descrizione: "Saldo a collaudo", importo: r2(t * 0.1), scadenza: plus(end, 30) }]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const clean = rows.filter((r) => r.descrizione || Number(r.importo)).map((r) => ({ ...r, importo: Number(String(r.importo).replace(",", ".")) || 0 }));
      const saved = await db.Worksite.update(worksite.id, { piano_pagamenti: clean });
      // Un promemoria per ogni rata futura (il giorno della scadenza).
      if (remind) {
        for (const r of clean.filter((x) => x.scadenza && x.scadenza >= today())) {
          await db.Reminder.create({
            titolo: `Incassare: ${r.descrizione} – ${worksite.nome}`,
            descrizione: `${worksite.cliente_nome ? `Cliente: ${worksite.cliente_nome}\n` : ""}Importo: ${fmtEur(r.importo)}`,
            data: r.scadenza, tipo: "incasso", completato: false, is_preavviso: false, riferimento_id: worksite.id, riferimento_tipo: "Worksite",
          }).catch(() => {});
        }
      }
      onSaved?.(saved);
      toast({ title: "Piano pagamenti salvato", description: remind ? "Promemoria creati per le rate." : undefined });
      onOpenChange(false);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const tot = rows.reduce((s, r) => s + (Number(r.importo) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Piano pagamenti</DialogTitle><DialogDescription>Rate concordate con il cliente{contractAmount ? ` su ${fmtEur(contractAmount)}` : ""}.</DialogDescription></DialogHeader>
        {contractAmount > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => preset("30-70")}><Wand2 className="w-4 h-4" /> 30% acconto + saldo</Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => preset("sal")}><Wand2 className="w-4 h-4" /> Acconto, 2 SAL e saldo</Button>
          </div>
        )}
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_140px_32px] gap-2 items-center">
              <Input aria-label="Descrizione" value={r.descrizione || ""} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, descrizione: e.target.value } : y)))} placeholder="Es. Acconto" className="h-9" />
              <Input aria-label="Importo" type="number" step="0.01" value={r.importo ?? ""} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, importo: e.target.value } : y)))} className="h-9 tabular-nums" />
              <Input aria-label="Scadenza" type="date" value={r.scadenza || ""} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, scadenza: e.target.value } : y)))} className="h-9" />
              <button aria-label="Rimuovi rata" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setRows((x) => [...x, { descrizione: "", importo: "", scadenza: "" }])}><Plus className="w-4 h-4" /> Rata</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Totale rate: <strong className="tabular-nums">{fmtEur(tot)}</strong></span>
          {contractAmount > 0 && Math.abs(tot - contractAmount) > 1 && <span className="text-amber-800">differenza {fmtEur(contractAmount - tot)}</span>}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={remind} onChange={(e) => setRemind(e.target.checked)} /> <Bell className="w-4 h-4 text-brand-600" /> Crea un promemoria per ogni scadenza</label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Salva piano</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
