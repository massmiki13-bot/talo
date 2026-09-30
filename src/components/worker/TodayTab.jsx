import React from "react";
import { MapPin, Navigation, Phone, Users, Truck, FileSignature, Megaphone, ChevronRight, HardHat } from "lucide-react";
import ClockCard from "@/components/attendance/ClockCard";
import { Card, Pill } from "./ui";

const mapsUrl = (w) => (w.lat && w.lng ? `https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}` : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(w.indirizzo || w.nome)}`);

// Oggi: timbratura, cantieri con indirizzo, capocantiere, squadra, mezzi e POS da firmare.
export default function TodayTab({ home, t, go }) {
  const unread = home.avvisi.filter((a) => !a.letto).length;
  return (
    <div className="space-y-3">
      <ClockCard employeeId={home.employee.id} t={t} />

      {unread > 0 && (
        <button type="button" onClick={() => go("altro", "avvisi")} className="w-full rounded-2xl bg-brand-600 text-white p-4 flex items-center gap-3 text-left">
          <Megaphone className="w-6 h-6 shrink-0" aria-hidden="true" />
          <span className="flex-1 font-semibold">{unread} {t("nuovi_avvisi")}</span>
          <ChevronRight className="w-5 h-5" aria-hidden="true" />
        </button>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 pt-2 px-1">{t("i_tuoi_cantieri")}</h2>
      {home.worksites.length === 0 ? (
        <Card><p className="text-sm text-zinc-600 flex items-center gap-2"><HardHat className="w-5 h-5 text-zinc-400" aria-hidden="true" />{t("nessun_cantiere_assegnato")}</p></Card>
      ) : home.worksites.map((w) => (
        <Card key={w.id}>
          <p className="font-display text-xl font-bold uppercase leading-tight text-zinc-950">{w.nome}</p>
          {w.indirizzo && <p className="text-sm text-zinc-600 mt-1 flex items-start gap-1.5"><MapPin className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />{w.indirizzo}</p>}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <a href={mapsUrl(w)} target="_blank" rel="noopener noreferrer" className="h-12 rounded-xl bg-zinc-950 text-white font-semibold flex items-center justify-center gap-2"><Navigation className="w-4 h-4" aria-hidden="true" />{t("naviga")}</a>
            {w.capo?.telefono ? (
              <a href={`tel:${w.capo.telefono.replace(/[^\d+]/g, "")}`} className="h-12 rounded-xl border border-zinc-300 font-semibold flex items-center justify-center gap-2 text-zinc-900"><Phone className="w-4 h-4" aria-hidden="true" />{t("capocantiere")}</a>
            ) : <span />}
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            {w.capo && <div className="flex gap-2"><dt className="text-zinc-500 w-28 shrink-0">{t("capocantiere")}</dt><dd className="text-zinc-900">{w.capo.nome} {w.capo.cognome}</dd></div>}
            {w.squadra.length > 0 && <div className="flex gap-2"><dt className="text-zinc-500 w-28 shrink-0 flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden="true" />{t("squadra")}</dt><dd className="text-zinc-900">{w.squadra.map((s) => `${s.nome} ${s.cognome || ""}`.trim()).join(", ")}</dd></div>}
            {w.mezzi.length > 0 && <div className="flex gap-2"><dt className="text-zinc-500 w-28 shrink-0 flex items-center gap-1"><Truck className="w-3.5 h-3.5" aria-hidden="true" />{t("mezzi")}</dt><dd className="text-zinc-900">{w.mezzi.map((m) => m.nome).join(", ")}</dd></div>}
          </dl>
          {w.pos.filter((p) => !p.firmato).map((p) => (
            <a key={p.firma_token} href={`/firma/${p.firma_token}`} className="mt-3 flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <FileSignature className="w-5 h-5 text-amber-700 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-sm"><span className="block font-semibold text-amber-950">{t("pos_da_firmare")}</span><span className="text-amber-900">{p.titolo}</span></span>
              <Pill tone="amber">{t("firma_ora")}</Pill>
            </a>
          ))}
        </Card>
      ))}
    </div>
  );
}
