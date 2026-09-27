import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, MapPin } from "lucide-react";
import { ATTENDANCE_STATES, STATE_ORDER } from "@/utils/attendanceStates";

export default function AttendanceDayDialog({
  open, dateStr, initialPresenze, employees, worksites, readOnly, onSave, onClose
}) {
  const [presenze, setPresenze] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const existing = initialPresenze || [];
    // Precompila automaticamente i dipendenti dell'anagrafica non ancora presenti
    if (readOnly) {
      setPresenze(existing);
      return;
    }
    const presentIds = new Set(existing.filter(p => p.dipendente_id).map(p => p.dipendente_id));
    const autoAdded = employees
      .filter(e => !presentIds.has(e.id))
      .map(e => ({
        dipendente_id: e.id,
        dipendente_nome: `${e.nome} ${e.cognome}`,
        stato: "presente",
        ore: 8,
        note: "",
        cantieri: [{ cantiere_id: "", cantiere_nome: "", ore: 8 }],
        _autofill: true,
      }));
    setPresenze([...existing, ...autoAdded]);
  }, [initialPresenze, open, employees, readOnly]);

  const addPresenza = () => {
    setPresenze(prev => [...prev, {
      dipendente_id: "", dipendente_nome: "", stato: "presente", ore: 0, note: "", cantieri: [{ cantiere_id: "", cantiere_nome: "", ore: 8 }]
    }]);
  };

  const updatePresenza = (idx, field, value) => {
    setPresenze(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      const updated = { ...p, [field]: value };
      if (field === "dipendente_id") {
        const emp = employees.find(e => e.id === value);
        updated.dipendente_nome = emp ? `${emp.nome} ${emp.cognome}` : "";
      }
      if (field === "stato") {
        if (value !== "presente") {
          updated.cantieri = [];
          updated.ore = 0;
        } else if (!updated.cantieri?.length) {
          updated.cantieri = [{ cantiere_id: "", cantiere_nome: "", ore: 8 }];
          updated.ore = 8;
        }
      }
      return updated;
    }));
  };

  const updateCantiere = (pIdx, cIdx, field, value) => {
    setPresenze(prev => prev.map((p, i) => {
      if (i !== pIdx) return p;
      const cantieri = [...(p.cantieri || [])];
      const c = { ...cantieri[cIdx] };
      if (field === "cantiere_id") {
        c.cantiere_id = value;
        const ws = worksites.find(w => w.id === value);
        c.cantiere_nome = ws?.nome || "";
      } else if (field === "ore") {
        c.ore = parseFloat(value) || 0;
      }
      cantieri[cIdx] = c;
      const totalOre = cantieri.reduce((s, c) => s + (c.ore || 0), 0);
      return { ...p, cantieri, ore: totalOre };
    }));
  };

  const addCantiere = (pIdx) => {
    setPresenze(prev => prev.map((p, i) => {
      if (i !== pIdx) return p;
      return { ...p, cantieri: [...(p.cantieri || []), { cantiere_id: "", cantiere_nome: "", ore: 0 }] };
    }));
  };

  const removeCantiere = (pIdx, cIdx) => {
    setPresenze(prev => prev.map((p, i) => {
      if (i !== pIdx) return p;
      const cantieri = (p.cantieri || []).filter((_, ci) => ci !== cIdx);
      const totalOre = cantieri.reduce((s, c) => s + (c.ore || 0), 0);
      return { ...p, cantieri, ore: totalOre };
    }));
  };

  const removePresenza = (idx) => setPresenze(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(presenze);
    } finally {
      setSaving(false);
    }
  };

  if (!dateStr) return null;
  const dateLabel = new Date(dateStr).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Presenze del {dateLabel}</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-600">
              {presenze.length} dipendente{presenze.length !== 1 ? "i" : ""}
              {presenze.some(p => p._autofill) && !readOnly && (
                <span className="text-xs text-blue-600 font-normal ml-2">• precompilati dall'anagrafica, conferma gli stati</span>
              )}
            </span>
            {!readOnly && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={addPresenza} className="gap-1">
                  <Plus className="w-4 h-4" />Aggiungi
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">
                  <Save className="w-4 h-4" />{saving ? "..." : "Salva"}
                </Button>
              </div>
            )}
          </div>

          {presenze.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">Nessuna presenza. Clicca "Aggiungi" per inserire.</p>
          ) : (
            <div className="space-y-3">
              {presenze.map((p, idx) => {
                const stato = p.stato || "presente";
                const info = ATTENDANCE_STATES[stato];
                const isPresente = stato === "presente";
                return (
                  <div key={idx} className={`rounded-lg border-2 p-3 ${info.bgClass}`}>
                    <div className="flex gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <Select value={p.dipendente_id} onValueChange={v => updatePresenza(idx, "dipendente_id", v)} disabled={readOnly}>
                          <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="Seleziona dipendente" /></SelectTrigger>
                          <SelectContent>
                            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.nome} {e.cognome}</SelectItem>)}
                            {p.dipendente_id && !employees.some(e => e.id === p.dipendente_id) && (
                              <SelectItem value={p.dipendente_id} disabled>{p.dipendente_nome || "Dipendente eliminato"}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      {!readOnly && (
                        <button onClick={() => removePresenza(idx)} className="p-2.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {STATE_ORDER.map(s => {
                        const sInfo = ATTENDANCE_STATES[s];
                        const active = stato === s;
                        return (
                          <button key={s} disabled={readOnly}
                            onClick={() => updatePresenza(idx, "stato", s)}
                            className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                              active ? sInfo.bgClass + " font-semibold" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                            } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                          >
                            {sInfo.label}
                          </button>
                        );
                      })}
                    </div>

                    {isPresente && (
                      <div className="space-y-1.5 mb-2">
                        {(p.cantieri || []).map((c, cIdx) => (
                          <div key={cIdx} className="flex gap-2 items-center">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <Select value={c.cantiere_id} onValueChange={v => updateCantiere(idx, cIdx, "cantiere_id", v)} disabled={readOnly}>
                                <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Seleziona cantiere..." /></SelectTrigger>
                                <SelectContent>
                                  {worksites.map(w => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="w-16">
                              <Input type="number" value={c.ore} onChange={e => updateCantiere(idx, cIdx, "ore", e.target.value)} disabled={readOnly}
                                className="text-center h-8 text-xs bg-white" placeholder="Ore" />
                            </div>
                            <span className="text-xs text-slate-400">h</span>
                            {!readOnly && (
                              <button onClick={() => removeCantiere(idx, cIdx)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 flex-shrink-0">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        {!readOnly && (
                          <button onClick={() => addCantiere(idx)} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 ml-6">
                            <Plus className="w-3 h-3" />Aggiungi cantiere
                          </button>
                        )}
                        <div className="text-xs font-medium text-slate-600 ml-6">
                          Totale: {p.ore?.toFixed(1) || 0}h
                        </div>
                      </div>
                    )}

                    <Input value={p.note || ""} onChange={e => updatePresenza(idx, "note", e.target.value)} disabled={readOnly}
                      placeholder="Note (opzionale)" className="text-sm h-9 bg-white" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}