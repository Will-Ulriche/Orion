import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Eye, EyeOff, WifiOff, Loader2, AlertCircle, Shield, ArrowLeft } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../hooks/useNetwork';
import { isCloudManagedUserId, verifyCloudAccount, verifyCloudSchool } from '../lib/accountValidation';
import orionLogo from '../assets/orion_logo.png';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Star {
  x: number;
  y: number;
  r: number;
  ox: number;
  oy: number;
  speed: number;
  opacity: number;
}

// ─── Constellation Canvas ────────────────────────────────────────────────────
function ConstellationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Generate stars
    const count = 90;
    starsRef.current = Array.from({ length: count }, () => {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      return {
        x, y,
        ox: x, oy: y,
        r: Math.random() * 1.8 + 0.4,
        speed: Math.random() * 0.4 + 0.1,
        opacity: Math.random() * 0.6 + 0.2,
      };
    });

    let t = 0;
    const draw = () => {
      t += 0.005;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const stars = starsRef.current;

      // Animate stars with a slow drift
      stars.forEach((s) => {
        s.x = s.ox + Math.sin(t * s.speed + s.oy) * 12;
        s.y = s.oy + Math.cos(t * s.speed + s.ox) * 8;
      });

      // Draw connections
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const alpha = (1 - dist / 120) * 0.25;
            ctx.beginPath();
            ctx.moveTo(stars[i].x, stars[i].y);
            ctx.lineTo(stars[j].x, stars[j].y);
            ctx.strokeStyle = `rgba(139, 92, 246, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // Draw stars
      stars.forEach((s) => {
        // Glow
        const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
        grd.addColorStop(0, `rgba(167, 139, 250, ${s.opacity})`);
        grd.addColorStop(1, 'rgba(167, 139, 250, 0)');
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(216, 180, 254, ${s.opacity})`;
        ctx.fill();
      });

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
    />
  );
}

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
        // L'établissement (ou le compte) a-t-il été supprimé/suspendu par
        // l'administration ? On vérifie avant d'accorder l'accès.
        const metaSchoolId = (data.user.user_metadata as any)?.school_id as string | undefined;
        const accountState = await verifyCloudAccount(data.user.id);
        const schoolState = isCloudManagedUserId(metaSchoolId)
          ? await verifyCloudSchool(metaSchoolId!)
          : 'unknown';

        if (accountState === 'missing' || schoolState === 'missing') {
          await supabase.auth.signOut().catch(() => {});
          setError(
            schoolState === 'missing'
              ? "Cet établissement a été supprimé par l'administration. Accès refusé."
              : "Ce compte a été supprimé ou suspendu par l'administration. Contactez le support."
          );
          return;
        }

        // Succès en ligne — enregistrer pour usage futur hors-ligne
        try {
          await invoke('store_offline_credentials', {
            userId: data.user.id,
            email: data.user.email,
            password,
          });
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

  const quotes = [
    { text: "L'éducation est l'arme la plus puissante pour changer le monde.", author: "Nelson Mandela" },
    { text: "Investir dans le savoir rapporte les meilleurs intérêts.", author: "Benjamin Franklin" },
    { text: "L'éducation est la clé pour ouvrir la porte dorée de la liberté.", author: "George Washington Carver" },
  ];
  const quote = quotes[Math.floor(Date.now() / 86400000) % quotes.length];

  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'linear-gradient(135deg, #080d1f 0%, #0f1629 50%, #0d0a20 100%)' }}
    >
      {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-3/5 relative flex-col items-center justify-center overflow-hidden">
        {/* Constellation background */}
        <ConstellationCanvas />

        {/* Radial gradient overlays */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 60% at 30% 40%, rgba(79,46,229,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 50% at 70% 70%, rgba(124,58,237,0.12) 0%, transparent 70%)',
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-md px-12 text-white">
          {/* Logo mark */}
          <div className="mb-12">
            <img src={orionLogo} alt="Orion ERP" className="h-12 brightness-0 invert opacity-90" />
          </div>

          <h1
            className="text-4xl font-bold leading-tight mb-6"
            style={{ letterSpacing: '-0.02em' }}
          >
            Inspirer<br />
            <span
              style={{
                background: 'linear-gradient(135deg, #a78bfa, #818cf8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              l'excellence
            </span>
            <br />
            éducative.
          </h1>

          <p className="text-slate-400 text-base leading-relaxed mb-12">
            Pilotez votre établissement avec une plateforme unifiée — élèves, finances,
            pédagogie et personnel, en ligne comme hors-ligne.
          </p>

          {/* Quote */}
          <div
            className="border-l-2 pl-5"
            style={{ borderColor: 'rgba(139,92,246,0.6)' }}
          >
            <p className="text-slate-300 text-sm italic leading-relaxed">
              « {quote.text} »
            </p>
            <p className="text-slate-500 text-xs mt-2">— {quote.author}</p>
          </div>
        </div>

        {/* Bottom gradient fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(8,13,31,0.6) 0%, transparent 100%)',
          }}
        />
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center px-6 py-12 relative"
        style={{
          background: 'linear-gradient(180deg, rgba(15,22,41,0.95) 0%, rgba(10,8,30,0.98) 100%)',
          borderLeft: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        {/* Subtle top glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />

        <div className="w-full max-w-sm relative z-10" style={{ animation: 'fadeInUp 0.45s cubic-bezier(0.16,1,0.3,1)' }}>

          {/* Logo (mobile only) */}
          <div className="flex justify-center mb-8 lg:hidden">
            <img src={orionLogo} alt="Orion ERP" className="h-10 brightness-0 invert opacity-90" />
          </div>

          {/* Header */}
          <div className="mb-8">
            {/* Icon */}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 mx-auto lg:mx-0"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))',
                border: '1px solid rgba(99,102,241,0.35)',
                boxShadow: '0 0 24px rgba(99,102,241,0.2)',
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                {/* Constellation Orion simplified */}
                <circle cx="12" cy="4" r="1.5" fill="#a78bfa" />
                <circle cx="7" cy="9" r="1.2" fill="#818cf8" />
                <circle cx="17" cy="9" r="1.2" fill="#818cf8" />
                <circle cx="9" cy="14" r="1" fill="#c4b5fd" />
                <circle cx="15" cy="14" r="1" fill="#c4b5fd" />
                <circle cx="6" cy="19" r="1.3" fill="#a78bfa" />
                <circle cx="18" cy="19" r="1.3" fill="#a78bfa" />
                <line x1="12" y1="4" x2="7" y2="9" stroke="#6366f1" strokeWidth="0.8" strokeOpacity="0.7" />
                <line x1="12" y1="4" x2="17" y2="9" stroke="#6366f1" strokeWidth="0.8" strokeOpacity="0.7" />
                <line x1="7" y1="9" x2="9" y2="14" stroke="#6366f1" strokeWidth="0.8" strokeOpacity="0.7" />
                <line x1="17" y1="9" x2="15" y2="14" stroke="#6366f1" strokeWidth="0.8" strokeOpacity="0.7" />
                <line x1="9" y1="14" x2="6" y2="19" stroke="#6366f1" strokeWidth="0.8" strokeOpacity="0.7" />
                <line x1="15" y1="14" x2="18" y2="19" stroke="#6366f1" strokeWidth="0.8" strokeOpacity="0.7" />
              </svg>
            </div>

            <h2
              className="text-2xl font-bold text-white text-center lg:text-left"
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
                  background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  color: '#a5b4fc',
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
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#fca5a5',
                animation: 'fadeInUp 0.2s ease',
              }}
            >
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#f87171' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label
                className="block text-xs font-medium mb-2"
                style={{ color: '#94a3b8' }}
              >
                Identifiant ou e-mail
              </label>
              <input
                id="login-email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ecole.com ou Admin"
                required
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-600 transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid rgba(99,102,241,0.6)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)';
                  e.target.style.background = 'rgba(255,255,255,0.06)';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid rgba(255,255,255,0.08)';
                  e.target.style.boxShadow = 'none';
                  e.target.style.background = 'rgba(255,255,255,0.04)';
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-xs font-medium mb-2"
                style={{ color: '#94a3b8' }}
              >
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
                  className="w-full px-4 py-3 pr-12 rounded-xl text-sm text-white placeholder-slate-600 transition-all duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.target.style.border = '1px solid rgba(99,102,241,0.6)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)';
                    e.target.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onBlur={(e) => {
                    e.target.style.border = '1px solid rgba(255,255,255,0.08)';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = 'rgba(255,255,255,0.04)';
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
              className="w-full mt-3 py-2.5 rounded-xl border border-slate-750 hover:border-slate-600 text-slate-300 hover:text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer bg-slate-800/40 hover:bg-slate-800/80"
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <ArrowLeft size={14} />
              Retour à la connexion locale
            </button>
          )}

          {/* Offline badge */}
          <div className="mt-8 flex items-center justify-center gap-2">
            {offlineMode ? (
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
            ) : (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                style={{ color: '#334155' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{
                    background: '#22c55e',
                    boxShadow: '0 0 6px rgba(34,197,94,0.8)',
                    animation: 'pulse 2s infinite',
                  }}
                />
                Connecté · Supabase
              </div>
            )}
          </div>

          {/* Footer */}
          <p
            className="text-center text-xs mt-6"
            style={{ color: '#1e293b' }}
          >
            Orion ERP · v2.0 · Socle Tauri + Supabase
          </p>
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
