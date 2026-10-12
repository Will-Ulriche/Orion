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

  const fetchUserRoles = async (userId: string, schoolId: string) => {
    try {
      const userRoles = await invoke<string[]>('get_current_user_roles', { userId, schoolId });
      setRoles(userRoles.length > 0 ? userRoles : ['DIRECTION']); // fallback gracieux
      setRolesLoaded(true);
    } catch (err) {
      console.error("Erreur lors de la récupération des rôles:", err);
      // En cas d'erreur, on accorde DIRECTION par défaut (compte local seeded)
      setRoles(['DIRECTION']);
      setRolesLoaded(true);
    }
  };

  const syncUserToLocalDb = async (userSession: Session | null) => {
    if (userSession?.user) {
      try {
        const schoolId = getCurrentSchoolId();
        const schoolName = 'École par défaut'; // Dans un cas réel, récupérer depuis la session ou la base
        // Si connecté en ligne, on récupère aussi l'identité (prénom/nom) du profil cloud.
        let firstName: string | null = null;
        let lastName: string | null = null;
        if (userSession.access_token !== 'offline') {
          try {
            const { data: prof } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('user_id', userSession.user.id)
              .limit(1)
              .maybeSingle();
            firstName = (prof as any)?.first_name ?? null;
            lastName = (prof as any)?.last_name ?? null;
          } catch (profileErr) {
            console.error('Erreur de récupération du profil cloud:', profileErr);
          }
        }
        await invoke('sync_local_user', {
          userId: userSession.user.id,
          email: userSession.user.email || '',
          schoolId,
          schoolName,
          firstName,
          lastName
        });
        // Si connecté en ligne, on rapatrie le(s) rôle(s) cloud vers la base locale
        // (permettra l'usage hors-ligne et l'affichage du bon espace).
        if (userSession.access_token !== 'offline') {
          try {
            const { data } = await supabase
              .from('user_roles')
              .select('roles(name)')
              .eq('user_id', userSession.user.id);
            const roleNames = (data ?? [])
              .map((r: any) => r.roles?.name)
              .filter((n: unknown): n is string => typeof n === 'string');
            for (const roleName of roleNames) {
              await invoke('set_local_user_role', {
                userId: userSession.user.id,
                schoolId,
                roleName,
              });
            }
          } catch (roleErr) {
            console.error('Erreur de synchronisation des rôles:', roleErr);
          }
          // La synchronisation cloud a réussi : l'installation est activée.
          activate();
        }
        await fetchUserRoles(userSession.user.id, schoolId);
      } catch (err) {
        console.error("Erreur de synchronisation locale de l'utilisateur:", err);
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
