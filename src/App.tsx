import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Profils from './pages/Profils';
import Appareils from './pages/Appareils';
import Licences from './pages/Licences';
import Audit from './pages/Audit';
import './App.css';

// Route protégée : redirige vers /login si non connecté
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" />;
  return <>{children}</>;
};

// Route publique : redirige vers / si déjà connecté
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { session } = useAuth();
  if (session) return <Navigate to="/" />;
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Routes publiques */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/setup" element={<PublicRoute><Setup /></PublicRoute>} />

      {/* Routes protégées avec layout + sidebar */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/profils" element={<Profils />} />
        <Route path="/appareils" element={<Appareils />} />
        <Route path="/licences" element={<Licences />} />
        <Route path="/audit" element={<Audit />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
