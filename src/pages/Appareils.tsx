import { Monitor, ShieldCheck, ShieldOff, ShieldX } from 'lucide-react';

const statusConfig: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  ACTIVE:  { label: 'Actif',   color: 'bg-green-100 text-green-700',  icon: ShieldCheck },
  BLOCKED: { label: 'Bloqué',  color: 'bg-orange-100 text-orange-700', icon: ShieldOff },
  REVOKED: { label: 'Révoqué', color: 'bg-red-100 text-red-700',       icon: ShieldX },
};

export default function Appareils() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Appareils</h2>
        <p className="text-slate-400 text-sm mt-1">Gestion des postes autorisés à accéder à Orion</p>
      </div>

      {/* Légende des statuts */}
      <div className="flex gap-3 mb-6">
        {Object.entries(statusConfig).map(([key, { label, color, icon: Icon }]) => (
          <div key={key} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${color}`}>
            <Icon size={12} /> {label}
          </div>
        ))}
      </div>

      {/* Règle importante */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <strong>Règle de sécurité :</strong> Un appareil dont le statut est <code className="font-mono bg-amber-100 px-1 rounded">BLOCKED</code> ou <code className="font-mono bg-amber-100 px-1 rounded">REVOKED</code> sera rejeté à la connexion, même avec des identifiants valides. Les données locales ne sont jamais supprimées automatiquement.
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 grid grid-cols-5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <span className="col-span-2">Appareil</span>
          <span>Plateforme</span>
          <span>Dernière activité</span>
          <span>Statut</span>
        </div>
        <div className="divide-y divide-slate-50">
          {/* Cet appareil courant (affiché dynamiquement) */}
          <div className="px-6 py-4 grid grid-cols-5 items-center text-sm">
            <div className="col-span-2 flex items-center gap-3">
              <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><Monitor size={16} /></div>
              <div>
                <p className="font-medium text-slate-800">Cet appareil</p>
                <p className="text-xs text-slate-400 font-mono">Identifiant local</p>
              </div>
            </div>
            <span className="text-slate-600">Windows</span>
            <span className="text-slate-600">Maintenant</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full w-fit">
              <ShieldCheck size={11} /> ACTIF
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
