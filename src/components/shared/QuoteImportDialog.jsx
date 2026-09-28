import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Sparkles, Plus, Trash2, Loader2, UserCheck, UserPlus, AlertTriangle, FileText, Heading } from "lucide-react";
import AiWarning from "@/components/shared/AiWarning";
import { UNIT_OPTIONS, fmtEur, rowTotal } from "@/lib/quotes";
import { displayName } from "@/lib/contacts";
import { extractQuote } from "@/lib/quoteImport";

const emptyRow = () => ({ tipo: "voce", descrizione: "", unita_misura: "cad", quantita: 1, prezzo_unitario: 0, sconto: 0, iva_percentuale: 22, costo_unitario: null, opzionale: false });

// Importa un preventivo esistente: l'IA legge il documento e compila cliente, voci, capitoli, condizioni e clausole.
export default function QuoteImportDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState("");
  const [res, setRes] = useState(null); // risultato dell'IA
  const [data, setData] = useState(null);
  const [righe, setRighe] = useState([]);
  const [createClient, setCreateClient] = useState(true);

  const reset = () => { setFileUrl(""); setFileName(""); setRes(null); setData(null); setRighe([]); setCreateClient(true); };
  const handleClose = (v) => { onOpenChange(v); if (!v) reset(); };

  const upload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy("upload");
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file, private: true });
      setFileUrl(file_url); setFileName(file.name);
      await extract(file_url);
    } catch (err) {
      toast({ title: "Caricamento non riuscito", description: err.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const extract = async (url = fileUrl) => {
    setBusy("ai");
    try {
      const [contacts, worksites] = await Promise.all([db.Contact.list("nome", 5000).catch(() => []), db.Worksite.fields(["nome", "indirizzo"], { limit: 2000 }).catch(() => [])]);
      const r = await extractQuote(url, { contacts, worksites });
      setRes(r); setData(r.data); setRighe(r.righe.length ? r.righe : [emptyRow()]);
      setCreateClient(!r.cliente.match && !!r.cliente.nuovo);
    } catch (err) {
      toast({ title: "Lettura non riuscita", description: err.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const updateRow = (idx, patch) => setRighe((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const confirm = async () => {
    setBusy("save");
    try {
      let cliente = res.cliente.match;
      if (!cliente && createClient && res.cliente.nuovo) cliente = await db.Contact.create(res.cliente.nuovo);
      const payload = {
        ...data, righe,
        cliente_id: cliente?.id || "", cliente_nome: cliente ? displayName(cliente) : res.cliente.nuovo ? displayName(res.cliente.nuovo) : "",
        worksite_id: res.worksite?.id || "", worksite_nome: res.worksite?.nome || "",
      };
      sessionStorage.setItem("quoteImport", JSON.stringify(payload));
      handleClose(false);
      navigate(`/preventivi/nuovo?import=1${cliente ? `&cliente=${cliente.id}` : ""}`);
    } catch (err) {
      toast({ title: "Non è stato possibile creare il preventivo", description: err.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const voci = righe.filter((r) => r.tipo === "voce" && !r.opzionale);
  const imponibile = voci.reduce((s, r) => s + rowTotal(r), 0) * (1 - (Number(data?.sconto_globale) || 0) / 100);
  const c = res?.cliente;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa un preventivo esistente</DialogTitle>
          <DialogDescription>Carica un PDF, Word, Excel o una foto: l'IA ricrea il preventivo con cliente, capitoli, voci, condizioni e clausole.</DialogDescription>
        </DialogHeader>

        {!res ? (
          <div className="space-y-4">
            <label className="block cursor-pointer">
              <div className="rounded-2xl border-2 border-dashed border-zinc-300 hover:border-brand-400 hover:bg-brand-50/40 p-8 text-center transition-colors">
                {busy ? (
                  <><Loader2 className="w-9 h-9 text-brand-600 mx-auto mb-2 animate-spin" /><p className="font-medium text-zinc-900">{busy === "upload" ? "Caricamento…" : "L'IA sta leggendo il preventivo…"}</p><p className="text-sm text-zinc-500 mt-1">{fileName}</p></>
                ) : (
                  <><Upload className="w-9 h-9 text-zinc-400 mx-auto mb-2" aria-hidden="true" /><p className="font-medium text-zinc-900">Scegli il documento o scatta una foto</p><p className="text-sm text-zinc-500 mt-1">PDF, Word, Excel, immagini</p></>
                )}
              </div>
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ods,image/*" className="hidden" onChange={upload} disabled={!!busy} aria-label="Documento del preventivo" />
            </label>
            {fileUrl && !busy && <Button onClick={() => extract()} className="w-full gap-2 bg-brand-600 hover:bg-brand-700"><Sparkles className="w-4 h-4" /> Leggi di nuovo con l'IA</Button>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <AiWarning />
              {res.avvisi.map((a, i) => <p key={i} className="text-xs text-amber-900 mt-1 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />{a}</p>)}
            </div>

            {/* Cliente */}
            <div className="rounded-xl border border-zinc-200 p-3">
              {c.match ? (
                <p className="text-sm flex items-center gap-2"><UserCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />Cliente già in rubrica: <b>{displayName(c.match)}</b></p>
              ) : c.nuovo ? (
                <label htmlFor="imp-crea-cliente" className="flex items-start gap-2.5 text-sm cursor-pointer">
                  <Checkbox id="imp-crea-cliente" checked={createClient} onCheckedChange={(v) => setCreateClient(v === true)} className="mt-0.5" />
                  <span><span className="flex items-center gap-1.5 font-medium"><UserPlus className="w-4 h-4 text-brand-600" aria-hidden="true" />Aggiungi {displayName(c.nuovo)} ai clienti</span>
                    <span className="block text-xs text-zinc-500 mt-0.5">{[c.nuovo.partita_iva && `P.IVA ${c.nuovo.partita_iva}`, c.nuovo.codice_fiscale && `CF ${c.nuovo.codice_fiscale}`, [c.nuovo.indirizzo, c.nuovo.cap, c.nuovo.citta].filter(Boolean).join(" "), c.nuovo.email].filter(Boolean).join(" · ") || "Dati letti dal documento"}</span></span>
                </label>
              ) : <p className="text-sm text-zinc-500">Nessun cliente trovato nel documento: potrai sceglierlo nel preventivo.</p>}
              {res.worksite && <p className="text-xs text-zinc-600 mt-2">Collegato al lavoro <b>{res.worksite.nome}</b></p>}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><Label htmlFor="imp-oggetto">Oggetto</Label><Input id="imp-oggetto" value={data.oggetto} onChange={(e) => setData({ ...data, oggetto: e.target.value })} className="mt-1" /></div>
              <div><Label htmlFor="imp-pagamento">Condizioni di pagamento</Label><Input id="imp-pagamento" value={data.condizioni_pagamento} onChange={(e) => setData({ ...data, condizioni_pagamento: e.target.value })} className="mt-1" /></div>
              <div><Label htmlFor="imp-tempi">Tempi di esecuzione</Label><Input id="imp-tempi" value={data.tempi_esecuzione} onChange={(e) => setData({ ...data, tempi_esecuzione: e.target.value })} className="mt-1" /></div>
              <div><Label htmlFor="imp-validita">Validità (giorni)</Label><Input id="imp-validita" type="number" value={data.validita_giorni} onChange={(e) => setData({ ...data, validita_giorni: Number(e.target.value) || 30 })} className="mt-1" /></div>
              <div><Label htmlFor="imp-sconto">Sconto sul totale %</Label><Input id="imp-sconto" type="number" value={data.sconto_globale} onChange={(e) => setData({ ...data, sconto_globale: Number(e.target.value) || 0 })} className="mt-1" /></div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-zinc-900">{voci.length} voci · imponibile {fmtEur(imponibile)}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setRighe((p) => [...p, { tipo: "capitolo", descrizione: "" }])} className="gap-1"><Heading className="w-3.5 h-3.5" />Capitolo</Button>
                  <Button size="sm" variant="outline" onClick={() => setRighe((p) => [...p, emptyRow()])} className="gap-1"><Plus className="w-3.5 h-3.5" />Voce</Button>
                </div>
              </div>
              <div className="space-y-1.5 max-h-[38vh] overflow-y-auto pr-1">
                {righe.map((row, idx) => (
                  row.tipo !== "voce" ? (
                    <div key={idx} className="flex gap-1 items-center">
                      {row.tipo === "capitolo" ? <Heading className="w-4 h-4 text-brand-600 shrink-0" aria-label="Capitolo" /> : <FileText className="w-4 h-4 text-zinc-400 shrink-0" aria-label="Testo" />}
                      <Input value={row.descrizione} onChange={(e) => updateRow(idx, { descrizione: e.target.value })} className={`h-8 text-sm ${row.tipo === "capitolo" ? "font-semibold uppercase" : ""}`} aria-label={row.tipo === "capitolo" ? "Titolo capitolo" : "Testo"} />
                      <button type="button" onClick={() => setRighe((p) => p.filter((_, i) => i !== idx))} className="p-1 text-zinc-500 hover:text-red-600" aria-label="Elimina riga"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div key={idx} className={`rounded-lg border p-2 space-y-1.5 ${row.opzionale ? "border-dashed border-zinc-300 bg-zinc-50" : "border-zinc-200"}`}>
                      <div className="flex gap-1">
                        <Input value={row.descrizione} onChange={(e) => updateRow(idx, { descrizione: e.target.value })} placeholder="Descrizione" className="text-sm" aria-label="Descrizione" />
                        <button type="button" onClick={() => setRighe((p) => p.filter((_, i) => i !== idx))} className="p-1 text-zinc-500 hover:text-red-600 shrink-0" aria-label="Elimina voce"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 items-center">
                        <Select value={row.unita_misura} onValueChange={(v) => updateRow(idx, { unita_misura: v })}>
                          <SelectTrigger className="h-8 text-xs" aria-label="Unità di misura"><SelectValue /></SelectTrigger>
                          <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input type="number" value={row.quantita} onChange={(e) => updateRow(idx, { quantita: parseFloat(e.target.value) || 0 })} className="h-8 text-xs" aria-label="Quantità" />
                        <Input type="number" step="0.01" value={row.prezzo_unitario} onChange={(e) => updateRow(idx, { prezzo_unitario: parseFloat(e.target.value) || 0 })} className="h-8 text-xs" aria-label="Prezzo unitario" />
                        <Input type="number" value={row.sconto} onChange={(e) => updateRow(idx, { sconto: parseFloat(e.target.value) || 0 })} className="h-8 text-xs" aria-label="Sconto %" placeholder="Sc. %" />
                        <Select value={String(row.iva_percentuale)} onValueChange={(v) => updateRow(idx, { iva_percentuale: Number(v) })}>
                          <SelectTrigger className="h-8 text-xs" aria-label="IVA"><SelectValue /></SelectTrigger>
                          <SelectContent>{[22, 10, 5, 4, 0].map((v) => <SelectItem key={v} value={String(v)}>IVA {v}%</SelectItem>)}</SelectContent>
                        </Select>
                        <p className="text-right text-xs font-semibold tabular-nums text-zinc-800">{row.opzionale && <span className="font-normal text-zinc-500">opz. </span>}{fmtEur(rowTotal(row))}</p>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>

            {(data.clausole || data.note) && (
              <details className="text-sm">
                <summary className="cursor-pointer text-zinc-700">Clausole e note lette dal documento</summary>
                <div className="grid gap-2 mt-2">
                  <textarea value={data.clausole} onChange={(e) => setData({ ...data, clausole: e.target.value })} className="w-full rounded-lg border border-zinc-200 p-2 text-sm min-h-[80px]" aria-label="Clausole" />
                  <textarea value={data.note} onChange={(e) => setData({ ...data, note: e.target.value })} className="w-full rounded-lg border border-zinc-200 p-2 text-sm min-h-[50px]" aria-label="Note" />
                </div>
              </details>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={reset}>Altro documento</Button>
              <Button onClick={confirm} disabled={!!busy} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{busy === "save" && <Loader2 className="w-4 h-4 animate-spin" />}Crea il preventivo</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
