import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, AuthErrorScreen } from './contexts/AuthContext';
import { resolveLoginMode } from './lib/licenseFlow';
import { hasAnyRole, normalizeRoles, ROUTE_ROLES } from './lib/rbac';
import { YearProvider } from './contexts/YearContext';
import Layout from './components/Layout';
import Login from './pages/LoginPage';
import LoginOnline from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Account from './pages/Account';
import Security from './pages/Security';
import Settings from './pages/Settings';
import StudentsMigration from './pages/StudentsMigration';
import Classes from './pages/Classes';
import SyncCenter from './pages/SyncCenter';
import Finances from './pages/Finances';
import Pedagogie from './pages/Pedagogie';
import RecapNotes from './pages/RecapNotes';
import Personnel from './pages/Personnel';
import Archives from './pages/Archives';
import Bibliotheque from './pages/Bibliotheque';
import PriseEnMain from './pages/PriseEnMain';
import SuperAdminHome from './pages/superadmin/SuperAdminHome';
import Ecoles from './pages/superadmin/Ecoles';
import ComptesSuperAdmin from './pages/superadmin/ComptesSuperAdmin';
import LicencesSuperAdmin from './pages/superadmin/LicencesSuperAdmin';
import AppareilsSuperAdmin from './pages/superadmin/AppareilsSuperAdmin';
import StatsSuperAdmin from './pages/superadmin/StatsSuperAdmin';
import ExportSuperAdmin from './pages/superadmin/ExportSuperAdmin';
import LicenseGuard from './components/LicenseGuard';
import FirstConnectionGate from './components/FirstConnectionGate';
import { UpdateProvider } from './contexts/UpdateContext';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

// Route protégée : redirige vers /login si non connecté
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1921]">
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// Route avec vérification de rôle
const RoleProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: readonly string[] }) => {
  const { session, roles, rolesLoaded, authError, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1921]">
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  if (authError) return <AuthErrorScreen message={authError} />;

  // Attendre que les rôles soient chargés avant de bloquer l'accès
  if (!rolesLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
      </div>
    );
  }
  
  // C. Erreur ou rôle absent - refuser l'accès
  if (!roles || roles.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-center text-sm text-slate-500">Accès refusé - Rôle introuvable</p>
    </div>;
  }
  
  const hasAccess = hasAnyRole(normalizeRoles(roles), allowedRoles);
  
  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-xl border border-slate-200 shadow-sm max-w-md">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Accès refusé</h2>
          <p className="text-slate-500 mb-6">Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
          <a href="/" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            Retour au tableau de bord
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// Route publique : redirige vers / si déjà connecté
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1921]">
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
};

// Accueil : le SUPER_ADMIN est redirigé vers son espace dédié
// mais si on a forcé un changement d'établissement (via super-admin),
// on reste sur l'espace direction de l'établissement ouvert.
const HomeRoute = () => {
  const { roles, rolesLoaded, inSchoolMode } = useAuth();
  if (inSchoolMode) {
    return <Dashboard />;
  }
  if (rolesLoaded && roles.includes('SUPER_ADMIN')) return <Navigate to="/super-admin" replace />;
  return <Dashboard />;
};

// Public : au tout 1er lancement on exige une connexion en ligne (activation),
// ensuite l'application utilise la connexion locale par défaut, avec possibilité
// de basculer sur la connexion en ligne Supabase à tout moment.
const LoginEntry = () => {
  const { licenseActivated, onlineConfigured } = useAuth();
  const [showOnline, setShowOnline] = useState(false);

  // Tant que la licence n'est pas activée, la connexion Supabase en ligne est
  // obligatoire : seule elle peut appeler l'Edge Function d'activation.
  if (resolveLoginMode({ licenseActivated, wantsOnline: showOnline }) === 'online') {
    return (
      <LoginOnline
        isActivation={!licenseActivated || !onlineConfigured}
        onSwitchToLocal={licenseActivated ? () => setShowOnline(false) : undefined}
      />
    );
  }

  return <Login onSwitchToOnline={() => setShowOnline(true)} />;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Routes publiques */}
      <Route path="/login" element={<PublicRoute><LoginEntry /></PublicRoute>} />
      <Route path="/setup" element={<PublicRoute><Setup /></PublicRoute>} />

      {/* Routes protégées avec layout + sidebar */}
      <Route
        element={
          <ProtectedRoute>
            <FirstConnectionGate>
              <LicenseGuard>
                <Layout />
              </LicenseGuard>
            </FirstConnectionGate>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomeRoute />} />
        
        {/* Espace SUPER_ADMIN — école de base + licences (cloud) */}
        <Route path="/super-admin" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/super-admin']}><SuperAdminHome /></RoleProtectedRoute>} />
        <Route path="/super-admin/ecoles" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/super-admin']}><Ecoles /></RoleProtectedRoute>} />
        <Route path="/super-admin/comptes" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/super-admin']}><ComptesSuperAdmin /></RoleProtectedRoute>} />
        <Route path="/super-admin/licences" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/super-admin']}><LicencesSuperAdmin /></RoleProtectedRoute>} />
        <Route path="/super-admin/appareils" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/super-admin']}><AppareilsSuperAdmin /></RoleProtectedRoute>} />
        <Route path="/super-admin/stats" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/super-admin']}><StatsSuperAdmin /></RoleProtectedRoute>} />
        <Route path="/super-admin/export" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/super-admin']}><ExportSuperAdmin /></RoleProtectedRoute>} />
        
        {/* Administration de l'établissement */}
        <Route path="/students" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/students']}><StudentsMigration /></RoleProtectedRoute>} />
        <Route path="/classes" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/classes']}><Classes /></RoleProtectedRoute>} />
        <Route path="/prise-en-main" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/prise-en-main']}><PriseEnMain /></RoleProtectedRoute>} />
        
        <Route path="/finances" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/finances']}><Finances /></RoleProtectedRoute>} />
        <Route path="/personnel" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/personnel']}><Personnel /></RoleProtectedRoute>} />
        <Route path="/security" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/security']}><Security /></RoleProtectedRoute>} />
        <Route path="/settings" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/settings']}><Settings /></RoleProtectedRoute>} />
        <Route path="/vie-scolaire" element={<Navigate to="/bibliotheque" replace />} />
        <Route path="/bibliotheque" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/bibliotheque']}><Bibliotheque /></RoleProtectedRoute>} />
        <Route path="/archives" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/archives']}><Archives /></RoleProtectedRoute>} />
        <Route path="/sync" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/sync']}><SyncCenter /></RoleProtectedRoute>} />
        
        {/* Pédagogie : DIRECTION et PROFESSEUR ont accès au récap, pas la Secrétaire */}
        <Route path="/pedagogie" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/pedagogie']}><Pedagogie /></RoleProtectedRoute>} />
        <Route path="/recap-notes" element={<RoleProtectedRoute allowedRoles={ROUTE_ROLES['/recap-notes']}><RecapNotes /></RoleProtectedRoute>} />
        <Route path="/account" element={<Account />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <YearProvider>
          <BrowserRouter>
            <UpdateProvider>
              <AppRoutes />
            </UpdateProvider>
          </BrowserRouter>
        </YearProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
