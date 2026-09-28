import { useAuth } from '../contexts/AuthContext';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { LogOut, Database, WifiOff, MonitorSmartphone, CheckCircle, ShieldCheck } from 'lucide-react';

interface DeviceInfo {
  identifier: string;
  name: string;
  platform: string;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [dbStatus, setDbStatus] = useState<string>('Vérification...');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [deviceRegStatus, setDeviceRegStatus] = useState<string>('Enregistrement...');

  useEffect(() => {
    // Vérification de la base locale via Tauri
    invoke('check_db_status')
      .then((res) => setDbStatus(res as string))
      .catch((err) => setDbStatus(`Erreur SQLite : ${err}`));

    // Récupération et enregistrement de l'appareil
    invoke('get_device_info')
      .then((res) => {
        const info = res as DeviceInfo;
        setDeviceInfo(info);
        // Enregistrer l'appareil dans SQLite (school_id provisoire)
        return invoke('register_device', { schoolId: 'school_placeholder' });
      })
      .then((status) => setDeviceRegStatus(status as string))
      .catch((err) => setDeviceRegStatus(`Erreur: ${err}`));
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
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Tableau de bord — Socle Session 1</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SQLite */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-4 text-indigo-600">
              <Database />
              <h3 className="text-lg font-semibold text-slate-800">Base de données locale</h3>
            </div>
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle size={16} />
              <span>{dbStatus}</span>
            </div>
          </div>

          {/* Appareil */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-4 text-indigo-600">
              <MonitorSmartphone />
              <h3 className="text-lg font-semibold text-slate-800">Appareil</h3>
            </div>
            {deviceInfo ? (
              <div className="space-y-2 text-sm">
                <p><span className="text-slate-500">Nom :</span> <strong>{deviceInfo.name}</strong></p>
                <p><span className="text-slate-500">Plateforme :</span> {deviceInfo.platform}</p>
                <div className="bg-slate-100 rounded p-2 font-mono text-xs text-slate-500 break-all mt-2">
                  {deviceInfo.identifier}
                </div>
                <div className="flex items-center gap-2 text-green-600 pt-1">
                  <ShieldCheck size={14} />
                  <span>{deviceRegStatus}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">Récupération des informations...</p>
            )}
          </div>

          {/* Synchronisation */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 md:col-span-2">
            <div className="flex items-center gap-3 mb-4 text-orange-500">
              <WifiOff />
              <h3 className="text-lg font-semibold text-slate-800">Centre de synchronisation</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-slate-400 mb-1">Dernière synchro</p>
                <p className="font-semibold text-slate-700">—</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-slate-400 mb-1">À envoyer</p>
                <p className="font-semibold text-slate-700">0</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-slate-400 mb-1">Conflits</p>
                <p className="font-semibold text-green-600">0</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-slate-400 mb-1">Erreurs</p>
                <p className="font-semibold text-green-600">0</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
