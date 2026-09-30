import React, { useMemo, useState } from "react";
import { Camera, X, Loader2, FileText, Trash2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/db";
import { readDdt } from "@/lib/ddt";
import { sendWorker } from "@/lib/worker";
import { PHOTO_CATEGORIES, aiPhoto } from "@/lib/workerFields";
import { Card, BigButton, Field, Choice, AiButton, inputCls } from "./ui";

function SitePicker({ home, value, onChange, t }) {
  const sites = useMemo(() => {
    const mine = home.worksites.map((w) => ({ id: w.id, nome: w.nome }));
    return [...mine, ...home.altri_cantieri.filter((w) => !mine.some((m) => m.id === w.id))];
  }, [home]);
  return (
    <Field label={t("cantiere")}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">{t("scegli_cantiere")}</option>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
    </Field>
  );
}

// Foto di cantiere (anche più insieme, anche offline, descritte dall'IA) e bolle di consegna lette dall'IA e controllate.
export default function PhotosTab({ home, t, onSent }) {
  const { toast } = useToast();
  const [mode, setMode] = useState("foto");
  const [site, setSite] = useState(home.worksites[0]?.id || "");
  const [fase, setFase] = useState("durante");
  const [categoria, setCategoria] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState("");
  const [ddt, setDdt] = useState(null);

  const previews = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f) })), [files]);

  const describe = async () => {
    if (!files.length) return;
    setBusy("ai");
    try {
      const r = await aiPhoto(files[0]);
      if (r.didascalia) setNote(r.didascalia);
      if (r.categoria) setCategoria(r.categoria);
      if (r.fase) setFase(r.fase);
      toast({ title: t("ai_fatto") });
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(""); }
  };

  const sendPhotos = async () => {
    if (!site || !files.length) return;
    setBusy("send");
    let queued = false;
    try {
      for (const f of files) {
        const r = await sendWorker("foto", { worksite_id: site, fase, categoria, didascalia: note }, { files: [f], field: "foto_url" });
        queued ||= r.queued;
      }
      toast({ title: queued ? t("foto_offline") : t("foto_inviate") });
      setFiles([]); setNote(""); setCategoria(""); onSent?.();
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(""); }
  };

  const readBolla = async (file) => {
    if (!file) return;
    setBusy("ddt");
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      const r = await readDdt(file_url, home.altri_cantieri);
      setDdt({ ...r, file_url, conforme: "conforme", note_consegna: "" });
      if (r.worksite_id) setSite(r.worksite_id);
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(""); }
  };
  const setRiga = (i, patch) => setDdt({ ...ddt, righe: ddt.righe.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const sendBolla = async () => {
    if (!site) return toast({ title: t("scegli_cantiere"), variant: "destructive" });
    setBusy("send");
    try {
      const righe = ddt.righe.filter((r) => r.descrizione?.trim()).map((r) => ({ ...r, quantita: Number(String(r.quantita).replace(",", ".")) || 0 }));
      await sendWorker("ddt", {
        worksite_id: site, descrizione: `DDT${ddt.numero ? ` n. ${ddt.numero}` : ""}${ddt.fornitore ? ` – ${ddt.fornitore}` : ""}`, importo: ddt.importo || 0, data: ddt.data, fornitore: ddt.fornitore,
        file_url: ddt.file_url,
        ddt: { numero: ddt.numero, destinazione: ddt.destinazione, righe, conforme: ddt.conforme !== "non_conforme", note_consegna: ddt.conforme === "non_conforme" ? ddt.note_consegna : "" },
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
          <div className="space-y-4">
            <SitePicker home={home} value={site} onChange={setSite} t={t} />
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
              <div className={`${files.length ? "h-14" : "h-36 flex-col"} rounded-2xl border-2 border-dashed border-zinc-300 flex items-center justify-center gap-2 font-semibold text-zinc-800`}><Camera className={files.length ? "w-5 h-5" : "w-8 h-8 text-zinc-400"} aria-hidden="true" />{t("scatta_foto")}</div>
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { setFiles([...files, ...e.target.files]); e.target.value = ""; }} />
            </label>
            {files.length > 0 && (
              <>
                <AiButton busy={busy === "ai"} onClick={describe} className="w-full">{busy === "ai" ? t("ai_descrivo") : t("ai_descrivi")}</AiButton>
                <Choice label={t("fase")} value={fase} onChange={(v) => setFase(v || "durante")} cols={3} options={[["prima", t("prima")], ["durante", t("durante")], ["dopo", t("dopo")]]} />
                <Field label={t("lavorazione")}>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {PHOTO_CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
                  </select>
                </Field>
                <Field label={t("didascalia")}>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} className="w-full rounded-xl border border-zinc-300 p-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500" />
                </Field>
              </>
            )}
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
          <div className="space-y-4">
            <SitePicker home={home} value={site} onChange={setSite} t={t} />
            <Field label={t("fornitore")}><input value={ddt.fornitore} onChange={(e) => setDdt({ ...ddt, fornitore: e.target.value })} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("numero_bolla")}><input value={ddt.numero} onChange={(e) => setDdt({ ...ddt, numero: e.target.value })} className={inputCls} /></Field>
              <Field label={t("data_bolla")}><input type="date" value={ddt.data} onChange={(e) => setDdt({ ...ddt, data: e.target.value })} className={inputCls} /></Field>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-800 mb-1">{t("materiali")} ({ddt.righe.length})</p>
              <ul className="space-y-2">
                {ddt.righe.map((r, i) => (
                  <li key={i} className="rounded-xl border border-zinc-200 p-2 space-y-2">
                    <input value={r.descrizione} onChange={(e) => setRiga(i, { descrizione: e.target.value })} placeholder={t("descrizione")} aria-label={t("descrizione")} className="w-full h-10 rounded-lg border border-zinc-200 px-2.5 text-[15px]" />
                    <div className="flex gap-2">
                      <input value={r.quantita} onChange={(e) => setRiga(i, { quantita: e.target.value })} inputMode="decimal" aria-label={t("quantita")} className="w-24 h-10 rounded-lg border border-zinc-200 px-2.5 text-[15px] tabular-nums" />
                      <input value={r.unita} onChange={(e) => setRiga(i, { unita: e.target.value })} placeholder={t("unita")} aria-label={t("unita")} className="w-20 h-10 rounded-lg border border-zinc-200 px-2.5 text-[15px]" />
                      <button type="button" onClick={() => setDdt({ ...ddt, righe: ddt.righe.filter((_, j) => j !== i) })} className="ml-auto w-10 h-10 grid place-items-center text-zinc-400" aria-label={t("annulla")}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setDdt({ ...ddt, righe: [...ddt.righe, { descrizione: "", quantita: "", unita: "", prezzo_unitario: 0, importo: 0 }] })} className="mt-2 h-10 px-3 rounded-lg border border-zinc-300 text-sm font-medium flex items-center gap-1.5"><Plus className="w-4 h-4" />{t("aggiungi_riga")}</button>
            </div>
            <Choice label={t("consegna")} value={ddt.conforme} onChange={(v) => setDdt({ ...ddt, conforme: v || "conforme" })} options={[["conforme", t("conforme")], ["non_conforme", t("non_conforme")]]} tone={ddt.conforme === "non_conforme" ? "red" : "brand"} />
            {ddt.conforme === "non_conforme" && <textarea value={ddt.note_consegna} onChange={(e) => setDdt({ ...ddt, note_consegna: e.target.value })} rows={2} placeholder={t("problemi_ph")} aria-label={t("problemi_ph")} className="w-full rounded-xl border border-zinc-300 p-3 text-base" />}
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
