import { useEffect, useMemo, useState } from 'react';
import {
  BarChart2, Building2, KeyRound, MonitorSmartphone,
  ShieldCheck, AlertTriangle, TrendingUp, RefreshCw, Calendar,
  CheckCircle2, Clock, XCircle, Pause,
} from 'lucide-react';
import { Badge, Btn, Card, Kpi, Loader } from '../../components/ui';
import SuperAdminShell from './SuperAdminShell';
import { listSchools, listLicenses, listDevices, type School, type License, type Device } from '../../lib/superAdminApi';

// ─── Types locaux ───────────────────────────────────────────────────────────

interface AnalyticsData {
  schools: School[];
  licenses: License[];
  devices: Device[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Regroupe les items par mois (12 derniers mois) */
function groupByMonth(items: { created_at: string }[]): { label: string; count: number }[] {
  const now = new Date();
  const months: { label: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    const count = items.filter((x) => x.created_at.startsWith(key)).length;
    months.push({ label, count });
  }
  return months;
}

// ─── Composants Graphiques SVG ───────────────────────────────────────────────

const COLORS = {
  brand:   '#6366f1',
  emerald: '#10b981',
  amber:   '#f59e0b',
  red:     '#ef4444',
  slate:   '#94a3b8',
  blue:    '#3b82f6',
  violet:  '#8b5cf6',
};

/** Bar chart vertical pur SVG */
function BarChart({ data, color = COLORS.brand }: { data: { label: string; count: number }[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const H = 140;
  const barW = 18;
  const gap = 6;
  const padLeft = 28;
  const totalW = data.length * (barW + gap) + padLeft;

  // Lignes de grille : 0, max/2, max
  const gridLines = [0, Math.round(max / 2), max];

  return (
    <svg viewBox={`0 0 ${totalW} ${H + 24}`} className="w-full overflow-visible">
      {/* Lignes de grille */}
      {gridLines.map((v) => {
        const y = H - (v / max) * H;
        return (
          <g key={v}>
            <line x1={padLeft} y1={y} x2={totalW} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padLeft - 4} y={y + 4} fontSize="8" fill="#94a3b8" textAnchor="end">{v}</text>
          </g>
        );
      })}

      {/* Barres */}
      {data.map((d, i) => {
        const x = padLeft + i * (barW + gap);
        const barH = (d.count / max) * H;
        const y = H - barH;
        return (
          <g key={i}>
            {/* Barre de fond */}
            <rect x={x} y={0} width={barW} height={H} rx="4" fill="#f1f5f9" />
            {/* Barre réelle */}
            {d.count > 0 && (
              <rect x={x} y={y} width={barW} height={barH} rx="4" fill={color} opacity="0.85" />
            )}
            {/* Valeur */}
            {d.count > 0 && (
              <text x={x + barW / 2} y={y - 4} fontSize="8" fill={color} textAnchor="middle" fontWeight="700">
                {d.count}
              </text>
            )}
            {/* Label mois */}
            <text x={x + barW / 2} y={H + 14} fontSize="7.5" fill="#94a3b8" textAnchor="middle">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Donut chart SVG */
function DonutChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-slate-400">
        Aucune donnée
      </div>
    );
  }

  const R = 50;
  const cx = 60;
  const cy = 60;
  const strokeW = 18;

  let cumAngle = -90; // start from top

  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const angle = (s.value / total) * 360;
      const startAngle = cumAngle;
      cumAngle += angle;
      const endAngle = cumAngle;

      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const x1 = cx + R * Math.cos(toRad(startAngle));
      const y1 = cy + R * Math.sin(toRad(startAngle));
      const x2 = cx + R * Math.cos(toRad(endAngle));
      const y2 = cy + R * Math.sin(toRad(endAngle));
      const largeArc = angle > 180 ? 1 : 0;

      return { ...s, path: `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`, angle };
    });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0">
        {arcs.map((arc, i) => (
          <path
            key={i}
            d={arc.path}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeW}
            strokeLinecap="butt"
          />
        ))}
        {/* Centre */}
        <text x={cx} y={cy - 5} fontSize="16" fontWeight="700" fill="#1e293b" textAnchor="middle">{total}</text>
        <text x={cx} y={cy + 10} fontSize="8" fill="#94a3b8" textAnchor="middle">total</text>
      </svg>
      <div className="flex flex-col gap-2">
        {slices.filter((s) => s.value > 0).map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[12px] text-slate-600">{s.label}</span>
            <span className="ml-auto pl-4 text-[12px] font-bold text-slate-800">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Progress bar horizontale */
function ProgressBar({ value, max, color = COLORS.brand }: { value: number; max: number; color?: string }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Badge jours restants ────────────────────────────────────────────────────

function DaysLeftBadge({ iso }: { iso: string | null }) {
  const days = daysLeft(iso);
  if (days === null) return <span className="text-slate-400 text-[12px]">—</span>;
  if (days <= 0) return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600"><XCircle size={10} /> Expirée</span>;
  if (days <= 7) return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600"><AlertTriangle size={10} /> {days}j</span>;
  if (days <= 30) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600"><Clock size={10} /> {days}j</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600"><CheckCircle2 size={10} /> {days}j</span>;
}

// ─── Page principale ─────────────────────────────────────────────────────────

export default function StatsSuperAdmin() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([listSchools(), listLicenses(), listDevices()])
      .then(([schools, licenses, devices]) => setData({ schools, licenses, devices }))
      .catch((e: any) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── Calculs dérivés ────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!data) return null;
    const { schools, licenses, devices } = data;
    const now = Date.now();
    const in7  = now + 7  * 86400_000;
    const in30 = now + 30 * 86400_000;

    const activeSchools    = schools.filter(s => s.status === 'ACTIVE').length;
    const suspendedSchools = schools.filter(s => s.status === 'SUSPENDED').length;
    const closedSchools    = schools.filter(s => s.status === 'CLOSED').length;

    const activeLic    = licenses.filter(l => l.status === 'ACTIVE').length;
    const suspendedLic = licenses.filter(l => l.status === 'SUSPENDED').length;
    const expiredLic   = licenses.filter(l => l.status === 'EXPIRED').length;
    const revokedLic   = licenses.filter(l => l.status === 'REVOKED').length;

    const expiring7  = licenses.filter(l => l.status === 'ACTIVE' && l.expires_at && new Date(l.expires_at).getTime() <= in7).length;
    const expiring30 = licenses.filter(l => l.status === 'ACTIVE' && l.expires_at && new Date(l.expires_at).getTime() <= in30).length;

    // Licences ACTIVE triées par expiration la plus proche
    const alertLicenses = licenses
      .filter(l => l.status === 'ACTIVE' && l.expires_at && new Date(l.expires_at).getTime() <= in30)
      .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime());

    // Appareils par école (top 8)
    const devicesBySchool: { name: string; count: number }[] = [];
    const schoolMap = new Map(schools.map(s => [s.id, s.short_name || s.name]));
    devices.forEach(d => {
      const name = schoolMap.get(d.school_id) || 'Inconnu';
      const found = devicesBySchool.find(x => x.name === name);
      if (found) found.count++;
      else devicesBySchool.push({ name, count: 1 });
    });
    devicesBySchool.sort((a, b) => b.count - a.count);

    // Écoles sans licence active
    const schoolsWithActiveLic = new Set(licenses.filter(l => l.status === 'ACTIVE').map(l => l.school_id));
    const schoolsNoLic = schools.filter(s => !schoolsWithActiveLic.has(s.id));

    // Historique mensuel
    const schoolsByMonth  = groupByMonth(schools);
    const licensesByMonth = groupByMonth(licenses);

    return {
      activeSchools, suspendedSchools, closedSchools,
      activeLic, suspendedLic, expiredLic, revokedLic,
      expiring7, expiring30,
      alertLicenses,
      devicesBySchool: devicesBySchool.slice(0, 8),
      schoolsNoLic,
      schoolsByMonth,
      licensesByMonth,
      totalDevices: devices.length,
      activationRate: schools.length === 0 ? 0 : Math.round((activeSchools / schools.length) * 100),
    };
  }, [data]);

  return (
    <SuperAdminShell
      title="Statistiques & Analytiques"
      subtitle="Vue d'ensemble du parc — données en temps réel depuis Supabase"
      icon={BarChart2}
      actions={
        <Btn variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </Btn>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex h-64 items-center justify-center">
          <Loader label="Chargement des statistiques…" />
        </div>
      ) : stats && data ? (
        <div className="space-y-6">

          {/* ── Alertes urgentes ──────────────────────────────────── */}
          {stats.expiring7 > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-bold text-red-700">
                  {stats.expiring7} licence{stats.expiring7 > 1 ? 's' : ''} expire{stats.expiring7 > 1 ? 'nt' : ''} dans moins de 7 jours !
                </p>
                <p className="mt-0.5 text-[12px] text-red-500">Renouvelez-les depuis la page Licences pour éviter toute interruption.</p>
              </div>
            </div>
          )}

          {/* ── KPIs principaux ───────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Building2}        label="Établissements"     value={String(data.schools.length)}   tone="brand"   />
            <Kpi icon={KeyRound}         label="Licences actives"   value={String(stats.activeLic)}        tone="emerald" />
            <Kpi icon={MonitorSmartphone} label="Appareils totaux"  value={String(stats.totalDevices)}     tone="blue"    />
            <Kpi icon={ShieldCheck}      label="Expirant ≤ 30 j"   value={String(stats.expiring30)}       tone="amber"   />
          </div>

          {/* ── Ligne 1 : Statuts écoles + Taux d'activation ─────── */}
          <div className="grid gap-4 lg:grid-cols-2">

            {/* Statuts des établissements */}
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Building2 size={15} className="text-brand-600" />
                <h3 className="text-sm font-bold text-slate-800">Statuts des établissements</h3>
                <span className="ml-auto text-[11px] text-slate-400">{data.schools.length} total</span>
              </div>
              <DonutChart slices={[
                { label: 'Actif',     value: stats.activeSchools,    color: COLORS.emerald },
                { label: 'Suspendu',  value: stats.suspendedSchools, color: COLORS.amber   },
                { label: 'Fermé',     value: stats.closedSchools,    color: COLORS.slate   },
              ]} />
            </Card>

            {/* Statuts des licences */}
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <KeyRound size={15} className="text-brand-600" />
                <h3 className="text-sm font-bold text-slate-800">Statuts des licences</h3>
                <span className="ml-auto text-[11px] text-slate-400">{data.licenses.length} total</span>
              </div>
              <DonutChart slices={[
                { label: 'Active',    value: stats.activeLic,    color: COLORS.emerald },
                { label: 'Suspendue', value: stats.suspendedLic, color: COLORS.amber   },
                { label: 'Expirée',   value: stats.expiredLic,   color: COLORS.slate   },
                { label: 'Révoquée',  value: stats.revokedLic,   color: COLORS.red     },
              ]} />
            </Card>
          </div>

          {/* ── Ligne 2 : Historique création par mois ────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">

            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp size={15} className="text-brand-600" />
                <h3 className="text-sm font-bold text-slate-800">Établissements créés / mois</h3>
                <Badge tone="brand" className="ml-auto">12 mois</Badge>
              </div>
              <BarChart data={stats.schoolsByMonth} color={COLORS.brand} />
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Calendar size={15} className="text-brand-600" />
                <h3 className="text-sm font-bold text-slate-800">Licences émises / mois</h3>
                <Badge tone="emerald" className="ml-auto">12 mois</Badge>
              </div>
              <BarChart data={stats.licensesByMonth} color={COLORS.emerald} />
            </Card>
          </div>

          {/* ── Ligne 3 : Appareils + Taux activation ────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">

            {/* Appareils par école */}
            <Card className="p-5 lg:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <MonitorSmartphone size={15} className="text-brand-600" />
                <h3 className="text-sm font-bold text-slate-800">Appareils par établissement</h3>
                <span className="ml-auto text-[11px] text-slate-400">top 8</span>
              </div>
              {stats.devicesBySchool.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-slate-400">Aucun appareil enregistré</p>
              ) : (
                <div className="space-y-3">
                  {stats.devicesBySchool.map(({ name, count }) => (
                    <div key={name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="max-w-[70%] truncate text-[12px] font-medium text-slate-700">{name}</span>
                        <span className="text-[12px] font-bold text-slate-800">{count}</span>
                      </div>
                      <ProgressBar
                        value={count}
                        max={Math.max(...stats.devicesBySchool.map(d => d.count))}
                        color={COLORS.blue}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Taux d'activation */}
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 size={15} className="text-brand-600" />
                <h3 className="text-sm font-bold text-slate-800">Taux d'activation</h3>
              </div>

              {/* Gauge SVG */}
              <div className="flex flex-col items-center py-2">
                <svg viewBox="0 0 120 80" className="w-40">
                  {/* Arc de fond */}
                  <path d="M 10 70 A 50 50 0 0 1 110 70" fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round" />
                  {/* Arc coloré */}
                  <path
                    d="M 10 70 A 50 50 0 0 1 110 70"
                    fill="none"
                    stroke={stats.activationRate >= 80 ? COLORS.emerald : stats.activationRate >= 50 ? COLORS.amber : COLORS.red}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${(stats.activationRate / 100) * 157} 157`}
                  />
                  <text x="60" y="62" fontSize="20" fontWeight="800" fill="#1e293b" textAnchor="middle">{stats.activationRate}%</text>
                  <text x="60" y="76" fontSize="8" fill="#94a3b8" textAnchor="middle">actifs / total</text>
                </svg>
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-[12px]">
                  <span className="flex items-center gap-1 text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" />Actifs</span>
                  <span className="font-bold text-slate-800">{stats.activeSchools}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="flex items-center gap-1 text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-400" />Suspendus</span>
                  <span className="font-bold text-slate-800">{stats.suspendedSchools}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full bg-slate-300" />Fermés</span>
                  <span className="font-bold text-slate-800">{stats.closedSchools}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* ── Alertes : licences expirant dans 30 jours ─────────── */}
          {stats.alertLicenses.length > 0 && (
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Clock size={15} className="text-amber-500" />
                <h3 className="text-sm font-bold text-slate-800">Licences expirant dans les 30 prochains jours</h3>
                <Badge tone="amber" className="ml-auto">{stats.alertLicenses.length}</Badge>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">École</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Clé de licence</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Expire le</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Temps restant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.alertLicenses.map((lic) => (
                      <tr key={lic.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 font-medium text-slate-700">
                          {lic.schools?.name || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-500">{lic.license_key}</td>
                        <td className="px-4 py-2.5 text-slate-600">{fmtDate(lic.expires_at)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <DaysLeftBadge iso={lic.expires_at} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Écoles sans licence active ────────────────────────── */}
          {stats.schoolsNoLic.length > 0 && (
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Pause size={15} className="text-slate-400" />
                <h3 className="text-sm font-bold text-slate-800">Établissements sans licence active</h3>
                <Badge tone="slate" className="ml-auto">{stats.schoolsNoLic.length}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.schoolsNoLic.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] text-slate-600"
                  >
                    <Building2 size={11} className="text-slate-400" />
                    {s.short_name || s.name}
                    {s.city && <span className="text-slate-400">· {s.city}</span>}
                  </span>
                ))}
              </div>
            </Card>
          )}

        </div>
      ) : null}
    </SuperAdminShell>
  );
}
