import { useEffect, useMemo, useState } from 'react';
import {
  KeyRound, Plus, RefreshCw, Copy, Check, Eye, EyeOff,
  Building2, UserCheck, Power, Trash2,
  Sparkles, AlertCircle
} from 'lucide-react';
import { Badge, Btn, EmptyState, Field, Loader, Modal, SearchInput, Select, TableShell, Td, Th, TextInput, type Tone } from '../../components/ui';
import SuperAdminShell from './SuperAdminShell';
import {
  listSchoolCredentials, resetSchoolAdminPassword, setSchoolCredentialStatus, deleteSchoolCredential,
  createAdminForSchool, listSchools,
  type SchoolCredential, type School, type SchoolAdminInput
} from '../../lib/superAdminApi';

const generateSecurePassword = () => {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  let pass = '';
  for (let i = 0; i < 10; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Orion@${pass}`;
};

export default function ComptesSuperAdmin() {
  const [credentials, setCredentials] = useState<SchoolCredential[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modale nouveau compte pour école
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [newAdminForm, setNewAdminForm] = useState<SchoolAdminInput>({
    email: '',
    password: generateSecurePassword(),
    first_name: 'Direction',
    last_name: '',
    phone: '',
    role: 'DIRECTION',
  });
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Modale réinitialisation de mot de passe
  const [resetTarget, setResetTarget] = useState<SchoolCredential | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState(generateSecurePassword());
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetResultModal, setResetResultModal] = useState<{ cred: SchoolCredential; pass: string } | null>(null);

  // Modale suppression
  const [deleteTarget, setDeleteTarget] = useState<SchoolCredential | null>(null);

  // Feedback copie
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [creds, schs] = await Promise.all([
        listSchoolCredentials(),
        listSchools(),
      ]);
      setCredentials(creds);
      setSchools(schs);
      if (schs.length > 0 && !selectedSchoolId) {
        setSelectedSchoolId(schs[0].id);
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Filtrage
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return credentials;
    return credentials.filter((c) =>
      `${c.schoolName} ${c.schoolShortName ?? ''} ${c.email} ${c.firstName} ${c.lastName} ${c.schoolCity ?? ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [credentials, search]);

  // Statistiques
  const stats = useMemo(() => {
    const total = credentials.length;
    const active = credentials.filter(c => c.status === 'ACTIVE').length;
    const uniqueSchools = new Set(credentials.map(c => c.schoolId)).size;
    return { total, active, uniqueSchools };
  }, [credentials]);

  const copyCredentialCard = (c: SchoolCredential) => {
    const text = [
      `🎓 ÉTABLISSEMENT : ${c.schoolName}`,
      `👤 RESPONSABLE   : ${c.firstName} ${c.lastName}`.trim(),
      `📧 EMAIL (LOGIN) : ${c.email}`,
      `🏷️ RÔLE          : ${c.role}`,
      c.licenseKey ? `🎟️ LICENCE ORION : ${c.licenseKey}` : '',
      `\nConnectez-vous sur Orion pour accéder à votre espace établissement.`,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    setCopiedId(c.userId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const copyText = (val: string, id: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Création d'accès pour école existante
  const handleCreate = async () => {
    if (!selectedSchoolId) {
      setError('Veuillez sélectionner un établissement.');
      return;
    }
    if (!newAdminForm.email.trim() || !newAdminForm.email.includes('@')) {
      setError('Email de connexion invalide.');
      return;
    }
    if (!newAdminForm.password || newAdminForm.password.length < 6) {
      setError('Mot de passe trop court (min 6 caractères).');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const sch = schools.find(s => s.id === selectedSchoolId);
      const res = await createAdminForSchool(selectedSchoolId, newAdminForm);
      setCreateModalOpen(false);
      setResetResultModal({
        cred: {
          userId: '',
          email: res.email,
          status: 'ACTIVE',
          role: newAdminForm.role || 'DIRECTION',
          firstName: newAdminForm.first_name,
          lastName: newAdminForm.last_name,
          phone: newAdminForm.phone || null,
          schoolId: selectedSchoolId,
          schoolName: sch?.name || 'Établissement',
          schoolShortName: sch?.short_name || null,
          schoolCity: sch?.city || null,
          licenseKey: null,
          licenseStatus: null,
          createdAt: new Date().toISOString(),
        },
        pass: res.password,
      });
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  // Réinitialisation mot de passe
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
      setResetResultModal({ cred: resetTarget, pass: newPasswordValue });
      setResetTarget(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  // Bascule statut
  const handleToggleStatus = async (c: SchoolCredential) => {
    const next = c.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await setSchoolCredentialStatus(c.userId, next);
      setCredentials(prev => prev.map(x => x.userId === c.userId ? { ...x, status: next } : x));
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  // Suppression
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
      title="Comptes & Identifiants Établissements"
      subtitle="Visualisez, transmettez et gérez les identifiants d'accès créés pour les écoles"
      icon={KeyRound}
      actions={
        <div className="flex items-center gap-2">
          <Btn variant="ghost" onClick={load} title="Rafraîchir"><RefreshCw size={15} /></Btn>
          <Btn
            variant="primary"
            onClick={() => {
              setNewAdminForm({
                email: '',
                password: generateSecurePassword(),
                first_name: 'Direction',
                last_name: '',
                phone: '',
                role: 'DIRECTION',
              });
              setCreateModalOpen(true);
            }}
          >
            <Plus size={15} /> Nouveau compte d'accès
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <KeyRound size={18} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Comptes</p>
            <p className="text-xl font-bold text-slate-800">{stats.total}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <UserCheck size={18} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Comptes Actifs</p>
            <p className="text-xl font-bold text-slate-800">{stats.active}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Building2 size={18} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Établissements Couverts</p>
            <p className="text-xl font-bold text-slate-800">{stats.uniqueSchools}</p>
          </div>
        </div>
      </div>

      {!loading && credentials.length > 0 && (
        <div className="mb-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher par école, email ou nom…"
            className="w-full sm:w-80"
          />
        </div>
      )}

      {loading ? (
        <Loader label="Chargement des identifiants…" />
      ) : credentials.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Aucun compte créé"
          description="Vous n'avez pas encore généré d'identifiants d'établissement. Créez votre premier accès."
          action={
            <Btn variant="primary" onClick={() => setCreateModalOpen(true)}>
              <Plus size={15} /> Créer un accès
            </Btn>
          }
        />
      ) : (
        <TableShell>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Établissement</Th>
                <Th>Responsable</Th>
                <Th>Identifiant (Email)</Th>
                <Th className="text-center">Rôle</Th>
                <Th className="text-center">Statut</Th>
                <Th>Licence liée</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isActive = c.status === 'ACTIVE';
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

                    <Td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[12.5px] font-semibold text-slate-800 select-all">{c.email}</span>
                        <button
                          onClick={() => copyText(c.email, `email-${c.userId}`)}
                          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                          title="Copier l'email"
                        >
                          {copiedId === `email-${c.userId}` ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </Td>

                    <Td className="text-center">
                      <Badge tone={c.role === 'DIRECTION' ? 'brand' : 'violet'}>{c.role}</Badge>
                    </Td>

                    <Td className="text-center">
                      <Badge tone={isActive ? 'emerald' : 'slate' as Tone}>
                        {isActive ? 'Actif' : 'Suspendu'}
                      </Badge>
                    </Td>

                    <Td>
                      {c.licenseKey ? (
                        <div className="flex items-center gap-1 text-[11.5px] font-mono text-slate-600">
                          <span className="truncate max-w-[120px]">{c.licenseKey}</span>
                          <button
                            onClick={() => copyText(c.licenseKey!, `lic-${c.userId}`)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded"
                            title="Copier la clé de licence"
                          >
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
                          title="Copier la fiche d'accès complète"
                          className="!h-8 !px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                        >
                          {copiedId === c.userId ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        </Btn>

                        <Btn
                          variant="ghost"
                          onClick={() => {
                            setResetTarget(c);
                            setNewPasswordValue(generateSecurePassword());
                            setShowResetPassword(false);
                          }}
                          title="Réinitialiser le mot de passe"
                          className="!h-8 !px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        >
                          <KeyRound size={14} />
                        </Btn>

                        <Btn
                          variant="ghost"
                          onClick={() => handleToggleStatus(c)}
                          title={isActive ? 'Suspendre l’accès' : 'Réactiver l’accès'}
                          className="!h-8 !px-2"
                        >
                          <Power size={14} className={isActive ? 'text-slate-500' : 'text-emerald-600'} />
                        </Btn>

                        <Btn
                          variant="ghost"
                          onClick={() => setDeleteTarget(c)}
                          title="Supprimer ce compte"
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

      {/* ─── MODALE CRÉATION D'ACCÈS POUR ÉCOLE ─────────────── */}
      {createModalOpen && (
        <Modal
          title="Créer un compte d'accès pour un établissement"
          description="Associez un identifiant et un mot de passe à l'école de votre choix."
          onClose={() => setCreateModalOpen(false)}
          footer={
            <>
              <Btn onClick={() => setCreateModalOpen(false)}>Annuler</Btn>
              <Btn variant="primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Création en cours…' : 'Créer ces identifiants'}
              </Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Choisir l'établissement" required>
              <Select
                value={selectedSchoolId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedSchoolId(id);
                  const sch = schools.find(s => s.id === id);
                  if (sch) {
                    setNewAdminForm(a => ({
                      ...a,
                      last_name: sch.name,
                      email: sch.email || a.email,
                      phone: sch.phone_primary || a.phone,
                    }));
                  }
                }}
              >
                {schools.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.short_name ? `(${s.short_name})` : ''} - {s.city || 'Togo'}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Email de connexion (Identifiant)" required>
              <TextInput
                type="email"
                value={newAdminForm.email}
                onChange={(e) => setNewAdminForm(a => ({ ...a, email: e.target.value }))}
                placeholder="direction@ecole.tg"
              />
            </Field>

            <Field label="Mot de passe" required>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newAdminForm.password}
                  onChange={(e) => setNewAdminForm(a => ({ ...a, password: e.target.value }))}
                  className="w-full px-3.5 py-2.5 pr-20 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none text-sm text-slate-700"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAdminForm(a => ({ ...a, password: generateSecurePassword() }))}
                    className="px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded"
                  >
                    Générer
                  </button>
                </div>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom du responsable" required>
                <TextInput
                  value={newAdminForm.first_name}
                  onChange={(e) => setNewAdminForm(a => ({ ...a, first_name: e.target.value }))}
                />
              </Field>
              <Field label="Nom du responsable" required>
                <TextInput
                  value={newAdminForm.last_name}
                  onChange={(e) => setNewAdminForm(a => ({ ...a, last_name: e.target.value }))}
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODALE RÉINITIALISER MOT DE PASSE ─────────────── */}
      {resetTarget && (
        <Modal
          title="Réinitialiser le mot de passe"
          description={`Définissez un nouveau mot de passe pour le compte ${resetTarget.email} (${resetTarget.schoolName}).`}
          onClose={() => setResetTarget(null)}
          footer={
            <>
              <Btn onClick={() => setResetTarget(null)}>Annuler</Btn>
              <Btn variant="primary" onClick={handleResetPassword} disabled={saving}>
                {saving ? 'Mise à jour…' : 'Appliquer le mot de passe'}
              </Btn>
            </>
          }
        >
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/60 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
              <span>
                L'ancien mot de passe sera immédiatement remplacé. Vous devrez communiquer le nouveau mot de passe au responsable de l'école.
              </span>
            </div>

            <Field label="Nouveau mot de passe" required>
              <div className="relative">
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-20 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none text-sm text-slate-700"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    {showResetPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPasswordValue(generateSecurePassword())}
                    className="px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded"
                  >
                    Générer
                  </button>
                </div>
              </div>
            </Field>
          </div>
        </Modal>
      )}

      {/* ─── MODALE SUCCÈS MOT DE PASSE / ACCÈS CRÉÉ ─────────────── */}
      {resetResultModal && (
        <Modal
          title="Nouveaux identifiants générés !"
          description="Ces informations sont prêtes à être transmises à la Direction."
          onClose={() => setResetResultModal(null)}
          footer={
            <div className="flex w-full items-center justify-between">
              <Btn
                variant="primary"
                onClick={() => {
                  const txt = [
                    `🎓 ÉTABLISSEMENT : ${resetResultModal.cred.schoolName}`,
                    `👤 RESPONSABLE   : ${resetResultModal.cred.firstName} ${resetResultModal.cred.lastName}`.trim(),
                    `📧 EMAIL D'ACCÈS : ${resetResultModal.cred.email}`,
                    `🔑 MOT DE PASSE  : ${resetResultModal.pass}`,
                    resetResultModal.cred.licenseKey ? `🎟️ LICENCE ORION : ${resetResultModal.cred.licenseKey}` : '',
                  ].filter(Boolean).join('\n');
                  navigator.clipboard.writeText(txt);
                  setCopiedId('summary');
                  setTimeout(() => setCopiedId(null), 2000);
                }}
              >
                {copiedId === 'summary' ? <Check size={16} /> : <Copy size={16} />}
                {copiedId === 'summary' ? 'Copié dans le presse-papier !' : 'Copier les accès'}
              </Btn>
              <Btn onClick={() => setResetResultModal(null)}>Fermer</Btn>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-900 text-white p-5 space-y-3 font-mono text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-sans font-semibold text-sm pb-2 border-b border-slate-800">
                <Sparkles size={16} />
                <span>Accès actifs</span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-400">Établissement :</span>
                <span className="col-span-2 font-semibold text-white">{resetResultModal.cred.schoolName}</span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-400">Email (Login) :</span>
                <span className="col-span-2 font-bold text-amber-300 select-all">{resetResultModal.cred.email}</span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-400">Mot de passe :</span>
                <span className="col-span-2 font-bold text-emerald-300 select-all">{resetResultModal.pass}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODALE CONFIRMATION SUPPRESSION ─────────────── */}
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
            ⚠️ L'utilisateur ne pourra plus se connecter avec cet identifiant. L'établissement lui-même restera intact.
          </div>
        </Modal>
      )}
    </SuperAdminShell>
  );
}
