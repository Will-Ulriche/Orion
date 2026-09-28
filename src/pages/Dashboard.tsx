import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { Database, Wifi, WifiOff, MonitorSmartphone, CheckCircle, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';

interface DeviceInfo {
  identifier: string;
  name: string;
  platform: string;
}

interface SyncStatus {
  pending: number;
  failed: number;
  conflict: number;
}

export default function Dashboard() {
  const [dbStatus, setDbStatus] = useState<string>('Vérification...');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [deviceRegStatus, setDeviceRegStatus] = useState<string>('Enregistrement...');
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSync] = useState<string>('—');

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    invoke('check_db_status')
      .then((res) => setDbStatus(res as string))
      .catch((err) => setDbStatus(`Erreur SQLite : ${err}`));

    invoke('get_device_info')
      .then((res) => {
        setDeviceInfo(res as DeviceInfo);
        return invoke('register_device', { schoolId: null });
      })
      .then((status) => setDeviceRegStatus(status as string))
      .catch((err) => setDeviceRegStatus(`Erreur: ${err}`));

    invoke('get_sync_status')
      .then((res) => setSyncStatus(res as SyncStatus))
      .catch(console.error);

    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const refreshSync = () => {
    invoke('get_sync_status')
      .then((res) => setSyncStatus(res as SyncStatus))
      .catch(console.error);
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Tableau de bord</h2>
        <p className="text-slate-400 text-sm mt-1">Session 1 — Socle technique opérationnel</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Base de données locale */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><Database size={20} /></div>
            <h3 className="text-base font-semibold text-slate-800">Base de données locale</h3>
          </div>
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle size={15} />
            <span>{dbStatus}</span>
          </div>
        </div>

        {/* Appareil */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><MonitorSmartphone size={20} /></div>
            <h3 className="text-base font-semibold text-slate-800">Appareil</h3>
          </div>
          {deviceInfo ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Nom</span>
                <strong className="text-slate-800">{deviceInfo.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Plateforme</span>
                <span className="text-slate-700">{deviceInfo.platform}</span>
              </div>
              <div className="bg-slate-50 rounded p-2 font-mono text-xs text-slate-400 break-all mt-2">
                {deviceInfo.identifier}
              </div>
              <div className="flex items-center gap-2 text-green-600 text-xs pt-1">
                <ShieldCheck size={13} />
                <span>{deviceRegStatus}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">Récupération en cours...</p>
          )}
        </div>
      </div>

      {/* Centre de synchronisation */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isOnline ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-500'}`}>
              {isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">Centre de synchronisation</h3>
              <p className="text-xs text-slate-400">Dernière synchro : {lastSync}</p>
            </div>
          </div>
          <button
            onClick={refreshSync}
            className="flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">En attente d'envoi</p>
            <p className="text-2xl font-bold text-slate-800">{syncStatus?.pending ?? '—'}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Conflits</p>
            <p className={`text-2xl font-bold ${(syncStatus?.conflict ?? 0) > 0 ? 'text-orange-500' : 'text-slate-800'}`}>
              {syncStatus?.conflict ?? '—'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Erreurs</p>
            <p className={`text-2xl font-bold ${(syncStatus?.failed ?? 0) > 0 ? 'text-red-500' : 'text-slate-800'}`}>
              {syncStatus?.failed ?? '—'}
            </p>
          </div>
        </div>

        {(syncStatus?.failed ?? 0) > 0 && (
          <div className="flex items-center gap-2 mt-4 bg-blue-50 text-blue-600 p-3 rounded-lg text-sm">
            <span className="text-base">ℹ️</span>
            <span>
              Mode hors-ligne actif — {syncStatus?.failed} opération(s) en attente de synchronisation avec Supabase.
              Ces données sont sauvegardées localement et seront envoyées dès que la connexion cloud sera configurée.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
