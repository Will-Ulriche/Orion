import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, RefreshCw, Calendar, MonitorSmartphone } from 'lucide-react';
import { Badge, Btn, EmptyState, Field, Loader, Modal, SearchInput, Select, TableShell, Td, Th, TextInput, type Tone } from '../../components/ui';
import SuperAdminShell from './SuperAdminShell';
import {
  createLicense, generateLicenseKey, listLicenses, listSchools, setLicenseStatus,
  LICENSE_STATUSES, type License, type School,
} from '../../lib/superAdminApi';

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'emerald' },
  SUSPENDED: { label: 'Suspendue', tone: 'amber' },
  EXPIRED: { label: 'Expirée', tone: 'slate' },
  REVOKED: { label: 'Révoquée', tone: 'red' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

interface LicenseForm {
  school_id: string;
  status: string;
  starts_at: string;
  expires_at: string;
  max_devices: number;
}

const EMPTY_FORM: LicenseForm = {
  school_id: '', status: 'ACTIVE', starts_at: new Date().toISOString().slice(0, 10), expires_at: '', max_devices: 1,
};

export default function LicencesSuperAdmin() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<LicenseForm>(EMPTY_FORM);
  const [previewKey, setPreviewKey] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [lics, schs] = await Promise.all([listLicenses(), listSchools()]);
      setLicenses(lics);
      setSchools(schs);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, school_id: schools[0]?.id ?? '' });
    setPreviewKey(generateLicenseKey());
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.school_id) { setError('Sélectionnez un établissement.'); return; }
    setSaving(true);
    setError('');
    try {
      await createLicense({
        school_id: form.school_id,
        status: form.status,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        max_devices: Number(form.max_devices) || 1,
      });
      setFormOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (l: License, status: string) => {
    try {
      await setLicenseStatus(l.id, status);
      setLicenses((prev) => prev.map((x) => (x.id === l.id ? { ...x, status } : x)));
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return licenses;
    return licenses.filter((l) =>
      `${l.license_key} ${l.schools?.name ?? ''} ${l.status}`.toLowerCase().includes(q)
    );
  }, [licenses, search]);

  const set = (patch: Partial<LicenseForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <SuperAdminShell
      title="Licences"
      subtitle="Générez les clés de licence et attribuez-les aux établissements"
      icon={KeyRound}
      actions={
        <>
          <Btn variant="ghost" onClick={load} title="Rafraîchir"><RefreshCw size={15} /></Btn>
          <Btn variant="primary" onClick={openCreate} disabled={schools.length === 0} title={schools.length === 0 ? "Créez d'abord un établissement" : undefined}>
            <Plus size={15} /> Générer une licence
          </Btn>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
      )}

      {!loading && licenses.length > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une licence…" className="w-full sm:w-72" />
        </div>
      )}

      {loading ? (
        <Loader label="Chargement des licences…" />
      ) : licenses.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Aucune licence"
          description={schools.length === 0
            ? "Créez d'abord un établissement, puis générez sa licence."
            : 'Générez la première clé de licence et attribuez-la à un établissement.'}
          action={schools.length > 0 ? <Btn variant="primary" onClick={openCreate}><Plus size={15} /> Générer une licence</Btn> : undefined}
        />
      ) : (
        <TableShell>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Clé de licence</Th>
                <Th>Établissement</Th>
                <Th>Période</Th>
                <Th className="text-center">Appareils</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const meta = STATUS_META[l.status] ?? { label: l.status, tone: 'slate' as Tone };
                return (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <Td>
                      <span className="font-mono text-[12.5px] font-semibold text-slate-700">{l.license_key}</span>
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
                        <MonitorSmartphone size={13} className="text-slate-400" />
                        {l.max_devices ?? '—'}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <Select
                          value={l.status}
                          onChange={(e) => changeStatus(l, e.target.value)}
                          className="!w-32 !px-2.5 !py-1.5 !text-[12px]"
                          title="Changer le statut"
                        >
                          {LICENSE_STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st]?.label ?? st}</option>)}
                        </Select>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      {formOpen && (
        <Modal
          title="Générer une licence"
          description="La clé est générée automatiquement et attachée à l'établissement choisi."
          onClose={() => setFormOpen(false)}
          footer={
            <>
              <Btn onClick={() => setFormOpen(false)}>Annuler</Btn>
              <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Génération…' : 'Générer'}</Btn>
            </>
          }
        >
          <div className="grid gap-4">
            <Field label="Établissement" required>
              <Select value={form.school_id} onChange={(e) => set({ school_id: e.target.value })}>
                <option value="">-- Choisir --</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Clé générée</p>
              <p className="mt-1 font-mono text-sm font-bold text-slate-700">{previewKey}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Début">
                <TextInput type="date" value={form.starts_at} onChange={(e) => set({ starts_at: e.target.value })} />
              </Field>
              <Field label="Expiration">
                <TextInput type="date" value={form.expires_at} onChange={(e) => set({ expires_at: e.target.value })} />
              </Field>
              <Field label="Appareils max">
                <TextInput type="number" min={1} value={form.max_devices} onChange={(e) => set({ max_devices: Number(e.target.value) })} />
              </Field>
              <Field label="Statut">
                <Select value={form.status} onChange={(e) => set({ status: e.target.value })}>
                  {LICENSE_STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st]?.label ?? st}</option>)}
                </Select>
              </Field>
            </div>
          </div>
        </Modal>
      )}
    </SuperAdminShell>
  );
}
