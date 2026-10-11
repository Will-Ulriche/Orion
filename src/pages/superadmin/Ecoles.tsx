import { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, RefreshCw, Pencil, Power, MapPin } from 'lucide-react';
import { Badge, Btn, EmptyState, Field, Loader, Modal, SearchInput, Select, TableShell, Td, Th, TextInput, type Tone } from '../../components/ui';
import SuperAdminShell from './SuperAdminShell';
import {
  createSchool, listSchools, setSchoolStatus, updateSchool,
  SCHOOL_STATUSES, type School, type SchoolInput,
} from '../../lib/superAdminApi';

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'emerald' },
  SUSPENDED: { label: 'Suspendue', tone: 'amber' },
  CLOSED: { label: 'Fermée', tone: 'slate' },
};

const EMPTY_FORM: SchoolInput = {
  name: '', short_name: null, city: null, country: 'Togo',
  phone_primary: null, email: null, status: 'ACTIVE',
};

export default function Ecoles() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<School | null>(null);
  const [form, setForm] = useState<SchoolInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setSchools(await listSchools());
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (s: School) => {
    setEditing(s);
    setForm({
      name: s.name, short_name: s.short_name, city: s.city, country: s.country,
      phone_primary: s.phone_primary, email: s.email, status: s.status,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { setError("Le nom de l'établissement est obligatoire."); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) await updateSchool(editing.id, form);
      else await createSchool({ ...form, name: form.name.trim() });
      setFormOpen(false);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter((s) =>
      `${s.name} ${s.short_name ?? ''} ${s.city ?? ''} ${s.country ?? ''}`.toLowerCase().includes(q)
    );
  }, [schools, search]);

  const set = (patch: Partial<SchoolInput>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <SuperAdminShell
      title="Établissements"
      subtitle="Créez les écoles de base qui utiliseront Orion"
      icon={Building2}
      actions={
        <>
          <Btn variant="ghost" onClick={load} title="Rafraîchir"><RefreshCw size={15} /></Btn>
          <Btn variant="primary" onClick={openCreate}><Plus size={15} /> Nouvel établissement</Btn>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
      )}

      {!loading && schools.length > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un établissement…" className="w-full sm:w-72" />
        </div>
      )}

      {loading ? (
        <Loader label="Chargement des établissements…" />
      ) : schools.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucun établissement"
          description="Créez la première école de base qui utilisera Orion."
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
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
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
                      <div className="flex justify-end gap-1">
                        <Btn variant="ghost" onClick={() => openEdit(s)} title="Modifier" className="!h-8 !px-2"><Pencil size={14} /></Btn>
                        <Btn variant="ghost" onClick={() => toggleStatus(s)} title={s.status === 'ACTIVE' ? 'Suspendre' : 'Activer'} className="!h-8 !px-2"><Power size={14} /></Btn>
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
          title={editing ? "Modifier l'établissement" : 'Nouvel établissement'}
          description="Les informations de base de l'école de base."
          onClose={() => setFormOpen(false)}
          footer={
            <>
              <Btn onClick={() => setFormOpen(false)}>Annuler</Btn>
              <Btn variant="primary" onClick={save} disabled={saving}>
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
              </Btn>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom de l'établissement" required className="sm:col-span-2">
              <TextInput value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex: Collège Saint-Olivier" />
            </Field>
            <Field label="Nom court">
              <TextInput value={form.short_name ?? ''} onChange={(e) => set({ short_name: e.target.value || null })} placeholder="Ex: CSO" />
            </Field>
            <Field label="Statut">
              <Select value={form.status} onChange={(e) => set({ status: e.target.value })}>
                {SCHOOL_STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st]?.label ?? st}</option>)}
              </Select>
            </Field>
            <Field label="Ville">
              <TextInput value={form.city ?? ''} onChange={(e) => set({ city: e.target.value || null })} placeholder="Ex: Lomé" />
            </Field>
            <Field label="Pays">
              <TextInput value={form.country ?? ''} onChange={(e) => set({ country: e.target.value || null })} placeholder="Ex: Togo" />
            </Field>
            <Field label="Téléphone">
              <TextInput value={form.phone_primary ?? ''} onChange={(e) => set({ phone_primary: e.target.value || null })} placeholder="+228 90 00 00 00" />
            </Field>
            <Field label="Email">
              <TextInput type="email" value={form.email ?? ''} onChange={(e) => set({ email: e.target.value || null })} placeholder="contact@ecole.tg" />
            </Field>
          </div>
        </Modal>
      )}
    </SuperAdminShell>
  );
}
