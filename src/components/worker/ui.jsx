import React from "react";

// Elementi grafici comuni dell'app operai: grandi, leggibili, pensati per il telefono in cantiere.
export function Card({ title, icon: I, action, children, className = "" }) {
  return (
    <section className={`bg-white rounded-2xl border border-zinc-200 p-4 ${className}`}>
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
  return <button type="button" {...props} className={`w-full h-14 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-60 ${className || "bg-brand-600 text-white"}`}>{children}</button>;
}

export function Pill({ children, tone = "zinc" }) {
  const cls = { zinc: "bg-zinc-100 text-zinc-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-900", red: "bg-red-100 text-red-800" }[tone];
  return <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${cls}`}>{children}</span>;
}

export const fmtDay = (d, lang = "it") => new Date(d).toLocaleDateString(lang === "sq" ? "sq-AL" : lang === "ro" ? "ro-RO" : "it-IT", { day: "numeric", month: "short" });
