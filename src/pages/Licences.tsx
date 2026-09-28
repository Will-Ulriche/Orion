import { Key, CheckCircle, Clock, XCircle, Ban } from 'lucide-react';

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  ACTIVE:    { label: 'Active',    color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  EXPIRED:   { label: 'Expirée',   color: 'bg-slate-100 text-slate-500',  icon: Clock },
  SUSPENDED: { label: 'Suspendue', color: 'bg-orange-100 text-orange-700', icon: XCircle },
  REVOKED:   { label: 'Révoquée',  color: 'bg-red-100 text-red-700',      icon: Ban },
};

export default function Licences() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Licence</h2>
        <p className="text-slate-400 text-sm mt-1">Gestion de la licence d'utilisation d'Orion</p>
      </div>

      {/* Statuts possibles */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {Object.entries(statusConfig).map(([key, { label, color, icon: Icon }]) => (
          <div key={key} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${color}`}>
            <Icon size={12} /> {label}
          </div>
        ))}
      </div>

      {/* Licence active */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-50 p-2.5 rounded-lg text-indigo-600"><Key size={22} /></div>
          <div>
            <h3 className="font-semibold text-slate-800">Licence d'établissement</h3>
            <p className="text-xs text-slate-400">Configuration lors du premier lancement</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: 'Clé de licence', value: '—' },
            { label: 'Statut', value: '—' },
            { label: 'Date de début', value: '—' },
            { label: 'Date d\'expiration', value: '—' },
            { label: 'Appareils max', value: '—' },
            { label: 'Appareils actifs', value: '1' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">{label}</p>
              <p className="font-semibold text-slate-700">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        La licence sera associée à votre établissement lors de l'activation initiale (Session 1 — Étape 10).
      </p>
    </div>
  );
}
