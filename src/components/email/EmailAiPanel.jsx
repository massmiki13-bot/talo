import React, { useRef, useState } from "react";
import { Mic, Square, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { createRecorder } from "@/lib/worker";
import { textToHtml, htmlToText } from "@/lib/email";
import { TONES, LENGTHS, REFINES, composeEmail, dictate, splitQuote } from "@/lib/emailAi";

/** Registrazione a tocco: primo tocco avvia, secondo ferma. */
function useRecorder(onDone) {
  const { toast } = useToast();
  const rec = useRef(null);
  const [state, setState] = useState("idle"); // idle | rec | busy
  const toggle = async () => {
    if (state === "busy") return;
    if (state === "idle") {
      try { rec.current = createRecorder(); await rec.current.start(); setState("rec"); }
      catch { toast({ title: "Microfono non disponibile", description: "Consenti l'uso del microfono nel browser.", variant: "destructive" }); }
      return;
    }
    setState("busy");
    try { const file = await rec.current.stop(); if (file) await onDone(file); }
    catch (e) { toast({ title: "Non sono riuscito a capire il vocale", description: e.message, variant: "destructive" }); }
    finally { setState("idle"); }
  };
  return { state, toggle };
}

const chip = (on) => `h-8 px-3 rounded-full border text-xs font-medium transition-colors ${on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"}`;

/**
 * Assistente IA del compositore: scrive da istruzioni scritte o dette a voce, risponde ai messaggi,
 * ritocca il testo e permette la dettatura parola per parola.
 * ctx: { isPec, company, recipients, context, linksText, attachments, language }
 */
export default function EmailAiPanel({ body, setBody, subject, setSubject, ctx, onClose }) {
  const { toast } = useToast();
  const [request, setRequest] = useState("");
  const [tone, setTone] = useState(ctx.isPec ? "formale" : "professionale");
  const [length, setLength] = useState("normale");
  const [busy, setBusy] = useState("");
  const [heard, setHeard] = useState("");
  const { own, quote } = splitQuote(body);
  const hasText = htmlToText(own).trim().length > 0;

  const apply = (r) => {
    if (r.corpo) setBody(textToHtml(r.corpo) + quote);
    if (r.oggetto && (!subject.trim() || /^(re|r|fwd|i):?\s*$/i.test(subject.trim()))) setSubject(r.oggetto);
    else if (r.oggetto && r.oggetto !== subject && !hasText) setSubject(r.oggetto);
  };
  const run = async (kind, extra = {}) => {
    setBusy(kind);
    try {
      const r = await composeEmail({ ...ctx, tone, length, subject, currentBody: own, quotedText: htmlToText(quote), request, ...extra });
      apply(r);
      if (r.trascrizione) setHeard(r.trascrizione);
      if (!extra.refine) setRequest("");
    } catch (e) { toast({ title: e.message || "Errore dell'assistente IA", variant: "destructive" }); }
    finally { setBusy(""); }
  };

  const voiceAi = useRecorder((audio) => run("voice", { audio }));
  const voiceDictate = useRecorder(async (audio) => {
    const text = await dictate(audio, ctx.language);
    if (text) setBody((own.replace(/(<p><br><\/p>\s*)+$/i, "") + textToHtml(text)) + quote);
  });

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-zinc-900 flex-1">Assistente IA{quote ? " · risposta al messaggio" : ""}</p>
        <button type="button" onClick={onClose} className="p-1 rounded text-zinc-500 hover:text-zinc-900" aria-label="Chiudi l'assistente"><X className="w-4 h-4" /></button>
      </div>

      {/* Voce */}
      <div className="grid sm:grid-cols-2 gap-2">
        <button type="button" onClick={voiceAi.toggle} disabled={!!busy && busy !== "voice"}
          className={`h-14 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors ${voiceAi.state === "rec" ? "bg-red-600 text-white animate-pulse" : "bg-zinc-950 text-white hover:bg-zinc-800"} disabled:opacity-50`}>
          {voiceAi.state === "busy" ? <Loader2 className="w-5 h-5 animate-spin" /> : voiceAi.state === "rec" ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          <span className="text-left leading-tight">{voiceAi.state === "rec" ? "Sto ascoltando… tocca per finire" : voiceAi.state === "busy" ? "Scrivo l'email…" : <>Dimmi cosa scrivere<span className="block text-[11px] font-normal text-zinc-300">l'IA scrive l'email per te</span></>}</span>
        </button>
        <button type="button" onClick={voiceDictate.toggle} disabled={!!busy}
          className={`h-14 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 border transition-colors ${voiceDictate.state === "rec" ? "bg-red-600 border-red-600 text-white animate-pulse" : "bg-white border-zinc-300 text-zinc-900 hover:bg-zinc-50"} disabled:opacity-50`}>
          {voiceDictate.state === "busy" ? <Loader2 className="w-5 h-5 animate-spin" /> : voiceDictate.state === "rec" ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5 text-brand-600" />}
          <span className="text-left leading-tight">{voiceDictate.state === "rec" ? "Detta… tocca per finire" : voiceDictate.state === "busy" ? "Trascrivo…" : <>Dettatura<span className="block text-[11px] font-normal text-zinc-500">scrive parola per parola</span></>}</span>
        </button>
      </div>
      {heard && <p className="text-xs text-zinc-600">Ho capito: «{heard}»</p>}

      {/* Istruzioni scritte */}
      <div className="space-y-2">
        <textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={2} aria-label="Cosa vuoi comunicare"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && request.trim()) run("write"); }}
          className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          placeholder={quote ? "Es. ringrazia, confermo il sopralluogo martedì alle 9, chiedo le misure del bagno" : "Es. mando il preventivo per il bagno, chiedo conferma entro venerdì"} />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500 mr-1">Tono</span>
          {TONES.map((t) => <button key={t.value} type="button" onClick={() => setTone(t.value)} aria-pressed={tone === t.value} className={chip(tone === t.value)} title={t.hint}>{t.label}</button>)}
          <span className="text-xs text-zinc-500 ml-2 mr-1">Lunghezza</span>
          {LENGTHS.map((l) => <button key={l.value} type="button" onClick={() => setLength(l.value)} aria-pressed={length === l.value} className={chip(length === l.value)} title={l.hint}>{l.label}</button>)}
        </div>
        <Button type="button" size="sm" className="w-full gap-1.5 bg-brand-600 hover:bg-brand-700" onClick={() => run("write")} disabled={!!busy || (!request.trim() && !hasText && !quote)}>
          {busy === "write" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {hasText ? "Riscrivi con queste indicazioni" : quote ? "Scrivi la risposta" : "Scrivi l'email"}
        </Button>
      </div>

      {/* Ritocchi */}
      {hasText && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-200">
          <Wand2 className="w-3.5 h-3.5 text-zinc-500 mt-2" aria-hidden="true" />
          {REFINES.map((r) => (
            <button key={r.value} type="button" disabled={!!busy} onClick={() => run(`r-${r.value}`, { refine: r.instr })} className={`${chip(false)} mt-2 disabled:opacity-50 inline-flex items-center gap-1`}>
              {busy === `r-${r.value}` && <Loader2 className="w-3 h-3 animate-spin" />}{r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
