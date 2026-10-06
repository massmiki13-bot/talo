import React, { useEffect, useState } from "react";
import { api, db } from "@/lib/db";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Download, ExternalLink, Mail, Trash2, Sparkles, Loader2, Upload, Star, History, Save } from "lucide-react";
import CreateReminderButton from "@/components/shared/CreateReminderButton";
import ComposeDialog from "@/components/email/ComposeDialog";
import { DOC_TYPES, typeLabel, fileKind, expiryState, pathLabel, formatSize } from "@/lib/documents";
import { analyzeDocument } from "@/lib/documentsAi";
import { deleteRemindersForDoc } from "@/utils/expirationReminders";
import { useFileUrl } from "@/lib/privateFiles";

const NONE = "__none";

export default function DocumentDetailSheet({ doc, open, onOpenChange, folders, contacts, employees, worksites, onChanged, onDelete }) {
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [compose, setCompose] = useState(false);

  useEffect(() => { if (doc) setForm({ ...doc }); }, [doc]);
  const previewUrl = useFileUrl(doc?.file_url);
  if (!doc || !form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const kind = fileKind(doc);
  const exp = expiryState(form.data_scadenza);
  const dirty = JSON.stringify(form) !== JSON.stringify(doc);

  const save = async () => {
    setSaving(true);
    try {
      const folder = folders.find((f) => f.id === form.cartella_id);
      const emp = employees.find((e) => e.id === form.dipendente_id);
      const con = contacts.find((c) => c.id === form.contatto_id);
      const ws = worksites.find((w) => w.id === form.worksite_id);
      const patch = {
        titolo: form.titolo?.trim() || doc.titolo, tipo: form.tipo, descrizione: form.descrizione || "", riassunto: form.riassunto || "",
        numero: form.numero || "", emittente: form.emittente || "", importo: form.importo === "" || form.importo == null ? null : Number(form.importo),
        data_emissione: form.data_emissione || null, data_scadenza: form.data_scadenza || null,
        cartella_id: form.cartella_id || "", cartella_nome: folder?.nome || "",
        dipendente_id: emp?.id || "", dipendente_nome: emp ? `${emp.nome || ""} ${emp.cognome || ""}`.trim() : "",
        contatto_id: con?.id || "", contatto_nome: con ? con.nome || con.nome_privato || "" : "",
        worksite_id: ws?.id || "", worksite_nome: ws ? ws.nome || ws.titolo || "" : "",
        tag: String(Array.isArray(form.tag) ? form.tag.join(",") : form.tag || "").split(",").map((s) => s.trim()).filter(Boolean),
      };
      if ((doc.data_scadenza || null) !== patch.data_scadenza && !patch.data_scadenza) await deleteRemindersForDoc(doc.id);
      const updated = await db.CompanyDocument.update(doc.id, patch);
      onChanged?.(updated);
      toast({ title: "Documento salvato" });
    } catch (e) {
      console.error(e);
      toast({ title: "Salvataggio non riuscito", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const reanalyze = async () => {
    setAiBusy(true);
    try {
      const r = await analyzeDocument(doc.file_url, doc.nome_file || doc.titolo, { folders, employees, contacts, worksites });
      setForm((f) => ({
        ...f, titolo: r.titolo || f.titolo, tipo: r.tipo || f.tipo, riassunto: r.riassunto || f.riassunto, numero: r.numero || f.numero,
        emittente: r.emittente || f.emittente, importo: r.importo ?? f.importo, data_emissione: r.data_emissione || f.data_emissione,
        data_scadenza: r.data_scadenza || f.data_scadenza, dipendente_id: r.dipendente_id || f.dipendente_id, contatto_id: r.contatto_id || f.contatto_id,
        worksite_id: r.worksite_id || f.worksite_id, tag: r.tag?.length ? r.tag : f.tag,
      }));
      if (r.contenuto_estratto) await db.CompanyDocument.update(doc.id, { contenuto_estratto: r.contenuto_estratto });
      toast({ title: "Dati letti dall'IA", description: "Controlla e premi Salva." });
    } catch (e) {
      toast({ title: "Lettura IA non riuscita", variant: "destructive" });
    } finally { setAiBusy(false); }
  };

  const replaceFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReplacing(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file, private: true });
      const versioni = [...(doc.versioni || []), { file_url: doc.file_url, nome_file: doc.nome_file || "", sostituito_il: new Date().toISOString() }].slice(-10);
      const updated = await db.CompanyDocument.update(doc.id, { file_url, nome_file: file.name, dimensione: file.size, mime: file.type, versioni, contenuto_estratto: "" });
      onChanged?.(updated);
      toast({ title: "Nuova versione caricata", description: "La precedente resta nello storico." });
    } catch (err) {
      toast({ title: "Caricamento non riuscito", variant: "destructive" });
    } finally { setReplacing(false); }
  };

  const toggleFav = async () => {
    const updated = await db.CompanyDocument.update(doc.id, { preferito: !doc.preferito });
    onChanged?.(updated);
  };

  const sel = (value, onChange, items, placeholder) => (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— Nessuno —</SelectItem>
        {items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-100 text-left">
            <div className="flex items-start gap-2 pr-8">
              <SheetTitle className="text-lg leading-snug flex-1">{doc.titolo}</SheetTitle>
              <button onClick={toggleFav} className="p-1 rounded hover:bg-slate-100" aria-label={doc.preferito ? "Togli dai preferiti" : "Aggiungi ai preferiti"}>
                <Star className={`w-5 h-5 ${doc.preferito ? "fill-amber-400 text-amber-500" : "text-slate-500"}`} />
              </button>
            </div>
            <p className="text-sm text-slate-500">
              {typeLabel(doc.tipo)} · {doc.cartella_id ? pathLabel(doc.cartella_id, folders) : "Senza cartella"}
              {doc.dimensione ? ` · ${formatSize(doc.dimensione)}` : ""}
            </p>
            {exp && <span className={`inline-flex w-fit text-xs font-medium px-2 py-0.5 rounded-full ${exp.className}`}>{exp.label}</span>}
          </SheetHeader>

          <div className="p-5 space-y-5">
            {doc.file_url && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                {kind === "image" ? (
                  previewUrl ? <img src={previewUrl} alt={doc.titolo} className="w-full max-h-[420px] object-contain bg-white" /> : <div className="h-40 grid place-items-center text-sm text-slate-500">Caricamento…</div>
                ) : kind === "pdf" ? (
                  previewUrl ? <iframe src={previewUrl} title={doc.titolo} className="w-full h-[420px] bg-white" /> : <div className="h-40 grid place-items-center text-sm text-slate-500">Caricamento…</div>
                ) : (
                  <div className="p-6 text-center text-sm text-slate-500">Anteprima non disponibile per questo formato.</div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {doc.file_url && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={doc.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /> Apri</a></Button>}
              {doc.file_url && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={doc.file_url} download={doc.nome_file || doc.titolo}><Download className="w-4 h-4" /> Scarica</a></Button>}
              {doc.file_url && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCompose(true)}><Mail className="w-4 h-4" /> Invia per email</Button>}
              {doc.file_url && <Button variant="outline" size="sm" className="gap-1.5" onClick={reanalyze} disabled={aiBusy}>{aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Leggi con IA</Button>}
              <Button variant="outline" size="sm" className="gap-1.5" asChild disabled={replacing}>
                <label className="cursor-pointer">{replacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Nuova versione<input type="file" className="hidden" onChange={replaceFile} /></label>
              </Button>
            </div>

            {form.riassunto && <p className="text-sm text-slate-700 bg-brand-50/60 border border-brand-100 rounded-lg p-3">{form.riassunto}</p>}

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><Label htmlFor="documentdetailsheet-titolo">Titolo</Label><Input id="documentdetailsheet-titolo" value={form.titolo || ""} onChange={(e) => set("titolo", e.target.value)} /></div>
              <div>
                <Label htmlFor="documentdetailsheet-tipo">Tipo</Label>
                <Select value={form.tipo || "altro"} onValueChange={(v) => set("tipo", v)}>
                  <SelectTrigger id="documentdetailsheet-tipo" className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Cartella</Label>{sel(form.cartella_id, (v) => set("cartella_id", v), folders.map((f) => ({ value: f.id, label: pathLabel(f.id, folders) })).sort((a, b) => a.label.localeCompare(b.label, "it")), "Senza cartella")}</div>
              <div><Label htmlFor="documentdetailsheet-data-emissione">Data emissione</Label><Input id="documentdetailsheet-data-emissione" type="date" value={form.data_emissione || ""} onChange={(e) => set("data_emissione", e.target.value)} /></div>
              <div><Label htmlFor="documentdetailsheet-scadenza">Scadenza</Label><Input id="documentdetailsheet-scadenza" type="date" value={form.data_scadenza || ""} onChange={(e) => set("data_scadenza", e.target.value)} /></div>
              <div><Label htmlFor="documentdetailsheet-numero-protocollo">Numero / protocollo</Label><Input id="documentdetailsheet-numero-protocollo" value={form.numero || ""} onChange={(e) => set("numero", e.target.value)} /></div>
              <div><Label htmlFor="documentdetailsheet-emesso-da">Emesso da</Label><Input id="documentdetailsheet-emesso-da" value={form.emittente || ""} onChange={(e) => set("emittente", e.target.value)} /></div>
              <div><Label htmlFor="documentdetailsheet-importo">Importo (€)</Label><Input id="documentdetailsheet-importo" type="number" step="0.01" value={form.importo ?? ""} onChange={(e) => set("importo", e.target.value)} /></div>
              <div><Label htmlFor="documentdetailsheet-etichette">Etichette</Label><Input id="documentdetailsheet-etichette" value={Array.isArray(form.tag) ? form.tag.join(", ") : form.tag || ""} onChange={(e) => set("tag", e.target.value)} placeholder="es. 2026, urgente" /></div>
              <div><Label>Cliente / fornitore</Label>{sel(form.contatto_id, (v) => set("contatto_id", v), contacts.map((c) => ({ value: c.id, label: c.nome || c.nome_privato || "Senza nome" })), "Nessuno")}</div>
              <div><Label>Dipendente</Label>{sel(form.dipendente_id, (v) => set("dipendente_id", v), employees.map((e) => ({ value: e.id, label: `${e.nome || ""} ${e.cognome || ""}`.trim() })), "Nessuno")}</div>
              <div className="sm:col-span-2"><Label>Cantiere</Label>{sel(form.worksite_id, (v) => set("worksite_id", v), worksites.map((w) => ({ value: w.id, label: w.nome || w.titolo || "Cantiere" })), "Nessuno")}</div>
              <div className="sm:col-span-2"><Label htmlFor="documentdetailsheet-note">Note</Label><Textarea id="documentdetailsheet-note" value={form.descrizione || ""} onChange={(e) => set("descrizione", e.target.value)} rows={3} /></div>
            </div>

            {doc.data_scadenza && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                <p className="text-sm text-slate-700">Promemoria di scadenza</p>
                <CreateReminderButton docTitle={doc.titolo} scadenzaDate={doc.data_scadenza} docId={doc.id} docType="CompanyDocument" docTypeLabel={typeLabel(doc.tipo)} personName={doc.dipendente_nome || null} />
              </div>
            )}

            {doc.versioni?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-2"><History className="w-4 h-4" /> Versioni precedenti</p>
                <ul className="space-y-1">
                  {[...doc.versioni].reverse().map((v, i) => (
                    <li key={i} className="text-sm flex items-center justify-between gap-2">
                      <span className="truncate text-slate-600">{v.nome_file || "File"} · sostituito il {new Date(v.sostituito_il).toLocaleDateString("it-IT")}</span>
                      <a href={v.file_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline shrink-0">Apri</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 sticky bottom-0 bg-white pb-1">
              <Button variant="ghost" className="text-red-700 hover:text-red-700 hover:bg-red-50 gap-1.5" onClick={() => onDelete(doc)}><Trash2 className="w-4 h-4" /> Elimina</Button>
              <Button onClick={save} disabled={!dirty || saving} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {compose && (
        <ComposeDialog
          open={compose}
          onOpenChange={setCompose}
          defaultSubject={doc.titolo}
          attachments={[{ url: doc.file_url, name: doc.nome_file || `${doc.titolo}.pdf`, size: doc.dimensione || 0 }]}
          links={{ contact_id: doc.contatto_id || undefined, worksite_id: doc.worksite_id || undefined }}
          context={`Invio del documento "${doc.titolo}" (${typeLabel(doc.tipo)}).`}
        />
      )}
    </>
  );
}
