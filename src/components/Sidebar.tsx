import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  PieChart,
  Settings, PanelLeftClose, PanelLeftOpen, Users, GraduationCap, RefreshCw, Coins, BookOpen, UserCog, Archive, Shield, ClipboardList,
  LayoutDashboard, Building2, KeyRound, MonitorSmartphone, WifiOff, ShieldCheck, BarChart2, FileSpreadsheet, Rocket,
  Sparkles, School
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNetwork } from '../hooks/useNetwork';
import { useUpdater } from '../contexts/UpdateContext';
import YearSelector from './YearSelector';
import orionLogo from '../assets/orion_logo.png';
import { listSchools, listLicenses, listDevices } from '../lib/superAdminApi';

// Remplacement des icônes pour coller exactement au style "piqowallet" 
// tout en gardant vos routes.
const manageItems = [
  { to: '/', icon: PieChart, label: 'Tableau de bord', roles: [] }, // Tous
  { to: '/students', icon: Users, label: 'Élèves & Inscriptions', roles: ['DIRECTION', 'SECRETAIRE'] },
  { to: '/classes', icon: GraduationCap, label: 'Gestion des classes', roles: ['DIRECTION', 'SECRETAIRE'] },
  { to: '/finances', icon: Coins, label: 'Finances & Paiements', roles: ['DIRECTION'] },
  { to: '/personnel', icon: UserCog, label: 'Personnel', roles: ['DIRECTION'] },
  { to: '/vie-scolaire', icon: School, label: 'Gestion Bibliothèque', roles: ['DIRECTION', 'SECRETAIRE'] },
  { to: '/pedagogie', icon: BookOpen, label: 'Pédagogie & Examens', roles: ['DIRECTION', 'SECRETAIRE', 'PROFESSEUR'] },
  { to: '/prise-en-main', icon: Rocket, label: 'Prise en main', roles: ['DIRECTION'] },
  { to: '/archives', icon: Archive, label: 'Gestion Archives', roles: ['DIRECTION'] },
  { to: '/recap-notes', icon: ClipboardList, label: 'Récap des notes', roles: ['PROFESSEUR'] },
];

const settingsItems = [
  { to: '/sync', icon: RefreshCw, label: 'Synchronisation', roles: ['DIRECTION'] },
  { to: '/security', icon: Shield, label: 'Sécurité', roles: ['DIRECTION'] },
  { to: '/settings', icon: Settings, label: "Paramètres", roles: ['DIRECTION'] },
];

// Menu dédié au SUPER_ADMIN : école de base + licences (gérés dans le cloud).
const superAdminItems = [
  { to: '/super-admin',          icon: LayoutDashboard,    label: 'Vue globale',        roles: ['SUPER_ADMIN'], end: true },
  { to: '/super-admin/ecoles',   icon: Building2,          label: 'Établissements',     roles: ['SUPER_ADMIN'] },
  { to: '/super-admin/comptes',  icon: KeyRound,           label: 'Identifiants & Accès', roles: ['SUPER_ADMIN'] },
  { to: '/super-admin/licences', icon: Shield,             label: 'Licences',           roles: ['SUPER_ADMIN'] },
  { to: '/super-admin/appareils',icon: MonitorSmartphone,  label: 'Appareils',          roles: ['SUPER_ADMIN'] },
  { to: '/super-admin/stats',    icon: BarChart2,          label: 'Statistiques',       roles: ['SUPER_ADMIN'] },
  { to: '/super-admin/export',   icon: FileSpreadsheet,    label: 'Export Excel',       roles: ['SUPER_ADMIN'] },
];

export default function Sidebar() {
  const { user, roles, rolesLoaded, inSchoolMode, forcedSchoolName, exitSchoolMode, schoolId } = useAuth();
  const { status, currentVersion, openModal, checkForUpdates } = useUpdater();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1180);
  const [schoolName, setSchoolName] = useState('');

  // Auto-collapse sur petits écrans lors du redimensionnement de la fenêtre
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1080) {
        setCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // En mode « direction » (visite d'un établissement depuis le SUPER_ADMIN),
    // on affiche le nom de l'établissement visité.
    if (inSchoolMode && forcedSchoolName) {
      setSchoolName(forcedSchoolName);
      return;
    }
    let cancelled = false;
    invoke<any>('get_school_settings', { schoolId })
      .then(s => { if (!cancelled && s?.name) setSchoolName(s.name); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [inSchoolMode, forcedSchoolName, schoolId]);

  const handleExitSchoolMode = () => {
    exitSchoolMode();
    navigate('/super-admin/ecoles', { replace: true });
  };

  const displayName = user?.email?.split('@')[0] ?? 'Direction';
  const email = user?.email ?? 'direction@orion.com';

  const hasAccess = (itemRoles: string[]) => {
    // Items sans restriction de rôle → toujours visibles
    if (itemRoles.length === 0) return true;
    // Tant que les rôles ne sont pas chargés, on masque les items restreints
    // (évite le flash de "Récap des notes" visible par la DIRECTION au chargement)
    if (!rolesLoaded) return false;
    return roles.some(r => itemRoles.includes(r) || r === 'SUPER_ADMIN');
  };

  // Le SUPER_ADMIN dispose d'un espace dédié (écoles + licences, gérés dans le cloud).
  // Sauf lorsqu'il visite l'espace d'un établissement : là, il voit l'interface
  // exactement comme la direction de cet établissement.
  const isSuperAdmin = rolesLoaded && roles.includes('SUPER_ADMIN') && !inSchoolMode;

  // Préchargement passif du cache en tâche de fond pour une réactivité instantanée à chaque clic
  useEffect(() => {
    if (isSuperAdmin) {
      listSchools().catch(() => {});
      listLicenses().catch(() => {});
      listDevices().catch(() => {});
    }
  }, [isSuperAdmin]);

  const visibleManageItems = manageItems.filter(item => hasAccess(item.roles));
  const visibleSettingsItems = settingsItems.filter(item => hasAccess(item.roles));
  const mainItems = isSuperAdmin ? superAdminItems : visibleManageItems;
  const sectionLabel = isSuperAdmin ? 'SUPER ADMIN' : 'GESTION SCOLAIRE';

  return (
    <aside
      className="app-sidebar flex flex-col transition-all duration-300 ease-in-out m-1.5 sm:m-2.5 lg:m-4 mr-0 rounded-2xl sm:rounded-3xl relative overflow-hidden shrink-0"
      style={{
        width: collapsed ? '80px' : '260px',
        backgroundColor: '#2b2a33',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* MacOS Window Controls & Collapse Button */}
      <div className="flex items-center justify-end px-[var(--sb-gutter)] pt-[var(--sb-v)] pb-[var(--sb-v-sm)]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-6 h-6 border border-[#44434c] rounded-md flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-[#383742] transition-colors"
          title={collapsed ? "Agrandir le menu" : "Réduire le menu"}
        >
          {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
        </button>
      </div>

      {/* Logo */}
      <div className="px-[var(--sb-gutter)] pt-[var(--sb-v)] pb-[var(--sb-v)]">
        <div className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-[var(--sb-v)] py-[var(--sb-v-sm)] ${collapsed ? 'justify-center px-2' : ''}`}>
          <img
            src={orionLogo}
            alt="Orion"
            className="h-[var(--sb-logo)] w-[var(--sb-logo)] flex-shrink-0 object-contain"
          />
          {!collapsed && (
            <span className="text-[length:var(--sb-logo-text)] text-slate-200 font-medium tracking-wide">
              Orion <span className="font-light italic">Exp</span>
            </span>
          )}
        </div>
      </div>

      {/* Nom de l'établissement — sous le logo (masqué pour le SUPER_ADMIN) */}
      {!isSuperAdmin && (
        <div className={`px-[var(--sb-gutter)] pt-[var(--sb-v)] pb-[var(--sb-v)] ${collapsed ? 'flex justify-center px-0' : ''}`}>
          {collapsed ? (
            <span
              className="flex h-[var(--sb-logo)] w-[var(--sb-logo)] items-center justify-center rounded-xl bg-white/5 text-[length:var(--sb-item-font)] font-bold text-slate-300"
              title={schoolName || "Nom de l'établissement"}
            >
              {(schoolName || 'E').charAt(0).toUpperCase()}
            </span>
          ) : (
            <div className="min-w-0">
              <p className="text-[length:var(--sb-label-font)] font-bold uppercase tracking-[0.2em] text-slate-500">Établissement</p>
              <p className="mt-0.5 truncate text-[length:var(--sb-item-font)] font-semibold text-slate-100" title={schoolName || "Nom de l'établissement"}>
                {schoolName || "Nom de l'établissement"}
              </p>
            </div>
          )}
        </div>
      )}

      {!isSuperAdmin && <YearSelector collapsed={collapsed} />}

      {/* Mode visite d'un établissement : retour possible à l'espace super admin */}
      {inSchoolMode && (
        <div className={`pt-[var(--sb-v-sm)] pb-[var(--sb-v-sm)] ${collapsed ? 'px-2' : 'px-[var(--sb-gutter)]'}`}>
          <button
            onClick={handleExitSchoolMode}
            title="Quitter l'espace de l'établissement et revenir à l'espace super administrateur"
            className={`w-full flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 py-[var(--sb-v-sm)] text-[length:var(--sb-label-font)] font-semibold text-amber-300 hover:bg-amber-400/20 transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'}`}
          >
            <ShieldCheck size={14} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">Retour espace super admin</span>}
          </button>
        </div>
      )}

      {/* Séparation entre le bloc logo et le menu (espace libéré par
          l'établissement/année masqués en mode SUPER_ADMIN) */}
      {isSuperAdmin && (
        <div className="mx-[var(--sb-gutter)] mt-[var(--sb-v)] mb-[var(--sb-v-sm)] border-t border-white/10" />
      )}

      {/* Navigation */}
      <nav className={`flex-1 min-h-0 py-[var(--sb-v-sm)] overflow-hidden flex flex-col gap-[var(--sb-v)] ${isSuperAdmin ? 'mt-[var(--sb-v)]' : ''}`}>

        {/* MANAGE Section */}
        <div className="mb-[var(--sb-v)]">
          <p className={`mt-[var(--sb-v)] text-[length:var(--sb-label-font)] font-bold text-slate-500 tracking-[0.2em] mb-[var(--sb-v)] ${collapsed ? 'text-center' : 'px-[var(--sb-nav-px)]'}`}>
            {sectionLabel}
          </p>
          <div className="flex flex-col gap-[var(--sb-nav-gap)] relative">
            {mainItems.map((item) => (
              <NavItem key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        </div>

        {/* SETTINGS Section — masquée pour le super administrateur */}
        {!isSuperAdmin && visibleSettingsItems.length > 0 && (
          <div className="mt-[var(--sb-v)]">
            <p className={`text-[length:var(--sb-label-font)] font-bold text-slate-500 tracking-[0.2em] mb-[var(--sb-v)] ${collapsed ? 'text-center' : 'px-[var(--sb-nav-px)]'}`}>
              ADMINISTRATION
            </p>
            <div className="flex flex-col gap-[var(--sb-nav-gap)] relative">
              {visibleSettingsItems.map((item) => (
                <NavItem key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        )}

      </nav>

      {/* Tag de version au pied du menu — stable sans déformation de la sidebar */}
      <div className={`sb-version py-[var(--sb-v-sm)] ${collapsed ? 'flex justify-center px-0' : 'px-[var(--sb-gutter)]'}`}>
        <button
          onClick={() => {
            openModal();
            if (status === 'idle' || status === 'up-to-date') {
              checkForUpdates(false);
            }
          }}
          className={`flex items-center gap-2 text-[length:var(--sb-label-font)] font-mono text-slate-400 hover:text-slate-200 transition-colors py-[var(--sb-v-sm)] cursor-pointer ${
            collapsed ? 'justify-center' : ''
          }`}
          title="Vérifier les mises à jour logicielles"
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              status === 'available' || status === 'downloaded'
                ? 'bg-blue-400 animate-pulse'
                : status === 'checking'
                ? 'bg-amber-400 animate-spin'
                : 'bg-emerald-500'
            }`}
          />
          {!collapsed && (
            <span className="flex items-center gap-1.5">
              <span>Orion v{currentVersion}</span>
              {(status === 'available' || status === 'downloaded') && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-blue-500/25 text-blue-300 border border-blue-500/40">
                  Màj dispo
                </span>
              )}
            </span>
          )}
        </button>
      </div>

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
  const { status, currentVersion, openModal, checkForUpdates } = useUpdater();
  const [open, setOpen] = useState(false);

  const isOnline = useNetwork();
  // Session locale (compte « Admin » local) ≠ absence de réseau
  const isLocalSession = session?.access_token === 'offline';
  const isOffline = isLocalSession && !isOnline;

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

              {/* Badge session locale / hors-ligne */}
              {isLocalSession && (
                <div className="mt-3 flex items-center gap-2.5 px-1">
                  <span
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                    style={
                      isOffline
                        ? { background: 'rgba(251,191,36,0.16)', color: '#fbbf24' }
                        : { background: 'rgba(148,163,184,0.16)', color: '#94a3b8' }
                    }
                  >
                    {isOffline ? <WifiOff size={13} /> : <ShieldCheck size={13} />}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-[11px] font-semibold leading-tight"
                      style={{ color: isOffline ? '#fbbf24' : '#cbd5e1' }}
                    >
                      {isOffline ? 'Mode hors-ligne' : 'Session locale'}
                    </p>
                    <p className="text-[10px] leading-tight text-slate-500">
                      {isOffline ? 'Données enregistrées localement' : 'Connecté en ligne · compte local'}
                    </p>
                  </div>
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

              <button
                onClick={() => {
                  setOpen(false);
                  openModal();
                  if (status === 'idle' || status === 'up-to-date') {
                    checkForUpdates(false);
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <Sparkles size={15} className={status === 'available' ? 'text-blue-400' : ''} />
                  <span>Mises à jour</span>
                </div>
                {status === 'available' || status === 'downloaded' ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse">
                    Dispo
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono">v{currentVersion}</span>
                )}
              </button>

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
        className={`w-full flex items-center gap-[var(--sb-icon-gap)] px-[var(--sb-gutter)] py-[var(--sb-profile-py)] transition-all duration-150 group ${collapsed ? 'justify-center px-0' : ''}`}
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
          <div className="w-[var(--sb-avatar)] h-[var(--sb-avatar)] rounded-full bg-slate-600 overflow-hidden border border-slate-500">
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
              <p className="text-[length:var(--sb-item-font)] font-medium text-slate-200 truncate capitalize group-hover:text-slate-100 transition-colors">
                {displayName}
              </p>
              <p className="text-[length:var(--sb-label-font)] text-slate-500 truncate">{email}</p>
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
        `relative flex items-center gap-[var(--sb-icon-gap)] py-[var(--sb-item-py)] ${collapsed ? 'justify-center px-0' : 'px-[var(--sb-nav-px)]'} transition-all duration-200 group`
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
            <span className={`text-[length:var(--sb-item-font)] truncate flex-1 min-w-0 ${isActive ? 'text-slate-100 font-medium' : 'text-slate-500 group-hover:text-slate-300'}`}>
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
