import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  PieChart, Wallet, Calendar, ArrowDownUp, BarChart2,
  Settings, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { useState } from 'react';

// Remplacement des icônes pour coller exactement au style "piqowallet" 
// tout en gardant vos routes.
const manageItems = [
  { to: '/', icon: PieChart, label: 'Tableau de bord' },
  { to: '/profils', icon: Wallet, label: 'Profils & Rôles' },
  { to: '/appareils', icon: Calendar, label: 'Appareils' },
  { to: '/licences', icon: ArrowDownUp, label: 'Licence' },
];

const settingsItems = [
  { to: '/audit', icon: Settings, label: "Journal d'audit" },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const displayName = user?.email?.split('@')[0] ?? 'Direction';
  const email = user?.email ?? 'direction@orion.com';

  return (
    <aside
      className="flex flex-col transition-all duration-300 ease-in-out m-4 rounded-3xl relative overflow-hidden"
      style={{
        width: collapsed ? '90px' : '280px',
        backgroundColor: '#2b2a33', // Couleur gris sombre unie caractéristique
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* MacOS Window Controls & Collapse Button */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
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
      <div className={`flex items-center gap-3 px-6 py-6 ${collapsed ? 'justify-center px-0' : ''}`}>
        <div className="w-8 h-8 rounded-full bg-[#3b82f6] flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
          O
        </div>
        {!collapsed && (
          <span className="text-xl text-slate-200 font-medium tracking-wide">
            orion<span className="font-light">erp</span>
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden flex flex-col gap-8">
        
        {/* MANAGE Section */}
        <div>
          <p 
            className={`text-[10px] font-bold text-slate-500 tracking-[0.2em] mb-4 ${collapsed ? 'text-center' : 'px-8'}`}
          >
            MANAGE
          </p>
          <div className="flex flex-col gap-1 relative">
            {manageItems.map((item) => (
              <NavItem key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        </div>

        {/* SETTINGS Section */}
        <div>
          <p 
            className={`text-[10px] font-bold text-slate-500 tracking-[0.2em] mb-4 ${collapsed ? 'text-center' : 'px-8'}`}
          >
            SETTINGS
          </p>
          <div className="flex flex-col gap-1 relative">
            {settingsItems.map((item) => (
              <NavItem key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        </div>

      </nav>

      {/* User Profile */}
      <div className={`mt-auto px-6 py-8 flex items-center gap-4 ${collapsed ? 'justify-center px-0' : ''}`}>
        <div className="w-10 h-10 rounded-full bg-slate-600 flex-shrink-0 overflow-hidden border border-slate-500">
          <img 
            src={`https://api.dicebear.com/7.x/notionists/svg?seed=${displayName}&backgroundColor=e2e8f0`} 
            alt="avatar" 
            className="w-full h-full object-cover"
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate capitalize">{displayName}</p>
            <p className="text-[11px] text-slate-500 truncate">{email}</p>
          </div>
        )}
      </div>
    </aside>
  );
}

// Sous-composant pour un élément de navigation
function NavItem({ item, collapsed }: { item: any; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `relative flex items-center gap-4 py-3 ${collapsed ? 'justify-center px-0' : 'px-8'} transition-all duration-200 group`
      }
    >
      {({ isActive }) => (
        <>
          {/* L'indicateur blanc sur le bord gauche */}
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white rounded-r-full" />
          )}
          
          <item.icon 
            size={18} 
            strokeWidth={isActive ? 2.5 : 2}
            className={`flex-shrink-0 ${isActive ? 'text-slate-100' : 'text-slate-500 group-hover:text-slate-300'}`} 
          />
          
          {!collapsed && (
            <span className={`text-sm truncate ${isActive ? 'text-slate-100 font-medium' : 'text-slate-500 group-hover:text-slate-300'}`}>
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
