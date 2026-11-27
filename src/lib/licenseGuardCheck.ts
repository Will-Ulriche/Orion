import {
  LS_LIC_TOKEN,
  type LicenseRecord,
} from './licenseActivation.ts';
import {
  canUseOfflineGrace,
  classifyLicenseGuardError,
  validateOfflineLicenseClaims,
  type OfflineLicenseClaims,
} from './licenseGuardErrors.ts';
import {
  classifyLicense,
  findCurrentRecord,
} from './licenseLifecycle.ts';

export const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface DeviceInfoResult {
  identifier: string;
  name?: string;
  platform?: string;
}

export interface IssueLicenseTokenPayload {
  license_id: string;
  school_id: string;
  device_identifier: string;
  device_name?: string;
  platform?: string;
}

export type LicenseCheckStatus =
  | 'checking'
  | 'valid'
  | 'future'
  | 'expired'
  | 'suspended'
  | 'revoked'
  | 'missing'
  | 'offline_grace'
  | 'verification_error';

export interface LicenseCheckOutcome {
  status: LicenseCheckStatus;
  licenseInfo: LicenseRecord | null;
  errorMessage: string | null;
}

export interface LicenseCheckDeps {
  invokeFn: <T = any>(cmd: string, args?: any) => Promise<T>;
  supabaseClient: any;
  storage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  } | null;
  verifyOfflineTokenFn?: (schoolId: string) => Promise<LicenseRecord | null>;
  now?: Date;
}

/**
 * Récupère l'identifiant réel de la machine via la commande Tauri `get_device_info`.
 * Ne retourne jamais d'identifiant fictif ni de valeur par défaut.
 */
export async function fetchDeviceInfo(
  invokeFn: <T = any>(cmd: string, args?: any) => Promise<T>
): Promise<DeviceInfoResult> {
  let info: any;
  try {
    info = await invokeFn<{ identifier?: unknown; name?: unknown; platform?: unknown }>('get_device_info');
  } catch (err: any) {
    const detail = err?.message ? ` (${err.message})` : '';
    throw new Error(`Identifiant machine indisponible : vérification de la licence impossible${detail}.`);
  }

  const identifier = typeof info?.identifier === 'string' ? info.identifier.trim() : '';
  if (!identifier) {
    throw new Error('Identifiant machine absent : vérification de la licence impossible.');
  }

  const name = typeof info?.name === 'string' ? info.name.trim() : '';
  const platform = typeof info?.platform === 'string' ? info.platform.trim() : '';

  return {
    identifier,
    ...(name ? { name } : {}),
    ...(platform ? { platform } : {}),
  };
}

/**
 * Construit le corps de requête attendu par l'Edge Function `issue-license-token`.
 */
export function buildIssueLicenseTokenPayload(params: {
  licenseId: string;
  schoolId: string;
  deviceInfo: DeviceInfoResult;
}): IssueLicenseTokenPayload {
  return {
    license_id: params.licenseId,
    school_id: params.schoolId,
    device_identifier: params.deviceInfo.identifier,
    ...(params.deviceInfo.name ? { device_name: params.deviceInfo.name } : {}),
    ...(params.deviceInfo.platform ? { platform: params.deviceInfo.platform } : {}),
  };
}

/**
 * Exécute le cycle complet de vérification de licence côté LicenseGuard.
 * Préserve la licence locale existante en cas d'erreur technique de transmission
 * ou de récupération d'identifiant machine, tout en refusant l'accès.
 */
export async function runLicenseGuardCheck(
  params: {
    userId: string;
    targetSchoolId: string;
  },
  deps: LicenseCheckDeps
): Promise<LicenseCheckOutcome> {
  const { userId, targetSchoolId: initialSchoolId } = params;
  const { invokeFn, supabaseClient, storage } = deps;
  const now = deps.now ?? new Date();
  let targetId = initialSchoolId;

  const verifyOffline = deps.verifyOfflineTokenFn ?? (async (sid: string) => {
    const token = storage?.getItem(LS_LIC_TOKEN);
    if (!token) return null;
    try {
      const res = await invokeFn<{
        valid: boolean;
        reason?: string;
        claims?: OfflineLicenseClaims;
      }>('verify_license_token', { token, schoolId: sid });
      const claims = res?.claims;
      if (!res?.valid || !claims) return null;
      if (!validateOfflineLicenseClaims(claims, sid, now).valid) return null;
      if (
        typeof claims.sub !== 'string' ||
        typeof claims.license_key !== 'string' ||
        typeof claims.status !== 'string' ||
        typeof claims.school_id !== 'string'
      ) {
        return null;
      }
      return {
        id: claims.sub,
        school_id: claims.school_id,
        license_key: claims.license_key,
        status: claims.status,
        expires_at: typeof claims.expires_at === 'string' ? claims.expires_at : null,
        starts_at: typeof claims.starts_at === 'string' ? claims.starts_at : null,
        is_current: claims.is_current === true,
        max_devices: null,
      };
    } catch (_) {
      return null;
    }
  });

  try {
    try {
      const { data: prof } = await supabaseClient
        .from('profiles')
        .select('school_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (prof?.school_id) targetId = prof.school_id;
    } catch (_) {}

    const { data: lics, error } = await supabaseClient
      .from('licenses')
      .select('id, school_id, license_key, status, starts_at, expires_at, max_devices, is_current')
      .eq('school_id', targetId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const cloudLics: LicenseRecord[] = (lics ?? []) as LicenseRecord[];
    const currentRecord = findCurrentRecord(cloudLics, targetId);
    const verdict = classifyLicense(currentRecord, targetId, now);

    if (verdict === 'valid' && currentRecord) {
      let deviceInfo: DeviceInfoResult;
      try {
        deviceInfo = await fetchDeviceInfo(invokeFn);
      } catch (devErr: any) {
        return {
          status: 'verification_error',
          licenseInfo: currentRecord,
          errorMessage: devErr?.message || 'Identifiant machine indisponible.',
        };
      }

      let tokenVerified = false;
      let tokenFailureAllowedOffline = false;
      let issuedToken: string | null = null;
      let tokenFailureMessage: string | null = null;

      try {
        const payload = buildIssueLicenseTokenPayload({
          licenseId: currentRecord.id,
          schoolId: targetId,
          deviceInfo,
        });

        const { data: tokenRes, error: tokenErr } = await supabaseClient.functions.invoke('issue-license-token', {
          body: payload,
        });

        if (tokenErr) {
          const classified = classifyLicenseGuardError(tokenErr, 'edge');
          tokenFailureAllowedOffline = classified.offlineAllowed;
          tokenFailureMessage = classified.message;
        } else if (tokenRes?.token) {
          const verifyRes = await invokeFn<{
            valid: boolean;
            reason?: string;
            claims?: OfflineLicenseClaims;
          }>('verify_license_token', {
            token: tokenRes.token,
            schoolId: targetId,
          });

          const claimsValid =
            verifyRes?.valid &&
            verifyRes.claims &&
            validateOfflineLicenseClaims(verifyRes.claims, targetId, now).valid &&
            verifyRes.claims.device_identifier === deviceInfo.identifier;

          if (claimsValid) {
            issuedToken = tokenRes.token;
            tokenVerified = true;
          } else {
            tokenFailureMessage =
              verifyRes?.reason ||
              (verifyRes?.claims?.device_identifier !== deviceInfo.identifier
                ? 'Le jeton reçu ne correspond pas à cet appareil.'
                : 'Jeton de licence rejeté par la vérification cryptographique.');
          }
        } else {
          tokenFailureMessage = "Le serveur d'émission n'a renvoyé aucun jeton de licence.";
        }
      } catch (tokenEx: any) {
        const classified = classifyLicenseGuardError(tokenEx, 'native');
        tokenFailureAllowedOffline = classified.offlineAllowed;
        tokenFailureMessage = classified.message;
      }

      if (!tokenVerified && tokenFailureAllowedOffline) {
        const offlineLicense = await verifyOffline(targetId);
        if (offlineLicense) {
          return {
            status: 'offline_grace',
            licenseInfo: offlineLicense,
            errorMessage: null,
          };
        }
      }

      if (!tokenVerified || !issuedToken) {
        // Ne pas supprimer une licence valide existante en cas d'erreur technique de transmission.
        return {
          status: 'verification_error',
          licenseInfo: currentRecord,
          errorMessage: tokenFailureMessage || 'Échec de vérification du jeton de licence.',
        };
      }

      try {
        await invokeFn('save_license', {
          token: issuedToken,
          license: { ...currentRecord, is_current: true },
        });

        storage?.setItem(LS_LIC_TOKEN, issuedToken);
        return {
          status: 'valid',
          licenseInfo: currentRecord,
          errorMessage: null,
        };
      } catch (error: any) {
        console.error(
          '[LicenseGuardCheck] Échec de persistance SQLite:',
          error
        );
        return {
          status: 'verification_error',
          licenseInfo: currentRecord,
          errorMessage: `Impossible d'enregistrer la licence localement : ${error?.message || String(error)}`,
        };
      }
    }

    if (currentRecord) {
      storage?.removeItem(LS_LIC_TOKEN);
      if (verdict === 'suspended') return { status: 'suspended', licenseInfo: currentRecord, errorMessage: null };
      if (verdict === 'revoked') return { status: 'revoked', licenseInfo: currentRecord, errorMessage: null };
      if (verdict === 'expired') return { status: 'expired', licenseInfo: currentRecord, errorMessage: null };
      if (verdict === 'future') return { status: 'future', licenseInfo: currentRecord, errorMessage: null };
      return { status: 'missing', licenseInfo: currentRecord, errorMessage: null };
    }

    storage?.removeItem(LS_LIC_TOKEN);
    return { status: 'missing', licenseInfo: null, errorMessage: null };
  } catch (err) {
    const classified = classifyLicenseGuardError(err, 'database');
    if (!canUseOfflineGrace(classified.category)) {
      return {
        status: 'verification_error',
        licenseInfo: null,
        errorMessage: classified.message,
      };
    }

    const offlineLicense = await verifyOffline(targetId);
    if (offlineLicense) {
      return {
        status: 'offline_grace',
        licenseInfo: offlineLicense,
        errorMessage: null,
      };
    }
    return { status: 'missing', licenseInfo: null, errorMessage: null };
  }
}

/**
 * Enregistre le cycle complet : vérification immédiate (démarrage / redémarrage),
 * revérification toutes les 5 minutes, et revérification sur renouvellement.
 */
export function startLicenseGuardLifecycle(params: {
  checkLicense: () => void;
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  addEventListenerFn?: (event: string, handler: () => void) => void;
  removeEventListenerFn?: (event: string, handler: () => void) => void;
}): () => void {
  const intervalMs = params.intervalMs ?? RECHECK_INTERVAL_MS;
  const setInt = params.setIntervalFn ?? setInterval;
  const clearInt = params.clearIntervalFn ?? clearInterval;

  params.checkLicense();
  const timerId = setInt(params.checkLicense, intervalMs);

  const onUpdated = () => params.checkLicense();
  params.addEventListenerFn?.('orion:license-updated', onUpdated);

  return () => {
    clearInt(timerId);
    params.removeEventListenerFn?.('orion:license-updated', onUpdated);
  };
}
