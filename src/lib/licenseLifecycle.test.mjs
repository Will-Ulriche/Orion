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
