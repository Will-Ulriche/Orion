import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Plus, RefreshCw, Pencil, Power, MapPin, KeyRound,
  Eye, EyeOff, Copy, Check, Sparkles, ArrowUpRight, Trash2, AlertTriangle
} from 'lucide-react';
import { Badge, Btn, EmptyState, Field, Loader, Modal, SearchInput, Select, TableShell, Td, Th, TextInput, type Tone } from '../../components/ui';
import SuperAdminShell from './SuperAdminShell';
import { useAuth } from '../../contexts/AuthContext';
import {
  createSchoolWithAdmin, createAdminForSchool, listSchools, listSchoolCredentials, setSchoolStatus, updateSchool, deleteSchool,
  SCHOOL_STATUSES, type School, type SchoolInput, type SchoolAdminInput, type CreateSchoolResult
} from '../../lib/superAdminApi';

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'emerald' },
  SUSPENDED: { label: 'Suspendue', tone: 'amber' },
  CLOSED: { label: 'Fermée', tone: 'slate' },
};

const EMPTY_SCHOOL_FORM: SchoolInput = {
  name: '', short_name: null, city: 'Lomé', country: 'Togo',
  phone_primary: null, email: null, status: 'ACTIVE',
};

const generateSecurePassword = () => {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  let pass = '';
  for (let i = 0; i < 10; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Orion@${pass}`;
};

export default function Ecoles() {
  const navigate = useNavigate();
  const { enterSchoolMode, forcedSchoolId, exitSchoolMode } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolsWithDirection, setSchoolsWithDirection] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modale création école + identifiants
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [schoolForm, setSchoolForm] = useState<SchoolInput>(EMPTY_SCHOOL_FORM);
  const [adminForm, setAdminForm] = useState<SchoolAdminInput>({
    email: '',
    password: generateSecurePassword(),
    first_name: 'Direction',
    last_name: '',
    phone: '',
    role: 'DIRECTION',
  });
  const [autoLicense, setAutoLicense] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // Modale modification école
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);

  // Modale création d'identifiants pour école existante
  const [existingSchoolAccountModal, setExistingSchoolAccountModal] = useState<School | null>(null);
  const [existingAdminForm, setExistingAdminForm] = useState<SchoolAdminInput>({
    email: '',
    password: generateSecurePassword(),
    first_name: 'Direction',
    last_name: '',
    phone: '',
    role: 'DIRECTION',
  });

  // Modale de succès récapitulatif
  const [createdSummary, setCreatedSummary] = useState<CreateSchoolResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modale suppression établissement
  const [deleteTarget, setDeleteTarget] = useState<School | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [schoolsData, credsData] = await Promise.all([
        listSchools(),
        listSchoolCredentials().catch(() => []),
      ]);
      setSchools(schoolsData);
      const dirSet = new Set(
        credsData.filter((c: any) => c.role === 'DIRECTION').map((c: any) => c.schoolId)
      );
      setSchoolsWithDirection(dirSet);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    const defaultPassword = generateSecurePassword();
    setSchoolForm(EMPTY_SCHOOL_FORM);
    setAdminForm({
      email: '',
      password: defaultPassword,
      first_name: 'Direction',
      last_name: '',
      phone: '',
      role: 'DIRECTION',
    });
    setAutoLicense(true);
    setShowPassword(false);
    setCreateModalOpen(true);
  };

  const openEdit = (s: School) => {
    setEditingSchool(s);
    setSchoolForm({
      name: s.name, short_name: s.short_name, city: s.city, country: s.country,
      phone_primary: s.phone_primary, email: s.email, status: s.status,
    });
    setEditModalOpen(true);
  };

  const openAddCredentials = (s: School) => {
    if (schoolsWithDirection.has(s.id)) {
      setError(`Cet établissement (${s.name}) possède déjà un compte de Direction. Un seul profil de Direction est autorisé.`);
      return;
    }
    setExistingSchoolAccountModal(s);
    setExistingAdminForm({
      email: s.email || `direction@${(s.short_name || 'ecole').toLowerCase().replace(/\s+/g, '')}.tg`,
      password: generateSecurePassword(),
      first_name: 'Direction',
      last_name: s.name,
      phone: s.phone_primary || '',
      role: 'DIRECTION',
    });
    setShowPassword(false);
  };

  const handleSaveCreate = async () => {
    if (!schoolForm.name.trim()) {
      setError("Le nom de l'établissement est obligatoire.");
      return;
    }
    if (!adminForm.email.trim() || !adminForm.email.includes('@')) {
      setError("L'email de connexion administrateur est obligatoire et doit être valide.");
      return;
    }
    if (!adminForm.password || adminForm.password.length < 6) {
      setError("Le mot de passe de connexion doit comporter au moins 6 caractères.");
      return;
    }
    if (!adminForm.first_name.trim() || !adminForm.last_name.trim()) {
      setError("Le prénom et le nom du responsable sont obligatoires.");
      return;
    }

    setSaving(true);
    setError('');
    try {
      const result = await createSchoolWithAdmin({
        school: schoolForm,
        admin: adminForm,
        createLicense: autoLicense,
      });

      setCreateModalOpen(false);
      setCreatedSummary(result);
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSchool) return;
    if (!schoolForm.name.trim()) { setError("Le nom de l'établissement est obligatoire."); return; }
    setSaving(true);
    setError('');
    try {
      await updateSchool(editingSchool.id, schoolForm);
      setEditModalOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExistingAdmin = async () => {
    if (!existingSchoolAccountModal) return;
    if (!existingAdminForm.email.trim() || !existingAdminForm.email.includes('@')) {
      setError("L'email de connexion doit être valide.");
      return;
    }
    if (!existingAdminForm.password || existingAdminForm.password.length < 6) {
      setError("Le mot de passe doit comporter au moins 6 caractères.");
      return;
    }

    setSaving(true);
    setError('');
    try {
      const creds = await createAdminForSchool(existingSchoolAccountModal.id, existingAdminForm);
      setCreatedSummary({
        school: existingSchoolAccountModal,
        adminUser: {
          id: '',
          email: creds.email,
          password: creds.password,
          name: creds.name,
        },
        licenseKey: null,
      });
      setExistingSchoolAccountModal(null);
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (s: School) => {
    const next = s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await setSchoolStatus(s.id, next);
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  // Suppression définitive d'un établissement (avec confirmation)
  const handleDeleteSchool = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const target = deleteTarget;
      await deleteSchool(target.id);
      setSchools(prev => prev.filter(s => s.id !== target.id));
      // Si cet établissement était ouvert en mode « direction », on en sort
      if (forcedSchoolId === target.id) exitSchoolMode();
      setDeleteTarget(null);
    } catch (e: any) {
      setDeleteError(e.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  };

  const copyCredentialsText = () => {
    if (!createdSummary) return;
    const text = [
      `🎓 ÉTABLISSEMENT : ${createdSummary.school.name}`,
      `👤 RESPONSABLE   : ${createdSummary.adminUser.name}`,
      `📧 EMAIL D'ACCÈS : ${createdSummary.adminUser.email}`,
      `🔑 MOT DE PASSE  : ${createdSummary.adminUser.password}`,
      createdSummary.licenseKey ? `🎟️ LICENCE ORION : ${createdSummary.licenseKey}` : '',
      `\nConnectez-vous sur Orion avec ces identifiants pour démarrer.`,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const openSchoolSpace = (s: School) => {
    // Bascule dans l'espace direction de cet établissement (réactif via AuthContext)
    enterSchoolMode(s.id, s.name);
    navigate('/', { replace: true });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter((s) =>
      `${s.name} ${s.short_name ?? ''} ${s.city ?? ''} ${s.country ?? ''} ${s.email ?? ''}`.toLowerCase().includes(q)
    );
  }, [schools, search]);

  return (
    <SuperAdminShell
      title="Établissements"
      subtitle="Créez et configurez les établissements avec leurs accès administrateur"
      icon={Building2}
      actions={
        <>
          <Btn variant="ghost" onClick={load} title="Rafraîchir"><RefreshCw size={15} /></Btn>
          <Btn variant="primary" onClick={openCreate}><Plus size={15} /> Nouvel établissement</Btn>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 font-bold ml-2">×</button>
        </div>
      )}

      {!loading && schools.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un établissement…" className="w-full sm:w-72" />
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ArrowUpRight size={13} className="text-brand-500" />
            Cliquez sur une ligne pour ouvrir l'espace direction de l'établissement.
          </p>
        </div>
      )}

      {loading ? (
        <Loader label="Chargement des établissements…" />
      ) : schools.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucun établissement"
          description="Créez votre première école avec ses identifiants de connexion."
          action={<Btn variant="primary" onClick={openCreate}><Plus size={15} /> Nouvel établissement</Btn>}
        />
      ) : (
        <TableShell>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Établissement</Th>
                <Th>Localisation</Th>
                <Th>Contact</Th>
                <Th className="text-center">Statut</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const meta = STATUS_META[s.status] ?? { label: s.status, tone: 'slate' as Tone };
                return (
                  <tr
                    key={s.id}
                    onClick={() => openSchoolSpace(s)}
                    title={`Ouvrir l'espace direction de ${s.name}`}
                    className="border-b border-slate-100 last:border-0 hover:bg-brand-50/50 cursor-pointer transition-colors"
                  >
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                          <Building2 size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-700">{s.name}</p>
                          {s.short_name && <p className="text-[11px] text-slate-400">{s.short_name}</p>}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 text-[13px] text-slate-600">
                        <MapPin size={13} className="text-slate-400" />
                        {[s.city, s.country].filter(Boolean).join(', ') || '—'}
                      </div>
                    </Td>
                    <Td>
                      <p className="text-[13px] text-slate-600">{s.phone_primary || '—'}</p>
                      <p className="text-[11px] text-slate-400">{s.email || ''}</p>
                    </Td>
                    <Td className="text-center"><Badge tone={meta.tone}>{meta.label}</Badge></Td>
                    <Td className="text-right">
                      {/* stopPropagation : ces boutons n'ouvrent pas l'espace de l'école */}
                      <div className="flex justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Btn variant="ghost" onClick={() => openSchoolSpace(s)} title="Ouvrir l'espace de l'établissement" className="!h-8 !px-2 text-brand-600 hover:text-brand-700 hover:bg-brand-50">
                          <ArrowUpRight size={14} />
                        </Btn>
                        {schoolsWithDirection.has(s.id) ? (
                          <Btn
                            variant="ghost"
                            disabled
                            title="Compte Direction déjà configuré (un seul profil autorisé par établissement)"
                            className="!h-8 !px-2 text-slate-300 cursor-not-allowed opacity-40 hover:bg-transparent"
                          >
                            <KeyRound size={14} />
                          </Btn>
                        ) : (
                          <Btn
                            variant="ghost"
                            onClick={() => openAddCredentials(s)}
                            title="Créer le compte Direction pour cette école"
                            className="!h-8 !px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                          >
                            <KeyRound size={14} />
                          </Btn>
                        )}
                        <Btn variant="ghost" onClick={() => openEdit(s)} title="Modifier" className="!h-8 !px-2"><Pencil size={14} /></Btn>
                        <Btn variant="ghost" onClick={() => toggleStatus(s)} title={s.status === 'ACTIVE' ? 'Suspendre' : 'Activer'} className="!h-8 !px-2"><Power size={14} /></Btn>
                        <Btn
                          variant="ghost"
                          onClick={() => { setDeleteError(''); setDeleteTarget(s); }}
                          title="Supprimer l'établissement"
                          className="!h-8 !px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
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

      {/* ─── MODAL CRÉATION ÉTABLISSEMENT + IDENTIFIANTS ─────────────── */}
      {createModalOpen && (
        <Modal
          title="Créer un nouvel établissement"
          description="Renseignez les coordonnées de l'école et définissez ses identifiants de connexion."
          onClose={() => setCreateModalOpen(false)}
          footer={
            <>
              <Btn onClick={() => setCreateModalOpen(false)}>Annuler</Btn>
              <Btn variant="primary" onClick={handleSaveCreate} disabled={saving}>
                {saving ? 'Création en cours…' : 'Créer l’établissement et ses accès'}
              </Btn>
            </>
          }
        >
          <div className="space-y-6">
            {/* Section 1 : Informations établissement */}
            <div>
              <div className="flex items-center gap-2 mb-3 pb-1 border-b border-slate-100 text-slate-800 font-semibold text-xs uppercase tracking-wider">
                <Building2 size={14} className="text-brand-600" />
                <span>1. Informations de l'établissement</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nom de l'établissement" required className="sm:col-span-2">
                  <TextInput
                    value={schoolForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setSchoolForm((f) => ({ ...f, name }));
                      // Préréglage automatique du nom de l'admin si non saisi
                      if (!adminForm.last_name || adminForm.last_name === schoolForm.name) {
                        setAdminForm((a) => ({ ...a, last_name: name }));
                      }
                    }}
                    placeholder="Ex: Lycée Moderne de Lomé"
                  />
                </Field>
                <Field label="Sigle / Nom court">
                  <TextInput
                    value={schoolForm.short_name ?? ''}
                    onChange={(e) => setSchoolForm((f) => ({ ...f, short_name: e.target.value || null }))}
                    placeholder="Ex: LML"
                  />
                </Field>
                <Field label="Statut">
                  <Select
                    value={schoolForm.status}
                    onChange={(e) => setSchoolForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    {SCHOOL_STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st]?.label ?? st}</option>)}
                  </Select>
                </Field>
                <Field label="Ville">
                  <TextInput
                    value={schoolForm.city ?? ''}
                    onChange={(e) => setSchoolForm((f) => ({ ...f, city: e.target.value || null }))}
                    placeholder="Ex: Lomé"
                  />
                </Field>
                <Field label="Pays">
                  <TextInput
                    value={schoolForm.country ?? ''}
                    onChange={(e) => setSchoolForm((f) => ({ ...f, country: e.target.value || null }))}
                    placeholder="Ex: Togo"
                  />
                </Field>
                <Field label="Téléphone établissement">
                  <TextInput
                    value={schoolForm.phone_primary ?? ''}
                    onChange={(e) => setSchoolForm((f) => ({ ...f, phone_primary: e.target.value || null }))}
                    placeholder="+228 90 00 00 00"
                  />
                </Field>
                <Field label="Email officiel">
                  <TextInput
                    type="email"
                    value={schoolForm.email ?? ''}
                    onChange={(e) => {
                      const email = e.target.value;
                      setSchoolForm((f) => ({ ...f, email: email || null }));
                      if (!adminForm.email) {
                        setAdminForm((a) => ({ ...a, email }));
                      }
                    }}
                    placeholder="contact@lycee.tg"
                  />
                </Field>
              </div>
            </div>

            {/* Section 2 : Identifiants administrateur */}
            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
              <div className="flex items-center justify-between mb-3 pb-1 border-b border-indigo-100 text-indigo-900 font-semibold text-xs uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <KeyRound size={14} className="text-indigo-600" />
                  <span>2. Identifiants de connexion (Accès Direction)</span>
                </div>
                <span className="text-[10.5px] text-indigo-600 lowercase font-normal">Compte de première connexion</span>
              </div>
              
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Rôle du compte créé" required className="sm:col-span-2">
                  <Select
                    value={adminForm.role || 'DIRECTION'}
                    onChange={(e) => setAdminForm((a) => ({ ...a, role: e.target.value as any }))}
                  >
                    <option value="DIRECTION">Direction (Administrateur principal)</option>
                    <option value="SECRETAIRE">Secrétaire (Gestion élèves & classes)</option>
                    <option value="PROFESSEUR">Professeur (Gestion des notes & pédagogie)</option>
                  </Select>
                </Field>

                <Field label="Email de connexion (Identifiant)" required className="sm:col-span-2">
                  <TextInput
                    type="email"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm((a) => ({ ...a, email: e.target.value }))}
                    placeholder="direction@lycee.tg"
                  />
                </Field>

                <Field label="Mot de passe initial" required className="sm:col-span-2">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={adminForm.password}
                      onChange={(e) => setAdminForm((a) => ({ ...a, password: e.target.value }))}
                      className="w-full px-3.5 py-2.5 pr-20 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none text-sm text-slate-700"
                      placeholder="Mot de passe"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded"
                        title={showPassword ? 'Masquer' : 'Afficher'}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminForm((a) => ({ ...a, password: generateSecurePassword() }))}
                        className="px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded"
                        title="Générer un mot de passe"
                      >
                        Générer
                      </button>
                    </div>
                  </div>
                </Field>

                <Field label="Prénom du responsable" required>
                  <TextInput
                    value={adminForm.first_name}
                    onChange={(e) => setAdminForm((a) => ({ ...a, first_name: e.target.value }))}
                    placeholder="Direction"
                  />
                </Field>

                <Field label="Nom du responsable" required>
                  <TextInput
                    value={adminForm.last_name}
                    onChange={(e) => setAdminForm((a) => ({ ...a, last_name: e.target.value }))}
                    placeholder="Ex: Mensah ou Nom école"
                  />
                </Field>
              </div>
            </div>

            {/* Section 3 : Licence automatique */}
            <div className="flex items-center gap-3 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
              <input
                type="checkbox"
                id="autoLicense"
                checked={autoLicense}
                onChange={(e) => setAutoLicense(e.target.checked)}
                className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="autoLicense" className="text-xs text-emerald-900 cursor-pointer select-none">
                <span className="font-semibold">Générer automatiquement une clé de licence</span> (1 an de validité, 5 appareils autorisés).
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODAL MODIFICATION ÉTABLISSEMENT ─────────────── */}
      {editModalOpen && editingSchool && (
        <Modal
          title="Modifier l'établissement"
          description="Mettre à jour les informations de l'école."
          onClose={() => setEditModalOpen(false)}
          footer={
            <>
              <Btn onClick={() => setEditModalOpen(false)}>Annuler</Btn>
              <Btn variant="primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Btn>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom de l'établissement" required className="sm:col-span-2">
              <TextInput value={schoolForm.name} onChange={(e) => setSchoolForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Nom court">
              <TextInput value={schoolForm.short_name ?? ''} onChange={(e) => setSchoolForm((f) => ({ ...f, short_name: e.target.value || null }))} />
            </Field>
            <Field label="Statut">
              <Select value={schoolForm.status} onChange={(e) => setSchoolForm((f) => ({ ...f, status: e.target.value }))}>
                {SCHOOL_STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st]?.label ?? st}</option>)}
              </Select>
            </Field>
            <Field label="Ville">
              <TextInput value={schoolForm.city ?? ''} onChange={(e) => setSchoolForm((f) => ({ ...f, city: e.target.value || null }))} />
            </Field>
            <Field label="Pays">
              <TextInput value={schoolForm.country ?? ''} onChange={(e) => setSchoolForm((f) => ({ ...f, country: e.target.value || null }))} />
            </Field>
            <Field label="Téléphone">
              <TextInput value={schoolForm.phone_primary ?? ''} onChange={(e) => setSchoolForm((f) => ({ ...f, phone_primary: e.target.value || null }))} />
            </Field>
            <Field label="Email">
              <TextInput type="email" value={schoolForm.email ?? ''} onChange={(e) => setSchoolForm((f) => ({ ...f, email: e.target.value || null }))} />
            </Field>
          </div>
        </Modal>
      )}

      {/* ─── MODAL CRÉATION ACCÈS ÉCOLE EXISTANTE ─────────────── */}
      {existingSchoolAccountModal && (
        <Modal
          title={`Créer un compte d'accès pour : ${existingSchoolAccountModal.name}`}
          description="Permet d'ajouter des identifiants de connexion Direction pour cet établissement."
          onClose={() => setExistingSchoolAccountModal(null)}
          footer={
            <>
              <Btn onClick={() => setExistingSchoolAccountModal(null)}>Annuler</Btn>
              <Btn variant="primary" onClick={handleSaveExistingAdmin} disabled={saving}>
                {saving ? 'Création…' : 'Créer ces identifiants'}
              </Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Rôle / Profil d'accès" required>
              <Select
                value={existingAdminForm.role || 'DIRECTION'}
                onChange={(e) => setExistingAdminForm((a) => ({ ...a, role: e.target.value as any }))}
              >
                <option value="DIRECTION">Direction (Administrateur principal)</option>
                <option value="SECRETAIRE">Secrétaire (Gestion élèves & classes)</option>
                <option value="PROFESSEUR">Professeur (Gestion des notes & pédagogie)</option>
              </Select>
            </Field>

            <Field label="Email de connexion (Identifiant)" required>
              <TextInput
                type="email"
                value={existingAdminForm.email}
                onChange={(e) => setExistingAdminForm((a) => ({ ...a, email: e.target.value }))}
                placeholder="direction@ecole.tg"
              />
            </Field>
            <Field label="Mot de passe" required>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={existingAdminForm.password}
                  onChange={(e) => setExistingAdminForm((a) => ({ ...a, password: e.target.value }))}
                  className="w-full px-3.5 py-2.5 pr-20 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none text-sm text-slate-700"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExistingAdminForm((a) => ({ ...a, password: generateSecurePassword() }))}
                    className="px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded"
                  >
                    Générer
                  </button>
                </div>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" required>
                <TextInput
                  value={existingAdminForm.first_name}
                  onChange={(e) => setExistingAdminForm((a) => ({ ...a, first_name: e.target.value }))}
                />
              </Field>
              <Field label="Nom" required>
                <TextInput
                  value={existingAdminForm.last_name}
                  onChange={(e) => setExistingAdminForm((a) => ({ ...a, last_name: e.target.value }))}
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODAL CONFIRMATION SUPPRESSION ÉTABLISSEMENT ──────────────── */}
      {deleteTarget && (
        <Modal
          title="Supprimer définitivement cet établissement ?"
          description={deleteTarget.name}
          onClose={() => { if (!deleting) setDeleteTarget(null); }}
          footer={
            <>
              <Btn onClick={() => setDeleteTarget(null)} disabled={deleting}>Annuler</Btn>
              <Btn variant="danger" onClick={handleDeleteSchool} disabled={deleting}>
                {deleting ? 'Suppression en cours…' : 'Supprimer définitivement'}
              </Btn>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
              <p className="text-[13px] leading-relaxed text-rose-700">
                Cette action est <strong>irréversible</strong>. La suppression entraîne la destruction
                de toutes les données liées à cet établissement&nbsp;:
              </p>
            </div>

            <ul className="space-y-1.5 text-[13px] text-slate-600">
              {[
                'Le compte d’accès de la Direction (identifiants de connexion)',
                'Les licences et les appareils enregistrés',
                'Les années scolaires et les données pédagogiques synchronisées',
                'Les profils, rôles et journaux d’audit associés',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="text-[12px] text-slate-500">
              Vérifiez qu'il s'agit bien de l'établissement&nbsp;
              <strong className="text-slate-700">{deleteTarget.name}</strong> avant de confirmer.
            </p>

            {deleteError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
                {deleteError}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ─── MODAL SUCCÈS RÉCAPITULATIF DES IDENTIFIANTS ─────────────── */}
      {createdSummary && (
        <Modal
          title="Identifiants créés avec succès !"
          description="Transmettez ces informations à la Direction de l'établissement."
          onClose={() => setCreatedSummary(null)}
          footer={
            <div className="flex w-full items-center justify-between">
              <Btn variant="primary" onClick={copyCredentialsText} className="gap-2">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copié dans le presse-papier !' : 'Copier tous les identifiants'}
              </Btn>
              <Btn onClick={() => setCreatedSummary(null)}>Terminer</Btn>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-900 text-white p-5 space-y-3 font-mono text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-sans font-semibold text-sm pb-2 border-b border-slate-800">
                <Sparkles size={16} />
                <span>Compte prêt à être utilisé</span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-400">Établissement :</span>
                <span className="col-span-2 font-semibold text-white">{createdSummary.school.name}</span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-400">Responsable :</span>
                <span className="col-span-2 text-slate-200">{createdSummary.adminUser.name}</span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-400">Email (Login) :</span>
                <span className="col-span-2 font-bold text-amber-300 select-all">{createdSummary.adminUser.email}</span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-400">Mot de passe :</span>
                <span className="col-span-2 font-bold text-emerald-300 select-all">{createdSummary.adminUser.password}</span>
              </div>

              {createdSummary.licenseKey && (
                <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-800">
                  <span className="text-slate-400">Clé de licence :</span>
                  <span className="col-span-2 font-bold text-sky-400 select-all">{createdSummary.licenseKey}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              💡 Le responsable pourra se connecter en ligne sur l'application avec cet email et ce mot de passe.
              Dès la première connexion, son compte et son rôle <strong>Direction</strong> seront activés sur son poste.
            </p>
          </div>
        </Modal>
      )}
    </SuperAdminShell>
  );
}
