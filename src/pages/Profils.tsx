import { Users, ShieldCheck } from 'lucide-react';

const roles = [
  { id: 'role_dir', name: 'DIRECTION', description: 'Accès complet à l\'établissement', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'role_sec', name: 'SECRETAIRE', description: 'Gestion administrative', color: 'bg-blue-100 text-blue-700' },
  { id: 'role_prof', name: 'PROFESSEUR', description: 'Gestion pédagogique', color: 'bg-green-100 text-green-700' },
  { id: 'role_admin', name: 'SUPER_ADMIN', description: 'Administration système globale', color: 'bg-red-100 text-red-700' },
];

export default function Profils() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Profils & Rôles</h2>
        <p className="text-slate-400 text-sm mt-1">Gestion des utilisateurs et de leurs permissions</p>
      </div>

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
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${role.color}`}>{role.name}</span>
                  <p className="text-sm text-slate-500 mt-2">{role.description}</p>
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
