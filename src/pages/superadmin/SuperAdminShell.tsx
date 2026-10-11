import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PanelHeader } from '../../components/ui';

export default function SuperAdminShell({
  title,
  subtitle,
  icon,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: any;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
      <div className="mb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-700">
          <ShieldCheck size={12} /> Espace super administrateur
        </span>
      </div>
      <div className="mb-6 border-b border-slate-200/70 pb-5">
        <PanelHeader title={title} subtitle={subtitle} icon={icon} actions={actions} />
      </div>
      {children}
    </div>
  );
}
