import React, { useMemo, useRef, useState } from "react";
import { Mic, Square, Loader2, Camera, X, Package, Wrench, ShieldAlert, Ambulance, MessageSquare, Phone, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { sendWorker, createRecorder } from "@/lib/worker";
import { REPORT_FIELDS, aiReport } from "@/lib/workerFields";
import { Card, BigButton, Pill, Field, Choice, AiButton, inputCls, fmtDay } from "./ui";

const TIPI = [["materiale", "t_materiale", Package], ["guasto", "t_guasto", Wrench], ["sicurezza", "t_sicurezza", ShieldAlert], ["infortunio", "t_infortunio", Ambulance], ["altro", "t_altro", MessageSquare]];

/** Campi specifici del tipo scelto. */
function Details({ tipo, value, onChange, t }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (REPORT_FIELDS[tipo] || []).filter((f) => !f.when || f.when(value)).map((f) => (
    f.kind === "choice" ? (
      <Choice key={f.k} label={t(f.k)} value={value[f.k] || ""} onChange={(v) => set(f.k, v)} cols={f.options.length === 3 ? 3 : 2}
        options={f.options.map((o) => [o, t(o)])} tone={tipo === "infortunio" ? "red" : "brand"} />
    ) : (
      <Field key={f.k} label={t(f.k)}>
        <input type={f.kind === "time" ? "time" : "text"} value={value[f.k] || ""} onChange={(e) => set(f.k, e.target.value)} placeholder={f.ph ? t(f.ph) : undefined} className={inputCls} />
      </Field>
    )
  ));
}

// Segnalazioni al capo: tipo con campi specifici, voce o testo compilati dall'IA (tradotti per il capo), foto, cantiere o mezzo.
export default function ReportTab({ home, t, lang, preset, onSent }) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState(preset?.tipo || "materiale");
  const [dettagli, setDettagli] = useState({});
  const [urgente, setUrgente] = useState(false);
  const [testo, setTesto] = useState("");
  const [voice, setVoice] = useState(null); // { audio_url, originale, italiano, lingua }
  const [files, setFiles] = useState([]);
  const [site, setSite] = useState(home.worksites[0]?.id || "");
  const [mezzoId, setMezzoId] = useState(preset?.mezzo?.id || "");
  const [rec, setRec] = useState("idle"); // idle | rec | busy
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorder = useRef(null);

  // Mezzi che l'operaio può indicare: i suoi e quelli dei suoi cantieri.
  const mezzi = useMemo(() => {
    const all = [...home.mezzi_miei, ...home.worksites.flatMap((w) => w.mezzi.map((m, i) => ({ id: m.id || `${w.id}:${i}`, ...m })))];
    if (preset?.mezzo && !all.some((m) => m.id === preset.mezzo.id)) all.unshift(preset.mezzo);
    return all.filter((m, i) => all.findIndex((x) => x.id === m.id) === i);
  }, [home, preset]);
  const mezzo = mezzi.find((m) => m.id === mezzoId) || null;
  const isUrgent = urgente || tipo === "infortunio";

  const applyAi = (r) => {
    setVoice(r.audio_url ? r : null);
    setTipo(r.tipo);
    setDettagli(r.dettagli);
    if (r.urgente) setUrgente(true);
    if (r.mezzo_id) setMezzoId(r.mezzo_id);
    setTesto(r.originale);
    toast({ title: t("ai_fatto") });
  };

  const startRec = async () => {
    if (rec !== "idle") return;
    try { recorder.current = createRecorder(); await recorder.current.start(); setRec("rec"); }
    catch { toast({ title: t("errore"), description: "Microfono non disponibile", variant: "destructive" }); }
  };
  const stopRec = async () => {
    if (rec !== "rec") return;
    setRec("busy");
    try {
      const file = await recorder.current.stop();
      if (file) applyAi(await aiReport({ file, mezzi }));
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setRec("idle"); }
  };
  const fillFromText = async () => {
    if (!testo.trim()) return;
    setAiBusy(true);
    try { const r = await aiReport({ text: testo, mezzi }); applyAi({ ...r, audio_url: "", originale: testo }); setVoice({ ...r, audio_url: "", originale: testo }); }
    catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setAiBusy(false); }
  };

  const send = async () => {
    if (!testo.trim() && !files.length && !Object.keys(dettagli).length) return toast({ title: t("cosa_succede"), variant: "destructive" });
    setBusy(true);
    try {
      const sameAsAi = voice && testo.trim() === voice.originale.trim();
      const clean = Object.fromEntries((REPORT_FIELDS[tipo] || []).filter((f) => dettagli[f.k] && (!f.when || f.when(dettagli))).map((f) => [f.k, dettagli[f.k]]));
      await sendWorker("segnalazione", {
        tipo, urgente: isUrgent, worksite_id: site, mezzo_id: tipo === "guasto" && mezzo?.id && !mezzo.id.includes(":") ? mezzo.id : "", mezzo_nome: tipo === "guasto" ? mezzo?.nome || "" : "",
        testo: sameAsAi ? voice.italiano : testo, testo_originale: sameAsAi && voice.lingua !== "it" ? voice.originale : !sameAsAi && lang !== "it" ? testo : "",
        lingua: voice?.lingua || lang, audio_url: voice?.audio_url || "", dettagli: clean,
      }, { files, field: "foto_urls" });
      toast({ title: t("segnalazione_ok") });
      setTesto(""); setVoice(null); setFiles([]); setUrgente(false); setDettagli({}); setMezzoId(""); onSent?.();
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <Card>
        <button type="button" onPointerDown={startRec} onPointerUp={stopRec} onPointerLeave={stopRec} onContextMenu={(e) => e.preventDefault()} disabled={rec === "busy"}
          className={`w-full h-24 rounded-2xl font-semibold flex items-center justify-center gap-3 select-none touch-none transition ${rec === "rec" ? "bg-red-600 text-white animate-pulse" : "text-white bg-[radial-gradient(120%_120%_at_20%_0%,#3f3f46,#09090b)]"}`} aria-label={t("parla")}>
          {rec === "busy" ? <Loader2 className="w-7 h-7 animate-spin" /> : rec === "rec" ? <Square className="w-7 h-7" /> : <span className="grid place-items-center w-12 h-12 rounded-full bg-brand-600 shadow-[0_0_0_6px_rgba(195,18,42,0.25)]"><Mic className="w-6 h-6" /></span>}
          <span className="text-left">
            <span className="block text-base">{rec === "busy" ? t("ai_compilo") : rec === "rec" ? t("registrando") : t("parla")}</span>
            {rec === "idle" && <span className="flex items-center gap-1 text-xs font-normal text-zinc-300"><Sparkles className="w-3 h-3 text-amber-300" aria-hidden="true" />{t("ai_compila")}</span>}
          </span>
        </button>
        <p className="text-xs text-zinc-500 mt-2 text-center">{t("ai_hint_segnala")}</p>
      </Card>

      <Card title={t("segnala_problema")}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1.5">
            {TIPI.map(([k, label, I]) => (
              <button key={k} type="button" onClick={() => { setTipo(k); setDettagli({}); }} aria-pressed={tipo === k} className={`min-h-[52px] rounded-xl border px-2.5 text-sm font-medium flex items-center gap-2 text-left ${tipo === k ? (k === "infortunio" ? "border-red-600 bg-red-50 text-red-800" : "border-brand-600 bg-brand-50 text-brand-800") : "border-zinc-200 text-zinc-700"}`}>
                <I className="w-4 h-4 shrink-0" aria-hidden="true" />{t(label)}
              </button>
            ))}
          </div>

          {tipo === "infortunio" && (
            <a href="tel:112" className="flex items-center gap-3 rounded-xl bg-red-600 text-white p-3">
              <Phone className="w-5 h-5 shrink-0" aria-hidden="true" /><span className="flex-1 text-sm font-semibold">{t("emergenza")}</span><span className="rounded-lg bg-white text-red-700 font-bold text-sm px-3 py-1.5">{t("chiama_112")}</span>
            </a>
          )}

          <Field label={t("cantiere")}>
            <select value={site} onChange={(e) => setSite(e.target.value)} className={inputCls}>
              <option value="">{t("nessuno")}</option>
              {home.altri_cantieri.map((w) => <option key={w.id} value={w.id}>{w.nome}</option>)}
            </select>
          </Field>

          {tipo === "guasto" && (
            <Field label={t("mezzo")}>
              <select value={mezzoId} onChange={(e) => setMezzoId(e.target.value)} className={inputCls}>
                <option value="">{mezzi.length ? t("scegli_mezzo") : t("mezzo_altro")}</option>
                {mezzi.map((m) => <option key={m.id} value={m.id}>{[m.nome, m.targa].filter(Boolean).join(" · ")}</option>)}
              </select>
            </Field>
          )}

          <Details tipo={tipo} value={dettagli} onChange={setDettagli} t={t} />

          <Field label={t("cosa_succede")}>
            <textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={4} className="w-full rounded-xl border border-zinc-300 p-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500" />
          </Field>
          {voice && voice.lingua !== "it" && testo.trim() === voice.originale.trim() && <p className="text-xs text-zinc-500 -mt-2">IT: {voice.italiano}</p>}
          {testo.trim().length > 8 && !(voice && testo.trim() === voice.originale.trim()) && <AiButton busy={aiBusy} onClick={fillFromText} className="w-full">{aiBusy ? t("ai_compilo") : t("ai_compila")}</AiButton>}

          <div className="flex flex-wrap gap-2 items-center">
            {files.map((f, i) => <span key={i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-zinc-100"><img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" /><button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white grid place-items-center" aria-label={t("annulla")}><X className="w-3 h-3" /></button></span>)}
            <label className="h-16 px-4 rounded-lg border-2 border-dashed border-zinc-300 flex items-center gap-2 text-sm font-medium text-zinc-700 cursor-pointer"><Camera className="w-4 h-4" aria-hidden="true" />{t("aggiungi_foto")}<input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { setFiles([...files, ...e.target.files]); e.target.value = ""; }} /></label>
          </div>
          <label className="flex items-center gap-3 text-base font-medium"><input type="checkbox" checked={isUrgent} disabled={tipo === "infortunio"} onChange={(e) => setUrgente(e.target.checked)} className="w-5 h-5 accent-[#c3122a]" />{t("urgente")}</label>
          <BigButton onClick={send} disabled={busy || rec !== "idle" || aiBusy}>{busy && <Loader2 className="w-5 h-5 animate-spin" />}{t("invia")}</BigButton>
        </div>
      </Card>

      {home.segnalazioni.length > 0 && (
        <Card title={t("le_tue_segnalazioni")}>
          <ul className="divide-y divide-zinc-100 -my-1">
            {home.segnalazioni.map((s) => {
              const tp = TIPI.find((x) => x[0] === s.tipo);
              return (
                <li key={s.id} className="py-2.5 flex items-start gap-3">
                  <span className="text-xs text-zinc-500 w-14 shrink-0 tabular-nums">{fmtDay(s.created_date, lang)}</span>
                  <span className="flex-1 text-sm text-zinc-800"><b className="font-semibold">{tp ? t(tp[1]) : s.tipo}</b>{s.testo_originale || s.testo ? ` · ${(s.testo_originale || s.testo).slice(0, 90)}` : ""}</span>
                  <Pill tone={s.stato === "chiusa" ? "green" : "amber"}>{s.stato === "chiusa" ? t("chiusa") : t("aperta")}</Pill>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
