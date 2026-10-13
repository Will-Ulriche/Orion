import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { KeyRound, Plus, RefreshCw, Calendar, MonitorSmartphone, Trash2, Copy, Check, Pencil, PlusCircle } from 'lucide-react';
import { Badge, Btn, EmptyState, Field, Loader, Modal, SearchInput, Select, TableShell, Td, Th, TextInput, type Tone } from '../../components/ui';
import SuperAdminShell from './SuperAdminShell';
import {
  createLicense, generateLicenseKey, listLicenses, listSchools, setLicenseStatus, deleteLicense, updateLicense,
  LICENSE_STATUSES, type License, type LicenseInput, type School,
} from '../../lib/superAdminApi';

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  ACTIVE:    { label: 'Active',    tone: 'emerald' },
  SUSPENDED: { label: 'Suspendue', tone: 'amber'   },
  EXPIRED:   { label: 'Expirée',   tone: 'slate'   },
  REVOKED:   { label: 'Révoquée',  tone: 'red'     },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR');
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

interface LicenseForm {
  school_id: string;
  status: string;
  starts_at: string;
  expires_at: string;
  max_devices: number;
}

const EMPTY_FORM: LicenseForm = {
  school_id: '',
  status: 'ACTIVE',
  starts_at: new Date().toISOString().slice(0, 10),
  expires_at: '',
  max_devices: 1,
};

type DurUnit = 'minutes' | 'hours' | 'days' | 'months';

const QUICK_PRESETS: { label: string; value: number; unit: DurUnit }[] = [
  { label: '30 min', value: 30, unit: 'minutes' },
  { label: '1 h',    value: 1,  unit: 'hours'   },
  { label: '1 j',    value: 1,  unit: 'days'    },
  { label: '7 j',    value: 7,  unit: 'days'    },
  { label: '1 mois', value: 1,  unit: 'months'  },
  { label: '3 mois', value: 3,  unit: 'months'  },
  { label: '1 an',   value: 12, unit: 'months'  },
  { label: '2 ans',  value: 24, unit: 'months'  },
];

/** Ajoute une durée à une date ISO */
function addDuration(base: Date, value: number, unit: DurUnit): Date {
  const d = new Date(base);
  if (unit === 'minutes') d.setMinutes(d.getMinutes() + value);
  else if (unit === 'hours')  d.setHours(d.getHours() + value);
  else if (unit === 'days')   d.setDate(d.getDate() + value);
  else                        d.setMonth(d.getMonth() + value);
  return d;
}

// ─── Composant principal ────────────────────────────────────────────────────

export default function LicencesSuperAdmin() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [schools,  setSchools]  = useState<School[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');

  // ── Création ───────────────────────────────────────────────────
  const [formOpen,   setFormOpen]   = useState(false);
  const [form,       setForm]       = useState<LicenseForm>(EMPTY_FORM);
  const [previewKey, setPreviewKey] = useState('');
  const [saving,     setSaving]     = useState(false);
  const [durMode,    setDurMode]    = useState<'duration' | 'custom'>('duration');
  const [durValue,   setDurValue]   = useState(1);
  const [durUnit,    setDurUnit]    = useState<DurUnit>('months');

  // ── Modification ───────────────────────────────────────────────
  const [editTarget,   setEditTarget]   = useState<License | null>(null);
  const [editForm,     setEditForm]     = useState<{ status: string; max_devices: number; expires_at: string }>({ status: 'ACTIVE', max_devices: 1, expires_at: '' });
  const [editMode,     setEditMode]     = useState<'set' | 'extend'>('set');   // "set" = nouvelle date, "extend" = ajouter délai
  const [extValue,     setExtValue]     = useState(1);
  const [extUnit,      setExtUnit]      = useState<DurUnit>('months');
  const [editSaving,   setEditSaving]   = useState(false);

  // ── Suppression ────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<License | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [copiedKey,    setCopiedKey]    = useState<string | null>(null);

  // ─── Chargement ─────────────────────────────────────────────────
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [lics, schs] = await Promise.all([listLicenses(), listSchools()]);
      setLicenses(lics); setSchools(schs);
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // ─── Helpers création ────────────────────────────────────────────
  function computeExpiresAt(): string | null {
    if (durMode === 'custom') return form.expires_at ? new Date(form.expires_at).toISOString() : null;
    const base = form.starts_at ? new Date(form.starts_at) : new Date();
    return addDuration(base, durValue, durUnit).toISOString();
  }
  function expirationPreview(): string {
    const iso = computeExpiresAt();
    return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  }

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, school_id: schools[0]?.id ?? '' });
    setPreviewKey(generateLicenseKey());
    setDurMode('duration'); setDurValue(1); setDurUnit('months');
    setFormOpen(true);
  };
  const setF = (patch: Partial<LicenseForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.school_id) { setError('Sélectionnez un établissement.'); return; }
    setSaving(true); setError('');
    try {
      await createLicense({
        school_id: form.school_id, status: form.status,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: computeExpiresAt(),
        max_devices: Number(form.max_devices) || 1,
      } as LicenseInput);
      setFormOpen(false); await load();
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setSaving(false); }
  };

  // ─── Helpers modification ────────────────────────────────────────
  const openEdit = (l: License) => {
    setEditTarget(l);
    setEditForm({
      status: l.status,
      max_devices: l.max_devices ?? 1,
      expires_at: l.expires_at ? new Date(l.expires_at).toISOString().slice(0, 16) : '',
    });
    setEditMode('extend');
    setExtValue(1); setExtUnit('months');
    setError('');
  };

  /** Calcule la nouvelle date d'expiration selon le mode d'édition */
  function computeEditExpiry(): string | null {
    if (editMode === 'set') {
      return editForm.expires_at ? new Date(editForm.expires_at).toISOString() : null;
    }
    // Mode "extend" : part de l'expiration actuelle (ou maintenant si pas de date)
    const base = editTarget?.expires_at ? new Date(editTarget.expires_at) : new Date();
    return addDuration(base, extValue, extUnit).toISOString();
  }

  function editExpiryPreview(): string {
    const iso = computeEditExpiry();
    return iso ? fmtDateTime(iso) : '—';
  }

  const saveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true); setError('');
    try {
      await updateLicense(editTarget.id, {
        status: editForm.status,
        max_devices: Number(editForm.max_devices) || 1,
        expires_at: computeEditExpiry(),
      });
      setEditTarget(null);
      await load();
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setEditSaving(false); }
  };

  // ─── Autres actions ──────────────────────────────────────────────
  /** Purge le cache local (localStorage + SQLite) pour une licence donnée */
  const purgeLocalLicenseCache = (licId: string, schoolId: string) => {
    // Invalider le cache localStorage
    try {
      const cached = localStorage.getItem('orion_lic_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.id === licId || parsed?.school_id === schoolId) {
          localStorage.removeItem('orion_lic_cache');
          localStorage.removeItem('orion_lic_ok_at');
        }
      }
    } catch (_) {}
    // Purger SQLite local
    invoke('purge_local_licenses', { schoolId }).catch(() => {});
    // Notifier l'app qu'une licence a changé
    window.dispatchEvent(new Event('orion:license-updated'));
  };

  const changeStatus = async (l: License, status: string) => {
    try {
      await setLicenseStatus(l.id, status);
      setLicenses((prev) => prev.map((x) => (x.id === l.id ? { ...x, status } : x)));
      // Si la licence est révoquée ou suspendue, invalider le cache local
      if (status === 'REVOKED' || status === 'SUSPENDED') {
        purgeLocalLicenseCache(l.id, l.school_id);
      }
    } catch (e: any) { setError(e.message ?? String(e)); }
  };

  const copyLicenseKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setError('');
    try {
      await deleteLicense(deleteTarget.id);
      setLicenses((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      // Purger le cache local immédiatement
      purgeLocalLicenseCache(deleteTarget.id, deleteTarget.school_id);
      setDeleteTarget(null);
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setDeleting(false); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return licenses;
    return licenses.filter((l) =>
      `${l.license_key} ${l.schools?.name ?? ''} ${l.status}`.toLowerCase().includes(q)
    );
  }, [licenses, search]);

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <SuperAdminShell
      title="Licences"
      subtitle="Gérez les clés de licence et attribuez-les aux établissements"
      icon={KeyRound}
      actions={
        <>
          <Btn variant="ghost" onClick={load} title="Rafraîchir"><RefreshCw size={15} /></Btn>
          <Btn variant="primary" onClick={openCreate} disabled={schools.length === 0}
            title={schools.length === 0 ? "Créez d'abord un établissement" : undefined}>
            <Plus size={15} /> Générer une licence
          </Btn>
        </>
      }
    >
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}

      {!loading && licenses.length > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une licence…" className="w-full sm:w-72" />
        </div>
      )}

      {loading ? <Loader label="Chargement des licences…" /> : licenses.length === 0 ? (
        <EmptyState icon={KeyRound} title="Aucune licence"
          description={schools.length === 0 ? "Créez d'abord un établissement, puis générez sa licence." : 'Générez la première clé de licence.'}
          action={schools.length > 0 ? <Btn variant="primary" onClick={openCreate}><Plus size={15} /> Générer une licence</Btn> : undefined}
        />
      ) : (
        <TableShell>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Clé de licence</Th><Th>Établissement</Th><Th>Période</Th>
                <Th className="text-center">Appareils</Th><Th>Statut</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const meta = STATUS_META[l.status] ?? { label: l.status, tone: 'slate' as Tone };
                return (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[12.5px] font-semibold text-slate-700 select-all">{l.license_key}</span>
                        <button onClick={() => copyLicenseKey(l.license_key)} className="p-1 text-slate-400 hover:text-slate-600 rounded" title="Copier la clé">
                          {copiedKey === l.license_key ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </Td>
                    <Td>
                      <p className="text-[13px] font-semibold text-slate-700">{l.schools?.name ?? '—'}</p>
                      {l.schools?.short_name && <p className="text-[11px] text-slate-400">{l.schools.short_name}</p>}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
                        <Calendar size={13} className="text-slate-400" />
                        {fmtDate(l.starts_at)} → {fmtDate(l.expires_at)}
                      </div>
                    </Td>
                    <Td className="text-center">
                      <div className="inline-flex items-center gap-1 text-[13px] text-slate-600">
                        <MonitorSmartphone size={13} className="text-slate-400" />{l.max_devices ?? '—'}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <Select value={l.status} onChange={(e) => changeStatus(l, e.target.value)} className="!w-32 !px-2.5 !py-1.5 !text-[12px]" title="Changer le statut">
                          {LICENSE_STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st]?.label ?? st}</option>)}
                        </Select>
                      </div>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Btn variant="ghost" onClick={() => openEdit(l)} title="Modifier la licence" className="!h-8 !px-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100">
                          <Pencil size={14} />
                        </Btn>
                        <Btn variant="ghost" onClick={() => setDeleteTarget(l)} title="Supprimer cette licence" className="!h-8 !px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50">
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

      {/* ─── MODAL CRÉATION ──────────────────────────────────────── */}
      {formOpen && (
        <Modal title="Générer une licence" description="La clé est générée automatiquement et attachée à l'établissement choisi."
          onClose={() => setFormOpen(false)}
          footer={<><Btn onClick={() => setFormOpen(false)}>Annuler</Btn><Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Génération…' : 'Générer'}</Btn></>}
        >
          <div className="grid gap-4">
            <Field label="Établissement" required>
              <Select value={form.school_id} onChange={(e) => setF({ school_id: e.target.value })}>
                <option value="">-- Choisir --</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Clé générée</p>
              <p className="mt-1 font-mono text-sm font-bold text-slate-700">{previewKey}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date de début"><TextInput type="date" value={form.starts_at} onChange={(e) => setF({ starts_at: e.target.value })} /></Field>
              <Field label="Appareils max"><TextInput type="number" min={1} value={form.max_devices} onChange={(e) => setF({ max_devices: Number(e.target.value) })} /></Field>
              <Field label="Statut" className="sm:col-span-2">
                <Select value={form.status} onChange={(e) => setF({ status: e.target.value })}>
                  {LICENSE_STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st]?.label ?? st}</option>)}
                </Select>
              </Field>
            </div>
            <ExpirationBlock
              durMode={durMode} setDurMode={setDurMode}
              durValue={durValue} setDurValue={setDurValue}
              durUnit={durUnit} setDurUnit={setDurUnit}
              expiresAt={form.expires_at} setExpiresAt={(v) => setF({ expires_at: v })}
              preview={expirationPreview()}
            />
          </div>
        </Modal>
      )}

      {/* ─── MODAL MODIFICATION ──────────────────────────────────── */}
      {editTarget && (
        <Modal
          title="Modifier la licence"
          description={`Clé : ${editTarget.license_key}`}
          onClose={() => setEditTarget(null)}
          footer={
            <><Btn onClick={() => setEditTarget(null)}>Annuler</Btn>
            <Btn variant="primary" onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Enregistrement…' : 'Enregistrer'}</Btn></>
          }
        >
          <div className="grid gap-4">
            {/* Statut + appareils */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Statut">
                <Select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                  {LICENSE_STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st]?.label ?? st}</option>)}
                </Select>
              </Field>
              <Field label="Appareils max">
                <TextInput type="number" min={1} value={editForm.max_devices}
                  onChange={(e) => setEditForm((f) => ({ ...f, max_devices: Number(e.target.value) }))} />
              </Field>
            </div>

            {/* Bloc expiration */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Expiration</p>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[12px]">
                  {([['extend', 'Ajouter un délai'], ['set', 'Nouvelle date']] as const).map(([mode, label]) => (
                    <button key={mode} type="button" onClick={() => setEditMode(mode)}
                      className={['px-3 py-1.5 font-medium transition-colors border-l border-slate-200 first:border-l-0',
                        editMode === mode ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'].join(' ')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Expiration actuelle */}
              <div className="flex items-center gap-2 text-[12px] text-slate-500">
                <Calendar size={13} className="text-slate-400 shrink-0" />
                Expiration actuelle :
                <span className="font-semibold text-slate-700">{fmtDateTime(editTarget.expires_at)}</span>
              </div>

              {editMode === 'extend' ? (
                <div className="space-y-3">
                  <p className="text-[12px] text-slate-500">Durée à ajouter à l'expiration actuelle :</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_PRESETS.map((p) => {
                      const active = extValue === p.value && extUnit === p.unit;
                      return (
                        <button key={p.label} type="button"
                          onClick={() => { setExtValue(p.value); setExtUnit(p.unit); }}
                          className={['px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-colors',
                            active ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'].join(' ')}>
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="w-24">
                      <TextInput type="number" min={1} value={extValue} onChange={(e) => setExtValue(Math.max(1, Number(e.target.value)))} />
                    </div>
                    <div className="flex-1">
                      <Select value={extUnit} onChange={(e) => setExtUnit(e.target.value as DurUnit)}>
                        <option value="minutes">Minute(s)</option>
                        <option value="hours">Heure(s)</option>
                        <option value="days">Jour(s)</option>
                        <option value="months">Mois</option>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : (
                <Field label="Nouvelle date et heure d'expiration">
                  <TextInput type="datetime-local" value={editForm.expires_at}
                    onChange={(e) => setEditForm((f) => ({ ...f, expires_at: e.target.value }))} />
                </Field>
              )}

              {/* Aperçu nouvelle expiration */}
              <div className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-[12px] text-slate-500">
                <PlusCircle size={13} className="text-emerald-500 shrink-0" />
                Nouvelle expiration :
                <span className="ml-1 font-semibold text-slate-800">{editExpiryPreview()}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODAL SUPPRESSION ───────────────────────────────────── */}
      {deleteTarget && (
        <Modal title="Supprimer cette licence ?"
          description={`Êtes-vous sûr de vouloir supprimer la clé ${deleteTarget.license_key} (${deleteTarget.schools?.name ?? 'Établissement inconnu'}) ?`}
          onClose={() => setDeleteTarget(null)}
          footer={<><Btn onClick={() => setDeleteTarget(null)}>Annuler</Btn><Btn variant="danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Suppression…' : 'Supprimer définitivement'}</Btn></>}
        >
          <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700 leading-relaxed">
            ⚠️ <strong>Attention :</strong> Cette clé sera définitivement effacée de la base cloud.
            Les appareils connectés ne pourront plus synchroniser leurs données.
          </div>
        </Modal>
      )}
    </SuperAdminShell>
  );
}

// ─── Sous-composant bloc expiration (réutilisé dans création) ───────────────

interface ExpirationBlockProps {
  durMode: 'duration' | 'custom'; setDurMode: (m: 'duration' | 'custom') => void;
  durValue: number; setDurValue: (v: number) => void;
  durUnit: DurUnit; setDurUnit: (u: DurUnit) => void;
  expiresAt: string; setExpiresAt: (v: string) => void;
  preview: string;
}

function ExpirationBlock({ durMode, setDurMode, durValue, setDurValue, durUnit, setDurUnit, expiresAt, setExpiresAt, preview }: ExpirationBlockProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Expiration</p>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[12px]">
          {([['duration', 'Durée'], ['custom', 'Date précise']] as const).map(([mode, label]) => (
            <button key={mode} type="button" onClick={() => setDurMode(mode)}
              className={['px-3 py-1.5 font-medium transition-colors border-l border-slate-200 first:border-l-0',
                durMode === mode ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'].join(' ')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {durMode === 'duration' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PRESETS.map((p) => {
              const active = durValue === p.value && durUnit === p.unit;
              return (
                <button key={p.label} type="button" onClick={() => { setDurValue(p.value); setDurUnit(p.unit); }}
                  className={['px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-colors',
                    active ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'].join(' ')}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 items-center">
            <div className="w-24"><TextInput type="number" min={1} value={durValue} onChange={(e) => setDurValue(Math.max(1, Number(e.target.value)))} /></div>
            <div className="flex-1">
              <Select value={durUnit} onChange={(e) => setDurUnit(e.target.value as DurUnit)}>
                <option value="minutes">Minute(s)</option>
                <option value="hours">Heure(s)</option>
                <option value="days">Jour(s)</option>
                <option value="months">Mois</option>
              </Select>
            </div>
          </div>
        </div>
      ) : (
        <Field label="Date et heure d'expiration">
          <TextInput type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
      )}
      <div className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-[12px] text-slate-500">
        <Calendar size={13} className="text-slate-400 shrink-0" />
        Expiration prévue : <span className="ml-1 font-semibold text-slate-800">{preview}</span>
      </div>
    </div>
  );
}
