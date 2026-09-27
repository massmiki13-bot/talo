import { Toaster } from "@/components/ui/toaster"
import ErrorBoundary from '@/components/ErrorBoundary'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// App pages
import Dashboard from '@/pages/Dashboard';
import CompanyProfile from '@/pages/CompanyProfile';
import Contacts from '@/pages/Contacts';
import ContactDetail from '@/pages/ContactDetail';

import Quotes from '@/pages/Quotes';
import QuoteEditor from '@/pages/QuoteEditor';
import Employees from '@/pages/Employees';
import EmployeeDetail from '@/pages/EmployeeDetail';
import CompanyDocuments from '@/pages/CompanyDocuments';
import Reminders from '@/pages/Reminders';
import Contracts from '@/pages/Contracts';
import Presenze from '@/pages/Presenze';
import Analisi from '@/pages/Analisi';
import AIAssistant from '@/pages/AIAssistant';
import Worksites from '@/pages/Worksites';
import WorksiteDetail from '@/pages/WorksiteDetail';
import Collaborators from '@/pages/Collaborators';
import CollaboratorJoin from '@/pages/CollaboratorJoin';
import Posta from '@/pages/Posta';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
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
          <Route path="/promemoria" element={<Reminders />} />
          <Route path="/contratti" element={<Contracts />} />
          <Route path="/lavori" element={<Worksites />} />
          <Route path="/lavori/:id" element={<WorksiteDetail />} />
          <Route path="/presenze" element={<Presenze />} />
          <Route path="/giornaliere" element={<Navigate to="/presenze?tab=inserimento" replace />} />
          <Route path="/ore-mensili" element={<Navigate to="/presenze?tab=riepilogo" replace />} />
          <Route path="/analisi" element={<Analisi />} />
          <Route path="/report-annuale" element={<Navigate to="/analisi?tab=report" replace />} />
          <Route path="/assistente" element={<AIAssistant />} />
          <Route path="/collaboratori" element={<Collaborators />} />
          <Route path="/posta" element={<Posta />} />
          <Route path="/invia-email" element={<Navigate to="/posta" replace />} />
        </Route>
      </Route>
      
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ErrorBoundary>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
            <Toaster />
          </Router>
        </ErrorBoundary>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App