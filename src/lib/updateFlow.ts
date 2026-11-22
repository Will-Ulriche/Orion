export type UpdateFlowStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateProgressValue {
  downloaded: number;
  total: number;
  percent: number;
}

export const STARTUP_CHECK_DELAY_MS = 3500;
export const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function formatUpdateError(error: unknown, online: boolean): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const normalized = raw.toLowerCase();

  if (!online || normalized.includes('network') || normalized.includes('failed to fetch')) {
    return "Vous êtes actuellement hors ligne ou le réseau est indisponible.";
  }
  if (raw.includes('404') || normalized.includes('release')) {
    return "Aucune nouvelle version n'est disponible pour le moment.";
  }
  if (raw) {
    return `Vérification échouée : ${raw}`;
  }
  return "Impossible de vérifier les mises à jour.";
}

export function buildDownloadProgress(downloaded: number, total: number): UpdateProgressValue {
  const safeDownloaded = Number.isFinite(downloaded) && downloaded > 0 ? downloaded : 0;
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const percent = safeTotal > 0
    ? Math.min(100, Math.max(0, Math.round((safeDownloaded / safeTotal) * 100)))
    : 0;

  return { downloaded: safeDownloaded, total: safeTotal, percent };
}

export function shouldNotifyVersion(
  handledVersions: ReadonlySet<string>,
  version: string,
  silent: boolean,
): boolean {
  return silent && !handledVersions.has(version);
}

export function withHandledVersion(
  handledVersions: ReadonlySet<string>,
  version: string,
): Set<string> {
  const next = new Set(handledVersions);
  next.add(version);
  return next;
}

export function canInstallUpdate(
  status: UpdateFlowStatus,
  hasUpdateResource: boolean,
  hasUserConsent: boolean,
): boolean {
  if (!hasUserConsent || !hasUpdateResource) return false;
  return status !== 'checking' && status !== 'downloading' && status !== 'downloaded';
}
