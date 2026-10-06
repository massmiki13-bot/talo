import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Reply, ReplyAll, Forward, Trash2, Paperclip, Download, Loader2, ShieldCheck, AlertCircle, User, HardHat, FileText, ArrowLeft } from "lucide-react";
import { formatBytes, PEC_LABELS } from "@/lib/email";

export const formatDate = (iso, long = false) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (!long && d.toDateString() === today.toDateString()) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("it-IT", long
    ? { weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "2-digit" } : {}) });
};

// Il contenuto delle email ricevute è HTML di terzi: lo mostriamo in un iframe
// senza script né accesso alla pagina.
function MailBody({ message }) {
  // Le immagini remote rivelano al mittente quando il messaggio viene aperto: si caricano solo su richiesta.
  const [showImages, setShowImages] = useState(false);
  const hasRemoteImages = /<img[^>]+src\s*=\s*["']?\s*https?:/i.test(message.html || "") || /url\(\s*["']?https?:/i.test(message.html || "");
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data: cid: blob:${showImages || message.direzione === "out" ? " https: http:" : ""}`;
  const html = message.html?.trim()
    ? message.html
    : `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${String(message.text || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</pre>`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;padding:4px 2px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
  return (
    <>
      {hasRemoteImages && !showImages && message.direzione !== "out" && (
        <p className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
          Le immagini esterne sono bloccate per la tua riservatezza.
          <button type="button" onClick={() => setShowImages(true)} className="font-semibold text-brand-700 hover:underline">Mostra immagini</button>
        </p>
      )}
      <iframe title="Contenuto del messaggio" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} className="w-full min-h-[360px] h-[55vh] border-0 bg-white" />
    </>
  );
}

export default function MessageView({ message, onReply, onReplyAll, onForward, onDelete, onBack, links = {} }) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(null);
  const pecLabel = message.pec_tipo ? PEC_LABELS[message.pec_tipo] || message.pec_tipo : null;
  const isOut = message.direzione === "out";

  const download = async (att) => {
    if (att.url) { window.open(att.url, "_blank", "noopener"); return; }
    setDownloading(att.index);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/mail-attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ message_id: message.id, index: att.index }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Download non riuscito");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <article className="flex flex-col h-full">
      <div className="border-b border-slate-100 px-4 sm:px-6 py-4 space-y-3">
        {onBack && (
          <button onClick={onBack} className="lg:hidden flex items-center gap-1 text-sm text-brand-700 -mt-1"><ArrowLeft className="w-4 h-4" /> Torna all'elenco</button>
        )}
        <div className="flex items-start gap-2 flex-wrap">
          <h2 className="text-lg font-semibold text-slate-900 flex-1 min-w-0 break-words">{message.subject || "(senza oggetto)"}</h2>
          {message.is_pec && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium px-2 py-0.5">
              <ShieldCheck className="w-3.5 h-3.5" /> {pecLabel || "PEC"}
            </span>
          )}
          {message.stato === "errore" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-2 py-0.5">
              <AlertCircle className="w-3.5 h-3.5" /> Non inviata
            </span>
          )}
        </div>
        <div className="text-sm text-slate-600 space-y-0.5">
          <p><span className="text-slate-500">Da </span><strong className="text-slate-800">{message.from_name || message.from_email}</strong>{message.from_name && <span className="text-slate-500"> ‹{message.from_email}›</span>}</p>
          <p className="break-words"><span className="text-slate-500">A </span>{(message.to || []).join(", ") || "—"}</p>
          {(message.cc || []).length > 0 && <p className="break-words"><span className="text-slate-500">Cc </span>{message.cc.join(", ")}</p>}
          {isOut && (message.bcc || []).length > 0 && <p className="break-words"><span className="text-slate-500">Ccn </span>{message.bcc.join(", ")}</p>}
          <p className="text-slate-500">{formatDate(message.data, true)}{message.account_email && ` · casella ${message.account_email}`}</p>
        </div>
        {message.stato === "errore" && message.errore && (
          <p className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">{message.errore}</p>
        )}
        {(links.contact || links.worksite || links.quote) && (
          <div className="flex flex-wrap gap-1.5">
            {links.contact && <Link to={`/contatti/${links.contact.id}`} className="inline-flex items-center gap-1 text-xs rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200"><User className="w-3 h-3" />{links.contact.nome}</Link>}
            {links.worksite && <Link to={`/lavori/${links.worksite.id}`} className="inline-flex items-center gap-1 text-xs rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200"><HardHat className="w-3 h-3" />{links.worksite.nome}</Link>}
            {links.quote && <Link to={`/preventivi/${links.quote.id}`} className="inline-flex items-center gap-1 text-xs rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200"><FileText className="w-3 h-3" />Preventivo {links.quote.numero}</Link>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onReply}><Reply className="w-4 h-4" /> Rispondi</Button>
          {((message.to || []).length + (message.cc || []).length > 1) && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onReplyAll}><ReplyAll className="w-4 h-4" /> Rispondi a tutti</Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onForward}><Forward className="w-4 h-4" /> Inoltra</Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-red-600 hover:text-red-700 ml-auto" onClick={onDelete}><Trash2 className="w-4 h-4" /> Elimina</Button>
        </div>
      </div>

      {(message.allegati || []).length > 0 && (
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex flex-wrap gap-2">
          {message.allegati.map((a, i) => (
            <button
              key={`${a.name}-${i}`}
              onClick={() => download(a)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-left hover:bg-slate-50 max-w-full"
            >
              {downloading === a.index ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <Paperclip className="w-4 h-4 text-slate-500" />}
              <span className="text-sm text-slate-800 truncate max-w-[220px]">{a.name}</span>
              {a.size ? <span className="text-xs text-slate-500">{formatBytes(a.size)}</span> : null}
              <Download className="w-3.5 h-3.5 text-slate-400" />
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 px-3 sm:px-5 py-3 overflow-auto"><MailBody message={message} /></div>
    </article>
  );
}
