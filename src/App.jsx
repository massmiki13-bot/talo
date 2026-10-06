import { Toaster } from "@/components/ui/toaster"
import ErrorBoundary from '@/components/ErrorBoundary'
import ConfirmHost from '@/components/shared/ConfirmHost'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { PERMISSION_MODULES } from '@/lib/permissions';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';

import { lazy, Suspense, useEffect } from "react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

// Pagine caricate solo quando servono: l'avvio (soprattutto da telefono in cantiere) resta leggero.
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const CompanyProfile = lazy(() => import("@/pages/CompanyProfile"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const ContactDetail = lazy(() => import("@/pages/ContactDetail"));
const Quotes = lazy(() => import("@/pages/Quotes"));
const QuoteEditor = lazy(() => import("@/pages/QuoteEditor"));
const Employees = lazy(() => import("@/pages/Employees"));
const EmployeeDetail = lazy(() => import("@/pages/EmployeeDetail"));
const CompanyDocuments = lazy(() => import("@/pages/CompanyDocuments"));
const Prezzari = lazy(() => import("@/pages/Prezzari"));
const Sicurezza = lazy(() => import("@/pages/Sicurezza"));
const Fatture = lazy(() => import("@/pages/Fatture"));
const Legal = lazy(() => import("@/pages/Legal"));
const Reminders = lazy(() => import("@/pages/Reminders"));
const Contracts = lazy(() => import("@/pages/Contracts"));
const Presenze = lazy(() => import("@/pages/Presenze"));
const Analisi = lazy(() => import("@/pages/Analisi"));
const Worksites = lazy(() => import("@/pages/Worksites"));
const WorksiteDetail = lazy(() => import("@/pages/WorksiteDetail"));
const Collaborators = lazy(() => import("@/pages/Collaborators"));
const CollaboratorJoin = lazy(() => import("@/pages/CollaboratorJoin"));
const Posta = lazy(() => import("@/pages/Posta"));
const PublicQuote = lazy(() => import("@/pages/PublicQuote"));
const PublicSign = lazy(() => import("@/pages/PublicSign"));
const PublicWorksite = lazy(() => import("@/pages/PublicWorksite"));
const Scadenzario = lazy(() => import("@/pages/Scadenzario"));
const Cronoprogramma = lazy(() => import("@/pages/Cronoprogramma"));
const Mezzi = lazy(() => import("@/pages/Mezzi"));
const Qualificazioni = lazy(() => import("@/pages/Qualificazioni"));
const Squadra = lazy(() => import("@/pages/Squadra"));
const JoinWorker = lazy(() => import("@/pages/JoinWorker"));

// Titolo della scheda per pagina (le pagine pubbliche con link impostano il proprio).
const EXTRA_TITLES = [
  ["/login", "Accedi"], ["/register", "Crea il tuo account"], ["/forgot-password", "Password dimenticata"], ["/reset-password", "Nuova password"],
  ["/legal", "Documenti legali"], ["/profilo-ditta", "Profilo ditta"], ["/collaboratori", "Collaboratori"], ["/posta", "Posta"], ["/entra", "Entra in Talo"],
];
const SELF_TITLED = /^\/(p|firma|cantiere)\//;
function RouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (SELF_TITLED.test(pathname)) return;
    const extra = EXTRA_TITLES.find(([p]) => pathname.startsWith(p));
    const mod = PERMISSION_MODULES.find((m) => (m.path === "/" ? pathname === "/" : pathname.startsWith(m.path)));
    const label = extra?.[1] || mod?.label;
    document.title = label ? `${label} · Talo` : "Talo";
  }, [pathname]);
  return null;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-brand-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center"><LoadingSpinner /></div>}>
    <Routes>
      <Route path="/p/:token" element={<PublicQuote />} />
      <Route path="/firma/:token" element={<PublicSign />} />
      <Route path="/cantiere/:token" element={<PublicWorksite />} />
      <Route path="/entra/:inviteId" element={<JoinWorker />} />
      <Route path="/legal/:doc" element={<Legal />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/collaboratori/invito/:inviteId" element={<CollaboratorJoin />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/profilo-ditta" element={<CompanyProfile />} />
          <Route path="/contatti" element={<Contacts />} />
          <Route path="/contatti/:id" element={<ContactDetail />} />

          <Route path="/preventivi" element={<Quotes />} />
          <Route path="/preventivi/:id" element={<QuoteEditor />} />
          <Route path="/dipendenti" element={<Employees />} />
          <Route path="/dipendenti/:id" element={<EmployeeDetail />} />
          <Route path="/documenti-ditta" element={<CompanyDocuments />} />
          <Route path="/prezzari" element={<Prezzari />} />
          <Route path="/sicurezza" element={<Sicurezza />} />
          <Route path="/fatture" element={<Fatture />} />
          <Route path="/scadenzario" element={<Scadenzario />} />
          <Route path="/cronoprogramma" element={<Cronoprogramma />} />
          <Route path="/mezzi" element={<Mezzi />} />
          <Route path="/qualificazioni" element={<Qualificazioni />} />
          <Route path="/squadra" element={<Squadra />} />
          <Route path="/promemoria" element={<Reminders />} />
          <Route path="/contratti" element={<Contracts />} />
          <Route path="/lavori" element={<Worksites />} />
          <Route path="/lavori/:id" element={<WorksiteDetail />} />
          <Route path="/presenze" element={<Presenze />} />
          <Route path="/giornaliere" element={<Navigate to="/presenze?tab=inserimento" replace />} />
          <Route path="/ore-mensili" element={<Navigate to="/presenze?tab=riepilogo" replace />} />
          <Route path="/analisi" element={<Analisi />} />
          <Route path="/report-annuale" element={<Navigate to="/analisi?tab=report" replace />} />
          <Route path="/assistente" element={<Navigate to="/documenti-ditta" replace />} />
          <Route path="/collaboratori" element={<Collaborators />} />
          <Route path="/posta" element={<Posta />} />
          <Route path="/invia-email" element={<Navigate to="/posta" replace />} />
        </Route>
      </Route>
      
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ErrorBoundary>
          <Router>
            <ScrollToTop />
            <RouteTitle />
            <AuthenticatedApp />
            <Toaster />
            <ConfirmHost />
          </Router>
        </ErrorBoundary>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App