import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import {
  Send, Sparkles, Loader2, Languages, Paperclip, FolderOpen, Upload, X, Eye, Save,
  ShieldCheck, FileText, Link2, Star, AlertTriangle, Settings,
} from "lucide-react";
import RecipientInput, { loadAddressBook } from "./RecipientInput";
import RichTextEditor from "./RichTextEditor";
import DocumentPickerDialog from "./DocumentPickerDialog";
import AiWarning from "@/components/shared/AiWarning";
import {
  buildSignatureHtml, wrapEmailHtml, htmlToText, textToHtml, fillTemplate,
  DEFAULT_TEMPLATES, formatBytes, MAX_ATTACHMENTS_BYTES, isEmail,
} from "@/lib/email";

const LANGUAGES = [
  { value: "it", label: "Italiano" },
  { value: "de", label: "Tedesco" },
  { value: "en", label: "Inglese" },
  { value: "fr", label: "Francese" },
  { value: "es", label: "Spagnolo" },
];

const toList = (v) => (Array.isArray(v) ? v : String(v || "").split(/[,;]+/))
  .map((s) => s.trim().toLowerCase()).filter(isEmail);

const looksHtml = (s) => /<\/?(p|br|div|strong|ul|ol|li|a)\b/i.test(String(s || ""));

/**
 * Compositore email/PEC unico per tutta l'app.
 *
 * defaultTo/defaultCc: stringa o array · defaultBody: testo o HTML
 * attachment: { blob, filename } (PDF generato al volo) · attachments: [{ url, name, size }]
 * links: { contact_id, worksite_id, quote_id } · templateVars: valori per i modelli
 * draft: bozza da riprendere · onSent(info) dopo l'invio riuscito
 */
export default function ComposeDialog({
  open, onOpenChange,
  defaultTo = "", defaultCc = "", defaultSubject = "", defaultBody = "",
  attachment = null, attachments: defaultAttachments = [],
  context = "", links = {}, templateVars = {}, draft = null, accountId: preferredAccountId = null, onSent,
}) {
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState([]);
  const [cc, setCc] = useState([]);
  const [bcc, setBcc] = useState([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [withSignature, setWithSignature] = useState(true);
  const [files, setFiles] = useState([]); // { url?, name, size, blob? }
  const [templates, setTemplates] = useState([]);
  const [linkState, setLinkState] = useState({});
  const [linkOptions, setLinkOptions] = useState({ contacts: [], worksites: [], quotes: [] });
  const [showLinks, setShowLinks] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [language, setLanguage] = useState("it");
  const [translating, setTranslating] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef(null);

  const account = accounts.find((a) => a.id === accountId);
  const isPec = !!account?.is_pec;
  const totalSize = files.reduce((n, f) => n + (f.size || 0), 0);

  // Stato iniziale ad ogni apertura.
  useEffect(() => {
    if (!open) return;
    setDraftId(draft?.id || null);
    setTo(toList(draft?.to || defaultTo));
    const initialCc = toList(draft?.cc || defaultCc);
    setCc(initialCc);
    setBcc(toList(draft?.bcc || []));
    setShowCc(initialCc.length > 0 || (draft?.bcc || []).length > 0);
    setSubject(draft?.subject ?? defaultSubject);
    const b = draft?.html ?? defaultBody;
    setBody(looksHtml(b) ? b : textToHtml(b));
    const initialFiles = [
      ...(draft?.allegati || []).filter((a) => a.url),
      ...defaultAttachments,
      ...(attachment?.blob ? [{ name: attachment.filename || "documento.pdf", size: attachment.blob.size, blob: attachment.blob }] : []),
    ];
    setFiles(initialFiles);
    const l = { contact_id: draft?.contact_id || links.contact_id || "", worksite_id: draft?.worksite_id || links.worksite_id || "", quote_id: draft?.quote_id || links.quote_id || "" };
    setLinkState(l);
    setShowLinks(false);
    setAiPrompt("");
    setLanguage("it");
    setWithSignature(true);
    loadData(draft?.account_id || preferredAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadData = async (preferredAccountId) => {
    setLoadingAccounts(true);
    try {
      const [profiles, accs, tpls, contacts, worksites, quotes] = await Promise.all([
        db.CompanyProfile.list(),
        db.EmailAccount.list("-created_date"),
        db.EmailTemplate.list("nome").catch(() => []),
        db.Contact.list("nome", 1000).catch(() => []),
        db.Worksite.list("-created_date", 500).catch(() => []),
        db.Quote.list("-created_date", 500).catch(() => []),
      ]);
      setProfile(profiles[0] || null);
      const active = accs.filter((a) => a.active !== false && a.provider === "smtp");
      setAccounts(active);
      const pick = active.find((a) => a.id === preferredAccountId) || active.find((a) => a.is_default) || active[0];
      setAccountId(pick?.id || "");
      setTemplates(tpls.length ? tpls : DEFAULT_TEMPLATES);
      setLinkOptions({ contacts, worksites, quotes });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const vars = useMemo(() => ({
    azienda: profile?.ragione_sociale,
    data: new Date().toLocaleDateString("it-IT"),
    ...templateVars,
  }), [profile, templateVars]);

  const signatureHtml = withSignature ? buildSignatureHtml(profile, account) : "";

  const applyTemplate = async (id) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (htmlToText(body).trim() && !confirm("Sostituire il testo attuale con il modello?")) return;
    // Il nome del cliente, se manca, lo prendiamo dalla rubrica del primo destinatario.
    const book = await loadAddressBook().catch(() => []);
    const recipientName = book.find((b) => b.email === to[0])?.name;
    const v = { ...vars, cliente: vars.cliente || recipientName };
    setSubject(fillTemplate(t.oggetto, v));
    setBody(fillTemplate(looksHtml(t.corpo) ? t.corpo : textToHtml(t.corpo), v));
  };

  const handleAi = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const lang = LANGUAGES.find((l) => l.value === language)?.label.toLowerCase();
      const result = await api.integrations.Core.InvokeLLM({
        prompt: `Scrivi il corpo di un'email ${isPec ? "formale inviata via PEC" : "professionale"} per un'impresa edile/impiantistica.
Contesto: ${context || "nessuno"}
Destinatari: ${to.join(", ") || "non indicati"}
Oggetto: ${subject || "non indicato"}
Richiesta dell'utente: "${aiPrompt}"
${language !== "it" ? `Scrivi in ${lang}.` : "Scrivi in italiano."}
Regole: niente firma (viene aggiunta in automatico), niente oggetto, solo il testo pronto da inviare, paragrafi brevi separati da una riga vuota.`,
      });
      setBody(textToHtml(result));
    } catch (e) {
      toast({ title: e.message || "Errore dell'assistente AI", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const handleTranslate = async () => {
    const text = htmlToText(body);
    if (!text.trim()) return;
    setTranslating(true);
    try {
      const lang = LANGUAGES.find((l) => l.value === language)?.label.toLowerCase();
      const [out, subj] = await Promise.all([
        api.integrations.Core.InvokeLLM({ prompt: `Traduci in ${lang} mantenendo tono professionale e paragrafi. Restituisci solo il testo tradotto:\n\n${text}` }),
        subject.trim() ? api.integrations.Core.InvokeLLM({ prompt: `Traduci in ${lang} questo oggetto email. Restituisci solo la traduzione:\n\n${subject}` }) : Promise.resolve(subject),
      ]);
      setBody(textToHtml(out));
      setSubject(String(subj).trim());
      toast({ title: `Tradotto in ${lang}` });
    } catch (e) {
      toast({ title: e.message || "Errore traduzione", variant: "destructive" });
    } finally {
      setTranslating(false);
    }
  };

  const addFiles = async (list) => {
    const incoming = [...list];
    const size = incoming.reduce((n, f) => n + f.size, 0);
    if (totalSize + size > MAX_ATTACHMENTS_BYTES) {
      toast({ title: "Allegati troppo grandi", description: "Il totale non può superare 20 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      for (const file of incoming) {
        const { file_url } = await api.integrations.Core.UploadFile({ file });
        setFiles((prev) => [...prev, { url: file_url, name: file.name, size: file.size }]);
      }
    } catch (e) {
      toast({ title: e.message || "Caricamento non riuscito", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // I PDF generati al volo vengono caricati solo al momento dell'invio/bozza.
  const uploadPending = async () => {
    const out = [];
    for (const f of files) {
      if (f.url) { out.push({ url: f.url, name: f.name, size: f.size }); continue; }
      const file = new File([f.blob], f.name, { type: f.blob.type || "application/pdf" });
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      out.push({ url: file_url, name: f.name, size: f.size });
    }
    setFiles(out);
    return out;
  };

  const payload = (uploaded) => {
    const html = wrapEmailHtml(body, signatureHtml);
    return {
      account_id: account?.id,
      from_email: account?.email_address,
      to, cc, bcc, subject,
      body: html,
      text: htmlToText(body),
      attachments: uploaded.map((f) => ({ url: f.url, name: f.name })),
      contact_id: linkState.contact_id || null,
      worksite_id: linkState.worksite_id || null,
      quote_id: linkState.quote_id || null,
    };
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const uploaded = await uploadPending();
      const data = {
        account_id: account?.id || null,
        account_email: account?.email_address || null,
        direzione: "out",
        stato: "bozza",
        is_pec: isPec,
        from_email: account?.email_address || "",
        to, cc, bcc,
        subject,
        html: body,
        text: htmlToText(body),
        snippet: htmlToText(body).slice(0, 180),
        data: new Date().toISOString(),
        allegati: uploaded,
        contact_id: linkState.contact_id || null,
        worksite_id: linkState.worksite_id || null,
        quote_id: linkState.quote_id || null,
        search_text: [to, cc, subject, htmlToText(body).slice(0, 1500)].flat().join(" ").toLowerCase(),
      };
      if (draftId) await db.EmailMessage.update(draftId, data);
      else setDraftId((await db.EmailMessage.create(data)).id);
      toast({ title: "Bozza salvata" });
    } catch (e) {
      toast({ title: e.message || "Salvataggio non riuscito", variant: "destructive" });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSend = async () => {
    if (!account) return toast({ title: "Collega prima una casella email", variant: "destructive" });
    if (to.length === 0) return toast({ title: "Inserisci almeno un destinatario", variant: "destructive" });
    if (!subject.trim()) return toast({ title: "Inserisci l'oggetto", variant: "destructive" });
    const missing = [...new Set([...(subject + body).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];
    if (missing.length) {
      return toast({ title: "Completa i campi del modello", description: `Sostituisci nel testo: ${missing.map((k) => `{{${k}}}`).join(", ")}`, variant: "destructive" });
    }
    if (!htmlToText(body).trim() && !confirm("Il messaggio è vuoto. Inviare comunque?")) return;
    setSending(true);
    try {
      const uploaded = await uploadPending();
      const res = await api.functions.invoke("sendEmailFromAccount", { ...payload(uploaded), draft_id: draftId });
      if (res.data?.error) throw new Error(res.data.error);
      loadAddressBook(true);
      if (onSent) await onSent({ to: to.join(", "), cc, bcc, subject, body: payload(uploaded).body, is_pec: isPec, message: res.data?.message });
      onOpenChange(false);
      toast({
        title: isPec ? "PEC inviata" : "Email inviata",
        description: isPec ? "Le ricevute di accettazione e consegna arriveranno nella posta in arrivo." : undefined,
        className: "bg-green-600 text-white",
      });
    } catch (e) {
      toast({ title: "Invio non riuscito", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const previewDoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:16px;font-family:Arial,sans-serif}</style></head><body>${wrapEmailHtml(body, signatureHtml)}</body></html>`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100">
            <DialogTitle className="flex items-center gap-2">
              {isPec ? <ShieldCheck className="w-5 h-5 text-emerald-600" /> : <Send className="w-5 h-5 text-blue-600" />}
              {draftId ? "Bozza" : isPec ? "Nuova PEC" : "Nuovo messaggio"}
            </DialogTitle>
            <DialogDescription className="sr-only">Scrivi e invia un messaggio di posta</DialogDescription>
          </DialogHeader>

          {loadingAccounts ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : accounts.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto"><AlertTriangle className="w-6 h-6 text-amber-600" /></div>
              <p className="font-semibold text-slate-800">Nessuna casella collegata</p>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">Per inviare email o PEC dal tuo indirizzo collega prima una casella in Profilo Ditta. Bastano indirizzo e password per app.</p>
              <Button asChild className="gap-2"><Link to="/profilo-ditta#caselle-email" onClick={() => onOpenChange(false)}><Settings className="w-4 h-4" /> Collega una casella</Link></Button>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-3">
              {/* Mittente */}
              <div className="grid sm:grid-cols-[90px_1fr] items-center gap-1.5 sm:gap-3">
                <Label className="text-slate-500">Da</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="flex items-center gap-2">
                          {a.is_pec && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">PEC</span>}
                          <span>{a.display_name ? `${a.display_name} ‹${a.email_address}›` : a.email_address}</span>
                          {a.is_default && <Star className="w-3 h-3 text-amber-500 fill-amber-400" />}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isPec && (
                <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>Invio tramite <strong>Posta Elettronica Certificata</strong>: ha valore legale di raccomandata con ricevuta di ritorno. Le ricevute di accettazione e consegna arriveranno nella posta in arrivo di questa casella.</p>
                </div>
              )}

              {/* Destinatari */}
              <div className="grid sm:grid-cols-[90px_1fr] items-start gap-1.5 sm:gap-3">
                <Label className="text-slate-500 sm:pt-2.5">A</Label>
                <div className="space-y-2">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0"><RecipientInput value={to} onChange={setTo} placeholder="Nome o indirizzo email" autoFocus={!to.length} /></div>
                    {!showCc && <Button type="button" variant="ghost" size="sm" className="text-slate-500 h-10" onClick={() => setShowCc(true)}>Cc/Ccn</Button>}
                  </div>
                  {showCc && (
                    <>
                      <RecipientInput label="Cc" value={cc} onChange={setCc} placeholder="In copia" />
                      <RecipientInput label="Ccn" value={bcc} onChange={setBcc} placeholder="In copia nascosta" />
                    </>
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-[90px_1fr] items-center gap-1.5 sm:gap-3">
                <Label htmlFor="mail-subject" className="text-slate-500">Oggetto</Label>
                <Input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Oggetto del messaggio" />
              </div>

              {/* Strumenti */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Select value="" onValueChange={applyTemplate}>
                  <SelectTrigger className="w-auto h-9 gap-2 text-sm"><FileText className="w-4 h-4 text-slate-500" /><span>Usa un modello</span></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5"><Sparkles className="w-4 h-4 text-blue-600" /> Scrivi con l'AI</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 space-y-2" align="start">
                    <p className="text-sm font-medium">Cosa vuoi comunicare?</p>
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-input p-2 text-sm"
                      placeholder="Es. invio il preventivo per il bagno, chiedo conferma entro venerdì"
                    />
                    <Button size="sm" className="w-full gap-1.5" onClick={handleAi} disabled={aiLoading || !aiPrompt.trim()}>
                      {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Genera testo
                    </Button>
                    <AiWarning className="!py-1.5" />
                  </PopoverContent>
                </Popover>

                <div className="flex items-center gap-1.5">
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-[120px] h-9 text-sm"><Languages className="w-4 h-4 text-slate-500" /><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {language !== "it" && (
                    <Button type="button" size="sm" variant="outline" className="h-9 gap-1" onClick={handleTranslate} disabled={translating || !htmlToText(body).trim()}>
                      {translating ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Traduci
                    </Button>
                  )}
                </div>
              </div>

              <RichTextEditor value={body} onChange={setBody} placeholder="Scrivi il messaggio…" />

              {/* Firma */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" checked={withSignature} onChange={(e) => setWithSignature(e.target.checked)} />
                  Aggiungi la firma {account?.firma_html ? "della casella" : "della ditta"}
                </label>
                {withSignature && signatureHtml && (
                  // La firma personalizzata è HTML libero: la mostriamo isolata.
                  <iframe
                    title="Anteprima firma"
                    sandbox=""
                    srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:Arial,sans-serif">${signatureHtml}</body>`}
                    className="mt-2 w-full h-36 bg-transparent"
                  />
                )}
              </div>

              {/* Allegati */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Paperclip className="w-4 h-4" /> Allegati</span>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setPickerOpen(true)}><FolderOpen className="w-4 h-4" /> Dai documenti</Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Dal dispositivo
                  </Button>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                  {files.length > 0 && (
                    <span className={`text-xs ml-auto ${totalSize > MAX_ATTACHMENTS_BYTES * 0.9 ? "text-red-600" : "text-slate-500"}`}>
                      {formatBytes(totalSize)} di 20 MB
                    </span>
                  )}
                </div>
                {files.length > 0 && (
                  <ul className="grid sm:grid-cols-2 gap-2">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-800 truncate">{f.name}</p>
                          {f.size ? <p className="text-[11px] text-slate-500">{formatBytes(f.size)}</p> : null}
                        </div>
                        <button type="button" aria-label={`Rimuovi ${f.name}`} className="p-1 rounded hover:bg-slate-100" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                          <X className="w-4 h-4 text-slate-500" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Collegamenti */}
              <div>
                <button type="button" onClick={() => setShowLinks((s) => !s)} className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1.5">
                  <Link2 className="w-4 h-4" />
                  Collega a cliente, lavoro o preventivo
                  {[linkState.contact_id, linkState.worksite_id, linkState.quote_id].filter(Boolean).length > 0 && (
                    <span className="text-xs text-blue-700 bg-blue-50 rounded-full px-2">{[linkState.contact_id, linkState.worksite_id, linkState.quote_id].filter(Boolean).length} collegati</span>
                  )}
                </button>
                {showLinks && (
                  <div className="grid sm:grid-cols-3 gap-2 mt-2">
                    <LinkSelect label="Cliente / fornitore" value={linkState.contact_id} onChange={(v) => setLinkState((s) => ({ ...s, contact_id: v }))}
                      options={linkOptions.contacts.map((c) => ({ id: c.id, label: c.nome || c.nome_privato || c.email || "Senza nome" }))} />
                    <LinkSelect label="Lavoro" value={linkState.worksite_id} onChange={(v) => setLinkState((s) => ({ ...s, worksite_id: v }))}
                      options={linkOptions.worksites.map((w) => ({ id: w.id, label: w.nome || "Senza nome" }))} />
                    <LinkSelect label="Preventivo" value={linkState.quote_id} onChange={(v) => setLinkState((s) => ({ ...s, quote_id: v }))}
                      options={linkOptions.quotes.map((q) => ({ id: q.id, label: `${q.numero || "—"} · ${q.cliente_nome || q.oggetto || ""}` }))} />
                  </div>
                )}
              </div>
            </div>
          )}

          {accounts.length > 0 && !loadingAccounts && (
            <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-5 py-3">
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setPreviewOpen(true)}><Eye className="w-4 h-4" /> Anteprima</Button>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={handleSaveDraft} disabled={savingDraft || sending}>
                {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva bozza
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
              <Button onClick={handleSend} disabled={sending || uploading} className={`gap-2 ${isPec ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"}`}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : isPec ? <ShieldCheck className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {sending ? "Invio…" : isPec ? "Invia PEC" : "Invia"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl w-[calc(100vw-1.5rem)]">
          <DialogHeader>
            <DialogTitle>Anteprima</DialogTitle>
            <DialogDescription>Così vedrà il messaggio il destinatario.</DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-1 border-b border-slate-100 pb-3">
            <p><span className="text-slate-500">Da:</span> {account ? `${account.display_name || ""} ‹${account.email_address}›` : "—"} {isPec && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5 ml-1">PEC</span>}</p>
            <p><span className="text-slate-500">A:</span> {to.join(", ") || "—"}</p>
            {cc.length > 0 && <p><span className="text-slate-500">Cc:</span> {cc.join(", ")}</p>}
            {bcc.length > 0 && <p><span className="text-slate-500">Ccn:</span> {bcc.join(", ")}</p>}
            <p><span className="text-slate-500">Oggetto:</span> <strong>{subject || "(senza oggetto)"}</strong></p>
            {files.length > 0 && <p><span className="text-slate-500">Allegati:</span> {files.map((f) => f.name).join(", ")}</p>}
          </div>
          <iframe title="Anteprima email" sandbox="" srcDoc={previewDoc} className="w-full h-[55vh] rounded-md border border-slate-200 bg-white" />
        </DialogContent>
      </Dialog>

      <DocumentPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        profile={profile}
        selectedUrls={files.map((f) => f.url).filter(Boolean)}
        onSelect={(doc) => setFiles((prev) => (prev.some((f) => f.url === doc.url) ? prev : [...prev, { url: doc.url, name: doc.name, size: doc.size }]))}
      />
    </>
  );
}

function LinkSelect({ label, value, onChange, options }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Nessuno —</SelectItem>
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
