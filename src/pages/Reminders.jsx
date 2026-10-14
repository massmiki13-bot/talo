import React, { useCallback, useEffect, useMemo, useState } from "react";
import { confirmDialog } from "@/components/shared/ConfirmHost";
import { useNavigate } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  Bell, Check, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Repeat, Sparkles, Loader2, AlarmClockOff, MoreHorizontal,
  Pencil, ExternalLink, Search, ListTodo, CheckCircle2, AlertTriangle, MapPin, RotateCcw, Plus,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import {
  REMINDER_TYPES, PRIORITIES, RECURRENCES, ANTICIPI, BUCKETS, reminderType, iso, todayIso, parseIso, addDays, nextOccurrence, bucketOf, fmtDay,
  linkFor, LINK_LABEL, parseQuickReminder,
} from "@/lib/reminders";

const empty = () => ({ titolo: "", descrizione: "", data: todayIso(), ora: "", tipo: "altro", priorita: "normale", ricorrenza: "nessuna", luogo: "", anticipo: "0" });
const PRIO_RANK = { alta: 0, normale: 1, bassa: 2 };
const byWhen = (a, b) => a.data.localeCompare(b.data) || (PRIO_RANK[a.priorita] ?? 1) - (PRIO_RANK[b.priorita] ?? 1) || String(a.ora || "99").localeCompare(String(b.ora || "99"));

export default function Reminders() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("agenda"); // agenda | calendario | completati
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [prioFilter, setPrioFilter] = useState("all");
  const [editing, setEditing] = useState(null); // form + id opzionale
  const [quick, setQuick] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [dayOpen, setDayOpen] = useState(null);

  const load = useCallback(async () => {
    try { setReminders(await db.Reminder.list("data", 2000)); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const unsub = db.Reminder.subscribe(() => load());
    return () => { try { unsub && unsub(); } catch { /* ignore */ } };
  }, [load]);

  const today = todayIso();
  const q = query.trim().toLowerCase();
  const matches = (r) =>
    (typeFilter === "all" || r.tipo === typeFilter) &&
    (prioFilter === "all" || (r.priorita || "normale") === prioFilter) &&
    (!q || [r.titolo, r.descrizione, r.luogo].some((v) => String(v || "").toLowerCase().includes(q)));

  const main = useMemo(() => reminders.filter((r) => !r.is_preavviso && r.data), [reminders]);
  // Gli avvisi anticipati compaiono solo quando è arrivato il loro giorno.
  const dueNotices = useMemo(() => reminders.filter((r) => r.is_preavviso && !r.completato && r.data && r.data <= today), [reminders, today]);

  const stats = useMemo(() => {
    const s = { overdue: 0, today: 0, week: 0, done30: 0 };
    const from = addDays(today, -30);
    for (const r of main) {
      const b = bucketOf(r, today);
      if (b === "overdue") s.overdue++;
      if (b === "today") s.today++;
      if (["today", "tomorrow", "week"].includes(b)) s.week++;
      if (r.completato && (r.completato_il || r.updated_date || "").slice(0, 10) >= from) s.done30++;
    }
    return s;
  }, [main, today]);

  const grouped = useMemo(() => {
    const g = Object.fromEntries(BUCKETS.map((b) => [b.key, []]));
    for (const r of main.filter((x) => !x.completato && matches(x))) g[bucketOf(r, today)]?.push(r);
    for (const k in g) g[k].sort(byWhen);
    return g;
  }, [main, today, q, typeFilter, prioFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const completed = useMemo(() => main.filter((r) => r.completato && matches(r))
    .sort((a, b) => String(b.completato_il || b.data).localeCompare(String(a.completato_il || a.data))), [main, q, typeFilter, prioFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Azioni ───
  const siblingsOf = (r) => reminders.filter((x) => x.is_preavviso && x.id !== r.id && (x.principale_id === r.id || (r.riferimento_id && x.riferimento_id === r.riferimento_id)));

  const complete = async (r) => {
    try {
      const done = !r.completato;
      await db.Reminder.update(r.id, { completato: done, completato_il: done ? new Date().toISOString() : null });
      if (done) {
        const sib = siblingsOf(r).filter((x) => !x.completato);
        if (sib.length) await db.Reminder.bulkUpdate(sib.map((x) => ({ id: x.id, completato: true })));
        const next = r.ricorrenza && r.ricorrenza !== "nessuna" ? nextOccurrence(r.data, r.ricorrenza) : null;
        if (next) {
          const { id, created_date, updated_date, created_by_id, completato_il, posticipato, ...rest } = r;  
          await db.Reminder.create({ ...rest, data: next, completato: false });
          toast({ title: "Completato", description: `Il prossimo è stato fissato per ${fmtDay(next)}.` });
        } else toast({ title: "Completato" });
      } else toast({ title: "Riaperto" });
      load();
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const completeNotice = async (n) => { await db.Reminder.update(n.id, { completato: true }); load(); };

  const snooze = async (r, days, label) => {
    const base = r.data < today ? today : r.data;
    let target = addDays(base, days);
    if (days === "monday") { const d = parseIso(today); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); target = iso(d); }
    await db.Reminder.update(r.id, { data: target, posticipato: (r.posticipato || 0) + 1 });
    toast({ title: "Posticipato", description: `${label}: ${fmtDay(target)}` });
    load();
  };

  const remove = async (r) => {
    if (!(await confirmDialog(`Eliminare "${r.titolo}"?`))) return;
    try {
      for (const s of siblingsOf(r)) await db.Reminder.delete(s.id);
      await db.Reminder.delete(r.id);
      toast({ title: "Promemoria eliminato" });
      load();
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const openLink = async (r) => {
    const url = linkFor(r);
    if (url) return navigate(url);
    if (r.riferimento_tipo === "EmployeeDocument") {
      const d = await db.EmployeeDocument.get(r.riferimento_id).catch(() => null);
      if (d?.dipendente_id) return navigate(`/dipendenti/${d.dipendente_id}`);
    }
    toast({ title: "Il record collegato non è più disponibile" });
  };

  const save = async (form) => {
    const payload = {
      titolo: form.titolo.trim(), descrizione: form.descrizione || "", data: form.data, ora: form.ora || "", tipo: form.tipo,
      priorita: form.priorita || "normale", ricorrenza: form.ricorrenza || "nessuna", luogo: form.luogo || "",
    };
    try {
      let rec;
      if (form.id) {
        rec = await db.Reminder.update(form.id, payload);
        // gli avvisi anticipati seguono la nuova data
        const own = reminders.filter((x) => x.is_preavviso && x.principale_id === form.id);
        for (const o of own) await db.Reminder.delete(o.id);
      } else {
        rec = await db.Reminder.create({ ...payload, completato: false, is_preavviso: false });
      }
      const days = Number(form.anticipo) || 0;
      if (days > 0) {
        const when = addDays(payload.data, -days);
        if (when >= today && when < payload.data) {
          await db.Reminder.create({
            ...payload, titolo: `${payload.titolo} (tra ${days} ${days === 1 ? "giorno" : "giorni"})`, data: when, ricorrenza: "nessuna",
            completato: false, is_preavviso: true, principale_id: rec.id, anticipo_giorni: days,
          });
        }
      }
      setEditing(null);
      toast({ title: form.id ? "Promemoria aggiornato" : "Promemoria creato", description: `${fmtDay(payload.data)}${payload.ora ? ` alle ${payload.ora}` : ""}` });
      load();
    } catch (e) {
      console.error(e);
      toast({ title: "Salvataggio non riuscito", variant: "destructive" });
    }
  };

  const quickAdd = async (e) => {
    e.preventDefault();
    const text = quick.trim();
    if (!text) return;
    setQuickBusy(true);
    try {
      const parsed = await parseQuickReminder(text);
      setEditing({ ...empty(), ...parsed });
      setQuick("");
    } catch (err) {
      // senza IA si apre comunque il modulo con il testo come titolo
      setEditing({ ...empty(), titolo: text });
    } finally { setQuickBusy(false); }
  };

  const openEdit = (r) => {
    const own = reminders.find((x) => x.is_preavviso && x.principale_id === r.id);
    setEditing({ ...empty(), ...r, ora: r.ora || "", luogo: r.luogo || "", priorita: r.priorita || "normale", ricorrenza: r.ricorrenza || "nessuna", anticipo: String(own?.anticipo_giorni || 0) });
  };

  if (loading) return <LoadingSpinner />;

  const rowProps = { onComplete: complete, onSnooze: snooze, onEdit: openEdit, onDelete: remove, onLink: openLink, today };
  const openCount = BUCKETS.reduce((n, b) => n + grouped[b.key].length, 0);

  return (
    <div>
      <PageHeader title="Promemoria" subtitle="Scadenze, appuntamenti e cose da fare: tutto in un'agenda, con avvisi via email ogni mattina." actionLabel="Nuovo promemoria" onAction={() => setEditing(empty())} actionIcon={Plus} />

      {/* Riepilogo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat icon={AlertTriangle} label="In ritardo" value={stats.overdue} tone={stats.overdue ? "text-red-700" : "text-zinc-500"} />
        <Stat icon={Bell} label="Oggi" value={stats.today} tone="text-brand-600" />
        <Stat icon={CalendarIcon} label="Prossimi 7 giorni" value={stats.week} tone="text-zinc-700" />
        <Stat icon={CheckCircle2} label="Completati (30 gg)" value={stats.done30} tone="text-emerald-700" />
      </div>

      {/* Inserimento rapido */}
      <form onSubmit={quickAdd} className="bg-white rounded-xl border border-zinc-200 p-2 flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-brand-600 ml-2 shrink-0" />
        <Input value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Nuovo promemoria in parole tue" placeholder='Scrivi come parli: "chiamare Bianchi venerdì alle 10", "pagare F24 il 16 ogni mese"…' className="border-0 shadow-none focus-visible:ring-0 h-9" />
        <Button type="submit" aria-label="Aggiungi promemoria" disabled={!quick.trim() || quickBusy} className="bg-brand-600 hover:bg-brand-700 shrink-0 gap-1.5">
          {quickBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}<span className="hidden sm:inline">Aggiungi</span>
        </Button>
      </form>

      {/* Strumenti */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 mb-4">
        <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 w-fit max-w-full overflow-x-auto">
          {[["agenda", "Agenda", ListTodo], ["calendario", "Calendario", CalendarIcon], ["completati", "Completati", CheckCircle2]].map(([k, l, I]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-sm ${tab === k ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"}`}><I className="w-4 h-4" /> {l}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca…" className="pl-8 h-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger aria-label="Filtra per categoria" className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tutte le categorie</SelectItem>{REMINDER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={prioFilter} onValueChange={setPrioFilter}>
            <SelectTrigger aria-label="Filtra per priorità" className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Ogni priorità</SelectItem>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>Priorità {p.label.toLowerCase()}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {tab === "agenda" && (
        <div className="space-y-5">
          {dueNotices.length > 0 && !q && typeFilter === "all" && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5 mb-2"><Bell className="w-4 h-4" /> Avvisi di scadenze in arrivo</p>
              <ul className="space-y-1.5">
                {dueNotices.sort(byWhen).map((n) => (
                  <li key={n.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 min-w-0 truncate text-amber-950">{n.titolo}</span>
                    {(linkFor(n) || n.riferimento_tipo === "EmployeeDocument") && <button onClick={() => openLink(n)} className="text-amber-900 underline underline-offset-2 shrink-0">Apri</button>}
                    <button onClick={() => completeNotice(n)} className="text-amber-900 hover:text-amber-950 shrink-0 flex items-center gap-1"><Check className="w-4 h-4" /> Visto</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {openCount === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-zinc-300 py-14 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="mt-3 font-semibold text-zinc-900">{q || typeFilter !== "all" || prioFilter !== "all" ? "Nessun promemoria con questi filtri" : "Tutto in ordine"}</p>
              <p className="text-sm text-zinc-500 mt-1">Nessun promemoria aperto. Aggiungine uno con la barra qui sopra.</p>
            </div>
          ) : BUCKETS.filter((b) => grouped[b.key].length).map((b) => (
            <section key={b.key}>
              <h2 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${b.tone}`}>{b.label}<span className="text-xs font-normal text-zinc-500">{grouped[b.key].length}</span></h2>
              <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
                {grouped[b.key].map((r) => <ReminderRow key={r.id} r={r} {...rowProps} showDate={b.key !== "today" && b.key !== "tomorrow"} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "completati" && (
        completed.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-zinc-300 py-14 text-center text-sm text-zinc-500">Nessun promemoria completato.</div>
        ) : (
          <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
            {completed.slice(0, 300).map((r) => <ReminderRow key={r.id} r={r} {...rowProps} showDate />)}
          </div>
        )
      )}

      {tab === "calendario" && (
        <MonthCalendar month={month} setMonth={setMonth} reminders={main.filter(matches)} today={today} onDay={setDayOpen} onNew={(d) => setEditing({ ...empty(), data: d })} />
      )}

      {dayOpen && (
        <Dialog open onOpenChange={(v) => !v && setDayOpen(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="capitalize">{parseIso(dayOpen).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</DialogTitle></DialogHeader>
            <div className="rounded-lg border border-zinc-200 divide-y divide-zinc-100">
              {main.filter((r) => r.data === dayOpen && matches(r)).sort(byWhen).map((r) => <ReminderRow key={r.id} r={r} {...rowProps} />)}
              {!main.some((r) => r.data === dayOpen && matches(r)) && <p className="p-4 text-sm text-zinc-500">Niente in programma.</p>}
            </div>
            <Button onClick={() => { setEditing({ ...empty(), data: dayOpen }); setDayOpen(null); }} className="bg-brand-600 hover:bg-brand-700 gap-1.5 w-fit"><Plus className="w-4 h-4" /> Aggiungi in questo giorno</Button>
          </DialogContent>
        </Dialog>
      )}

      {editing && <ReminderDialog initial={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3">
      <Icon className={`w-5 h-5 ${tone}`} />
      <div>
        <p className="text-xl font-bold text-zinc-900 tabular-nums leading-none">{value}</p>
        <p className="text-xs text-zinc-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

function ReminderRow({ r, today, showDate, onComplete, onSnooze, onEdit, onDelete, onLink }) {
  const t = reminderType(r.tipo);
  const overdue = !r.completato && r.data < today;
  const hasLink = !!(linkFor(r) || r.riferimento_tipo === "EmployeeDocument");
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 group">
      <button
        onClick={() => onComplete(r)}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 grid place-items-center shrink-0 transition-colors ${r.completato ? "bg-emerald-600 border-emerald-600 text-white" : r.priorita === "alta" ? "border-red-500 hover:bg-red-50" : "border-zinc-300 hover:border-emerald-600"}`}
        aria-label={r.completato ? "Riapri" : "Segna come fatto"}
      >
        {r.completato && <Check className="w-3 h-3" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${r.completato ? "line-through text-zinc-500" : "text-zinc-900"}`}>
          {r.priorita === "alta" && !r.completato && <span className="text-red-700 mr-1">!</span>}{r.titolo}
        </p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-xs text-zinc-500">
          {(showDate || overdue) && <span className={overdue ? "text-red-700 font-medium" : ""}>{fmtDay(r.data)}</span>}
          {r.ora && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{r.ora}</span>}
          <span className={`px-1.5 py-0.5 rounded ${t.color}`}>{t.label}</span>
          {r.ricorrenza && r.ricorrenza !== "nessuna" && <span className="flex items-center gap-1"><Repeat className="w-3 h-3" />{RECURRENCES.find((x) => x.value === r.ricorrenza)?.label}</span>}
          {r.luogo && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.luogo}</span>}
          {r.posticipato > 0 && <span>posticipato {r.posticipato}×</span>}
          {hasLink && <button onClick={() => onLink(r)} className="flex items-center gap-1 text-brand-700 hover:underline"><ExternalLink className="w-3 h-3" />{LINK_LABEL[r.riferimento_tipo] || "Apri"}</button>}
        </div>
        {r.descrizione && !r.completato && <p className="text-xs text-zinc-500 mt-1 line-clamp-2 whitespace-pre-line">{r.descrizione}</p>}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {!r.completato && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Posticipa" title="Posticipa"><AlarmClockOff className="w-4 h-4" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Posticipa</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onSnooze(r, 1, "Domani")}>Domani</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(r, 3, "Tra 3 giorni")}>Tra 3 giorni</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(r, "monday", "Lunedì prossimo")}>Lunedì prossimo</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(r, 7, "Tra una settimana")}>Tra una settimana</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(r, 30, "Tra un mese")}>Tra un mese</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Altre azioni"><MoreHorizontal className="w-4 h-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(r)}><Pencil className="w-4 h-4 mr-2" /> Modifica</DropdownMenuItem>
            {r.completato && <DropdownMenuItem onClick={() => onComplete(r)}><RotateCcw className="w-4 h-4 mr-2" /> Riapri</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(r)} className="text-red-700"><Trash2 className="w-4 h-4 mr-2" /> Elimina</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function MonthCalendar({ month, setMonth, reminders, today, onDay, onNew }) {
  const y = month.getFullYear(), m = month.getMonth();
  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7; // lunedì primo giorno
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(y, m, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const byDay = {};
  for (const r of reminders) (byDay[r.data] ||= []).push(r);
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100">
        <button onClick={() => setMonth(new Date(y, m - 1, 1))} className="p-1.5 rounded-md hover:bg-zinc-100" aria-label="Mese precedente"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-zinc-900 capitalize">{month.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</p>
          <button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="text-xs text-brand-700 hover:underline">Oggi</button>
        </div>
        <button onClick={() => setMonth(new Date(y, m + 1, 1))} className="p-1.5 rounded-md hover:bg-zinc-100" aria-label="Mese successivo"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-medium text-zinc-500 border-b border-zinc-100">
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const list = d ? (byDay[d] || []).sort(byWhen) : [];
          const open = list.filter((r) => !r.completato);
          return (
            <div
              key={i}
              onClick={() => d && (list.length ? onDay(d) : onNew(d))}
              className={`min-h-[64px] sm:min-h-[96px] border-b border-r border-zinc-100 p-1 ${d ? "cursor-pointer hover:bg-zinc-50" : "bg-zinc-50/50"}`}
            >
              {d && (
                <>
                  <span className={`inline-grid place-items-center w-6 h-6 text-xs rounded-full ${d === today ? "bg-brand-600 text-white font-semibold" : "text-zinc-700"}`}>{Number(d.slice(8))}</span>
                  <div className="hidden sm:block space-y-0.5 mt-0.5">
                    {list.slice(0, 3).map((r) => (
                      <p key={r.id} className={`text-[11px] leading-tight truncate px-1 py-0.5 rounded ${r.completato ? "line-through text-zinc-500" : r.data < today ? "bg-red-50 text-red-700" : reminderType(r.tipo).color}`}>{r.ora ? `${r.ora} ` : ""}{r.titolo}</p>
                    ))}
                    {list.length > 3 && <p className="text-[11px] text-zinc-500 px-1">+{list.length - 3} altri</p>}
                  </div>
                  {open.length > 0 && <div className="sm:hidden flex justify-center mt-1"><span className={`w-1.5 h-1.5 rounded-full ${d < today ? "bg-red-500" : "bg-brand-500"}`} /></div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReminderDialog({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => { e.preventDefault(); if (!f.titolo.trim() || !f.data) return; setBusy(true); await onSave(f); setBusy(false); };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{f.id ? "Modifica promemoria" : "Nuovo promemoria"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label htmlFor="r-tit">Cosa</Label><Input id="r-tit" autoFocus value={f.titolo} onChange={(e) => set("titolo", e.target.value)} placeholder="es. Rinnovare polizza furgone" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="r-data">Quando</Label><Input id="r-data" type="date" value={f.data} onChange={(e) => set("data", e.target.value)} /></div>
            <div><Label htmlFor="r-ora">Ora (facoltativa)</Label><Input id="r-ora" type="time" value={f.ora} onChange={(e) => set("ora", e.target.value)} /></div>
            <div>
              <Label htmlFor="reminders-categoria">Categoria</Label>
              <Select value={f.tipo} onValueChange={(v) => set("tipo", v)}>
                <SelectTrigger id="reminders-categoria"><SelectValue /></SelectTrigger>
                <SelectContent>{REMINDER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reminders-priorita">Priorità</Label>
              <Select value={f.priorita} onValueChange={(v) => set("priorita", v)}>
                <SelectTrigger id="reminders-priorita"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reminders-si-ripete">Si ripete</Label>
              <Select value={f.ricorrenza} onValueChange={(v) => set("ricorrenza", v)}>
                <SelectTrigger id="reminders-si-ripete"><SelectValue /></SelectTrigger>
                <SelectContent>{RECURRENCES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reminders-avvisami-anche">Avvisami anche</Label>
              <Select value={f.anticipo} onValueChange={(v) => set("anticipo", v)}>
                <SelectTrigger id="reminders-avvisami-anche"><SelectValue /></SelectTrigger>
                <SelectContent>{ANTICIPI.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label htmlFor="r-luogo">Luogo</Label><Input id="r-luogo" value={f.luogo} onChange={(e) => set("luogo", e.target.value)} placeholder="es. cantiere via Roma 12" /></div>
          <div><Label htmlFor="r-note">Note</Label><Textarea id="r-note" rows={3} value={f.descrizione} onChange={(e) => set("descrizione", e.target.value)} /></div>
          <p className="text-xs text-zinc-500">Il giorno stabilito ricevi un'email di riepilogo al mattino e, con l'app aperta, una notifica (all'ora indicata, se c'è).</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={!f.titolo.trim() || !f.data || busy} className="bg-brand-600 hover:bg-brand-700">{busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Salva</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
