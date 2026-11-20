import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { invoke } from '@tauri-apps/api/core';
import { verifyCloudAccount, verifyCloudSchool } from '../lib/accountValidation';
import {
  LS_ONLINE_CONFIGURED,
  applyLicenseActivation,
  canRestoreOfflineSession,
  clearLicenseActivation as clearStoredLicenseActivation,
  readLicenseFlowState,
} from '../lib/licenseFlow';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roles: string[];
  rolesLoaded: boolean;
  authError: string | null;
  schoolId: string;
  /** Id de l'�tablissement ouvert en mode "direction" depuis l'espace SUPER_ADMIN. */
  forcedSchoolId: string | null;
  /** Nom affich� de l'�tablissement ouvert en mode "direction". */
  forcedSchoolName: string | null;
  /** Vrai quand le SUPER_ADMIN visite l'espace d'un �tablissement. */
  inSchoolMode: boolean;
  /** Ouvre l'espace direction d'un �tablissement (mode visite / impersonation). */
  enterSchoolMode: (schoolId: string, schoolName?: string | null) => void;
  /** Quitte l'espace direction et revient � l'�tablissement d'origine. */
  exitSchoolMode: () => void;
  /** Compte Supabase en ligne configuré (indépendant de la licence). */
  onlineConfigured: boolean;
  /** Licence validée à distance ET persistée dans SQLite. */
  licenseActivated: boolean;
  /** Ne marque l'installation activée qu'après une activation effective réussie. */
  markLicenseActivated: (result: unknown) => boolean;
  /** Révoque l'activation effective (licence absente/expirée/suspendue/révoquée). */
  clearLicenseActivated: () => void;
  signOut: () => Promise<void>;
  setOfflineSession: (userId: string, email: string, sessionToken: string, schoolId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const getCurrentSchoolId = (): string => {
  const stored = localStorage.getItem('current_school_id');
  return stored || '';
};

interface RestoredLoginProfile {
  user_id: string;
  email: string;
  school_id: string;
  session_token: string;
  session_expires_at: number;
}

const LS_SCHOOL_ID = 'current_school_id';
const LS_FORCED_ID = 'orion_forced_school_id';
const LS_FORCED_NAME = 'orion_forced_school_name';
const LS_PREV_ID = 'orion_prev_school_id';
const OFFLINE_BLOCKED_MSG =
  'Licence non activée : utilisez la connexion Supabase en ligne pour activer Orion.';
/** �v�nement �mis quand l'�tablissement courant change. */
export const SCHOOL_CHANGED_EVENT = 'orion:school-changed';

/**
 * Résout de façon fiable les rôles d'un utilisateur connecté en ligne via Supabase.
 * Ne se fie JAMAIS à user_metadata.role.
 * En cas d'erreur de chargement ou réseau, bloque les privilèges et retourne une erreur explicite sans attribuer de rôle.
 */
export async function resolveUserRolesOnline(
  supabaseClient: any,
  userId: string
): Promise<{ roles: string[]; error: string | null }> {
  try {
    const { data, error } = await supabaseClient
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', userId);

    if (error) {
      return {
        roles: [],
        error: `Erreur serveur lors de la vérification des permissions : ${error.message || String(error)}`,
      };
    }

    const candidates: unknown[] = [];
    for (const r of (data ?? []) as any[]) {
      const embedded = r?.roles;
      if (Array.isArray(embedded)) {
        candidates.push(...embedded.map((role: any) => role?.name));
      } else {
        candidates.push(embedded?.name);
      }
    }
    const roleNames = Array.from(new Set(
      candidates
        .filter((n: unknown): n is string => typeof n === 'string' && n.trim().length > 0)
        .map((n: string) => n.trim())
    ));

    if (roleNames.length === 0) {
      return {
        roles: [],
        error: "Aucun rôle valide n'a pu être vérifié pour ce compte. Privilèges bloqués.",
      };
    }

    return { roles: roleNames, error: null };
  } catch (err: any) {
    return {
      roles: [],
      error: `Erreur réseau ou connexion impossible : ${err?.message || String(err)}`,
    };
  }
}

/**
 * Résout de façon fiable les rôles en mode hors-ligne depuis la base SQLite locale.
 * Ne se fie JAMAIS à des valeurs par défaut (aucun fallback DIRECTION automatique).
 */
export async function resolveUserRolesOffline(
  invokeFn: <T = any>(cmd: string, args?: any) => Promise<T>,
  userId: string,
  schoolId: string
): Promise<{ roles: string[]; error: string | null }> {
  try {
    const userRoles = await invokeFn<string[]>('get_current_user_roles', { userId, schoolId });
    if (Array.isArray(userRoles) && userRoles.length > 0) {
      return { roles: userRoles, error: null };
    }
    return {
      roles: [],
      error: "Aucun rôle enregistré localement pour cet utilisateur. Privilèges bloqués.",
    };
  } catch (err: any) {
    return {
      roles: [],
      error: `Erreur lors de la lecture des permissions locales : ${err?.message || String(err)}`,
    };
  }
}

/**
 * Détermine si un utilisateur doit contourner intégralement les contrôles de licence.
 * Le rôle SUPER_ADMIN contourne intégralement FirstConnectionGate et LicenseGuard,
 * sans aucune page ou requête de vérification de licence.
 */
export function shouldBypassLicenseGate(rolesLoaded: boolean, roles: string[]): boolean {
  return rolesLoaded && Array.isArray(roles) && roles.includes('SUPER_ADMIN');
}

/**
 * Écran de blocage affiché lorsque la vérification des rôles a échoué.
 * Aucun rôle n'est attribué dans ce cas : les privilèges restent bloqués.
 */
export function AuthErrorScreen({ message }: { message: string }) {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-red-700">Impossible de vérifier vos permissions</h1>
        <p role="alert" className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
        <p className="mt-3 text-xs text-slate-500">Aucun rôle n'a été attribué. L'accès reste bloqué.</p>
        <button
          type="button"
          onClick={() => { void signOut(); }}
          className="mt-6 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900"
        >
          Se connecter avec un autre compte
        </button>
      </div>
    </div>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  // �tablissement courant � r�actif : mis � jour par enterSchoolMode/exitSchoolMode
  // et par l'�v�nement global SCHOOL_CHANGED_EVENT.
  const [schoolId, setSchoolId] = useState<string>(() => getCurrentSchoolId());
  const [forcedSchoolId, setForcedSchoolId] = useState<string | null>(
    () => localStorage.getItem(LS_FORCED_ID)
  );
  const [forcedSchoolName, setForcedSchoolName] = useState<string | null>(
    () => localStorage.getItem(LS_FORCED_NAME)
  );
  // Deux états strictement distincts :
  // - onlineConfigured : un compte Supabase a été utilisé (simple configuration).
  // - licenseActivated : licence validée puis persistée dans SQLite (preuve d'activation).
  // Aucun succès d'authentification ne doit positionner licenseActivated.
  const [onlineConfigured, setOnlineConfigured] = useState(
    () => readLicenseFlowState(localStorage).onlineConfigured
  );
  const [licenseActivated, setLicenseActivated] = useState(
    () => readLicenseFlowState(localStorage).licenseActivated
  );

  const markOnlineConfigured = () => {
    localStorage.setItem(LS_ONLINE_CONFIGURED, '1');
    setOnlineConfigured(true);
  };

  const markLicenseActivated = (result: unknown) => {
    const persisted = applyLicenseActivation(localStorage, result);
    if (persisted) {
      setLicenseActivated(true);
      setOnlineConfigured(true);
    }
    return persisted;
  };

  const clearLicenseActivated = () => {
    clearStoredLicenseActivation(localStorage);
    setLicenseActivated(false);
  };

  // Relit le localStorage et propage le nouvel �tablissement dans le contexte
  // (d�clenche le rechargement des ann�es, des pages, du menu�).
  const syncSchoolFromStorage = () => {
    setSchoolId(getCurrentSchoolId());
    setForcedSchoolId(localStorage.getItem(LS_FORCED_ID));
    setForcedSchoolName(localStorage.getItem(LS_FORCED_NAME));
  };

  useEffect(() => {
    const handler = () => syncSchoolFromStorage();
    window.addEventListener(SCHOOL_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SCHOOL_CHANGED_EVENT, handler);
  }, []);

  // R�voque le jeton de restauration avant de supprimer la session locale.
  const revokeStoredOfflineToken = async () => {
    const raw = localStorage.getItem('orion_offline_session');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.token) {
        await invoke('revoke_local_session', { token: parsed.token });
      }
    } catch (_) { /* session locale d�j� invalide */ }
    localStorage.removeItem('orion_offline_session');
  };

  // Ouvre l'espace direction d'un �tablissement (le SUPER_ADMIN "devient" la direction).
  const enterSchoolMode = (nextSchoolId: string, nextSchoolName?: string | null) => {
    try {
      const current = getCurrentSchoolId();
      if (current !== nextSchoolId) {
        // On m�morise l'�tablissement d'origine pour pouvoir y revenir.
        localStorage.setItem(LS_PREV_ID, current);
      }
      localStorage.setItem(LS_SCHOOL_ID, nextSchoolId);
      localStorage.setItem(LS_FORCED_ID, nextSchoolId);
      if (nextSchoolName) {
        localStorage.setItem(LS_FORCED_NAME, nextSchoolName);
      } else {
        localStorage.removeItem(LS_FORCED_NAME);
      }
    } catch (_) { /* storage indisponible */ }
    syncSchoolFromStorage();
    window.dispatchEvent(new Event(SCHOOL_CHANGED_EVENT));
  };

  // Quitte l'espace direction : on revient � l'�tablissement d'origine.
  const exitSchoolMode = () => {
    try {
      const prev = localStorage.getItem(LS_PREV_ID);
      localStorage.removeItem(LS_FORCED_ID);
      localStorage.removeItem(LS_FORCED_NAME);
      localStorage.removeItem(LS_PREV_ID);
      if (prev) localStorage.setItem(LS_SCHOOL_ID, prev);
    } catch (_) { /* storage indisponible */ }
    syncSchoolFromStorage();
    window.dispatchEvent(new Event(SCHOOL_CHANGED_EVENT));
  };

  const fetchUserRoles = async (userId: string, schoolId: string) => {
    const res = await resolveUserRolesOffline(invoke, userId, schoolId);
    setRoles(res.roles);
    setRolesLoaded(true);
    setAuthError(res.error);
    return res;
  };

  const syncUserToLocalDb = async (userSession: Session | null) => {
    if (userSession?.user) {
      const userMeta = (userSession.user.user_metadata as any) || {};
      let schoolId = userMeta.school_id || localStorage.getItem('current_school_id') || '';
      let schoolName = 'Établissement';
      let firstName: string = userMeta.first_name || '';
      let lastName: string = userMeta.last_name || '';
      let staffId: string | null = null;
      let school: any = null;

      try {
        // Déterminer les rôles effectifs de façon fiable (jamais de user_metadata.role ni de fallback DIRECTION)
        let effectiveRoles: string[] = [];
        if (userSession.access_token !== 'offline') {
          const roleRes = await resolveUserRolesOnline(supabase, userSession.user.id);
          if (roleRes.error || roleRes.roles.length === 0) {
            setRoles([]);
            setRolesLoaded(true);
            setAuthError(roleRes.error || "Aucun rôle valide attribué à ce compte. Privilèges bloqués.");
            return;
          }
          effectiveRoles = roleRes.roles;
        } else {
          const offlineRes = await resolveUserRolesOffline(invoke, userSession.user.id, schoolId || 'school-main');
          if (offlineRes.error || offlineRes.roles.length === 0) {
            setRoles([]);
            setRolesLoaded(true);
            setAuthError(offlineRes.error || "Aucun rôle enregistré localement. Privilèges bloqués.");
            return;
          }
          effectiveRoles = offlineRes.roles;
        }

        // Si connecté en ligne, tenter de récupérer l'établissement et profil cloud.
        if (userSession.access_token !== 'offline') {
          try {
            const { data: prof } = await supabase
              .from('profiles')
              .select('school_id, first_name, last_name, staff_id')
              .eq('user_id', userSession.user.id)
              .limit(1)
              .maybeSingle();
            if (prof) {
              if ((prof as any)?.first_name) firstName = (prof as any).first_name;
              if ((prof as any)?.last_name) lastName = (prof as any).last_name;
              if ((prof as any)?.school_id) schoolId = (prof as any).school_id;
              if ((prof as any)?.staff_id) staffId = (prof as any).staff_id;
            }
          } catch (profileErr) {
            console.warn('Erreur profil cloud:', profileErr);
          }

          if (schoolId) {
            try {
              const { data: sch } = await supabase
                .from('schools')
                .select('name, short_name, address, city, country, phone_primary, phone_secondary, email, website, currency, timezone, logo_url')
                .eq('id', schoolId)
                .maybeSingle();
              if (sch) {
                school = sch;
                if ((sch as any).name) schoolName = (sch as any).name;
              }
            } catch (schoolErr) {
              console.warn('Erreur lecture établissement cloud:', schoolErr);
            }
          }
        }

        if (schoolId) {
          localStorage.setItem('current_school_id', schoolId);
          setSchoolId(schoolId);
        }

        // Synchroniser l'utilisateur localement
        await invoke('sync_local_user', {
          userId: userSession.user.id,
          email: userSession.user.email || '',
          schoolId: schoolId || 'school-main',
          schoolName,
          firstName,
          lastName,
          staffId,
          roleName: effectiveRoles[0] ?? null,
          shortName: school?.short_name ?? null,
          address: school?.address ?? null,
          city: school?.city ?? null,
          country: school?.country ?? null,
          phonePrimary: school?.phone_primary ?? null,
          phoneSecondary: school?.phone_secondary ?? null,
          schoolEmail: school?.email ?? null,
          website: school?.website ?? null,
          currency: school?.currency ?? null,
          timezone: school?.timezone ?? null,
          logoUrl: school?.logo_url ?? null,
        });

        // Établir la session locale authentifiée côté backend Rust via Supabase Auth & RLS
        // SEC-VERIFY3-05 : un échec est bloquant — déconnexion forcée, l'UI ne progresse pas.
        if (userSession.access_token && userSession.access_token !== 'offline') {
          try {
            await invoke('establish_online_session', {
              token: userSession.access_token,
              schoolId: schoolId || null,
            });
          } catch (tokErr) {
            console.error('Erreur establish_online_session — déconnexion forcée:', tokErr);
            await supabase.auth.signOut().catch(() => { });
            setSession(null);
            setUser(null);
            setRoles([]);
            setRolesLoaded(true);
            setLoading(false);
            setAuthError("Échec de vérification de session avec le module de sécurité.");
            return;
          }
        }

        // Si le rôle est SUPER_ADMIN, tenter l'amorçage initial sécurisé
        // (requis lors de la première installation sur une base vierge)
        if (effectiveRoles.includes('SUPER_ADMIN') && userSession.access_token && userSession.access_token !== 'offline') {
          try {
            await invoke('bootstrap_initial_super_admin', {
              token: userSession.access_token,
              schoolId: schoolId || 'school-main',
            });
          } catch (bErr) {
            console.debug('Amorçage initial SUPER_ADMIN:', bErr);
          }
        }

        // Rapatrier les rôles vers SQLite local
        for (const roleName of effectiveRoles) {
          try {
            await invoke('set_local_user_role', {
              userId: userSession.user.id,
              schoolId: schoolId || 'school-main',
              roleName,
            });
          } catch (rErr) {
            console.warn('Erreur set_local_user_role:', rErr);
          }
        }

        // Succès Supabase Auth = compte en ligne configuré, PAS licence activée.
        markOnlineConfigured();
        setRoles(effectiveRoles);
        setRolesLoaded(true);
        setAuthError(null);
      } catch (err: any) {
        console.error("Erreur de synchronisation locale de l'utilisateur:", err);
        setRoles([]);
        setRolesLoaded(true);
        setAuthError(err?.message || "Erreur de chargement des privilèges.");
      }
    }
  };

  useEffect(() => {
    // V�rifier s'il y a une session hors-ligne sauvegard�e
    const localOfflineStr = localStorage.getItem('orion_offline_session');

    // R�cup�rer la session actuelle Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        setUser(session.user ?? null);
        syncUserToLocalDb(session);
        void revokeStoredOfflineToken(); // Nettoyer si on est connect� en ligne
      } else if (localOfflineStr) {
        try {
          const parsed = JSON.parse(localOfflineStr);
          if (!parsed || typeof parsed.token !== 'string' || !parsed.token) {
            localStorage.removeItem('orion_offline_session');
            setLoading(false);
            return;
          }
          // -- V�rification de s�curit� --------------------------------------
          // Si l'�cole associ�e � la session hors-ligne n'existe plus dans la
          // base locale (supprim�e par le SUPER_ADMIN), on refuse l'acc�s.
          invoke<RestoredLoginProfile>('restore_local_session', { token: parsed.token })
            .then(async (restored) => {
              if (restored) {
                const profile = await setOfflineSessionState(
                  restored.user_id,
                  restored.email,
                  parsed.token,
                  restored.school_id
                );
                // V�rifier en arri�re-plan que le compte ET l'�tablissement
                // n'ont pas �t� supprim�s/suspendus c�t� cloud par
                // l'administration (ne bloque pas le d�marrage).
                Promise.all([
                  verifyCloudAccount(profile.user_id),
                  verifyCloudSchool(profile.school_id),
                ]).then(async ([accountState, schoolState]) => {
                  if (accountState === 'missing' || schoolState === 'missing') {
                    console.warn('[Auth] Session hors-ligne rejet�e : compte ou �tablissement supprim�.');
                    void revokeStoredOfflineToken();
                    try { await invoke('clear_local_session'); } catch (_) { }
                    localStorage.removeItem('current_school_id');
                    try { invoke('delete_local_user', { userId: profile.user_id }); } catch (_) { }
                    if (schoolState === 'missing') {
                      try { invoke('purge_local_school', { schoolId: profile.school_id }); } catch (_) { }
                    }
                    setSession(null);
                    setUser(null);
                    setRoles([]);
                    setRolesLoaded(true);
                    setAuthError('Ce compte ou cet établissement n\'est plus autorisé. Privilèges bloqués.');
                  }
                });
              } else {
                // L'�cole a �t� supprim�e ? invalider la session fant�me
                console.warn('[Auth] Session hors-ligne rejet�e : �tablissement supprim�.');
                localStorage.removeItem('orion_offline_session');
                localStorage.removeItem('current_school_id');
              }
            })
            .catch(() => {
              // Jeton absent, expire ou revoque : aucune session n'est restauree.
              localStorage.removeItem('orion_offline_session');
              localStorage.removeItem('current_school_id');
              setSession(null);
              setUser(null);
              setRoles([]);
              setRolesLoaded(true);
              setAuthError('Session hors-ligne invalide ou expirée. Privilèges bloqués.');
            })
            .finally(() => setLoading(false));
          return; // setLoading(false) g�r� dans .finally()
        } catch (e) {
          localStorage.removeItem('orion_offline_session');
        }
      }
      setLoading(false);
    });

    // �couter les changements d'�tat (connexion, d�connexion)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session);
        setUser(session.user ?? null);
        syncUserToLocalDb(session);
        void revokeStoredOfflineToken();
      } else {
        // En cas de d�connexion, v�rifier si on n'est pas en train de passer en mode offline
        // (g�r� par signOut)
        if (!localStorage.getItem('orion_offline_session')) {
          setSession(null);
          setUser(null);
          setRoles([]);
          setRolesLoaded(false);
          setAuthError(null);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setOfflineSessionState = async (
    userId: string,
    email: string,
    sessionToken: string,
    schoolId: string
  ) => {
    // Sans licence activée, une session locale empêcherait l'appel à l'Edge
    // Function d'activation : on refuse donc toute restauration locale.
    if (!canRestoreOfflineSession({
      licenseActivated: readLicenseFlowState(localStorage).licenseActivated,
    })) {
      localStorage.removeItem('orion_offline_session');
      setSession(null);
      setUser(null);
      setRoles([]);
      setRolesLoaded(true);
      setAuthError(OFFLINE_BLOCKED_MSG);
      throw new Error(OFFLINE_BLOCKED_MSG);
    }
    const restored = await invoke<RestoredLoginProfile>('restore_local_session', {
      token: sessionToken,
    });
    // En mode "visite" du SUPER_ADMIN, l'ecole ouverte reste prioritaire.
    const forcedSchool = localStorage.getItem(LS_FORCED_ID);
    const validatedSchoolId = forcedSchool || restored.school_id || schoolId;
    localStorage.setItem(LS_SCHOOL_ID, validatedSchoolId);
    setSchoolId(validatedSchoolId);

    const fakeUser = { id: restored.user_id || userId, email: restored.email || email } as User;
    const fakeSession = { access_token: 'offline', user: fakeUser } as Session;
    setSession(fakeSession);
    setUser(fakeUser);
    await fetchUserRoles(restored.user_id || userId, validatedSchoolId);
    return { ...restored, school_id: validatedSchoolId };
  }

  const setOfflineSession = (
    userId: string,
    email: string,
    sessionToken: string,
    schoolId: string
  ) => {
    if (!canRestoreOfflineSession({
      licenseActivated: readLicenseFlowState(localStorage).licenseActivated,
    })) {
      setAuthError(OFFLINE_BLOCKED_MSG);
      return;
    }
    void setOfflineSessionState(userId, email, sessionToken, schoolId).catch((err) => {
      console.error('[Auth] Restauration de session locale impossible:', err);
      localStorage.removeItem('orion_offline_session');
      setSession(null);
      setUser(null);
      setRoles([]);
      setRolesLoaded(true);
      setAuthError(`Restauration de la session locale impossible : ${err?.message || String(err)}`);
    });
    localStorage.setItem(
      'orion_offline_session',
      JSON.stringify({ id: userId, email, token: sessionToken })
    );
  };

  const signOut = async () => {
    await revokeStoredOfflineToken();
    // (ORI-SEC-003) : Invalider la session active cote Rust
    try { await invoke('clear_local_session'); } catch (_) { }
    if (session?.access_token === 'offline') {
      setSession(null);
      setUser(null);
    } else {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
    }
    // Réinitialiser les privilèges : un changement de compte ne doit jamais
    // conserver le rôle SUPER_ADMIN du compte précédent.
    setRoles([]);
    setRolesLoaded(false);
    setAuthError(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Chargement de la session...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      session, user, loading, roles, rolesLoaded, authError,
      schoolId,
      forcedSchoolId,
      forcedSchoolName,
      inSchoolMode: !!forcedSchoolId,
      enterSchoolMode,
      exitSchoolMode,
      onlineConfigured, licenseActivated, markLicenseActivated, clearLicenseActivated,
      signOut, setOfflineSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth doit �tre utilis� � l'int�rieur d'un AuthProvider");
  }
  return context;
};
