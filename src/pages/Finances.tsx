import { useState } from 'react';
import { Coins, List, Plus, TrendingUp, Search } from 'lucide-react';

export default function Finances() {
  const [activeTab, setActiveTab] = useState<'grille' | 'paiements' | 'dashboard'>('grille');

  return (
    <div className="px-8 pt-6 pb-8 w-full h-full overflow-y-auto bg-[#f8f9fc]">
      {/* En-tête */}
      <div className="mb-6 flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight flex items-center gap-2">
            <Coins size={24} className="text-[#4f46e5]" />
            Finances & Paiements
          </h2>
          <p className="text-slate-500 mt-0.5 text-[13px]">
            Gestion de la grille tarifaire, des encaissements et suivi financier
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-white rounded-xl p-1 w-fit shadow-sm border border-slate-200">
          <button
            onClick={() => setActiveTab('grille')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'grille'
                ? 'bg-[#4f46e5] text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <List size={16} />
            Grille Tarifaire
          </button>
          <button
            onClick={() => setActiveTab('paiements')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'paiements'
                ? 'bg-[#4f46e5] text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Search size={16} />
            Paiements Élève
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'dashboard'
                ? 'bg-[#4f46e5] text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <TrendingUp size={16} />
            Tableau de Bord
          </button>
        </div>
      </div>

      {/* Contenu */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {activeTab === 'grille' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800">Grille tarifaire de l'année</h3>
              <button className="flex items-center gap-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
                <Plus size={16} /> Ajouter un frais
              </button>
            </div>
            <div className="flex justify-center items-center h-48 text-slate-400">
              Interface en cours de construction...
            </div>
          </div>
        )}

        {activeTab === 'paiements' && (
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-6">Paiements par élève</h3>
            <div className="flex justify-center items-center h-48 text-slate-400">
              Interface en cours de construction...
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-6">Tableau de bord financier</h3>
            <div className="flex justify-center items-center h-48 text-slate-400">
              Interface en cours de construction...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
