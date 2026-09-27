import React, { useState, useEffect } from "react";
import { api, db } from "@/lib/db";
import { useToast } from "@/components/ui/use-toast";
import { Camera, Trash2, Upload, Loader2 } from "lucide-react";

const FASI = [
  { value: "prima", label: "Prima", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "durante", label: "Durante", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "dopo", label: "Dopo", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

export default function WorksitePhotos({ worksiteId }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeFase, setActiveFase] = useState("prima");
  const [didascalia, setDidascalia] = useState("");
  const { toast } = useToast();

  useEffect(() => { load(); }, [worksiteId]);

  const load = async () => {
    try {
      setPhotos(await db.WorksitePhoto.filter({ worksite_id: worksiteId }, "-data"));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      await db.WorksitePhoto.create({
        worksite_id: worksiteId,
        foto_url: file_url,
        fase: activeFase,
        didascalia: didascalia || "",
        data: new Date().toISOString().slice(0, 10),
      });
      setDidascalia("");
      load();
      toast({ title: "Foto caricata" });
    } catch (e) { toast({ title: "Errore upload", variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const handleDelete = async (photoId) => {
    if (!confirm("Eliminare questa foto?")) return;
    await db.WorksitePhoto.delete(photoId);
    load();
  };

  if (loading) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Camera className="w-4 h-4 text-blue-600" /> Foto di Avanzamento
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
          <div className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors h-10">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            <span>Scatta foto</span>
          </div>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

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
                    <p className="text-[10px] text-slate-400 px-2 pb-1">{photo.data ? new Date(photo.data).toLocaleDateString("it-IT") : ""}</p>
                    <button
                      onClick={() => handleDelete(photo.id)}
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
        {photos.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Nessuna foto. Carica la prima foto di avanzamento.</p>
        )}
      </div>
    </div>
  );
}