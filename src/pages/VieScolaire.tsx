import { School, Clock } from 'lucide-react';

export default function VieScolaire() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-slate-50 to-[#f8f9fc]">
      <div className="z-20 shrink-0 border-b border-slate-200/60 bg-slate-50/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl space-y-4 px-8 py-5">
          <div className="flex animate-fade-in items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white shadow-lg">
                <School size={22} />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-800">Gestion Bibliothèque</h1>
                <p className="text-[13px] text-slate-400">Ouvrages, emprunts, retours et gestion du catalogue.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto flex h-full max-w-7xl flex-col px-8 py-6">
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
                <Clock size={32} className="text-slate-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">Module en cours de développement</h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                La gestion de la bibliothèque (catalogue, emprunts, retours) sera bientôt disponible.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
