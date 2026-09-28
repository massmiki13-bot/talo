import React, { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Mail, PenSquare, Paperclip, Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import ComposeDialog from "./ComposeDialog";
import MessageView, { formatDate } from "./MessageView";

/**
 * Email collegate a un cliente, un lavoro o un preventivo.
 * field: "contact_id" | "worksite_id" | "quote_id" · id: record collegato
 * composeDefaults: valori precompilati per "Scrivi" (destinatario, variabili modello…)
 */
export default function LinkedEmails({ field, id, composeDefaults = {}, title = "Email" }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(null);
  const [reading, setReading] = useState(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setMessages(await db.EmailMessage.filter({ [field]: id, stato: { $ne: "bozza" } }, "-data", 50));
    } finally {
      setLoading(false);
    }
  }, [field, id]);

  useEffect(() => { load(); }, [load]);

  if (!id) return null;

  const links = { [field]: id, ...(composeDefaults.links || {}) };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Mail className="w-4 h-4 text-brand-600" /> {title}</h3>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCompose({ ...composeDefaults, links })}>
          <PenSquare className="w-4 h-4" /> Scrivi
        </Button>
      </div>
      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : messages.length === 0 ? (
        <p className="text-sm text-slate-500 py-3">Nessuna email collegata. Quelle inviate da qui o collegate dalla Posta compariranno in questo elenco.</p>
      ) : (
        <ul className="divide-y divide-slate-100 -mx-1">
          {messages.map((m) => (
            <li key={m.id}>
              <button onClick={() => setReading(m)} className="w-full text-left flex items-center gap-3 px-1 py-2.5 rounded hover:bg-slate-50">
                {m.direzione === "in"
                  ? <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Ricevuta" />
                  : <ArrowUpRight className="w-4 h-4 text-brand-600 shrink-0" aria-label="Inviata" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 truncate">
                    {m.is_pec && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded px-1 mr-1.5">PEC</span>}
                    {m.stato === "errore" && <span className="text-[10px] font-bold bg-red-100 text-red-700 rounded px-1 mr-1.5">NON INVIATA</span>}
                    {m.subject || "(senza oggetto)"}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{m.direzione === "in" ? m.from_email : `A: ${(m.to || []).join(", ")}`}</p>
                </div>
                {(m.allegati || []).length > 0 && <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                <span className="text-xs text-slate-500 shrink-0">{formatDate(m.data)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ComposeDialog open={!!compose} onOpenChange={(v) => { if (!v) setCompose(null); }} {...(compose || {})} onSent={load} />

      <Dialog open={!!reading} onOpenChange={(v) => { if (!v) setReading(null); }}>
        <DialogContent className="max-w-3xl w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-0">
          <DialogTitle className="sr-only">{reading?.subject || "Messaggio"}</DialogTitle>
          <DialogDescription className="sr-only">Lettura del messaggio</DialogDescription>
          {reading && (
            <MessageView
              message={reading}
              onReply={() => { const m = reading; setReading(null); setCompose({ defaultTo: m.direzione === "in" ? [m.from_email] : m.to, defaultSubject: `Re: ${m.subject || ""}`, accountId: m.account_id, links }); }}
              onReplyAll={() => { const m = reading; setReading(null); setCompose({ defaultTo: m.direzione === "in" ? [m.from_email] : m.to, defaultCc: m.cc, defaultSubject: `Re: ${m.subject || ""}`, accountId: m.account_id, links }); }}
              onForward={() => { const m = reading; setReading(null); setCompose({ defaultSubject: `I: ${m.subject || ""}`, defaultBody: m.html || m.text, attachments: (m.allegati || []).filter((a) => a.url), accountId: m.account_id }); }}
              onDelete={async () => { if (!confirm("Eliminare il messaggio da Talo?")) return; await db.EmailMessage.delete(reading.id); setReading(null); load(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
