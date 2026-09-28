import React, { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { ChevronLeft, ChevronRight, Copy, UserCheck, Search, Plus, X, Save, Loader2, MessageSquare, AlertTriangle, RotateCcw } from "lucide-react";
import { ATTENDANCE_STATES, STATE_ORDER } from "@/utils/attendanceStates";
import { dayEntries, saveDay, previousWorkingDay, holidayName, parseIso, addDays, iso, employedOn, overtime, fmtH, STD_HOURS } from "@/lib/attendance";
import { formatEuro } from "@/utils/pdfUtils";

const NONE = "__none";
const pref = (k, d) => { try { return localStorage.getItem(`talo.att.${k}`) ?? d; } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem(`talo.att.${k}`, v); } catch { /* ignore */ } };
export const stdHours = (e) => (Number(e?.ore_settimanali) > 0 ? Math.round((Number(e.ore_settimanali) / 5) * 2) / 2 : STD_HOURS);

export default function DailySheet({ date, setDate, records, employees, worksites, siteLabel, readOnly, canSeeCosts, onSaved, onDirtyChange }) {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [initial, setInitial] = useState("[]");
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState("");
  const [defaultSite, setDefaultSite] = useState(pref("site", ""));
  const [saving, setSaving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(new Set());

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const siteName = (id) => worksites.find((w) => w.id === id)?.nome || "";

  // Righe: dipendenti in forza quel giorno + chiunque abbia già dati registrati.
  const buildRows = (dateStr, source = records) => {
    const saved = dayEntries(source, dateStr);
    const ids = new Set([...employees.filter((e) => employedOn(e, dateStr)).map((e) => e.id), ...Object.keys(saved)]);
    return [...ids].map((id) => {
      const e = empById.get(id);
      const s = saved[id];
      const nome = e ? `${e.nome || ""} ${e.cognome || ""}`.trim() : s?.dipendente_nome || "Dipendente";
      return s
        ? { ...s, dipendente_nome: nome, cantieri: s.cantieri.length ? s.cantieri : [{ cantiere_id: "", cantiere_nome: "", ore: 0 }] }
        : { dipendente_id: id, dipendente_nome: nome, stato: "", note: "", cantieri: [{ cantiere_id: "", cantiere_nome: "", ore: 0 }] };
    }).sort((a, b) => a.dipendente_nome.localeCompare(b.dipendente_nome, "it"));
  };

  useEffect(() => {
    const r = buildRows(date);
    setRows(r);
    setInitial(JSON.stringify(r));
    setSelected(new Set());
    setNoteOpen(new Set());
  }, [date, records, employees]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(rows) !== initial;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const go = (d) => {
    if (dirty && !confirm("Ci sono modifiche non salvate. Cambiare giorno e perderle?")) return;
    setDate(d);
  };

  const patchRow = (id, fn) => setRows((rs) => rs.map((r) => (r.dipendente_id === id ? fn(r) : r)));
  const setStato = (id, stato) => patchRow(id, (r) => {
    if (stato !== "presente") return { ...r, stato, cantieri: [{ cantiere_id: "", cantiere_nome: "", ore: 0 }] };
    const hasHours = r.cantieri.some((c) => c.ore > 0);
    return hasHours ? { ...r, stato } : { ...r, stato, cantieri: [{ cantiere_id: defaultSite, cantiere_nome: siteName(defaultSite), ore: stdHours(empById.get(id)) }] };
  });
  const setSite = (id, i, key, val) => patchRow(id, (r) => {
    const cantieri = r.cantieri.map((c, k) => (k !== i ? c : key === "cantiere_id" ? { ...c, cantiere_id: val, cantiere_nome: siteName(val) } : { ...c, ore: Math.max(0, Math.min(24, Number(String(val).replace(",", ".")) || 0)) }));
    return { ...r, stato: r.stato || "presente", cantieri };
  });
  const addSplit = (id) => patchRow(id, (r) => ({ ...r, cantieri: [...r.cantieri, { cantiere_id: "", cantiere_nome: "", ore: 0 }] }));
  const removeSplit = (id, i) => patchRow(id, (r) => ({ ...r, cantieri: r.cantieri.filter((_, k) => k !== i) }));

  // ─── Azioni rapide ───
  const prev = previousWorkingDay(date);
  const copyFrom = () => {
    const src = dayEntries(records, prev);
    if (!Object.keys(src).length) { toast({ title: `Nessuna presenza registrata il ${parseIso(prev).toLocaleDateString("it-IT")}` }); return; }
    setRows((rs) => rs.map((r) => {
      const s = src[r.dipendente_id];
      return s ? { ...r, stato: s.stato, cantieri: s.cantieri.length ? s.cantieri.map((c) => ({ ...c })) : r.cantieri } : r;
    }));
    toast({ title: "Copiato dal giorno lavorativo precedente", description: "Controlla e salva." });
  };
  const target = selected.size ? rows.filter((r) => selected.has(r.dipendente_id)) : rows.filter((r) => !r.stato);
  const allPresent = () => {
    const ids = new Set(target.map((r) => r.dipendente_id));
    setRows((rs) => rs.map((r) => (ids.has(r.dipendente_id)
      ? { ...r, stato: "presente", cantieri: [{ cantiere_id: defaultSite, cantiere_nome: siteName(defaultSite), ore: stdHours(empById.get(r.dipendente_id)) }] }
      : r)));
  };
  const bulkStato = (stato) => { for (const r of target) setStato(r.dipendente_id, stato); setSelected(new Set()); };
  const bulkSite = (siteId) => {
    const ids = new Set(target.map((r) => r.dipendente_id));
    setRows((rs) => rs.map((r) => (ids.has(r.dipendente_id)
      ? { ...r, stato: "presente", cantieri: [{ cantiere_id: siteId, cantiere_nome: siteName(siteId), ore: r.cantieri.reduce((s, c) => s + c.ore, 0) || stdHours(empById.get(r.dipendente_id)) }] }
      : r)));
    setSelected(new Set());
  };

  const save = async () => {
    const bad = rows.find((r) => r.stato === "presente" && !r.cantieri.some((c) => c.ore > 0));
    if (bad && !confirm(`${bad.dipendente_nome} risulta presente con 0 ore. Salvare comunque?`)) return;
    setSaving(true);
    try {
      const entries = rows.filter((r) => r.stato).map((r) => ({ ...r, cantieri: r.cantieri.filter((c) => c.ore > 0 || c.cantiere_id) }));
      await saveDay(db, date, entries, records);
      setInitial(JSON.stringify(rows));
      toast({ title: "Giornata salvata", description: `${entries.length} dipendenti registrati` });
      onSaved?.();
    } catch (e) {
      console.error(e);
      toast({ title: "Salvataggio non riuscito", description: "Riprova: i dati precedenti non sono stati toccati.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ─── Totali ───
  const totals = useMemo(() => {
    let presenti = 0, ore = 0, straord = 0, costo = 0, assenti = 0, mancanti = 0;
    for (const r of rows) {
      if (!r.stato) { mancanti++; continue; }
      if (r.stato !== "presente") { assenti++; continue; }
      const h = r.cantieri.reduce((s, c) => s + c.ore, 0);
      const e = empById.get(r.dipendente_id);
      presenti++; ore += h; straord += overtime(h, stdHours(e)); costo += h * (Number(e?.costo_orario) || 0);
    }
    return { presenti, ore, straord, costo, assenti, mancanti };
  }, [rows, empById]);

  const hol = holidayName(date);
  const wd = parseIso(date).getDay();
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.dipendente_nome.toLowerCase().includes(q));
  const activeSites = worksites;

  return (
    <div className="space-y-3">
      {/* Giorno */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => go(addDays(date, -1))} aria-label="Giorno precedente"><ChevronLeft className="w-4 h-4" /></Button>
        <Input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="h-9 w-[150px]" />
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => go(addDays(date, 1))} aria-label="Giorno successivo"><ChevronRight className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => go(iso(new Date()))}>Oggi</Button>
        <p className="text-sm font-semibold text-slate-900 capitalize ml-1">{parseIso(date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
        {hol && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">{hol}</span>}
        {!hol && (wd === 0 || wd === 6) && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{wd === 0 ? "Domenica" : "Sabato"}</span>}
      </div>

      {!readOnly && (
        <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[160px] flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca dipendente" className="pl-8 h-9 sm:w-[180px]" />
          </div>
          <Select value={defaultSite || NONE} onValueChange={(v) => { const s = v === NONE ? "" : v; setDefaultSite(s); savePref("site", s); }}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder={`${siteLabel} predefinito`} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nessun {siteLabel.toLowerCase()} predefinito</SelectItem>
              {activeSites.map((w) => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={copyFrom}><Copy className="w-4 h-4" /> Copia da {parseIso(prev).toLocaleDateString("it-IT", { weekday: "short", day: "numeric" })}</Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={allPresent} disabled={!target.length}>
            <UserCheck className="w-4 h-4" /> {selected.size ? `Presenti i ${selected.size} selezionati` : "Segna presenti i mancanti"}
          </Button>
          {selected.size > 0 && (
            <>
              <Select onValueChange={bulkStato}>
                <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Imposta stato" /></SelectTrigger>
                <SelectContent>{STATE_ORDER.map((s) => <SelectItem key={s} value={s}>{ATTENDANCE_STATES[s].label}</SelectItem>)}</SelectContent>
              </Select>
              <Select onValueChange={bulkSite}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder={`Sposta su ${siteLabel.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>{activeSites.map((w) => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}</SelectContent>
              </Select>
              <button onClick={() => setSelected(new Set())} className="text-sm text-slate-500 hover:text-slate-800">Deseleziona</button>
            </>
          )}
        </div>
      )}

      {/* Tabella */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">Nessun dipendente in forza in questa data.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="hidden md:grid grid-cols-[28px_minmax(150px,1fr)_220px_minmax(260px,1.3fr)_36px] gap-3 px-3 py-2 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            {!readOnly ? <input type="checkbox" aria-label="Seleziona tutti" checked={shown.length > 0 && shown.every((r) => selected.has(r.dipendente_id))} onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((r) => r.dipendente_id)) : new Set())} /> : <span />}
            <span>Dipendente</span><span>Stato</span><span>{siteLabel} e ore</span><span />
          </div>
          <div className="divide-y divide-slate-100">
            {shown.map((r) => {
              const e = empById.get(r.dipendente_id);
              const ore = r.cantieri.reduce((s, c) => s + c.ore, 0);
              const ot = r.stato === "presente" ? overtime(ore, stdHours(e)) : 0;
              return (
                <div key={r.dipendente_id} className={`grid grid-cols-[28px_1fr] md:grid-cols-[28px_minmax(150px,1fr)_220px_minmax(260px,1.3fr)_36px] gap-x-3 gap-y-2 px-3 py-2.5 items-start ${selected.has(r.dipendente_id) ? "bg-brand-50/60" : ""}`}>
                  {!readOnly ? <input type="checkbox" className="mt-2" checked={selected.has(r.dipendente_id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(r.dipendente_id) ? n.delete(r.dipendente_id) : n.add(r.dipendente_id); return n; })} aria-label={`Seleziona ${r.dipendente_nome}`} /> : <span />}
                  <div className="min-w-0 pt-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.dipendente_nome}</p>
                    <p className="text-xs text-slate-500 truncate">{[e?.qualifica || e?.ruolo, r.stato === "presente" && `${fmtH(ore)} h`, ot > 0 && `+${fmtH(ot)} straord.`].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="col-start-2 md:col-start-auto flex flex-wrap gap-1">
                    {STATE_ORDER.map((s) => {
                      const info = ATTENDANCE_STATES[s];
                      const on = r.stato === s;
                      return (
                        <button key={s} type="button" disabled={readOnly} onClick={() => setStato(r.dipendente_id, s)} title={info.label}
                          className={`h-8 min-w-[36px] px-2 rounded-md text-xs font-semibold border transition-colors ${on ? info.bgClass : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"} disabled:cursor-default`}>
                          {info.short}
                        </button>
                      );
                    })}
                  </div>
                  <div className="col-start-2 md:col-start-auto space-y-1.5">
                    {r.stato === "presente" ? r.cantieri.map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Select value={c.cantiere_id || NONE} onValueChange={(v) => setSite(r.dipendente_id, i, "cantiere_id", v === NONE ? "" : v)} disabled={readOnly}>
                          <SelectTrigger className="h-8 flex-1 min-w-0 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Senza {siteLabel.toLowerCase()}</SelectItem>
                            {activeSites.map((w) => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}
                            {c.cantiere_id && !activeSites.some((w) => w.id === c.cantiere_id) && <SelectItem value={c.cantiere_id}>{c.cantiere_nome || "Cantiere chiuso"}</SelectItem>}
                          </SelectContent>
                        </Select>
                        <Input type="number" inputMode="decimal" step="0.5" min="0" max="24" value={c.ore || ""} onChange={(ev) => setSite(r.dipendente_id, i, "ore", ev.target.value)} disabled={readOnly} className="h-8 w-[68px] text-sm tabular-nums" aria-label="Ore" />
                        <span className="text-xs text-slate-500">h</span>
                        {!readOnly && (r.cantieri.length > 1
                          ? <button onClick={() => removeSplit(r.dipendente_id, i)} className="p-1 text-slate-400 hover:text-red-600" aria-label="Rimuovi"><X className="w-4 h-4" /></button>
                          : <button onClick={() => addSplit(r.dipendente_id)} className="p-1 text-slate-400 hover:text-brand-600" title={`Dividi su più ${siteLabel.toLowerCase()}`} aria-label="Aggiungi"><Plus className="w-4 h-4" /></button>)}
                      </div>
                    )) : <p className="text-sm text-slate-400 pt-1.5">{r.stato ? "—" : "Non registrato"}</p>}
                    {r.stato === "presente" && r.cantieri.length > 1 && !readOnly && (
                      <button onClick={() => addSplit(r.dipendente_id)} className="text-xs text-brand-700 hover:underline">+ altro {siteLabel.toLowerCase()}</button>
                    )}
                    {(noteOpen.has(r.dipendente_id) || r.note) && (
                      <Input value={r.note || ""} onChange={(ev) => patchRow(r.dipendente_id, (x) => ({ ...x, note: ev.target.value }))} disabled={readOnly} placeholder="Nota (es. uscita anticipata, trasferta)" className="h-8 text-sm" />
                    )}
                  </div>
                  <div className="hidden md:block">
                    {!readOnly && !r.note && !noteOpen.has(r.dipendente_id) && (
                      <button onClick={() => setNoteOpen((s) => new Set([...s, r.dipendente_id]))} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Aggiungi nota" aria-label="Aggiungi nota"><MessageSquare className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Barra riepilogo e salvataggio */}
      <div className="sticky bottom-16 lg:bottom-3 z-30 rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span><strong className="tabular-nums">{totals.presenti}</strong> presenti</span>
          <span><strong className="tabular-nums">{fmtH(totals.ore)}</strong> ore</span>
          {totals.straord > 0 && <span className="text-amber-700"><strong className="tabular-nums">{fmtH(totals.straord)}</strong> straord.</span>}
          {totals.assenti > 0 && <span className="text-slate-600">{totals.assenti} assenti</span>}
          {totals.mancanti > 0 && <span className="text-amber-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{totals.mancanti} da registrare</span>}
          {canSeeCosts && totals.costo > 0 && <span className="text-slate-600">Costo {formatEuro(totals.costo)}</span>}
          {!readOnly && (
            <div className="ml-auto flex gap-2">
              {dirty && <Button variant="ghost" size="sm" onClick={() => setRows(JSON.parse(initial))} className="gap-1.5"><RotateCcw className="w-4 h-4" /> Annulla</Button>}
              <Button onClick={save} disabled={!dirty || saving} className="bg-brand-600 hover:bg-brand-700 gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {dirty ? "Salva giornata" : "Salvato"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
