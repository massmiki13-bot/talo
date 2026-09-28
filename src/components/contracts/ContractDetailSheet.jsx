import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Eye, FileDown, FileText, Mail, Upload, Copy, Trash2, Sparkles, Loader2, CalendarClock, Check, Pencil, Save, ExternalLink, AlertTriangle, Lock,
} from "lucide-react";
import ComposeDialog from "@/components/email/ComposeDialog";
import EditContractScadenzaDialog from "@/components/contracts/EditContractScadenzaDialog";
import { generateContractPDF, generateContractWord, generateContractPDFBlob } from "@/utils/docExportUtils";
import { STATI, statoOf, typeTitle, fmtDate, aiReview } from "@/lib/contracts";
import { formatEuro } from "@/utils/pdfUtils";

const FLOW = ["bozza", "inviato", "firmato", "concluso"];
const SEV = { alta: "bg-red-100 text-red-800", media: "bg-amber-100 text-amber-800", bassa: "bg-slate-100 text-slate-700" };
const safeName = (s) => String(s || "Contratto").replace(/[^\p{L}\p{N}_ -]/gu, "").trim().replace(/\s+/g, "_");

export default function ContractDetailSheet({ contract, open, onOpenChange, profile, customTemplates, contacts, employees, onChanged, onDuplicate, onDelete, onPreview }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [compose, setCompose] = useState(null);
  const [scadenzaOpen, setScadenzaOpen] = useState(false);

  useEffect(() => { setEditing(false); setText(contract?.contenuto_finale || ""); }, [contract?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!contract) return null;

  const stato = statoOf(contract);
  const locked = ["firmato", "concluso"].includes(contract.stato);
  const update = async (patch, msg) => {
    const u = await db.GeneratedContract.update(contract.id, patch);
    onChanged?.(u);
    if (msg) toast({ title: msg });
    return u;
  };
  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { console.error(e); toast({ title: "Operazione non riuscita", variant: "destructive" }); } finally { setBusy(""); } };

  const setStato = (s) => run("stato", () => update({ stato: s, ...(s === "firmato" && !contract.firmato_il ? { firmato_il: new Date().toISOString().slice(0, 10) } : {}), ...(s === "inviato" && !contract.inviato_il ? { inviato_il: new Date().toISOString().slice(0, 10) } : {}) }, `Stato: ${STATI.find((x) => x.value === s)?.label}`));

  const openEmail = () => run("email", async () => {
    const blob = await generateContractPDFBlob(contract, profile);
    const to = contacts.find((c) => c.id === contract.contatto_id)?.email || employees.find((e) => e.id === contract.dipendente_id)?.email || "";
    setCompose({
      defaultTo: to,
      defaultSubject: `${contract.titolo} – ${profile?.ragione_sociale || ""}`.replace(/ – $/, ""),
      defaultBody: `Buongiorno,\n\nin allegato trova il documento "${contract.titolo}". Le chiediamo di verificarlo e, se tutto è corretto, di restituircelo firmato.\n\nRestiamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti`,
      attachment: { blob, filename: `${safeName(contract.titolo)}.pdf` },
      links: { contact_id: contract.contatto_id || undefined, worksite_id: contract.worksite_id || undefined },
      context: `Invio del contratto "${contract.titolo}" alla controparte per la firma.`,
    });
  });

  const uploadSigned = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    run("upload", async () => {
      const { file_url } = await api.integrations.Core.UploadFile({ file, private: true });
      await update({ file_firmato_url: file_url, file_firmato_nome: file.name, stato: "firmato", firmato_il: contract.firmato_il || new Date().toISOString().slice(0, 10) }, "Copia firmata archiviata");
    });
  };

  const review = () => run("review", async () => {
    const r = await aiReview({ ...contract, contenuto_finale: editing ? text : contract.contenuto_finale });
    await update({ revisione_ai: { ...r, data: new Date().toISOString() } });
  });

  const saveText = () => run("text", async () => { await update({ contenuto_finale: text }, "Testo aggiornato"); setEditing(false); });

  const party = contract.dipendente_id ? { to: `/dipendenti/${contract.dipendente_id}`, label: "Scheda dipendente" }
    : contract.contatto_id ? { to: `/contatti/${contract.contatto_id}`, label: "Scheda cliente/fornitore" } : null;
  const rev = contract.revisione_ai;
  const placeholders = (contract.contenuto_finale || "").match(/_{5,}/g)?.length || 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-slate-100 text-left space-y-2">
            <SheetTitle className="text-lg leading-snug pr-8">{contract.titolo}</SheetTitle>
            <p className="text-sm text-slate-500">{typeTitle(contract.tipo, customTemplates)}</p>
            {/* Avanzamento */}
            <div className="flex flex-wrap items-center gap-1.5">
              {contract.stato === "annullato" ? (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stato.className}`}>{stato.label}</span>
              ) : FLOW.map((s, i) => {
                const idx = FLOW.indexOf(contract.stato || "bozza");
                const info = STATI.find((x) => x.value === s);
                return (
                  <React.Fragment key={s}>
                    {i > 0 && <span className={`h-px w-4 ${i <= idx ? "bg-emerald-500" : "bg-slate-200"}`} />}
                    <button onClick={() => setStato(s)} disabled={busy === "stato"} className={`text-xs font-medium px-2 py-1 rounded-full border transition-colors ${i === idx ? `${info.className} border-transparent` : i < idx ? "border-emerald-200 text-emerald-700 bg-white" : "border-slate-200 text-slate-500 bg-white hover:border-slate-300"}`}>
                      {i < idx && <Check className="w-3 h-3 inline -mt-0.5 mr-0.5" />}{info.label}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </SheetHeader>

          <div className="p-5 space-y-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Item label="Controparte" value={contract.controparte_nome} />
              <Item label="Creato il" value={fmtDate(contract.data_creazione || contract.created_date)} />
              {contract.data_inizio && <Item label="Decorrenza" value={fmtDate(contract.data_inizio)} />}
              <Item label="Scadenza" value={contract.data_scadenza ? fmtDate(contract.data_scadenza) : "Nessuna"} />
              {contract.importo ? <Item label="Valore" value={formatEuro(contract.importo)} /> : null}
              {contract.firmato_il && <Item label="Firmato il" value={fmtDate(contract.firmato_il)} />}
            </dl>
            {(party || contract.worksite_id) && (
              <div className="flex flex-wrap gap-3 text-sm">
                {party && <Link to={party.to} className="text-brand-700 hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />{party.label}</Link>}
                {contract.worksite_id && <Link to={`/lavori/${contract.worksite_id}`} className="text-brand-700 hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />Lavoro collegato</Link>}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onPreview(contract)}><Eye className="w-4 h-4" /> Anteprima</Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run("pdf", () => generateContractPDF(contract, profile))} disabled={busy === "pdf"}>{busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF</Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run("word", async () => generateContractWord(contract, profile))}><FileText className="w-4 h-4" /> Word</Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={openEmail} disabled={busy === "email"}>{busy === "email" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Invia per la firma</Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setScadenzaOpen(true)}><CalendarClock className="w-4 h-4" /> Scadenza e avvisi</Button>
            </div>

            {/* Copia firmata */}
            <div className="rounded-lg border border-slate-200 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">Copia firmata</p>
                {contract.file_firmato_url
                  ? <a href={contract.file_firmato_url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-700 hover:underline truncate block">{contract.file_firmato_nome || "Apri il documento firmato"}</a>
                  : <p className="text-xs text-slate-500">Carica la scansione firmata: il contratto passa a "Firmato".</p>}
              </div>
              <Button size="sm" variant="outline" asChild disabled={busy === "upload"}>
                <label className="cursor-pointer gap-1.5">{busy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{contract.file_firmato_url ? "Sostituisci" : "Carica"}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={uploadSigned} /></label>
              </Button>
            </div>

            {/* Revisione IA */}
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-brand-600" /> Controllo con IA</p>
                <Button size="sm" variant="outline" onClick={review} disabled={busy === "review"} className="gap-1.5">{busy === "review" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{rev ? "Ricontrolla" : "Controlla il contratto"}</Button>
              </div>
              {placeholders > 0 && <p className="text-sm text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {placeholders} spazi "______" ancora da compilare nel testo.</p>}
              {rev ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-700">{rev.giudizio}{rev.punteggio ? <span className="ml-2 text-xs font-semibold text-slate-900 bg-slate-100 rounded px-1.5 py-0.5">{rev.punteggio}/10</span> : null}</p>
                  <ul className="space-y-1.5">
                    {(rev.problemi || []).map((p, i) => (
                      <li key={i} className="text-sm text-slate-700 flex gap-2"><span className={`shrink-0 h-fit text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded ${SEV[p.gravita] || SEV.bassa}`}>{p.gravita}</span>{p.testo}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-slate-500">Suggerimenti automatici del {fmtDate(rev.data)}: non sostituiscono il parere di un consulente.</p>
                </div>
              ) : <p className="text-xs text-slate-500">Cerca dati mancanti, incoerenze e clausole importanti assenti (sicurezza, DURC, tracciabilità, penali…).</p>}
            </div>

            {/* Testo */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-900">Testo del contratto</p>
                {!editing ? (
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { if (locked && !confirm("Il contratto risulta firmato: modificare il testo lo renderà diverso dalla copia firmata. Continuare?")) return; setText(contract.contenuto_finale || ""); setEditing(true); }}>
                    {locked ? <Lock className="w-4 h-4" /> : <Pencil className="w-4 h-4" />} Modifica
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annulla</Button>
                    <Button size="sm" onClick={saveText} disabled={busy === "text"} className="bg-brand-600 hover:bg-brand-700 gap-1.5"><Save className="w-4 h-4" /> Salva testo</Button>
                  </div>
                )}
              </div>
              {editing
                ? <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[420px] font-serif text-[13px] leading-relaxed" />
                : <div className="max-h-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap font-serif">{contract.contenuto_finale}</div>}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <div className="flex gap-1">
                <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5" onClick={() => onDelete(contract)}><Trash2 className="w-4 h-4" /> Elimina</Button>
                {contract.stato !== "annullato" && <Button variant="ghost" className="text-slate-600" onClick={() => confirm("Segnare il contratto come annullato?") && setStato("annullato")}>Annulla contratto</Button>}
              </div>
              <Button variant="outline" className="gap-1.5" onClick={() => onDuplicate(contract)}><Copy className="w-4 h-4" /> Duplica</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {compose && (
        <ComposeDialog open onOpenChange={(v) => !v && setCompose(null)} {...compose}
          onSent={() => { if (!contract.stato || contract.stato === "bozza") update({ stato: "inviato", inviato_il: new Date().toISOString().slice(0, 10) }); }} />
      )}
      <EditContractScadenzaDialog open={scadenzaOpen} onOpenChange={setScadenzaOpen} contract={contract} typeLabel={typeTitle(contract.tipo, customTemplates)}
        onUpdated={async () => { const u = await db.GeneratedContract.get(contract.id); onChanged?.(u); }} />
    </>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value || "—"}</dd>
    </div>
  );
}
