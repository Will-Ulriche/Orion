import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { KeyRound, RefreshCw, ShieldOff, Clock, Ban, AlertTriangle, Key, CheckCircle, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { invoke } from '@tauri-apps/api/core';

// ─── Types ────────────────────────────────────────────────────
type CheckStatus = 'checking' | 'valid' | 'expired' | 'suspended' | 'revoked' | 'missing' | 'offline_grace';

interface LicenseInfo {
  id: string;
  license_key: string;
  status: string;
  expires_at: string | null;
  starts_at: string | null;
  max_devices: number | null;
}

// ─── Constantes ───────────────────────────────────────────────
const GRACE_MS     = 7 * 24 * 60 * 60 * 1000; // 7 jours hors-ligne toléré
const RECHECK_MS   = 60 * 60 * 1000;           // revérification toutes les heures
const LS_LAST_OK   = 'orion_lic_ok_at';
const LS_CACHED    = 'orion_lic_cache';

// ─── Helpers UI ───────────────────────────────────────────────
const STATUS_CFG: Record<CheckStatus, { icon: typeof ShieldOff; title: string; desc: string; color: string; bg: string; border: string }> = {
  checking:      { icon: RefreshCw,    title: 'Vérification…',        desc: 'Contrôle de votre licence en cours.',                              color: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200' },
  valid:         { icon: CheckCircle,  title: 'Licence valide',        desc: 'Votre licence est active.',                                        color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  expired:       { icon: Clock,        title: 'Licence expirée',       desc: 'Votre licence a expiré. Contactez votre administrateur.',           color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  suspended:     { icon: AlertTriangle,'title': 'Licence suspendue',   desc: 'Votre licence est suspendue. Contactez votre administrateur.',       color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  revoked:       { icon: Ban,          title: 'Licence révoquée',      desc: 'Votre licence a été révoquée. Contactez votre administrateur.',      color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
  missing:       { icon: ShieldOff,    title: 'Aucune licence',        desc: "Aucune licence trouvée pour cet établissement. Activez votre clé.", color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-200' },
  offline_grace: { icon: RefreshCw,     title: 'Mode hors-ligne',       desc: 'Licence non vérifiable (réseau indisponible). Accès temporaire accordé.', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
};

// ─── Composant ────────────────────────────────────────────────
export default function LicenseGuard({ children }: { children: React.ReactNode }) {
  const { roles, rolesLoaded, user, schoolId, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Page de renouvellement de licence (onglet « Licence » de la page Sécurité)
  const onLicensePage = location.pathname === '/security';

  const [checkStatus, setCheckStatus] = useState<CheckStatus>('checking');
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [activationSuccess, setActivationSuccess] = useState('');
  const [showActivation, setShowActivation] = useState(false);

  // ── Vérification ────────────────────────────────────────────
  const checkLicense = useCallback(async () => {
    if (!user) return;

    setCheckStatus('checking');

    try {
      // Déterminer le school_id réel
      let targetId = schoolId;
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('school_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (prof?.school_id) targetId = prof.school_id;
      } catch (_) {}

      // Interroger Supabase
      const { data: lics, error } = await supabase
        .from('licenses')
        .select('id, license_key, status, starts_at, expires_at, max_devices')
        .eq('school_id', targetId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const now = new Date();
      const cloudLics: LicenseInfo[] = (lics ?? []) as LicenseInfo[];

      // Chercher une licence valide parmi les résultats cloud
      const validCloud = cloudLics.find(l =>
        l.status === 'ACTIVE' &&
        (!l.expires_at || new Date(l.expires_at) > now)
      );

      if (validCloud) {
        localStorage.setItem(LS_LAST_OK, Date.now().toString());
        localStorage.setItem(LS_CACHED, JSON.stringify(validCloud));
        setLicenseInfo(validCloud);
        setCheckStatus('valid');
        return;
      }

      if (cloudLics.length > 0) {
        const latest = cloudLics[0];
        setLicenseInfo(latest);
        // Déterminer le statut précis
        if (latest.status === 'SUSPENDED') { setCheckStatus('suspended'); return; }
        if (latest.status === 'REVOKED')   { setCheckStatus('revoked');   return; }
        if (latest.expires_at && new Date(latest.expires_at) <= now) { setCheckStatus('expired'); return; }
        setCheckStatus('missing');
        return;
      }

      // Rien en cloud → essayer SQLite local
      try {
        const localLics = await invoke<LicenseInfo[]>('get_licenses', { schoolId: targetId });
        const validLocal = (localLics ?? []).find(l =>
          l.status === 'ACTIVE' && (!l.expires_at || new Date(l.expires_at) > now)
        );
        if (validLocal) {
          localStorage.setItem(LS_LAST_OK, Date.now().toString());
          localStorage.setItem(LS_CACHED, JSON.stringify(validLocal));
          setLicenseInfo(validLocal);
          setCheckStatus('valid');
          return;
        }
        if (localLics && localLics.length > 0) {
          setLicenseInfo(localLics[0]);
          const s = localLics[0].status;
          if (s === 'SUSPENDED') setCheckStatus('suspended');
          else if (s === 'REVOKED') setCheckStatus('revoked');
          else setCheckStatus('expired');
          return;
        }
      } catch (_) {}

      setCheckStatus('missing');

    } catch (_networkErr) {
      // Réseau inaccessible → période de grâce
      const lastOkStr = localStorage.getItem(LS_LAST_OK);
      const cached    = localStorage.getItem(LS_CACHED);
      if (lastOkStr && Date.now() - parseInt(lastOkStr) < GRACE_MS) {
        if (cached) setLicenseInfo(JSON.parse(cached));
        setCheckStatus('offline_grace');
      } else {
        setCheckStatus('missing');
      }
    }
  }, [user, schoolId]);

  useEffect(() => {
    // Le SUPER_ADMIN passe toujours
    if (!rolesLoaded) return;
    if (roles.includes('SUPER_ADMIN')) return;

    checkLicense();
    const timer = setInterval(checkLicense, RECHECK_MS);
    return () => clearInterval(timer);
  }, [rolesLoaded, roles, checkLicense]);

  // Re-vérifier dès qu'une licence est activée/renouvelée depuis la page Licence
  useEffect(() => {
    const handler = () => checkLicense();
    window.addEventListener('orion:license-updated', handler);
    return () => window.removeEventListener('orion:license-updated', handler);
  }, [checkLicense]);

  // Licence expirée ou absente → diriger l'utilisateur vers la page de licence
  useEffect(() => {
    if (!rolesLoaded) return;
    if (roles.includes('SUPER_ADMIN')) return;
    if (checkStatus !== 'expired' && checkStatus !== 'missing') return;
    if (onLicensePage) return;
    navigate('/security?tab=licence', { replace: true });
  }, [rolesLoaded, roles, checkStatus, onLicensePage, navigate]);

  // ── Bypass Super Admin ───────────────────────────────────────
  if (!rolesLoaded || roles.includes('SUPER_ADMIN')) {
    return <>{children}</>;
  }

  // ── Accès accordé ────────────────────────────────────────────
  if (checkStatus === 'valid' || checkStatus === 'offline_grace') {
    return <>{children}</>;
  }

  // ── Licence expirée / absente ────────────────────────────────
  // On autorise l'accès à la page de licence pour permettre son renouvellement.
  const needsRenewal = checkStatus === 'expired' || checkStatus === 'missing';
  if (needsRenewal && onLicensePage) {
    return <>{children}</>;
  }
  if (needsRenewal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <RefreshCw size={28} className="animate-spin text-indigo-500" />
          <p className="text-sm font-medium">Redirection vers la page de licence…</p>
        </div>
      </div>
    );
  }

  // ── Chargement ───────────────────────────────────────────────
  if (checkStatus === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <RefreshCw size={28} className="animate-spin text-indigo-500" />
          <p className="text-sm font-medium">Vérification de la licence…</p>
        </div>
      </div>
    );
  }

  // ── Activation manuelle ──────────────────────────────────────
  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = activationKey.trim().toUpperCase();
    if (!cleanKey) return;
    setActivating(true);
    setActivationError('');
    setActivationSuccess('');
    try {
      const { data: lic, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', cleanKey)
        .maybeSingle();

      if (error || !lic) throw new Error('Clé de licence invalide ou introuvable.');
      if (lic.status === 'REVOKED') throw new Error('Cette clé a été révoquée.');
      if (lic.status === 'SUSPENDED') throw new Error('Cette clé est suspendue.');
      if (lic.expires_at && new Date(lic.expires_at) < new Date()) throw new Error('Cette clé est expirée.');

      setActivationSuccess('Licence vérifiée ! Connexion en cours…');
      setActivationKey('');
      setTimeout(() => {
        setShowActivation(false);
        setActivationSuccess('');
        checkLicense();
      }, 1500);
    } catch (err: any) {
      setActivationError(err.message || 'Échec de vérification de la licence.');
    } finally {
      setActivating(false);
    }
  };

  // ── Écran de blocage ─────────────────────────────────────────
  const cfg = STATUS_CFG[checkStatus];
  const Icon = cfg.icon;

  // Ici checkStatus est forcément 'suspended' | 'revoked' : les cas « expired »
  // et « missing » sont redirigés vers la page de licence (early return ci-dessus).
  const canActivate = (['missing', 'expired'] as CheckStatus[]).includes(checkStatus);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-white p-4">
      <div className="w-full max-w-md">

        {/* Carte principale */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

          {/* En-tête coloré */}
          <div className={`${cfg.bg} ${cfg.border} border-b px-8 py-8 flex flex-col items-center gap-4`}>
            <div className={`w-16 h-16 rounded-2xl ${cfg.bg} border-2 ${cfg.border} flex items-center justify-center shadow-sm`}>
              <Icon size={28} className={cfg.color} />
            </div>
            <div className="text-center">
              <h1 className={`text-xl font-bold ${cfg.color}`}>{cfg.title}</h1>
              <p className="text-sm text-slate-500 mt-1 max-w-xs leading-relaxed">{cfg.desc}</p>
            </div>
          </div>

          {/* Infos licence (si disponibles) */}
          {licenseInfo && (
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Informations de licence</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-slate-500">Clé</span>
                  <span className="font-mono font-semibold text-slate-700">{licenseInfo.license_key}</span>
                </div>
                {licenseInfo.expires_at && (
                  <div className="flex justify-between text-[12.5px]">
                    <span className="text-slate-500">Expirée le</span>
                    <span className="font-semibold text-slate-700">
                      {new Date(licenseInfo.expires_at).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-6 py-5 space-y-3">
            {/* Bouton Réessayer */}
            <button
              onClick={() => checkLicense()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <RefreshCw size={14} />
              Vérifier à nouveau
            </button>

            {/* Activer une clé */}
            {canActivate && !showActivation && (
              <button
                onClick={() => setShowActivation(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm"
              >
                <Key size={14} />
                Saisir une clé de licence
              </button>
            )}

            {/* Formulaire d'activation */}
            {showActivation && (
              <form onSubmit={handleActivate} className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50">
                <p className="text-[12px] font-semibold text-slate-600">Clé de licence</p>
                <input
                  type="text"
                  value={activationKey}
                  onChange={(e) => setActivationKey(e.target.value.toUpperCase())}
                  placeholder="ORION-XXXX-XXXX-XXXX"
                  className="w-full px-3 py-2.5 font-mono text-sm tracking-widest rounded-xl border border-slate-200 bg-white uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                />
                {activationError && (
                  <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{activationError}</p>
                )}
                {activationSuccess && (
                  <p className="text-[12px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <CheckCircle size={12} /> {activationSuccess}
                  </p>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowActivation(false)}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                    Annuler
                  </button>
                  <button type="submit" disabled={activating}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50">
                    {activating ? 'Vérification…' : 'Valider'}
                  </button>
                </div>
              </form>
            )}

            <p className="text-center text-[11px] text-slate-400 pt-1">
              Contactez Orion services pour obtenir ou renouveler votre licence.
            </p>

            {/* Bouton Se connecter */}
            <button
              onClick={async () => { await signOut(); navigate('/login'); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors"
            >
              <LogIn size={14} />
              Se connecter avec un autre compte
            </button>
          </div>

          {/* Pied — logo Orion */}
          <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-center gap-2 bg-slate-50/50">
            <div className="w-5 h-5 rounded-md bg-indigo-600 flex items-center justify-center">
              <KeyRound size={11} className="text-white" />
            </div>
            <span className="text-[11px] font-semibold text-slate-400 tracking-wide">ORION School Management</span>
          </div>
        </div>


      </div>
    </div>
  );
}
