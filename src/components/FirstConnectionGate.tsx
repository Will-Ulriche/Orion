import { useCallback, useEffect, useState } from 'react';
import {
  KeyRound, ShieldCheck, AlertTriangle, Key, Loader2,
  CheckCircle2, RefreshCw, Globe, LogIn,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { invoke } from '@tauri-apps/api/core';

const LS_ONBOARDED = 'orion_lic_onboarded';
const LS_LAST_OK   = 'orion_lic_ok_at';
const LS_CACHED    = 'orion_lic_cache';

function normalizeLicenseKey(input: string): string {
  let cleaned = input.trim().toUpperCase().replace(/[\s_]+/g, '-');
  if (!cleaned.startsWith('ORION-') && cleaned.replace(/-/g, '').length === 12) {
    const raw = cleaned.replace(/-/g, '');
    cleaned = `ORION-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  }
  return cleaned;
}

type GateState = 'checking' | 'ready' | 'need-key' | 'offline-error';

/** Valide (online) la clé saisie à la première connexion puis verrouille l'école. */
export default function FirstConnectionGate({ children }: { children: React.ReactNode }) {
  const { roles, rolesLoaded, user, schoolId, signOut } = useAuth();

  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem(LS_ONBOARDED) === '1'
  );
  const [state, setState] = useState<GateState>('checking');
  const [helperText, setHelperText] = useState('');
  const [retryTick, setRetryTick] = useState(0);

  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [activationSuccess, setActivationSuccess] = useState('');

  const markOnboarded = () => {
    localStorage.setItem(LS_ONBOARDED, '1');
    setOnboarded(true);
    setState('ready');
  };

  const resolveSchoolId = useCallback(async (fallback: string): Promise<string> => {
    if (fallback && fallback !== 'school-1') return fallback;
    const meta = (user?.user_metadata as any)?.school_id;
    if (meta) return meta;
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('school_id')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (prof?.school_id) return prof.school_id;
    } catch (_) {}
    return fallback;
  }, [user]);

  /** Explore la disponibilité du réseau (requis pour valider la clé à la 1ère connexion). */
  const probeOnline = useCallback(async (): Promise<boolean> => {
    try {
      // Requête minimale : si elle répond (même vide), le réseau est joignable.
      const { error } = await supabase
        .from('licenses')
        .select('id')
        .limit(1);
      if (error) throw error;
      return true;
    } catch (_) {
      return false;
    }
  }, []);

  // ── Déclenchement du garde ─────────────────────────────────────
  useEffect(() => {
    if (!rolesLoaded) return;
    setState('checking');

    // Le SUPER_ADMIN et les traitements déjà effectués passent directement.
    if (roles.includes('SUPER_ADMIN') || onboarded) {
      setState('ready');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await resolveSchoolId(schoolId);
        const online = await probeOnline();
        if (cancelled) return;
        if (online) {
          setHelperText('Saisissez la clé de licence fournie par votre administrateur pour déverrouiller l\'application.');
          setState('need-key');
        } else {
          setHelperText('Impossible de joindre le serveur de licence. Une connexion internet est requise lors de la toute première connexion.');
          setState('offline-error');
        }
      } catch (_) {
        if (cancelled) return;
        setHelperText('Impossible de vérifier la licence. Une connexion internet est requise lors de la toute première connexion.');
        setState('offline-error');
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesLoaded, roles, schoolId, onboarded, retryTick]);

  // ── Activation de la clé ───────────────────────────────────────
  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = normalizeLicenseKey(activationKey);
    if (!cleanKey) return;
    setActivating(true);
    setActivationError('');
    setActivationSuccess('');

    try {
      let targetId = schoolId;
      const meta = (user?.user_metadata as any)?.school_id;
      if ((!targetId || targetId === 'school-1') && meta) targetId = meta;
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('school_id')
          .eq('user_id', user?.id)
          .maybeSingle();
        if (prof?.school_id) targetId = prof.school_id;
      } catch (_) {}

      const { data: lic, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', cleanKey)
        .maybeSingle();
      if (error || !lic) throw new Error('Clé de licence invalide ou introuvable.');
      if (lic.status === 'REVOKED') throw new Error('Cette clé a été révoquée.');
      if (lic.status === 'SUSPENDED') throw new Error('Cette clé est suspendue.');
      if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
        throw new Error('Cette clé est expirée.');
      }
      if (lic.school_id && lic.school_id !== 'unassigned' && lic.school_id !== targetId) {
        throw new Error('Cette clé est déjà attribuée à un autre établissement.');
      }

      if (!lic.school_id || lic.school_id === 'unassigned') {
        await supabase
          .from('licenses')
          .update({ school_id: targetId, status: 'ACTIVE' })
          .eq('id', lic.id);
        lic.school_id = targetId;
      }

      localStorage.setItem(LS_LAST_OK, Date.now().toString());
      localStorage.setItem(LS_CACHED, JSON.stringify(lic));
      try { await invoke('save_license', { license: lic }); } catch (_) {}

      setActivationSuccess('Licence activée avec succès ! Ouverture de votre espace…');
      setActivationKey('');
      window.dispatchEvent(new Event('orion:license-updated'));
      setTimeout(markOnboarded, 900);
    } catch (err: any) {
      setActivationError(err.message || 'Échec de vérification de la licence.');
    } finally {
      setActivating(false);
    }
  };

  // ── Ne bloque pas : SUPER_ADMIN, session déjà activée ──────────
  if (!rolesLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={26} className="animate-spin text-indigo-500" />
      </div>
    );
  }
  if (state === 'ready') return <>{children}</>;

  const isBlocked = state === 'need-key' || state === 'offline-error';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

          {/* En-tête */}
          <div className="px-8 py-8 bg-gradient-to-br from-indigo-950 via-slate-900 to-[#1e1b4b] flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 border-2 border-white/15 flex items-center justify-center shadow-sm">
              <KeyRound size={28} className="text-indigo-300" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-white">Bienvenue sur Orion</h1>
              <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                Dernière étape de la première connexion : activez votre licence.
              </p>
            </div>
          </div>

          {state === 'checking' && (
            <div className="px-6 py-10 flex flex-col items-center gap-3 text-slate-400">
              <Loader2 size={24} className="animate-spin text-indigo-500" />
              <p className="text-sm font-medium">Vérification de votre licence…</p>
            </div>
          )}

          {isBlocked && (
            <div className="px-6 py-6">
              <div className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-[12.5px] ${
                state === 'offline-error'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}>
                {state === 'offline-error'
                  ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                  : <ShieldCheck size={15} className="mt-0.5 shrink-0 text-indigo-500" />}
                <span>{helperText}</span>
              </div>

              {state === 'need-key' && (
                <>
                  <form onSubmit={handleActivate} className="space-y-3">
                    <div>
                      <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                        Clé de licence Orion
                      </label>
                      <input
                        type="text"
                        value={activationKey}
                        onChange={(e) => setActivationKey(e.target.value.toUpperCase())}
                        placeholder="ORION-XXXX-XXXX-XXXX"
                        className="w-full px-3.5 py-3 font-mono text-sm tracking-widest rounded-xl border border-slate-200 bg-white uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        required
                        disabled={activating}
                      />
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Format : ORION-XXXX-XXXX-XXXX — fournie par votre administrateur Orion.
                      </p>
                    </div>

                    {activationError && (
                      <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>{activationError}</span>
                      </div>
                    )}
                    {activationSuccess && (
                      <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                        <span>{activationSuccess}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={activating || activationKey.trim().length === 0}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                    >
                      {activating ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          Activation en cours…
                        </>
                      ) : (
                        <>
                          <Key size={15} />
                          Valider la licence
                        </>
                      )}
                    </button>
                  </form>

                  <div className="mt-4 flex items-center gap-2 justify-center text-[11px] text-slate-400">
                    <Globe size={12} />
                    Une connexion internet est requise pour valider votre clé la première fois.
                  </div>
                </>
              )}

              {state === 'offline-error' && (
                <button
                  onClick={() => setRetryTick((t) => t + 1)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm mt-2"
                >
                  <RefreshCw size={14} />
                  Réessayer
                </button>
              )}

              <button
                onClick={async () => { await signOut(); }}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors"
              >
                <LogIn size={14} />
                Se connecter avec un autre compte
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Contactez Orion services pour obtenir ou renouveler votre licence.
        </p>
      </div>
    </div>
  );
}