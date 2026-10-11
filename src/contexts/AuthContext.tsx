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
  activated: boolean;
  signOut: () => Promise<void>;
  setOfflineSession: (userId: string, email: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const getCurrentSchoolId = (): string =>
  localStorage.getItem('current_school_id') || 'school-1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  // Une fois l'installation activée (1ère connexion en ligne réussie),
  // l'application bascule sur la connexion locale par PIN.
  const [activated, setActivated] = useState(
    () => localStorage.getItem('orion_activated') === '1'
  );

  const activate = () => {
    localStorage.setItem('orion_activated', '1');
    setActivated(true);
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
    <AuthContext.Provider value={{ session, user, roles, rolesLoaded, schoolId: getCurrentSchoolId(), activated, signOut, setOfflineSession }}>
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
