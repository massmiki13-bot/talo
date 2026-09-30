import React, { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw, Download, X, AlertTriangle, Share } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { queueAll, onQueueChange, dequeue } from "@/lib/offlineStore";
import { flushQueue } from "@/lib/offlineSync";
import { pendingPunches } from "@/lib/timbrature";

const DISMISS_KEY = "talo.installa.nascosto";
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

// Stato della connessione, modifiche in attesa di invio e installazione dell'app sul telefono.
export default function AppStatusBar() {
  const { toast } = useToast();
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [installEvt, setInstallEvt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  const refresh = useCallback(async () => setQueue(await queueAll()), []);

  const sync = useCallback(async (manual = false) => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const { sent, failed } = await flushQueue();
    setSyncing(false);
    refresh();
    if (sent) toast({ title: "Dati sincronizzati", description: `${sent} modifiche fatte senza rete sono state inviate.` });
    if (failed) toast({ title: "Alcune modifiche non sono state accettate", description: "Controlla l'elenco nella barra in basso.", variant: "destructive" });
    if (manual && !sent && !failed) toast({ title: "Tutto già sincronizzato" });
  }, [refresh, toast]);

  useEffect(() => {
    refresh();
    const off = onQueueChange(refresh);
    const up = () => { setOnline(true); sync(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = setInterval(() => sync(), 60_000);
    sync();
    return () => { off(); window.removeEventListener("online", up); window.removeEventListener("offline", down); clearInterval(timer); };
  }, [refresh, sync]);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* ignore */ }
    if (isStandalone() || dismissed) return;
    const onPrompt = (e) => { e.preventDefault(); setInstallEvt(e); setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // su iPhone non esiste il pulsante automatico: mostriamo come fare, solo da telefono
    if (isIos() && window.innerWidth < 768) setShowInstall(true);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const install = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    const { outcome } = await installEvt.userChoice.catch(() => ({}));
    setInstallEvt(null); setShowInstall(false);
    if (outcome === "accepted") toast({ title: "Talo installata", description: "La trovi tra le app del telefono." });
  };
  const dismissInstall = () => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } setShowInstall(false); };

  const punches = pendingPunches().length;
  const waiting = queue.filter((q) => !q.error).length + punches;
  const errors = queue.filter((q) => q.error);
  const label = (q) => (q.kind === "worker" ? `Invio (${q.submitKind})` : q.kind === "photo" ? `Foto del ${new Date(q.data).toLocaleDateString("it-IT")}` : `Giornaliera del ${new Date(q.date).toLocaleDateString("it-IT")}`);

  if (online && !waiting && !errors.length && !showInstall) return null;

  return (
    <div className="fixed z-40 left-3 right-3 bottom-20 lg:bottom-4 lg:left-auto lg:right-4 lg:w-[360px] space-y-2" role="status" aria-live="polite">
      {(!online || waiting > 0) && (
        <div className={`rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 text-sm ${online ? "bg-white border border-zinc-200 text-zinc-800" : "bg-zinc-900 text-white"}`}>
          {online ? <RefreshCw className={`w-4 h-4 shrink-0 text-brand-600 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" /> : <CloudOff className="w-4 h-4 shrink-0 text-amber-400" aria-hidden="true" />}
          <span className="flex-1 min-w-0">
            {online ? `${waiting} modifiche da inviare` : "Sei offline"}
            {!online && <span className="block text-xs text-zinc-400">{waiting ? `${waiting} modifiche salvate sul telefono: partiranno da sole.` : "Vedi gli ultimi dati scaricati; giornaliera, foto e timbrature restano sul telefono."}</span>}
          </span>
          {online && waiting > 0 && <button type="button" onClick={() => sync(true)} disabled={syncing} className="text-xs font-semibold text-brand-700 hover:underline">Invia ora</button>}
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-xl shadow-lg bg-white border border-red-200 px-4 py-3 text-sm">
          <p className="font-medium text-red-800 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" aria-hidden="true" />Non inviate</p>
          <ul className="mt-1.5 space-y-1">
            {errors.map((q) => (
              <li key={q.id} className="flex items-start gap-2 text-xs text-zinc-700">
                <span className="flex-1"><b>{label(q)}</b>: {q.error}</span>
                <button type="button" onClick={() => dequeue(q.id)} className="text-zinc-500 hover:text-red-700" aria-label={`Scarta ${label(q)}`}><X className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showInstall && online && !waiting && (
        <div className="rounded-xl shadow-lg brushed text-white px-4 py-3 flex items-center gap-3 text-sm">
          <img src="/icon-192.png" alt="" className="w-9 h-9 rounded-lg shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block font-semibold">Installa Talo sul telefono</span>
            <span className="block text-xs text-zinc-300">{installEvt ? "Si apre come un'app e funziona anche senza rete in cantiere." : <>Tocca <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-label="Condividi" /> e poi "Aggiungi alla schermata Home".</>}</span>
          </span>
          {installEvt && <button type="button" onClick={install} className="rounded-lg bg-white text-zinc-950 text-xs font-semibold px-3 py-1.5 flex items-center gap-1"><Download className="w-3.5 h-3.5" aria-hidden="true" />Installa</button>}
          <button type="button" onClick={dismissInstall} className="text-zinc-400 hover:text-white" aria-label="Non mostrare più"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
