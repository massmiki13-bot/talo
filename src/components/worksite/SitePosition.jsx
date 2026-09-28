import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Crosshair, Search, Loader2, X } from "lucide-react";
import { currentPosition } from "@/lib/timbrature";

// Posizione del cantiere per le timbrature: dal telefono sul posto o cercando l'indirizzo (OpenStreetMap).
export default function SitePosition({ lat, lng, indirizzo, onChange }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const has = lat != null && lat !== "" && lng != null && lng !== "";

  const here = async () => {
    setBusy("gps"); setMsg("");
    const p = await currentPosition();
    setBusy("");
    if (!p) return setMsg("Posizione non disponibile: consenti l'accesso alla posizione nel browser.");
    onChange({ lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5 });
    setMsg(`Posizione rilevata (precisione ${Math.round(p.accuracy)} m).`);
  };

  const fromAddress = async () => {
    if (!indirizzo?.trim()) return setMsg("Scrivi prima l'indirizzo del cantiere.");
    setBusy("addr"); setMsg("");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=${encodeURIComponent(indirizzo)}`, { headers: { "Accept-Language": "it" } });
      const [hit] = await r.json();
      if (!hit) setMsg("Indirizzo non trovato: prova a scriverlo con via, numero e comune, oppure usa la posizione dal cantiere.");
      else { onChange({ lat: Math.round(Number(hit.lat) * 1e5) / 1e5, lng: Math.round(Number(hit.lon) * 1e5) / 1e5 }); setMsg(`Trovato: ${hit.display_name}`); }
    } catch { setMsg("Ricerca non riuscita, riprova."); }
    finally { setBusy(""); }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className={`w-4 h-4 ${has ? "text-emerald-600" : "text-slate-500"}`} aria-hidden="true" />
        <span className="text-sm font-medium text-slate-900">Posizione per le timbrature</span>
        {has && (
          <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline tabular-nums">{lat}, {lng}</a>
        )}
        {has && <button type="button" onClick={() => { onChange({ lat: "", lng: "" }); setMsg(""); }} className="text-slate-500 hover:text-red-600" aria-label="Rimuovi la posizione"><X className="w-4 h-4" /></button>}
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={fromAddress} disabled={!!busy} className="gap-1.5">{busy === "addr" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}Dall'indirizzo</Button>
          <Button type="button" size="sm" variant="outline" onClick={here} disabled={!!busy} className="gap-1.5">{busy === "gps" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}Sono in cantiere</Button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-1.5">{msg || "Serve a verificare che le timbrature avvengano in cantiere (solo se la posizione alla timbratura è attiva)."}</p>
    </div>
  );
}
