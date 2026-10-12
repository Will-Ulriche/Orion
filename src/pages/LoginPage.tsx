import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { Shield, UserCircle2, KeyRound, Loader2, X, Eye, EyeOff } from 'lucide-react';

interface LoginResult {
  user_id: string;
  email: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  role_name: string | null;
}

export default function LoginPage() {
  const { setOfflineSession } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');

  // Temporaire : on utilise le school-1 par défaut
  const schoolId = 'school-1';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setLoggingIn(true);
    setError('');

    try {
      // 1. Vérifier l'identifiant et le mot de passe en local
      const res: LoginResult = await invoke('login_local', {
        identifier: identifier.trim(),
        password,
        schoolId,
      });

      // 2. Mettre à jour le contexte global → accès direct à l'interface
      //    de travail correspondant au profil (rôle) de l'utilisateur.
      setOfflineSession(res.user_id, res.email);

    } catch (err: any) {
      setError(String(err));
      setPassword('');
    } finally {
      setLoggingIn(false);
    }
  };

  const inputClass =
    'w-full pl-11 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700 placeholder:text-slate-400';

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
            Système de gestion scolaire intégré. Connectez-vous avec l'identifiant attribué par la direction
            pour accéder à votre espace de travail.
          </p>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative z-10">
          <div className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-white p-8 rounded-3xl shadow-xl shadow-slate-200/50">

            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">Connexion</h2>
              <p className="text-slate-500 text-sm mb-8 text-center">
                Entrez votre identifiant et votre mot de passe
              </p>

              <form onSubmit={handleLogin} className="space-y-4">
                {/* Identifiant */}
                <div>
                  <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Identifiant
                  </label>
                  <div className="relative">
                    <UserCircle2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      autoFocus
                      autoComplete="username"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      placeholder="ex: jean.dupont"
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Mot de passe */}
                <div>
                  <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`${inputClass} pr-12`}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 flex items-center gap-2">
                    <X size={14} className="flex-shrink-0" /> {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!identifier.trim() || !password || loggingIn}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-4 font-semibold shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loggingIn && <Loader2 size={20} className="animate-spin" />}
                  {loggingIn ? 'Vérification...' : 'Se connecter'}
                </button>
              </form>

              <p className="text-center text-xs text-slate-400 mt-6">
                Les identifiants sont créés et attribués par la direction de l'école.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
