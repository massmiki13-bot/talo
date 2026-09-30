import React, { useRef, useState } from "react";
import { Mic, Square, Loader2, Camera, X, Package, Wrench, ShieldAlert, Ambulance, MessageSquare } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { sendWorker, transcribe, createRecorder } from "@/lib/worker";
import { Card, BigButton, Pill, fmtDay } from "./ui";

const TIPI = [["materiale", "t_materiale", Package], ["guasto", "t_guasto", Wrench], ["sicurezza", "t_sicurezza", ShieldAlert], ["infortunio", "t_infortunio", Ambulance], ["altro", "t_altro", MessageSquare]];

// Segnalazioni al capo: tipo, testo o voce (trascritta e tradotta dall'IA), foto, cantiere o mezzo.
export default function ReportTab({ home, t, lang, preset, onSent }) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState(preset?.tipo || "materiale");
  const [urgente, setUrgente] = useState(false);
  const [testo, setTesto] = useState("");
  const [voice, setVoice] = useState(null); // { audio_url, originale, italiano, lingua }
  const [files, setFiles] = useState([]);
  const [site, setSite] = useState(home.worksites[0]?.id || "");
  const [mezzo, setMezzo] = useState(preset?.mezzo || null);
  const [rec, setRec] = useState("idle"); // idle | rec | busy
  const [busy, setBusy] = useState(false);
  const recorder = useRef(null);

  const startRec = async () => {
    try { recorder.current = createRecorder(); await recorder.current.start(); setRec("rec"); }
    catch { toast({ title: t("errore"), description: "Microfono non disponibile", variant: "destructive" }); }
  };
  const stopRec = async () => {
    if (rec !== "rec") return;
    setRec("busy");
    try {
      const file = await recorder.current.stop();
      if (!file) { setRec("idle"); return; }
      const v = await transcribe(file);
      setVoice(v);
      setTesto((x) => [x, v.originale].filter(Boolean).join("\n"));
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setRec("idle"); }
  };

  const send = async () => {
    if (!testo.trim() && !files.length) return toast({ title: t("cosa_succede"), variant: "destructive" });
    setBusy(true);
    try {
      const sameAsVoice = voice && testo.trim() === voice.originale.trim();
      await sendWorker("segnalazione", {
        tipo, urgente: urgente || tipo === "infortunio", worksite_id: site, mezzo_id: mezzo?.id || "", mezzo_nome: mezzo?.nome || "",
        testo: sameAsVoice ? voice.italiano : testo, testo_originale: sameAsVoice && voice.lingua !== "it" ? voice.originale : lang !== "it" ? testo : "",
        lingua: voice?.lingua || lang, audio_url: voice?.audio_url || "",
      }, { files, field: "foto_urls" });
      toast({ title: t("segnalazione_ok") });
      setTesto(""); setVoice(null); setFiles([]); setUrgente(false); setMezzo(null); onSent?.();
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <Card title={t("segnala_problema")}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {TIPI.map(([k, label, I]) => (
              <button key={k} type="button" onClick={() => setTipo(k)} className={`min-h-[52px] rounded-xl border px-2.5 text-sm font-medium flex items-center gap-2 text-left ${tipo === k ? (k === "infortunio" ? "border-red-600 bg-red-50 text-red-800" : "border-brand-600 bg-brand-50 text-brand-800") : "border-zinc-200 text-zinc-700"}`}>
                <I className="w-4 h-4 shrink-0" aria-hidden="true" />{t(label)}
              </button>
            ))}
          </div>
          {mezzo && <p className="text-sm text-zinc-700 flex items-center gap-2"><Wrench className="w-4 h-4" aria-hidden="true" />{mezzo.nome} <button type="button" onClick={() => setMezzo(null)} className="text-zinc-400" aria-label={t("annulla")}><X className="w-4 h-4" /></button></p>}
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">{t("cantiere")}</span>
            <select value={site} onChange={(e) => setSite(e.target.value)} className="mt-1 w-full h-12 rounded-xl border border-zinc-300 bg-white px-3 text-base">
              <option value="">{t("nessuno")}</option>
              {home.altri_cantieri.map((w) => <option key={w.id} value={w.id}>{w.nome}</option>)}
            </select>
          </label>

          <button type="button" onPointerDown={startRec} onPointerUp={stopRec} onPointerLeave={stopRec} disabled={rec === "busy"}
            className={`w-full h-20 rounded-2xl font-semibold flex items-center justify-center gap-3 select-none touch-none ${rec === "rec" ? "bg-red-600 text-white animate-pulse" : "bg-zinc-950 text-white"}`} aria-label={t("parla")}>
            {rec === "busy" ? <Loader2 className="w-6 h-6 animate-spin" /> : rec === "rec" ? <Square className="w-6 h-6" /> : <Mic className="w-7 h-7" />}
            {rec === "busy" ? t("trascrivo") : rec === "rec" ? t("registrando") : t("parla")}
          </button>
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">{t("cosa_succede")}</span>
            <textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-zinc-300 p-3 text-base" />
          </label>
          {voice && voice.lingua !== "it" && testo.trim() === voice.originale.trim() && <p className="text-xs text-zinc-500">IT: {voice.italiano}</p>}

          <div className="flex flex-wrap gap-2 items-center">
            {files.map((f, i) => <span key={i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-zinc-100"><img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" /><button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white grid place-items-center" aria-label={t("annulla")}><X className="w-3 h-3" /></button></span>)}
            <label className="h-16 px-4 rounded-lg border-2 border-dashed border-zinc-300 flex items-center gap-2 text-sm font-medium text-zinc-700 cursor-pointer"><Camera className="w-4 h-4" aria-hidden="true" />{t("aggiungi_foto")}<input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { setFiles([...files, ...e.target.files]); e.target.value = ""; }} /></label>
          </div>
          <label className="flex items-center gap-3 text-base font-medium"><input type="checkbox" checked={urgente || tipo === "infortunio"} onChange={(e) => setUrgente(e.target.checked)} className="w-5 h-5 accent-[#c3122a]" />{t("urgente")}</label>
          <BigButton onClick={send} disabled={busy || rec !== "idle"}>{busy && <Loader2 className="w-5 h-5 animate-spin" />}{t("invia")}</BigButton>
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
