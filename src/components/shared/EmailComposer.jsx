import React, { useState, useEffect } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Send, Sparkles, Loader2, Languages, Mail, Star, FileDown, Paperclip } from "lucide-react";
import AiWarning from "./AiWarning";
import EmailAutocomplete from "./EmailAutocomplete";

const LANGUAGES = [
  { value: "it", label: "Italiano" },
  { value: "de", label: "Tedesco" },
  { value: "en", label: "Inglese" },
  { value: "es", label: "Spagnolo" },
];

const LANG_NAMES = { it: "italiano", de: "tedesco", en: "inglese", es: "spagnolo" };

export default function EmailComposer({ open, onOpenChange, defaultTo = "", defaultSubject = "", defaultBody = "", context = "", onSent, attachment = null }) {
  const [profile, setProfile] = useState(null);
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [senderEmails, setSenderEmails] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [language, setLanguage] = useState("it");
  const [translating, setTranslating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody(defaultBody);
      setAiPrompt("");
      setLanguage("it");
    }
  }, [open, defaultTo, defaultSubject, defaultBody]);

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
          // Usa gli account collegati come mittenti
          const acctEmails = activeAccounts.map(a => a.email_address);
          setSenderEmails(acctEmails);
          const def = activeAccounts.find(a => a.is_default);
          setFrom(def ? def.email_address : acctEmails[0]);
        } else {
          // Fallback: email del profilo
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
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  const buildHtmlSignature = () => {
    if (!profile) return "";
    const lines = [];
    if (profile.logo_url) {
      lines.push(`<img src="${profile.logo_url}" alt="Logo" style="max-height:100px; max-width:260px; display:block; margin-bottom:8px;" />`);
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
      const result = await api.integrations.Core.InvokeLLM({
        prompt: `Sei un assistente che scrive email professionali per un'impresa edile.
Contesto: ${context}
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
      const result = await api.integrations.Core.InvokeLLM({
        prompt: `Traduci il seguente testo in ${LANG_NAMES[language]}, mantenendo il tono professionale e la formattazione. Non aggiungere commenti, restituisci solo il testo tradotto:\n\n${mainBody}`,
      });
      const sig = sigParts.length > 0 ? "---" + sigParts.join("---") : "";
      setBody(result + sig);
      toast({ title: `Tradotto in ${LANG_NAMES[language]}` });
    } catch (e) {
      toast({ title: "Errore traduzione", variant: "destructive" });
    } finally { setTranslating(false); }
  };

  const handleSend = async () => {
    if (!to.trim()) {
      toast({ title: "Inserisci un destinatario", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      // Rimuove la firma testuale se già presente nel body, per ricostruirla in HTML
      let bodyText = body;
      if (bodyText.includes("---")) {
        bodyText = bodyText.split("---")[0];
      }
      // Costruisce il corpo HTML: testo dell'email + firma HTML con logo
      const htmlBody = escapeHtml(bodyText).replace(/\n/g, "<br/>") + buildHtmlSignature();

      // Carica l'allegato se presente
      let attachmentUrl = null;
      let attachmentName = null;
      if (attachment?.blob) {
        try {
          const file = new File([attachment.blob], attachment.filename || "documento.pdf", { type: "application/pdf" });
          const result = await api.integrations.Core.UploadFile({ file });
          attachmentUrl = result.file_url;
          attachmentName = attachment.filename || "documento.pdf";
        } catch (e) {
          console.error("Errore upload allegato:", e);
        }
      }

      if (isUsingConnectedAccount) {
        // Invia tramite l'account collegato (backend function) con allegato PDF
        const response = await api.functions.invoke("sendEmailFromAccount", {
          to, subject, body: htmlBody, from_email: from,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
        });
        if (response.data?.error) {
          throw new Error(response.data.error);
        }
      } else {
        // Fallback: invio tramite l'integrazione predefinita dell'app
        let emailBody = htmlBody;
        if (attachmentUrl) {
          emailBody += `<br/><br/><div style="font-size:12px; color:#475569;">Documento allegato: <strong>${escapeHtml(attachmentName)}</strong></div>`;
        }
        await api.integrations.Core.SendEmail({ to, subject, body: emailBody });
      }

      if (onSent) await onSent({ to, subject, body: htmlBody });
      onOpenChange(false);
      toast({ title: "Email inviata", className: "bg-green-600 text-white" });
    } catch (e) {
      toast({ title: e.message || "Errore invio email", variant: "destructive" });
    } finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Invia Email</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-4">
          {isUsingConnectedAccount && (
            <div>
              <Label className="flex items-center gap-1.5">
                Mittente
                <span className="text-green-600 text-xs font-normal">(account collegato)</span>
              </Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {emailAccounts.map(a => (
                    <SelectItem key={a.id} value={a.email_address}>
                      <span className="flex items-center gap-1.5">
                        {a.is_default && <Star className="w-3 h-3 text-amber-500 inline" />}
                        <span>{a.display_name ? `${a.display_name} — ${a.email_address}` : a.email_address}</span>
                        {a.provider === 'gmail_oauth' && <span className="text-[10px] text-green-600">Gmail</span>}
                        {a.provider === 'outlook_oauth' && <span className="text-[10px] text-blue-600">Outlook</span>}
                        {a.provider === 'smtp' && <span className="text-[10px] text-slate-400">SMTP</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {emailAccounts.find(a => a.email_address === from)?.is_default && (
                <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                  <Star className="w-3 h-3" /> Indirizzo predefinito
                </p>
              )}
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
          {!isUsingConnectedAccount && senderEmails.length === 1 && (
            <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-2">
              <Mail className="w-3.5 h-3.5" />
              <span>Invio da: <strong>{from}</strong></span>
            </div>
          )}
          {!isUsingConnectedAccount && senderEmails.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
              <Mail className="w-3.5 h-3.5" />
              <span>Nessun account email collegato. Vai in Profilo Ditta per collegare la tua casella email.</span>
            </div>
          )}
          <div>
            <Label>Destinatario</Label>
            <EmailAutocomplete value={to} onChange={setTo} placeholder="email@esempio.it" />
          </div>
          <div>
            <Label>Oggetto</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} />
          </div>

          {/* Language selector */}
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
              className="w-full border border-slate-200 rounded-lg p-3 text-sm min-h-[180px]"
              placeholder="Scrivi il testo dell'email..."
            />
          </div>

          {profile && (
            <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2">
              <p className="font-medium text-slate-500">Firma automatica:</p>
              <p>{profile.ragione_sociale}</p>
              <p>{profile.indirizzo} {profile.citta}</p>
              <p>Tel: {profile.telefono} | P.IVA: {profile.partita_iva}</p>
            </div>
          )}
        </div>
        {attachment?.blob && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
            <FileDown className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{attachment.filename}</p>
              <p className="text-xs text-slate-500">PDF allegato · {(attachment.blob.size / 1024).toFixed(0)} KB</p>
            </div>
            <Paperclip className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSend} className="bg-blue-600 hover:bg-blue-700 gap-2" disabled={sending}>
            <Send className="w-4 h-4" />{sending ? "Invio..." : "Invia"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}