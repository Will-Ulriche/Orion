import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Save, Mail, Lock, Key, Check, X, Upload, UserCog } from 'lucide-react';

const fieldClass = "w-full px-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700";

function ImageUploadZone({
  label, value, fieldKey, onSet, hint
}: {
  label: string;
  value: string;
  fieldKey: string;
  onSet: (key: string, val: string) => void;
  hint: string;
}) {
  const handlePick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (ev: any) => {
      const file = ev.target.files?.[0];
      if (!file) return;

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const max = 800;
        let { width, height } = img;
        
        if (width > max || height > max) {
          const ratio = Math.min(max / width, max / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/webp', 0.8);
          onSet(fieldKey, dataUrl);
        }
      };
      img.src = url;
    };
    input.click();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {label && <label className="block text-[12px] font-bold text-slate-600 w-full">{label}</label>}
      <div
        onClick={handlePick}
        className="w-full h-32 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#4f46e5] bg-slate-50 hover:bg-[#f0f3ff] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group relative overflow-hidden"
      >
        {value ? (
          <>
            <img src={value} alt="Preview" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all">
              <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100">Changer</span>
            </div>
          </>
        ) : (
          <>
            <Upload size={22} className="text-slate-300 group-hover:text-[#4f46e5] transition-colors" />
            <span className="text-[12px] text-slate-400 group-hover:text-[#4f46e5] font-medium transition-colors">{hint}</span>
          </>
        )}
      </div>
      {value && (
        <button onClick={(e) => { e.stopPropagation(); onSet(fieldKey, ''); }} className="text-[11px] text-red-400 hover:text-red-600 flex items-center gap-1">
          <X size={12} /> Retirer
        </button>
      )}
    </div>
  );
}

export default function Account() {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>(user?.user_metadata?.avatar_url || '');
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUpdateAccount = async () => {
    if (password && password !== confirmPassword) {
      setStatus({ type: 'error', msg: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const updates: any = {};
      const data: any = {};
      if (password) {
        updates.password = password;
        // (ORI-SEC-002) : initial_password supprimé — le nouveau mot de passe
        // n'est plus persisté dans les métadonnées Auth.
      }
      if (avatarUrl !== user?.user_metadata?.avatar_url) {
        data.avatar_url = avatarUrl;
      }
      if (Object.keys(data).length > 0) updates.data = data;

      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      
      setStatus({ type: 'success', msg: 'Compte mis à jour avec succès.' });
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setStatus({ type: 'error', msg: `Erreur: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full flex flex-col bg-[#f8f9fc]">
      <div className="mb-6 flex-shrink-0">
        <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight">Mon compte</h2>
        <p className="text-slate-500 mt-0.5 text-[13px]">Gérez vos informations de connexion et votre profil.</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm max-w-4xl">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#eef2ff] text-[#4f46e5]">
              <UserCog size={18} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800 leading-tight">Informations personnelles</h3>
              <p className="text-[11.5px] text-slate-400 leading-tight mt-0.5">Modifier votre mot de passe et votre photo de profil</p>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
              {/* Left Column - Password/Email */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Adresse email (identifiant)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail size={14} />
                    </div>
                    <input type="email" value={user?.email || ''} disabled className={`${fieldClass} pl-9 bg-slate-100 text-slate-500 cursor-not-allowed`} />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4">
                  <h4 className="text-[12px] font-bold text-slate-600 mb-3 uppercase tracking-wider">Changer le mot de passe</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Nouveau mot de passe</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Lock size={14} />
                        </div>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={`${fieldClass} pl-9`} />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Confirmer le mot de passe</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Key size={14} />
                        </div>
                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className={`${fieldClass} pl-9`} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Right Column - Avatar */}
              <div>
                <h4 className="text-[12px] font-bold text-slate-600 mb-3 uppercase tracking-wider">Photo de profil</h4>
                <div className="max-w-[200px]">
                  <ImageUploadZone
                    label=""
                    value={avatarUrl}
                    fieldKey="avatar_url"
                    onSet={(_, val) => setAvatarUrl(val)}
                    hint="Importer une photo"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-3 leading-snug">
                  Cette photo sera visible par les autres utilisateurs de votre établissement. Privilégiez un format carré (ex: 500x500).
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50/50 rounded-b-2xl border-t border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
            <div>
              {status && (
                <span className={`text-sm flex items-center gap-1.5 font-medium ${status.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                  {status.type === 'success' ? <Check size={14} /> : <X size={14} />}
                  {status.msg}
                </span>
              )}
            </div>
            <button
              onClick={handleUpdateAccount}
              disabled={loading || (!password && avatarUrl === user?.user_metadata?.avatar_url)}
              className="bg-[#4f46e5] hover:bg-[#4338ca] text-white px-6 py-2.5 rounded-xl text-[13px] font-semibold flex items-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_0_rgb(79,70,229,0.35)]"
            >
              <Save size={15} />
              {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
