/**
 * État du parcours d'activation Orion (LIC-01 / première connexion).
 *
 * Deux états distincts et non interchangeables :
 *  - `onlineConfigured` : un compte Supabase en ligne a été configuré / utilisé.
 *  - `licenseActivated` : une licence a été validée à distance PUIS persistée dans SQLite.
 *
 * Une authentification Supabase réussie n'implique jamais une activation de licence.
 * Tant que `licenseActivated` est faux, la connexion en ligne reste obligatoire :
 * c'est elle seule qui permet d'appeler l'Edge Function d'émission du jeton RS256.
 */

export const LS_ONLINE_CONFIGURED = 'orion_online_configured';
export const LS_LICENSE_ACTIVATED = 'orion_license_activated';
const LS_LEGACY_ACTIVATED = 'orion_activated';

export interface LicenseFlowState {
  onlineConfigured: boolean;
  licenseActivated: boolean;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export type LoginMode = 'online' | 'local';

/**
 * Relit l'état depuis le stockage persistant (au redémarrage).
 * L'ancien flag `orion_activated` n'était positionné que lors d'une connexion
 * Supabase réussie : il est migré comme simple indice de compte en ligne et
 * ne peut en aucun cas qualifier une licence activée.
 */
export function readLicenseFlowState(storage: StorageLike | null): LicenseFlowState {
  if (!storage) return { onlineConfigured: false, licenseActivated: false };
  const onlineConfigured =
    storage.getItem(LS_ONLINE_CONFIGURED) === '1' ||
    storage.getItem(LS_LEGACY_ACTIVATED) === '1';
  const licenseActivated = storage.getItem(LS_LICENSE_ACTIVATED) === '1';
  return { onlineConfigured, licenseActivated };
}

/**
 * Seul un résultat d'activation effectif peut marquer l'installation activée.
 * `activateSchoolLicense` ne renvoie `success: true` et un jeton qu'APRÈS
 * validation cryptographique et persistance SQLite réussies.
 */
export function isEffectiveLicenseActivation(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const candidate = result as { success?: unknown; token?: unknown };
  return (
    candidate.success === true &&
    typeof candidate.token === 'string' &&
    candidate.token.length > 0
  );
}

/** Persiste l'activation effective. Refuse tout résultat incomplet ou simulé. */
export function applyLicenseActivation(
  storage: StorageLike | null,
  result: unknown
): boolean {
  if (!isEffectiveLicenseActivation(result) || !storage) return false;
  storage.setItem(LS_LICENSE_ACTIVATED, '1');
  storage.setItem(LS_ONLINE_CONFIGURED, '1');
  storage.removeItem(LS_LEGACY_ACTIVATED);
  return true;
}

/** Efface l'activation effective (licence expirée, révoquée ou absente). */
export function clearLicenseActivation(storage: StorageLike | null): void {
  if (!storage) return;
  storage.removeItem(LS_LICENSE_ACTIVATED);
}

/**
 * Choisit l'écran de connexion.
 *  - SUPER_ADMIN : toujours en ligne (aucun parcours de licence locale).
 *  - Licence non activée : toujours en ligne, aucun retour à la connexion locale.
 *  - Licence activée : connexion locale normale, avec bascule en ligne possible.
 */
export function resolveLoginMode(params: {
  licenseActivated: boolean;
  wantsOnline?: boolean;
  superAdmin?: boolean;
}): LoginMode {
  if (params.superAdmin) return 'online';
  if (!params.licenseActivated) return 'online';
  return params.wantsOnline === true ? 'online' : 'local';
}

/**
 * Une session locale ne peut être restaurée que si la licence est activée.
 * Cela évite qu'un redémarrage enferme la direction dans une session locale
 * incapable d'appeler l'Edge Function d'activation.
 */
export function canRestoreOfflineSession(params: {
  licenseActivated: boolean;
  superAdmin?: boolean;
}): boolean {
  if (params.superAdmin) return false;
  return params.licenseActivated === true;
}
