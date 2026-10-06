import React, { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Sparkles, Loader2, Folder, FileText, ArrowRight, RotateCcw } from "lucide-react";
import { proposeOrganization } from "@/lib/documentsAi";
import { ensurePath, pathLabel } from "@/lib/documents";

// Riorganizzazione dell'intero archivio: l'IA propone, l'utente rivede e conferma.
export default function AiOrganizeDialog({ open, onOpenChange, documents, folders, onApplied }) {
  const { toast } = useToast();
  const [phase, setPhase] = useState("setup"); // setup | working | review | applying
  const [scope, setScope] = useState("unfiled"); // unfiled | all
  const [mode, setMode] = useState("merge"); // merge | fresh
  const [proposal, setProposal] = useState(null);
  const [edits, setEdits] = useState({});
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (open) { setPhase("setup"); setProposal(null); setEdits({}); setScope(documents.some((d) => !d.cartella_id) ? "unfiled" : "all"); setMode("merge"); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = useMemo(() => (scope === "all" ? documents : documents.filter((d) => !d.cartella_id)), [scope, documents]);

  const run = async () => {
    if (!target.length) return;
    setPhase("working");
    try {
      const p = await proposeOrganization(target, folders, { mode });
      if (!p.assegnazioni.length) throw new Error("vuota");
      setProposal(p);
      setPhase("review");
    } catch (e) {
      console.error(e);
      toast({ title: "L'IA non è riuscita a proporre un ordine", description: "Riprova tra qualche istante.", variant: "destructive" });
      setPhase("setup");
    }
  };

  const rows = useMemo(() => {
    if (!proposal) return [];
    return proposal.assegnazioni.map((a) => {
      const doc = documents.find((d) => d.id === a.id);
      const now = doc?.cartella_id ? pathLabel(doc.cartella_id, folders).replace(/ \/ /g, "/") : "";
      return { ...a, cartella: edits[a.id] ?? a.cartella, doc, now };
    }).filter((r) => r.doc);
  }, [proposal, edits, documents, folders]);

  const changes = rows.filter((r) => r.cartella && r.cartella !== r.now);
  const tree = useMemo(() => {
    const counts = {};
    for (const r of rows) {
      const parts = r.cartella.split("/");
      for (let k = 1; k <= parts.length; k++) { const p = parts.slice(0, k).join("/"); counts[p] = (counts[p] || 0) + (k === parts.length ? 1 : 0); }
    }
    return Object.keys(counts).sort((a, b) => a.localeCompare(b, "it")).map((p) => ({ path: p, depth: p.split("/").length - 1, name: p.split("/").pop(), n: counts[p] }));
  }, [rows]);

  const apply = async () => {
    setPhase("applying");
    setProgress(0);
    setTotal(changes.length);
    let list = [...folders];
    const cache = {};
    try {
      for (let i = 0; i < changes.length; i++) {
        const r = changes[i];
        if (!cache[r.cartella]) {
          const res = await ensurePath(r.cartella, list, db);
          list = res.folders; cache[r.cartella] = res.folderId;
        }
        const fid = cache[r.cartella];
        await db.CompanyDocument.update(r.id, { cartella_id: fid, cartella_nome: list.find((f) => f.id === fid)?.nome || "" });
        setProgress(i + 1);
      }
      toast({ title: "Archivio riordinato", description: `${changes.length} documenti spostati.` });
      onApplied?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ title: "Errore durante lo spostamento", description: `${progress} documenti già spostati.`, variant: "destructive" });
      onApplied?.();
      setPhase("review");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => phase !== "applying" && onOpenChange(v)}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-brand-600" /> Organizza l'archivio con l'IA</DialogTitle>
          <DialogDescription>L'IA propone cartelle e sottocartelle e dove mettere ogni documento. Niente viene spostato finché non confermi.</DialogDescription>
        </DialogHeader>

        {phase === "setup" && (
          <div className="space-y-5 mt-2">
            <div>
              <p className="text-sm font-medium text-zinc-700 mb-2">Quali documenti</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <Choice active={scope === "unfiled"} onClick={() => setScope("unfiled")} title="Solo da archiviare" text={`${documents.filter((d) => !d.cartella_id).length} documenti senza cartella`} />
                <Choice active={scope === "all"} onClick={() => setScope("all")} title="Tutto l'archivio" text={`${documents.length} documenti`} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-700 mb-2">Struttura</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <Choice active={mode === "merge"} onClick={() => setMode("merge")} title="Usa le cartelle esistenti" text="Aggiunge solo quello che manca" />
                <Choice active={mode === "fresh"} onClick={() => setMode("fresh")} title="Riprogetta da zero" text="Nuovo albero; le vecchie cartelle restano, vuote" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
              <Button onClick={run} disabled={!target.length} className="bg-brand-600 hover:bg-brand-700 gap-2"><Sparkles className="w-4 h-4" /> Proponi ordine</Button>
            </div>
          </div>
        )}

        {phase === "working" && (
          <div className="py-14 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-600 mx-auto" />
            <p className="mt-3 text-sm text-zinc-600">Sto studiando {target.length} documenti…</p>
          </div>
        )}

        {(phase === "review" || phase === "applying") && (
          <div className="mt-2 space-y-4">
            <div className="grid md:grid-cols-[220px_1fr] gap-4">
              <div className="rounded-lg border border-zinc-200 p-3 bg-zinc-50 max-h-[50vh] overflow-y-auto">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Nuovo albero</p>
                {tree.map((t) => (
                  <div key={t.path} className="flex items-center gap-1.5 text-sm py-0.5" style={{ paddingLeft: t.depth * 14 }}>
                    <Folder className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                    <span className="truncate text-zinc-800">{t.name}</span>
                    {t.n > 0 && <span className="ml-auto text-xs text-zinc-500 tabular-nums">{t.n}</span>}
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-zinc-200 divide-y divide-zinc-100 max-h-[50vh] overflow-y-auto">
                {rows.map((r) => (
                  <div key={r.id} className="p-2.5 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                      <span className="font-medium text-zinc-800 truncate">{r.doc.titolo}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-zinc-500 truncate shrink-0 max-w-[40%]">{r.now || "Senza cartella"}</span>
                      <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
                      <Input value={r.cartella} onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })} className="h-7 text-xs" disabled={phase === "applying"} />
                    </div>
                    {r.motivo && <p className="text-xs text-zinc-500 mt-1">{r.motivo}</p>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <p className="text-sm text-zinc-600">{phase === "applying" ? `Sposto… ${progress}/${total}` : `${changes.length} documenti da spostare`}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPhase("setup")} disabled={phase === "applying"} className="gap-1.5"><RotateCcw className="w-4 h-4" /> Rifai</Button>
                <Button onClick={apply} disabled={phase === "applying" || !changes.length} className="bg-brand-600 hover:bg-brand-700 gap-2">
                  {phase === "applying" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Folder className="w-4 h-4" />} Applica
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Choice({ active, onClick, title, text }) {
  return (
    <button type="button" onClick={onClick} className={`text-left rounded-lg border p-3 transition-colors ${active ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-zinc-200 hover:border-zinc-300"}`}>
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{text}</p>
    </button>
  );
}
