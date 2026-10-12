import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
import UsersPage from './pages/UsersPage';
import SuperAdminHome from './pages/superadmin/SuperAdminHome';
import Ecoles from './pages/superadmin/Ecoles';
import ComptesSuperAdmin from './pages/superadmin/ComptesSuperAdmin';
import LicencesSuperAdmin from './pages/superadmin/LicencesSuperAdmin';
import AppareilsSuperAdmin from './pages/superadmin/AppareilsSuperAdmin';
import StatsSuperAdmin from './pages/superadmin/StatsSuperAdmin';
import LicenseGuard from './components/LicenseGuard';
import './App.css';

// Route protégée : redirige vers /login si non connecté
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" />;
  return <>{children}</>;
};

// Route avec vérification de rôle
const RoleProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) => {
  const { session, roles, rolesLoaded } = useAuth();
  
  if (!session) return <Navigate to="/login" />;
  
  // Attendre que les rôles soient chargés avant de bloquer l'accès
  if (!rolesLoaded) return <>{children}</>;
  
  const hasAccess = roles.some(role => allowedRoles.includes(role) || role === 'SUPER_ADMIN');
  
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
  const { session } = useAuth();
  if (session) return <Navigate to="/" />;
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
// ensuite l'application utilise la connexion locale par PIN.
const LoginEntry = () => {
  const { activated } = useAuth();
  return activated ? <Login /> : <LoginOnline isActivation />;
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
            <LicenseGuard>
              <Layout />
            </LicenseGuard>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomeRoute />} />
        
        {/* Espace SUPER_ADMIN — école de base + licences (cloud) */}
        <Route path="/super-admin" element={<RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}><SuperAdminHome /></RoleProtectedRoute>} />
        <Route path="/super-admin/ecoles" element={<RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}><Ecoles /></RoleProtectedRoute>} />
        <Route path="/super-admin/comptes" element={<RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}><ComptesSuperAdmin /></RoleProtectedRoute>} />
        <Route path="/super-admin/licences" element={<RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}><LicencesSuperAdmin /></RoleProtectedRoute>} />
        <Route path="/super-admin/appareils" element={<RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}><AppareilsSuperAdmin /></RoleProtectedRoute>} />
        <Route path="/super-admin/stats" element={<RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}><StatsSuperAdmin /></RoleProtectedRoute>} />
        
        {/* Réservé à DIRECTION, SECRETAIRE, SUPER_ADMIN */}
        <Route path="/students" element={<RoleProtectedRoute allowedRoles={['DIRECTION', 'SECRETAIRE']}><StudentsMigration /></RoleProtectedRoute>} />
        <Route path="/classes" element={<RoleProtectedRoute allowedRoles={['DIRECTION', 'SECRETAIRE']}><Classes /></RoleProtectedRoute>} />
        
        {/* Réservé à DIRECTION, SUPER_ADMIN */}
        <Route path="/finances" element={<RoleProtectedRoute allowedRoles={['DIRECTION']}><Finances /></RoleProtectedRoute>} />
        <Route path="/personnel" element={<RoleProtectedRoute allowedRoles={['DIRECTION']}><Personnel /></RoleProtectedRoute>} />
        <Route path="/users" element={<RoleProtectedRoute allowedRoles={['DIRECTION']}><UsersPage /></RoleProtectedRoute>} />
        <Route path="/security" element={<RoleProtectedRoute allowedRoles={['DIRECTION']}><Security /></RoleProtectedRoute>} />
        <Route path="/settings" element={<RoleProtectedRoute allowedRoles={['DIRECTION']}><Settings /></RoleProtectedRoute>} />
        <Route path="/archives" element={<RoleProtectedRoute allowedRoles={['DIRECTION']}><Archives /></RoleProtectedRoute>} />
        <Route path="/sync" element={<RoleProtectedRoute allowedRoles={['DIRECTION']}><SyncCenter /></RoleProtectedRoute>} />
        
        {/* Accès commun à tous (avec restrictions internes gérées dans la page si besoin) */}
        <Route path="/pedagogie" element={<RoleProtectedRoute allowedRoles={['DIRECTION', 'SECRETAIRE', 'PROFESSEUR']}><Pedagogie /></RoleProtectedRoute>} />
        <Route path="/recap-notes" element={<RoleProtectedRoute allowedRoles={['PROFESSEUR']}><RecapNotes /></RoleProtectedRoute>} />
        <Route path="/account" element={<Account />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <YearProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </YearProvider>
    </AuthProvider>
  );
}

export default App;
