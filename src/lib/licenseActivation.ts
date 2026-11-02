/**
 * Module d'activation des licences Orion (LIC-01)
 * ─────────────────────────────────────────────────────────────
 * Respecte strictement le modèle de sécurité et les règles métier Orion :
 *  - Le SUPER_ADMIN est le seul à pouvoir créer, attribuer, modifier ou suspendre une licence.
 *  - La DIRECTION peut uniquement activer une licence déjà attribuée à son établissement.
 *  - La DIRECTION ne peut JAMAIS créer, modifier ou changer le statut d'une licence.
 *  - L'activation ne fait JAMAIS de modification directe (UPDATE/INSERT) sur la table `licenses`.
 *  - Toute clé appartenant à un autre établissement est formellement refusée.
 *  - Une licence suspendue, révoquée ou expirée est rejetée avec un message explicite.
 *  - L'activation n'est JAMAIS considérée comme valide localement sans preuve distante
 *    (jeton JWT RS256 émis par l'Edge Function et validé cryptographiquement par Rust).
 *  - Persistance atomique : la sauvegarde SQLite locale est obligatoire avant validation
 *    finale dans localStorage. En cas d'échec SQLite, l'activation échoue visiblement.
 */

export interface LicenseRecord {
  id: string;
  school_id: string;
  license_key: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  max_devices?: number | null;
  issued_at?: string | null;
}

export interface ActivationResult {
  success: boolean;
  license: LicenseRecord;
  token: string;
}

export const LS_LIC_TOKEN = 'orion_lic_token';
export const LS_CACHED_LIC = 'orion_lic_cache';
export const LS_LAST_OK_LIC = 'orion_lic_ok_at';

// Résolution paresseuse des dépendances runtime Vite / Tauri
let lazySupabase: any = null;
async function resolveDefaultSupabase() {
  if (!lazySupabase) {
    try {
      const mod = await import('./supabaseClient.ts');
      lazySupabase = mod.supabase;
    } catch (_) {}
  }
  return lazySupabase;
}

let lazyInvoke: any = null;
async function resolveDefaultInvoke() {
  if (!lazyInvoke) {
    try {
      const mod = await import('@tauri-apps/api/core');
      lazyInvoke = mod.invoke;
    } catch (_) {}
  }
  return lazyInvoke;
}

/**
 * Normalise la clé saisie : majuscules, suppression des espaces/underscores,
 * et formatage ORION-XXXX-XXXX-XXXX si nécessaire.
 */
export function normalizeLicenseKey(input: string): string {
  let cleaned = input.trim().toUpperCase().replace(/[\s_]+/g, '-');
  if (!cleaned.startsWith('ORION-') && cleaned.replace(/-/g, '').length === 12) {
    const raw = cleaned.replace(/-/g, '');
    cleaned = `ORION-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  }
  return cleaned;
}

export interface ActivateLicenseParams {
  licenseKey: string;
  schoolId: string;
}

export interface ActivateLicenseDeps {
  invokeFn?: <T = any>(cmd: string, args?: any) => Promise<T>;
  supabaseClient?: any;
  storage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, val: string) => void;
    removeItem: (key: string) => void;
  };
  dispatchFn?: (eventName: string) => void;
}

/**
 * Détermine avec certitude si une erreur correspond à l'absence de la fonction RPC en base.
 *
 * Formats reconnus comme absence de fonction :
 *  - Code PostgREST 'PGRST202' (Could not find the function ... in the schema cache)
 *  - Code PostgreSQL '42883' (undefined_function)
 *  - Messages PostgREST / Postgres mentionnant l'absence de la fonction activate_license
 *
 * Formats STRICTEMENT EXCLUS (ne doivent jamais déclencher le fallback) :
 *  - Erreurs d'autorisation (401, 403, SQLSTATE 42501)
 *  - Erreurs serveur internes (500)
 *  - Erreurs réseau (Failed to fetch, NetworkError, timeout)
 *  - Erreurs inconnues (fail-closed)
 */
export function isRpcMissingError(err: any): boolean {
  if (!err) return false;

  const code = String(err.code || '').trim().toUpperCase();
  const message = String(err.message || '').trim().toLowerCase();
  const details = String(err.details || '').trim().toLowerCase();

  // 1. Code PostgREST standard : fonction introuvable dans le cache de schéma
  if (code === 'PGRST202') {
    return true;
  }

  // 2. Code PostgreSQL standard : undefined_function
  if (code === '42883') {
    return true;
  }

  // 3. Détection par message explicite ciblant la fonction activate_license
  const hasFunctionName =
    message.includes('activate_license') || details.includes('activate_license');

  if (hasFunctionName) {
    if (
      message.includes('could not find the function') ||
      message.includes('does not exist') ||
      message.includes('schema cache') ||
      details.includes('does not exist') ||
      details.includes('could not find')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Valide les dates et le statut d'une licence sans effectuer de requête.
 */
export function validateLicenseConstraints(
  lic: LicenseRecord,
  targetSchoolId: string,
  now: Date = new Date()
): { valid: boolean; error?: string } {
  if (!lic.school_id || lic.school_id === 'unassigned' || lic.school_id !== targetSchoolId) {
    return {
      valid: false,
      error: "Cette clé de licence n'est pas attribuée à votre établissement.",
    };
  }

  if (lic.status === 'REVOKED') {
    return { valid: false, error: 'Cette clé de licence a été révoquée.' };
  }

  if (lic.status === 'SUSPENDED') {
    return { valid: false, error: 'Cette clé de licence est suspendue.' };
  }

  if (lic.status !== 'ACTIVE') {
    return { valid: false, error: "Cette clé de licence n'est pas active." };
  }

  if (lic.starts_at && new Date(lic.starts_at) > now) {
    return { valid: false, error: "Cette clé de licence n'est pas encore active." };
  }

  if (lic.expires_at && new Date(lic.expires_at) <= now) {
    return { valid: false, error: 'Cette clé de licence est expirée.' };
  }

  return { valid: true };
}

/**
 * Effectue le parcours complet d'activation sécurisée d'une licence :
 * 1. Vérification en lecture seule des métadonnées de la licence.
 * 2. Contrôle strict de l'appartenance à l'établissement (rejet formel de tout autre school_id).
 * 3. Contrôle du statut ('ACTIVE') et des dates de validité.
 * 4. Obtention du jeton JWT RS256 signé par le serveur via l'Edge Function.
 * 5. Validation cryptographique native du jeton par le composant Rust.
 * 6. Persistance locale atomique : sauvegarde SQLite obligatoire, puis stockage localStorage.
 *
 * En cas d'échec à n'importe quelle étape, AUCUN état activé n'est conservé.
 */
export async function activateSchoolLicense(
  params: ActivateLicenseParams,
  deps?: ActivateLicenseDeps
): Promise<ActivationResult> {
  const cleanKey = normalizeLicenseKey(params.licenseKey);
  const targetSchoolId = params.schoolId?.trim();

  const supabase = deps?.supabaseClient ?? (await resolveDefaultSupabase());
  const invoke: <T = any>(cmd: string, args?: any) => Promise<T> =
    deps?.invokeFn ?? (await resolveDefaultInvoke());
  const storage = deps?.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  const dispatch = deps?.dispatchFn ?? ((eventName: string) => {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(eventName));
    }
  });

  if (!cleanKey) {
    throw new Error('Veuillez saisir une clé de licence.');
  }

  if (!targetSchoolId || targetSchoolId === 'school-1') {
    throw new Error(
      "Identifiant d'établissement invalide ou introuvable. Veuillez vous reconnecter."
    );
  }

  if (!supabase) {
    throw new Error("Client Supabase non initialisé.");
  }

  if (!invoke) {
    throw new Error("Module natif Orion non initialisé.");
  }

  // 1. Essayer d'abord la RPC sécurisée 'activate_license' si elle est installée
  let licData: LicenseRecord | null = null;
  let rpcAttempted = false;

  try {
    const { data: rpcLic, error: rpcErr } = await supabase.rpc('activate_license', {
      p_license_key: cleanKey,
      p_school_id: targetSchoolId,
    });

    if (!rpcErr && rpcLic) {
      rpcAttempted = true;
      licData = rpcLic as LicenseRecord;
    } else if (rpcErr) {
      if (isRpcMissingError(rpcErr)) {
        // La fonction RPC est confirmée absente : on autorise le fallback sur RLS
        rpcAttempted = false;
      } else {
        // Erreur d'autorisation, validation métier, erreur 500 ou réseau : fail-closed
        throw new Error(rpcErr.message || 'Erreur lors de la vérification de la licence');
      }
    }
  } catch (rpcEx: any) {
    if (isRpcMissingError(rpcEx)) {
      rpcAttempted = false;
    } else {
      throw rpcEx;
    }
  }

  // 2. Si la RPC est absente (confirmé), utiliser la lecture RLS standard
  if (!rpcAttempted || !licData) {
    const { data: lic, error } = await supabase
      .from('licenses')
      .select('id, school_id, license_key, status, starts_at, expires_at, max_devices')
      .eq('license_key', cleanKey)
      .maybeSingle();

    if (error || !lic) {
      throw new Error(
        'Clé de licence invalide, introuvable ou non attribuée à votre établissement.'
      );
    }

    // Validation stricte des règles métier
    const validation = validateLicenseConstraints(lic as LicenseRecord, targetSchoolId);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    licData = lic as LicenseRecord;
  }

  // 3. Demander l'émission du jeton JWT RS256 à l'Edge Function Supabase
  let token: string | null = null;
  try {
    const { data: tokenRes, error: tokenErr } = await supabase.functions.invoke(
      'issue-license-token',
      {
        body: { license_id: licData.id, school_id: targetSchoolId },
      }
    );

    if (tokenErr) {
      throw new Error(
        tokenErr.message || "Échec lors de l'appel au serveur d'émission des licences."
      );
    }

    if (!tokenRes || !tokenRes.token) {
      const errMsg = (tokenRes as any)?.error || "Le serveur distant n'a renvoyé aucun jeton valide.";
      throw new Error(`Activation refusée : ${errMsg}`);
    }

    token = tokenRes.token;
  } catch (fetchErr: any) {
    throw new Error(
      fetchErr.message || "Impossible d'obtenir une attestation de licence signée par le serveur distant."
    );
  }

  if (!token) {
    throw new Error("Impossible d'obtenir une attestation de licence signée par le serveur distant.");
  }

  // 4. Vérification cryptographique impérative par le composant natif Rust
  const verifyRes = await invoke<{
    valid: boolean;
    reason?: string;
    claims?: any;
  }>('verify_license_token', {
    token,
    schoolId: targetSchoolId,
  });

  if (!verifyRes || !verifyRes.valid) {
    throw new Error(
      `Le jeton de licence a été rejeté par le module de sécurité local (${
        verifyRes?.reason || 'signature cryptographique invalide'
      }).`
    );
  }

  // 5. Persistance locale atomique : sauvegarde SQLite obligatoire d'abord
  // Si SQLite échoue, l'activation échoue visiblement et aucun jeton n'est persisté.
  try {
    await invoke('save_license', { license: licData });
  } catch (saveErr: any) {
    throw new Error(
      `Échec de l'enregistrement de la licence dans la base locale SQLite : ${
        saveErr?.message || saveErr || 'erreur de persistance'
      }. L'activation n'a pas pu être finalisée.`
    );
  }

  // 6. Si SQLite a réussi, validation finale et persistance du jeton dans localStorage
  if (storage) {
    storage.setItem(LS_LIC_TOKEN, token);
    storage.setItem(LS_CACHED_LIC, JSON.stringify(licData));
    storage.setItem(LS_LAST_OK_LIC, Date.now().toString());
  }

  // Notifier l'application du renouvellement de licence
  dispatch('orion:license-updated');

  return {
    success: true,
    license: licData,
    token,
  };
}
