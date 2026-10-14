import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Building2, Users, FileText, UserCheck, FolderOpen, Bell, FileSignature,
  BarChart3, ChevronsLeft, ChevronsRight, LogOut, Briefcase, CalendarClock, UserCog,
  User, Mail, BookOpenCheck, ShieldCheck, Receipt, Search, Wallet, GanttChart, Truck, Megaphone, Languages, Award,
} from "lucide-react";
import { api } from "@/lib/db";
import TaloLogo, { TaloMark } from "@/components/brand/TaloLogo";
import { setUiLang, uiLang, onUiLang } from "@/lib/uiI18n";
import { LANGS } from "@/lib/workerI18n";

/** Lingua dell'interfaccia: italiano, rumeno, albanese (i nomi delle lingue non si traducono). */
function LangSwitch({ collapsed }) {
  const [lang, setLang] = React.useState(uiLang());
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => onUiLang(setLang), []);
  const pick = async (l) => { if (l === lang) return; setBusy(true); try { await setUiLang(l); } finally { setBusy(false); } };
  return (
    <div data-no-translate className={`flex items-center gap-2 px-3 py-1.5 ${collapsed ? "lg:hidden" : ""}`}>
      <Languages className="w-[18px] h-[18px] text-zinc-500 shrink-0" aria-hidden="true" />
      <div className="flex flex-1 rounded-lg bg-white/[0.05] p-0.5" role="group" aria-label="Lingua / Limba / Gjuha">
        {LANGS.map((l) => (
          <button key={l.code} type="button" onClick={() => pick(l.code)} aria-pressed={lang === l.code} title={l.label} disabled={busy}
            className={`flex-1 h-7 rounded-md text-xs font-bold transition-colors ${lang === l.code ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>{l.short}</button>
        ))}
      </div>
    </div>
  );
}

export const GROUPS = [
  { title: null, items: [
    { label: "Dashboard", icon: LayoutDashboard, path: "/", perm: "dashboard" },
    { label: "Posta", icon: Mail, path: "/posta", perm: null },
    { label: "Promemoria", icon: Bell, path: "/promemoria", perm: "promemoria" },
  ] },
  { title: "Commerciale", items: [
    { label: "Clienti e fornitori", icon: Users, path: "/contatti", perm: "contatti" },
    { label: "Preventivi", icon: FileText, path: "/preventivi", perm: "preventivi" },
    { label: "Prezzari", icon: BookOpenCheck, path: "/prezzari", perm: "prezzari", legacyPerms: ["preventivi"] },
    { label: "Fatture", icon: Receipt, path: "/fatture", perm: "fatture" },
    { label: "Scadenzario incassi", icon: Wallet, path: "/scadenzario", perm: "scadenzario", legacyPerms: ["fatture"] },
    { label: "Contratti", icon: FileSignature, path: "/contratti", perm: "contratti" },
  ] },
  { title: "Cantiere", items: [
    { label: "Lavori", icon: Briefcase, path: "/lavori", perm: "lavori" },
    { label: "Cronoprogramma", icon: GanttChart, path: "/cronoprogramma", perm: "cronoprogramma", legacyPerms: ["lavori"] },
    { label: "Mezzi e attrezzature", icon: Truck, path: "/mezzi", perm: "mezzi", legacyPerms: ["lavori"] },
    { label: "Sicurezza (POS)", icon: ShieldCheck, path: "/sicurezza", perm: "sicurezza" },
    { label: "Presenze", icon: CalendarClock, path: "/presenze", perm: "presenze", legacyPerms: ["giornaliere", "ore_mensili"] },
    { label: "Richieste e segnalazioni", icon: Megaphone, path: "/squadra", perm: "squadra", legacyPerms: ["presenze", "dipendenti"] },
  ] },
  { title: "Impresa", items: [
    { label: "Dipendenti", icon: UserCheck, path: "/dipendenti", perm: "dipendenti" },
    { label: "ISO e SOA", icon: Award, path: "/qualificazioni", perm: "qualificazioni", legacyPerms: ["documenti_ditta"] },
    { label: "Documenti ditta", icon: FolderOpen, path: "/documenti-ditta", perm: "documenti_ditta" },
    { label: "Analisi", icon: BarChart3, path: "/analisi", perm: "analisi", legacyPerms: ["report_annuale"] },
    { label: "Profilo ditta", icon: Building2, path: "/profilo-ditta", perm: null },
    { label: "Collaboratori", icon: UserCog, path: "/collaboratori", perm: null },
  ] },
];

const SEARCH_KEYS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘ K" : "Ctrl K";

export default function Sidebar({ onNavigate, isHost = true, accessLevel = "responsabile", permissions = [], employeeId = null, companyName = "", collapsed = false, onToggle, onSearch }) {
  const location = useLocation();
  const isOperaio = !isHost && accessLevel === "operaio";
  const allowed = (item) => (item.perm === null ? isHost : isHost || permissions.includes(item.perm) || item.legacyPerms?.some((p) => permissions.includes(p)));
  const groups = isOperaio
    ? [{ title: null, items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/" },
      { label: "Il mio profilo", icon: User, path: `/dipendenti/${employeeId}` },
      { label: "Le mie presenze", icon: CalendarClock, path: "/presenze" },
    ] }]
    : GROUPS.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length);

  const isActive = (path) => location.pathname === path || (path !== "/" && location.pathname.startsWith(path));

  return (
    <aside className={`fixed left-0 top-0 h-screen brushed text-zinc-300 flex flex-col z-50 transition-[width] duration-300 w-72 border-r border-white/[0.06] ${collapsed ? "lg:w-[72px]" : "lg:w-64"}`}>
      {/* Marchio */}
      <div className={`flex items-center gap-2 h-16 border-b border-white/[0.06] ${collapsed ? "lg:justify-center lg:px-0 px-4" : "px-4"}`}>
        <div className={`flex-1 min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
          <TaloLogo size={34} subtitle={companyName || "Gestionale per l'edilizia"} />
        </div>
        {collapsed && <div className="hidden lg:block"><TaloMark size={34} /></div>}
      </div>

      {onSearch && (
        <div className="px-2.5 pt-3">
          <button type="button" onClick={() => { onNavigate?.(); onSearch(); }} title={collapsed ? `Cerca (${SEARCH_KEYS})` : undefined} aria-label="Cerca in Talo"
            className={`flex items-center gap-2.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 h-10 text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
            <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className={`flex-1 text-left ${collapsed ? "lg:hidden" : ""}`}>Cerca…</span>
            <kbd className={`text-[10.5px] font-medium text-zinc-500 border border-white/10 rounded px-1.5 py-0.5 ${collapsed ? "lg:hidden" : ""}`}>{SEARCH_KEYS}</kbd>
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto no-scrollbar py-3 space-y-4">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title && (
              <p className={`px-5 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-zinc-500 ${collapsed ? "lg:hidden" : ""}`}>{g.title}</p>
            )}
            {g.title && collapsed && <div className="hidden lg:block mx-4 mb-2 h-px bg-white/[0.07]" />}
            <ul className="space-y-0.5 px-2.5">
              {g.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors ${collapsed ? "lg:justify-center lg:px-0" : ""} ${
                        active ? "bg-white/[0.06] text-white" : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full" style={{ backgroundImage: "var(--metal-red)" }} />}
                      <span className={`grid place-items-center w-8 h-8 rounded-md shrink-0 transition-colors ${active ? "text-white glow-red" : "text-zinc-500 group-hover:text-zinc-200"}`} style={active ? { backgroundImage: "var(--metal-red)" } : undefined}>
                        <item.icon className="w-[18px] h-[18px]" />
                      </span>
                      <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-2.5 border-t border-white/[0.06] space-y-0.5">
        <LangSwitch collapsed={collapsed} />
        {onToggle && (
          <button onClick={onToggle} className={`hidden lg:flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-white hover:bg-white/[0.04] ${collapsed ? "justify-center px-0" : ""}`} aria-label={collapsed ? "Espandi il menu" : "Comprimi il menu"}>
            {collapsed ? <ChevronsRight className="w-[18px] h-[18px]" /> : <><ChevronsLeft className="w-[18px] h-[18px]" /> Comprimi</>}
          </button>
        )}
        <button onClick={() => api.auth.logout("/login")} className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-white hover:bg-white/[0.04] ${collapsed ? "lg:justify-center lg:px-0" : ""}`} title={collapsed ? "Esci" : undefined}>
          <LogOut className="w-[18px] h-[18px]" />
          <span className={collapsed ? "lg:hidden" : ""}>Esci</span>
        </button>
      </div>
    </aside>
  );
}
