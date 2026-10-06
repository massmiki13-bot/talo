import React, { useState, useEffect } from "react";
import { confirmDialog } from "@/components/shared/ConfirmHost";
import { api, db } from "@/lib/db";
import { useToast } from "@/components/ui/use-toast";
import { Camera, Trash2, Loader2, CloudOff } from "lucide-react";
import { isNetworkError, onQueueChange } from "@/lib/offlineStore";
import { queuePhoto, pendingFor } from "@/lib/offlineSync";

const FASI = [
  { value: "prima", label: "Prima", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "durante", label: "Durante", color: "bg-zinc-200 text-zinc-800 border-zinc-300" },
  { value: "dopo", label: "Dopo", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

export default function WorksitePhotos({ worksiteId }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeFase, setActiveFase] = useState("prima");
  const [didascalia, setDidascalia] = useState("");
  const { toast } = useToast();

  const [pending, setPending] = useState([]);

  useEffect(() => { load(); loadPending(); }, [worksiteId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onQueueChange(() => { loadPending(); load(); }), [worksiteId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.url)), [pending]);

  const load = async () => {
    try {
      setPhotos(await db.WorksitePhoto.filter({ worksite_id: worksiteId }, "-data"));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  // foto scattate senza rete, in attesa di essere caricate
  const loadPending = async () => {
    const items = await pendingFor("photo", (x) => x.worksite_id === worksiteId);
    setPending(items.map((x) => ({ id: x.id, url: URL.createObjectURL(x.blob), fase: x.fase, didascalia: x.didascalia })));
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    const meta = { worksite_id: worksiteId, fase: activeFase, didascalia: didascalia || "", data: new Date().toISOString().slice(0, 10) };
    const offline = async () => {
      await queuePhoto({ file, ...meta });
      setDidascalia("");
      loadPending();
      toast({ title: "Foto salvata sul telefono", description: "Sei senza rete: verrà caricata da sola appena torna la connessione." });
    };
    try {
      if (!navigator.onLine) { await offline(); return; }
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      await db.WorksitePhoto.create({ ...meta, foto_url: file_url });
      setDidascalia("");
      load();
      toast({ title: "Foto caricata" });
    } catch (err) {
      if (isNetworkError(err)) await offline();
      else toast({ title: "Errore upload", description: err.message, variant: "destructive" });
    }
    finally { setUploading(false); }
  };

  const handleDelete = async (photoId) => {
    if (!(await confirmDialog("Eliminare questa foto?"))) return;
    await db.WorksitePhoto.delete(photoId);
    load();
  };

  if (loading) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Camera className="w-4 h-4 text-brand-600" /> Foto di Avanzamento
      </h3>

      {/* Fase selector + upload */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 mb-4">
        <div className="flex gap-2">
          {FASI.map(f => (
            <button
              key={f.value}
              onClick={() => setActiveFase(f.value)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex-1 sm:flex-none ${activeFase === f.value ? f.color : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={didascalia}
          onChange={e => setDidascalia(e.target.value)}
          placeholder="Didascalia (opzionale)…"
          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-xs h-10"
        />
        <label className="cursor-pointer flex-shrink-0">
          <div className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors h-10">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            <span>Scatta foto</span>
          </div>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {pending.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-amber-800 uppercase mb-2 flex items-center gap-1.5"><CloudOff className="w-3.5 h-3.5" aria-hidden="true" />In attesa di connessione ({pending.length})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {pending.map((p) => (
              <div key={p.id} className="relative rounded-lg overflow-hidden border border-amber-200">
                <img src={p.url} alt={p.didascalia || "Foto in attesa di caricamento"} className="w-full h-32 object-cover opacity-80" />
                <p className="text-xs text-slate-600 px-2 py-1 truncate">{FASI.find((f) => f.value === p.fase)?.label}{p.didascalia ? ` · ${p.didascalia}` : ""}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photos by fase */}
      <div className="space-y-4">
        {FASI.map(fase => {
          const fasePhotos = photos.filter(p => p.fase === fase.value);
          if (fasePhotos.length === 0) return null;
          return (
            <div key={fase.value}>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{fase.label}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {fasePhotos.map(photo => (
                  <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-slate-200">
                    <img src={photo.foto_url} alt={photo.didascalia || ""} className="w-full h-32 object-cover" />
                    {photo.didascalia && (
                      <p className="text-xs text-slate-600 px-2 py-1 truncate">{photo.didascalia}</p>
                    )}
                    <p className="text-[10px] text-slate-500 px-2 pb-1">{photo.data ? new Date(photo.data).toLocaleDateString("it-IT") : ""}</p>
                    <button
                      onClick={() => handleDelete(photo.id)}
                      aria-label="Elimina la foto"
                      className="absolute top-1 right-1 p-1.5 bg-red-500/80 rounded-full text-white md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {photos.length === 0 && pending.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-6">Nessuna foto. Carica la prima foto di avanzamento.</p>
        )}
      </div>
    </div>
  );
}