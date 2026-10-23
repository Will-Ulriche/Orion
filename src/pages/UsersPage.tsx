import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus, Search, ShieldCheck, ShieldOff, UserCircle2,
  MoreVertical, Phone, Mail, RefreshCw, X, Check, ChevronDown, KeyRound, Trash2, AlertTriangle
} from 'lucide-react';

interface LocalUserInfo {
  user_id: string;
  email: string;
  username: string | null;
  status: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role_name: string | null;
  role_id: string | null;
  profile_id: string | null;
  staff_id: string | null;
  staff_name: string | null;
  created_at: string;
}

interface StaffMember {
  id: string;
  matricule: string | null;
  nom: string;
  prenoms: string;
  email: string | null;
  telephone_principal: string | null;
  type_personnel: string | null;
  fonction: string | null;
  est_actif: boolean;
}

interface RoleRec {
  id: string;
  name: string;
  description: string | null;
}

const roleStyle: Record<string, { bg: string; text: string; dot: string }> = {
  DIRECTION:   { bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-500' },
  SECRETAIRE:  { bg: 'bg-sky-50',     text: 'text-sky-700',     dot: 'bg-sky-500' },
  PROFESSEUR:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  SUPER_ADMIN: { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
};

// ─── Rôles réservés ──────────────────────────────────────────────────────────
// Depuis l'espace direction, le rôle SUPER_ADMIN n'est plus attribuable :
// ni à la création d'un compte, ni via « Changer le rôle ».
// Le compte super administrateur se crée uniquement depuis l'espace
// SUPER_ADMIN (gouvernance cloud). Le backend refuse aussi cette attribution.
const RESERVED_ROLES = ['SUPER_ADMIN'];
const isAssignableRole = (r: RoleRec) => !RESERVED_ROLES.includes(r.name);

const initials = (u: LocalUserInfo) =>
  ((u.first_name?.[0] || '') + (u.last_name?.[0] || '')).toUpperCase() || u.email[0].toUpperCase();

const avatarColor = (email: string) => {
  const colors = [
    'bg-violet-500', 'bg-indigo-500', 'bg-sky-500',
    'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  ];
  const idx = email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return colors[idx];
};

// ─── Modal Création ─────────────────────────────────────────────────────────
function CreateUserModal({
  roles,
  schoolId,
  actorId,
  onClose,
  onCreated,
}: {
  roles: RoleRec[];
  schoolId: string;
  actorId: string;
  onClose: () => void;
  onCreated: (u: LocalUserInfo) => void;
}) {
  const [form, setForm] = useState({
    username: '', email: '', password: '', confirm: '', first_name: '', last_name: '', phone: '', role_id: roles[0]?.id || '', staff_id: ''
  });
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    invoke<StaffMember[]>('get_staff', { schoolId, includePhotos: false })
      .then(list => { if (active) setStaffList(list.filter(s => s.est_actif)); })
      .catch(() => { /* le rattachement reste optionnel */ });
    return () => { active = false; };
  }, [schoolId]);

  const handleStaffPick = (staffId: string) => {
    const staff = staffList.find(s => s.id === staffId);
    setForm(f => ({
      ...f,
      staff_id: staffId,
      first_name: staff ? staff.prenoms : f.first_name,
      last_name: staff ? staff.nom : f.last_name,
      email: staff?.email || f.email,
      phone: staff?.telephone_principal || f.phone,
    }));
  };

  const field = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.email || !form.first_name || !form.last_name || !form.role_id) {
      setError('Tous les champs obligatoires (*) doivent être remplis.');
      return;
    }
    if (form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await invoke<LocalUserInfo>('create_local_user', {
        schoolId,
        username: form.username,
        email: form.email,
        password: form.password,
        firstName: form.first_name,
        lastName: form.last_name,
        phone: form.phone || null,
        roleId: form.role_id,
        actorId,
        staffId: form.staff_id || null,
      });
      onCreated(user);
      onClose();
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const inp = "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none text-sm text-slate-700 placeholder:text-slate-400 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Plus size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-[15px]">Nouvel utilisateur</h3>
              <p className="text-[11.5px] text-slate-400">Crée un compte local pour cet établissement</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-semibold text-slate-600 mb-1.5">Prénom *</label>
              <input className={inp} value={form.first_name} onChange={field('first_name')} placeholder="Jean" />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-slate-600 mb-1.5">Nom *</label>
              <input className={inp} value={form.last_name} onChange={field('last_name')} placeholder="Dupont" />
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] font-semibold text-slate-600 mb-1.5">Nom d'utilisateur *</label>
            <div className="relative">
              <UserCircle2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inp} pl-9`} value={form.username} onChange={field('username')} placeholder="jean.dupont" autoComplete="off" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-semibold text-slate-600 mb-1.5">Mot de passe *</label>
              <div className="relative">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="password" className={`${inp} pl-9`} value={form.password} onChange={field('password')} placeholder="••••••" autoComplete="new-password" />
              </div>
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-slate-600 mb-1.5">Confirmer *</label>
              <div className="relative">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="password" className={`${inp} pl-9`} value={form.confirm} onChange={field('confirm')} placeholder="••••••" autoComplete="new-password" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] font-semibold text-slate-600 mb-1.5">Email</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="email" className={`${inp} pl-9`} value={form.email} onChange={field('email')} placeholder="jean.dupont@ecole.sn" />
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] font-semibold text-slate-600 mb-1.5">Téléphone</label>
            <div className="relative">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inp} pl-9`} value={form.phone} onChange={field('phone')} placeholder="+221 70 000 00 00" />
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] font-semibold text-slate-600 mb-1.5">Personnel rattaché</label>
            <div className="relative">
              <select className={`${inp} pr-8 appearance-none`} value={form.staff_id} onChange={e => handleStaffPick(e.target.value)}>
                <option value="">— Aucun (compte non lié au personnel) —</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nom} {s.prenoms}{s.matricule ? ` · ${s.matricule}` : ''}{s.fonction ? ` · ${s.fonction}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <p className="text-[10.5px] text-slate-400 mt-1.5 leading-snug">
              Rapprochement automatique par email si un membre du personnel partage le même email.
            </p>
          </div>

          <div>
            <label className="block text-[11.5px] font-semibold text-slate-600 mb-1.5">Rôle *</label>
            <div className="relative">
              <select className={`${inp} pr-8 appearance-none`} value={form.role_id} onChange={field('role_id')}>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <p className="text-[10.5px] text-slate-400 mt-1.5 leading-snug">
              Le rôle <strong className="text-slate-500">Super administrateur (SUPER_ADMIN)</strong> ne peut pas
              être créé depuis l'espace direction.
            </p>
          </div>

          {error && (
            <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <X size={14} /> {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {loading ? 'Création...' : 'Créer l\'utilisateur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Mot de passe ───────────────────────────────────────────────────────
function SetPasswordModal({
  user,
  onClose,
  onSaved,
}: {
  user: LocalUserInfo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await invoke('set_user_password', { userId: user.user_id, password });
      setSuccess(true);
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email;
  const inp = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-all';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <KeyRound size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-[15px]">Définir un mot de passe</h3>
              <p className="text-[11.5px] text-slate-400">{name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <Check size={28} className="text-green-600" />
              </div>
              <p className="font-semibold text-slate-700">Mot de passe enregistré !</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11.5px] font-semibold text-slate-600 mb-2">Nouveau mot de passe (min. 6 caractères)</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={inp}
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-semibold text-slate-600 mb-2">Confirmer le mot de passe</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={inp}
                />
              </div>
              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 flex items-center gap-2">
                  <X size={13} /> {error}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Annuler</button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Ligne utilisateur (liste) ────────────────────────────────────────────────
function UserRow({
  user,
  roles,
  schoolId,
  actorId,
  onToggle,
  onRoleChange,
  onDelete,
}: {
  user: LocalUserInfo;
  roles: RoleRec[];
  schoolId: string;
  actorId: string;
  onToggle: (u: LocalUserInfo) => void;
  onRoleChange: (userId: string, roleId: string) => void;
  onDelete: (u: LocalUserInfo) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0, maxHeight: 0 });
  const [changingRole, setChangingRole] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const style = roleStyle[user.role_name || ''] ?? { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' };
  const isActive = user.status === 'ACTIVE';

  const openMenu = () => setMenuOpen(true);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const margin = 8;
    const gap = 4;
    const rect = btn.getBoundingClientRect();
    const menuH = menu.offsetHeight;
    const right = Math.max(margin, window.innerWidth - rect.right);
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;

    let top: number;
    let maxHeight: number;
    if (menuH <= spaceBelow || spaceBelow >= spaceAbove) {
      top = rect.bottom + gap;
      maxHeight = Math.max(120, spaceBelow);
    } else {
      maxHeight = Math.max(120, spaceAbove);
      top = rect.top - gap - Math.min(menuH, maxHeight);
    }
    setMenuPos({ top, right, maxHeight });
  }, [menuOpen]);

  const handleRoleChange = async (roleId: string) => {
    setChangingRole(true);
    setMenuOpen(false);
    try {
      await invoke('assign_user_role', { userId: user.user_id, schoolId, roleId, actorId });
      onRoleChange(user.user_id, roleId);
    } catch (err) {
      console.error(err);
    } finally {
      setChangingRole(false);
    }
  };

  const fullName = user.first_name || user.last_name
    ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
    : 'Sans nom';

  return (
    <tr className={`border-b border-slate-100 last:border-0 transition-colors ${isActive ? 'hover:bg-slate-50/70' : 'opacity-50 hover:bg-slate-50/40'}`}>
      {/* Identité */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg ${avatarColor(user.email)} flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0`}>
            {initials(user)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-[13.5px] leading-tight truncate">{fullName}</p>
            <p className="text-[11.5px] text-indigo-500 font-medium truncate flex items-center gap-1 mt-0.5">
              <UserCircle2 size={10} /> {user.username ?? '—'}
            </p>
            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
              <Mail size={10} /> {user.email}
            </p>
          </div>
        </div>
      </td>
      {/* Rôle */}
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
          {changingRole ? <RefreshCw size={10} className="animate-spin" /> : <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
          {user.role_name ?? 'Aucun rôle'}
        </span>
      </td>
      {/* Téléphone */}
      <td className="px-4 py-3">
        {user.phone ? (
          <span className="text-[12.5px] text-slate-500 flex items-center gap-1.5">
            <Phone size={11} className="text-slate-400" /> {user.phone}
          </span>
        ) : (
          <span className="text-[12px] text-slate-300">—</span>
        )}
      </td>
      {/* Statut */}
      <td className="px-4 py-3">
        <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {isActive ? 'Actif' : 'Inactif'}
        </span>
      </td>
      {/* Date création */}
      <td className="px-4 py-3 text-[12px] text-slate-400 whitespace-nowrap">
        {new Date(user.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
      </td>
      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <button
          ref={btnRef}
          onClick={openMenu}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-auto"
        >
          <MoreVertical size={15} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setMenuOpen(false)} />
            <div
              ref={menuRef}
              className="fixed z-[101] bg-white rounded-xl border border-slate-200 shadow-xl w-52 overflow-y-auto py-1"
              style={{ top: menuPos.top, right: menuPos.right, maxHeight: menuPos.maxHeight || undefined }}
            >
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Changer le rôle</p>
              {roles.map(r => (
                <button
                  key={r.id}
                  onClick={() => handleRoleChange(r.id)}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <span className={`w-2 h-2 rounded-full ${roleStyle[r.name]?.dot ?? 'bg-slate-400'}`} />
                  {r.name}
                  {user.role_id === r.id && <Check size={12} className="ml-auto text-indigo-500" />}
                </button>
              ))}
              <div className="border-t border-slate-100 mt-1 pt-1">
                <button
                  onClick={() => { setMenuOpen(false); setShowPasswordModal(true); }}
                  className="w-full text-left px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2"
                >
                  <KeyRound size={13} /> Définir / changer le mot de passe
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onToggle(user); }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                >
                  {isActive ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                  {isActive ? 'Désactiver le compte' : 'Réactiver le compte'}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(user); }}
                  className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                >
                  <Trash2 size={13} /> Supprimer le compte
                </button>
              </div>
            </div>
          </>
        )}
      </td>

      {/* Modal mot de passe */}
      {showPasswordModal && (
        <SetPasswordModal
          user={user}
          onClose={() => setShowPasswordModal(false)}
          onSaved={() => {}}
        />
      )}
    </tr>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────
export default function UsersPage() {
  const { schoolId, user: currentUser } = useAuth();
  const actorId = currentUser?.id ?? '';
  const [users, setUsers] = useState<LocalUserInfo[]>([]);
  const [roles, setRoles] = useState<RoleRec[]>([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LocalUserInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, rolesData] = await Promise.all([
        invoke<LocalUserInfo[]>('get_school_users', { schoolId }),
        invoke<RoleRec[]>('get_roles'),
      ]);
      setUsers(usersData);
      // SUPER_ADMIN n'est plus attribuable depuis l'espace direction
      setRoles(rolesData.filter(isAssignableRole));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async (user: LocalUserInfo) => {
    const newStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await invoke('toggle_user_status', { userId: user.user_id, newStatus });
      setUsers(prev => prev.map(u => u.user_id === user.user_id ? { ...u, status: newStatus } : u));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await invoke('delete_local_user', { userId: deleteTarget.user_id });
      setUsers(prev => prev.filter(u => u.user_id !== deleteTarget.user_id));
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(String(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleRoleChange = (userId: string, roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    setUsers(prev => prev.map(u =>
      u.user_id === userId ? { ...u, role_id: roleId, role_name: role?.name ?? null } : u
    ));
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || u.email.toLowerCase().includes(q)
      || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q);
    const matchRole = filterRole === 'ALL' || u.role_name === filterRole;
    const matchStatus = filterStatus === 'ALL' || u.status === filterStatus;
    return matchSearch && matchRole && matchStatus;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'ACTIVE').length,
    byRole: Object.fromEntries(roles.map(r => [r.name, users.filter(u => u.role_name === r.name).length])),
  };

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full bg-[#f8f9fc] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight">Utilisateurs</h2>
          <p className="text-slate-400 text-[13px] mt-0.5">
            {stats.total} compte{stats.total > 1 ? 's' : ''} · {stats.active} actif{stats.active > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[13px] font-semibold shadow-[0_4px_14px_rgb(79,70,229,0.35)] hover:shadow-[0_6px_20px_rgb(79,70,229,0.45)] transition-all"
        >
          <Plus size={15} /> Nouvel utilisateur
        </button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {roles.map(r => {
          const s = roleStyle[r.name] ?? { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' };
          return (
            <button
              key={r.id}
              onClick={() => setFilterRole(filterRole === r.name ? 'ALL' : r.name)}
              className={`rounded-xl p-4 border text-left transition-all ${filterRole === r.name ? 'ring-2 ring-indigo-500 border-indigo-200' : 'border-slate-200 hover:border-slate-300'} ${s.bg}`}
            >
              <p className={`text-2xl font-bold ${s.text}`}>{stats.byRole[r.name] ?? 0}</p>
              <p className={`text-[11px] font-semibold mt-1 ${s.text} opacity-75`}>{r.name}</p>
            </button>
          );
        })}
      </div>

      {/* Barre de recherche + filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un utilisateur..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-all"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="ACTIVE">Actifs</option>
          <option value="SUSPENDED">Suspendus</option>
        </select>
        <button onClick={loadData} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Tableau utilisateurs */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw size={24} className="animate-spin text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <UserCircle2 size={28} className="text-slate-300" />
          </div>
          <p className="font-semibold text-slate-600 mb-1">Aucun utilisateur trouvé</p>
          <p className="text-slate-400 text-sm">
            {search ? 'Modifiez votre recherche ou' : 'Commencez par'} créer un utilisateur.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200 shadow-[0_1px_0_0_#e2e8f0]">
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Utilisateur</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Rôle</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Téléphone</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Statut</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Créé le</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <UserRow
                  key={user.user_id}
                  user={user}
                  roles={roles}
                  schoolId={schoolId}
                  actorId={actorId}
                  onToggle={handleToggle}
                  onRoleChange={handleRoleChange}
                  onDelete={setDeleteTarget}
                />
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      </div>

      {/* Modal création */}
      {showCreate && (
        <CreateUserModal
          roles={roles}
          schoolId={schoolId}
          actorId={actorId}
          onClose={() => setShowCreate(false)}
          onCreated={u => setUsers(prev => [u, ...prev])}
        />
      )}

      {/* Modal confirmation suppression */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Supprimer l'utilisateur ?</h3>
              <p className="text-sm text-slate-500 mb-2">
                Vous êtes sur le point de supprimer définitivement le compte de :
              </p>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mb-4 text-left">
                <p className="font-semibold text-slate-800 text-sm">
                  {deleteTarget.first_name || deleteTarget.last_name
                    ? `${deleteTarget.first_name ?? ''} ${deleteTarget.last_name ?? ''}`.trim()
                    : 'Sans nom'}
                </p>
                <p className="text-xs text-slate-400">{deleteTarget.email}</p>
                <p className="text-[11px] font-medium text-indigo-600 mt-1">{deleteTarget.role_name}</p>
              </div>
              <p className="text-xs text-rose-600 font-medium bg-rose-50 rounded-lg p-2 mb-4">
                Cette action supprimera également son profil, ses rôles et son mot de passe.
              </p>

              {deleteError && (
                <p className="text-xs text-rose-600 mb-3 text-left bg-rose-50 border border-rose-100 rounded-lg p-2">
                  {deleteError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 shadow-lg shadow-rose-600/30"
                >
                  {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {deleting ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
