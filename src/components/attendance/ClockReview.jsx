import React, { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { ChevronLeft, ChevronRight, MapPin, AlertTriangle, CheckCircle2, Loader2, Settings2, LogIn, LogOut, Smartphone, CloudOff } from "lucide-react";
import { addDays, parseIso } from "@/lib/attendance";
import { summarize, confirmDay, settingsOf, fmtTime } from "@/lib/timbrature";

const fmtH = (h) => String(h).replace(".", ",");

function Distance({ e, raggio }) {
  if (e.distanza_m == null) return e.posizione ? <span className="text-[11px] text-zinc-500 flex items-center gap-0.5"><MapPin className="w-3 h-3" aria-hidden="true" />posizione</span> : null;
  const ok = e.distanza_m <= raggio;
  const d = e.distanza_m >= 1000 ? `${(e.distanza_m / 1000).toFixed(1).replace(".", ",")} km` : `${e.distanza_m} m`;
  return (
    <a href={`https://www.openstreetmap.org/?mlat=${e.posizione.lat}&mlon=${e.posizione.lng}#map=17/${e.posizione.lat}/${e.posizione.lng}`} target="_blank" rel="noopener noreferrer"
      className={`text-[11px] font-medium rounded-full px-1.5 py-0.5 inline-flex items-center gap-0.5 ${ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900"}`} title="Apri sulla mappa">
      <MapPin className="w-3 h-3" aria-hidden="true" />{ok ? "in cantiere" : `a ${d}`}
    </a>
  );
}

function SettingsDialog({ open, onOpenChange, profile, onSaved }) {
  const { toast } = useToast();
  const [s, setS] = useState(settingsOf(profile));
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setS(settingsOf(profile)); setAck(!!profile?.timbrature?.gps); } }, [open, profile]);

  const save = async () => {
    if (s.gps && !ack) return toast({ title: "Conferma la dichiarazione per attivare la posizione", variant: "destructive" });
    setSaving(true);
    try {
      const timbrature = { ...s, pausa_minuti: Number(s.pausa_minuti) || 0, pausa_oltre_ore: Number(s.pausa_oltre_ore) || 6, raggio_m: Number(s.raggio_m) || 300,
        ...(s.gps && !profile?.timbrature?.gps ? { gps_attivato_il: new Date().toISOString() } : {}) };
      const u = await db.CompanyProfile.update(profile.id, { timbrature });
      onSaved(u); onOpenChange(false); toast({ title: "Impostazioni salvate" });
    } catch (e) { toast({ title: "Salvataggio non riuscito", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Impostazioni timbrature</DialogTitle>
          <DialogDescription>Gli operai timbrano dalla loro schermata iniziale; qui confermi le ore nel foglio presenze.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="ts-pausa" className="text-sm font-medium text-zinc-800">Pausa (minuti)</label><Input id="ts-pausa" type="number" min="0" value={s.pausa_minuti} onChange={(e) => setS({ ...s, pausa_minuti: e.target.value })} className="mt-1" /></div>
            <div><label htmlFor="ts-oltre" className="text-sm font-medium text-zinc-800">…se si lavora più di (ore)</label><Input id="ts-oltre" type="number" min="0" step="0.5" value={s.pausa_oltre_ore} onChange={(e) => setS({ ...s, pausa_oltre_ore: e.target.value })} className="mt-1" /></div>
          </div>
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="ts-gps" className="font-medium text-zinc-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-brand-600" />Registra la posizione alla timbratura</label>
              <Switch id="ts-gps" checked={s.gps} onCheckedChange={(v) => setS({ ...s, gps: v })} />
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">Solo nell'istante della timbratura, mai durante la giornata. Talo calcola la distanza dal cantiere (serve la posizione del cantiere nella scheda del lavoro).</p>
            {s.gps && (
              <>
                <div className="mt-3"><label htmlFor="ts-raggio" className="text-sm font-medium text-zinc-800">Distanza massima dal cantiere (metri)</label><Input id="ts-raggio" type="number" min="50" step="50" value={s.raggio_m} onChange={(e) => setS({ ...s, raggio_m: e.target.value })} className="mt-1 w-40" /></div>
                <label htmlFor="ts-ack" className="flex items-start gap-2.5 mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-950 cursor-pointer">
                  <Checkbox id="ts-ack" checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
                  <span>Dichiaro che l'impresa ha adempiuto a quanto previsto dall'art. 4 della L. 300/1970 per gli strumenti che consentono un controllo a distanza (accordo sindacale o autorizzazione dell'Ispettorato del Lavoro) e ha informato i lavoratori ai sensi dell'art. 13 GDPR.</span>
                </label>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Revisione delle timbrature di una giornata e conferma nel foglio presenze.
export default function ClockReview({ date, setDate, records, isHost, onSaved }) {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ev, profiles] = await Promise.all([db.ClockEvent.filter({ data: date }, "at", 2000), db.CompanyProfile.list().catch(() => [])]);
      setEvents(ev); setProfile(profiles[0] || null);
    } catch (e) { toast({ title: "Timbrature non caricate", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [date, toast]);
  useEffect(() => { load(); setEdits({}); }, [load]);

  const settings = useMemo(() => settingsOf(profile), [profile]);
  const rows = useMemo(() => summarize(events, settings), [events, settings]);
  useEffect(() => { setSelected(new Set(rows.filter((r) => !r.confermata && !r.issues.length).map((r) => r.key))); }, [rows]);

  const withEdits = (r) => {
    const v = edits[r.key];
    if (v === undefined || v === "" || !r.cantieri.length) return r;
    const tot = Math.max(0, Number(String(v).replace(",", ".")) || 0);
    const rest = r.cantieri.slice(1).reduce((s, c) => s + c.ore, 0);
    return { ...r, cantieri: [{ ...r.cantieri[0], ore: Math.max(0, tot - rest) }, ...r.cantieri.slice(1)], ore: tot };
  };

  const confirm = async () => {
    const chosen = rows.filter((r) => selected.has(r.key)).map(withEdits);
    if (!chosen.length) return;
    setSaving(true);
    try {
      await confirmDay(date, chosen, records);
      toast({ title: `${chosen.length} giornate confermate`, description: "Le ore sono nel foglio presenze." });
      await load(); onSaved?.();
    } catch (e) { toast({ title: "Conferma non riuscita", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const toggle = (k) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const label = parseIso(date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-white rounded-xl border border-zinc-200 p-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDate(addDays(date, -1))} aria-label="Giorno precedente"><ChevronLeft className="w-4 h-4" /></Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 w-[150px] border-0 shadow-none" aria-label="Giorno" />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDate(addDays(date, 1))} aria-label="Giorno successivo"><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <span className="text-sm text-zinc-600 first-letter:uppercase">{label}</span>
        <div className="ml-auto flex gap-2">
          {isHost && <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="gap-1.5"><Settings2 className="w-4 h-4" />Impostazioni</Button>}
          <Button size="sm" onClick={confirm} disabled={saving || !selected.size} className="gap-1.5 bg-brand-600 hover:bg-brand-700">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Conferma nel foglio ({selected.size})</Button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
      ) : !rows.length ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center">
          <Smartphone className="w-8 h-8 text-zinc-400 mx-auto" aria-hidden="true" />
          <p className="font-semibold text-zinc-900 mt-3">Nessuna timbratura in questa giornata</p>
          <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">Gli operai collegati al loro account timbrano entrata e uscita dal telefono, nella schermata iniziale di Talo. Qui confermi le ore e finiscono nel foglio presenze.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100">
          {rows.map((r0) => {
            const r = withEdits(r0);
            return (
              <div key={r.key} className="p-4 flex flex-wrap items-start gap-3">
                <Checkbox checked={selected.has(r.key)} onCheckedChange={() => toggle(r.key)} aria-label={`Conferma ${r.dipendente_nome}`} className="mt-1" disabled={r.confermata} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zinc-900 flex items-center gap-2">{r.dipendente_nome}
                    {r.confermata && <span className="text-[11px] font-medium rounded-full bg-emerald-50 text-emerald-800 px-2 py-0.5">confermata</span>}
                    {r.lontano && <span className="text-[11px] font-medium rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">fuori cantiere</span>}
                  </p>
                  <ol className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {r.events.map((e) => (
                      <li key={e.id} className="flex items-center gap-1.5 text-sm">
                        {e.tipo === "entrata" ? <LogIn className="w-3.5 h-3.5 text-emerald-600" aria-label="Entrata" /> : <LogOut className="w-3.5 h-3.5 text-zinc-500" aria-label="Uscita" />}
                        <span className="tabular-nums font-medium text-zinc-900">{fmtTime(e.at)}</span>
                        {e.worksite_nome && <span className="text-zinc-600">{e.worksite_nome}</span>}
                        <Distance e={e} raggio={settings.raggio_m} />
                        {e.inviata_dopo && <CloudOff className="w-3.5 h-3.5 text-zinc-500" aria-label="Fatta senza rete e inviata dopo" />}
                      </li>
                    ))}
                  </ol>
                  {r.issues.length > 0 && <p className="text-xs text-amber-800 mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />{r.issues.join(" · ")}: controlla le ore prima di confermare.</p>}
                  {r.pausa > 0 && <p className="text-xs text-zinc-500 mt-1">Pausa di {Math.round(r.pausa * 60)} minuti già tolta.</p>}
                </div>
                <div className="text-right">
                  <label htmlFor={`ore-${r.key}`} className="sr-only">Ore di {r.dipendente_nome}</label>
                  <Input id={`ore-${r.key}`} inputMode="decimal" value={edits[r.key] ?? fmtH(r0.ore)} onChange={(e) => setEdits({ ...edits, [r.key]: e.target.value })} disabled={r.confermata}
                    className="w-20 h-9 text-right font-display text-lg font-bold tabular-nums" />
                  <span className="text-xs text-zinc-500">ore</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isHost && profile && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} profile={profile} onSaved={setProfile} />}
    </div>
  );
}
