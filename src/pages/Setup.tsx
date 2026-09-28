import { useState, useEffect } from 'react';
import { Database, Key, ShieldCheck, Building2, MonitorSmartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';

interface DeviceInfo {
  identifier: string;
  name: string;
  platform: string;
}

export default function Setup() {
  const [step, setStep] = useState(1);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    invoke('get_device_info').then((res) => {
      setDeviceInfo(res as DeviceInfo);
    }).catch(console.error);
  }, []);

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      // Fin de la configuration
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-2xl bg-white p-10 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-3xl font-bold text-center text-slate-800 mb-2">Bienvenue sur Orion</h1>
        <p className="text-center text-slate-500 mb-10">Configuration initiale de votre environnement local</p>

        <div className="flex justify-between items-center mb-10 relative">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200 -z-10"></div>
          
          <div className={`flex flex-col items-center gap-2 ${step >= 1 ? 'text-indigo-600' : 'text-slate-400'}`}>
            <div className={`p-3 rounded-full ${step >= 1 ? 'bg-indigo-100' : 'bg-slate-100'}`}><Database size={24}/></div>
            <span className="text-xs font-semibold">Système</span>
          </div>
          
          <div className={`flex flex-col items-center gap-2 ${step >= 2 ? 'text-indigo-600' : 'text-slate-400'}`}>
            <div className={`p-3 rounded-full ${step >= 2 ? 'bg-indigo-100' : 'bg-slate-100'}`}><Key size={24}/></div>
            <span className="text-xs font-semibold">Licence</span>
          </div>

          <div className={`flex flex-col items-center gap-2 ${step >= 3 ? 'text-indigo-600' : 'text-slate-400'}`}>
            <div className={`p-3 rounded-full ${step >= 3 ? 'bg-indigo-100' : 'bg-slate-100'}`}><Building2 size={24}/></div>
            <span className="text-xs font-semibold">Établissement</span>
          </div>

          <div className={`flex flex-col items-center gap-2 ${step >= 4 ? 'text-indigo-600' : 'text-slate-400'}`}>
            <div className={`p-3 rounded-full ${step >= 4 ? 'bg-indigo-100' : 'bg-slate-100'}`}><ShieldCheck size={24}/></div>
            <span className="text-xs font-semibold">Direction</span>
          </div>
        </div>

        <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 mb-8 min-h-[200px]">
          {step === 1 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Vérification de l'environnement</h3>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-sm">
                  <div className="text-green-500"><Database size={16} /></div>
                  <span className="text-slate-600">Base de données locale (SQLite) : Prête</span>
                </div>
                
                {deviceInfo ? (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="text-indigo-500"><MonitorSmartphone size={16} /></div>
                    <span className="text-slate-600">
                      Appareil : <strong>{deviceInfo.name}</strong> ({deviceInfo.platform})
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">Analyse de l'appareil en cours...</p>
                )}
              </div>

              {deviceInfo && (
                <div className="bg-slate-100 rounded-lg p-3 text-xs font-mono text-slate-500 mb-4 break-all">
                  Identifiant matériel sécurisé : {deviceInfo.identifier}
                </div>
              )}
              
              <p className="text-sm text-slate-500">Connexion au centre de synchronisation (Supabase) en attente...</p>
            </div>
          )}
          {step === 2 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Activation de la licence</h3>
              <input type="text" placeholder="Entrez votre clé de licence (ex: ORION-XXXX-XXXX)" className="w-full px-4 py-2 border rounded-lg" />
            </div>
          )}
          {step === 3 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Association à l'établissement</h3>
              <p className="text-slate-600">Recherche de votre établissement dans le cloud...</p>
            </div>
          )}
          {step === 4 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Création du compte Direction</h3>
              <p className="text-slate-600">Préparez le compte administrateur local pour le premier accès offline.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button 
            onClick={handleNext}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors"
          >
            {step === 4 ? 'Terminer et se connecter' : 'Étape suivante'}
          </button>
        </div>
      </div>
    </div>
  );
}
