export type LicenseGuardErrorCategory =
  | 'network'
  | 'jwt_expired'
  | 'unauthorized'
  | 'forbidden'
  | 'server_error'
  | 'edge_unavailable'
  | 'configuration'
  | 'unknown';

export type LicenseGuardErrorContext = 'database' | 'edge' | 'native';

export interface ClassifiedLicenseGuardError {
  category: LicenseGuardErrorCategory;
  offlineAllowed: boolean;
  message: string;
}

export const MAX_OFFLINE_TOKEN_SECONDS = 7 * 24 * 60 * 60;

const MESSAGES: Record<LicenseGuardErrorCategory, string> = {
  network: 'Réseau indisponible : validation locale temporaire possible.',
  jwt_expired: 'Session expirée : veuillez vous reconnecter.',
  unauthorized: 'Authentification refusée (401) : veuillez vous reconnecter.',
  forbidden: "Accès refusé par les règles de sécurité (403) : aucune validation hors ligne n'est autorisée.",
  server_error: "Erreur serveur (500) : aucune validation hors ligne n'est autorisée.",
  edge_unavailable: "Service d'émission de licence indisponible : aucune validation hors ligne n'est autorisée.",
  configuration: "Erreur de configuration du service de licence : contactez l'administrateur.",
  unknown: "Erreur de vérification non classifiée : accès refusé par sécurité.",
};

function readStatus(err: any): number {
  const candidates = [
    err?.status,
    err?.statusCode,
    err?.response?.status,
    err?.context?.status,
    err?.context?.statusCode,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const code = Number(err?.code);
  return Number.isFinite(code) && code > 0 ? code : 0;
}

function readText(err: any): string {
  const parts = [
    err?.message,
    err?.name,
    err?.code,
    err?.details,
    err?.hint,
    err?.error?.message,
    err?.context?.message,
    err?.context?.error,
  ];
  return parts
    .filter((part) => part !== undefined && part !== null)
    .map((part) => String(part))
    .join(' ')
    .toLowerCase();
}

export function classifyLicenseGuardError(
  err: unknown,
  context: LicenseGuardErrorContext = 'database'
): ClassifiedLicenseGuardError {
  const text = readText(err);
  const status = readStatus(err);
  const code = String(err && typeof err === 'object' ? (err as any).code ?? '' : '').toUpperCase();

  let category: LicenseGuardErrorCategory;

  if (
    /misconfigured|server misconfigured|not configured|non configuré|(?:missing|required|absent|invalid).*(supabase|key|secret|url|anon|service_role|private)|invalid api key|client supabase non initialisé|module natif orion non initialisé|orion_license_private_key_pem/.test(text)
  ) {
    category = 'configuration';
  } else if (
    /jwt expired|expired jwt|token expired|session has expired|jwt.*expir/.test(text) ||
    code === 'JWT_EXPIRED'
  ) {
    category = 'jwt_expired';
  } else if (status === 401 || /^401$/.test(code) || /\bunauthorized\b|invalid jwt|missing bearer/.test(text)) {
    category = 'unauthorized';
  } else if (
    status === 403 ||
    /^403$/.test(code) ||
    code === '42501' ||
    /row[- ]level security|\brls\b|permission denied|insufficient privilege|forbidden/.test(text)
  ) {
    category = 'forbidden';
  } else if (
    context === 'edge' &&
    (status === 404 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      /functionsfetcherror|functionsrelayerror|functionshttperror|edge function|functions\/v1/.test(text) ||
      /failed to fetch|network|fetch failed|load failed/.test(text))
  ) {
    category = 'edge_unavailable';
  } else if (status >= 500) {
    category = 'server_error';
  } else if (
    /failed to fetch|networkerror|network request failed|fetch failed|load failed|econnreset|enotfound|etimedout|connection (refused|reset)|offline|timeout/.test(text)
  ) {
    category = 'network';
  } else {
    category = 'unknown';
  }

  return {
    category,
    offlineAllowed: category === 'network',
    message: MESSAGES[category],
  };
}

export function canUseOfflineGrace(category: LicenseGuardErrorCategory): boolean {
  return category === 'network';
}

export interface OfflineLicenseClaims {
  sub?: unknown;
  school_id?: unknown;
  license_key?: unknown;
  status?: unknown;
  starts_at?: unknown;
  expires_at?: unknown;
  is_current?: unknown;
  iat?: unknown;
  exp?: unknown;
}

export interface OfflineClaimsValidation {
  valid: boolean;
  reason?: string;
}

function parseEpoch(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : NaN;
}

export function validateOfflineLicenseClaims(
  claims: OfflineLicenseClaims | null | undefined,
  schoolId: string,
  now: Date = new Date()
): OfflineClaimsValidation {
  if (!claims || typeof claims !== 'object') {
    return { valid: false, reason: 'Claims du jeton absents.' };
  }
  if (typeof claims.sub !== 'string' || claims.sub.trim().length === 0) {
    return { valid: false, reason: 'Identifiant de licence du jeton invalide.' };
  }
  if (claims.school_id !== schoolId) {
    return { valid: false, reason: "Le jeton n'appartient pas à cet établissement." };
  }
  if (claims.is_current !== true) {
    return { valid: false, reason: 'Le jeton concerne une licence historique.' };
  }
  if (claims.status !== 'ACTIVE') {
    return { valid: false, reason: 'Le jeton concerne une licence non active.' };
  }

  const iat = parseEpoch(claims.iat);
  const exp = parseEpoch(claims.exp);
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) {
    return { valid: false, reason: 'Claims temporels du jeton invalides.' };
  }

  const nowSec = Math.floor(now.getTime() / 1000);
  if (iat > nowSec + 60) {
    return { valid: false, reason: 'Jeton émis dans le futur.' };
  }
  if (exp <= nowSec) {
    return { valid: false, reason: 'Jeton expiré.' };
  }
  if (exp <= iat) {
    return { valid: false, reason: 'Incohérence des claims du jeton.' };
  }
  if (exp - iat > MAX_OFFLINE_TOKEN_SECONDS) {
    return { valid: false, reason: 'Durée du jeton supérieure à sept jours.' };
  }

  if (claims.starts_at !== null && claims.starts_at !== undefined) {
    const starts = Date.parse(String(claims.starts_at));
    if (!Number.isFinite(starts) || starts > now.getTime()) {
      return { valid: false, reason: "La licence du jeton n'est pas encore active." };
    }
  }

  if (claims.expires_at !== null && claims.expires_at !== undefined) {
    const expires = Date.parse(String(claims.expires_at));
    if (!Number.isFinite(expires) || expires <= now.getTime()) {
      return { valid: false, reason: 'La licence du jeton est expirée.' };
    }
  }

  return { valid: true };
}
