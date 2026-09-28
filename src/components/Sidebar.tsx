import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, Key, Monitor, FileText,
  LogOut, Wifi, WifiOff, ChevronLeft, ChevronRight,
  Settings, Bell
} from 'lucide-react';
import { useEffect, useState } from 'react';

const manageItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/profils', icon: Users, label: 'Profils & Rôles' },
  { to: '/appareils', icon: Monitor, label: 'Appareils' },
  { to: '/licences', icon: Key, label: 'Licence' },
];

const settingsItems = [
  { to: '/audit', icon: FileText, label: "Journal d'audit" },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? 'U';
  const displayName = user?.email?.split('@')[0] ?? 'Utilisateur';

  return (
    <aside
      className="relative flex flex-col min-h-screen transition-all duration-300"
      style={{
        width: collapsed ? '72px' : '240px',
        background: 'linear-gradient(160deg, #1e1e2e 0%, #16161f 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-50 flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:text-white transition-colors"
        style={{ background: '#2a2a3d', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5" style={{ minHeight: 64 }}>
        <div
          className="flex items-center justify-center rounded-xl font-bold text-white text-base flex-shrink-0"
          style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          O
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-bold text-white text-sm leading-none tracking-wide">Orion</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {isOnline ? (
                <span className="flex items-center gap-1 text-emerald-400"><Wifi size={9} /> En ligne</span>
              ) : (
                <span className="flex items-center gap-1 text-orange-400"><WifiOff size={9} /> Hors ligne</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-5 overflow-hidden">
        {/* Section MANAGE */}
        <div>
          {!collapsed && (
            <p className="text-xs font-semibold px-2 mb-2 tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
              GESTION
            </p>
          )}
          <div className="space-y-0.5">
            {manageItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm transition-all duration-150 group ${
                    isActive
                      ? 'text-white font-medium'
                      : 'text-slate-500 hover:text-slate-200'
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? { background: 'rgba(99,102,241,0.18)', boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.25)' }
                    : {}
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={17}
                      className="flex-shrink-0"
                      style={{ color: isActive ? '#818cf8' : undefined }}
                    />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Section SETTINGS */}
        <div>
          {!collapsed && (
            <p className="text-xs font-semibold px-2 mb-2 tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
              PARAMÈTRES
            </p>
          )}
          <div className="space-y-0.5">
            {settingsItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                    isActive
                      ? 'text-white font-medium'
                      : 'text-slate-500 hover:text-slate-200'
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? { background: 'rgba(99,102,241,0.18)', boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.25)' }
                    : {}
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={17}
                      className="flex-shrink-0"
                      style={{ color: isActive ? '#818cf8' : undefined }}
                    />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* User footer */}
      <div
        className="mx-3 mb-4 p-3 rounded-xl flex items-center gap-3 cursor-default"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Avatar */}
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold text-sm"
          style={{
            width: 34, height: 34,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          }}
        >
          {avatarLetter}
        </div>

        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate capitalize">{displayName}</p>
            <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{user?.email}</p>
          </div>
        )}

        {!collapsed && (
          <button
            onClick={signOut}
            title="Déconnexion"
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </aside>
  );
}
