import { Key, CheckCircle, Clock, XCircle, Ban } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  ACTIVE:    { label: 'Active',    color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  EXPIRED:   { label: 'Expirée',   color: 'bg-slate-100 text-slate-500',  icon: Clock },
  SUSPENDED: { label: 'Suspendue', color: 'bg-orange-100 text-orange-700', icon: XCircle },
  REVOKED:   { label: 'Révoquée',  color: 'bg-red-100 text-red-700',      icon: Ban },
};

interface LicenseRec {
  id: string;
  school_id: string;
  license_key: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  max_devices: number | null;
}

export default function Licences() {
  const { schoolId } = useAuth();
  const [licenses, setLicenses] = useState<LicenseRec[]>([]);
  const [deviceCount, setDeviceCount] = useState(0);

  useEffect(() => {
    if (schoolId) {
      invoke<LicenseRec[]>('get_licenses', { schoolId }).then(setLicenses).catch(console.error);
      invoke<any[]>('get_devices', { schoolId }).then(d => setDeviceCount(d.length)).catch(console.error);
    }
  }, [schoolId]);

  return (
    <div className="pt-2">
      {/* Statuts possibles */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {Object.entries(statusConfig).map(([key, { label, color, icon: Icon }]) => (
          <div key={key} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${color}`}>
            <Icon size={12} /> {label}
          </div>
        ))}
      </div>

      {licenses.map(lic => (
        <div key={lic.id} className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-50 p-2.5 rounded-lg text-indigo-600"><Key size={22} /></div>
            <div>
              <h3 className="font-semibold text-slate-800">Licence d'établissement</h3>
              <p className="text-xs text-slate-400">Configuration lors du premier lancement</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Clé de licence', value: lic.license_key },
              { label: 'Statut', value: statusConfig[lic.status]?.label || lic.status },
              { label: 'Date de début', value: lic.starts_at ? new Date(lic.starts_at).toLocaleDateString() : '—' },
              { label: 'Date d\'expiration', value: lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : '—' },
              { label: 'Appareils max', value: lic.max_devices?.toString() || '—' },
              { label: 'Appareils actifs', value: deviceCount.toString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className="font-semibold text-slate-700">{value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      
      {licenses.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 text-center text-slate-500">
             Aucune licence associée à cet établissement.
          </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        La licence sera associée à votre établissement lors de l'activation initiale.
      </p>
    </div>
  );
}
