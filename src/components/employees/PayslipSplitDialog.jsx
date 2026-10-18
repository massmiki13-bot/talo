import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Loader2, Sparkles, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { fullName } from "@/lib/employees";
import { analyzePayslips, savePayslips, periodLabel } from "@/lib/payslips";

/** Caricamento del PDF unico delle buste paga: l'IA le divide per dipendente, si controlla e si salva. */
export default function PayslipSplitDialog({ open, onOpenChange, employees, onDone }) {
  const { toast } = useToast();
  const [phase, setPhase] = useState("pick"); // pick | reading | review | saving
  const [res, setRes] = useState(null);
  const [groups, setGroups] = useState([]);
  const [saved, setSaved] = useState(0);
  const [over, setOver] = useState(false);
  const [prog, setProg] = useState(null);
  useEffect(() => { if (open) { setPhase("pick"); setRes(null); setGroups([]); setSaved(0); } }, [open]);

  const read = async (file) => {
    if (!file) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return toast({ title: "Serve il PDF delle buste paga", variant: "destructive" });
    setPhase("reading");
    try {
      const r = await analyzePayslips(file, employees, (d, t) => setProg({ d, t }));
      if (!r.groups.length) throw new Error("Non ho trovato buste paga in questo PDF.");
      setRes(r); setGroups(r.groups); setPhase("review");
    } catch (e) { toast({ title: "PDF non letto", description: e.message, variant: "destructive" }); setPhase("pick"); }
  };
  const ok = groups.filter((g) => g.employeeId).length;
  const save = async () => {
    setPhase("saving");
    try {
      await savePayslips(res.pdf, groups, employees, setSaved);
      toast({ title: `${ok} buste paga consegnate`, description: "Ogni operaio vede solo la sua nell'app, in Altro → Documenti." });
      onDone?.(); onOpenChange(false);
    } catch (e) { toast({ title: "Salvataggio interrotto", description: e.message, variant: "destructive" }); setPhase("review"); }
  };

  const busy = phase === "reading" || phase === "saving";
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buste paga del mese</DialogTitle>
          <DialogDescription>Carica il PDF unico che ti manda il consulente: l'IA riconosce di chi è ogni busta, la separa e la consegna solo al dipendente giusto.</DialogDescription>
        </DialogHeader>

        {phase === "pick" && (
          <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files?.[0]); }}
            className={`block rounded-xl border-2 border-dashed py-10 text-center cursor-pointer transition-colors ${over ? "border-brand-500 bg-brand-50/60" : "border-zinc-300 hover:border-brand-500 hover:bg-brand-50/40"}`}>
            <Upload className="w-8 h-8 mx-auto text-zinc-500" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-zinc-800">Trascina qui il PDF delle buste paga o tocca per sceglierlo</p>
            <p className="text-xs text-zinc-500">Anche con decine di dipendenti e buste su più pagine</p>
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}

        {phase === "reading" && <div className="py-10 text-center"><Loader2 className="w-7 h-7 animate-spin text-brand-600 mx-auto" /><p className="text-sm text-zinc-600 mt-2 flex items-center justify-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-500" /> L'IA sta leggendo le buste paga…{prog?.t > 1 ? ` ${prog.d}/${prog.t}` : ""}</p></div>}

        {(phase === "review" || phase === "saving") && (
          <div className="space-y-3">
            <p className={`text-sm flex items-center gap-1.5 ${ok === groups.length ? "text-emerald-800" : "text-amber-900"}`}>
              {ok === groups.length ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {groups.length} buste trovate in {res.n} pagine · {ok} assegnate{ok < groups.length ? ` · ${groups.length - ok} da assegnare a mano (o lasciare fuori)` : ""}
            </p>
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {groups.map((g, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <FileText className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-sm font-medium text-zinc-900">{g.nominativo || "—"}</p>
                    <p className="text-xs text-zinc-500">pag. {g.pagine.join(", ")}{periodLabel(g) ? ` · ${periodLabel(g)}` : ""}</p>
                  </div>
                  <Select value={g.employeeId || "none"} onValueChange={(v) => setGroups((l) => l.map((x, j) => (j === i ? { ...x, employeeId: v === "none" ? "" : v } : x)))} disabled={phase === "saving"}>
                    <SelectTrigger className={`w-[220px] h-9 ${g.employeeId ? "" : "border-amber-400"}`} aria-label={`Dipendente per ${g.nominativo}`}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Non assegnare</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{fullName(e)}</SelectItem>)}</SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPhase("pick")} disabled={phase === "saving"}>Cambia file</Button>
              <Button onClick={save} disabled={!ok || phase === "saving"} className="bg-brand-600 hover:bg-brand-700 gap-1.5">
                {phase === "saving" ? <><Loader2 className="w-4 h-4 animate-spin" /> {saved}/{ok}</> : <><Upload className="w-4 h-4" /> Consegna {ok} buste paga</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
