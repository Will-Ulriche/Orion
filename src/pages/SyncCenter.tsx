import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentSchoolId } from '../contexts/AuthContext';
import {
  RefreshCw, Wifi, WifiOff, Clock, AlertTriangle,
  CheckCircle2, XCircle, Inbox, Send, ChevronDown, ChevronUp,
  GitMerge, ArrowLeftRight, RotateCcw, Database
} from 'lucide-react';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface SyncStatus {
  engine_status: string;    // IDLE | SYNCING | ERROR | OFFLINE
  last_sync_at: string | null;
  pending_count: number;
  failed_count: number;
  conflict_count: number;
  inbox_pending: number;
  is_online: boolean;
  last_error: string | null;
}

interface PendingMutation {
  id: string;
  school_id: string | null;
  entity_type: string;
  entity_id: string;
  operation: string;
  status: string;
  attempt_count: number;
  created_at: string;
  last_error: string | null;
}

interface SyncConflict {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  local_data: Record<string, unknown> | null;
  remote_data: Record<string, unknown>;
  received_at: string;
}

// ──────────────────────────────────────────────
// Composants utilitaires
// ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; label: string; dot: string }> = {
    IDLE:    { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'En attente', dot: 'bg-emerald-500' },
    SYNCING: { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Synchronisation…', dot: 'bg-blue-500' },
    ERROR:   { color: 'bg-red-50 text-red-700 border-red-200', label: 'Erreur', dot: 'bg-red-500' },
    OFFLINE: { color: 'bg-slate-100 text-slate-600 border-slate-300', label: 'Hors ligne', dot: 'bg-slate-400' },
  };
  const c = cfg[status] ?? cfg.IDLE;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${c.color}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot} ${status === 'SYNCING' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  );
}

function OperationBadge({ op }: { op: string }) {
  const cfg: Record<string, string> = {
    INSERT: 'bg-green-100 text-green-700',
    UPDATE: 'bg-blue-100 text-blue-700',
    DELETE: 'bg-red-100 text-red-700',
    UPSERT: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cfg[op] ?? 'bg-slate-100 text-slate-600'}`}>
      {op}
    </span>
  );
}

function MetricCard({
  icon: Icon, label, value, color, subtitle
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border p-4 flex items-center gap-4 shadow-sm ${color}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-current/10`}>
        <Icon size={20} className="opacity-80" />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
        {subtitle && <div className="text-[11px] text-slate-400 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Composant principal : Centre de Synchronisation
// ──────────────────────────────────────────────

export default function SyncCenter() {
  const [status, setStatus]           = useState<SyncStatus | null>(null);
  const [mutations, setMutations]     = useState<PendingMutation[]>([]);
  const [conflicts, setConflicts]     = useState<SyncConflict[]>([]);
  const [syncing, setSyncing]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [showMutations, setShowMutations]   = useState(false);
  const [showConflicts, setShowConflicts]   = useState(false);
  const [resolvingId, setResolvingId]       = useState<string | null>(null);
  const [notice, setNotice]                 = useState<string | null>(null);

  // ── Chargement initial et refresh périodique ──

  const loadStatus = useCallback(async () => {
    try {
      const s: SyncStatus = await invoke('get_sync_status');
      setStatus(s);
      if (s.conflict_count > 0) {
        const c: SyncConflict[] = await invoke('get_sync_conflicts');
        setConflicts(c);
      } else {
        setConflicts([]);
      }
    } catch (err: unknown) {
      console.error('Impossible de charger le statut sync:', err);
    }
  }, []);

  const loadMutations = useCallback(async () => {
    try {
      const m: PendingMutation[] = await invoke('get_pending_mutations');
      setMutations(m);
      // Les échecs restaient invisibles tant que l'utilisateur n'ouvrait pas
      // l'accordéon : on l'ouvre automatiquement pour ne rien cacher.
      if (m.some(x => x.status === 'FAILED') && !showMutations) {
        setShowMutations(true);
      }
    } catch (err: unknown) {
      console.error('Impossible de charger les mutations:', err);
    }
  }, [showMutations]);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 15_000); // Rafraîchir toutes les 15s
    return () => clearInterval(interval);
  }, [loadStatus]);

  // ── Synchronisation manuelle ──

  // Le message de succès est passé en paramètre plutôt que défini après coup :
  // sinon un échec survenu pendant le cycle se ferait écraser par la confirmation.
  const runSync = useCallback(async (successMessage?: string) => {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result: SyncStatus = await invoke('trigger_sync');
      setStatus(result);
      if (result.last_error) {
        setError(result.last_error);
      } else {
        setNotice(successMessage ?? 'Synchronisation terminée.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSyncing(false);
      await Promise.all([loadStatus(), loadMutations()]);
    }
  }, [loadStatus, loadMutations]);

  // Enveloppe indispensable : sans elle, l'événement clic serait transmis
  // comme message de succès.
  const handleSync = () => runSync();

  // Remet en file les mutations qui avaient épuisé leurs 5 tentatives, puis
  // relance un cycle. Le simple fait de cliquer « Synchroniser » ne débloquait
  // rien : le filtre `attempt_count < 5` les excluait définitivement.
  const handleRetry = async () => {
    setError(null);
    let requeued = 0;
    try {
      requeued = await invoke('retry_failed_mutations');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    await runSync(
      requeued > 0 ? `${requeued} mutation(s) remise(s) en file.` : undefined
    );
  };

  // Rattrapage complet : remet tout l'état local dans l'outbox, y compris les
  // entités créées avant que l'outbox ne couvre ce type de donnée.
  const handleFullResync = async () => {
    setError(null);
    let enqueued = 0;
    try {
      enqueued = await invoke('enqueue_full_resync', { schoolId: getCurrentSchoolId() });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    await runSync(`${enqueued} entité(s) remise(s) en file.`);
  };

  // ── Résolution de conflit ──

  const handleResolve = async (conflictId: string, choice: 'LOCAL' | 'REMOTE') => {
    setResolvingId(conflictId);
    try {
      await invoke('resolve_sync_conflict', { inboxId: conflictId, choice });
      setConflicts(prev => prev.filter(c => c.id !== conflictId));
      await loadStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setResolvingId(null);
    }
  };

  // ── Format dates ──

  const formatDate = (dt: string | null) => {
    if (!dt) return '—';
    try {
      return new Date(dt).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return dt;
    }
  };

  return (
    <div className="px-8 pt-6 pb-8 w-full h-full overflow-y-auto bg-[#f8f9fc]">
      
      {/* En-tête */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight flex items-center gap-2">
            <GitMerge size={24} className="text-[#4f46e5]" />
            Centre de Synchronisation
          </h2>
          <p className="text-slate-500 mt-0.5 text-[13px]">
            Moteur Offline-First · SQLite ↔ Supabase
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {status && status.failed_count > 0 && (
            <button
              onClick={handleRetry}
              disabled={syncing}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              <RotateCcw size={16} />
              Réessayer ({status.failed_count})
            </button>
          )}
          <button
            onClick={handleFullResync}
            disabled={syncing}
            title="Remettre tout l'état local dans la file d'attente"
            className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            <Database size={16} />
            Resynchroniser tout
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-[#4f46e5]/25"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Synchronisation…' : 'Synchroniser'}
          </button>
        </div>
      </div>

      {/* Alerte erreur */}
      {error && (
        <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          <XCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Erreur de synchronisation</p>
            <p className="text-red-600 mt-0.5 break-words">{error}</p>
          </div>
          <button
            onClick={handleRetry}
            disabled={syncing}
            className="shrink-0 flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            <RotateCcw size={13} /> Réessayer
          </button>
        </div>
      )}

      {/* Confirmation */}
      {notice && !error && (
        <div className="mb-4 flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-4 text-sm">
          <CheckCircle2 size={18} className="shrink-0" />
          <p className="font-medium">{notice}</p>
        </div>
      )}

      {/* Panneau d'état principal */}
      {status && (
        <>
          {/* Barre de statut */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                {status.is_online
                  ? <Wifi size={20} className="text-emerald-500" />
                  : <WifiOff size={20} className="text-slate-400" />
                }
                <div>
                  <div className="text-sm font-semibold text-slate-700">
                    {status.is_online ? 'Connexion disponible' : 'Hors ligne'}
                  </div>
                  <div className="text-[12px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <Clock size={12} />
                    Dernière sync : {formatDate(status.last_sync_at)}
                  </div>
                </div>
              </div>
              <StatusBadge status={status.engine_status} />
            </div>
          </div>

          {/* Métriques */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <MetricCard
              icon={Send}
              label="En attente d'envoi"
              value={status.pending_count}
              color="text-blue-600 border-blue-100"
              subtitle="Mutations locales"
            />
            <MetricCard
              icon={Inbox}
              label="Reçus à appliquer"
              value={status.inbox_pending}
              color="text-purple-600 border-purple-100"
              subtitle="Changements distants"
            />
            <MetricCard
              icon={AlertTriangle}
              label="Conflits"
              value={status.conflict_count}
              color={status.conflict_count > 0 ? 'text-amber-600 border-amber-200' : 'text-slate-400 border-slate-100'}
              subtitle="Résolution requise"
            />
            <MetricCard
              icon={XCircle}
              label="Échecs"
              value={status.failed_count}
              color={status.failed_count > 0 ? 'text-red-600 border-red-200' : 'text-slate-400 border-slate-100'}
              subtitle="Après 5 tentatives"
            />
          </div>
        </>
      )}

      {/* Section : Conflits */}
      {conflicts.length > 0 && (
        <div className="mb-5 bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowConflicts(!showConflicts)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-amber-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <ArrowLeftRight size={18} className="text-amber-600" />
              <span className="font-semibold text-slate-800">
                {conflicts.length} conflit(s) à résoudre
              </span>
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                Intervention requise
              </span>
            </div>
            {showConflicts ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>

          {showConflicts && (
            <div className="border-t border-amber-100 divide-y divide-amber-50">
              {conflicts.map(conflict => (
                <div key={conflict.id} className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <OperationBadge op={conflict.operation} />
                    <span className="text-sm font-semibold text-slate-700">
                      {conflict.entity_type} · <code className="text-[11px] text-slate-400">{conflict.entity_id.slice(0, 8)}…</code>
                    </span>
                    <span className="text-[11px] text-slate-400 ml-auto">{formatDate(conflict.received_at)}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                      <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-2">Version locale</div>
                      <pre className="text-[11px] text-slate-600 overflow-auto max-h-32">
                        {conflict.local_data ? JSON.stringify(conflict.local_data, null, 2) : '(données actuelles en base)'}
                      </pre>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                      <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2">Version distante</div>
                      <pre className="text-[11px] text-slate-600 overflow-auto max-h-32">
                        {JSON.stringify(conflict.remote_data, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleResolve(conflict.id, 'LOCAL')}
                      disabled={resolvingId === conflict.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                    >
                      <CheckCircle2 size={16} /> Garder local
                    </button>
                    <button
                      onClick={() => handleResolve(conflict.id, 'REMOTE')}
                      disabled={resolvingId === conflict.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors"
                    >
                      <RefreshCw size={16} /> Appliquer distant
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section : File des mutations */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => {
            setShowMutations(!showMutations);
            if (!showMutations) loadMutations();
          }}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Send size={18} className="text-[#4f46e5]" />
            <span className="font-semibold text-slate-800">File d'attente (Outbox)</span>
            {mutations.length > 0 && (
              <span className="bg-[#4f46e5]/10 text-[#4f46e5] text-xs font-bold px-2 py-0.5 rounded-full">
                {mutations.length}
              </span>
            )}
          </div>
          {showMutations ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </button>

        {showMutations && (
          <div className="border-t border-slate-100">
            {mutations.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                <CheckCircle2 size={32} strokeWidth={1} className="opacity-40" />
                <p>Aucune mutation en attente.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Entité</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Opération</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Statut</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tentatives</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Créée le</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {mutations.map(m => (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-700">{m.entity_type}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{m.entity_id.slice(0, 12)}…</div>
                      </td>
                      <td className="px-4 py-3"><OperationBadge op={m.operation} /></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          m.status === 'PENDING' ? 'bg-blue-100 text-blue-700'
                          : m.status === 'FAILED' ? 'bg-red-100 text-red-700'
                          : m.status === 'SYNCED' ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                        }`}>{m.status}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{m.attempt_count}/5</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(m.created_at)}</td>
                      <td className="px-4 py-3 text-red-500 text-xs max-w-[200px] truncate" title={m.last_error ?? ''}>
                        {m.last_error ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="mt-5 text-[11px] text-slate-400 text-center">
        Les données locales sont toujours prioritaires. La synchronisation ne supprime jamais une mutation en attente.
      </div>
    </div>
  );
}
