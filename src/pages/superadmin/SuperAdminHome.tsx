import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, Building2, KeyRound, MonitorSmartphone, ArrowRight, Cloud, WifiOff, ShieldCheck, BarChart2, FileSpreadsheet,
} from 'lucide-react';
import { Badge, Btn, Card, Kpi } from '../../components/ui';
import SuperAdminShell from './SuperAdminShell';
import { getStats, type SuperAdminStats } from '../../lib/superAdminApi';

const QUICK_LINKS = [
  { to: '/super-admin/ecoles',    icon: Building2,       label: 'Établissements',    desc: 'Créer et gérer les écoles' },
  { to: '/super-admin/comptes',   icon: KeyRound,        label: 'Identifiants & Accès', desc: 'Voir et réinitialiser les comptes écoles' },
  { to: '/super-admin/licences',  icon: ShieldCheck,     label: 'Licences',          desc: 'Générer et attribuer les licences' },
  { to: '/super-admin/appareils', icon: MonitorSmartphone, label: 'Appareils',         desc: 'Suivre les postes activés' },
  { to: '/super-admin/stats',     icon: BarChart2,       label: 'Statistiques',       desc: 'Analytiques, graphiques et alertes' },
  { to: '/super-admin/export',    icon: FileSpreadsheet, label: 'Export Excel',       desc: 'Exporter toutes les données (classe, notes, profs, paiements)' },
];

export default function SuperAdminHome() {
  const [stats, setStats] = useState<SuperAdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch((e: any) => setError(e.message ?? String(e)));
  }, []);

  const v = (n: number | undefined) => (stats ? String(n ?? 0) : '—');

  return (
    <SuperAdminShell
      title="Vue globale"
      subtitle="Pilotage du parc d'établissements et des licences Orion"
      icon={LayoutDashboard}
      actions={<Badge tone="amber">Données cloud (Supabase)</Badge>}
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Building2} label="Établissements" value={v(stats?.schools)} tone="brand" />
        <Kpi icon={KeyRound} label="Licences actives" value={v(stats?.activeLicenses)} tone="emerald" />
        <Kpi icon={MonitorSmartphone} label="Appareils activés" value={v(stats?.devices)} tone="blue" />
        <Kpi icon={ShieldCheck} label="Licences expirant bientôt" value={v(stats?.expiringSoon)} tone="amber" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {QUICK_LINKS.map(({ to, icon: Icon, label, desc }) => (
          <Link key={to} to={to} className="focus:outline-none">
            <Card interactive className="h-full p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Icon size={20} />
                </div>
                <ArrowRight size={16} className="text-slate-300" />
              </div>
              <p className="mt-4 text-sm font-bold text-slate-800">{label}</p>
              <p className="mt-1 text-[13px] text-slate-500">{desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <div className="flex items-center gap-2">
          <Cloud size={16} className="text-brand-600" />
          <h3 className="text-sm font-bold text-slate-800">Comment ça marche</h3>
        </div>
        <ol className="mt-4 grid gap-2.5 text-[13px] text-slate-600 sm:grid-cols-2">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            Le super administrateur crée l'établissement et génère sa licence (en ligne).
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            L'école s'active une première fois en ligne avec sa clé de licence.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            L'activation initiale effectuée, l'établissement fonctionne hors-ligne.
          </li>
          <li className="flex items-start gap-2">
            <WifiOff size={14} className="mt-0.5 shrink-0 text-slate-400" />
            Aucune reconnexion obligatoire pour continuer à utiliser l'application.
          </li>
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/super-admin/ecoles">
            <Btn variant="primary">Créer un établissement</Btn>
          </Link>
          <Link to="/super-admin/licences">
            <Btn variant="secondary">Générer une licence</Btn>
          </Link>
        </div>
      </Card>
    </SuperAdminShell>
  );
}
