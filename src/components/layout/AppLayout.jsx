import React, { useState, useEffect } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import MobileBottomNav from "./MobileBottomNav";
import { Building2 } from "lucide-react";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { useCollaborator } from "@/hooks/useCollaborator";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useReminderNotifications } from "@/hooks/useReminderNotifications";

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const { isHost, accessLevel, permissions, employeeId, canAccessPath, loading: collabLoading } = useCollaborator(user);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyProfile, setCompanyProfile] = useState(null);

  useEffect(() => {
    db.CompanyProfile.list().then(profiles => {
      const active = profiles[0];
      if (active) {
        setCompanyProfile(active);
        if (active.ragione_sociale) setCompanyName(active.ragione_sociale);
      }
    }).catch(() => {});
  }, []);

  useThemeColors(companyProfile);
  useReminderNotifications();

  if (!collabLoading && !canAccessPath(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center px-4 z-40">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="font-bold text-slate-900">Talo</span>
          {companyName && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-sm text-slate-500 truncate">{companyName}</span>
            </>
          )}
        </div>
      </div>

      {/* Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar isHost={isHost} accessLevel={accessLevel} permissions={permissions} employeeId={employeeId} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 animate-in slide-in-from-left duration-200">
          <Sidebar onNavigate={() => setMobileOpen(false)} isHost={isHost} accessLevel={accessLevel} permissions={permissions} employeeId={employeeId} />
        </div>
      )}

      <main className="lg:ml-60 min-h-screen pt-14 lg:pt-0 pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <MobileBottomNav onMore={() => setMobileOpen(true)} isHost={isHost} accessLevel={accessLevel} permissions={permissions} employeeId={employeeId} />
    </div>
  );
}