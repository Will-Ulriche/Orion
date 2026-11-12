import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { invoke } from '@tauri-apps/api/core';
import { verifyCloudAccount, verifyCloudSchool } from '../lib/accountValidation';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roles: string[];
  rolesLoaded: boolean;
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
  activated: boolean;
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
/** �v�nement �mis quand l'�tablissement courant change. */
export const SCHOOL_CHANGED_EVENT = 'orion:school-changed';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  // �tablissement courant � r�actif : mis � jour par enterSchoolMode/exitSchoolMode
  // et par l'�v�nement global SCHOOL_CHANGED_EVENT.
  const [schoolId, setSchoolId] = useState<string>(() => getCurrentSchoolId());
  const [forcedSchoolId, setForcedSchoolId] = useState<string | null>(
    () => localStorage.getItem(LS_FORCED_ID)
  );
  const [forcedSchoolName, setForcedSchoolName] = useState<string | null>(
    () => localStorage.getItem(LS_FORCED_NAME)
  );
  // [LIC-01] `activated` est un FLAG UX UNIQUEMENT � il indique si l'installation
  // a d�j� �t� activ�e pour basculer la page de login de `connexion en ligne`
  // vers `connexion locale par PIN` (App.tsx / LoginEntry).
  // Ce flag NE constitue PAS une preuve de licence valide.
  // La validation r�elle de la licence est effectu�e dans LicenseGuard via Supabase.
  const [activated, setActivated] = useState(
    () => localStorage.getItem('orion_activated') === '1'
  );

  const activate = () => {
    localStorage.setItem('orion_activated', '1');
    setActivated(true);
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

  const fetchUserRoles = async (userId: string, schoolId: string, fallbackRole?: string) => {
    try {
      const userRoles = await invoke<string[]>('get_current_user_roles', { userId, schoolId });
      const finalRoles = userRoles.length > 0 ? userRoles : (fallbackRole ? [fallbackRole] : ['DIRECTION']);
      setRoles(finalRoles);
      setRolesLoaded(true);
    } catch (err) {
      console.error("Erreur lors de la r�cup�ration des r�les:", err);
      setRoles(fallbackRole ? [fallbackRole] : ['DIRECTION']);
      setRolesLoaded(true);
    }
  };

  const syncUserToLocalDb = async (userSession: Session | null) => {
    if (userSession?.user) {
      const userMeta = (userSession.user.user_metadata as any) || {};
      let schoolId = userMeta.school_id || localStorage.getItem('current_school_id') || '';
      let schoolName = '�tablissement';
      let firstName: string = userMeta.first_name || 'Direction';
      let lastName: string = userMeta.last_name || '';
      let staffId: string | null = null;
      const metaRole: string = userMeta.role || 'DIRECTION';
      // Fiche compl�te de l'�tablissement (renseign�e par le super-administrateur
      // dans le cloud). Elle est rapatri�e localement pour que la direction
      // retrouve les informations sans les ressaisir.
      let school: any = null;

      try {
        // Si connect� en ligne, tenter de r�cup�rer l'�tablissement et profil cloud.
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
            console.warn('Erreur profil cloud (utilisation m�tadonn�es):', profileErr);
          }

          // Lecture de l'�tablissement via la cl� de service : seule la
          // super-administration dispose d'une politique RLS de lecture sur
          // `schools`, la direction ne peut donc pas le lire avec le client anon.
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
              console.warn('Erreur lecture �tablissement cloud:', schoolErr);
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
          roleName: metaRole,
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

        // D�terminer les r�les effectifs
        let effectiveRoles: string[] = [];
        if (userSession.access_token !== 'offline') {
          try {
            const { data } = await supabase
              .from('user_roles')
              .select('roles(name)')
              .eq('user_id', userSession.user.id);
            const roleNames = (data ?? [])
              .map((r: any) => r.roles?.name)
              .filter((n: unknown): n is string => typeof n === 'string');
            if (roleNames.length > 0) {
              effectiveRoles = roleNames;
            }
          } catch (roleErr) {
            console.warn('Erreur lecture user_roles cloud:', roleErr);
          }
        }

        if (effectiveRoles.length === 0 && metaRole) {
          effectiveRoles = [metaRole];
        }
        if (effectiveRoles.length === 0) {
          effectiveRoles = ['DIRECTION'];
        }

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
            await supabase.auth.signOut().catch(() => {});
            setSession(null);
            setUser(null);
            setRoles([]);
            setRolesLoaded(true);
            setLoading(false);
            return; // Interrompre syncUserToLocalDb — pas d'appel à activate()
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
            // Rejet normal si le premier super admin a déjà été amorcé
            console.debug('Amorçage initial SUPER_ADMIN:', bErr);
          }
        }

        // Rapatrier les r�les vers SQLite local
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

        activate();
        setRoles(effectiveRoles);
        setRolesLoaded(true);
        await fetchUserRoles(userSession.user.id, schoolId || 'school-main', metaRole);
      } catch (err) {
        console.error("Erreur de synchronisation locale de l'utilisateur:", err);
        // Toujours garantir que l'utilisateur a son r�le charg� pour ne pas le bloquer
        setRoles([metaRole || 'DIRECTION']);
        setRolesLoaded(true);
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
                    try { await invoke('clear_local_session'); } catch (_) {}
                    localStorage.removeItem('current_school_id');
                    try { invoke('delete_local_user', { userId: profile.user_id }); } catch (_) {}
                    if (schoolState === 'missing') {
                      try { invoke('purge_local_school', { schoolId: profile.school_id }); } catch (_) {}
                    }
                    setSession(null);
                    setUser(null);
                    setRoles([]);
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
    fetchUserRoles(restored.user_id || userId, validatedSchoolId);
    return { ...restored, school_id: validatedSchoolId };
  }

  const setOfflineSession = (
    userId: string,
    email: string,
    sessionToken: string,
    schoolId: string
  ) => {
    void setOfflineSessionState(userId, email, sessionToken, schoolId).catch((err) => {
      console.error('[Auth] Restauration de session locale impossible:', err);
      localStorage.removeItem('orion_offline_session');
      setSession(null);
      setUser(null);
      setRoles([]);
    });
    localStorage.setItem(
      'orion_offline_session',
      JSON.stringify({ id: userId, email, token: sessionToken })
    );
  };

  const signOut = async () => {
    await revokeStoredOfflineToken();
    // (ORI-SEC-003) : Invalider la session active cote Rust
    try { await invoke('clear_local_session'); } catch (_) {}
    if (session?.access_token === 'offline') {
      setSession(null);
      setUser(null);
      setRoles([]);
    } else {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setRoles([]);
    }
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
      session, user, loading, roles, rolesLoaded,
      schoolId,
      forcedSchoolId,
      forcedSchoolName,
      inSchoolMode: !!forcedSchoolId,
      enterSchoolMode,
      exitSchoolMode,
      activated, signOut, setOfflineSession,
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
