import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { Shield, KeyRound, ArrowRight, UserCircle2, Loader2, X, Cloud } from 'lucide-react';
import LoginOnline from './Login';

interface LoginProfile {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role_name: string | null;
  has_pin: boolean;
}

export default function LoginPage() {
  const { setOfflineSession } = useAuth();
  const [profiles, setProfiles] = useState<LoginProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<LoginProfile | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');
  const [showOnline, setShowOnline] = useState(false);

  // Temporaire : on utilise le school-1 par défaut
  const schoolId = 'school-1';

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const data: LoginProfile[] = await invoke('get_school_users_for_login', { schoolId });
      setProfiles(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || pin.length < 4) return;
    setLoggingIn(true);
    setError('');

    try {
      // 1. Appel Tauri pour vérifier le PIN
      const res: any = await invoke('login_with_pin', {
        userId: selectedUser.user_id,
        pin,
        schoolId
      });

      // 2. Mettre à jour le contexte global
      setOfflineSession(res.user_id, res.email);

    } catch (err: any) {
      setError(String(err));
      setPin('');
    } finally {
      setLoggingIn(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-500" /></div>;

  if (showOnline) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowOnline(false)}
          className="fixed top-4 left-4 z-50 bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-medium px-4 py-2 rounded-xl backdrop-blur-md border border-white/10 flex items-center gap-2 shadow-lg transition-all"
        >
          <ArrowRight size={14} className="rotate-180" /> Revenir à la sélection par code PIN
        </button>
        <LoginOnline />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-sky-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-6xl mx-auto flex">
        
        {/* Left Side - Branding */}
        <div className="hidden lg:flex w-1/2 flex-col justify-center px-16 relative z-10">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-sky-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-8">
            <Shield className="text-white" size={32} />
          </div>
          <h1 className="text-5xl font-bold text-slate-800 mb-6 leading-tight">
            Bienvenue sur <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-sky-600">Orion</span>
          </h1>
          <p className="text-lg text-slate-500 max-w-md">
            Système de gestion scolaire intégré. Sélectionnez votre profil pour accéder à votre espace de travail.
          </p>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative z-10">
          <div className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-white p-8 rounded-3xl shadow-xl shadow-slate-200/50">
            
            {!selectedUser ? (
              // ─── Étape 1 : Sélection du profil ───
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Qui êtes-vous ?</h2>
                <p className="text-slate-500 text-sm mb-8">Sélectionnez votre compte pour continuer</p>

                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {profiles.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-100">
                      Aucun utilisateur configuré.
                    </div>
                  ) : profiles.map(p => {
                    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email;
                    return (
                      <button
                        key={p.user_id}
                        onClick={() => setSelectedUser(p)}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/50 transition-all group text-left shadow-sm"
                      >
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                          <UserCircle2 size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              {p.role_name || 'Utilisateur'}
                            </span>
                            {!p.has_pin && (
                              <span className="text-[10px] text-amber-500 font-medium px-1.5 py-0.5 rounded-full border border-amber-200 bg-amber-50">
                                PIN manquant
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight size={18} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowOnline(true)}
                    className="text-xs text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-2 py-1.5 px-3 rounded-xl hover:bg-indigo-50/60 transition-all"
                  >
                    <Cloud size={15} className="text-indigo-500" />
                    Connexion Cloud Supabase (Super Admin / Écoles)
                  </button>
                </div>
              </div>
            ) : (
              // ─── Étape 2 : Saisie du PIN ───
              <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                <button
                  onClick={() => { setSelectedUser(null); setPin(''); setError(''); }}
                  className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-600 mb-6 transition-colors"
                >
                  <ArrowRight size={16} className="rotate-180" /> Retour aux profils
                </button>

                <div className="text-center mb-8">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-sky-100 mx-auto flex items-center justify-center text-indigo-600 mb-4 shadow-inner">
                    <UserCircle2 size={40} />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    {`${selectedUser.first_name ?? ''} ${selectedUser.last_name ?? ''}`.trim() || selectedUser.email}
                  </h2>
                  <p className="text-indigo-600 font-medium text-sm mt-1">{selectedUser.role_name}</p>
                </div>

                {!selectedUser.has_pin ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                    <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Shield size={20} />
                    </div>
                    <h3 className="font-semibold text-amber-800 mb-1">Aucun code PIN</h3>
                    <p className="text-sm text-amber-700/80">
                      Demandez à la direction de vous configurer un code PIN pour pouvoir vous connecter.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                      <label className="block text-center text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-4">
                        Entrez votre code PIN
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoFocus
                        maxLength={6}
                        value={pin}
                        onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                        className="w-full text-center text-4xl tracking-[0.5em] py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono"
                      />
                    </div>
                    
                    {error && (
                      <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-center flex items-center justify-center gap-2">
                        <X size={14} /> {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={pin.length < 4 || loggingIn}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-4 font-semibold shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loggingIn ? <Loader2 size={20} className="animate-spin" /> : <KeyRound size={20} />}
                      {loggingIn ? 'Vérification...' : 'Se connecter'}
                    </button>
                  </form>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
