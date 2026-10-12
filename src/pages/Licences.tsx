import { Key, CheckCircle, Clock, XCircle, Ban, RefreshCw, Plus, Copy, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  ACTIVE:    { label: 'Active',    color: 'bg-emerald-50 text-emerald-700 border border-emerald-200',  icon: CheckCircle },
  EXPIRED:   { label: 'Expirée',   color: 'bg-slate-100 text-slate-500 border border-slate-200',       icon: Clock },
  SUSPENDED: { label: 'Suspendue', color: 'bg-amber-50 text-amber-700 border border-amber-200',       icon: XCircle },
  REVOKED:   { label: 'Révoquée',  color: 'bg-rose-50 text-rose-700 border border-rose-200',           icon: Ban },
};

interface LicenseRec {
  id: string;
  school_id: string;
  license_key: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  max_devices: number | null;
  issued_at?: string | null;
}

export default function Licences() {
  const { schoolId, user } = useAuth();
  const [licenses, setLicenses] = useState<LicenseRec[]>([]);
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Activation manuelle d'une clé
  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [activationSuccess, setActivationSuccess] = useState('');
  const [showActivationModal, setShowActivationModal] = useState(false);

  const effectiveSchoolId = schoolId || localStorage.getItem('current_school_id') || 'school-1';

  const loadLicenses = useCallback(async () => {
    setLoading(true);
    let loaded: LicenseRec[] = [];

    // 1. Essayer de charger depuis le Cloud Supabase (données les plus récentes)
    try {
      // Résoudre le school_id précis de l'utilisateur si disponible
      let targetId = effectiveSchoolId;
      if (user?.id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('school_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (prof?.school_id) {
          targetId = prof.school_id;
        }
      }

      const { data: cloudLics, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('school_id', targetId)
        .order('created_at', { ascending: false });

      if (!error && cloudLics && cloudLics.length > 0) {
        loaded = cloudLics as LicenseRec[];
      }
    } catch (cloudErr) {
      console.warn('Impossible de joindre Supabase pour les licences, repli local:', cloudErr);
    }

    // 2. Si rien trouvé en ligne ou offline, lire la base SQLite locale
    if (loaded.length === 0) {
      try {
        const localLics = await invoke<LicenseRec[]>('get_licenses', { schoolId: effectiveSchoolId });
        if (localLics && localLics.length > 0) {
          loaded = localLics;
        }
      } catch (localErr) {
        console.error('Erreur lecture SQLite licences:', localErr);
      }
    }

    setLicenses(loaded);

    // Charger les appareils
    try {
      const devices = await invoke<any[]>('get_devices', { schoolId: effectiveSchoolId });
      setDeviceCount(devices.length);
    } catch (_) {}

    setLoading(false);
  }, [effectiveSchoolId, user?.id]);

  useEffect(() => {
    loadLicenses();
  }, [loadLicenses]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLicenses();
    setRefreshing(false);
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Activer une nouvelle clé saisie manuellement
  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = activationKey.trim().toUpperCase();
    if (!cleanKey) return;

    setActivating(true);
    setActivationError('');
    setActivationSuccess('');

    try {
      // 1. Vérifier la clé sur Supabase
      const { data: lic, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', cleanKey)
        .maybeSingle();

      if (error || !lic) {
        throw new Error('Clé de licence invalide ou introuvable.');
      }

      // Si la licence appartient à une autre école ou est nouvelle, lier à notre école
      if (!lic.school_id || lic.school_id === 'unassigned') {
        await supabase
          .from('licenses')
          .update({ school_id: effectiveSchoolId, status: 'ACTIVE' })
          .eq('id', lic.id);
      }

      setActivationSuccess('Licence activée avec succès !');
      setActivationKey('');
      await loadLicenses();
      // Informer le LicenseGuard qu'une licence valide est désormais disponible
      window.dispatchEvent(new Event('orion:license-updated'));
      setTimeout(() => {
        setShowActivationModal(false);
        setActivationSuccess('');
      }, 1500);
    } catch (err: any) {
      setActivationError(err.message || 'Échec de l’activation de la licence.');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="pt-2">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {Object.entries(statusConfig).map(([key, { label, color, icon: Icon }]) => (
            <div key={key} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${color}`}>
              <Icon size={12} /> {label}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
            title="Rafraîchir les informations de licence"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-indigo-600' : ''} />
            <span>Vérifier la licence</span>
          </button>

          <button
            onClick={() => setShowActivationModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-2xs"
          >
            <Plus size={13} />
            <span>Activer une clé</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
          <RefreshCw size={24} className="animate-spin text-indigo-500" />
          <p className="text-sm">Vérification de la licence en cours…</p>
        </div>
      ) : licenses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 mb-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <Key size={22} />
          </div>
          <h3 className="font-bold text-slate-800 text-base mb-1">Aucune licence trouvée</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
            Aucune licence n'est actuellement enregistrée pour votre établissement.
            Si votre Super Administrateur vous a fourni une clé, activez-la ci-dessous.
          </p>
          <button
            onClick={() => setShowActivationModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Key size={14} /> Saisir ma clé de licence
          </button>
        </div>
      ) : (
        licenses.map((lic) => {
          const cfg = statusConfig[lic.status] || { label: lic.status, color: 'bg-slate-100 text-slate-600', icon: CheckCircle };
          const StatusIcon = cfg.icon;
          return (
            <div key={lic.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 mb-6">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
                    <Key size={22} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">Licence d'utilisation Orion</h3>
                    <p className="text-xs text-slate-400">Établissement rattaché : {lic.school_id}</p>
                  </div>
                </div>

                <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${cfg.color}`}>
                  <StatusIcon size={13} /> {cfg.label}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 sm:col-span-2 md:col-span-1">
                  <p className="text-xs text-slate-400 mb-1">Clé de licence</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-800 text-sm select-all">{lic.license_key}</span>
                    <button
                      onClick={() => copyKey(lic.license_key)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded"
                      title="Copier la clé"
                    >
                      {copiedKey === lic.license_key ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                  <p className="text-xs text-slate-400 mb-1">Période de validité</p>
                  <p className="font-semibold text-slate-700 text-xs">
                    {lic.starts_at ? new Date(lic.starts_at).toLocaleDateString() : '—'}
                    {' au '}
                    <span className="text-indigo-600 font-bold">
                      {lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : 'Illimité'}
                    </span>
                  </p>
                </div>

                <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                  <p className="text-xs text-slate-400 mb-1">Appareils autorisés</p>
                  <p className="font-semibold text-slate-700 text-xs">
                    <span className="text-slate-800 font-bold">{deviceCount}</span>
                    {lic.max_devices ? ` / ${lic.max_devices} postes max` : ' postes'}
                  </p>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Modale d'activation manuelle */}
      {showActivationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Key size={16} />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Activer une clé de licence</h3>
              </div>
              <button
                onClick={() => setShowActivationModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleActivateKey} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Code de licence Orion
                </label>
                <input
                  type="text"
                  value={activationKey}
                  onChange={(e) => setActivationKey(e.target.value)}
                  placeholder="Ex: ORION-XXXX-XXXX-XXXX"
                  className="w-full px-3.5 py-2.5 font-mono text-sm tracking-wide rounded-xl border border-slate-200 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Format : ORION-XXXX-XXXX-XXXX (fourni par votre administrateur)
                </p>
              </div>

              {activationError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                  {activationError}
                </div>
              )}

              {activationSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
                  {activationSuccess}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowActivationModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={activating}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {activating ? 'Vérification…' : 'Valider la licence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
