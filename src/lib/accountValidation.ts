import { supabaseAdmin } from './supabaseClient';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un compte géré côté cloud possède un identifiant UUID Supabase.
 * Les comptes créés localement par la direction ont un préfixe « local- »
 * et ne doivent jamais être validés contre le cloud.
 */
export function isCloudManagedUserId(userId: string | null | undefined): boolean {
  return !!userId && UUID_RE.test(userId);
}

export type CloudAccountState = 'active' | 'missing' | 'unknown';

/**
 * Vérifie qu'un compte géré côté cloud existe toujours et est actif.
 *  - 'active'  : le compte existe et son statut est ACTIVE
 *  - 'missing' : le compte a été supprimé ou suspendu côté cloud
 *  - 'unknown' : cloud injoignable → aucune conclusion (mode hors-ligne toléré)
 */
export async function verifyCloudAccount(userId: string): Promise<CloudAccountState> {
  if (!isCloudManagedUserId(userId)) return 'unknown';
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, status')
      .eq('id', userId)
      .maybeSingle();
    if (error) return 'unknown';
    if (!data) return 'missing';
    return data.status === 'ACTIVE' ? 'active' : 'missing';
  } catch (_) {
    return 'unknown';
  }
}
