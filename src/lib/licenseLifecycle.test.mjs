import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  classifyLicense,
  isLicenseCurrentlyValid,
  selectCurrentLicense,
  findCurrentRecord,
  buildRenewalPlan,
  parseUtcDate,
} from './licenseLifecycle.ts';

const SCHOOL = 'school-1-uuid';
const OTHER = 'school-2-uuid';
const NOW = new Date('2026-11-17T12:00:00Z');

function lic(overrides = {}) {
  return {
    id: 'lic-current',
    school_id: SCHOOL,
    license_key: 'ORION-ABCD-EFGH-1234',
    status: 'ACTIVE',
    starts_at: '2026-01-01T00:00:00Z',
    expires_at: '2027-01-01T00:00:00Z',
    is_current: true,
    ...overrides,
  };
}

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('LIC-02 : licence courante ACTIVE dans la fenêtre UTC est valide', () => {
  assert.equal(classifyLicense(lic(), SCHOOL, NOW), 'valid');
  assert.equal(isLicenseCurrentlyValid(lic(), SCHOOL, NOW), true);
});

test('LIC-02 : ancienne licence ACTIVE non courante ne réautorise jamais l’accès', () => {
  const old = lic({ id: 'lic-old', is_current: false, status: 'ACTIVE' });
  assert.equal(classifyLicense(old, SCHOOL, NOW), 'superseded');
  assert.equal(isLicenseCurrentlyValid(old, SCHOOL, NOW), false);
  assert.equal(selectCurrentLicense([old], SCHOOL, NOW), null);
});

test('LIC-02 : établissement contrôlé strictement', () => {
  assert.equal(classifyLicense(lic(), OTHER, NOW), 'wrong_school');
  assert.equal(classifyLicense(lic({ school_id: 'unassigned' }), SCHOOL, NOW), 'wrong_school');
});

test('LIC-02 : licence future (starts_at UTC) refusée', () => {
  const future = lic({ starts_at: '2026-12-01T00:00:00Z' });
  assert.equal(classifyLicense(future, SCHOOL, NOW), 'future');
});

test('LIC-02 : licence expirée (expires_at UTC) refusée', () => {
  const expired = lic({ expires_at: '2026-11-01T00:00:00Z' });
  assert.equal(classifyLicense(expired, SCHOOL, NOW), 'expired');
});

test('LIC-02 : licences révoquée, suspendue et remplacée refusées', () => {
  assert.equal(classifyLicense(lic({ status: 'REVOKED' }), SCHOOL, NOW), 'revoked');
  assert.equal(classifyLicense(lic({ status: 'SUSPENDED' }), SCHOOL, NOW), 'suspended');
  assert.equal(classifyLicense(lic({ status: 'SUPERSEDED' }), SCHOOL, NOW), 'superseded');
  assert.equal(classifyLicense(lic({ status: 'EXPIRED' }), SCHOOL, NOW), 'expired');
});

test('LIC-02 : dates UTC mal formées refusées (fail-closed)', () => {
  assert.equal(parseUtcDate('pas-une-date'), null);
  assert.equal(classifyLicense(lic({ starts_at: 'pas-une-date' }), SCHOOL, NOW), 'invalid_dates');
  assert.equal(classifyLicense(lic({ expires_at: 'pas-une-date' }), SCHOOL, NOW), 'invalid_dates');
});

test('LIC-02 : aucune licence courante valide malgré un historique ACTIVE', () => {
  const oldActive = lic({ id: 'old', is_current: false, status: 'ACTIVE' });
  const newerRevoked = lic({ id: 'newer', status: 'REVOKED', created_at: '2026-11-16' });
  assert.equal(selectCurrentLicense([oldActive, newerRevoked], SCHOOL, NOW), null);
  assert.equal(findCurrentRecord([oldActive, newerRevoked], SCHOOL)?.id, 'newer');
  assert.equal(classifyLicense(findCurrentRecord([oldActive, newerRevoked], SCHOOL), SCHOOL, NOW), 'revoked');
});

test('LIC-02 : renouvellement planifie archivage + promotion sans suppression', () => {
  const old = lic({ id: 'old' });
  const next = lic({ id: 'next', license_key: 'ORION-ZZZZ-YYYY-XXXX' });
  const plan = buildRenewalPlan(old, next);
  assert.deepEqual(plan.archiveIds, ['old']);
  assert.equal(plan.next.is_current, true);
  assert.equal(plan.next.id, 'next');
  assert.equal(plan.next.license_key, next.license_key);
});

test('LIC-02 SQL : unicité DB, garde et archivage transactionnel', () => {
  const migration = read('../../supabase/migrations/20261117000000_license_lifecycle.sql');
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS licenses_one_current_per_school\s+ON public\.licenses \(school_id\) WHERE is_current = true/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF is_current ON public\.licenses/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.renew_license/);
  assert.match(migration, /WHERE school_id = p_school_id AND is_current = true/);
  assert.match(migration, /status = CASE WHEN status = 'ACTIVE' THEN 'SUPERSEDED' ELSE status END/);
  const renewal = migration.slice(migration.indexOf('FUNCTION public.renew_license'));
  assert.ok(renewal.indexOf('UPDATE public.licenses') < renewal.indexOf('INSERT INTO public.licenses'));
  assert.doesNotMatch(migration, /DELETE FROM public\.licenses/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.archive_license/);
});

test('LIC-02 SQL : activate_license exige la licence courante', () => {
  const migration = read('../../supabase/migrations/20261117000000_license_lifecycle.sql');
  assert.match(migration, /IF NOT v_lic\.is_current THEN/);
  assert.match(migration, /ne peut plus être activée/);
});

test('LIC-02 Edge Function : is_current exigé avant émission du jeton', () => {
  const edge = read('../../supabase/functions/issue-license-token/index.ts');
  assert.match(edge, /starts_at, expires_at, is_current/);
  assert.match(edge, /if \(lic\.is_current !== true\)/);
  assert.match(edge, /Licence remplacée ou archivée/);
  assert.match(edge, /is_current: true,/);
});

test('LIC-02 Rust : jeton, persistance et base locale appliquent is_current', () => {
  const rust = read('../../src-tauri/src/commands.rs');
  assert.match(rust, /pub is_current: bool,/);
  assert.match(rust, /if !claims\.is_current \{/);
  assert.match(rust, /pub fn validate_license_record\(/);
  assert.match(rust, /let tx = conn\.transaction\(\)/);
  assert.match(rust, /WHERE school_id = \?1 AND is_current = 1/);
  assert.doesNotMatch(rust, /INSERT OR REPLACE INTO licenses/);
  assert.doesNotMatch(rust, /DELETE FROM licenses/);

  const localMigration = read('../../src-tauri/migrations/27_license_lifecycle.sql');
  assert.match(localMigration, /ALTER TABLE licenses ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0/);
  assert.match(localMigration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_one_current_per_school/);
});

test('LIC-02 Frontend : LicenseGuard ne sélectionne plus dans tout l’historique', () => {
  const guard = read('../../src/components/LicenseGuard.tsx');
  assert.match(guard, /findCurrentRecord\(cloudLics, targetId\)/);
  assert.match(guard, /classifyLicense\(currentRecord, targetId, now\)/);
  assert.doesNotMatch(guard, /cloudLics\.find\(/);
  assert.doesNotMatch(guard, /cloudLics\[0\]/);

  const persistence = guard.slice(guard.indexOf("await invoke('save_license'"));
  const tryBody = persistence.slice(0, persistence.indexOf('catch (error: any)'));
  assert.match(tryBody, /localStorage\.setItem\(LS_LIC_TOKEN, issuedToken\)/);
  assert.match(tryBody, /setCheckStatus\('valid'\)/);
  assert.match(
    persistence.slice(persistence.indexOf('catch'), persistence.indexOf('catch') + 20),
    /catch \(error: any\)/
  );
  assert.match(persistence, /Impossible d'enregistrer la licence localement/);
  assert.match(persistence, /setCheckStatus\('verification_error'\)/);
});

test('LIC-03 : quota appareils, liaison JWT et libération SUPER_ADMIN', () => {
  const migration = read('../../supabase/migrations/20261121000000_device_binding_hardening.sql');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS license_id %s REFERENCES public\.licenses\(id\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS deleted_at timestamptz/);
  assert.match(migration, /CHECK \(max_devices >= 1\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.register_or_reactivate_device/);
  assert.match(migration, /SELECT \* INTO v_lic[\s\S]*FOR UPDATE/);
  assert.match(migration, /DEVICE_LIMIT_REACHED/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.release_device/);
  assert.match(migration, /Action réservée au SUPER_ADMIN/);

  const edge = read('../../supabase/functions/issue-license-token/index.ts');
  assert.match(edge, /register_or_reactivate_device/);
  assert.match(edge, /device_identifier: binding\.device_identifier/);
  assert.match(edge, /max_devices: maxDevices/);
  assert.match(edge, /jti: crypto\.randomUUID\(\)/);

  const rust = read('../../src-tauri/src/commands.rs');
  assert.match(rust, /fn current_device_identifier\(\)/);
  assert.match(rust, /pub device_identifier: String,/);
  assert.match(rust, /fn ensure_local_device_quota\(/);
  assert.match(rust, /license_claims_match_record\(/);
  assert.match(rust, /pub fn save_license\(\s*token: String,/);

  const localMigration = read('../../src-tauri/migrations/28_device_license_binding.sql');
  assert.match(localMigration, /ALTER TABLE devices ADD COLUMN license_id TEXT/);
  assert.match(localMigration, /idx_devices_active_license_identifier/);
});

test('LIC-02 renouvellement : transfert transactionnel des appareils actifs', () => {
  const migration = read('../../supabase/migrations/20261117000000_license_lifecycle.sql');
  const renewal = migration.slice(migration.indexOf('FUNCTION public.renew_license'));

  assert.match(renewal, /SELECT \* INTO v_school FROM public\.schools WHERE id = p_school_id FOR UPDATE/);
  assert.match(renewal, /SELECT \* INTO v_old[\s\S]*FOR UPDATE/);
  assert.match(renewal, /SELECT count\(\*\) INTO v_device_count/);
  assert.match(renewal, /IF v_device_count > p_max_devices THEN/);
  assert.match(renewal, /DEVICE_LIMIT_REACHED/);
  assert.match(renewal, /UPDATE public\.devices d/);
  assert.match(renewal, /SET license_id = v_new\.id/);
  assert.match(renewal, /d\.school_id = p_school_id/);
  assert.match(renewal, /l\.school_id = p_school_id/);
  assert.match(renewal, /l\.is_current = false/);

  const transfer = renewal.slice(renewal.indexOf('UPDATE public.devices'));
  assert.doesNotMatch(transfer, /device_identifier\s*=/);

  const archive = migration.slice(migration.indexOf('FUNCTION public.archive_license'));
  assert.match(archive, /FOR UPDATE/);
  assert.match(archive, /renew_license\(\)/);
});

test('LIC-03 : réaffectation depuis une licence archivée du même établissement uniquement', () => {
  const binding = read('../../supabase/migrations/20261121000000_device_binding_hardening.sql');
  assert.match(binding, /Appareil déjà associé à une autre licence/);
  assert.match(binding, /v_dev\.school_id = v_lic\.school_id/);
  assert.match(binding, /l\.school_id = v_lic\.school_id/);
  assert.match(binding, /l\.is_current = false/);

  const edge = read('../../supabase/functions/issue-license-token/index.ts');
  assert.match(edge, /\.eq\("school_id", school_id\)/);
  assert.match(edge, /\.eq\("is_current", true\)/);
});

test('SUPER_ADMIN : archivage logique et trois vues distinctes des licences', () => {
  const api = read('../../src/lib/superAdminApi.ts');
  assert.match(api, /rpc\('archive_license', \{ p_license_id: id \}\)/);
  assert.doesNotMatch(api, /from\('licenses'\)\s*\.delete\(\)/);
  assert.match(api, /export async function archiveLicense/);

  const migration = read('../../supabase/migrations/20261117000000_license_lifecycle.sql');
  assert.match(migration, /COMMENT ON FUNCTION public\.archive_license\(uuid\) IS/);
  assert.match(migration, /Aucune suppression SQL/);

  const views = read('../../src/lib/licenseViews.ts');
  assert.match(views, /Historique archiv\u00e9/);
  assert.match(views, /Suspendues \/ r\u00e9voqu\u00e9es/);

  const page = read('../../src/pages/superadmin/LicencesSuperAdmin.tsx');
  assert.match(page, /LICENSE_VIEWS/);
  assert.match(page, /groupLicensesByView/);
  assert.match(page, /Archiver la licence/);
  assert.doesNotMatch(page, /Supprimer la licence/);
  assert.doesNotMatch(page, /deleteTarget/);
});

test('SUPER_ADMIN : modification sans ligne modifiée est refusée', () => {
  const api = read('../../src/lib/superAdminApi.ts');
  const setStatus = api.slice(
    api.indexOf('export async function setLicenseStatus'),
    api.indexOf('export async function updateLicense')
  );
  const update = api.slice(
    api.indexOf('export async function updateLicense'),
    api.indexOf('export async function archiveLicense')
  );

  for (const source of [setStatus, update]) {
    assert.ok(source.length > 0);
    assert.match(source, /\.select\('id'\)/);
    assert.match(source, /\.maybeSingle\(\)/);
    assert.match(source, /if \(error\)[\s\S]*throw new Error\(error\.message\)/);
    assert.match(source, /if \(!data\)/);
    assert.match(source, /Modification refus\u00e9e : aucune licence modifi\u00e9e\. V\u00e9rifiez les permissions SUPER_ADMIN\./);
  }
});

test('SUPER_ADMIN : purge locale attendue et erreur affichée', () => {
  const page = read('../../src/pages/superadmin/LicencesSuperAdmin.tsx');
  assert.match(page, /await invoke\('purge_local_licenses', \{ schoolId \}\)/);
  assert.doesNotMatch(page, /\.catch\(\(\) => \{\}\)/);
  assert.match(page, /decideLicenseLocalInvalidation/);
  assert.match(page, /removeItem\(LS_LIC_TOKEN\)/);
  assert.match(page, /Purge locale impossible/);
  assert.match(page, /await purgeWithFeedback/);
  assert.match(page, /dispatchEvent\(new Event\('orion:license-updated'\)\)/);
});

test('SUPER_ADMIN : bootstrap compare user_id text avec users.id casté', () => {
  const bootstrap = read('../../supabase/bootstrap/create_super_admin.sql');
  assert.match(bootstrap, /JOIN public\.user_roles ur ON ur\.user_id = u\.id::text/);
  assert.doesNotMatch(bootstrap, /JOIN public\.user_roles ur ON ur\.user_id = u\.id(?![:\w])/);

  const migration = read('../../supabase/migrations/20261122000000_fix_text_uuid_operator_error.sql');
  assert.match(migration, /u\.id::text = ur\.user_id/);
  assert.match(migration, /ur\.user_id = auth\.uid\(\)::text/);
});

test('RLS licenses : lecture administrative et périmètre établissement', () => {
  const fix = read('../../supabase/migrations/20261125000000_fix_licenses_select_rls.sql');
  assert.match(fix, /ALTER TABLE public\.licenses ENABLE ROW LEVEL SECURITY/);
  assert.match(fix, /REVOKE ALL ON TABLE public\.licenses FROM anon/);
  assert.match(fix, /GRANT SELECT ON TABLE public\.licenses TO authenticated/);
  assert.match(fix, /DROP POLICY %I ON public\.licenses/);
  assert.match(fix, /CREATE POLICY sec08_licenses_select[\s\S]*public\.is_super_admin\(\)[\s\S]*school_id::text IN \(SELECT public\.user_school_ids\(\)\)/);
  assert.match(fix, /CREATE POLICY sec08_licenses_insert[\s\S]*WITH CHECK \(public\.is_super_admin\(\)\)/);
  assert.match(fix, /CREATE POLICY sec08_licenses_update[\s\S]*public\.is_super_admin\(\)/);
  assert.match(fix, /CREATE POLICY sec08_licenses_delete[\s\S]*public\.is_super_admin\(\)/);

  const sqlTest = read('../../supabase/tests/license_rls_select_test.sql');
  for (const marker of [
    'SUPER_ADMIN',
    'DIRECTION A',
    'DIRECTION B',
    'SECRETAIRE',
    'PROFESSEUR',
    'anonyme',
    'ORION-RLS-A',
    'ORION-RLS-B',
  ]) {
    assert.ok(sqlTest.includes(marker), `Scénario manquant : ${marker}`);
  }
  assert.match(sqlTest, /ROLLBACK;/);
});
