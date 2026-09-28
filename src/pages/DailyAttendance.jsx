import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/db";
import { getAccessContext } from "@/lib/accessScope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, Plus, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import AttendanceDayDialog from "@/components/attendance/AttendanceDayDialog";
import { ATTENDANCE_STATES, STATE_ORDER, getStatoInfo } from "@/utils/attendanceStates";

const hexToRgba = (hex, alpha = 0.3) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildDayGradient = (presenze) => {
  const counts = {};
  presenze.forEach(p => {
    const s = p.stato || "presente";
    counts[s] = (counts[s] || 0) + 1;
  });
  const total = presenze.length;
  const active = STATE_ORDER.filter(s => counts[s]);
  if (active.length === 0) return "transparent";
  if (active.length === 1) return hexToRgba(ATTENDANCE_STATES[active[0]].color, 0.3);
  let pos = 0;
  const stops = active.map(s => {
    const pct = counts[s] / total;
    const end = pos + pct * 100;
    const seg = `${hexToRgba(ATTENDANCE_STATES[s].color, 0.3)} ${pos.toFixed(2)}% ${end.toFixed(2)}%`;
    pos = end;
    return seg;
  });
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
};

export default function DailyAttendance() {
  const [worksites, setWorksites] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allAttendance, setAllAttendance] = useState([]);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [siteDialog, setSiteDialog] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [sezioniLabel, setSezioniLabel] = useState("Sezione");
  const { toast } = useToast();

  const accessCtx = getAccessContext();
  const isOperaio = !accessCtx.isHost && accessCtx.accessLevel === "operaio";
  const myEmpId = accessCtx.employeeId;

  useEffect(() => {
    loadInitial();
    const unsubs = ["Employee", "Worksite"].map(e => db[e].subscribe(() => loadInitial()));
    return () => { unsubs.forEach(u => { try { u && u(); } catch (_) {} }); };
  }, []);

  useEffect(() => {
    db.CompanyProfile.list().then(profiles => {
      const active = profiles[0];
      if (active?.termine_sezioni) setSezioniLabel(active.termine_sezioni);
    }).catch(() => {});
  }, []);

  const loadInitial = async () => {
    try {
      const [sites, emps, records] = await Promise.all([
        db.Worksite.filter({ attivo: true }),
        db.Employee.list(),
        db.DailyAttendance.list(),
      ]);
      setWorksites(sites);
      setEmployees(emps);
      setAllAttendance(records);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const navigateMonth = (delta) => {
    let m = calMonth + delta;
    let y = calYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCalMonth(m);
    setCalYear(y);
  };

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  // Build per-day aggregated data (merge records for same date)
  const dayDataMap = useMemo(() => {
    const map = {};
    allAttendance.forEach(rec => {
      if (!rec.data) return;
      const d = new Date(rec.data);
      if (d.getMonth() !== calMonth || d.getFullYear() !== calYear) return;

      if (!map[rec.data]) map[rec.data] = { presenze: [], recordIds: [] };
      map[rec.data].recordIds.push(rec.id);

      (rec.presenze || []).forEach(p => {
        if (!p.dipendente_id) return;
        if (isOperaio && p.dipendente_id !== myEmpId) return;

        const hasRealCantiere = rec.cantiere_id && rec.cantiere_id !== "__nessun_cantiere__";
        const existing = map[rec.data].presenze.find(x => x.dipendente_id === p.dipendente_id);
        if (existing) {
          const stato = p.stato || "presente";
          if (stato === "presente") existing.stato = "presente";
          else if (existing.stato !== "presente") existing.stato = stato;
          if (p.note) existing.note = p.note;
          if (stato === "presente") {
            existing.ore = (existing.ore || 0) + (p.ore || 0);
            if (hasRealCantiere) {
              existing.cantieri = [...(existing.cantieri || []), { cantiere_id: rec.cantiere_id, cantiere_nome: rec.cantiere_nome || "", ore: p.ore || 0 }];
            }
          }
        } else {
          const newP = { ...p, cantieri: [] };
          if ((p.stato || "presente") === "presente") {
            if (hasRealCantiere) {
              newP.cantieri = [{ cantiere_id: rec.cantiere_id, cantiere_nome: rec.cantiere_nome || "", ore: p.ore || 0 }];
            } else if (p.ore > 0) {
              newP.cantieri = [{ cantiere_id: "", cantiere_nome: "", ore: p.ore || 0 }];
            }
          }
          map[rec.data].presenze.push(newP);
        }
      });
    });
    return map;
  }, [allAttendance, calMonth, calYear, isOperaio, myEmpId]);

  const isHoliday = (dateStr) => new Date(dateStr).getDay() === 0;
  const isSaturday = (dateStr) => new Date(dateStr).getDay() === 6;

  const openDay = (dayNum) => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const dayData = dayDataMap[dateStr];
    setSelectedDay({
      dateStr,
      presenze: dayData?.presenze || [],
    });
  };

  const handleSaveDay = async (presenze) => {
    const dateStr = selectedDay.dateStr;
    const existing = allAttendance.filter(a => a.data === dateStr);

    // Strip _autofill flag and filter valid entries
    const cleanPresenze = presenze.filter(p => p.dipendente_id).map(({ _autofill, ...rest }) => rest);

    // Group presenze by cantiere for "presente", "general" bucket for non-presente
    const GENERAL_KEY = "__nessun_cantiere__";
    const groups = {};
    const ensureGeneral = () => {
      if (!groups[GENERAL_KEY]) groups[GENERAL_KEY] = { cantiere_id: GENERAL_KEY, cantiere_nome: "", presenze: [] };
      return groups[GENERAL_KEY];
    };

    cleanPresenze.forEach(p => {
      const stato = p.stato || "presente";
      if (stato !== "presente") {
        ensureGeneral().presenze.push({ dipendente_id: p.dipendente_id, dipendente_nome: p.dipendente_nome, stato, ore: 0, note: p.note || "" });
      } else {
        const cantieriWithId = (p.cantieri || []).filter(c => c.cantiere_id);
        if (cantieriWithId.length === 0) {
          // Presente senza cantiere assegnato: salva comunque con le ore
          ensureGeneral().presenze.push({ dipendente_id: p.dipendente_id, dipendente_nome: p.dipendente_nome, stato: "presente", ore: p.ore || 0, note: p.note || "" });
        } else {
          cantieriWithId.forEach(c => {
            if (!groups[c.cantiere_id]) groups[c.cantiere_id] = { cantiere_id: c.cantiere_id, cantiere_nome: c.cantiere_nome, presenze: [] };
            groups[c.cantiere_id].presenze.push({ dipendente_id: p.dipendente_id, dipendente_nome: p.dipendente_nome, stato: "presente", ore: c.ore || 0, note: p.note || "" });
          });
        }
      }
    });

    // Create new records FIRST (before deleting old ones, to avoid data loss on error)
    const newRecords = [];
    for (const g of Object.values(groups)) {
      if (g.presenze.length === 0) continue;
      const created = await db.DailyAttendance.create({ data: dateStr, cantiere_id: g.cantiere_id, cantiere_nome: g.cantiere_nome, presenze: g.presenze });
      newRecords.push(created);
    }

    // Now delete old records for this date
    for (const rec of existing) {
      await db.DailyAttendance.delete(rec.id);
    }

    const records = await db.DailyAttendance.list();
    setAllAttendance(records);
    setSelectedDay(null);
    toast({ title: "Giornaliera salvata", description: `${newRecords.length} record creati` });
  };

  const createWorksite = async () => {
    if (!newSiteName.trim()) return;
    try {
      await db.Worksite.create({ nome: newSiteName, attivo: true });
      setNewSiteName("");
      setSiteDialog(false);
      const sites = await db.Worksite.filter({ attivo: true });
      setWorksites(sites);
      toast({ title: `${sezioniLabel} creata` });
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {worksites.length === 0 ? (
        <EmptyState icon={CalendarDays} title={`Nessuna ${sezioniLabel.toLowerCase()} creata`}
          description={`Crea la prima ${sezioniLabel.toLowerCase()} (cantiere, via, negozio...) per iniziare a registrare le presenze`}
          actionLabel={`+ Nuova ${sezioniLabel}`} onAction={() => setSiteDialog(true)} />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigateMonth(-1)} className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft className="w-5 h-5" /></button>
              <span className="text-sm font-semibold text-slate-700 min-w-[120px] text-center capitalize">
                {new Date(calYear, calMonth).toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
              </span>
              <button onClick={() => navigateMonth(1)} className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronRight className="w-5 h-5" /></button>
            </div>
            <Button variant="outline" onClick={() => setSiteDialog(true)} className="gap-2">
              <Settings className="w-4 h-4" /> Gestisci {sezioniLabel}
            </Button>
          </div>

          <div className="flex flex-wrap gap-3 mb-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200"></span>Festivo</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border border-slate-200"></span>Sabato</span>
            {STATE_ORDER.map(s => (
              <span key={s} className="flex items-center gap-1">
                <span className={`w-3 h-3 rounded border ${ATTENDANCE_STATES[s].bgClass}`}></span>{ATTENDANCE_STATES[s].label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(d => (
              <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
            ))}
            {Array.from({ length: startWeekday }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const dayData = dayDataMap[dateStr];
              const hasData = dayData && dayData.presenze.length > 0;
              const totalOre = hasData ? dayData.presenze.filter(p => (p.stato || "presente") === "presente").reduce((s, p) => s + (p.ore || 0), 0) : 0;
              const holiday = isHoliday(dateStr);
              const saturday = isSaturday(dateStr);
              const dayStates = hasData ? [...new Set(dayData.presenze.map(p => p.stato || "presente"))] : [];
              const hasPresente = dayStates.includes("presente");
              const hasOtherStates = dayStates.some(s => s !== "presente");

              let bgClass;
              let dayStyle = {};
              if (hasData) {
                bgClass = "border-slate-300 hover:border-brand-500";
                dayStyle = { background: buildDayGradient(dayData.presenze) };
              } else if (holiday) {
                bgClass = "bg-red-50 border-red-200";
              } else if (saturday) {
                bgClass = "bg-slate-50 border-slate-200";
              } else {
                bgClass = "bg-white border-slate-100 hover:border-slate-300";
              }

              return (
                <button key={dayNum} onClick={() => openDay(dayNum)}
                  style={dayStyle}
                  className={`min-h-[60px] sm:min-h-[90px] border rounded-lg p-1 sm:p-1.5 text-left transition-colors cursor-pointer ${bgClass}`}>
                  <div className={`text-xs font-medium ${holiday ? "text-red-600" : saturday ? "text-slate-400" : "text-slate-700"}`}>
                    {dayNum}
                  </div>
                  <div className="text-[10px] text-slate-500 capitalize">
                    {new Date(dateStr).toLocaleDateString("it-IT", { weekday: "short" })}
                  </div>
                  {hasData && (
                    <div className="mt-1">
                      <div className="text-[10px] font-semibold text-slate-700">{dayData.presenze.length} dip.</div>
                      {totalOre > 0 && <div className="text-[10px] text-slate-600">{totalOre.toFixed(0)}h</div>}
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {dayStates.map(s => (
                          <span key={s} className={`text-[8px] px-1 rounded ${ATTENDANCE_STATES[s].badgeClass}`} title={ATTENDANCE_STATES[s].label}>
                            {ATTENDANCE_STATES[s].short}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      <AttendanceDayDialog
        open={!!selectedDay}
        dateStr={selectedDay?.dateStr}
        initialPresenze={selectedDay?.presenze}
        employees={employees}
        worksites={worksites}
        readOnly={isOperaio}
        onSave={handleSaveDay}
        onClose={() => setSelectedDay(null)}
      />

      <Dialog open={siteDialog} onOpenChange={setSiteDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gestisci {sezioniLabel}</DialogTitle></DialogHeader>
          <div className="mt-4">
            <div className="flex gap-2 mb-4">
              <Input value={newSiteName} onChange={e => setNewSiteName(e.target.value)} placeholder={`Nome nuova ${sezioniLabel.toLowerCase()}...`} />
              <Button onClick={createWorksite} className="bg-brand-600 hover:bg-brand-700">Crea</Button>
            </div>
            <div className="space-y-2">
              {worksites.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm font-medium">{s.nome}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}