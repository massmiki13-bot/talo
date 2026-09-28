import React from "react";
import TaloLogo from "@/components/brand/TaloLogo";

// Schermata a tutta pagina per errori e pagine inesistenti, nello stile di Talo.
export default function StatusScreen({ code, title, children, actions }) {
  return (
    <main className="min-h-screen brushed text-white flex flex-col">
      <header className="p-6 sm:p-8"><TaloLogo size={36} /></header>
      <div className="flex-1 grid place-items-center px-6 pb-16">
        <div className="max-w-lg w-full">
          {code && <p className="font-display text-[88px] sm:text-[120px] leading-none font-bold text-transparent bg-clip-text" style={{ backgroundImage: "var(--metal-red)" }} aria-hidden="true">{code}</p>}
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase mt-2">{title}</h1>
          <div className="text-zinc-300 mt-3 text-[15px] leading-relaxed">{children}</div>
          {actions && <div className="flex flex-wrap gap-3 mt-8">{actions}</div>}
        </div>
      </div>
    </main>
  );
}

export const primaryBtn = "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950";
export const ghostBtn = "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-200 border border-white/15 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";
