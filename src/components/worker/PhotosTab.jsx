import React, { useMemo, useState } from "react";
import { Camera, X, Loader2, FileText, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/db";
import { readDdt } from "@/lib/ddt";
import { sendWorker } from "@/lib/worker";
import { Card, BigButton } from "./ui";

function SitePicker({ home, value, onChange, t }) {
  const sites = useMemo(() => {
    const mine = home.worksites.map((w) => ({ id: w.id, nome: w.nome }));
    return [...mine, ...home.altri_cantieri.filter((w) => !mine.some((m) => m.id === w.id))];
  }, [home]);
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-800">{t("cantiere")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full h-12 rounded-xl border border-zinc-300 bg-white px-3 text-base">
        <option value="">{t("scegli_cantiere")}</option>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
    </label>
  );
}

// Foto di cantiere (anche più insieme, anche offline) e bolle di consegna lette dall'IA.
export default function PhotosTab({ home, t, onSent }) {
  const { toast } = useToast();
  const [mode, setMode] = useState("foto");
  const [site, setSite] = useState(home.worksites[0]?.id || "");
  const [fase, setFase] = useState("durante");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState("");
  const [ddt, setDdt] = useState(null);

  const previews = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f) })), [files]);

  const sendPhotos = async () => {
    if (!site || !files.length) return;
    setBusy("send");
    let queued = false;
    try {
      for (const f of files) {
        const r = await sendWorker("foto", { worksite_id: site, fase, didascalia: note }, { files: [f], field: "foto_url" });
        queued ||= r.queued;
      }
      toast({ title: queued ? t("foto_offline") : t("foto_inviate") });
      setFiles([]); setNote(""); onSent?.();
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(""); }
  };

  const readBolla = async (file) => {
    if (!file) return;
    setBusy("ddt");
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      const r = await readDdt(file_url, home.altri_cantieri);
      setDdt({ ...r, file_url });
      if (r.worksite_id) setSite(r.worksite_id);
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(""); }
  };

  const sendBolla = async () => {
    if (!site) return toast({ title: t("scegli_cantiere"), variant: "destructive" });
    setBusy("send");
    try {
      await sendWorker("ddt", {
        worksite_id: site, descrizione: `DDT${ddt.numero ? ` n. ${ddt.numero}` : ""}${ddt.fornitore ? ` – ${ddt.fornitore}` : ""}`, importo: ddt.importo || 0, data: ddt.data, fornitore: ddt.fornitore,
        file_url: ddt.file_url, ddt: { numero: ddt.numero, destinazione: ddt.destinazione, righe: ddt.righe },
      });
      toast({ title: t("bolla_ok") });
      setDdt(null); onSent?.();
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(""); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 bg-white rounded-2xl border border-zinc-200 p-1" role="tablist">
        {[["foto", t("foto")], ["ddt", t("bolla")]].map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`h-11 rounded-xl text-sm font-semibold ${mode === k ? "bg-zinc-950 text-white" : "text-zinc-700"}`}>{l}</button>)}
      </div>

      {mode === "foto" ? (
        <Card>
          <div className="space-y-3">
            <SitePicker home={home} value={site} onChange={setSite} t={t} />
            <div className="grid grid-cols-3 gap-1.5">
              {[["prima", t("prima")], ["durante", t("durante")], ["dopo", t("dopo")]].map(([k, l]) => <button key={k} type="button" onClick={() => setFase(k)} className={`h-11 rounded-xl text-sm font-medium border ${fase === k ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-200 text-zinc-700"}`}>{l}</button>)}
            </div>
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">{t("didascalia")}</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-3 text-base" />
            </label>
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((p, i) => (
                  <div key={p.url} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100">
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white grid place-items-center" aria-label={t("annulla")}><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
            <label className="block">
              <div className="h-14 rounded-2xl border-2 border-dashed border-zinc-300 flex items-center justify-center gap-2 font-semibold text-zinc-800"><Camera className="w-5 h-5" aria-hidden="true" />{t("scatta_foto")}</div>
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { setFiles([...files, ...e.target.files]); e.target.value = ""; }} />
            </label>
            <BigButton onClick={sendPhotos} disabled={!site || !files.length || !!busy}>{busy === "send" ? <Loader2 className="w-5 h-5 animate-spin" /> : null}{t("invia")} {files.length ? `(${files.length})` : ""}</BigButton>
          </div>
        </Card>
      ) : !ddt ? (
        <Card>
          <label className="block">
            <div className="h-40 rounded-2xl border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-2 font-semibold text-zinc-800">
              {busy === "ddt" ? <Loader2 className="w-8 h-8 animate-spin text-brand-600" /> : <FileText className="w-8 h-8 text-zinc-400" aria-hidden="true" />}
              {busy === "ddt" ? t("leggo_bolla") : t("carica_bolla")}
            </div>
            <input type="file" accept="image/*,.pdf" capture="environment" className="hidden" disabled={!!busy} onChange={(e) => { readBolla(e.target.files[0]); e.target.value = ""; }} />
          </label>
        </Card>
      ) : (
        <Card>
          <div className="space-y-3">
            <SitePicker home={home} value={site} onChange={setSite} t={t} />
            <label className="block"><span className="text-sm font-medium text-zinc-800">{t("fornitore")}</span><input value={ddt.fornitore} onChange={(e) => setDdt({ ...ddt, fornitore: e.target.value })} className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-3 text-base" /></label>
            <p className="text-sm font-medium text-zinc-800">{t("materiali")} ({ddt.righe.length})</p>
            <ul className="space-y-1.5">
              {ddt.righe.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{r.descrizione}</span><span className="tabular-nums font-medium whitespace-nowrap">{r.quantita} {r.unita}</span>
                  <button type="button" onClick={() => setDdt({ ...ddt, righe: ddt.righe.filter((_, j) => j !== i) })} className="p-1 text-zinc-400" aria-label={t("annulla")}><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <BigButton onClick={() => setDdt(null)} className="border border-zinc-300 text-zinc-800 bg-white">{t("annulla")}</BigButton>
              <BigButton onClick={sendBolla} disabled={!!busy}>{busy === "send" && <Loader2 className="w-5 h-5 animate-spin" />}{t("registra_bolla")}</BigButton>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
