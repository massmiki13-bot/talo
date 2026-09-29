import React from "react";
import { db } from "@/lib/db";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import SignRequestDialog from "@/components/shared/SignRequestDialog";

const OPTIONS = [
  ["foto", "Foto di avanzamento"],
  ["diario", "Diario dei lavori (solo attività e meteo)"],
  ["documenti", "Documenti segnati come visibili al cliente"],
  ["pagamenti", "Piano pagamenti e importi versati"],
];
const DEFAULTS = { foto: true, diario: true, documenti: true, pagamenti: false };

// Link per l'area cliente del lavoro, con la scelta di cosa condividere.
export default function ClientAreaDialog({ open, onOpenChange, worksite, onChange }) {
  const share = { ...DEFAULTS, ...(worksite.cliente_condivisione || {}) };
  const url = `${window.location.origin}/cantiere/${worksite.cliente_token}`;
  const toggle = async (k, v) => onChange(await db.Worksite.update(worksite.id, { cliente_condivisione: { ...share, [k]: v } }));
  const revoke = async () => {
    if (!confirm("Disattivare il link? Il cliente non potrà più aprire l'area del cantiere.")) return;
    onChange(await db.Worksite.update(worksite.id, { cliente_token: null }));
    onOpenChange(false);
  };

  return (
    <SignRequestDialog open={open} onOpenChange={onOpenChange} url={url} heading="Area cliente" title={worksite.nome}
      message={`Buongiorno, da questo link può seguire l'avanzamento dei lavori "${worksite.nome}", con foto e documenti:`}
      note={<div className="flex items-center justify-between gap-3"><p className="text-xs text-zinc-500">Il cliente non vede mai costi, margini o note interne.</p><Button size="sm" variant="ghost" className="text-red-700 shrink-0" onClick={revoke}>Disattiva il link</Button></div>}>
      <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100">
        {OPTIONS.map(([k, label]) => (
          <label key={k} htmlFor={`share-${k}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm cursor-pointer">
            <span>{label}</span><Switch id={`share-${k}`} checked={!!share[k]} onCheckedChange={(v) => toggle(k, v)} />
          </label>
        ))}
      </div>
    </SignRequestDialog>
  );
}
