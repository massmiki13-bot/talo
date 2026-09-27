import React from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERMISSION_MODULES } from "@/lib/permissions";
import { ShieldCheck, HardHat } from "lucide-react";

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
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
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
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <HardHat className="w-5 h-5" />
            <span className="text-sm font-medium">Operaio / Dipendente</span>
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          {isResponsabile
            ? "Vede e gestisce i dati dei moduli autorizzati."
            : "Vede solo i propri documenti, giornaliere e ore lavorate."}
        </p>
      </div>

      {isResponsabile ? (
        <>
          {/* Permission modules */}
          <div>
            <Label className="mb-2 block">Moduli Accessibili</Label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {PERMISSION_MODULES.map((mod) => (
                <div key={mod.key} className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-50">
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
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
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
          <p className="text-xs text-slate-400 mt-1.5">
            L'operaio vedrà solo i propri documenti, le proprie presenze e le proprie ore.
          </p>
        </div>
      )}
    </div>
  );
}