import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { invoke } from '@tauri-apps/api/core';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  roles: string[];
  rolesLoaded: boolean;
  schoolId: string;
  /** Id de l'établissement ouvert en mode "direction" depuis l'espace SUPER_ADMIN. */
  forcedSchoolId: string | null;
  /** Nom affiché de l'établissement ouvert en mode "direction". */
  forcedSchoolName: string | null;
  /** Vrai quand le SUPER_ADMIN visite l'espace d'un établissement. */
  inSchoolMode: boolean;
  /** Ouvre l'espace direction d'un établissement (mode visite / impersonation). */
  enterSchoolMode: (schoolId: string, schoolName?: string | null) => void;
  /** Quitte l'espace direction et revient à l'établissement d'origine. */
  exitSchoolMode: () => void;
  activated: boolean;
  signOut: () => Promise<void>;
  setOfflineSession: (userId: string, email: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const getCurrentSchoolId = (): string =>
  localStorage.getItem('current_school_id') || 'school-1';

const LS_SCHOOL_ID = 'current_school_id';
const LS_FORCED_ID = 'orion_forced_school_id';
const LS_FORCED_NAME = 'orion_forced_school_name';
const LS_PREV_ID = 'orion_prev_school_id';
/** Événement émis quand l'établissement courant change. */
export const SCHOOL_CHANGED_EVENT = 'orion:school-changed';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  // Établissement courant — réactif : mis à jour par enterSchoolMode/exitSchoolMode
  // et par l'événement global SCHOOL_CHANGED_EVENT.
  const [schoolId, setSchoolId] = useState<string>(() => getCurrentSchoolId());
  const [forcedSchoolId, setForcedSchoolId] = useState<string | null>(
    () => localStorage.getItem(LS_FORCED_ID)
  );
  const [forcedSchoolName, setForcedSchoolName] = useState<string | null>(
    () => localStorage.getItem(LS_FORCED_NAME)
  );
  // Une fois l'installation activée (1ère connexion en ligne réussie),
  // l'application bascule sur la connexion locale par PIN.
  const [activated, setActivated] = useState(
    () => localStorage.getItem('orion_activated') === '1'
  );

  const activate = () => {
    localStorage.setItem('orion_activated', '1');
    setActivated(true);
  };

  // Relit le localStorage et propage le nouvel établissement dans le contexte
  // (déclenche le rechargement des années, des pages, du menu…).
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

  // Ouvre l'espace direction d'un établissement (le SUPER_ADMIN "devient" la direction).
  const enterSchoolMode = (nextSchoolId: string, nextSchoolName?: string | null) => {
    try {
      const current = getCurrentSchoolId();
      if (current !== nextSchoolId) {
        // On mémorise l'établissement d'origine pour pouvoir y revenir.
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

  // Quitte l'espace direction : on revient à l'établissement d'origine.
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
      console.error("Erreur lors de la récupération des rôles:", err);
      setRoles(fallbackRole ? [fallbackRole] : ['DIRECTION']);
      setRolesLoaded(true);
    }
  };

  const syncUserToLocalDb = async (userSession: Session | null) => {
    if (userSession?.user) {
      const userMeta = (userSession.user.user_metadata as any) || {};
      let schoolId = userMeta.school_id || localStorage.getItem('current_school_id') || '';
      let schoolName = 'Établissement';
      let firstName: string = userMeta.first_name || 'Direction';
      let lastName: string = userMeta.last_name || '';
      const metaRole: string = userMeta.role || 'DIRECTION';

      try {
        // Si connecté en ligne, tenter de récupérer l'établissement et profil cloud.
        if (userSession.access_token !== 'offline') {
          try {
            const { data: prof } = await supabase
              .from('profiles')
              .select('school_id, first_name, last_name, schools(name)')
              .eq('user_id', userSession.user.id)
              .limit(1)
              .maybeSingle();
            if (prof) {
              if ((prof as any)?.first_name) firstName = (prof as any).first_name;
              if ((prof as any)?.last_name) lastName = (prof as any).last_name;
              if ((prof as any)?.school_id) schoolId = (prof as any).school_id;
              if ((prof as any)?.schools?.name) schoolName = (prof as any).schools.name;
            }
          } catch (profileErr) {
            console.warn('Erreur profil cloud (utilisation métadonnées):', profileErr);
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
        });

        // Déterminer les rôles effectifs
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

        activate();
        setRoles(effectiveRoles);
        setRolesLoaded(true);
        await fetchUserRoles(userSession.user.id, schoolId || 'school-main', metaRole);
      } catch (err) {
        console.error("Erreur de synchronisation locale de l'utilisateur:", err);
        // Toujours garantir que l'utilisateur a son rôle chargé pour ne pas le bloquer
        setRoles([metaRole || 'DIRECTION']);
        setRolesLoaded(true);
      }
    }
  };

  useEffect(() => {
    // Vérifier s'il y a une session hors-ligne sauvegardée
    const localOfflineStr = localStorage.getItem('orion_offline_session');

    // Récupérer la session actuelle Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        setUser(session.user ?? null);
        syncUserToLocalDb(session);
        localStorage.removeItem('orion_offline_session'); // Nettoyer si on est connecté en ligne
      } else if (localOfflineStr) {
        try {
          const parsed = JSON.parse(localOfflineStr);
          setOfflineSessionState(parsed.id, parsed.email);
        } catch (e) {
          localStorage.removeItem('orion_offline_session');
        }
      }
      setLoading(false);
    });

    // Écouter les changements d'état (connexion, déconnexion)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session);
        setUser(session.user ?? null);
        syncUserToLocalDb(session);
        localStorage.removeItem('orion_offline_session');
      } else {
        // En cas de déconnexion, vérifier si on n'est pas en train de passer en mode offline
        // (géré par signOut)
        if (!localStorage.getItem('orion_offline_session')) {
          setSession(null);
          setUser(null);
          setRoles([]);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setOfflineSessionState = (userId: string, email: string) => {
    const fakeUser = { id: userId, email } as User;
    const fakeSession = { access_token: 'offline', user: fakeUser } as Session;
    setSession(fakeSession);
    setUser(fakeUser);
    fetchUserRoles(userId, getCurrentSchoolId());
  }

  const setOfflineSession = (userId: string, email: string) => {
    setOfflineSessionState(userId, email);
    localStorage.setItem('orion_offline_session', JSON.stringify({ id: userId, email }));
  };

  const signOut = async () => {
    localStorage.removeItem('orion_offline_session');
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
      session, user, roles, rolesLoaded,
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
    throw new Error("useAuth doit être utilisé à l'intérieur d'un AuthProvider");
  }
  return context;
};
