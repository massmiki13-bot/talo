import React from "react";
import { Camera, Images, Loader2 } from "lucide-react";

/**
 * Due modi per aggiungere foto: scattarla ora (fotocamera) o sceglierla dalla galleria / dai file.
 * Su telefono `capture` apre direttamente la fotocamera; il secondo pulsante, senza `capture`, apre la galleria.
 *
 * variant: "buttons" (due pulsanti affiancati), "tiles" (due riquadri grandi tratteggiati), "compact" (due riquadri piccoli).
 */
export default function CameraOrGallery({
  onFiles, accept = "image/*", multiple = false, disabled = false, busy = false, variant = "buttons",
  cameraLabel = "Scatta foto", galleryLabel = "Dalla galleria", facing = "environment", className = "", tileClass = "",
}) {
  const pick = (e) => { const list = [...(e.target.files || [])]; e.target.value = ""; if (list.length) onFiles(list); };
  const input = (camera) => (
    <input type="file" accept={camera ? accept.split(",").filter((a) => a.startsWith("image")).join(",") || "image/*" : accept}
      {...(camera ? { capture: facing } : {})} multiple={multiple} className="hidden" disabled={disabled || busy} onChange={pick} />
  );
  const Icon = ({ camera, cls }) => (busy && camera ? <Loader2 className={`${cls} animate-spin`} /> : camera ? <Camera className={cls} aria-hidden="true" /> : <Images className={cls} aria-hidden="true" />);

  if (variant === "tiles") {
    return (
      <div className={`grid grid-cols-2 gap-2 ${className}`}>
        {[true, false].map((camera) => (
          <label key={String(camera)} className={`rounded-2xl border-2 border-dashed border-zinc-300 hover:border-brand-400 hover:bg-brand-50/40 flex flex-col items-center justify-center gap-2 p-4 text-center font-semibold text-zinc-800 transition-colors ${disabled || busy ? "pointer-events-none opacity-60" : "cursor-pointer"} ${tileClass || "h-32"}`}>
            <Icon camera={camera} cls={`w-7 h-7 ${camera ? "text-brand-600" : "text-zinc-500"}`} />
            <span className="text-sm leading-tight">{camera ? cameraLabel : galleryLabel}</span>
            {input(camera)}
          </label>
        ))}
      </div>
    );
  }
  if (variant === "compact") {
    return (
      <div className={`flex gap-2 ${className}`}>
        {[true, false].map((camera) => (
          <label key={String(camera)} className={`h-16 px-3 rounded-lg border-2 border-dashed border-zinc-300 hover:border-brand-400 flex items-center gap-2 text-sm font-medium text-zinc-700 ${disabled || busy ? "pointer-events-none opacity-60" : "cursor-pointer"} ${tileClass}`}>
            <Icon camera={camera} cls="w-4 h-4 shrink-0" />
            <span className="leading-tight">{camera ? cameraLabel : galleryLabel}</span>
            {input(camera)}
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className={`flex gap-2 ${className}`}>
      {[true, false].map((camera) => (
        <label key={String(camera)} className={`flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-sm font-medium transition-colors ${disabled || busy ? "pointer-events-none opacity-60" : "cursor-pointer"} ${camera ? "bg-brand-600 hover:bg-brand-700 text-white" : "border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800"}`}>
          <Icon camera={camera} cls="w-4 h-4" />
          <span>{camera ? cameraLabel : galleryLabel}</span>
          {input(camera)}
        </label>
      ))}
    </div>
  );
}
