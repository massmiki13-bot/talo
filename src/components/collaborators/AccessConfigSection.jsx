import React from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERMISSION_MODULES } from "@/lib/permissions";
import { ShieldCheck, HardHat } from "lucide-react";

// Profili tipici: un clic imposta i moduli, poi si può rifinire.
const PRESETS = [
  { label: "Ufficio / amministrazione", perms: ["dashboard", "contatti", "preventivi", "lavori", "documenti_ditta", "promemoria", "contratti", "analisi"] },
  { label: "Capocantiere", perms: ["dashboard", "lavori", "presenze", "promemoria", "dipendenti"] },
  { label: "Commerciale", perms: ["dashboard", "contatti", "preventivi", "promemoria"] },
  { label: "Tutto", perms: null },
];

// Shared component for configuring access level and permissions.
// Used by both InviteDialog and EditCollaboratorDialog.
export default function AccessConfigSection({
  accessLevel,
  setAccessLevel,
  employeeId,
  setEmployeeId,
  permissions,
  setPermissions,
  employees,
}) {
  const togglePerm = (key) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const isResponsabile = accessLevel !== "operaio";

  return (
    <div className="space-y-4">
      {/* Access level selector */}
      <div>
        <Label className="mb-2 block">Livello di Accesso</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAccessLevel("responsabile")}
            className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
              isResponsabile
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-sm font-medium">Responsabile</span>
          </button>
          <button
            type="button"
            onClick={() => setAccessLevel("operaio")}
            className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
              !isResponsabile
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
            }`}
          >
            <HardHat className="w-5 h-5" />
            <span className="text-sm font-medium">Operaio / Dipendente</span>
          </button>
        </div>
        <p className="text-xs text-zinc-500 mt-1.5">
          {isResponsabile
            ? "Vede e gestisce i dati dei moduli autorizzati."
            : "Vede solo i propri documenti, giornaliere e ore lavorate."}
        </p>
      </div>

      {isResponsabile ? (
        <>
          {/* Permission modules */}
          <div>
            <Label className="mb-2 block">Cosa può vedere e gestire</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESETS.map((pr) => {
                const keys = pr.perms || PERMISSION_MODULES.map((m) => m.key);
                const on = keys.length === permissions.length && keys.every((k) => permissions.includes(k));
                return <button key={pr.label} type="button" onClick={() => setPermissions(keys)} className={`text-xs px-2.5 py-1 rounded-full border ${on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>{pr.label}</button>;
              })}
            </div>
            <div className="grid sm:grid-cols-2 gap-x-2 gap-y-0.5 max-h-56 overflow-y-auto rounded-lg border border-zinc-200 p-1.5">
              {PERMISSION_MODULES.map((mod) => (
                <div key={mod.key} className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-zinc-50">
                  <Checkbox
                    id={`perm-${mod.key}`}
                    checked={permissions.includes(mod.key)}
                    onCheckedChange={() => togglePerm(mod.key)}
                  />
                  <Label htmlFor={`perm-${mod.key}`} className="cursor-pointer text-sm">
                    {mod.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* Employee selector for operaio */
        <div>
          <Label className="mb-2 block">Collega Dipendente</Label>
          {employees.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Nessun dipendente presente. Crea prima la scheda dipendente, poi collega l'account.
            </p>
          ) : (
            <Select value={employeeId || ""} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Seleziona il dipendente..." /></SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.nome} {emp.cognome} {emp.ruolo ? `— ${emp.ruolo}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-zinc-500 mt-1.5">
            L'operaio vedrà solo i propri documenti, le proprie presenze e le proprie ore.
          </p>
        </div>
      )}
    </div>
  );
}