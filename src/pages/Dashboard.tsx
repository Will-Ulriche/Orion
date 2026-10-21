import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import {
  Wifi, WifiOff, MonitorSmartphone, ShieldCheck,
  Users, Venus, Mars, GraduationCap, TrendingUp,
  UserRound, Mail, Phone, Shield, Building2,
} from 'lucide-react';

import { useNetwork } from '../hooks/useNetwork';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';

interface DeviceInfo {
  identifier: string;
  name: string;
  platform: string;
}

interface SyncStatus {
  pending: number;
  failed: number;
  conflict: number;
}

interface SchoolStats {
  total_students: number;
  girls: number;
  boys: number;
  total_staff: number;
  teachers: number;
}

interface UserProfile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  roles: string[];
  staff_id: string | null;
  fonction: string | null;
  matricule: string | null;
  photo: string | null;
  school_name: string | null;
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2.5 bg-slate-50 rounded-lg px-3 py-2">
      <div className={`p-1.5 rounded-md shrink-0 ${tone}`}>
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 leading-tight truncate">{label}</p>
        <p className="text-lg font-bold text-slate-800 leading-tight">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const isOnline = useNetwork();
  const { schoolId, user } = useAuth();
  const { selectedYear } = useYear();

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [deviceRegStatus, setDeviceRegStatus] = useState<string>('Enregistrement...');
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [stats, setStats] = useState<SchoolStats | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {

    invoke('get_device_info')
      .then((res) => {
        setDeviceInfo(res as DeviceInfo);
        return invoke('register_device', { schoolId: null });
      })
      .then((status) => setDeviceRegStatus(status as string))
      .catch((err) => setDeviceRegStatus(`Erreur: ${err}`));

    invoke('get_sync_status')
      .then((res) => setSyncStatus(res as SyncStatus))
      .catch(console.error);

  }, []);

  const refreshSync = () => {
    invoke('get_sync_status')
      .then((res) => setSyncStatus(res as SyncStatus))
      .catch(console.error);
  };

  // Statistiques de l'établissement (effectif, personnel, taux de réussite)
  const yearId = selectedYear?.id ?? '';

  const loadStats = useCallback(async () => {
    if (!schoolId || !yearId) {
      setStats(null);
      return;
    }
    try {
      const data = await invoke<SchoolStats>('get_school_dashboard_stats', {
        schoolId,
        academicYearId: yearId,
      });
      setStats(data);
    } catch (err) {
      console.error(err);
      setStats(null);
    }
  }, [schoolId, yearId]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Profil de l'utilisateur connecté
  const userId = user?.id ?? '';

  useEffect(() => {
    if (!userId || !schoolId) {
      setProfile(null);
      return;
    }
    invoke<UserProfile>('get_current_user_profile', { userId, schoolId })
      .then(setProfile)
      .catch((err) => {
        console.error(err);
        setProfile(null);
      });
  }, [userId, schoolId]);

  const show = (v: number | undefined) => (v === undefined ? '—' : v);

  const firstName = profile?.first_name ?? (user?.user_metadata as any)?.first_name ?? '';
  const lastName = profile?.last_name ?? (user?.user_metadata as any)?.last_name ?? '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Utilisateur';
  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  const avatarUrl = profile?.photo || (user?.user_metadata as any)?.avatar_url || null;
  const roleLabel = profile?.roles?.length ? profile.roles.join(' · ') : '—';

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Tableau de bord</h2>
          <p className="text-slate-400 text-sm mt-1">{selectedYear?.name ?? 'Aucune année sélectionnée'}</p>
        </div>
        <button
          onClick={refreshSync}
          title="Actualiser la synchronisation"
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shrink-0"
        >
          {isOnline ? <Wifi size={13} className="text-emerald-500" /> : <WifiOff size={13} className="text-orange-500" />}
          <span>{isOnline ? 'En ligne' : 'Hors ligne'}</span>
          {(syncStatus?.pending ?? 0) > 0 && <span className="text-slate-400">· {syncStatus?.pending} en attente</span>}
          {(syncStatus?.failed ?? 0) > 0 && <span className="text-red-400">· {syncStatus?.failed} erreurs</span>}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Profil de l'utilisateur */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><UserRound size={20} /></div>
            <h3 className="text-base font-semibold text-slate-800">Mon profil</h3>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-lg font-bold shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                initials || <UserRound size={22} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-800 truncate">{fullName}</p>
              <p className="text-xs text-slate-400 truncate">
                {profile?.fonction ?? (profile?.matricule ? `Matricule ${profile.matricule}` : roleLabel)}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-500 shrink-0"><Mail size={13} /> Email</span>
              <span className="text-slate-700 truncate">{profile?.email ?? user?.email ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-500 shrink-0"><Phone size={13} /> Téléphone</span>
              <span className="text-slate-700 truncate">{profile?.phone ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-500 shrink-0"><Shield size={13} /> Rôle</span>
              <span className="text-slate-700 truncate">{roleLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-500 shrink-0"><Building2 size={13} /> Établissement</span>
              <span className="text-slate-700 truncate">{profile?.school_name ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* Appareil */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><MonitorSmartphone size={20} /></div>
            <h3 className="text-base font-semibold text-slate-800">Appareil</h3>
          </div>
          {deviceInfo ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Nom</span>
                <strong className="text-slate-800">{deviceInfo.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Plateforme</span>
                <span className="text-slate-700">{deviceInfo.platform}</span>
              </div>
              <div className="bg-slate-50 rounded p-2 font-mono text-xs text-slate-400 break-all mt-2">
                {deviceInfo.identifier}
              </div>
              <div className="flex items-center gap-2 text-green-600 text-xs pt-1">
                <ShieldCheck size={13} />
                <span>{deviceRegStatus}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">Récupération en cours...</p>
          )}
        </div>
      </div>

      {/* Statistiques de l'établissement */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="bg-indigo-50 p-1.5 rounded-lg text-indigo-600"><TrendingUp size={16} /></div>
          <h3 className="text-sm font-semibold text-slate-800">Statistiques de l'établissement</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile icon={Users} label="Élèves inscrits" value={show(stats?.total_students)} tone="bg-indigo-50 text-indigo-600" />
          <StatTile icon={Venus} label="Filles" value={show(stats?.girls)} tone="bg-pink-50 text-pink-600" />
          <StatTile icon={Mars} label="Garçons" value={show(stats?.boys)} tone="bg-sky-50 text-sky-600" />
          <StatTile icon={GraduationCap} label="Professeurs" value={show(stats?.teachers)} tone="bg-emerald-50 text-emerald-600" />
        </div>
      </div>
    </div>
  );
}
