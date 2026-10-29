import { supabase } from './supabaseClient';

async function invokeAdminFunction<T>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token || token === 'offline') {
    throw new Error('Session requise pour cette opération administrative.');
  }

  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  const payloadError =
    data && typeof data === 'object' && 'error' in data
      ? String((data as { error: unknown }).error)
      : null;

  if (error) {
    throw new Error(payloadError || error.message || String(error));
  }
  if (payloadError) {
    throw new Error(payloadError);
  }
  return data as T;
}


// ─── Types ──────────────────────────────────────────────────

export interface School {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  website: string | null;
  currency: string | null;
  timezone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SchoolAdminInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  role?: 'DIRECTION' | 'ADMIN' | 'SECRETAIRE' | 'PROFESSEUR';
  staff_id?: string | null;
}

export interface CreateSchoolWithAdminInput {
  school: SchoolInput;
  admin: SchoolAdminInput;
  createLicense?: boolean;
}

export interface CreateSchoolResult {
  school: School;
  adminUser: {
    id: string;
    email: string;
    password: string;
    name: string;
  };
  licenseKey?: string | null;
}

export interface SchoolInput {
  name: string;
  short_name: string | null;
  city: string | null;
  country: string | null;
  phone_primary: string | null;
  email: string | null;
  status: string;
}

export interface License {
  id: string;
  school_id: string;
  license_key: string;
  status: string;
  issued_at: string | null;
  starts_at: string | null;
  expires_at: string | null;
  max_devices: number | null;
  created_at: string;
  updated_at: string;
  schools: { name: string; short_name: string | null } | null;
}

export interface LicenseInput {
  school_id: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  max_devices: number;
}

export interface Device {
  id: string;
  school_id: string;
  device_identifier: string;
  device_name: string | null;
  platform: string | null;
  status: string;
  last_seen_at: string | null;
  created_at: string;
  schools: { name: string; short_name: string | null } | null;
}

export const LICENSE_STATUSES = ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED'] as const;
export const SCHOOL_STATUSES = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;

// ─── Helpers ────────────────────────────────────────────────

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Génère une clé de licence au format ORION-XXXX-XXXX-XXXX. */
export function generateLicenseKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  const seg = (i: number) => chars.slice(i, i + 4).join('');
  return `ORION-${seg(0)}-${seg(4)}-${seg(8)}`;
}

/** Numéro de téléphone par défaut selon le pays (indicatif simple). */
export function defaultCountry(): string {
  return 'Togo';
}

/** Identifiants stables des rôles de base (cf. migration init). */
const BASE_ROLE_IDS: Record<string, string> = {
  DIRECTION: 'role_dir',
  SECRETAIRE: 'role_sec',
  PROFESSEUR: 'role_prof',
  SUPER_ADMIN: 'role_admin',
};

/**
 * Retourne l'id du rôle demandé, en le créant s'il n'existe pas encore.
 * Évite ainsi les échecs silencieux d'insertion dans user_roles (contrainte FK).
 */
async function resolveRoleId(roleName: string): Promise<string> {
  const { data, error } = await supabase
    .from('roles')
    .select('id')
    .eq('name', roleName)
    .maybeSingle();

  if (error) throw new Error(`Lecture du rôle ${roleName} impossible: ${error.message}`);
  if (data?.id) return data.id;

  const fallbackId = BASE_ROLE_IDS[roleName] ?? `role_${roleName.toLowerCase()}`;
  const { data: created, error: createErr } = await supabase
    .from('roles')
    .upsert(
      { id: fallbackId, name: roleName, description: `Rôle ${roleName}` },
      { onConflict: 'name' }
    )
    .select('id')
    .single();

  if (createErr) throw new Error(`Création du rôle ${roleName} impossible: ${createErr.message}`);
  return created.id;
}

/**
 * Résout la fiche du personnel à rattacher au compte.
 * Priorité à l'identifiant fourni par l'interface, puis rapprochement par email.
 */
async function resolveStaffId(
  schoolId: string,
  explicitStaffId: string | null | undefined,
  email: string
): Promise<string | null> {
  if (explicitStaffId) {
    const { data } = await supabase
      .from('staff')
      .select('id')
      .eq('id', explicitStaffId)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (!email) return null;
  const { data } = await supabase
    .from('staff')
    .select('id')
    .eq('school_id', schoolId)
    .ilike('email', email)
    .maybeSingle();
  return data?.id ?? null;
}

// ─── Établissements ─────────────────────────────────────────

export async function listSchools(): Promise<School[]> {
  const res = await supabase
    .from('schools')
    .select('*')
    .order('created_at', { ascending: false });
  return unwrap<School[]>(res);
}

export async function createSchool(input: SchoolInput): Promise<School> {
  const res = await supabase
    .from('schools')
    .insert({ id: crypto.randomUUID(), ...input })
    .select('*')
    .single();
  return unwrap<School>(res);
}

/**
 * Crée un établissement ainsi que son compte administrateur (identifiants Supabase Auth + profil + rôle)
 * et optionnellement sa licence initiale de 1 an.
 */
export async function createSchoolWithAdmin(input: CreateSchoolWithAdminInput): Promise<CreateSchoolResult> {
  const schoolId = crypto.randomUUID();
  const schoolEmail = input.school.email ? input.school.email.trim().toLowerCase() : null;

  // 1. Créer l'établissement dans la table schools
  const { data: newSchool, error: schoolErr } = await supabase
    .from('schools')
    .insert({
      id: schoolId,
      name: input.school.name.trim(),
      short_name: input.school.short_name?.trim() || null,
      city: input.school.city?.trim() || null,
      country: input.school.country?.trim() || 'Togo',
      phone_primary: input.school.phone_primary?.trim() || null,
      email: schoolEmail,
      status: input.school.status || 'ACTIVE',
    })
    .select('*')
    .single();

  if (schoolErr) {
    throw new Error(`Erreur lors de la création de l'établissement: ${schoolErr.message}`);
  }

  // 2. Créer l'utilisateur dans Supabase Auth (Edge Function, jamais service_role côté client)
  const adminEmail = input.admin.email.trim().toLowerCase();
  const firstName = input.admin.first_name.trim();
  const lastName = input.admin.last_name.trim();
  const targetRole = input.admin.role || 'DIRECTION';

  let authData: any;
  try {
    authData = await invokeAdminFunction('admin-create-user', {
      email: adminEmail,
      password: input.admin.password,
      email_confirm: true,
      user_metadata: {
        school_id: schoolId,
        first_name: firstName,
        last_name: lastName,
        role: targetRole,
        // initial_password supprimé (ORI-SEC-002) : les mots de passe ne sont
        // jamais persistés dans les métadonnées. Le mot de passe temporaire est
        // affiché une seule fois à l'administrateur au moment de la création.
      },
    });
  } catch (authErr: any) {
    await supabase.from('schools').delete().eq('id', schoolId);
    throw new Error(`Erreur création du compte d'accès: ${authErr?.message || authErr}`);
  }

  const userId = authData?.user?.id || authData?.id;

  // 3. Insérer dans la table users
  const { error: userErr } = await supabase.from('users').upsert({
    id: userId,
    email: adminEmail,
    status: 'ACTIVE',
  });
  if (userErr) {
    await supabase.from('schools').delete().eq('id', schoolId);
    try {
      await invokeAdminFunction('admin-delete-user', { user_id: userId });
    } catch {}
    throw new Error(`Erreur enregistrement de l'utilisateur: ${userErr.message}`);
  }

  // 4. Insérer dans la table profiles
  const staffId = await resolveStaffId(schoolId, input.admin.staff_id, adminEmail);
  const { error: profErr } = await supabase.from('profiles').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    school_id: schoolId,
    first_name: firstName,
    last_name: lastName,
    phone: input.admin.phone?.trim() || null,
    staff_id: staffId,
  });
  if (profErr) {
    await supabase.from('users').delete().eq('id', userId);
    await supabase.from('schools').delete().eq('id', schoolId);
    try {
      await invokeAdminFunction('admin-delete-user', { user_id: userId });
    } catch {}
    throw new Error(`Erreur enregistrement du profil: ${profErr.message}`);
  }

  // 5. Attribuer le rôle dans user_roles
  const roleId = await resolveRoleId(targetRole);
  const { error: roleErr } = await supabase.from('user_roles').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    school_id: schoolId,
    role_id: roleId,
  });
  if (roleErr) {
    await supabase.from('profiles').delete().eq('user_id', userId);
    await supabase.from('users').delete().eq('id', userId);
    await supabase.from('schools').delete().eq('id', schoolId);
    try {
      await invokeAdminFunction('admin-delete-user', { user_id: userId });
    } catch {}
    throw new Error(`Erreur attribution du rôle ${targetRole}: ${roleErr.message}`);
  }

  // 6. Licence initiale optionnelle (activée par défaut)
  let createdLicenseKey: string | null = null;
  if (input.createLicense !== false) {
    try {
      const now = new Date();
      const oneYearLater = new Date();
      oneYearLater.setFullYear(now.getFullYear() + 1);
      createdLicenseKey = generateLicenseKey();

      await supabase.from('licenses').insert({
        id: crypto.randomUUID(),
        school_id: schoolId,
        license_key: createdLicenseKey,
        status: 'ACTIVE',
        starts_at: now.toISOString(),
        expires_at: oneYearLater.toISOString(),
        max_devices: 5,
        issued_at: now.toISOString(),
      });
    } catch (licErr) {
      console.error('Erreur création licence auto:', licErr);
    }
  }

  return {
    school: newSchool as School,
    adminUser: {
      id: userId,
      email: adminEmail,
      password: input.admin.password,
      name: `${firstName} ${lastName}`.trim(),
    },
    licenseKey: createdLicenseKey,
  };
}

/**
 * Crée des identifiants administrateur pour une école existante.
 */
export async function createAdminForSchool(
  schoolId: string,
  admin: SchoolAdminInput
): Promise<{ email: string; password: string; name: string }> {
  const adminEmail = admin.email.trim().toLowerCase();
  const firstName = admin.first_name.trim();
  const lastName = admin.last_name.trim();
  const targetRole = admin.role || 'DIRECTION';

  if (targetRole === 'DIRECTION') {
    // Vérifier qu'il n'existe pas déjà un profil DIRECTION pour cet établissement
    const { data: dirRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'DIRECTION')
      .maybeSingle();

    if (dirRole) {
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('school_id', schoolId)
        .eq('role_id', dirRole.id);

      if (existing && existing.length > 0) {
        throw new Error("Cet établissement possède déjà un compte de Direction. Un seul profil de Direction est autorisé par établissement.");
      }
    }
  }

  let authData2: any;
  try {
    authData2 = await invokeAdminFunction('admin-create-user', {
      email: adminEmail,
      password: admin.password,
      email_confirm: true,
      user_metadata: {
        school_id: schoolId,
        first_name: firstName,
        last_name: lastName,
        role: targetRole,
        // initial_password supprimé (ORI-SEC-002)
      },
    });
  } catch (authErr: any) {
    throw new Error(`Erreur création du compte: ${authErr?.message || authErr}`);
  }

  const userId = authData2?.user?.id || authData2?.id;

  const { error: userErr } = await supabase.from('users').upsert({
    id: userId,
    email: adminEmail,
    status: 'ACTIVE',
  });
  if (userErr) {
    try {
      await invokeAdminFunction('admin-delete-user', { user_id: userId });
    } catch {}
    throw new Error(`Erreur enregistrement de l'utilisateur: ${userErr.message}`);
  }

  const { error: profErr } = await supabase.from('profiles').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    school_id: schoolId,
    first_name: firstName,
    last_name: lastName,
    phone: admin.phone?.trim() || null,
    staff_id: await resolveStaffId(schoolId, admin.staff_id, adminEmail),
  });
  if (profErr) {
    await supabase.from('users').delete().eq('id', userId);
    try {
      await invokeAdminFunction('admin-delete-user', { user_id: userId });
    } catch {}
    throw new Error(`Erreur enregistrement du profil: ${profErr.message}`);
  }

  const roleId = await resolveRoleId(targetRole);
  const { error: roleErr } = await supabase.from('user_roles').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    school_id: schoolId,
    role_id: roleId,
  });
  if (roleErr) {
    await supabase.from('profiles').delete().eq('user_id', userId);
    await supabase.from('users').delete().eq('id', userId);
    try {
      await invokeAdminFunction('admin-delete-user', { user_id: userId });
    } catch {}
    throw new Error(`Erreur attribution du rôle ${targetRole}: ${roleErr.message}`);
  }

  return {
    email: adminEmail,
    password: admin.password,
    name: `${firstName} ${lastName}`.trim(),
  };
}


export async function updateSchool(id: string, input: Partial<SchoolInput>): Promise<void> {
  const res = await supabase.from('schools').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

/** Champs "identité" de l'établissement modifiables depuis l'espace direction. */
export interface SchoolSettingsInput {
  name?: string;
  short_name?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone_primary?: string | null;
  phone_secondary?: string | null;
  email?: string | null;
  website?: string | null;
  currency?: string | null;
  timezone?: string | null;
}

/**
 * Propage les informations d'identité de l'établissement saisies par la
 * direction vers le cloud, afin que la super-administration voie les mêmes
 * données (source de vérité unique). S'appuie sur les politiques RLS
 * (direction / super-admin), jamais sur une clé privilégiée côté client.
 */
export async function updateSchoolSettings(id: string, input: SchoolSettingsInput): Promise<void> {
  const res = await supabase
    .from('schools')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

export async function setSchoolStatus(id: string, status: string): Promise<void> {
  const res = await supabase.from('schools').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

/**
 * Supprime définitivement un établissement.
 *
 * La suppression est assurée par la fonction serveur `delete_school_cascade`
 * (SECURITY DEFINER) qui efface explicitement toutes les tables filles — y
 * compris celles dont la clé étrangère n'a pas de « ON DELETE CASCADE » en
 * base (classes, élèves, notes, etc.) — puis l'établissement. Les comparaisons
 * d'identifiants se font en texte côté serveur : insensible aux types uuid/text.
 *
 * Les comptes d'accès (Supabase Auth) devenus orphelins après la suppression
 * sont également supprimés — sauf s'ils restent utilisés par un autre
 * établissement.
 *
 * @throws Error si la suppression de l'école échoue OU si des comptes Auth
 *   n'ont pas pu être révoqués (pour éviter des accès fantômes).
 */
export async function deleteSchool(schoolId: string): Promise<void> {
  // 1. Repérer TOUS les utilisateurs liés à cet établissement (avant suppression)
  const [urRes, profRes] = await Promise.all([
    supabase.from('user_roles').select('user_id').eq('school_id', schoolId),
    supabase.from('profiles').select('user_id').eq('school_id', schoolId),
  ]);
  if (urRes.error) throw new Error(`Lecture des comptes liés: ${urRes.error.message}`);
  if (profRes.error) throw new Error(`Lecture des profils liés: ${profRes.error.message}`);

  const candidateIds = new Set<string>([
    ...(urRes.data ?? []).map((r: { user_id: string }) => r.user_id),
    ...(profRes.data ?? []).map((p: { user_id: string }) => p.user_id),
  ]);

  // 2. Suppression atomique côté serveur (fonction SECURITY DEFINER).
  const rpcRes = await supabase.rpc('delete_school_cascade', { p_school_id: schoolId });

  if (rpcRes.error) {
    // Repli : suppression explicite sous le JWT de l'appelant (RLS appliqué),
    // enfants d'abord pour ne jamais violer une clé étrangère.
    // Historique des inscriptions (rattaché aux inscriptions, sans school_id).
    try {
      const { data: enr } = await supabase.from('enrollments').select('id').eq('school_id', schoolId);
      const enrollmentIds = (enr ?? []).map((e: { id: string }) => e.id);
      if (enrollmentIds.length > 0) {
        await supabase.from('enrollment_history').delete().in('enrollment_id', enrollmentIds);
      }
    } catch { /* table absente ou déjà nettoyée */ }

    // Inscriptions avant les années/élèves/classes, puis le reste dans l'ordre.
    await supabase.from('enrollments').delete().eq('school_id', schoolId);
    const childTables = [
      'grades', 'teacher_assignments', 'class_subjects', 'grading_periods',
      'grade_types', 'subjects', 'classes', 'students', 'academic_years',
      'audit_logs', 'devices', 'licenses', 'user_roles', 'profiles',
    ];
    for (const table of childTables) {
      const { error } = await supabase.from(table).delete().eq('school_id', schoolId);
      // Ignorer « table absente » (migration non appliquée) — on nettoie le reste.
      if (error && !/does not exist/i.test(error.message)) {
        console.warn(`[deleteSchool] Nettoyage ${table}:`, error.message);
      }
    }

    const res = await supabase.from('schools').delete().eq('id', schoolId);
    if (res.error) {
      throw new Error(`Suppression impossible: ${res.error.message}`);
    }
  }

  // 3. Supprimer les comptes Auth devenus orphelins (aucun autre établissement)
  //    CRITIQUE : si un compte Auth survit, l'utilisateur peut encore se connecter
  //    même si toutes ses données ont été supprimées.
  const failedAuthDeletions: string[] = [];
  const unlinkedUserIds: string[] = [];

  for (const userId of candidateIds) {
    try {
      // Vérifier si l'utilisateur est encore lié à un autre établissement
      const [urAgain, profAgain] = await Promise.all([
        supabase.from('user_roles').select('id').eq('user_id', userId).limit(1),
        supabase.from('profiles').select('id').eq('user_id', userId).limit(1),
      ]);
      const stillUsed = (urAgain.data?.length ?? 0) > 0 || (profAgain.data?.length ?? 0) > 0;
      if (stillUsed) continue;

      unlinkedUserIds.push(userId);

      // Suppression du compte Supabase Auth via Edge Function authentifiée
      try {
        await invokeAdminFunction('admin-delete-user', { user_id: userId });
      } catch (authErr: any) {
        const msg = authErr?.message || String(authErr);
        if (!/not found/i.test(msg)) {
          console.error(`[deleteSchool] Échec révocation Auth pour ${userId}:`, msg);
          failedAuthDeletions.push(userId);
        }
      }
    } catch (e) {
      console.error(`[deleteSchool] Exception révocation Auth pour ${userId}:`, e);
      failedAuthDeletions.push(userId);
    }
  }

  // 4. Garantir la disparition des lignes `public.users` côté cloud.
  //    C'est ce que consulte la validation de connexion (verifyCloudAccount) :
  //    tant que la ligne subsiste, un compte d'un établissement supprimé peut
  //    encore se connecter (notamment hors-ligne). La suppression Auth ci-dessus
  //    cascade vers `users` si la clé étrangère est bien configurée ; on la force
  //    ici pour être certain du résultat.
  if (unlinkedUserIds.length > 0) {
    const { error: usersErr } = await supabase.from('users').delete().in('id', unlinkedUserIds);
    if (usersErr) {
      console.warn('[deleteSchool] Nettoyage des lignes users:', usersErr.message);
    }
  }

  // Si des comptes Auth n'ont pas pu être supprimés, lever une erreur explicite.
  // L'école est déjà supprimée, mais ces comptes peuvent encore se connecter.
  if (failedAuthDeletions.length > 0) {
    throw new Error(
      `Établissement supprimé, mais ${failedAuthDeletions.length} compte(s) Auth ` +
      `n'ont pas pu être révoqués et restent actifs. ` +
      `Supprimez-les manuellement dans Supabase Auth : ${failedAuthDeletions.join(', ')}`
    );
  }
}

// ─── Licences ───────────────────────────────────────────────

export async function listLicenses(): Promise<License[]> {
  const res = await supabase
    .from('licenses')
    .select('*, schools(name, short_name)')
    .order('created_at', { ascending: false });
  return unwrap<License[]>(res);
}

export async function createLicense(input: LicenseInput): Promise<License> {
  const res = await supabase
    .from('licenses')
    .insert({
      id: crypto.randomUUID(),
      school_id: input.school_id,
      license_key: generateLicenseKey(),
      status: input.status,
      starts_at: input.starts_at,
      expires_at: input.expires_at,
      max_devices: input.max_devices,
      issued_at: new Date().toISOString(),
    })
    .select('*, schools(name, short_name)')
    .single();
  return unwrap<License>(res);
}


export async function setLicenseStatus(id: string, status: string): Promise<void> {
  const res = await supabase.from('licenses').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

export async function updateLicense(id: string, patch: Partial<LicenseInput>): Promise<void> {
  const res = await supabase.from('licenses').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteLicense(id: string): Promise<void> {
  const res = await supabase.from('licenses').delete().eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

// ─── Appareils ──────────────────────────────────────────────

export async function listDevices(): Promise<Device[]> {
  const res = await supabase
    .from('devices')
    .select('*, schools(name, short_name)')
    .order('created_at', { ascending: false });
  return unwrap<Device[]>(res);
}

// ─── Statistiques ───────────────────────────────────────────

export interface SuperAdminStats {
  schools: number;
  activeLicenses: number;
  devices: number;
  expiringSoon: number;
}

export async function getStats(): Promise<SuperAdminStats> {
  const [schools, licenses, devices] = await Promise.all([
    listSchools(),
    listLicenses(),
    listDevices(),
  ]);

  const now = Date.now();
  const in30Days = now + 30 * 24 * 60 * 60 * 1000;
  const expiringSoon = licenses.filter(
    (l) => l.status === 'ACTIVE' && l.expires_at && new Date(l.expires_at).getTime() <= in30Days
  ).length;

  return {
    schools: schools.length,
    activeLicenses: licenses.filter((l) => l.status === 'ACTIVE').length,
    devices: devices.length,
    expiringSoon,
  };
}

// ─── Gestion des Identifiants Établissements ─────────────────

export interface SchoolCredential {
  userId: string;
  email: string;
  status: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  schoolId: string;
  schoolName: string;
  schoolShortName: string | null;
  schoolCity: string | null;
  licenseKey: string | null;
  licenseStatus: string | null;
  // initialPassword supprimé (ORI-SEC-002) : les mots de passe ne sont plus
  // stockés ni récupérés depuis les métadonnées Auth. Le mot de passe temporaire
  // est affiché une seule fois en mémoire lors de la création ou réinitialisation.
  createdAt: string;
}

// listInitialPasswords() supprimée (ORI-SEC-002) : les mots de passe ne sont
// plus stockés dans les métadonnées Auth. Cette fonction récupérait et exposait
// des mots de passe en clair pour tous les comptes — ce mécanisme est supprimé.
// Voir migration supabase/migrations/clean_initial_passwords.sql pour purger
// les données existantes.

/**
 * Récupère tous les comptes d'accès créés pour les établissements (exclut le super admin).
 * (ORI-SEC-002) : les mots de passe ne sont plus récupérés depuis les métadonnées Auth.
 */
export async function listSchoolCredentials(): Promise<SchoolCredential[]> {
  const [urRes, profRes, licRes] = await Promise.all([
    supabase
      .from('user_roles')
      .select('id, user_id, school_id, role_id, created_at, roles(name), schools(id, name, short_name, city, country), users(id, email, status)'),
    supabase.from('profiles').select('*'),
    supabase.from('licenses').select('school_id, license_key, status').order('created_at', { ascending: false }),
  ]);

  if (urRes.error) throw new Error(urRes.error.message);

  const profMap = new Map((profRes.data || []).map((p: any) => [p.user_id, p]));
  const licMap = new Map();
  // Ne garder que la licence la plus récente par école
  (licRes.data || []).forEach((l: any) => {
    if (!licMap.has(l.school_id)) {
      licMap.set(l.school_id, l);
    }
  });

  return (urRes.data || [])
    .filter((ur: any) => ur.roles?.name !== 'SUPER_ADMIN')
    .map((ur: any) => {
      const prof = profMap.get(ur.user_id);
      const lic = licMap.get(ur.school_id);
      return {
        userId: ur.user_id,
        email: ur.users?.email || 'Sans email',
        status: ur.users?.status || 'ACTIVE',
        role: ur.roles?.name || 'DIRECTION',
        firstName: prof?.first_name || '',
        lastName: prof?.last_name || '',
        phone: prof?.phone || null,
        schoolId: ur.school_id,
        schoolName: ur.schools?.name || 'Établissement inconnu',
        schoolShortName: ur.schools?.short_name || null,
        schoolCity: ur.schools?.city || null,
        licenseKey: lic?.license_key || null,
        licenseStatus: lic?.status || null,
        createdAt: ur.created_at,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Réinitialise le mot de passe d'un compte établissement.
 * (ORI-SEC-002) : le nouveau mot de passe n'est plus stocké dans les métadonnées.
 * L'administrateur le génère, le voit une seule fois dans l'interface, le transmet
 * au destinataire, puis il disparaît.
 */
export async function resetSchoolAdminPassword(userId: string, newPassword: string): Promise<void> {
  try {
    await invokeAdminFunction('admin-update-user', {
      user_id: userId,
      password: newPassword,
      // user_metadata intentionnellement absent : on ne stocke plus le mot de passe.
    });
  } catch (error: any) {
    throw new Error(`Erreur réinitialisation mot de passe: ${error?.message || error}`);
  }
}

/**
 * Modifie le statut d'accès d'un compte (ACTIVE / SUSPENDED)
 */
export async function setSchoolCredentialStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<void> {
  const { error } = await supabase.from('users').update({ status }).eq('id', userId);
  if (error) throw new Error(`Erreur mise à jour statut: ${error.message}`);
}

/**
 * Supprime définitivement un compte utilisateur d'établissement
 */
export async function deleteSchoolCredential(userId: string): Promise<void> {
  // 1. Supprimer le profil et rôles
  await supabase.from('user_roles').delete().eq('user_id', userId);
  await supabase.from('profiles').delete().eq('user_id', userId);
  await supabase.from('users').delete().eq('id', userId);

  // 2. Supprimer de Supabase Auth via Edge Function authentifiée
  try {
    await invokeAdminFunction('admin-delete-user', { user_id: userId });
  } catch (error: any) {
    throw new Error(`Erreur suppression compte: ${error?.message || error}`);
  }
}

