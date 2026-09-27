import React from "react";
import { Palette, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getContrastColor } from "@/hooks/useThemeColors";

const COLOR_FIELDS = [
  { key: "colore_principale", label: "Colore Primario", required: true, desc: "Menu, pulsanti, intestazioni" },
  { key: "colore_secondario", label: "Colore Secondario", required: true, desc: "Evidenziazioni, dettagli" },
  { key: "colore_terziario", label: "Colore Terziario", required: false, desc: "Accenti aggiuntivi (facoltativo)" },
  { key: "colore_quaternario", label: "Colore Quaternario", required: false, desc: "Ulteriori accenti (facoltativo)" },
];

function ColorPicker({ field, value, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-sm font-medium text-slate-700">{field.label}</Label>
        {!field.required && value && (
          <button
            onClick={() => onChange(field.key, "")}
            className="text-slate-400 hover:text-red-500"
            title="Rimuovi colore"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-shrink-0">
          <input
            type="color"
            value={value || "#ffffff"}
            onChange={e => onChange(field.key, e.target.value)}
            className="w-10 h-9 rounded-md border border-slate-200 cursor-pointer bg-transparent p-0"
          />
        </div>
        <Input
          value={value || ""}
          onChange={e => onChange(field.key, e.target.value)}
          placeholder={field.required ? "#1e40af" : "Facoltativo"}
          className="font-mono text-xs uppercase"
        />
      </div>
      <p className="text-[11px] text-slate-400 mt-1">{field.desc}</p>
    </div>
  );
}

export default function ColorSettings({ profile, onChange }) {
  const primary = profile.colore_principale || "#1e40af";
  const secondary = profile.colore_secondario || primary;
  const menu = profile.colore_menu || "#0f172a";
  const menuText = getContrastColor(menu);
  const primaryText = getContrastColor(primary);

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex items-center gap-2 mb-3">
        <Palette className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-slate-700">Colori</h3>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Personalizza la palette dell'app e dei documenti generati. I colori facoltativi, se non impostati, non vengono usati.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLOR_FIELDS.map(f => (
          <ColorPicker key={f.key} field={f} value={profile[f.key]} onChange={onChange} />
        ))}
      </div>

      {/* Live preview */}
      <div className="mt-5 rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
          <p className="text-xs font-medium text-slate-500">Anteprima</p>
        </div>
        <div className="flex">
          {/* Mini sidebar */}
          <div className="w-36 p-3 space-y-1.5 flex-shrink-0" style={{ background: menu }}>
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ background: primary }} />
              <span className="text-xs font-bold" style={{ color: menuText }}>Talo</span>
            </div>
            <div className="h-6 rounded flex items-center px-2 text-[10px] font-medium" style={{ background: primary, color: primaryText }}>
              Dashboard
            </div>
            <div className="h-6 rounded flex items-center px-2 text-[10px]" style={{ color: menuText, opacity: 0.6 }}>
              Preventivi
            </div>
            <div className="h-6 rounded flex items-center px-2 text-[10px]" style={{ color: menuText, opacity: 0.6 }}>
              Lavori
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 p-4 bg-slate-50 space-y-3">
            <div className="h-3 w-28 rounded bg-slate-300" />
            <div className="flex flex-wrap gap-2">
              <span
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={{ background: primary, color: primaryText }}
              >
                Pulsante primario
              </span>
              <span
                className="px-3 py-1.5 rounded-md text-xs font-medium border-2"
                style={{ borderColor: secondary, color: secondary }}
              >
                Pulsante secondario
              </span>
            </div>
            <div className="flex gap-2 items-center">
              {profile.colore_terziario ? (
                <span className="w-7 h-7 rounded-full border border-slate-200" style={{ background: profile.colore_terziario }} title="Terziario" />
              ) : (
                <span className="w-7 h-7 rounded-full border border-dashed border-slate-200 flex items-center justify-center text-[8px] text-slate-300">-</span>
              )}
              {profile.colore_quaternario ? (
                <span className="w-7 h-7 rounded-full border border-slate-200" style={{ background: profile.colore_quaternario }} title="Quaternario" />
              ) : (
                <span className="w-7 h-7 rounded-full border border-dashed border-slate-200 flex items-center justify-center text-[8px] text-slate-300">-</span>
              )}
              <span className="text-[10px] text-slate-400">Accenti facoltativi</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <div className="h-1.5 flex-1 rounded-full" style={{ background: primary }} />
              <div className="h-1.5 w-12 rounded-full" style={{ background: secondary }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}