import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, Calendar, Key, Hourglass } from 'lucide-react';
import Appareils from './Appareils';
import Licences from './Licences';
import { useAuth } from '../contexts/AuthContext';
import { supabaseAdmin } from '../lib/supabaseClient';
import { invoke } from '@tauri-apps/api/core';

export default function Security() {
  const { schoolId, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: 'appareils' | 'licence' =
    searchParams.get('tab') === 'licence' ? 'licence' : 'appareils';

  const [activeLic, setActiveLic] = useState<{ expires_at: string | null; status: string } | null>(null);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    const fetchLic = async () => {
      try {
        // Résoudre le school_id réel
        let targetId = schoolId || localStorage.getItem('current_school_id') || '';
        if (user?.id) {
          try {
            const { data: prof } = await supabaseAdmin
              .from('profiles')
              .select('school_id')
              .eq('user_id', user.id)
              .maybeSingle();
            if (prof?.school_id) targetId = prof.school_id;
          } catch (_) {}
        }

        const isValidActive = (l: any) =>
          l?.status === 'ACTIVE' && (!l?.expires_at || new Date(l.expires_at) > new Date());

        // 1. Le cloud est la source de vérité
        let cloudReachable = false;
        let found: { expires_at: string | null; status: string } | null = null;
        try {
          const { data: lics, error } = await supabaseAdmin
            .from('licenses')
            .select('status, expires_at, school_id, created_at')
            .eq('school_id', targetId)
            .order('created_at', { ascending: false });
          if (error) throw error;
          cloudReachable = true;

          let rows: any[] = lics ?? [];
          if (rows.length === 0 && targetId && targetId !== 'school-1') {
            const { data: fb } = await supabaseAdmin
              .from('licenses')
              .select('status, expires_at, school_id, created_at')
              .eq('school_id', 'school-1')
              .order('created_at', { ascending: false });
            rows = fb ?? [];
          }
          const active = rows.find(isValidActive);
          if (active) found = { expires_at: active.expires_at ?? null, status: active.status };
        } catch (_) {
          cloudReachable = false;
        }

        if (cloudReachable) {
          // Aucune licence active côté cloud : on efface le décompte ET le cache périmé
          setActiveLic(found);
          if (!found) {
            localStorage.removeItem('orion_lic_cache');
            localStorage.removeItem('orion_lic_ok_at');
            try { await invoke('purge_local_licenses', { schoolId: targetId }); } catch (_) {}
          }
          return;
        }

        // 2. Cloud injoignable → repli SQLite local
        if (targetId) {
          const lics = await invoke<any[]>('get_licenses', { schoolId: targetId });
          const active = lics?.find(isValidActive);
          if (active) {
            setActiveLic({ expires_at: active.expires_at ?? null, status: active.status });
            return;
          }
        }

        // 3. Dernier repli : cache local, uniquement s'il est encore valide
        const cached = localStorage.getItem('orion_lic_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (isValidActive(parsed)) {
            setActiveLic({ expires_at: parsed.expires_at ?? null, status: parsed.status });
            return;
          }
        }

        setActiveLic(null);
      } catch (_) {}
    };
    fetchLic();
    window.addEventListener('orion:license-updated', fetchLic);
    return () => window.removeEventListener('orion:license-updated', fetchLic);
  }, [schoolId, user?.id]);

  useEffect(() => {
    if (!activeLic?.expires_at) {
      setDaysLeft(null);
      return;
    }
    const updateDays = () => {
      const diff = new Date(activeLic.expires_at!).getTime() - Date.now();
      if (diff <= 0) setDaysLeft(0);
      else setDaysLeft(Math.floor(diff / (1000 * 60 * 60 * 24)));
    };
    updateDays();
    const t = setInterval(updateDays, 30000);
    return () => clearInterval(t);
  }, [activeLic]);

  const setActiveTab = (key: 'appareils' | 'licence') => {
    setSearchParams(key === 'licence' ? { tab: 'licence' } : {}, { replace: true });
  };

  const TABS = [
    { key: 'appareils', label: 'Appareils autorisés', icon: <Calendar size={16} /> },
    { key: 'licence', label: 'Licence & Décompte', icon: <Key size={16} /> },
  ] as const;

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full flex flex-col bg-[#f8f9fc]">
      <div className="mb-6 flex-shrink-0 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight flex items-center gap-2">
            <ShieldCheck size={28} className="text-indigo-500" />
            Sécurité et Accès
          </h2>
          <p className="text-slate-500 mt-1 text-[13px]">
            Gérez les appareils autorisés et le décompte de votre licence d'utilisation.
          </p>
        </div>

        {daysLeft !== null && (
          <div className={`px-4 py-2 rounded-2xl border text-xs font-semibold flex items-center gap-2 shadow-2xs ${
            daysLeft < 7
              ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse'
              : daysLeft < 30
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            <Hourglass size={15} className="text-indigo-600" />
            <span>Validité licence : <strong className="font-bold">{daysLeft} jours restants</strong></span>
          </div>
        )}
      </div>

      <div className="flex bg-white border border-slate-200/70 p-1 rounded-xl w-fit mb-6 flex-shrink-0 gap-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[13.5px] transition-all duration-200 cursor-pointer ${
              activeTab === tab.key
                ? 'bg-[#f0f3ff] text-[#4f46e5] shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.icon} {tab.label}
            {tab.key === 'licence' && daysLeft !== null && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ml-1 ${
                daysLeft < 7
                  ? 'bg-rose-100 text-rose-700 animate-pulse'
                  : daysLeft < 30
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}>
                {daysLeft}j
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-8 min-h-full">
          {activeTab === 'appareils' && <Appareils />}
          {activeTab === 'licence' && <Licences />}
        </div>
      </div>
    </div>
  );
}
