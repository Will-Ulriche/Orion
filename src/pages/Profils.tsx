import { Users, ShieldCheck } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';

interface RoleRec {
  id: string;
  name: string;
  description: string | null;
}

const roleColors: Record<string, string> = {
  'DIRECTION': 'bg-indigo-100 text-indigo-700',
  'SECRETAIRE': 'bg-blue-100 text-blue-700',
  'PROFESSEUR': 'bg-green-100 text-green-700',
  'SUPER_ADMIN': 'bg-red-100 text-red-700',
};

export default function Profils() {
  const [roles, setRoles] = useState<RoleRec[]>([]);

  useEffect(() => {
    invoke<RoleRec[]>('get_roles').then(setRoles).catch(console.error);
  }, []);

  return (
    <div className="pt-2">
      {/* Rôles */}
      <section className="mb-8">
        <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <ShieldCheck size={18} className="text-indigo-500" /> Rôles système
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((role) => (
            <div key={role.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${roleColors[role.name] || 'bg-gray-100 text-gray-700'}`}>{role.name}</span>
                  <p className="text-sm text-slate-500 mt-2">{role.description || 'Aucune description'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Utilisateurs */}
      <section>
        <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Users size={18} className="text-indigo-500" /> Utilisateurs
        </h3>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 grid grid-cols-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <span>Email</span>
            <span>Rôle</span>
            <span>Établissement</span>
            <span>Statut</span>
          </div>
          <div className="px-6 py-8 text-center text-slate-400 text-sm">
            Les utilisateurs configurés apparaîtront ici.
            <br />
            <span className="text-xs text-slate-300">La gestion complète des profils sera disponible en Session 2.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
