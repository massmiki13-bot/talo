import React from "react";
import { HardHat, FileText, ShieldCheck, Receipt } from "lucide-react";
import TaloLogo from "@/components/brand/TaloLogo";

const POINTS = [
  { icon: FileText, text: "Preventivi con prezzari e IA, firmati online dal cliente" },
  { icon: HardHat, text: "Lavori, presenze e costi di cantiere sempre sotto controllo" },
  { icon: ShieldCheck, text: "POS, documenti e scadenze in ordine, senza carta" },
  { icon: Receipt, text: "Fatture elettroniche pronte in formato FatturaPA" },
];

// Struttura in acciaio disegnata: travi e diagonali, appena visibili.
function Truss() {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none" aria-hidden="true">
      <defs>
        <pattern id="truss" width="120" height="120" patternUnits="userSpaceOnUse">
          <path d="M0 0H120M0 120H120M0 0L60 120L120 0" fill="none" stroke="#fff" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#truss)" />
    </svg>
  );
}

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden brushed text-white p-12">
        <Truss />
        <div className="absolute -right-24 -bottom-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-30" style={{ backgroundImage: "var(--metal-red-soft)" }} />
        <TaloLogo size={44} className="relative" />
        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400">Gestionale per l'edilizia</p>
          <h2 className="font-display text-5xl xl:text-6xl font-bold uppercase leading-[0.95] mt-4">Il cantiere<br />sotto controllo.</h2>
          <ul className="mt-10 space-y-4">
            {POINTS.map(({ icon: I, text }) => (
              <li key={text} className="flex items-center gap-3 text-zinc-300">
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] shrink-0"><I className="w-[18px] h-[18px] text-brand-400" /></span>
                <span className="text-[15px]">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-zinc-500">© {new Date().getFullYear()} Talo</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-10"><TaloLogo size={40} dark={false} /></div>
          <h1 className="font-display text-4xl font-bold uppercase tracking-[0.01em] text-zinc-950">{title}</h1>
          {subtitle && <p className="text-zinc-500 mt-2 text-[15px]">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <p className="text-sm text-zinc-500 mt-8">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
