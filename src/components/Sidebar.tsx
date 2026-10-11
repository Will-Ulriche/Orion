import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  PieChart,
  Settings, PanelLeftClose, PanelLeftOpen, Users, GraduationCap, RefreshCw, Coins, BookOpen, UserCog, Archive, Shield, UserPlus, ClipboardList,
  LayoutDashboard, Building2, KeyRound, MonitorSmartphone
} from 'lucide-react';
import { useState } from 'react';
import YearSelector from './YearSelector';

// Remplacement des icônes pour coller exactement au style "piqowallet" 
// tout en gardant vos routes.
const manageItems = [
  { to: '/', icon: PieChart, label: 'Tableau de bord', roles: [] }, // Tous
  { to: '/archives', icon: Archive, label: 'Archives', roles: ['DIRECTION'] },
  { to: '/classes', icon: GraduationCap, label: 'Gestion des classes', roles: ['DIRECTION', 'SECRETAIRE'] },
  { to: '/students', icon: Users, label: 'Élèves & Inscriptions', roles: ['DIRECTION', 'SECRETAIRE'] },
  { to: '/finances', icon: Coins, label: 'Finances & Paiements', roles: ['DIRECTION'] },
  { to: '/pedagogie', icon: BookOpen, label: 'Pédagogie & Notes', roles: ['DIRECTION', 'SECRETAIRE', 'PROFESSEUR'] },
  { to: '/recap-notes', icon: ClipboardList, label: 'Récap des notes', roles: ['DIRECTION', 'SECRETAIRE', 'PROFESSEUR'] },
  { to: '/personnel', icon: UserCog, label: 'Personnel', roles: ['DIRECTION'] },
  { to: '/users', icon: UserPlus, label: 'Utilisateurs', roles: ['DIRECTION'] },
];

const settingsItems = [
  { to: '/sync', icon: RefreshCw, label: 'Synchronisation', roles: ['DIRECTION'] },
  { to: '/security', icon: Shield, label: 'Sécurité', roles: ['DIRECTION'] },
  { to: '/settings', icon: Settings, label: "Paramètres", roles: ['DIRECTION'] },
];

// Menu dédié au SUPER_ADMIN : école de base + licences (gérés dans le cloud).
const superAdminItems = [
  { to: '/super-admin', icon: LayoutDashboard, label: 'Vue globale', roles: ['SUPER_ADMIN'], end: true },
  { to: '/super-admin/ecoles', icon: Building2, label: 'Établissements', roles: ['SUPER_ADMIN'] },
  { to: '/super-admin/licences', icon: KeyRound, label: 'Licences', roles: ['SUPER_ADMIN'] },
  { to: '/super-admin/appareils', icon: MonitorSmartphone, label: 'Appareils', roles: ['SUPER_ADMIN'] },
];

export default function Sidebar() {
  const { user, roles, rolesLoaded } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const displayName = user?.email?.split('@')[0] ?? 'Direction';
  const email = user?.email ?? 'direction@orion.com';

  const hasAccess = (itemRoles: string[]) => {
    // Tant que les rôles ne sont pas chargés, on montre tout (évite flash de contenu vide)
    if (!rolesLoaded) return true;
    if (itemRoles.length === 0) return true;
    return roles.some(r => itemRoles.includes(r) || r === 'SUPER_ADMIN');
  };

  // Le SUPER_ADMIN dispose d'un espace dédié (écoles + licences, gérés dans le cloud)
  const isSuperAdmin = rolesLoaded && roles.includes('SUPER_ADMIN');

  const visibleManageItems = manageItems.filter(item => hasAccess(item.roles));
  const visibleSettingsItems = settingsItems.filter(item => hasAccess(item.roles));
  const mainItems = isSuperAdmin ? superAdminItems : visibleManageItems;
  const sectionLabel = isSuperAdmin ? 'SUPER ADMIN' : 'MANAGE';

  return (
    <aside
      className="flex flex-col transition-all duration-300 ease-in-out m-4 rounded-3xl relative overflow-hidden"
      style={{
        width: collapsed ? '90px' : '280px',
        backgroundColor: '#2b2a33',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* MacOS Window Controls & Collapse Button */}
      <div className="flex items-center justify-between px-6 pt-4 pb-1">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
          <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-6 h-6 border border-[#44434c] rounded-md flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-[#383742] transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
        </button>
      </div>

      {/* Logo */}
      <div className={`flex items-center gap-3 px-6 py-3 ${collapsed ? 'justify-center px-0' : ''}`}>
        <div className="w-8 h-8 rounded-full bg-[#3b82f6] flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
          O
        </div>
        {!collapsed && (
          <span className="text-xl text-slate-200 font-medium tracking-wide">
            orion<span className="font-light">erp</span>
          </span>
        )}
      </div>

      {!isSuperAdmin && <YearSelector collapsed={collapsed} />}

      {/* Navigation */}
      <nav className="flex-1 py-1 overflow-y-auto overflow-x-hidden flex flex-col gap-1">

        {/* MANAGE Section */}
        <div>
          <p className={`text-[10px] font-bold text-slate-500 tracking-[0.2em] mb-0.5 ${collapsed ? 'text-center' : 'px-8'}`}>
            {sectionLabel}
          </p>
          <div className="flex flex-col gap-1 relative">
            {mainItems.map((item) => (
              <NavItem key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        </div>

        {/* SETTINGS Section — masquée pour le super administrateur */}
        {!isSuperAdmin && visibleSettingsItems.length > 0 && (
          <div>
            <p className={`text-[10px] font-bold text-slate-500 tracking-[0.2em] mb-0.5 ${collapsed ? 'text-center' : 'px-8'}`}>
              SETTINGS
            </p>
            <div className="flex flex-col gap-1 relative">
              {visibleSettingsItems.map((item) => (
                <NavItem key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        )}

      </nav>

      {/* User Profile — cliquable avec menu popup */}
      <UserProfileMenu collapsed={collapsed} displayName={displayName} email={email} />
    </aside>
  );
}

// ─── User Profile Menu ────────────────────────────────────────────────────────
function UserProfileMenu({
  collapsed,
  displayName,
  email,
}: {
  collapsed: boolean;
  displayName: string;
  email: string;
}) {
  const { signOut, session } = useAuth();
  const [open, setOpen] = useState(false);

  const isOffline = session?.access_token === 'offline';

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  return (
    <div className="relative">
      {/* Popup menu — affiché au-dessus du bouton profil */}
      {open && (
        <>
          {/* Overlay invisible pour fermer au clic extérieur */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Menu card */}
          <div
            className="absolute bottom-full left-3 right-3 mb-2 z-50 rounded-2xl overflow-hidden"
            style={{
              backgroundColor: '#1e1d27',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
              animation: 'slideUpFade 0.18s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {/* User info header */}
            <div className="px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-600 flex-shrink-0 overflow-hidden border border-slate-500">
                  <img
                    src={session?.user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/notionists/svg?seed=${displayName}&backgroundColor=e2e8f0`}
                    alt="avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate capitalize">{displayName}</p>
                  <p className="text-[11px] text-slate-500 truncate">{email}</p>
                </div>
              </div>

              {/* Badge offline */}
              {isOffline && (
                <div
                  className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium w-fit"
                  style={{
                    background: 'rgba(251,191,36,0.12)',
                    border: '1px solid rgba(251,191,36,0.25)',
                    color: '#fbbf24',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  Mode hors-ligne
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-1.5">
              <NavLink
                to="/account"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
              >
                <UserCog size={15} />
                Mon compte
              </NavLink>

              <NavLink
                to="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors mt-1"
              >
                <Settings size={15} />
                Paramètres de l'établissement
              </NavLink>

              <div className="h-px bg-white/5 my-1" />

              {/* Déconnexion */}
              <button
                id="sidebar-signout-btn"
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150"
                style={{ color: '#f87171' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.1)';
                  (e.currentTarget as HTMLElement).style.color = '#fca5a5';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = '#f87171';
                }}
              >
                <svg
                  width="15" height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Se déconnecter
              </button>
            </div>
          </div>
        </>
      )}

      {/* Bouton profil cliquable */}
      <button
        id="sidebar-profile-btn"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-4 px-6 py-4 transition-all duration-150 group ${collapsed ? 'justify-center px-0' : ''}`}
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          backgroundColor: open ? 'rgba(255,255,255,0.05)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.03)';
        }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }}
        title={collapsed ? `${displayName} — Options` : undefined}
      >
        {/* Avatar avec indicateur de statut */}
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-slate-600 overflow-hidden border border-slate-500">
            <img
              src={session?.user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/notionists/svg?seed=${displayName}&backgroundColor=e2e8f0`}
              alt="avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <span
            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#2b2a33]"
            style={{ backgroundColor: isOffline ? '#f59e0b' : '#22c55e' }}
          />
        </div>

        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium text-slate-200 truncate capitalize group-hover:text-slate-100 transition-colors">
                {displayName}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{email}</p>
            </div>

            {/* Chevron animé */}
            <svg
              width="14" height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="flex-shrink-0 text-slate-600 group-hover:text-slate-400 transition-all duration-200"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </>
        )}
      </button>

      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Nav Item ─────────────────────────────────────────────────────────────────
function NavItem({ item, collapsed }: { item: any; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? item.to === '/'}
      className={() =>
        `relative flex items-center gap-4 py-0.5 ${collapsed ? 'justify-center px-0' : 'px-8'} transition-all duration-200 group`
      }
    >
      {({ isActive }) => (
        <>
          {/* Indicateur actif */}
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white rounded-r-full" />
          )}

          <item.icon
            size={18}
            strokeWidth={isActive ? 2.5 : 2}
            className={`flex-shrink-0 ${isActive ? 'text-slate-100' : 'text-slate-500 group-hover:text-slate-300'}`}
          />

          {!collapsed && (
            <span className={`text-sm truncate flex-1 min-w-0 ${isActive ? 'text-slate-100 font-medium' : 'text-slate-500 group-hover:text-slate-300'}`}>
              {item.label}
            </span>
          )}

          {/* Badge */}
          {!collapsed && item.badge && (
            <div className="ml-auto bg-[#3b82f6] text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
              {item.badge}
            </div>
          )}
        </>
      )}
    </NavLink>
  );
}
