import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { KeyRound, RefreshCw, ShieldOff, Clock, Ban, AlertTriangle, Key, CheckCircle, LogIn } from 'lucide-react';
import { useAuth, shouldBypassLicenseGate, AuthErrorScreen } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { invoke } from '@tauri-apps/api/core';
import {
  activateSchoolLicense,
  normalizeLicenseKey,
  LS_LIC_TOKEN,
} from '../lib/licenseActivation';
import {
  classifyLicense,
  findCurrentRecord,
  type LifecycleLicense,
} from '../lib/licenseLifecycle';
import {
  canUseOfflineGrace,
  classifyLicenseGuardError,
  validateOfflineLicenseClaims,
  type OfflineLicenseClaims,
} from '../lib/licenseGuardErrors';
import {
  RECHECK_INTERVAL_MS,
  buildIssueLicenseTokenPayload,
  fetchDeviceInfo,
  type DeviceInfoResult,
} from '../lib/licenseGuardCheck';

// ─── Types ────────────────────────────────────────────────────
type CheckStatus = 'checking' | 'valid' | 'future' | 'expired' | 'suspended' | 'revoked' | 'missing' | 'offline_grace' | 'verification_error';

interface LicenseInfo extends LifecycleLicense {
  license_key: string;
  max_devices: number | null;
}

// ─── Constantes ───────────────────────────────────────────────
const RECHECK_MS = RECHECK_INTERVAL_MS; // revérification toutes les 5 minutes

async function verifyOfflineLicenseToken(targetId: string): Promise<LicenseInfo | null> {
  const token = localStorage.getItem(LS_LIC_TOKEN);
  if (!token) return null;

  try {
    const res = await invoke<{
      valid: boolean;
      reason?: string;
      claims?: OfflineLicenseClaims;
    }>('verify_license_token', { token, schoolId: targetId });

    const claims = res?.claims;
    if (!res?.valid || !claims) return null;
    if (!validateOfflineLicenseClaims(claims, targetId).valid) return null;
    if (
      typeof claims.sub !== 'string' ||
      typeof claims.license_key !== 'string' ||
      typeof claims.status !== 'string' ||
      typeof claims.school_id !== 'string'
    ) {
      return null;
    }

    return {
      id: claims.sub,
      school_id: claims.school_id,
      license_key: claims.license_key,
      status: claims.status,
      expires_at: typeof claims.expires_at === 'string' ? claims.expires_at : null,
      starts_at: typeof claims.starts_at === 'string' ? claims.starts_at : null,
      is_current: claims.is_current === true,
      max_devices: null,
    };
  } catch (_) {
    return null;
  }
}

// ─── Helpers UI ───────────────────────────────────────────────
const STATUS_CFG: Record<CheckStatus, { icon: typeof ShieldOff; title: string; desc: string; color: string; bg: string; border: string }> = {
  checking: { icon: RefreshCw, title: 'Vérification…', desc: 'Contrôle de votre licence en cours.', color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
  valid: { icon: CheckCircle, title: 'Licence valide', desc: 'Votre licence est active.', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  future: { icon: Clock, title: 'Licence non encore active', desc: 'La date de début de votre licence n’est pas encore atteinte.', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  expired: { icon: Clock, title: 'Licence expirée', desc: 'Votre licence a expiré. Contactez votre administrateur.', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  suspended: { icon: AlertTriangle, 'title': 'Licence suspendue', desc: 'Votre licence est suspendue. Contactez votre administrateur.', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  revoked: { icon: Ban, title: 'Licence révoquée', desc: 'Votre licence a été révoquée. Contactez votre administrateur.', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  missing: { icon: ShieldOff, title: 'Aucune licence', desc: "Aucune licence trouvée pour cet établissement. Activez votre clé.", color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
  offline_grace: { icon: RefreshCw, title: 'Mode hors-ligne', desc: 'Licence non vérifiable (réseau indisponible). Accès temporaire accordé.', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  verification_error: { icon: AlertTriangle, title: 'Vérification impossible', desc: 'La vérification de la licence a échoué. Vérifiez votre appareil ou réessayez.', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
};

// ─── Composant ────────────────────────────────────────────────
export default function LicenseGuard({ children }: { children: React.ReactNode }) {
  const {
    roles, rolesLoaded, authError, user, schoolId, signOut,
    markLicenseActivated, clearLicenseActivated,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isSuperAdmin = shouldBypassLicenseGate(rolesLoaded, roles);

  // Page de renouvellement de licence (onglet « Licence » de la page Sécurité)
  const onLicensePage = location.pathname === '/security';

  const [checkStatus, setCheckStatus] = useState<CheckStatus>('checking');
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [verificationError, setVerificationError] = useState<string>('');
  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [activationSuccess, setActivationSuccess] = useState('');
  const [showActivation, setShowActivation] = useState(false);

  // ── Vérification ────────────────────────────────────────────
  const checkLicense = useCallback(async () => {
    // Le SUPER_ADMIN ne fait jamais de vérification de licence.
    // En cas d'erreur de chargement des rôles, aucun appel n'est effectué non plus.
    if (!user || isSuperAdmin || authError) return;

    setCheckStatus('checking');
    setVerificationError('');

    // Déterminer le school_id réel (accessible aussi en catch)
    let targetId = schoolId;
    if (!targetId || targetId === 'school-1') {
      const metaSchoolId = (user?.user_metadata as any)?.school_id;
      if (metaSchoolId) targetId = metaSchoolId;
    }

    try {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('school_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (prof?.school_id) targetId = prof.school_id;
      } catch (_) { }

      // Interroger Supabase via le client anon (RLS appliqué).
      // L'historique est chargé pour affichage, mais la décision ne porte
      // QUE sur la licence courante (is_current = true).
      const { data: lics, error } = await supabase
        .from('licenses')
        .select('id, school_id, license_key, status, starts_at, expires_at, max_devices, is_current')
        .eq('school_id', targetId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const now = new Date();
      const cloudLics: LicenseInfo[] = (lics ?? []) as LicenseInfo[];
      const currentRecord = findCurrentRecord(cloudLics, targetId);
      const verdict = classifyLicense(currentRecord, targetId, now);

      if (verdict === 'valid' && currentRecord) {
        const validCloud = currentRecord;

        // [LIC-02] Récupérer impérativement l'identifiant réel de la machine avant toute émission.
        let deviceInfo: DeviceInfoResult;
        try {
          deviceInfo = await fetchDeviceInfo(invoke);
        } catch (devErr: any) {
          setLicenseInfo(validCloud);
          setVerificationError(devErr?.message || 'Identifiant machine indisponible : vérification de la licence impossible.');
          setCheckStatus('verification_error');
          return;
        }

        // [LIC-01C / LIC-02] Obtenir un jeton signé RS256 et le valider impérativement via Rust
        let tokenVerified = false;
        let tokenFailureAllowedOffline = false;
        let tokenFailureMessage = '';
        let issuedToken: string | null = null;
        try {
          const payload = buildIssueLicenseTokenPayload({
            licenseId: validCloud.id,
            schoolId: targetId,
            deviceInfo,
          });
          const { data: tokenRes, error: tokenErr } = await supabase.functions.invoke('issue-license-token', {
            body: payload,
          });
          if (tokenErr) {
            const classified = classifyLicenseGuardError(tokenErr, 'edge');
            tokenFailureAllowedOffline = classified.offlineAllowed;
            tokenFailureMessage = classified.message;
            console.warn('[LicenseGuard] Émission du jeton refusée:', classified.category);
          } else if (tokenRes?.token) {
            const verifyRes = await invoke<{
              valid: boolean;
              reason?: string;
              claims?: OfflineLicenseClaims;
            }>('verify_license_token', {
              token: tokenRes.token,
              schoolId: targetId,
            });
            if (
              verifyRes.valid &&
              verifyRes.claims &&
              validateOfflineLicenseClaims(verifyRes.claims, targetId).valid &&
              verifyRes.claims.device_identifier === deviceInfo.identifier
            ) {
              issuedToken = tokenRes.token;
              tokenVerified = true;
            } else {
              tokenFailureMessage =
                verifyRes?.reason ||
                (verifyRes?.claims?.device_identifier !== deviceInfo.identifier
                  ? 'Le jeton reçu ne correspond pas à cet appareil.'
                  : 'Jeton de licence rejeté par le module de sécurité local.');
              console.warn('[LicenseGuard] Jeton émis rejeté:', tokenFailureMessage);
            }
          } else {
            tokenFailureMessage = "Le serveur d'émission n'a renvoyé aucun jeton de licence.";
          }
        } catch (tokenEx) {
          const classified = classifyLicenseGuardError(tokenEx, 'native');
          tokenFailureAllowedOffline = classified.offlineAllowed;
          tokenFailureMessage = classified.message;
          console.warn('[LicenseGuard] Échec de vérification du jeton émis:', classified.category);
        }

        // Seule une indisponibilité réseau peut être compensée par un jeton hors ligne.
        if (!tokenVerified && tokenFailureAllowedOffline) {
          const offlineLicense = await verifyOfflineLicenseToken(targetId);
          if (offlineLicense) {
            setLicenseInfo(offlineLicense);
            setCheckStatus('offline_grace');
            return;
          }
        }

        if (!tokenVerified || !issuedToken) {
          // Ne jamais supprimer injustement une licence pourtant valide en cas d'erreur technique.
          setLicenseInfo(validCloud);
          setVerificationError(tokenFailureMessage || 'Échec de vérification du jeton de licence.');
          setCheckStatus('verification_error');
          return;
        }

        try {
          await invoke('save_license', {
            token: issuedToken,
            license: { ...validCloud, is_current: true }
          });

          localStorage.setItem(LS_LIC_TOKEN, issuedToken);
          setLicenseInfo(validCloud);
          setCheckStatus('valid');
          return;
        } catch (error: any) {
          console.error(
            '[LicenseGuard] Échec de persistance SQLite:',
            error
          );
          setVerificationError(
            `Impossible d'enregistrer la licence localement : ${
              error?.message || String(error)
            }`
          );
          setCheckStatus('verification_error');
          return;
        }
      }

      if (currentRecord) {
        setLicenseInfo(currentRecord);
        // Réponse cloud sans licence courante valide : purger le token hors ligne.
        localStorage.removeItem(LS_LIC_TOKEN);
        if (verdict === 'suspended') { setCheckStatus('suspended'); return; }
        if (verdict === 'revoked') { setCheckStatus('revoked'); return; }
        if (verdict === 'expired') { setCheckStatus('expired'); return; }
        if (verdict === 'future') { setCheckStatus('future'); return; }
        setCheckStatus('missing');
        return;
      }

      // Aucune licence courante : l'historique (même ACTIVE) ne sert jamais de repli.
      localStorage.removeItem(LS_LIC_TOKEN);
      setCheckStatus('missing');

    } catch (err) {
      const classified = classifyLicenseGuardError(err, 'database');
      console.warn('[LicenseGuard] Vérification licence refusée:', classified.category, classified.message);

      // Seule une véritable indisponibilité réseau peut ouvrir la grâce hors ligne.
      if (!canUseOfflineGrace(classified.category)) {
        setVerificationError(classified.message);
        setCheckStatus('verification_error');
        return;
      }

      // [LIC-01B] Réseau inaccessible → validation obligatoire par token RS256 vérifié côté Rust.
      const offlineLicense = await verifyOfflineLicenseToken(targetId);
      if (offlineLicense) {
        setLicenseInfo(offlineLicense);
        setCheckStatus('offline_grace');
        return;
      }
      setCheckStatus('missing');
    }
  }, [user, schoolId, isSuperAdmin, authError]);

  useEffect(() => {
    // Le SUPER_ADMIN contourne intégralement
    if (!rolesLoaded || isSuperAdmin || authError) return;
    checkLicense();
    const timer = setInterval(checkLicense, RECHECK_MS);
    return () => clearInterval(timer);
  }, [rolesLoaded, isSuperAdmin, authError, checkLicense]);

  // Re-vérifier dès qu'une licence est activée/renouvelée depuis la page Licence
  useEffect(() => {
    if (!rolesLoaded || isSuperAdmin || authError) return;
    const handler = () => checkLicense();
    window.addEventListener('orion:license-updated', handler);
    return () => window.removeEventListener('orion:license-updated', handler);
  }, [rolesLoaded, isSuperAdmin, authError, checkLicense]);

  // Licence expirée ou absente → diriger l'utilisateur vers la page de licence
  useEffect(() => {
    if (!rolesLoaded || isSuperAdmin || authError) return;
    if (!['expired', 'missing', 'future', 'suspended', 'revoked'].includes(checkStatus)) return;
    if (onLicensePage) return;
    navigate('/security?tab=licence', { replace: true });
  }, [rolesLoaded, isSuperAdmin, authError, checkStatus, onLicensePage, navigate]);

  // La validation indépendante de LicenseGuard révoque l'état d'activation
  // persistant dès que la licence n'est plus valide.
  useEffect(() => {
    if (!rolesLoaded || isSuperAdmin || authError) return;
    if (['expired', 'suspended', 'revoked', 'missing', 'future'].includes(checkStatus)) {
      clearLicenseActivated();
    }
    // `clearLicenseActivated` est intentionnellement omis : son identité change
    // à chaque rendu et pourrait révoquer l'activation fraîchement réussie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesLoaded, isSuperAdmin, authError, checkStatus]);

  // ── Attendre le chargement des rôles ────────────────────────────
  if (!rolesLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <RefreshCw size={26} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  // ── Erreur de vérification des permissions : tout est bloqué ───
  if (authError) {
    return <AuthErrorScreen message={authError} />;
  }

  // ── Bypass total Super Admin : aucune requête ni page de licence ──
  if (isSuperAdmin) {
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
    if (isSuperAdmin || authError) return;
    const cleanKey = normalizeLicenseKey(activationKey);
    if (!cleanKey) return;
    setActivating(true);
    setActivationError('');
    setActivationSuccess('');

    try {
      // Déterminer le school_id effectif
      let effectiveId = schoolId;
      if (!effectiveId || effectiveId === 'school-1') {
        const metaSchoolId = (user?.user_metadata as any)?.school_id;
        if (metaSchoolId) effectiveId = metaSchoolId;
      }
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('school_id')
          .eq('user_id', user?.id)
          .maybeSingle();
        if (prof?.school_id) effectiveId = prof.school_id;
      } catch (_) { }

      if (!effectiveId || effectiveId === 'school-1') {
        throw new Error("Impossible d'identifier l'établissement rattaché à ce compte. Veuillez contacter l'administrateur.");
      }

      // [LIC-01] Parcours d'activation unifié et sécurisé :
      // - Aucun UPDATE direct sur la table licenses
      // - Contrôle strict de l'appartenance à l'établissement (school_id)
      // - Statut ACTIVE obligatoire, rejet des clés suspendues/expirées/révoquées
      // - Jeton JWT RS256 émis par l'Edge Function et validé par Rust
      const res = await activateSchoolLicense({
        licenseKey: cleanKey,
        schoolId: effectiveId,
      });
      if (!markLicenseActivated(res)) {
        throw new Error("La licence n'a pas pu être enregistrée comme activée. Réessayez.");
      }

      setLicenseInfo(res.license as LicenseInfo);
      setActivationSuccess('Licence vérifiée et activée avec succès !');
      setActivationKey('');
      setTimeout(() => {
        setShowActivation(false);
        setActivationSuccess('');
        setCheckStatus('valid');
      }, 1200);
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
              <p className="text-sm text-slate-500 mt-1 max-w-xs leading-relaxed">
                {checkStatus === 'verification_error' && verificationError ? verificationError : cfg.desc}
              </p>
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
