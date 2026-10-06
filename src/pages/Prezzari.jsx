import React, { useCallback, useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/components/shared/ConfirmHost";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { BookOpenCheck, Upload, Search, Star, Trash2, Loader2, FileSpreadsheet, FileText, Sparkles, Plus, CheckCircle2, AlertTriangle, Percent } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { REGIONI, TIPI, readSheet, detectColumns, detectColumnsAi, rowsToVoci, pdfPageCount, extractPdfVoci, savePrezzario, deletePrezzario, searchVoci } from "@/lib/prezzari";
import { fmtEur } from "@/lib/quotes";

export default function Prezzari() {
  const { toast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try { setList(await db.Prezzario.list("-created_date")); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const byId = Object.fromEntries(list.map((p) => [p.id, p]));

  const search = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try { setResults(await searchVoci(query, scope === "all" ? list.map((p) => p.id) : [scope], 100)); }
    finally { setSearching(false); }
  };

  const setDefault = async (p) => {
    for (const x of list.filter((x) => x.predefinito && x.id !== p.id)) await db.Prezzario.update(x.id, { predefinito: false });
    await db.Prezzario.update(p.id, { predefinito: !p.predefinito });
    load();
  };
  const patch = async (p, data) => { await db.Prezzario.update(p.id, data); load(); };
  const remove = async (p) => {
    if (!(await confirmDialog(`Eliminare "${p.nome}" e le sue ${p.n_voci || 0} voci?`))) return;
    try { await deletePrezzario(p); toast({ title: "Prezzario eliminato" }); load(); }
    catch { toast({ title: "Eliminazione non riuscita", variant: "destructive" }); }
  };
  const toListino = async (v) => {
    await db.PriceItem.create({ descrizione: v.descrizione, codice: v.codice, categoria: v.capitolo || byId[v.prezzario_id]?.nome || "Prezzario", unita_misura: v.unita_misura || "cad", prezzo_unitario: v.prezzo, iva_percentuale: 22, utilizzi: 0 });
    toast({ title: "Aggiunta al tuo listino", description: "La trovi in Preventivi › Listino." });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <PageHeader title="Prezzari" subtitle="Carica i prezzari ufficiali (regione, comune) o i tuoi listini: l'IA li usa per mettere il prezzo giusto alle voci dei preventivi." actionLabel="Importa prezzario" actionIcon={Upload} onAction={() => setImportOpen(true)} />

      {list.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-14 px-6 text-center">
          <BookOpenCheck className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="mt-3 font-semibold text-slate-900">Nessun prezzario caricato</p>
          <p className="text-sm text-slate-500 mt-1 max-w-lg mx-auto">Scarica il prezzario della tua regione dal sito ufficiale (meglio in Excel, va bene anche il PDF) e caricalo qui. Da quel momento, nei preventivi, l'IA propone il prezzo delle voci citando codice e prezzario.</p>
          <Button onClick={() => setImportOpen(true)} className="mt-4 bg-brand-600 hover:bg-brand-700 gap-2"><Upload className="w-4 h-4" /> Importa prezzario</Button>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map((p) => (
              <div key={p.id} className={`bg-white rounded-2xl border p-4 ${p.predefinito ? "border-brand-300 ring-1 ring-brand-200" : "border-slate-200"}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 grid place-items-center shrink-0"><BookOpenCheck className="w-5 h-5 text-brand-700" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{p.nome}</p>
                    <p className="text-xs text-slate-500 truncate">{[p.ente, p.anno].filter(Boolean).join(" · ") || TIPI.find((t) => t.value === p.tipo)?.label}</p>
                  </div>
                  <button onClick={() => setDefault(p)} className="p-1 rounded hover:bg-slate-100" title={p.predefinito ? "Predefinito" : "Rendi predefinito"} aria-label="Predefinito">
                    <Star className={`w-5 h-5 ${p.predefinito ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} />
                  </button>
                </div>
                <div className="flex items-center gap-4 mt-4 text-sm">
                  <span className="text-slate-900 font-semibold tabular-nums">{(p.n_voci || 0).toLocaleString("it-IT")}</span><span className="text-slate-500 -ml-3">voci</span>
                  <label className="flex items-center gap-1.5 text-slate-600 ml-auto" title="Ricarico o sconto applicato ai prezzi proposti">
                    <Percent className="w-3.5 h-3.5" />
                    <Input type="number" className="h-7 w-16 text-xs" defaultValue={p.ricarico_percentuale ?? 0} onBlur={(e) => Number(e.target.value) !== Number(p.ricarico_percentuale || 0) && patch(p, { ricarico_percentuale: Number(e.target.value) || 0 })} />
                  </label>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <label className="flex items-center gap-2 text-sm text-slate-700"><Switch checked={p.attivo !== false} onCheckedChange={(v) => patch(p, { attivo: v })} /> Usato dall'IA</label>
                  <button onClick={() => remove(p)} className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50" aria-label="Elimina"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>

          <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Cerca nelle voci</h2>
            <form onSubmit={search} className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="es. intonaco civile, massetto sabbia cemento, oppure un codice" className="pl-8" />
              </div>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger aria-label="Prezzario in cui cercare" className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Tutti i prezzari</SelectItem>{list.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="submit" disabled={searching || !query.trim()} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Cerca</Button>
            </form>
            {results && (
              results.length === 0 ? <p className="text-sm text-slate-500 mt-4">Nessuna voce trovata. Prova con parole diverse o più generiche.</p> : (
                <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                  {results.map((v) => (
                    <li key={v.id} className="py-3 flex gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-500"><span className="font-mono text-slate-700">{v.codice || "—"}</span> · {byId[v.prezzario_id]?.nome}{v.capitolo ? ` · ${v.capitolo}` : ""}</p>
                        <p className="text-sm text-slate-800 mt-0.5 line-clamp-3">{v.descrizione}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{fmtEur(v.prezzo)}</p>
                        <p className="text-xs text-slate-500">al {v.unita_misura || "—"}</p>
                        <button onClick={() => toListino(v)} className="text-xs text-brand-700 hover:underline mt-1 inline-flex items-center gap-0.5"><Plus className="w-3 h-3" />listino</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </section>
        </>
      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={() => { setImportOpen(false); load(); }} hasDefault={list.some((p) => p.predefinito)} />
    </div>
  );
}

function ImportDialog({ open, onOpenChange, onDone, hasDefault }) {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({ nome: "", tipo: "regionale", ente: "", anno: new Date().getFullYear() });
  const [phase, setPhase] = useState("pick"); // pick | analyzing | preview | pdf | saving
  const [voci, setVoci] = useState([]);
  const [pages, setPages] = useState({ total: 0, from: 1, to: 30 });
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState("");
  const input = useRef(null);

  useEffect(() => {
    if (open) { setFile(null); setPhase("pick"); setVoci([]); setProgress(null); setErr(""); setMeta({ nome: "", tipo: "regionale", ente: "", anno: new Date().getFullYear() }); }
  }, [open]);

  const choose = async (f) => {
    if (!f) return;
    setFile(f); setErr("");
    setMeta((m) => ({ ...m, nome: m.nome || f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") }));
    if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
      setPhase("analyzing");
      try { const n = await pdfPageCount(f); setPages({ total: n, from: 1, to: Math.min(n, 30) }); setPhase("pdf"); }
      catch { setErr("Non riesco ad aprire questo PDF (forse protetto)."); setPhase("pick"); }
      return;
    }
    setPhase("analyzing");
    try {
      const { rows } = await readSheet(f);
      let cols = detectColumns(rows);
      if (!cols) cols = await detectColumnsAi(rows);
      if (!cols) throw new Error("colonne");
      const v = rowsToVoci(rows, cols);
      if (!v.length) throw new Error("vuoto");
      setVoci(v); setPhase("preview");
    } catch (e) {
      console.error(e);
      setErr("Non ho riconosciuto le colonne di codice, descrizione e prezzo. Controlla che il file sia il prezzario in formato tabella.");
      setPhase("pick");
    }
  };

  const readPdf = async () => {
    setPhase("analyzing");
    setProgress({ done: 0, total: 1, found: 0 });
    const { voci: v, failed } = await extractPdfVoci(file, pages.from, pages.to, (done, total, found) => setProgress({ done, total, found }));
    if (!v.length) { setErr("L'IA non ha trovato voci con prezzo in queste pagine."); setPhase("pdf"); return; }
    if (failed) toast({ title: `${failed} gruppi di pagine non letti`, description: "Puoi reimportarli dopo con un intervallo più piccolo." });
    setVoci(v); setPhase("preview");
  };

  const save = async () => {
    setPhase("saving");
    try {
      let file_url = "";
      if (file.size < 20 * 1024 * 1024) file_url = (await api.integrations.Core.UploadFile({ file }).catch(() => ({}))).file_url || "";
      await savePrezzario({ ...meta, anno: Number(meta.anno) || null, file_url, nome_file: file.name, predefinito: !hasDefault }, voci, (s, t) => setProgress({ done: s, total: t }));
      toast({ title: "Prezzario importato", description: `${voci.length.toLocaleString("it-IT")} voci pronte per i preventivi.` });
      onDone();
    } catch (e) {
      console.error(e);
      toast({ title: "Importazione interrotta", description: "Riprova: se il file è molto grande, dividilo per capitoli.", variant: "destructive" });
      setPhase("preview");
    }
  };

  const busy = ["analyzing", "saving"].includes(phase);
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa prezzario</DialogTitle>
          <DialogDescription>Excel, CSV e ODS vengono letti per intero in pochi secondi. Il PDF lo legge l'IA a gruppi di pagine: scegli i capitoli che ti servono.</DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label htmlFor="pz-nome">Nome</Label><Input id="pz-nome" value={meta.nome} onChange={(e) => setMeta({ ...meta, nome: e.target.value })} placeholder="es. Prezzario Provincia di Bolzano 2026" className="mt-1" /></div>
          <div>
            <Label htmlFor="prezzari-tipo">Tipo</Label>
            <Select value={meta.tipo} onValueChange={(v) => setMeta({ ...meta, tipo: v })}>
              <SelectTrigger id="prezzari-tipo" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPI.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div>
              <Label>{meta.tipo === "comunale" ? "Comune" : "Ente / regione"}</Label>
              {meta.tipo === "regionale" ? (
                <Select value={meta.ente || undefined} onValueChange={(v) => setMeta({ ...meta, ente: v })}>
                  <SelectTrigger aria-label="Ente" className="mt-1"><SelectValue placeholder="Scegli" /></SelectTrigger>
                  <SelectContent>{REGIONI.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              ) : <Input value={meta.ente} onChange={(e) => setMeta({ ...meta, ente: e.target.value })} className="mt-1" />}
            </div>
            <div><Label htmlFor="prezzari-anno">Anno</Label><Input id="prezzari-anno" type="number" value={meta.anno} onChange={(e) => setMeta({ ...meta, anno: e.target.value })} className="mt-1" /></div>
          </div>
        </div>

        {phase === "pick" && (
          <button onClick={() => input.current?.click()} className="w-full mt-2 rounded-xl border-2 border-dashed border-slate-300 hover:border-brand-500 hover:bg-brand-50/40 py-10 text-center transition-colors">
            <div className="flex justify-center gap-3 text-slate-500"><FileSpreadsheet className="w-8 h-8" /><FileText className="w-8 h-8" /></div>
            <p className="mt-2 text-sm font-medium text-slate-800">Scegli il file del prezzario</p>
            <p className="text-xs text-slate-500">.xlsx .xls .csv .ods .pdf</p>
            <input ref={input} type="file" className="hidden" accept=".xlsx,.xls,.csv,.ods,.pdf" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
          </button>
        )}
        {err && <p className="text-sm text-red-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{err}</p>}

        {phase === "pdf" && (
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-sm text-slate-800"><b>{file?.name}</b> · {pages.total} pagine</p>
            <div className="flex flex-wrap items-end gap-3">
              <div><Label htmlFor="prezzari-dalla-pagina">Dalla pagina</Label><Input id="prezzari-dalla-pagina" type="number" min={1} max={pages.total} value={pages.from} onChange={(e) => setPages({ ...pages, from: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 w-24" /></div>
              <div><Label htmlFor="prezzari-alla-pagina">Alla pagina</Label><Input id="prezzari-alla-pagina" type="number" min={1} max={pages.total} value={pages.to} onChange={(e) => setPages({ ...pages, to: Math.min(pages.total, Number(e.target.value) || 1) })} className="mt-1 w-24" /></div>
              <Button onClick={readPdf} disabled={pages.to < pages.from} className="bg-brand-600 hover:bg-brand-700 gap-1.5"><Sparkles className="w-4 h-4" /> Leggi con l'IA</Button>
            </div>
            <p className="text-xs text-slate-500">Circa 10 secondi ogni 3 pagine. Per prezzari molto lunghi importa i capitoli che usi davvero, oppure cerca la versione Excel sul sito della regione: è più veloce e precisa.</p>
          </div>
        )}

        {phase === "analyzing" && (
          <div className="py-8 text-center">
            <Loader2 className="w-7 h-7 animate-spin text-brand-600 mx-auto" />
            <p className="text-sm text-slate-600 mt-2">{progress ? `Pagine lette: gruppo ${progress.done} di ${progress.total} · ${progress.found} voci trovate` : "Sto leggendo il file…"}</p>
            {progress && <div className="h-1.5 rounded-full bg-slate-100 max-w-sm mx-auto mt-3 overflow-hidden"><div className="h-full bg-brand-600" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>}
          </div>
        )}

        {(phase === "preview" || phase === "saving") && (
          <div className="space-y-3">
            <p className="text-sm text-emerald-800 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {voci.length.toLocaleString("it-IT")} voci riconosciute. Controlla le prime prima di importare:</p>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="text-left font-medium px-3 py-2">Codice</th><th className="text-left font-medium px-3 py-2">Descrizione</th><th className="text-left font-medium px-3 py-2">U.M.</th><th className="text-right font-medium px-3 py-2">Prezzo</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {voci.slice(0, 8).map((v, i) => (
                    <tr key={i}><td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">{v.codice || "—"}</td><td className="px-3 py-2 text-slate-800"><span className="line-clamp-2">{v.descrizione}</span></td><td className="px-3 py-2 text-slate-600">{v.unita_misura || "—"}</td><td className="px-3 py-2 text-right tabular-nums">{fmtEur(v.prezzo)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {phase === "saving" && progress && <p className="text-sm text-slate-600">Salvataggio: {progress.done.toLocaleString("it-IT")} / {progress.total.toLocaleString("it-IT")}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setPhase("pick"); setVoci([]); }} disabled={phase === "saving"}>Cambia file</Button>
              <Button onClick={save} disabled={phase === "saving" || !meta.nome.trim()} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{phase === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Importa {voci.length.toLocaleString("it-IT")} voci</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
