import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Euro, TrendingUp, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { formatEuro } from "@/utils/pdfUtils";

export default function WorksitePayments({ worksite, quote }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ importo: 0, data: new Date().toISOString().slice(0, 10), tipo: "acconto", metodo: "", note: "" });
  const { toast } = useToast();

  useEffect(() => { load(); }, [worksite?.id]);

  const load = async () => {
    if (!worksite) return;
    try {
      setPayments(await db.WorksitePayment.filter({ worksite_id: worksite.id }, "-data"));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const totaleContratto = worksite?.importo_totale || quote?.totale || 0;
  const totalePagato = useMemo(() => payments.reduce((s, p) => s + (p.importo || 0), 0), [payments]);
  const rimanente = totaleContratto - totalePagato;
  const percentuale = totaleContratto > 0 ? Math.min(100, (totalePagato / totaleContratto) * 100) : 0;
  const stato = totaleContratto > 0
    ? (totalePagato >= totaleContratto ? "saldato" : totalePagato > 0 ? "parziale" : "non_pagato")
    : "non_pagato";

  const statiConfig = {
    non_pagato: { label: "Da incassare", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", icon: AlertCircle, bar: "bg-red-500" },
    parziale: { label: "Pagamento parziale", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: Clock, bar: "bg-amber-500" },
    saldato: { label: "Saldato", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2, bar: "bg-emerald-500" },
  };
  const cfg = statiConfig[stato];

  const handleSave = async () => {
    if (!form.importo || !form.data) { toast({ title: "Importo e data obbligatori", variant: "destructive" }); return; }
    try {
      await db.WorksitePayment.create({
        ...form,
        worksite_id: worksite.id,
        worksite_nome: worksite.nome || "",
        cliente_id: worksite.cliente_id || "",
        cliente_nome: worksite.cliente_nome || "",
      });
      const newStato = (totalePagato + form.importo) >= totaleContratto ? "saldato" : (totalePagato + form.importo) > 0 ? "parziale" : "non_pagato";
      if (newStato !== worksite.stato_pagamento) {
        await db.Worksite.update(worksite.id, { stato_pagamento: newStato });
      }
      setDialogOpen(false);
      setForm({ importo: 0, data: new Date().toISOString().slice(0, 10), tipo: "acconto", metodo: "", note: "" });
      load();
      toast({ title: "Pagamento registrato" });
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const handleDelete = async (payId) => {
    if (!confirm("Eliminare questo pagamento?")) return;
    await db.WorksitePayment.delete(payId);
    load();
  };

  if (loading) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Euro className="w-4 h-4 text-emerald-600" /> <span className="truncate">Pagamenti e Incassi</span>
        </h3>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 h-9 flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Registra</span><span className="sm:hidden">+</span>
        </Button>
      </div>

      {/* Payment status bar */}
      {totaleContratto > 0 ? (
        <div className={`rounded-lg border p-4 mb-4 ${cfg.bg} ${cfg.border}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
              <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
            </div>
            <span className="text-xs text-slate-500">{percentuale.toFixed(0)}% incassato</span>
          </div>
          <div className="w-full bg-white rounded-full h-2 mb-3 overflow-hidden">
            <div className={`h-full ${cfg.bar} transition-all duration-500`} style={{ width: `${percentuale}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Contratto</p>
              <p className="text-sm font-bold text-slate-700">{formatEuro(totaleContratto)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Incassato</p>
              <p className="text-sm font-bold text-emerald-600">{formatEuro(totalePagato)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Da incassare</p>
              <p className="text-sm font-bold text-red-600">{formatEuro(rimanente)}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-slate-500">Imposta l'importo totale del lavoro per tracciare i pagamenti.
            {quote?.totale && <button onClick={() => db.Worksite.update(worksite.id, { importo_totale: quote.totale }).then(() => window.location.reload())} className="text-blue-600 font-medium ml-1">Usa totale preventivo ({formatEuro(quote.totale)})</button>}
          </p>
        </div>
      )}

      {/* Payment list */}
      {payments.length > 0 && (
        <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${p.tipo === "acconto" ? "bg-blue-400" : "bg-emerald-400"}`} />
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {p.tipo === "acconto" ? "Acconto" : "Saldo"} · {formatEuro(p.importo)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(p.data).toLocaleDateString("it-IT")}
                    {p.metodo && ` · ${p.metodo}`}
                  </p>
                </div>
              </div>
              <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registra Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="acconto">Acconto</SelectItem>
                    <SelectItem value="saldo">Saldo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Importo (€)</Label>
                <Input type="number" step="0.01" value={form.importo} onChange={e => setForm({ ...form, importo: parseFloat(e.target.value) || 0 })} className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className="h-10" />
              </div>
              <div>
                <Label>Metodo (opz.)</Label>
                <Input value={form.metodo} onChange={e => setForm({ ...form, metodo: e.target.value })} placeholder="Bonifico, contanti..." className="h-10" />
              </div>
            </div>
            <div>
              <Label>Note (opz.)</Label>
              <Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="h-10" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">Salva</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}