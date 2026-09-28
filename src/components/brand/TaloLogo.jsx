import React, { useId } from "react";

// Marchio Talo (dal logo originale public/logo.jpg): "T" dinamica rossa su nero, resa in rosso metallico.
export function TaloMark({ size = 36, className = "", plate = true }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" className={className} role="img" aria-label="Talo">
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f1f24" />
          <stop offset="1" stopColor="#050506" />
        </linearGradient>
        <linearGradient id={`red${id}`} x1="0.15" y1="0.1" x2="0.75" y2="0.95">
          <stop offset="0" stopColor="#ff6a74" />
          <stop offset="0.32" stopColor="#f0202f" />
          <stop offset="0.5" stopColor="#b10b20" />
          <stop offset="0.62" stopColor="#e11b2c" />
          <stop offset="1" stopColor="#8e0a1c" />
        </linearGradient>
      </defs>
      {plate && <rect x="16" y="16" width="992" height="992" rx="236" fill={`url(#bg${id})`} />}
      {plate && <rect x="24" y="24" width="976" height="976" rx="228" fill="none" stroke="#fff" strokeOpacity="0.07" strokeWidth="8" />}
      {/* ala sinistra */}
      <path d="M310 262 L680 262 C600 285 530 320 480 378 L300 380 C240 382 190 405 155 440 C200 370 250 310 310 262 Z" fill={`url(#red${id})`} />
      {/* ala destra e gamba */}
      <path d="M868 185 C840 250 790 340 700 372 C660 385 625 385 605 420 L525 720 L365 835 L455 455 C470 400 520 335 590 300 C680 255 790 230 868 185 Z" fill={`url(#red${id})`} />
    </svg>
  );
}

export default function TaloLogo({ size = 36, dark = true, subtitle, className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <TaloMark size={size} className="shrink-0" />
      <div className="leading-none min-w-0">
        <span className={`block font-display font-bold uppercase tracking-[0.16em] ${dark ? "text-white" : "text-zinc-950"}`} style={{ fontSize: size * 0.56 }}>Talo</span>
        {subtitle && <span className={`block text-[11px] mt-1 truncate ${dark ? "text-zinc-400" : "text-zinc-500"}`}>{subtitle}</span>}
      </div>
    </div>
  );
}
