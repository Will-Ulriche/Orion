import {
  Key, CheckCircle, Clock, XCircle, Ban, RefreshCw, Plus, Copy, Check,
  AlertTriangle, Sparkles, Hourglass
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabaseAdmin } from '../lib/supabaseClient';

function normalizeLicenseKey(input: string): string {
  let cleaned = input.trim().toUpperCase().replace(/[\s_]+/g, '-');
  if (!cleaned.startsWith('ORION-') && cleaned.replace(/-/g, '').length === 12) {
    const raw = cleaned.replace(/-/g, '');
    cleaned = `ORION-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  }
  return cleaned;
}


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

// ─── Composant Décompte du temps restant (Notion / Modern Widget) ────────────
function LicenseCountdownCard({
  license,
  onCopyKey,
  copiedKey
}: {
  license: LicenseRec;
  onCopyKey: (key: string) => void;
  copiedKey: string | null;
}) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
    unlimited: boolean;
    percentage: number;
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
    unlimited: !license.expires_at,
    percentage: 0,
  });

  useEffect(() => {
    if (!license.expires_at) {
      setTimeLeft({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isExpired: false,
        unlimited: true,
        percentage: 0,
      });
      return;
    }

    const calculate = () => {
      const now = Date.now();
      const end = new Date(license.expires_at!).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true,
          unlimited: false,
          percentage: 100,
        });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      let percentage = 0;
      if (license.starts_at) {
        const start = new Date(license.starts_at).getTime();
        const total = end - start;
        if (total > 0) {
          const elapsed = now - start;
          percentage = Math.min(100, Math.max(0, (elapsed / total) * 100));
        }
      }

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        isExpired: false,
        unlimited: false,
        percentage,
      });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [license.expires_at, license.starts_at]);

  const pad = (n: number) => String(n).padStart(2, '0');

  // Niveaux d'urgence
  const isUrgent = !timeLeft.unlimited && !timeLeft.isExpired && timeLeft.days < 7;
  const isWarning = !timeLeft.unlimited && !timeLeft.isExpired && timeLeft.days >= 7 && timeLeft.days < 30;

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-6 mb-8 transition-all shadow-sm ${
      timeLeft.isExpired
        ? 'bg-rose-50/60 border-rose-200 text-rose-900'
        : isUrgent
        ? 'bg-amber-50/70 border-amber-300 text-amber-950'
        : 'bg-gradient-to-br from-indigo-950 via-slate-900 to-[#1e1b4b] border-indigo-900/50 text-white shadow-xl shadow-indigo-950/20'
    }`}>
      {/* Halo lumineux subtil */}
      {!timeLeft.isExpired && (
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />
      )}

      {/* Header du décompte */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            timeLeft.isExpired
              ? 'bg-rose-100 text-rose-600'
              : isUrgent
              ? 'bg-amber-100 text-amber-700'
              : 'bg-white/10 text-indigo-300 backdrop-blur-sm'
          }`}>
            <Hourglass size={20} className={!timeLeft.isExpired ? 'animate-pulse' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold tracking-tight">
                Décompte de validité de votre licence
              </h3>
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                timeLeft.isExpired
                  ? 'bg-rose-200 text-rose-800'
                  : isUrgent
                  ? 'bg-rose-500 text-white animate-pulse'
                  : isWarning
                  ? 'bg-amber-400 text-amber-950'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  timeLeft.isExpired ? 'bg-rose-600' : isUrgent ? 'bg-white' : 'bg-emerald-400 animate-ping'
                }`} />
                {timeLeft.isExpired
                  ? 'Expirée'
                  : timeLeft.unlimited
                  ? 'Illimitée'
                  : isUrgent
                  ? `Expire dans ${timeLeft.days}j !`
                  : isWarning
                  ? 'Expiration proche'
                  : 'Licence active'}
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${timeLeft.isExpired ? 'text-rose-700' : isUrgent ? 'text-amber-800' : 'text-slate-300'}`}>
              {timeLeft.unlimited
                ? "Cette licence d'établissement n'a aucune date d'expiration fixée."
                : license.expires_at
                ? `Date limite : ${new Date(license.expires_at).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                : ''}
            </p>
          </div>
        </div>

        {/* Clé active copiée */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-2 ${
            timeLeft.isExpired
              ? 'bg-white/80 border border-rose-200 text-rose-900'
              : 'bg-white/10 border border-white/15 text-white backdrop-blur-sm'
          }`}>
            <Key size={13} className="text-indigo-400" />
            <span className="font-semibold select-all">{license.license_key}</span>
            <button
              onClick={() => onCopyKey(license.license_key)}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="Copier la clé"
            >
              {copiedKey === license.license_key ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      </div>

      {/* Cartes digitales du décompte en temps réel */}
      {!timeLeft.unlimited && !timeLeft.isExpired && (
        <div className="relative z-10 pt-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Jours */}
            <div className={`rounded-xl p-3.5 flex flex-col items-center justify-center border text-center transition-transform hover:scale-[1.02] ${
              timeLeft.isExpired
                ? 'bg-white border-rose-200'
                : 'bg-white/5 border-white/10 backdrop-blur-sm'
            }`}>
              <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight">
                {pad(timeLeft.days)}
              </span>
              <span className={`text-[11px] font-semibold uppercase tracking-wider mt-1 ${
                timeLeft.isExpired ? 'text-rose-600' : 'text-indigo-200/80'
              }`}>
                {timeLeft.days <= 1 ? 'Jour' : 'Jours'}
              </span>
            </div>

            {/* Heures */}
            <div className={`rounded-xl p-3.5 flex flex-col items-center justify-center border text-center transition-transform hover:scale-[1.02] ${
              timeLeft.isExpired
                ? 'bg-white border-rose-200'
                : 'bg-white/5 border-white/10 backdrop-blur-sm'
            }`}>
              <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight">
                {pad(timeLeft.hours)}
              </span>
              <span className={`text-[11px] font-semibold uppercase tracking-wider mt-1 ${
                timeLeft.isExpired ? 'text-rose-600' : 'text-indigo-200/80'
              }`}>
                Heures
              </span>
            </div>

            {/* Minutes */}
            <div className={`rounded-xl p-3.5 flex flex-col items-center justify-center border text-center transition-transform hover:scale-[1.02] ${
              timeLeft.isExpired
                ? 'bg-white border-rose-200'
                : 'bg-white/5 border-white/10 backdrop-blur-sm'
            }`}>
              <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight">
                {pad(timeLeft.minutes)}
              </span>
              <span className={`text-[11px] font-semibold uppercase tracking-wider mt-1 ${
                timeLeft.isExpired ? 'text-rose-600' : 'text-indigo-200/80'
              }`}>
                Minutes
              </span>
            </div>

            {/* Secondes */}
            <div className={`rounded-xl p-3.5 flex flex-col items-center justify-center border text-center transition-transform hover:scale-[1.02] ${
              timeLeft.isExpired
                ? 'bg-white border-rose-200'
                : 'bg-white/5 border-white/10 backdrop-blur-sm'
            }`}>
              <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-indigo-400">
                {pad(timeLeft.seconds)}
              </span>
              <span className={`text-[11px] font-semibold uppercase tracking-wider mt-1 ${
                timeLeft.isExpired ? 'text-rose-600' : 'text-indigo-200/80'
              }`}>
                Secondes
              </span>
            </div>
          </div>

          {/* Jauge de progression du temps écoulé */}
          {license.starts_at && (
            <div className="pt-2">
              <div className="flex justify-between text-[11px] font-medium text-slate-400 mb-1.5">
                <span>Période d'abonnement entamée ({Math.round(timeLeft.percentage)}%)</span>
                <span>{timeLeft.days} jours restants sur votre licence</span>
              </div>
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    isUrgent ? 'bg-rose-500' : isWarning ? 'bg-amber-400' : 'bg-gradient-to-r from-indigo-400 to-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, 100 - timeLeft.percentage))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cas : Licence expirée */}
      {timeLeft.isExpired && (
        <div className="relative z-10 pt-4 flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs font-semibold text-rose-800 flex items-center gap-1.5">
            <AlertTriangle size={15} className="text-rose-600" />
            La licence a expiré. Veuillez contacter la direction générale ou le Super Administrateur pour obtenir une nouvelle clé.
          </p>
        </div>
      )}

      {/* Cas : Licence illimitée */}
      {timeLeft.unlimited && (
        <div className="relative z-10 pt-4 flex items-center gap-2 text-xs text-emerald-300 font-medium">
          <Sparkles size={16} className="text-emerald-400" />
          <span>Validité perpétuelle : aucun renouvellement périodique n'est requis.</span>
        </div>
      )}
    </div>
  );
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

  const effectiveSchoolId = schoolId || localStorage.getItem('current_school_id') || '';

  const loadLicenses = useCallback(async () => {
    setLoading(true);
    let loaded: LicenseRec[] = [];

    // 1. Essayer de charger depuis le Cloud Supabase (données les plus récentes)
    try {
      // Résoudre le school_id précis de l'utilisateur si disponible
      let targetId = effectiveSchoolId;
      if (!targetId || targetId === 'school-1') {
        const metaSchoolId = (user?.user_metadata as any)?.school_id;
        if (metaSchoolId) targetId = metaSchoolId;
      }
      if (user?.id) {
        const { data: prof } = await supabaseAdmin
          .from('profiles')
          .select('school_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (prof?.school_id) {
          targetId = prof.school_id;
        }
      }

      const { data: cloudLics, error } = await supabaseAdmin
        .from('licenses')
        .select('*')
        .eq('school_id', targetId)
        .order('created_at', { ascending: false });

      if (!error && cloudLics && cloudLics.length > 0) {
        loaded = cloudLics as LicenseRec[];
        // Sauvegarder la première licence active dans SQLite
        const active = loaded.find(l => l.status === 'ACTIVE');
        if (active) {
          try {
            await invoke('save_license', { license: active });
          } catch (_) {}
        }
      } else if (targetId !== 'school-1') {
        // Fallback si la licence était enregistrée sous school-1
        const { data: fallbackLics } = await supabaseAdmin
          .from('licenses')
          .select('*')
          .eq('school_id', 'school-1')
          .order('created_at', { ascending: false });
        if (fallbackLics && fallbackLics.length > 0) {
          loaded = fallbackLics as LicenseRec[];
        }
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
    const cleanKey = normalizeLicenseKey(activationKey);
    if (!cleanKey) return;

    setActivating(true);
    setActivationError('');
    setActivationSuccess('');

    try {
      // 1. Vérifier la clé sur Supabase via supabaseAdmin (bypass RLS)
      const { data: lic, error } = await supabaseAdmin
        .from('licenses')
        .select('*')
        .eq('license_key', cleanKey)
        .maybeSingle();

      if (error || !lic) {
        throw new Error('Clé de licence invalide ou introuvable.');
      }

      if (lic.status === 'REVOKED') throw new Error('Cette clé a été révoquée.');
      if (lic.status === 'SUSPENDED') throw new Error('Cette clé est suspendue.');
      if (lic.expires_at && new Date(lic.expires_at) < new Date()) throw new Error('Cette clé est expirée.');

      let currentId = effectiveSchoolId;
      if ((!currentId || currentId === 'school-1') && lic.school_id && lic.school_id !== 'unassigned') {
        currentId = lic.school_id;
        localStorage.setItem('current_school_id', currentId);
        window.dispatchEvent(new Event('orion:school-changed'));
      } else if (!lic.school_id || lic.school_id === 'unassigned') {
        await supabaseAdmin
          .from('licenses')
          .update({ school_id: currentId, status: 'ACTIVE' })
          .eq('id', lic.id);
        lic.school_id = currentId;
      }

      // Enregistrer dans le cache local et SQLite
      localStorage.setItem('orion_lic_ok_at', Date.now().toString());
      localStorage.setItem('orion_lic_cache', JSON.stringify(lic));
      try {
        await invoke('save_license', { license: lic });
      } catch (_) {}

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

  const primaryLicense = licenses.find(l => l.status === 'ACTIVE') || licenses[0];

  return (
    <div className="pt-2">
      {/* ─── DÉCOMPTE DU TEMPS RESTANT EN DIRECT (TOP WIDGET) ─── */}
      {!loading && primaryLicense && (
        <LicenseCountdownCard
          license={primaryLicense}
          onCopyKey={copyKey}
          copiedKey={copiedKey}
        />
      )}

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
