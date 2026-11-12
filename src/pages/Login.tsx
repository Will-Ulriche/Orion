import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Eye, EyeOff, WifiOff, Loader2, AlertCircle, Shield } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../hooks/useNetwork';
import { isCloudManagedUserId, verifyCloudAccount, verifyCloudSchool } from '../lib/accountValidation';

// ─── Main Login Component ─────────────────────────────────────────────────────
export default function Login({
  isActivation = false,
  onSwitchToLocal,
}: {
  isActivation?: boolean;
  onSwitchToLocal?: () => void;
}) {
  const { setOfflineSession, schoolId } = useAuth();
  const isOnline = useNetwork();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Le mode offline correspond à l'inverse de la connexion en ligne
  const offlineMode = !isOnline;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Si l'utilisateur saisit un nom d'utilisateur local (ex: « Admin ») plutôt qu'un email complet,
      // on délègue directement à l'authentification locale individuelle.
      if (email.trim().toLowerCase() === 'admin') {
        const res = await invoke<{
          user_id: string;
          email: string;
          school_id: string;
          session_token: string;
        }>('login_local', {
          identifier: email.trim(),
          password,
          schoolId,
        });
        setOfflineSession(res.user_id, res.email, res.session_token, res.school_id);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        // Bascule hors-ligne si erreur réseau
        if (
          error.message.toLowerCase().includes('fetch') ||
          error.message.toLowerCase().includes('network') ||
          !navigator.onLine
        ) {
          try {
            const res = await invoke<{
              user_id: string;
              email: string;
              school_id: string;
              session_token: string;
            }>('login_offline', { email, password, schoolId });
            setOfflineSession(res.user_id, res.email, res.session_token, res.school_id);
          } catch (offlineErr) {
            setError(offlineErr as string);
          }
        } else {
          setError(error.message);
        }
      } else if (data.user) {
        // Vérifier si l'utilisateur est SUPER_ADMIN (qui n'est rattaché à aucun établissement)
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('roles(name)')
          .eq('user_id', data.user.id);
        const isSuperAdmin = (roleData ?? []).some((r: any) => r.roles?.name === 'SUPER_ADMIN')
          || (data.user.user_metadata as any)?.role === 'SUPER_ADMIN';

        if (!isSuperAdmin) {
          // L'établissement (ou le compte) a-t-il été supprimé/suspendu par
          // l'administration ? On vérifie avant d'accorder l'accès.
          const metaSchoolId = (data.user.user_metadata as any)?.school_id as string | undefined;
          const accountState = await verifyCloudAccount(data.user.id);
          const schoolState = isCloudManagedUserId(metaSchoolId)
            ? await verifyCloudSchool(metaSchoolId!)
            : 'unknown';

          if (accountState === 'missing' || schoolState === 'missing') {
            await supabase.auth.signOut().catch(() => { });
            setError(
              schoolState === 'missing'
                ? "Cet établissement a été supprimé par l'administration. Accès refusé."
                : "Ce compte a été supprimé ou suspendu par l'administration. Contactez le support."
            );
            return;
          }
        }

        // Succès en ligne — enregistrer pour usage futur hors-ligne
        try {
          const accessToken = data.session?.access_token;
          if (accessToken) {
            await invoke('store_offline_credentials', {
              token: accessToken,
              password,
            });
          }
        } catch (err) {
          console.error('Erreur sauvegarde creds hors ligne:', err);
        }
      }
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : (err?.message || 'Une erreur est survenue');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="h-screen flex overflow-hidden"
      style={{ backgroundColor: '#f8fafc' }}
    >
      {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-3/5 relative flex-col items-center justify-center overflow-hidden border-r border-slate-200/80"
        style={{
          backgroundColor: '#f8fafc',
          backgroundImage: `
            radial-gradient(circle at 1px 1px, rgba(99, 102, 241, 0.12) 1.2px, transparent 0),
            radial-gradient(ellipse 60% 50% at 20% 25%, rgba(99, 102, 241, 0.08) 0%, transparent 70%),
            radial-gradient(ellipse 50% 60% at 80% 75%, rgba(14, 165, 233, 0.09) 0%, transparent 70%)
          `,
          backgroundSize: '24px 24px, 100% 100%, 100% 100%',
        }}
      >
        {/* Soft glowing ambient orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[55%] h-[55%] bg-indigo-500/10 blur-[110px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-sky-400/10 blur-[110px] rounded-full pointer-events-none" />

        {/* Textured noise overlay for subtle tactile paper texture */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.22] pointer-events-none mix-blend-overlay">
          <filter id="login-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#login-noise)" />
        </svg>

        {/* Content */}
        <div className="relative z-10 max-w-lg px-12">
          <h1
            className="text-5xl font-black text-slate-900 leading-[1.12] mb-6 tracking-tight"
          >
            Connexion<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-600">
              et Activation
            </span>
          </h1>

          <p className="text-slate-600 text-base leading-relaxed max-w-md font-normal">
            Une interface intuitive et performante pour accompagner chaque étape du parcours scolaire de votre établissement.
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center px-6 py-8 relative overflow-hidden"
        style={{
          backgroundColor: '#f8fafc',
          backgroundImage: `
            radial-gradient(circle at 1px 1px, rgba(99, 102, 241, 0.08) 1.2px, transparent 0),
            radial-gradient(ellipse 60% 50% at 80% 25%, rgba(99, 102, 241, 0.06) 0%, transparent 70%),
            radial-gradient(ellipse 50% 60% at 20% 80%, rgba(14, 165, 233, 0.07) 0%, transparent 70%)
          `,
          backgroundSize: '24px 24px, 100% 100%, 100% 100%',
          borderLeft: '1px solid rgba(99,102,241,0.1)',
        }}
      >
        {/* Soft ambient orbs */}
        <div className="absolute top-[-10%] right-[-10%] w-[45%] h-[45%] bg-indigo-500/8 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-400/8 blur-[100px] rounded-full pointer-events-none" />

        {/* Noise overlay */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.15] pointer-events-none mix-blend-overlay">
          <filter id="right-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#right-noise)" />
        </svg>

        <div className="w-full max-w-sm relative z-10" style={{ animation: 'fadeInUp 0.45s cubic-bezier(0.16,1,0.3,1)' }}>

          {/* Header */}
          <div className="mb-5">
            <h2
              className="text-2xl font-bold text-slate-900 text-center lg:text-left"
              style={{ letterSpacing: '-0.02em' }}
            >
              Bienvenue
            </h2>
            <p className="text-slate-500 text-sm mt-1 text-center lg:text-left">
              {isActivation
                ? 'Première connexion : activez votre installation Orion'
                : 'Connectez-vous à votre espace Orion'}
            </p>
            {isActivation && (
              <div
                className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium w-fit mx-auto lg:mx-0"
                style={{
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  color: '#4f46e5',
                }}
              >
                <Shield size={12} />
                Activation · connexion en ligne requise
              </div>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div
              className="flex items-start gap-3 p-3.5 rounded-xl mb-5 text-sm"
              style={{
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#dc2626',
                animation: 'fadeInUp 0.2s ease',
              }}
            >
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#ef4444' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-3">
            {/* Email */}
            <div>
              <label
                className="block text-xs font-medium mb-2"
                style={{ color: '#94a3b8' }}              >
                Identifiant ou e-mail
              </label>
              <input
                id="login-email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=""
                required
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 placeholder-slate-400 transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  border: '1.5px solid #cbd5e1',
                  outline: 'none',
                  color: '#1e293b',
                }}
                onFocus={(e) => {
                  e.target.style.border = '1.5px solid #6366f1';
                  e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
                  e.target.style.background = '#ffffff';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1.5px solid #cbd5e1';
                  e.target.style.boxShadow = 'none';
                  e.target.style.background = 'rgba(255,255,255,0.7)';
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-xs font-medium mb-2"
                style={{ color: '#94a3b8' }}              >
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 rounded-xl text-sm text-slate-900 placeholder-slate-400 transition-all duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.7)',
                    border: '1.5px solid #cbd5e1',
                    outline: 'none',
                    color: '#1e293b',
                  }}
                  onFocus={(e) => {
                    e.target.style.border = '1.5px solid #6366f1';
                    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
                    e.target.style.background = '#ffffff';
                  }}
                  onBlur={(e) => {
                    e.target.style.border = '1.5px solid #cbd5e1';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = 'rgba(255,255,255,0.7)';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors duration-150"
                  style={{ color: '#475569' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#94a3b8')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#475569')}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-sm text-white transition-all duration-200 flex items-center justify-center gap-2 mt-2"
              style={{
                background: loading
                  ? 'rgba(79,70,229,0.5)'
                  : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(79,70,229,0.45)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 28px rgba(79,70,229,0.65)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(79,70,229,0.45)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>

          {onSwitchToLocal && (
            <button
              type="button"
              onClick={onSwitchToLocal}
              className="w-full mt-3 py-2.5 rounded-xl text-slate-500 hover:text-indigo-600 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer hover:bg-indigo-50/60"
            >
              Retour à la connexion locale
            </button>
          )}

          {/* Offline badge */}
          {offlineMode && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  color: '#fbbf24',
                }}
              >
                <WifiOff size={12} />
                Mode hors-ligne — authentification locale
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
