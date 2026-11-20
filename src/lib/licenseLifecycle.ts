/**
 * Cycle de vie des licences Orion.
 *
 * Règle centrale : une licence n'autorise l'accès QUE si elle est la licence
 * courante (`is_current === true`) de l'établissement demandé. Les licences
 * remplacées restent dans l'historique (statut SUPERSEDED) mais ne peuvent
 * jamais réautoriser l'accès, même si leur ancien statut était ACTIVE.
 */

export type LicenseVerdict =
  | 'valid'
  | 'future'
  | 'expired'
  | 'suspended'
  | 'revoked'
  | 'superseded'
  | 'wrong_school'
  | 'invalid_dates'
  | 'missing';

export interface LifecycleLicense {
  id: string;
  school_id: string;
  license_key?: string;
  status: string;
  starts_at?: string | null;
  expires_at?: string | null;
  is_current?: boolean | null;
}

/** Analyse UTC stricte : toute date invalide est refusée (fail-closed). */
export function parseUtcDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function classifyLicense(
  lic: LifecycleLicense | null | undefined,
  schoolId: string,
  now: Date = new Date(),
): LicenseVerdict {
  if (!lic || !lic.id) return 'missing';

  if (!lic.school_id || lic.school_id === 'unassigned' || lic.school_id !== schoolId) {
    return 'wrong_school';
  }

  if (lic.is_current !== true) return 'superseded';

  const status = String(lic.status ?? '').toUpperCase();
  if (status === 'REVOKED') return 'revoked';
  if (status === 'SUSPENDED') return 'suspended';
  if (status === 'SUPERSEDED') return 'superseded';
  if (status === 'EXPIRED') return 'expired';
  if (status !== 'ACTIVE') return 'superseded';

  const start = parseUtcDate(lic.starts_at);
  const expires = parseUtcDate(lic.expires_at);
  if ((lic.starts_at && !start) || (lic.expires_at && !expires)) return 'invalid_dates';
  if (start && start.getTime() > now.getTime()) return 'future';
  if (expires && expires.getTime() <= now.getTime()) return 'expired';

  return 'valid';
}

export function isLicenseCurrentlyValid(
  lic: LifecycleLicense | null | undefined,
  schoolId: string,
  now: Date = new Date(),
): boolean {
  return classifyLicense(lic, schoolId, now) === 'valid';
}

/**
 * Sélectionne UNIQUEMENT la licence courante. L'historique n'est jamais
 * utilisé comme repli : une ancienne licence ACTIVE ne réautorise pas l'accès.
 */
export function selectCurrentLicense<T extends LifecycleLicense>(
  licenses: readonly T[] | null | undefined,
  schoolId: string,
  now: Date = new Date(),
): T | null {
  if (!Array.isArray(licenses)) return null;
  const current = licenses.filter((l) => l?.is_current === true && l?.school_id === schoolId);
  if (current.length !== 1) return null;
  return isLicenseCurrentlyValid(current[0], schoolId, now) ? current[0] : null;
}

/** Licence courante, quel que soit son état (utile pour afficher suspension/expiration). */
export function findCurrentRecord<T extends LifecycleLicense>(
  licenses: readonly T[] | null | undefined,
  schoolId: string,
): T | null {
  if (!Array.isArray(licenses)) return null;
  const current = licenses.filter((l) => l?.is_current === true && l?.school_id === schoolId);
  return current.length === 1 ? current[0] : null;
}

/** Plan de renouvellement : archivage de l'ancienne courante + promotion de la nouvelle. */
export function buildRenewalPlan<T extends LifecycleLicense>(
  previous: T | null | undefined,
  next: T,
): { archiveIds: string[]; next: T & { is_current: true } } {
  const archiveIds = previous && previous.id !== next.id && previous.is_current === true
    ? [previous.id]
    : [];
  return { archiveIds, next: { ...next, is_current: true } };
}
