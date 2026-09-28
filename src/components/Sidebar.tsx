import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, Shield, Key, Monitor, FileText, LogOut, Wifi, WifiOff
} from 'lucide-react';
import { useEffect, useState } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/profils', icon: Users, label: 'Profils & Rôles' },
  { to: '/appareils', icon: Monitor, label: 'Appareils' },
  { to: '/licences', icon: Key, label: 'Licence' },
  { to: '/audit', icon: FileText, label: 'Journal d\'audit' },
];

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white px-2.5 py-1 rounded-lg font-bold text-lg">O</div>
          <div>
            <p className="font-bold text-base leading-none">Orion</p>
            <p className="text-xs text-slate-400 mt-0.5">Gestion scolaire</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-700 space-y-3">
        {/* État réseau */}
        <div className={`flex items-center gap-2 text-xs px-2 py-1 rounded-full w-fit ${isOnline ? 'bg-green-900 text-green-300' : 'bg-orange-900 text-orange-300'}`}>
          {isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
          {isOnline ? 'En ligne' : 'Hors ligne'}
        </div>

        {/* Utilisateur */}
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
            {user?.email?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-300 truncate">{user?.email}</p>
            <p className="text-xs text-slate-500">Direction</p>
          </div>
        </div>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 hover:bg-slate-800 px-3 py-2 rounded-lg transition-colors"
        >
          <LogOut size={15} /> Déconnexion
        </button>
      </div>
    </aside>
  );
}
