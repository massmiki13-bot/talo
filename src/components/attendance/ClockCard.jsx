import React, { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { LogIn, LogOut, MapPin, Loader2, CloudOff, CheckCircle2, Clock } from "lucide-react";
import { iso } from "@/lib/attendance";
import { punch, flushPunches, pendingPunches, settingsOf, summarize, fmtTime } from "@/lib/timbrature";
import { translator } from "@/lib/workerI18n";

const NONE = "__none__";
const INFO_KEY = (id) => `talo.timbrature.informativa.${id}`;

// Timbratura dal telefono per il dipendente collegato all'account.
export default function ClockCard({ employeeId, t: tProp }) {
  const t = tProp || translator("it");
  const { toast } = useToast();
  const [settings, setSettings] = useState(settingsOf(null));
  const [sites, setSites] = useState([]);
  const [events, setEvents] = useState([]);
  const [site, setSite] = useState(() => { try { return localStorage.getItem("talo.timbrature.cantiere") || NONE; } catch { return NONE; } });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(pendingPunches().length);
  const [info, setInfo] = useState(null); // tipo in attesa dell'informativa GPS

  const today = iso(new Date());
  const load = useCallback(async () => {
    const [profiles, ws, ev] = await Promise.all([
      db.CompanyProfile.list().catch(() => []),
      db.Worksite.list("-created_date").catch(() => []),
      db.ClockEvent.filter({ dipendente_id: employeeId, data: today }, "at", 50).catch(() => []),
    ]);
    setSettings(settingsOf(profiles[0]));
    setSites(ws.filter((w) => (w.stato ? w.stato !== "finito" : w.attivo !== false)));
    setEvents(ev);
  }, [employeeId, today]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sync = async () => { const n = await flushPunches(); setPending(pendingPunches().length); if (n) { toast({ title: `${n} timbrature inviate`, description: "Erano rimaste sul telefono senza connessione." }); load(); } };
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [load, toast]);

  const queued = pendingPunches().filter((p) => p.client_time.slice(0, 10) === today);
  const all = useMemo(() => [...events, ...queued.map((q) => ({ id: q.client_id, tipo: q.tipo, at: q.client_time, dipendente_id: employeeId, data: today, worksite_id: q.worksite || "", worksite_nome: sites.find((s) => s.id === q.worksite)?.nome || "", offline: true }))]
    .sort((a, b) => a.at.localeCompare(b.at)), [events, queued, employeeId, today, sites]);  
  const last = all.at(-1);
  const inside = last?.tipo === "entrata";
  const next = inside ? "uscita" : "entrata";
  const day = all.length ? summarize(all.map((e) => ({ dipendente_nome: "", ...e })), settings)[0] : null;

  useEffect(() => { if (inside && last.worksite_id) setSite(last.worksite_id); }, [inside, last?.worksite_id]);  

  const doPunch = async (tipo) => {
    setBusy(true);
    try {
      const worksiteId = site === NONE ? null : site;
      try { localStorage.setItem("talo.timbrature.cantiere", site); } catch { /* ignore */ }
      const r = await punch({ tipo, worksiteId, gps: settings.gps });
      setPending(pendingPunches().length);
      toast({
        title: tipo === "entrata" ? t("entrata_ok") : t("uscita_ok"),
        description: r.queued ? t("offline_ok") : settings.gps && !r.position ? "Posizione non disponibile: timbratura registrata senza posizione." : undefined,
      });
      await load();
    } catch (e) {
      toast({ title: t("errore"), description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const start = (tipo) => {
    let seen = false;
    try { seen = localStorage.getItem(INFO_KEY(employeeId)) === "1"; } catch { /* ignore */ }
    if (settings.gps && !seen) { setInfo(tipo); return; }
    doPunch(tipo);
  };
  const acceptInfo = () => { try { localStorage.setItem(INFO_KEY(employeeId), "1"); } catch { /* ignore */ } const t = info; setInfo(null); doPunch(t); };

  return (
    <section className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6" aria-labelledby="clock-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="clock-title" className="font-display text-xl font-bold uppercase text-zinc-950">{t("timbratura")}</h2>
          <p className="text-sm text-zinc-600 mt-0.5 flex items-center gap-1.5">
            {inside ? <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />{t("entrato_alle")} {fmtTime(last.at)}{last.worksite_nome ? ` · ${last.worksite_nome}` : ""}</> : last ? <>{t("uscito_alle")} {fmtTime(last.at)}</> : t("non_timbrato")}
          </p>
        </div>
        {day?.ore > 0 && <p className="text-right"><span className="block font-display text-3xl font-bold tabular-nums text-zinc-950">{String(day.ore).replace(".", ",")}</span><span className="text-xs text-zinc-500">{t("ore_oggi")}</span></p>}
      </div>

      <div className="mt-4">
        <label htmlFor="clock-site" className="text-sm font-medium text-zinc-800">{t("cantiere")}</label>
        <Select value={site} onValueChange={setSite} disabled={inside}>
          <SelectTrigger id="clock-site" className="mt-1 h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("nessun_cantiere")}</SelectItem>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={() => start(next)} disabled={busy} className={`w-full h-16 mt-4 text-lg font-semibold gap-2.5 ${inside ? "bg-zinc-900 hover:bg-zinc-800" : "bg-brand-600 hover:bg-brand-700"}`}>
        {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : inside ? <LogOut className="w-6 h-6" /> : <LogIn className="w-6 h-6" />}
        {inside ? t("uscita") : t("entrata")}
      </Button>

      <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
        {settings.gps && <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" aria-hidden="true" />{t("posizione_info")}</p>}
        {pending > 0 && <p className="flex items-center gap-1.5 text-amber-800"><CloudOff className="w-3.5 h-3.5" aria-hidden="true" />{pending} · {t("in_attesa_rete")}</p>}
      </div>

      {all.length > 0 && (
        <ol className="mt-4 pt-4 border-t border-zinc-100 space-y-1.5">
          {all.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              {e.tipo === "entrata" ? <LogIn className="w-4 h-4 text-emerald-600" aria-hidden="true" /> : <LogOut className="w-4 h-4 text-zinc-500" aria-hidden="true" />}
              <span className="tabular-nums font-medium text-zinc-900">{fmtTime(e.at)}</span>
              <span className="text-zinc-600 truncate">{e.tipo === "entrata" ? t("ev_entrata") : t("ev_uscita")}{e.worksite_nome ? ` · ${e.worksite_nome}` : ""}</span>
              <span className="ml-auto shrink-0">{e.offline ? <Clock className="w-4 h-4 text-amber-600" aria-label="In attesa di invio" /> : e.stato === "confermata" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Confermata" /> : null}</span>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={!!info} onOpenChange={(v) => !v && setInfo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-brand-600" />Posizione alla timbratura</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-zinc-600">
                <p>La tua impresa registra la posizione del telefono <b>solo nel momento in cui timbri</b>, per verificare la presenza in cantiere. Non vieni seguito durante la giornata.</p>
                <p>Vengono salvate coordinate, precisione e distanza dal cantiere, visibili al titolare e ai responsabili, e conservate insieme alle presenze. Il telefono ti chiederà il permesso: se lo neghi la timbratura viene registrata lo stesso, senza posizione.</p>
                <p>Per i dettagli rivolgiti al tuo datore di lavoro, titolare del trattamento.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={acceptInfo} className="bg-brand-600 hover:bg-brand-700">Ho capito, timbra</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
