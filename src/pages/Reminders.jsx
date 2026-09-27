import React, { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Bell, Check, Trash2, AlertTriangle, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

const tipi = [
  { value: "appuntamento", label: "Appuntamento" },
  { value: "scadenza_documento", label: "Scadenza Documento" },
  { value: "scadenza_contratto", label: "Scadenza Contratto" },
  { value: "altro", label: "Altro" },
];

const ANTICIPO_OPTIONS = [
  { value: "0", label: "Nessun anticipo" },
  { value: "7", label: "1 settimana prima" },
  { value: "14", label: "2 settimane prima" },
  { value: "30", label: "1 mese prima" },
  { value: "60", label: "2 mesi prima" },
];

const RIPETIZIONE_OPTIONS = [
  { value: "nessuna", label: "Nessuna (solo alla scadenza)" },
  { value: "giorno", label: "Ogni giorno" },
  { value: "settimana", label: "Ogni settimana" },
  { value: "mese", label: "Ogni mese" },
];

const emptyReminder = { titolo: "", descrizione: "", data: "", ora: "", tipo: "altro", anticipo: "0", ripetizione: "nessuna" };

export default function Reminders() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyReminder);
  const [filter, setFilter] = useState("attivi");
  const [viewMode, setViewMode] = useState("list");
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [dayDetail, setDayDetail] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    load();
    const unsubscribe = db.Reminder.subscribe(() => load());
    return () => { try { unsubscribe && unsubscribe(); } catch (_) {} };
  }, []);

  const load = async () => {
    try { setReminders(await db.Reminder.list("data")); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      // Create the main reminder on the target date (the actual deadline)
      await db.Reminder.create({
        titolo: form.titolo,
        descrizione: form.descrizione,
        data: form.data,
        ora: form.ora || undefined,
        tipo: form.tipo,
        completato: false,
        is_preavviso: false,
      });

      // If anticipo is set, also create a pre-notification (marked as preavviso)
      const anticipoDays = Number(form.anticipo) || 0;
      if (anticipoDays > 0) {
        const scadenza = new Date(form.data);
        const notifDate = new Date(scadenza);
        notifDate.setDate(notifDate.getDate() - anticipoDays);
        const oggi = new Date(new Date().toISOString().slice(0, 10));
        if (notifDate >= oggi && notifDate < scadenza) {
          await db.Reminder.create({
            titolo: `${form.titolo} (tra ${anticipoDays} giorni)`,
            descrizione: form.descrizione,
            data: notifDate.toISOString().slice(0, 10),
            ora: form.ora || undefined,
            tipo: form.tipo,
            completato: false,
            is_preavviso: true,
          });
        }
      }

      setDialogOpen(false);
      setForm(emptyReminder);
      load();
      toast({ title: "✓ Promemoria creato", description: "Visibile in Attivi e nel Calendario.", duration: 4000 });
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  const toggleComplete = async (r) => {
    await db.Reminder.update(r.id, { completato: !r.completato });
    load();
    toast({ title: r.completato ? "Riaperto" : "Completato" });
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare?")) return;
    await db.Reminder.delete(id);
    load();
  };

  const openNew = () => { setForm(emptyReminder); setDialogOpen(true); };

  // List view: only actual deadlines, not pre-notifications
  const listReminders = reminders.filter(r => !r.is_preavviso);

  const filtered = listReminders.filter(r => {
    if (filter === "attivi") return !r.completato;
    if (filter === "completati") return r.completato;
    return true;
  });

  // Includes today: the expiration day itself is red
  const isOverdue = (date) => date && new Date(date) <= new Date(new Date().toDateString());
  const isExpiringSoon = (date) => {
    if (!date) return false;
    const diff = (new Date(date) - new Date(new Date().toDateString())) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  };

  // Calendar view
  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(selectedMonth);
    const firstDay = getFirstDayOfMonth(selectedMonth);
    const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1;
    const days = [];
    for (let i = 0; i < adjustedFirst; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const monthStr = selectedMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

    const allDayReminders = (dateStr) => reminders.filter(r => r.data === dateStr);

    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1))} className="p-2.5 hover:bg-slate-100 rounded-lg text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
          <h3 className="text-base sm:text-lg font-semibold capitalize text-slate-900">{monthStr}</h3>
          <button onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1))} className="p-2.5 hover:bg-slate-100 rounded-lg text-slate-600"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-4 mb-3 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200 border border-red-400"></span>Scadenza finale</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 border border-amber-400"></span>Preavviso</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></span>Oggi</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
          ))}
          {days.map((day, i) => {
            if (!day) return <div key={i} />;
            const dateStr = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayReminders = reminders.filter(r => r.data === dateStr && !r.completato);
            const dayCompleted = reminders.filter(r => r.data === dateStr && r.completato);
            const hasItems = dayReminders.length > 0 || dayCompleted.length > 0;
            const isToday = dateStr === new Date().toISOString().slice(0, 10);
            // Distinguish final deadlines from pre-notifications
            const dayScadenze = dayReminders.filter(r => !r.is_preavviso);
            const dayPreavvisi = dayReminders.filter(r => r.is_preavviso);
            const hasScadenza = dayScadenze.length > 0;
            const hasPreavviso = dayPreavvisi.length > 0;
            const isOverdueDay = hasScadenza && isOverdue(dateStr);
            const isExpiringSoonDay = hasScadenza && isExpiringSoon(dateStr) && !isOverdueDay;
            return (
              <button
                key={i}
                onClick={() => hasItems && setDayDetail({ dateStr, day, items: allDayReminders(dateStr) })}
                className={`p-1 min-h-[60px] sm:min-h-[80px] rounded-lg text-left flex flex-col ${hasScadenza && isOverdueDay ? "border border-red-400 bg-red-50" : hasScadenza && isExpiringSoonDay ? "border border-red-300 bg-red-50/60" : hasScadenza ? "border border-red-200 bg-red-50/30" : hasPreavviso ? "border border-amber-300 bg-amber-50" : isToday ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50"} ${hasItems ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className={`text-sm ${isToday && !hasScadenza ? "font-bold text-blue-600" : hasScadenza ? "font-bold text-red-700" : "text-slate-700"}`}>{day}</span>
                {dayReminders.length > 0 && (
                  <div className="mt-1 flex-1 space-y-0.5 overflow-hidden">
                    {dayReminders.slice(0, 3).map(r => {
                      const isPreavviso = r.is_preavviso;
                      const isScadenza = r.tipo === "scadenza_documento" || r.tipo === "scadenza_contratto";
                      return (
                        <div key={r.id} className={`text-[10px] rounded px-1 py-0.5 truncate ${isPreavviso ? "bg-amber-200 text-amber-800 font-medium" : isScadenza ? "bg-red-200 text-red-800 font-semibold" : "bg-blue-100 text-blue-700"}`}>
                          {isPreavviso ? "🔔 " : isScadenza ? "⛔ " : ""}{r.titolo}
                        </div>
                      );
                    })}
                    {dayReminders.length > 3 && <span className="text-[9px] text-slate-400">+{dayReminders.length - 3} altri</span>}
                  </div>
                )}
                {dayCompleted.length > 0 && dayReminders.length === 0 && (
                  <span className="text-[9px] text-emerald-500 mt-auto">{dayCompleted.length} completat{dayCompleted.length > 1 ? "i" : "o"}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
    };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Promemoria" subtitle="Appuntamenti e scadenze" actionLabel="+ Nuovo" onAction={openNew}>
        <div className="flex gap-2">
          <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")}>Lista</Button>
          <Button variant={viewMode === "calendar" ? "default" : "outline"} size="sm" onClick={() => setViewMode("calendar")} className="gap-1"><Calendar className="w-4 h-4" />Calendario</Button>
        </div>
      </PageHeader>

      {viewMode === "calendar" ? renderCalendar() : (
        <>
          <Tabs value={filter} onValueChange={setFilter} className="mb-4">
            <TabsList>
              <TabsTrigger value="attivi">Attivi</TabsTrigger>
              <TabsTrigger value="completati">Completati</TabsTrigger>
              <TabsTrigger value="tutti">Tutti</TabsTrigger>
            </TabsList>
          </Tabs>

          {filtered.length === 0 ? (
            <EmptyState icon={Bell} title="Nessun promemoria" actionLabel="+ Nuovo" onAction={openNew} />
          ) : (
            <div className="space-y-2">
              {filtered.map(r => (
                <div key={r.id} className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-2 ${isOverdue(r.data) && !r.completato ? "border-red-300 bg-red-50" : isExpiringSoon(r.data) && !r.completato ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button onClick={() => toggleComplete(r)} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${r.completato ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-blue-500"}`}>
                      {r.completato && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${r.completato ? "line-through text-slate-400" : "text-slate-900"}`}>{r.titolo}</p>
                      {r.descrizione && <p className="text-xs text-slate-500 whitespace-pre-line line-clamp-2">{r.descrizione}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isOverdue(r.data) && !r.completato && <AlertTriangle className="w-4 h-4 text-red-500" />}
                    {isExpiringSoon(r.data) && !isOverdue(r.data) && !r.completato && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    <span className={`text-xs whitespace-nowrap ${isOverdue(r.data) && !r.completato ? "text-red-600 font-medium" : isExpiringSoon(r.data) && !r.completato ? "text-amber-600 font-medium" : "text-slate-500"}`}>{new Date(r.data).toLocaleDateString("it-IT")}{r.ora ? ` ${r.ora}` : ""}</span>
                    <button onClick={() => handleDelete(r.id)} className="p-2 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuovo Promemoria</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Titolo</Label><Input value={form.titolo} onChange={e => setForm({ ...form, titolo: e.target.value })} /></div>
            <div><Label>Descrizione</Label><textarea value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2 text-sm min-h-[60px]" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data</Label><Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
              <div><Label>Ora</Label><Input type="time" value={form.ora} onChange={e => setForm({ ...form, ora: e.target.value })} /></div>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tipi.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Avvisa con anticipo</Label>
                <Select value={form.anticipo} onValueChange={v => setForm({ ...form, anticipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANTICIPO_OPTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ripeti notifica</Label>
                <Select value={form.ripetizione} onValueChange={v => setForm({ ...form, ripetizione: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RIPETIZIONE_OPTIONS.map(rp => <SelectItem key={rp.value} value={rp.value}>{rp.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700" disabled={!form.titolo || !form.data}>Crea</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dayDetail} onOpenChange={(open) => !open && setDayDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dayDetail ? new Date(dayDetail.dateStr).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }) : ""}</DialogTitle>
          </DialogHeader>
          {dayDetail && dayDetail.items.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">Nessun promemoria per questo giorno.</p>
          ) : (
            <div className="space-y-2 mt-2 max-h-[60vh] overflow-y-auto">
              {dayDetail?.items.map(r => {
                const isScadenza = r.tipo === "scadenza_documento" || r.tipo === "scadenza_contratto";
                const isPreavviso = r.is_preavviso;
                const tipoLabel = tipi.find(t => t.value === r.tipo)?.label || r.tipo;
                return (
                  <div key={r.id} className={`rounded-lg border p-3 ${r.completato ? "border-emerald-200 bg-emerald-50/50" : isPreavviso ? "border-amber-300 bg-amber-50/60" : isScadenza && isOverdue(r.data) ? "border-red-300 bg-red-50/60" : isScadenza ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {isPreavviso ? <Bell className="w-4 h-4 text-amber-500 flex-shrink-0" /> : isScadenza ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" /> : null}
                          <p className={`text-sm font-medium ${r.completato ? "line-through text-slate-400" : isPreavviso ? "text-amber-800" : isScadenza ? "text-red-800" : "text-slate-900"}`}>{r.titolo}</p>
                        </div>
                        {r.descrizione && <p className="text-xs text-slate-600 whitespace-pre-line mb-2">{r.descrizione}</p>}
                        <div className="flex items-center gap-2 flex-wrap">
                          {isPreavviso ? <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-medium">🔔 Preavviso</span> : isScadenza ? <span className="text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded font-medium">⛔ Scadenza finale</span> : <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{tipoLabel}</span>}
                          {r.ora && <span className="text-[10px] text-slate-500">ore {r.ora}</span>}
                          {r.completato && <span className="text-[10px] text-emerald-600">Completato</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => { toggleComplete(r); setDayDetail(d => ({ ...d, items: d.items.map(x => x.id === r.id ? { ...x, completato: !x.completato } : x) })); }} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${r.completato ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-blue-500"}`}>
                          {r.completato && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                        <button onClick={() => { handleDelete(r.id); setDayDetail(d => ({ ...d, items: d.items.filter(x => x.id !== r.id) })); }} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}