import { FileText } from 'lucide-react';

export default function Audit() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Journal d'audit</h2>
        <p className="text-slate-400 text-sm mt-1">Historique des actions sensibles dans le système</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 grid grid-cols-5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <span>Horodatage</span>
          <span>Utilisateur</span>
          <span>Action</span>
          <span>Entité</span>
          <span>Appareil</span>
        </div>
        <div className="px-6 py-12 text-center text-slate-400 text-sm">
          <FileText size={32} className="mx-auto mb-3 text-slate-200" />
          Aucune action auditée pour l'instant.
          <br />
          <span className="text-xs text-slate-300">Les actions importantes (connexions, modifications, suppressions) apparaîtront ici.</span>
        </div>
      </div>
    </div>
  );
}
