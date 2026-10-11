import { useEffect, useMemo, useState } from 'react';
import { MonitorSmartphone, RefreshCw } from 'lucide-react';
import { Badge, Btn, EmptyState, Loader, SearchInput, TableShell, Td, Th, type Tone } from '../../components/ui';
import SuperAdminShell from './SuperAdminShell';
import { listDevices, type Device } from '../../lib/superAdminApi';

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Actif', tone: 'emerald' },
  BLOCKED: { label: 'Bloqué', tone: 'amber' },
  REVOKED: { label: 'Révoqué', tone: 'red' },
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function AppareilsSuperAdmin() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setDevices(await listDevices());
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) =>
      `${d.device_name ?? ''} ${d.device_identifier} ${d.schools?.name ?? ''} ${d.platform ?? ''}`.toLowerCase().includes(q)
    );
  }, [devices, search]);

  return (
    <SuperAdminShell
      title="Appareils"
      subtitle="Suivi des postes activés pour chaque établissement"
      icon={MonitorSmartphone}
      actions={<Btn variant="ghost" onClick={load} title="Rafraîchir"><RefreshCw size={15} /></Btn>}
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
      )}

      {!loading && devices.length > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un appareil…" className="w-full sm:w-72" />
        </div>
      )}

      {loading ? (
        <Loader label="Chargement des appareils…" />
      ) : devices.length === 0 ? (
        <EmptyState
          icon={MonitorSmartphone}
          title="Aucun appareil"
          description="Les appareils apparaîtront ici dès qu'un établissement activera sa licence."
        />
      ) : (
        <TableShell>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Appareil</Th>
                <Th>Établissement</Th>
                <Th>Plateforme</Th>
                <Th>Dernière activité</Th>
                <Th className="text-center">Statut</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const meta = STATUS_META[d.status] ?? { label: d.status, tone: 'slate' as Tone };
                return (
                  <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <Td>
                      <p className="text-[13px] font-semibold text-slate-700">{d.device_name || 'Appareil sans nom'}</p>
                      <p className="font-mono text-[11px] text-slate-400">{d.device_identifier}</p>
                    </Td>
                    <Td><span className="text-[13px] text-slate-600">{d.schools?.name ?? '—'}</span></Td>
                    <Td><span className="text-[13px] text-slate-600">{d.platform ?? '—'}</span></Td>
                    <Td><span className="text-[12.5px] text-slate-500">{fmt(d.last_seen_at)}</span></Td>
                    <Td className="text-center"><Badge tone={meta.tone}>{meta.label}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}
    </SuperAdminShell>
  );
}
