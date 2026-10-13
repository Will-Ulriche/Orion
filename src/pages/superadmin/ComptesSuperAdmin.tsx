import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  KeyRound, Plus, RefreshCw, Copy, Check, Eye, EyeOff,
  Building2, UserCheck, Power, Trash2,
  Sparkles, AlertCircle, Users, GraduationCap,
  ClipboardList, ArrowRight, Search,
} from 'lucide-react';
import { Badge, Btn, EmptyState, Field, Modal, SearchInput, Select, TableShell, Td, Th, TextInput, type Tone } from '../../components/ui';
import SuperAdminShell from './SuperAdminShell';
import {
  listSchoolCredentials, resetSchoolAdminPassword, setSchoolCredentialStatus, deleteSchoolCredential,
  createAdminForSchool, listSchools,
  type SchoolCredential, type School, type SchoolAdminInput,
} from '../../lib/superAdminApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  school_id: string;
  nom: string;
  prenoms: string;
  matricule: string | null;
  type_personnel: string | null;
  fonction: string | null;
  email: string | null;
  telephone_principal: string | null;
  est_actif: boolean;
}

// La Direction est toujours créée depuis la section Établissements (Ecoles.tsx)
// — ici on ne gère que Secrétaire et Professeur.
type CreationStep = 'role' | 'staff_pick' | 'credentials';
type TargetRole = 'SECRETAIRE' | 'PROFESSEUR';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateSecurePassword = () => {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  let pass = '';
  for (let i = 0; i < 10; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Orion@${pass}`;
};

const ROLE_CONFIG: Record<TargetRole, { label: string; desc: string; icon: React.ComponentType<any>; tone: string; color: string }> = {
  SECRETAIRE: {
    label: 'Secrétaire',
    desc: 'Accès gestion des élèves, des classes et des inscriptions. Basé sur le personnel existant.',
    icon: ClipboardList,
    tone: 'emerald',
    color: 'emerald',
  },
  PROFESSEUR: {
    label: 'Professeur',
    desc: 'Accès aux notes, à la pédagogie et aux classes assignées. Basé sur le personnel existant.',
    icon: GraduationCap,
    tone: 'amber',
    color: 'amber',
  },
};

// ─── Modal de création en plusieurs étapes ────────────────────────────────────

function CreateAccessModal({
  schools,
  initialSchoolId,
  onClose,
  onCreated,
}: {
  schools: School[];
  initialSchoolId: string;
  onClose: () => void;
  onCreated: (email: string, pass: string, schoolName: string) => void;
}) {
  const [step, setStep] = useState<CreationStep>('role');
  const [selectedSchoolId, setSelectedSchoolId] = useState(initialSchoolId || (schools[0]?.id ?? ''));
  const [selectedRole, setSelectedRole] = useState<TargetRole | null>(null);

  // Étape 2 : sélection du personnel
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  // Étape 3 : identifiants
  const [form, setForm] = useState<SchoolAdminInput>({
    email: '',
    password: generateSecurePassword(),
    first_name: '',
    last_name: '',
    phone: '',
    role: 'DIRECTION',
  });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Chargement du personnel quand on passe à l'étape staff_pick
  const loadStaff = async (schoolId: string) => {
    setStaffLoading(true);
    setStaffError('');
    setStaffList([]);
    try {
      const list = await invoke<StaffMember[]>('get_staff', { schoolId, includePhotos: false });
      setStaffList(list.filter(s => s.est_actif));
    } catch (e: any) {
      setStaffError(
        typeof e === 'string' ? e : (e?.message ?? 'Impossible de charger le personnel local.')
      );
    } finally {
      setStaffLoading(false);
    }
  };

  const handleRoleSelect = (role: TargetRole) => {
    setSelectedRole(role);
    // Toujours sélectionner dans le personnel (Secrétaire ou Professeur)
    loadStaff(selectedSchoolId);
    setStep('staff_pick');
  };

  const handleStaffSelect = (staff: StaffMember) => {
    setSelectedStaff(staff);
    setForm({
      email: staff.email ?? '',
      password: generateSecurePassword(),
      first_name: staff.prenoms,
      last_name: staff.nom,
      phone: staff.telephone_principal ?? '',
      role: selectedRole!,
    });
    setStep('credentials');
  };

  const handleCreate = async () => {
    if (!form.email.trim() || !form.email.includes('@')) {
      setSaveError('Email de connexion invalide.');
      return;
    }
    if (!form.password || form.password.length < 6) {
      setSaveError('Mot de passe trop court (min 6 caractères).');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const sch = schools.find(s => s.id === selectedSchoolId);
      const res = await createAdminForSchool(selectedSchoolId, form);
      onCreated(res.email, res.password, sch?.name ?? 'Établissement');
      onClose();
    } catch (e: any) {
      setSaveError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter(s =>
      `${s.nom} ${s.prenoms} ${s.matricule ?? ''} ${s.type_personnel ?? ''} ${s.fonction ?? ''}`.toLowerCase().includes(q)
    );
  }, [staffList, staffSearch]);

  const selectedSchool = schools.find(s => s.id === selectedSchoolId);

  return (
    <Modal
      title={
        step === 'role' ? "Créer un accès — Choisir le rôle" :
        step === 'staff_pick' ? `Sélectionner le membre du personnel` :
        "Définir les identifiants de connexion"
      }
      description={
        step === 'role' ? "Sélectionnez d'abord l'établissement et le type d'accès à créer." :
        step === 'staff_pick' ? `Choisissez un membre actif de ${selectedSchool?.name ?? "l'établissement"} pour lui créer un accès.` :
        `Les identifiants seront associés à l'établissement sélectionné.`
      }
      onClose={onClose}
      footer={
        step === 'credentials' ? (
          <>
            <Btn onClick={() => setStep('staff_pick')}>Retour</Btn>
            <Btn variant="primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Création en cours…' : 'Créer les identifiants'}
            </Btn>
          </>
        ) : step === 'staff_pick' ? (
          <>
            <Btn onClick={() => setStep('role')}>Retour</Btn>
          </>
        ) : (
          <Btn onClick={onClose}>Annuler</Btn>
        )
      }
    >
      {/* ── Étape 1 : Choisir établissement + rôle ── */}
      {step === 'role' && (
        <div className="space-y-5">
          {/* Note : Direction gérée depuis Établissements */}
          <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200/60 text-xs text-indigo-800 flex items-start gap-2">
            <Building2 size={15} className="shrink-0 mt-0.5 text-indigo-500" />
            <span>
              Le compte <strong>Direction</strong> est créé automatiquement lors de la création de l'établissement.
              Pour le modifier ou en recréer un, allez dans la section <strong>Établissements</strong>.
            </span>
          </div>

          <Field label="Établissement concerné" required>
            <Select
              value={selectedSchoolId}
              onChange={e => setSelectedSchoolId(e.target.value)}
            >
              {schools.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.short_name ? ` (${s.short_name})` : ''} — {s.city ?? 'Togo'}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Type d'accès à créer
            </p>
            <div className="space-y-3">
              {(Object.entries(ROLE_CONFIG) as [TargetRole, typeof ROLE_CONFIG[TargetRole]][]).map(([role, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button
                    key={role}
                    onClick={() => handleRoleSelect(role)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all hover:shadow-md cursor-pointer
                      border-slate-200 bg-white hover:border-${cfg.color}-300 hover:bg-${cfg.color}-50/40`}
                  >
                    <div className={`w-11 h-11 rounded-xl bg-${cfg.color}-100 text-${cfg.color}-600 flex items-center justify-center shrink-0`}>
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-[14px]">{cfg.label}</p>
                      <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{cfg.desc}</p>
                    </div>
                    <ArrowRight size={16} className="text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Étape 2 : Sélection personnel ── */}
      {step === 'staff_pick' && (
        <div className="space-y-4">
          {/* Info : pourquoi cette étape */}
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/60 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
            <span>
              Pour créer un accès <strong>{ROLE_CONFIG[selectedRole!]?.label}</strong>, le membre du personnel doit d'abord être enregistré
              dans la liste du personnel de l'établissement (via l'interface Direction).
            </span>
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={staffSearch}
              onChange={e => setStaffSearch(e.target.value)}
              placeholder="Rechercher par nom, matricule, fonction…"
              className="w-full pl-9 pr-4 py-2.5 text-[13px] border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
          </div>

          {staffLoading ? (
            <div className="flex items-center justify-center py-10 gap-3 text-slate-500 text-[13px]">
              <SpinnerIcon size={18} className="animate-spin text-indigo-500" />
              Chargement du personnel…
            </div>
          ) : staffError ? (
            <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-sm text-red-700">
              <p className="font-semibold mb-1">Impossible de charger le personnel</p>
              <p className="text-xs">{staffError}</p>
              <p className="text-xs mt-2 text-red-600">
                Assurez-vous que la Direction a d'abord ajouté des membres dans la section Personnel de l'application.
              </p>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Users size={32} className="mx-auto text-slate-300" />
              <p className="text-[14px] font-semibold text-slate-600">Aucun personnel enregistré</p>
              <p className="text-[12px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                La Direction doit d'abord créer la liste du personnel dans son interface avant de pouvoir leur attribuer un accès.
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {filteredStaff.map(staff => (
                <button
                  key={staff.id}
                  onClick={() => handleStaffSelect(staff)}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 text-left transition-all cursor-pointer group"
                >
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 font-bold text-[13px]">
                    {staff.nom.charAt(0)}{staff.prenoms.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800">
                      {staff.nom} {staff.prenoms}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      {staff.matricule && <span className="font-mono">{staff.matricule}</span>}
                      {staff.type_personnel && <span>• {staff.type_personnel}</span>}
                      {staff.fonction && <span>• {staff.fonction}</span>}
                    </div>
                    {staff.email && (
                      <p className="text-[11px] text-slate-400 mt-0.5">{staff.email}</p>
                    )}
                  </div>
                  <ArrowRight size={15} className="text-slate-300 group-hover:text-indigo-500 shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400 text-center">
            {filteredStaff.length} membre{filteredStaff.length > 1 ? 's' : ''} actif{filteredStaff.length > 1 ? 's' : ''} trouvé{filteredStaff.length > 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* ── Étape 3 : Identifiants ── */}
      {step === 'credentials' && (
        <div className="space-y-4">
          {saveError && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700">
              {saveError}
            </div>
          )}

          {/* Récapitulatif de la sélection */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl bg-${ROLE_CONFIG[selectedRole!]?.color}-100 text-${ROLE_CONFIG[selectedRole!]?.color}-600 flex items-center justify-center shrink-0`}>
              {selectedRole && (() => { const Icon = ROLE_CONFIG[selectedRole].icon; return <Icon size={17} />; })()}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-slate-700">
                {ROLE_CONFIG[selectedRole!]?.label}
                {selectedStaff && ` — ${selectedStaff.nom} ${selectedStaff.prenoms}`}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {schools.find(s => s.id === selectedSchoolId)?.name ?? selectedSchoolId}
              </p>
            </div>
          </div>

          <Field label="Email de connexion (Identifiant)" required>
            <TextInput
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="prenom.nom@ecole.tg"
            />
          </Field>

          <Field label="Mot de passe" required>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-3.5 py-2.5 pr-24 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none text-sm text-slate-700 font-mono"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, password: generateSecurePassword() }))}
                  className="px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                >
                  Générer
                </button>
              </div>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" required>
              <TextInput
                value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                placeholder="Prénom"
              />
            </Field>
            <Field label="Nom" required>
              <TextInput
                value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                placeholder="Nom de famille"
              />
            </Field>
          </div>

          <Field label="Téléphone (optionnel)">
            <TextInput
              value={form.phone ?? ''}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+228 90 00 00 00"
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ─── Spinner inline (mini) ───────────────────────────────────────────────────
function SpinnerIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ComptesSuperAdmin() {
  const [credentials, setCredentials] = useState<SchoolCredential[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterSchoolId, setFilterSchoolId] = useState<string>('ALL');

  // Cache des mots de passe en session
  const [passwordsMap, setPasswordsMap] = useState<Record<string, string>>({});
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Modale création
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [defaultSchoolForCreate, setDefaultSchoolForCreate] = useState('');

  // Modale réinitialisation
  const [resetTarget, setResetTarget] = useState<SchoolCredential | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState(generateSecurePassword());
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Modale succès
  const [resultModal, setResultModal] = useState<{ email: string; pass: string; schoolName: string } | null>(null);

  // Modale suppression
  const [deleteTarget, setDeleteTarget] = useState<SchoolCredential | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [creds, schs] = await Promise.all([listSchoolCredentials(), listSchools()]);
      setCredentials(creds);
      setSchools(schs);
      setPasswordsMap(prev => {
        const next = { ...prev };
        creds.forEach(c => {
          if (c.initialPassword) {
            next[c.userId] = c.initialPassword;
            next[c.email] = c.initialPassword;
          }
        });
        return next;
      });
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return credentials.filter(c => {
      const matchSchool = filterSchoolId === 'ALL' || c.schoolId === filterSchoolId;
      if (!matchSchool) return false;
      if (!q) return true;
      return `${c.schoolName} ${c.schoolShortName ?? ''} ${c.email} ${c.firstName} ${c.lastName} ${c.role}`.toLowerCase().includes(q);
    });
  }, [credentials, search, filterSchoolId]);

  const stats = useMemo(() => {
    const total = credentials.length;
    const active = credentials.filter(c => c.status === 'ACTIVE').length;
    const uniqueSchools = new Set(credentials.map(c => c.schoolId)).size;
    return { total, active, uniqueSchools };
  }, [credentials]);

  const copyText = (val: string, id: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyCredentialCard = (c: SchoolCredential) => {
    const text = [
      `🎓 ÉTABLISSEMENT : ${c.schoolName}`,
      `👤 RESPONSABLE   : ${c.firstName} ${c.lastName}`.trim(),
      `📧 EMAIL (LOGIN) : ${c.email}`,
      `🏷️ RÔLE          : ${c.role}`,
      c.licenseKey ? `🎟️ LICENCE ORION : ${c.licenseKey}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedId(c.userId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (!newPasswordValue || newPasswordValue.length < 6) {
      setError('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await resetSchoolAdminPassword(resetTarget.userId, newPasswordValue);
      setPasswordsMap(prev => ({
        ...prev,
        [resetTarget.userId]: newPasswordValue,
        [resetTarget.email]: newPasswordValue,
      }));
      setResultModal({ email: resetTarget.email, pass: newPasswordValue, schoolName: resetTarget.schoolName });
      setResetTarget(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (c: SchoolCredential) => {
    const next = c.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await setSchoolCredentialStatus(c.userId, next);
      setCredentials(prev => prev.map(x => x.userId === c.userId ? { ...x, status: next } : x));
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteSchoolCredential(deleteTarget.userId);
      setCredentials(prev => prev.filter(x => x.userId !== deleteTarget.userId));
      setDeleteTarget(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminShell
      title="Identifiants & Accès Établissements"
      subtitle="Créez et gérez les identifiants de connexion pour chaque membre du personnel"
      icon={KeyRound}
      actions={
        <div className="flex items-center gap-2">
          <Btn variant="ghost" onClick={load} title="Rafraîchir"><RefreshCw size={15} /></Btn>
          <Btn
            variant="primary"
            onClick={() => {
              setDefaultSchoolForCreate(filterSchoolId !== 'ALL' ? filterSchoolId : (schools[0]?.id ?? ''));
              setCreateModalOpen(true);
            }}
          >
            <Plus size={15} /> Créer un accès
          </Btn>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 font-bold ml-2">×</button>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total Comptes', value: stats.total, icon: KeyRound, bg: 'bg-indigo-50', text: 'text-indigo-600' },
          { label: 'Comptes Actifs', value: stats.active, icon: UserCheck, bg: 'bg-emerald-50', text: 'text-emerald-600' },
          { label: 'Établissements', value: stats.uniqueSchools, icon: Building2, bg: 'bg-sky-50', text: 'text-sky-600' },
        ].map(({ label, value, icon: Icon, bg, text }) => (
          <div key={label} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-3.5">
            <div className={`w-10 h-10 rounded-xl ${bg} ${text} flex items-center justify-center`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
              <p className="text-xl font-bold text-slate-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      {!loading && credentials.length > 0 && (
        <div className="mb-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher par utilisateur, email, rôle…"
              className="w-full sm:w-72"
            />
            <div className="flex items-center gap-2 min-w-[240px]">
              <Building2 size={16} className="text-slate-400 shrink-0 ml-1" />
              <Select
                value={filterSchoolId}
                onChange={e => setFilterSchoolId(e.target.value)}
                className="w-full text-xs font-medium"
              >
                <option value="ALL">🏫 Tous les établissements ({schools.length})</option>
                {schools.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.short_name ? ` (${s.short_name})` : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Btn
            variant="primary"
            onClick={() => {
              setDefaultSchoolForCreate(filterSchoolId !== 'ALL' ? filterSchoolId : (schools[0]?.id ?? ''));
              setCreateModalOpen(true);
            }}
            className="shrink-0"
          >
            <Plus size={15} /> Créer un accès
          </Btn>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-slate-500">
          <SpinnerIcon size={22} className="animate-spin text-indigo-500" />
          <span className="text-[14px]">Chargement des identifiants…</span>
        </div>
      ) : credentials.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Aucun compte créé"
          description="Commencez par créer le compte Direction pour un établissement, puis ajoutez les professeurs et secrétaires."
          action={
            <Btn variant="primary" onClick={() => { setDefaultSchoolForCreate(schools[0]?.id ?? ''); setCreateModalOpen(true); }}>
              <Plus size={15} /> Créer un premier accès
            </Btn>
          }
        />
      ) : (
        <TableShell>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Établissement</Th>
                <Th>Utilisateur</Th>
                <Th className="text-center">Rôle</Th>
                <Th>Identifiant (Email)</Th>
                <Th>Mot de passe</Th>
                <Th className="text-center">Statut</Th>
                <Th>Licence</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const isActive = c.status === 'ACTIVE';
                const cachedPass = passwordsMap[c.email] || passwordsMap[c.userId];
                const isRevealed = revealedPasswords[c.userId] ?? false;

                const roleTone: Tone =
                  c.role === 'DIRECTION' ? 'brand' :
                  c.role === 'SECRETAIRE' ? 'emerald' :
                  c.role === 'PROFESSEUR' ? 'amber' : 'slate';

                const roleLabel =
                  c.role === 'DIRECTION' ? 'Direction' :
                  c.role === 'SECRETAIRE' ? 'Secrétaire' :
                  c.role === 'PROFESSEUR' ? 'Professeur' : c.role;

                return (
                  <tr key={c.userId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                          <Building2 size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-800">{c.schoolName}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            {c.schoolShortName && <span>{c.schoolShortName}</span>}
                            {c.schoolCity && <span>• {c.schoolCity}</span>}
                          </div>
                        </div>
                      </div>
                    </Td>

                    <Td>
                      <div>
                        <p className="text-[13px] font-medium text-slate-700">
                          {c.firstName || c.lastName ? `${c.firstName} ${c.lastName}`.trim() : '—'}
                        </p>
                        {c.phone && <p className="text-[11px] text-slate-400">{c.phone}</p>}
                      </div>
                    </Td>

                    <Td className="text-center">
                      <Badge tone={roleTone}>{roleLabel}</Badge>
                    </Td>

                    <Td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[12px] font-semibold text-slate-800 select-all">{c.email}</span>
                        <button
                          onClick={() => copyText(c.email, `email-${c.userId}`)}
                          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                          title="Copier l'email"
                        >
                          {copiedId === `email-${c.userId}` ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </Td>

                    <Td>
                      {cachedPass ? (
                        <div className="flex items-center gap-1.5 bg-slate-100/80 px-2 py-1 rounded-lg border border-slate-200/60 max-w-fit">
                          <span className="font-mono text-[12px] font-semibold text-slate-800 select-all">
                            {isRevealed ? cachedPass : '••••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRevealedPasswords(prev => ({ ...prev, [c.userId]: !isRevealed }))}
                            className="p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                            title={isRevealed ? 'Masquer' : 'Afficher'}
                          >
                            {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyText(cachedPass, `pass-${c.userId}`)}
                            className="p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                            title="Copier"
                          >
                            {copiedId === `pass-${c.userId}` ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="italic">Chiffré</span>
                          <button
                            type="button"
                            onClick={() => { setResetTarget(c); setNewPasswordValue(generateSecurePassword()); setShowResetPassword(false); }}
                            className="text-[11px] text-indigo-600 hover:underline font-medium cursor-pointer"
                          >
                            Définir
                          </button>
                        </div>
                      )}
                    </Td>

                    <Td className="text-center">
                      <Badge tone={isActive ? 'emerald' : 'slate' as Tone}>
                        {isActive ? 'Actif' : 'Suspendu'}
                      </Badge>
                    </Td>

                    <Td>
                      {c.licenseKey ? (
                        <div className="flex items-center gap-1 text-[11.5px] font-mono text-slate-600">
                          <span className="truncate max-w-[110px]">{c.licenseKey}</span>
                          <button onClick={() => copyText(c.licenseKey!, `lic-${c.userId}`)} className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer">
                            {copiedId === `lic-${c.userId}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Aucune</span>
                      )}
                    </Td>

                    <Td className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        <Btn
                          variant="ghost"
                          onClick={() => copyCredentialCard(c)}
                          title="Copier la fiche d'accès"
                          className="!h-8 !px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                        >
                          {copiedId === c.userId ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        </Btn>
                        <Btn
                          variant="ghost"
                          onClick={() => { setResetTarget(c); setNewPasswordValue(generateSecurePassword()); setShowResetPassword(false); }}
                          title="Réinitialiser le mot de passe"
                          className="!h-8 !px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        >
                          <KeyRound size={14} />
                        </Btn>
                        <Btn
                          variant="ghost"
                          onClick={() => handleToggleStatus(c)}
                          title={isActive ? 'Suspendre' : 'Réactiver'}
                          className="!h-8 !px-2"
                        >
                          <Power size={14} className={isActive ? 'text-slate-500' : 'text-emerald-600'} />
                        </Btn>
                        <Btn
                          variant="ghost"
                          onClick={() => setDeleteTarget(c)}
                          title="Supprimer"
                          className="!h-8 !px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 size={14} />
                        </Btn>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      {/* ── Modal création multi-étapes ── */}
      {createModalOpen && schools.length > 0 && (
        <CreateAccessModal
          schools={schools}
          initialSchoolId={defaultSchoolForCreate}
          onClose={() => setCreateModalOpen(false)}
          onCreated={(email, pass, schoolName) => {
            setPasswordsMap(prev => ({ ...prev, [email]: pass }));
            setResultModal({ email, pass, schoolName });
            load();
          }}
        />
      )}

      {/* ── Modal résultat / succès ── */}
      {resultModal && (
        <Modal
          title="Identifiants créés avec succès !"
          description="Transmettez ces informations à l'utilisateur concerné."
          onClose={() => setResultModal(null)}
          footer={
            <div className="flex w-full items-center justify-between">
              <Btn
                variant="primary"
                onClick={() => {
                  const txt = [
                    `🎓 ÉTABLISSEMENT : ${resultModal.schoolName}`,
                    `📧 EMAIL D'ACCÈS : ${resultModal.email}`,
                    `🔑 MOT DE PASSE  : ${resultModal.pass}`,
                  ].join('\n');
                  navigator.clipboard.writeText(txt);
                  setCopiedId('result-copy');
                  setTimeout(() => setCopiedId(null), 2000);
                }}
              >
                {copiedId === 'result-copy' ? <Check size={16} /> : <Copy size={16} />}
                {copiedId === 'result-copy' ? 'Copié !' : 'Copier les accès'}
              </Btn>
              <Btn onClick={() => setResultModal(null)}>Fermer</Btn>
            </div>
          }
        >
          <div className="rounded-xl bg-slate-900 text-white p-5 space-y-3 font-mono text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-sans font-semibold text-sm pb-2 border-b border-slate-800">
              <Sparkles size={16} />
              <span>Accès créé</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-slate-400">Établissement :</span>
              <span className="col-span-2 font-semibold text-white">{resultModal.schoolName}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-slate-400">Email (Login) :</span>
              <span className="col-span-2 font-bold text-amber-300 select-all">{resultModal.email}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-slate-400">Mot de passe :</span>
              <span className="col-span-2 font-bold text-emerald-300 select-all">{resultModal.pass}</span>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal réinitialisation mot de passe ── */}
      {resetTarget && (
        <Modal
          title="Réinitialiser le mot de passe"
          description={`Nouveau mot de passe pour ${resetTarget.email} (${resetTarget.schoolName}).`}
          onClose={() => setResetTarget(null)}
          footer={
            <>
              <Btn onClick={() => setResetTarget(null)}>Annuler</Btn>
              <Btn variant="primary" onClick={handleResetPassword} disabled={saving}>
                {saving ? 'Mise à jour…' : 'Appliquer'}
              </Btn>
            </>
          }
        >
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/60 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
              <span>L'ancien mot de passe sera immédiatement remplacé.</span>
            </div>
            <Field label="Nouveau mot de passe" required>
              <div className="relative">
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  value={newPasswordValue}
                  onChange={e => setNewPasswordValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-24 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none text-sm text-slate-700 font-mono"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button type="button" onClick={() => setShowResetPassword(!showResetPassword)} className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer">
                    {showResetPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button type="button" onClick={() => setNewPasswordValue(generateSecurePassword())} className="px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer">
                    Générer
                  </button>
                </div>
              </div>
            </Field>
          </div>
        </Modal>
      )}

      {/* ── Modal suppression ── */}
      {deleteTarget && (
        <Modal
          title="Supprimer ce compte d'accès ?"
          description={`Cette action supprimera définitivement le compte de ${deleteTarget.email} (${deleteTarget.schoolName}).`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Btn onClick={() => setDeleteTarget(null)}>Annuler</Btn>
              <Btn variant="danger" onClick={handleDelete} disabled={saving}>
                {saving ? 'Suppression…' : 'Confirmer la suppression'}
              </Btn>
            </>
          }
        >
          <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700">
            ⚠️ L'utilisateur ne pourra plus se connecter avec cet identifiant. L'établissement restera intact.
          </div>
        </Modal>
      )}
    </SuperAdminShell>
  );
}
