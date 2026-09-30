import React from "react";
import { Sparkles, Loader2 } from "lucide-react";

// Elementi grafici comuni dell'app operai: grandi, leggibili, pensati per il telefono in cantiere.
export function Card({ title, icon: I, action, children, className = "" }) {
  return (
    <section className={`bg-white rounded-[20px] border border-zinc-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-[15px] font-semibold text-zinc-900 flex items-center gap-2">{I && <I className="w-4 h-4 text-brand-600" aria-hidden="true" />}{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function BigButton({ children, className = "", ...props }) {
  return <button type="button" {...props} className={`w-full h-14 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-60 ${className || "bg-brand-600 text-white shadow-[0_6px_16px_-6px_rgba(195,18,42,0.6)]"}`}>{children}</button>;
}

export function Pill({ children, tone = "zinc" }) {
  const cls = { zinc: "bg-zinc-100 text-zinc-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-900", red: "bg-red-100 text-red-800" }[tone];
  return <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${cls}`}>{children}</span>;
}

/** Etichetta + controllo. */
export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block text-xs text-zinc-500 mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full h-12 rounded-xl border border-zinc-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500";

/** Scelta tra opzioni a pulsanti (una sola). options: [[valore, etichetta], …]. */
export function Choice({ label, options, value, onChange, cols = 2, tone = "brand" }) {
  const on = tone === "red" ? "border-red-600 bg-red-50 text-red-800" : "border-brand-600 bg-brand-50 text-brand-800";
  return (
    <div role="group" aria-label={label}>
      {label && <p className="text-sm font-medium text-zinc-800 mb-1">{label}</p>}
      <div className={`grid gap-1.5 ${cols === 3 ? "grid-cols-3" : cols === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {options.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(value === v ? "" : v)}
            className={`min-h-[44px] rounded-xl border px-2.5 py-1.5 text-sm font-medium text-left leading-tight transition ${value === v ? on : "border-zinc-200 bg-white text-zinc-700"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

/** Pulsante dell'assistente IA. */
export function AiButton({ busy, children, className = "", ...props }) {
  return (
    <button type="button" {...props} disabled={busy || props.disabled}
      className={`h-11 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 text-white disabled:opacity-60 bg-[linear-gradient(135deg,#18181b,#3f3f46)] ring-1 ring-inset ring-white/10 ${className}`}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" aria-hidden="true" />}{children}
    </button>
  );
}

export const locale = (lang) => (lang === "sq" ? "sq-AL" : lang === "ro" ? "ro-RO" : "it-IT");
export const fmtDay = (d, lang = "it") => new Date(d).toLocaleDateString(locale(lang), { day: "numeric", month: "short" });
