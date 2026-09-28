import { useAuth } from '../contexts/AuthContext';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { LogOut, Database, WifiOff } from 'lucide-react';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [dbStatus, setDbStatus] = useState<string>('Vérification...');

  useEffect(() => {
    // Vérification de la base locale via Tauri
    invoke('check_db_status')
      .then((res) => setDbStatus(res as string))
      .catch((err) => setDbStatus(`Erreur SQLite : ${err}`));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white p-2 rounded-lg font-bold">O</div>
          <h1 className="text-xl font-bold text-slate-800">Orion</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">{user?.email}</span>
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </header>

      <main className="p-8 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Tableau de bord (Socle Session 1)</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-4 text-indigo-600">
              <Database />
              <h3 className="text-lg font-semibold text-slate-800">Base de données locale</h3>
            </div>
            <p className="text-slate-600">{dbStatus}</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-4 text-orange-500">
              <WifiOff />
              <h3 className="text-lg font-semibold text-slate-800">Centre de synchronisation</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">Préparation des files d'attente (Offline-First)</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span>Dernière synchro</span>
                <span className="font-medium text-slate-800">-</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span>En attente d'envoi</span>
                <span className="font-medium text-slate-800">0</span>
              </div>
              <div className="flex justify-between">
                <span>Conflits</span>
                <span className="font-medium text-green-600">0</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
