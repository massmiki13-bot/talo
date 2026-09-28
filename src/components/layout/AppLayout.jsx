import React, { useState, useEffect, Suspense } from "react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import MobileBottomNav from "./MobileBottomNav";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { useCollaborator } from "@/hooks/useCollaborator";
import { useReminderNotifications } from "@/hooks/useReminderNotifications";
import TaloLogo from "@/components/brand/TaloLogo";
import CommandPalette from "./CommandPalette";
import { Search } from "lucide-react";

const readCollapsed = () => { try { return localStorage.getItem("talo.sidebar") === "1"; } catch { return false; } };

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const { isHost, accessLevel, permissions, employeeId, canAccessPath, loading: collabLoading } = useCollaborator(user);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl+K / ⌘K: ricerca globale da qualsiasi pagina.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    db.CompanyProfile.list().then((profiles) => { if (profiles[0]?.ragione_sociale) setCompanyName(profiles[0].ragione_sociale); }).catch(() => {});
  }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // I colori del Profilo ditta valgono per i documenti (PDF); l'interfaccia resta nel marchio Talo.
  useReminderNotifications();

  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("talo.sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  if (!collabLoading && !canAccessPath(location.pathname)) return <Navigate to="/" replace />;

  const isOperaioNav = !isHost && accessLevel === "operaio";
  const nav = { isHost, accessLevel, permissions, employeeId, companyName, onSearch: isOperaioNav ? null : () => setSearchOpen(true) };

  return (
    <div className="min-h-screen">
      <a href="#contenuto" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-900 focus:shadow-lg">Vai al contenuto</a>
      {/* Barra superiore su telefono */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 metal-ink flex items-center px-4 z-40 border-b border-white/[0.06]">
        <TaloLogo size={30} subtitle={companyName} />
        {!isOperaioNav && <button type="button" onClick={() => setSearchOpen(true)} aria-label="Cerca" className="ml-auto grid place-items-center w-10 h-10 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06]"><Search className="w-5 h-5" /></button>}
      </div>

      {mobileOpen && <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <div className="hidden lg:block">
        <Sidebar {...nav} collapsed={collapsed} onToggle={toggle} />
      </div>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 animate-in slide-in-from-left duration-200">
          <Sidebar {...nav} onNavigate={() => setMobileOpen(false)} />
        </div>
      )}

      <main id="contenuto" tabIndex={-1} className={`min-h-screen outline-none pt-14 lg:pt-0 pb-20 lg:pb-0 transition-[margin] duration-300 ${collapsed ? "lg:ml-[72px]" : "lg:ml-64"}`}>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Suspense fallback={<LoadingSpinner />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {!isOperaioNav && <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} canAccessPath={canAccessPath} />}

      <MobileBottomNav onMore={() => setMobileOpen(true)} isHost={isHost} accessLevel={accessLevel} permissions={permissions} employeeId={employeeId} />
    </div>
  );
}
