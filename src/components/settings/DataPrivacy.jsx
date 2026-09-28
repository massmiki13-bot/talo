import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Download, Loader2, ShieldCheck, Trash2, FileText, Lock, AlertTriangle } from "lucide-react";
import { buildExport } from "@/lib/dataExport";
import BackupExport from "@/components/shared/BackupExport";

const CONFIRM = "ELIMINA DEFINITIVAMENTE";

export default function DataPrivacy({ profile }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const exportAll = async () => {
    setBusy("Preparo l'esportazione…");
    try {
      const blob = await buildExport({ onProgress: setBusy });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Talo_${(profile?.ragione_sociale || "azienda").replace(/\W+/g, "_")}_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast({ title: "Esportazione pronta", description: "Archivio ZIP con tutti i dati e i documenti." });
    } catch (e) {
      toast({ title: "Esportazione non riuscita", description: e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await api.functions.invoke("account", { action: "delete", confirm });
      if (res.data?.error) throw new Error(res.data.error);
      await api.auth.logout("/login");
    } catch (e) {
      toast({ title: "Eliminazione non riuscita", description: e.message, variant: "destructive" });
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-brand-600" />Come proteggiamo i tuoi dati</h2>
        <ul className="mt-4 grid sm:grid-cols-2 gap-3 text-sm text-zinc-700">
          <li className="flex gap-2"><Lock className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />Documenti del personale, contratti, fatture e documenti ditta sono in un archivio privato: si aprono solo dall'app, con link che scadono dopo 10 minuti.</li>
          <li className="flex gap-2"><Lock className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />Ogni azienda vede solo i propri dati; i collaboratori solo le sezioni che autorizzi, gli operai solo i propri documenti.</li>
          <li className="flex gap-2"><Lock className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />Le password delle caselle email sono conservate separatamente e non tornano mai nell'app.</li>
          <li className="flex gap-2"><Lock className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />Collegamenti sempre cifrati e copie di sicurezza del database.</li>
        </ul>
        <div className="flex flex-wrap gap-3 mt-5 text-sm">
          {[["privacy", "Informativa privacy"], ["termini", "Termini di servizio"], ["accordo-trattamento-dati", "Accordo sul trattamento dei dati (art. 28 GDPR)"]].map(([s, l]) => (
            <Link key={s} to={`/legal/${s}`} target="_blank" className="inline-flex items-center gap-1.5 text-brand-700 hover:underline"><FileText className="w-4 h-4" />{l}</Link>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-zinc-900">Esporta tutti i dati</h2>
        <p className="text-sm text-zinc-500 mt-1">Un unico archivio ZIP con tutti i dati (in JSON e in CSV per Excel) e tutti i documenti caricati. Utile come copia di sicurezza, per il commercialista o se decidi di lasciare Talo.</p>
        <Button onClick={exportAll} disabled={!!busy} className="mt-4 bg-brand-600 hover:bg-brand-700 gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {busy || "Scarica archivio completo"}
        </Button>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-zinc-600 hover:text-zinc-900">Solo le tabelle principali in CSV</summary>
          <div className="[&>div]:mt-3 [&>div]:border-0 [&>div]:p-0"><BackupExport /></div>
        </details>
      </section>

      <section className="bg-white rounded-2xl border border-red-200 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-red-800 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Elimina l'account dell'azienda</h2>
        <p className="text-sm text-zinc-600 mt-1">Cancella per sempre tutti i dati, i documenti e gli accessi dei collaboratori. Non si può annullare: scarica prima l'archivio completo.</p>
        <Button variant="outline" onClick={() => { setConfirm(""); setDelOpen(true); }} className="mt-4 gap-2 text-red-700 border-red-300 hover:bg-red-50"><Trash2 className="w-4 h-4" /> Elimina account e dati</Button>
      </section>

      <Dialog open={delOpen} onOpenChange={(v) => !deleting && setDelOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-800">Eliminare tutto?</DialogTitle>
            <DialogDescription>Verranno cancellati per sempre i dati di {profile?.ragione_sociale || "questa azienda"}, tutti i documenti e l'account del titolare. I collaboratori perderanno l'accesso.</DialogDescription>
          </DialogHeader>
          <label htmlFor="del-confirm" className="text-sm text-zinc-700">Per confermare scrivi <b>{CONFIRM}</b></label>
          <Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDelOpen(false)} disabled={deleting}>Annulla</Button>
            <Button onClick={deleteAccount} disabled={deleting || confirm.trim().toUpperCase() !== CONFIRM} className="bg-red-700 hover:bg-red-800 text-white gap-2">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Elimina per sempre
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
