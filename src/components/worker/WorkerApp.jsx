import React, { useCallback, useEffect, useState } from "react";
import { Home, Camera, AlertTriangle, CalendarDays, Menu, Loader2 } from "lucide-react";
import { api } from "@/lib/db";
import { translator, savedLang, saveLang, LANGS } from "@/lib/workerI18n";
import TodayTab from "./TodayTab";
import { locale } from "./ui";
import PhotosTab from "./PhotosTab";
import ReportTab from "./ReportTab";
import HoursTab from "./HoursTab";
import MoreTab from "./MoreTab";

const TABS = [["oggi", "oggi", Home], ["foto", "foto", Camera], ["segnala", "segnala", AlertTriangle], ["ore", "ore", CalendarDays], ["altro", "altro", Menu]];

// App per gli operai: semplice, in italiano, rumeno o albanese, pensata per il telefono in cantiere.
export default function WorkerApp() {
  const [home, setHome] = useState(null);
  const [error, setError] = useState("");
  const [lang, setLangState] = useState(savedLang() || "it");
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("t") || "oggi");
  const [section, setSection] = useState(null);
  const [preset, setPreset] = useState(null);
  const t = translator(lang);

  const load = useCallback(() => api.operaio.home().then((h) => {
    setHome(h);
    if (!savedLang() && h.employee?.lingua) setLangState(h.employee.lingua);
  }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = (l) => { setLangState(l); saveLang(l); api.operaio.submit("lingua", { lingua: l }).catch(() => {}); };
  const go = (k, sec = null) => { setTab(k); setSection(sec); window.scrollTo(0, 0); };

  if (error) return <div className="min-h-[60vh] grid place-items-center p-6 text-center"><div><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" aria-hidden="true" /><p className="mt-3 font-semibold">{t("errore")}</p><p className="text-sm text-zinc-600 mt-1">{error}</p></div></div>;
  if (!home) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-zinc-400" aria-label="…" /></div>;

  const unread = home.avvisi.filter((a) => !a.letto).length;

  return (
    <div data-no-translate className="-m-4 sm:-m-6 lg:-m-8 min-h-screen bg-zinc-100 pb-24">
      <header className="brushed text-white px-4 pt-5 pb-6">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {home.company?.logo_url ? <img src={home.company.logo_url} alt="" className="h-9 w-9 rounded-lg object-contain bg-white p-0.5" /> : null}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-300 truncate">{home.company?.ragione_sociale}<span className="text-zinc-400"> · {new Date().toLocaleDateString(locale(lang), { weekday: "long", day: "numeric", month: "long" })}</span></p>
            <h1 className="font-display text-2xl font-bold uppercase leading-tight truncate">{t("ciao")}, {home.employee.nome}</h1>
          </div>
          <div className="flex rounded-lg bg-white/10 p-0.5" role="group" aria-label={t("lingua")}>
            {LANGS.map((l) => <button key={l.code} type="button" onClick={() => setLang(l.code)} aria-pressed={lang === l.code} className={`h-8 px-2 rounded-md text-xs font-bold ${lang === l.code ? "bg-white text-zinc-950" : "text-zinc-300"}`}>{l.short}</button>)}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 -mt-3">
        {tab === "oggi" && <TodayTab home={home} t={t} go={go} />}
        {tab === "foto" && <PhotosTab home={home} t={t} onSent={load} />}
        {tab === "segnala" && <ReportTab key={preset?.mezzo?.id || "r"} home={home} t={t} lang={lang} preset={preset} onSent={() => { setPreset(null); load(); }} />}
        {tab === "ore" && <HoursTab home={home} t={t} lang={lang} onSent={load} />}
        {tab === "altro" && <MoreTab home={home} t={t} lang={lang} setLang={setLang} section={section} setSection={setSection} onChanged={load}
          onGuasto={(m) => { setPreset({ tipo: "guasto", mezzo: m }); go("segnala"); }} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-zinc-200 pb-[env(safe-area-inset-bottom)]" aria-label="Menu">
        <div className="max-w-lg mx-auto grid grid-cols-5">
          {TABS.map(([k, label, I]) => (
            <button key={k} type="button" onClick={() => go(k)} aria-current={tab === k ? "page" : undefined} className={`relative h-16 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${tab === k ? "text-brand-700" : "text-zinc-500"}`}>
              <I className={`w-6 h-6 ${k === "segnala" && tab !== k ? "text-red-600" : ""}`} aria-hidden="true" />{t(label)}
              {k === "altro" && unread > 0 && <span className="absolute top-2 right-[calc(50%-18px)] w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] grid place-items-center">{unread}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
