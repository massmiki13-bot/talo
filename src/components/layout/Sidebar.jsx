import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Building2, Users, FileText,
  UserCheck, FolderOpen, Bell, FileSignature, Bot,
  BarChart3, ChevronLeft, ChevronRight, LogOut, Briefcase, CalendarClock, UserCog,
  User, HardHat, Mail
} from "lucide-react";
import { api } from "@/lib/db";

export default function Sidebar({ onNavigate, isHost = true, accessLevel = "responsabile", permissions = [], employeeId = null }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/", perm: "dashboard" },
    { label: "Posta", icon: Mail, path: "/posta", perm: null },
    { label: "Clienti e Fornitori", icon: Users, path: "/contatti", perm: "contatti" },
    { label: "Preventivi", icon: FileText, path: "/preventivi", perm: "preventivi" },
    { label: "Lavori", icon: Briefcase, path: "/lavori", perm: "lavori" },
    { label: "Dipendenti", icon: UserCheck, path: "/dipendenti", perm: "dipendenti" },
    { label: "Documenti Ditta", icon: FolderOpen, path: "/documenti-ditta", perm: "documenti_ditta" },
    { label: "Promemoria", icon: Bell, path: "/promemoria", perm: "promemoria" },
    { label: "Contratti", icon: FileSignature, path: "/contratti", perm: "contratti" },
    { label: "Presenze", icon: CalendarClock, path: "/presenze", perm: "presenze", legacyPerms: ["giornaliere", "ore_mensili"] },
    { label: "Analisi", icon: BarChart3, path: "/analisi", perm: "analisi", legacyPerms: ["report_annuale"] },

    { label: "Profilo Ditta", icon: Building2, path: "/profilo-ditta", perm: null },
    { label: "Collaboratori", icon: UserCog, path: "/collaboratori", perm: null },
  ];

  const isOperaio = !isHost && accessLevel === "operaio";

  const operaioItems = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { label: "Il Mio Profilo", icon: User, path: `/dipendenti/${employeeId}` },
    { label: "Le Mie Presenze", icon: CalendarClock, path: "/presenze" },
  ];

  const visibleItems = isOperaio
    ? operaioItems
    : navItems.filter(item =>
        item.perm === null ? isHost : (isHost || permissions.includes(item.perm) || (item.legacyPerms && item.legacyPerms.some(p => permissions.includes(p))))
      );

  const handleLogout = () => {
    api.auth.logout("/login");
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground flex flex-col z-50 transition-all duration-300 w-72 lg:w-60 ${
        collapsed ? "lg:w-16" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Building2 className="w-6 h-6 text-sidebar-primary flex-shrink-0" />
          <span className="font-bold text-lg text-white tracking-tight truncate">Talo</span>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground/60 hover:text-white flex-shrink-0"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg"
                  : "text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-white" : ""}`} />
              <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent transition-colors"
          title={collapsed ? "Esci" : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span className={collapsed ? "lg:hidden" : ""}>Esci</span>
        </button>
      </div>
    </aside>
  );
}