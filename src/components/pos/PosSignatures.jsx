import React, { useMemo, useState } from "react";
import { confirmDialog } from "@/components/shared/ConfirmHost";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Smartphone, RefreshCw, CheckCircle2, Clock, Loader2, Link2Off } from "lucide-react";
import SignRequestDialog from "@/components/shared/SignRequestDialog";
import { posSigners, signUrl, fmtDateTime } from "@/lib/signing";
import { randomToken } from "@/lib/quotes";

// Presa visione del POS firmata dal telefono da lavoratori, preposto, RLS e RSPP.
export default function PosSignatures({ plan, dati, revisione, onChange }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");

  const signers = useMemo(() => posSigners({ dati }), [dati]);
  const rev = Number(revisione) || 0;
  const signed = (plan.firme_raccolte || []).filter((f) => f.revisione === rev);
  const oldCount = (plan.firme_raccolte || []).filter((f) => f.revisione !== rev).length;
  const done = signers.filter((s) => signed.some((f) => f.firmatario_id === s.id)).length;

  const run = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { toast({ title: "Operazione non riuscita", description: e.message, variant: "destructive" }); } finally { setBusy(""); } };
  const start = () => run("link", async () => {
    if (!plan.firma_token) onChange(await db.SafetyPlan.update(plan.id, { firma_token: randomToken() }));
    setOpen(true);
  });
  const refresh = () => run("refresh", async () => onChange(await db.SafetyPlan.get(plan.id)));
  const revoke = async () => (await confirmDialog("Revocare il link? Chi non ha ancora firmato non potrà più farlo.")) && run("link", async () => onChange(await db.SafetyPlan.update(plan.id, { firma_token: null })));

  return (
    <div className="rounded-xl border border-slate-200 p-4 mt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900 flex items-center gap-2"><Smartphone className="w-4 h-4 text-brand-600" />Presa visione dal telefono</p>
          <p className="text-sm text-slate-500 mt-0.5">Lavoratori, preposto, RLS e RSPP firmano con il dito la revisione {rev}. Le firme entrano nel PDF come registro di presa visione.</p>
        </div>
        <div className="flex gap-2">
          {plan.firma_token && <Button size="sm" variant="ghost" onClick={refresh} disabled={!!busy} aria-label="Aggiorna le firme">{busy === "refresh" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</Button>}
          {plan.firma_token && <Button size="sm" variant="ghost" onClick={revoke} disabled={!!busy} aria-label="Revoca il link di firma"><Link2Off className="w-4 h-4" /></Button>}
          <Button size="sm" onClick={start} disabled={!!busy || !signers.length} className="gap-1.5 bg-brand-600 hover:bg-brand-700">{busy === "link" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}{plan.firma_token ? "Mostra QR" : "Raccogli firme"}</Button>
        </div>
      </div>

      {signers.length === 0 ? (
        <p className="text-sm text-amber-800 mt-3">Aggiungi lavoratori e figure della sicurezza (sezioni 1 e 3) per raccogliere le firme.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 mt-4">
            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${(done / signers.length) * 100}%` }} /></div>
            <span className="text-sm font-medium tabular-nums text-slate-700">{done}/{signers.length}</span>
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {signers.map((s) => {
              const f = signed.find((x) => x.firmatario_id === s.id);
              return (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-900 truncate">{s.nome}</span><span className="block text-xs text-slate-500">{s.ruolo}</span></span>
                  {f ? (
                    <>
                      <img src={f.firma} alt={`Firma di ${f.nome}`} className="h-8 w-20 object-contain" />
                      <span className="text-xs text-emerald-700 flex items-center gap-1 shrink-0"><CheckCircle2 className="w-3.5 h-3.5" />{fmtDateTime(f.data)}</span>
                    </>
                  ) : <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0"><Clock className="w-3.5 h-3.5" />da firmare</span>}
                </li>
              );
            })}
          </ul>
          {oldCount > 0 && <p className="text-xs text-slate-500 mt-2">{oldCount} firme appartengono a revisioni precedenti e restano archiviate.</p>}
        </>
      )}

      {plan.firma_token && (
        <SignRequestDialog open={open} onOpenChange={setOpen} url={signUrl(plan.firma_token)} title={`${plan.titolo} · rev. ${rev}`}
          message={`Ciao, prima di entrare in cantiere leggi il POS "${plan.titolo}" e firma la presa visione:`} />
      )}
    </div>
  );
}
