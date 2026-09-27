import React, { useState, useEffect, useRef } from "react";
import { base44, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Send, Sparkles, Loader2, Languages, Mail, Star, Paperclip, Upload, FileText, X, Eye } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import AiWarning from "@/components/shared/AiWarning";
import EmailAutocomplete from "@/components/shared/EmailAutocomplete";
import DocumentPickerDialog from "@/components/email/DocumentPickerDialog";

const LANGUAGES = [
  { value: "it", label: "Italiano" },
  { value: "de", label: "Tedesco" },
  { value: "en", label: "Inglese" },
  { value: "es", label: "Spagnolo" },
];
const LANG_NAMES = { it: "italiano", de: "tedesco", en: "inglese", es: "spagnolo" };

export default function InviaEmail() {
  const [profile, setProfile] = useState(null);
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [senderEmails, setSenderEmails] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [language, setLanguage] = useState("it");
  const [translating, setTranslating] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [profiles, accounts] = await Promise.all([
        db.CompanyProfile.list(),
        db.EmailAccount.list("-created_date"),
      ]);
      const activeAccounts = accounts.filter(a => a.active);
      setEmailAccounts(activeAccounts);
      if (profiles.length > 0) {
        const p = profiles[0];
        setProfile(p);
        if (activeAccounts.length > 0) {
          const acctEmails = activeAccounts.map(a => a.email_address);
          setSenderEmails(acctEmails);
          const def = activeAccounts.find(a => a.is_default);
          setFrom(def ? def.email_address : acctEmails[0]);
        } else {
          const emails = [p.email, ...(p.emails_extra || []), p.pec].filter(Boolean);
          setSenderEmails(emails);
          if (emails.length > 0) setFrom(emails[0]);
        }
      }
    } catch (e) { console.error(e); }
  };

  const isUsingConnectedAccount = emailAccounts.length > 0;

  const buildSignature = () => {
    if (!profile) return "";
    const lines = ["", "", "---", profile.ragione_sociale || ""];
    if (profile.indirizzo) lines.push(profile.indirizzo);
    if (profile.citta || profile.cap || profile.provincia) {
      const parts = [profile.cap, profile.citta, profile.provincia].filter(Boolean);
      lines.push(parts.join(" "));
    }
    if (profile.telefono) lines.push(`Tel: ${profile.telefono}`);
    if (profile.email) lines.push(`Email: ${profile.email}`);
    if (profile.pec) lines.push(`PEC: ${profile.pec}`);
    if (profile.sito_web) lines.push(`Sito web: ${profile.sito_web}`);
    if (profile.partita_iva) lines.push(`P.IVA: ${profile.partita_iva}`);
    if (profile.codice_destinatario) lines.push(`Codice di Fatturazione: ${profile.codice_destinatario}`);
    return lines.join("\n");
  };

  const escapeHtml = (text) => {
    return String(text || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  const buildHtmlSignature = () => {
    if (!profile) return "";
    const lines = [];
    if (profile.logo_url) {
      lines.push(`<img src="${escapeHtml(profile.logo_url)}" alt="Logo" style="max-height:100px; max-width:260px; display:block; margin-bottom:8px;" />`);
    }
    lines.push(`<strong style="font-size:13px; color:#1e293b;">${escapeHtml(profile.ragione_sociale)}</strong>`);
    if (profile.indirizzo) lines.push(escapeHtml(profile.indirizzo));
    if (profile.citta || profile.cap || profile.provincia) {
      const parts = [profile.cap, profile.citta, profile.provincia].filter(Boolean);
      lines.push(escapeHtml(parts.join(" ")));
    }
    const contactParts = [];
    if (profile.telefono) contactParts.push(`Tel: ${escapeHtml(profile.telefono)}`);
    if (profile.email) contactParts.push(`Email: ${escapeHtml(profile.email)}`);
    if (profile.pec) contactParts.push(`PEC: ${escapeHtml(profile.pec)}`);
    if (profile.sito_web) contactParts.push(`Web: ${escapeHtml(profile.sito_web)}`);
    if (contactParts.length) lines.push(contactParts.join(" | "));
    if (profile.partita_iva) lines.push(`P.IVA: ${escapeHtml(profile.partita_iva)}`);
    if (profile.codice_destinatario) lines.push(`Codice di Fatturazione: ${escapeHtml(profile.codice_destinatario)}`);
    return `<br/><br/><div style="border-top:1px solid #cbd5e1; padding-top:8px; margin-top:10px; font-size:12px; line-height:1.5; color:#475569;">${lines.join("<br/>")}</div>`;
  };

  const handleAiExpand = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const signature = buildSignature();
      const langInstruction = language !== "it" ? `Scrivi l'email in ${LANG_NAMES[language]}.` : "";
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Sei un assistente che scrive email professionali per un'impresa.
Contesto: ${subject}
Spunto dell'utente: "${aiPrompt}"
${langInstruction}

Scrivi un'email completa, formale e ben strutturata basata su questo spunto.
NON includere la firma (verrà aggiunta automaticamente).
NON includere l'oggetto (è già impostato).
Scrivi solo il corpo dell'email, pronto da inviare.`,
      });
      setBody(result + signature);
    } catch (e) {
      toast({ title: "Errore IA", variant: "destructive" });
    } finally { setAiLoading(false); }
  };

  const handleTranslate = async () => {
    if (!body.trim()) return;
    setTranslating(true);
    try {
      const [mainBody, ...sigParts] = body.split("---");
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Traduci il seguente testo in ${LANG_NAMES[language]}, mantenendo il tono professionale e la formattazione. Non aggiungere commenti, restituisci solo il testo tradotto:\n\n${mainBody}`,
      });
      const sig = sigParts.length > 0 ? "---" + sigParts.join("---") : "";
      setBody(result + sig);
      toast({ title: `Tradotto in ${LANG_NAMES[language]}` });
    } catch (e) {
      toast({ title: "Errore traduzione", variant: "destructive" });
    } finally { setTranslating(false); }
  };

  const handleAddAttachment = (att) => {
    setAttachments(prev => [...prev, att]);
  };

  const handleRemoveAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingFile(true);
    try {
      for (const file of files) {
        const result = await base44.integrations.Core.UploadFile({ file });
        setAttachments(prev => [...prev, { url: result.file_url, name: file.name }]);
      }
      toast({ title: "File caricato", className: "bg-green-600 text-white" });
    } catch (e) {
      toast({ title: "Errore caricamento file", variant: "destructive" });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const buildHtmlBody = () => {
    let bodyText = body;
    if (bodyText.includes("---")) {
      bodyText = bodyText.split("---")[0];
    }
    return escapeHtml(bodyText).replace(/\n/g, "<br/>") + buildHtmlSignature();
  };

  const handleSend = async () => {
    if (!to.trim()) {
      toast({ title: "Inserisci un destinatario", variant: "destructive" });
      return;
    }
    if (!subject.trim()) {
      toast({ title: "Inserisci un oggetto", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const htmlBody = buildHtmlBody();

      if (isUsingConnectedAccount) {
        const payload = {
          to, subject, body: htmlBody, from_email: from,
        };
        if (attachments.length > 0) {
          payload.attachments = attachments.map(a => ({ url: a.url, name: a.name }));
        }
        const response = await base44.functions.invoke("sendEmailFromAccount", payload);
        if (response.data?.error) {
          throw new Error(response.data.error);
        }
      } else {
        let emailBody = htmlBody;
        if (attachments.length > 0) {
          const attList = attachments.map(a => `<strong>${escapeHtml(a.name)}</strong>`).join(", ");
          emailBody += `<br/><br/><div style="font-size:12px; color:#475569;">Documenti allegati: ${attList}</div>`;
        }
        await base44.integrations.Core.SendEmail({ to, subject, body: emailBody });
      }

      setTo(""); setSubject(""); setBody(""); setAiPrompt(""); setAttachments([]);
      toast({ title: "Email inviata", className: "bg-green-600 text-white" });
    } catch (e) {
      toast({ title: e.message || "Errore invio email", variant: "destructive" });
    } finally { setSending(false); }
  };

  const selectedUrls = attachments.map(a => a.url);

  return (
    <div>
      <PageHeader title="Invia Email" subtitle="Componi e invia email con documenti allegati e firma automatica" />

      <div className="max-w-3xl bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        {/* Mittente */}
        {isUsingConnectedAccount && (
          <div>
            <Label className="flex items-center gap-1.5">
              Mittente <span className="text-green-600 text-xs font-normal">(account collegato)</span>
            </Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {emailAccounts.map(a => (
                  <SelectItem key={a.id} value={a.email_address}>
                    <span className="flex items-center gap-1.5">
                      {a.is_default && <Star className="w-3 h-3 text-amber-500 inline" />}
                      <span>{a.display_name ? `${a.display_name} — ${a.email_address}` : a.email_address}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!isUsingConnectedAccount && senderEmails.length > 1 && (
          <div>
            <Label>Mittente</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {senderEmails.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {!isUsingConnectedAccount && senderEmails.length <= 1 && (
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-2">
            <Mail className="w-3.5 h-3.5" />
            <span>{senderEmails.length === 1 ? `Invio da: ${from}` : "Nessun account email collegato. Vai in Profilo Ditta per configurare la tua casella email."}</span>
          </div>
        )}

        {/* Destinatario */}
        <div>
          <Label>Destinatario</Label>
          <EmailAutocomplete value={to} onChange={setTo} placeholder="email@esempio.it" />
        </div>

        {/* Oggetto */}
        <div>
          <Label>Oggetto</Label>
          <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Oggetto dell'email" />
        </div>

        {/* Lingua */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label>Lingua invio</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {language !== "it" && (
            <Button type="button" size="sm" variant="outline" onClick={handleTranslate} disabled={translating || !body.trim()} className="gap-1 whitespace-nowrap">
              {translating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
              Traduci
            </Button>
          )}
        </div>
        {language !== "it" && <AiWarning className="!py-1.5" />}

        {/* AI Help */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
          <Label className="text-xs text-blue-700 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Assistente IA (opzionale)
          </Label>
          <p className="text-xs text-slate-500">Scrivi uno spunto e l'IA scriverà l'email completa per te</p>
          <div className="flex gap-2">
            <Input
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="Es. invio il preventivo, chiedo conferma"
              className="text-sm"
            />
            <Button size="sm" variant="outline" onClick={handleAiExpand} disabled={aiLoading || !aiPrompt.trim()} className="gap-1 whitespace-nowrap">
              {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Scrivi
            </Button>
          </div>
        </div>

        {/* Body */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>Testo Email</Label>
            <button onClick={() => { if (!body.includes("---")) setBody(body + buildSignature()); }} className="text-xs text-blue-600 hover:underline">
              + Aggiungi firma
            </button>
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-3 text-sm min-h-[200px]"
            placeholder="Scrivi il testo dell'email..."
          />
        </div>

        {/* Firma preview */}
        {profile && (
          <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2">
            <p className="font-medium text-slate-500">Firma automatica (con logo):</p>
            <p>{profile.ragione_sociale}</p>
            <p>{profile.indirizzo} {profile.citta}</p>
            <p>Tel: {profile.telefono} | P.IVA: {profile.partita_iva}</p>
          </div>
        )}

        {/* Allegati */}
        <div>
          <Label>Allegati</Label>
          <div className="space-y-2 mt-1">
            {attachments.length > 0 && (
              <div className="space-y-1.5">
                {attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                    <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{att.name}</p>
                    </div>
                    <button onClick={() => handleRemoveAttachment(idx)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={() => setDocPickerOpen(true)} className="gap-1.5">
                <Paperclip className="w-3.5 h-3.5" /> Documento dall'app
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingFile} className="gap-1.5">
                {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Carica file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!body.trim() && !subject.trim()} className="gap-1.5">
            <Eye className="w-4 h-4" /> Anteprima
          </Button>
          <Button onClick={handleSend} className="bg-blue-600 hover:bg-blue-700 gap-2" disabled={sending}>
            <Send className="w-4 h-4" />{sending ? "Invio..." : "Invia Email"}
          </Button>
        </div>
      </div>

      {/* Document Picker */}
      <DocumentPickerDialog
        open={docPickerOpen}
        onOpenChange={setDocPickerOpen}
        onSelect={handleAddAttachment}
        profile={profile}
        selectedUrls={selectedUrls}
      />

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Anteprima Email</DialogTitle></DialogHeader>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <span className="text-slate-400 font-medium">Da:</span>
              <span className="text-slate-700">{from}</span>
              <span className="text-slate-400 font-medium">A:</span>
              <span className="text-slate-700">{to || "—"}</span>
              <span className="text-slate-400 font-medium">Oggetto:</span>
              <span className="text-slate-700 font-medium">{subject || "—"}</span>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <div
                className="text-sm text-slate-700"
                dangerouslySetInnerHTML={{ __html: buildHtmlBody() }}
              />
            </div>
            {attachments.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Allegati ({attachments.length})</p>
                <div className="space-y-1.5">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                      <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                      <span>{att.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Chiudi</Button>
            <Button onClick={() => { setPreviewOpen(false); handleSend(); }} className="bg-blue-600 hover:bg-blue-700 gap-2" disabled={sending}>
              <Send className="w-4 h-4" />{sending ? "Invio..." : "Conferma e Invia"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}