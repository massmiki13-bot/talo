import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Briefcase, FileText, CalendarClock, Menu, User } from "lucide-react";

export default function MobileBottomNav({ onMore, isHost = true, accessLevel = "responsabile", permissions = [], employeeId = null }) {
  const location = useLocation();
  const isOperaio = !isHost && accessLevel === "operaio";

  const operaioItems = [
    { label: "Home", icon: LayoutDashboard, path: "/" },
    { label: "Profilo", icon: User, path: `/dipendenti/${employeeId}` },
    { label: "Presenze", icon: CalendarClock, path: "/presenze" },
  ];

  const defaultItems = [
    { label: "Home", icon: LayoutDashboard, path: "/", perm: "dashboard" },
    { label: "Lavori", icon: Briefcase, path: "/lavori", perm: "lavori" },
    { label: "Preventivi", icon: FileText, path: "/preventivi", perm: "preventivi" },
    { label: "Presenze", icon: CalendarClock, path: "/presenze", perm: "presenze", legacyPerms: ["giornaliere", "ore_mensili"] },
  ].filter(item => isHost || permissions.includes(item.perm) || (item.legacyPerms && item.legacyPerms.some(p => permissions.includes(p))));

  const items = isOperaio ? operaioItems : defaultItems;

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 metal-ink border-t border-white/[0.07] flex items-center justify-around h-16 px-1 safe-area-pb">
      {items.map((item) => {
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-lg transition-colors min-w-[56px] ${active ? "text-white" : "text-zinc-500"}`}
          >
            <span className={`grid place-items-center w-9 h-7 rounded-full ${active ? "glow-red" : ""}`} style={active ? { backgroundImage: "var(--metal-red)" } : undefined}><item.icon className="w-[18px] h-[18px]" /></span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
      {!isOperaio && (
        <button
          onClick={onMore}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-lg transition-colors min-w-[56px] text-zinc-500"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">Altro</span>
        </button>
      )}
    </nav>
  );
}