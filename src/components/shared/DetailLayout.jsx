import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Pagine di dettaglio (lavoro, cliente, dipendente) nello stile della Dashboard:
// apertura scura con titolo, azioni e indicatori, poi schede bianche.

export function DetailHero({ back, eyebrow, title, badge, meta = [], actions, stats = [], children, avatar }) {
  return (
    <section className="relative overflow-hidden rounded-3xl brushed text-white">
      <div className="absolute -right-24 -top-28 w-[420px] h-[420px] rounded-full blur-3xl opacity-25 pointer-events-none" style={{ backgroundImage: "var(--metal-red-soft)" }} aria-hidden="true" />
      <div className="relative p-5 sm:p-7">
        {back && (
          <Link to={back.to} className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white mb-4">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />{back.label}
          </Link>
        )}
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">
          <div className="flex-1 min-w-0 flex gap-4">
            {avatar}
            <div className="min-w-0">
              {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400">{eyebrow}</p>}
              <div className="flex flex-wrap items-center gap-2.5 mt-1.5">
                <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase leading-[0.95] break-words">{title}</h1>
                {badge}
              </div>
              {meta.filter(Boolean).length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-sm text-zinc-300">{meta.filter(Boolean).map((m, i) => <span key={i} className="inline-flex items-center gap-1.5 min-w-0">{m}</span>)}</div>
              )}
            </div>
          </div>
          {actions && <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div>}
        </div>
        {stats.length > 0 && (
          <div className={`grid grid-cols-2 ${stats.length >= 4 ? "lg:grid-cols-4" : stats.length === 3 ? "lg:grid-cols-3" : ""} gap-px rounded-2xl overflow-hidden bg-white/[0.08] border border-white/[0.08] mt-6`}>
            {stats.map((s) => <HeroStat key={s.label} {...s} />)}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

function HeroStat({ label, value, sub, tone, progress }) {
  const toneCls = tone === "bad" ? "text-brand-400" : tone === "good" ? "text-emerald-400" : "text-zinc-500";
  return (
    <div className="bg-ink-900/60 p-4 sm:p-5 min-w-0">
      <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400 leading-tight">{label}</p>
      <p className="font-display text-2xl sm:text-3xl font-bold tabular-nums mt-1.5 truncate">{value}</p>
      {progress != null && (
        <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, progress))}%`, backgroundImage: "var(--metal-red)" }} /></div>
      )}
      {sub && <p className={`text-xs mt-1 truncate ${toneCls}`}>{sub}</p>}
    </div>
  );
}

// Pulsanti sull'apertura scura.
export const HeroButton = React.forwardRef(function HeroButton({ as: As = "button", primary, className = "", children, ...props }, ref) {
  return (
    <As ref={ref} {...(As === "button" ? { type: "button" } : {})} {...props} className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition disabled:opacity-60 ${primary ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-white/[0.07] text-zinc-100 border border-white/[0.1] hover:bg-white/[0.12]"} ${className}`}>
      {children}
    </As>
  );
});

export function StatusPill({ className = "", children }) {
  return <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${className}`}>{children}</span>;
}

export function DetailCard({ title, icon: Icon, action, children, className = "", flush }) {
  return (
    <section className={`bg-white rounded-2xl border border-zinc-200 ${flush ? "" : "p-5"} ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between gap-3 ${flush ? "px-5 pt-5" : ""} mb-4`}>
          <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-brand-600" aria-hidden="true" />}{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function DetailTabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-xl bg-white border border-zinc-200 p-1 w-fit max-w-full" role="tablist">
      {tabs.map(([k, label, count]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-sm font-medium transition-colors ${value === k ? "bg-zinc-950 text-white" : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50"}`}>
          {label}
          {count ? <span className={`text-[11px] font-semibold rounded-full px-1.5 min-w-[18px] text-center ${value === k ? "bg-white/15" : "text-white"}`} style={value === k ? undefined : { backgroundImage: "var(--metal-red)" }}>{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Alerts({ items }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-2">
      {items.map((a, i) => (
        <div key={i} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${a.level === "red" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {a.icon && <a.icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />}
          <span>{a.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Importo senza decimali, per gli indicatori grandi. */
export const eurShort = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(Number(v) || 0);

export const initials = (s) => String(s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export function Avatar({ src, name, size = 64 }) {
  return src
    ? <img src={src} alt="" className="rounded-2xl object-cover shrink-0 border border-white/10" style={{ width: size, height: size }} />
    : <span className="grid place-items-center rounded-2xl shrink-0 font-display font-bold text-white text-xl glow-red" style={{ width: size, height: size, backgroundImage: "var(--metal-red)" }} aria-hidden="true">{initials(name)}</span>;
}
