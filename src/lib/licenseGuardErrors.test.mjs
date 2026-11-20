import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  MAX_OFFLINE_TOKEN_SECONDS,
  canUseOfflineGrace,
  classifyLicenseGuardError,
  validateOfflineLicenseClaims,
} from './licenseGuardErrors.ts';

const read = (relative) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
const guardSource = read('src/components/LicenseGuard.tsx');
const rustSource = read('src-tauri/src/commands.rs');

const NOW = new Date('2026-11-17T12:00:00.000Z');
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

function claims(overrides = {}) {
  return {
    sub: 'lic-123',
    school_id: 'school-abc',
    license_key: 'ORION-ABCD-EFGH-IJKL',
    status: 'ACTIVE',
    starts_at: '2026-01-01T00:00:00Z',
    expires_at: '2026-12-01T00:00:00Z',
    is_current: true,
    iat: NOW_SEC,
    exp: NOW_SEC + MAX_OFFLINE_TOKEN_SECONDS,
    ...overrides,
  };
}

test('LIC-03 : indisponibilité réseau réelle autorise la grâce RS256', () => {
  const result = classifyLicenseGuardError(
    { name: 'TypeError', message: 'Failed to fetch' },
    'database'
  );
  assert.equal(result.category, 'network');
  assert.equal(result.offlineAllowed, true);
  assert.equal(canUseOfflineGrace(result.category), true);
});

test('LIC-03 : JWT expiré est classé avant le 401', () => {
  const result = classifyLicenseGuardError(
    { status: 401, code: 'JWT_EXPIRED', message: 'JWT expired' },
    'database'
  );
  assert.equal(result.category, 'jwt_expired');
  assert.equal(result.offlineAllowed, false);
  assert.equal(canUseOfflineGrace(result.category), false);
});

test('LIC-03 : erreur 401 refuse tout repli hors ligne', () => {
  const result = classifyLicenseGuardError(
    { status: 401, message: 'Unauthorized' },
    'database'
  );
  assert.equal(result.category, 'unauthorized');
  assert.equal(result.offlineAllowed, false);
});

test('LIC-03 : erreur RLS 403 refuse tout repli hors ligne', () => {
  const byStatus = classifyLicenseGuardError(
    { status: 403, message: 'row-level security policy violation' },
    'database'
  );
  const bySqlState = classifyLicenseGuardError(
    { code: '42501', message: 'permission denied for table licenses' },
    'database'
  );

  assert.equal(byStatus.category, 'forbidden');
  assert.equal(bySqlState.category, 'forbidden');
  assert.equal(byStatus.offlineAllowed, false);
  assert.equal(bySqlState.offlineAllowed, false);
});

test('LIC-03 : erreur serveur 500 refuse tout repli hors ligne', () => {
  const result = classifyLicenseGuardError(
    { status: 500, message: 'Internal Server Error' },
    'database'
  );
  assert.equal(result.category, 'server_error');
  assert.equal(result.offlineAllowed, false);
});

test('LIC-03 : Edge Function indisponible refuse tout repli hors ligne', () => {
  const byName = classifyLicenseGuardError(
    { name: 'FunctionsFetchError', message: 'Failed to fetch' },
    'edge'
  );
  const byStatus = classifyLicenseGuardError(
    { status: 503, message: 'Service Unavailable' },
    'edge'
  );

  assert.equal(byName.category, 'edge_unavailable');
  assert.equal(byStatus.category, 'edge_unavailable');
  assert.equal(byName.offlineAllowed, false);
  assert.equal(byStatus.offlineAllowed, false);
});

test('LIC-03 : erreur de configuration refuse tout repli hors ligne', () => {
  const result = classifyLicenseGuardError(
    {
      status: 500,
      message: 'Server misconfigured: ORION_LICENSE_PRIVATE_KEY_PEM absent',
    },
    'edge'
  );
  assert.equal(result.category, 'configuration');
  assert.equal(result.offlineAllowed, false);
});

test('LIC-03 : erreur non classifiée refuse tout repli hors ligne', () => {
  const result = classifyLicenseGuardError(
    { message: 'Erreur inattendue' },
    'database'
  );
  assert.equal(result.category, 'unknown');
  assert.equal(result.offlineAllowed, false);
});

test('LIC-03 : jeton hors ligne valide respecte sept jours, expiration et établissement', () => {
  assert.deepEqual(validateOfflineLicenseClaims(claims(), 'school-abc', NOW), { valid: true });
});

test('LIC-03 : durée supérieure à sept jours refusée', () => {
  const result = validateOfflineLicenseClaims(
    claims({ exp: NOW_SEC + MAX_OFFLINE_TOKEN_SECONDS + 1 }),
    'school-abc',
    NOW
  );
  assert.equal(result.valid, false);
  assert.match(result.reason, /sept jours/);
});

test('LIC-03 : jeton expiré refusé', () => {
  const result = validateOfflineLicenseClaims(
    claims({ iat: NOW_SEC - MAX_OFFLINE_TOKEN_SECONDS - 10, exp: NOW_SEC - 5 }),
    'school-abc',
    NOW
  );
  assert.equal(result.valid, false);
  assert.match(result.reason, /expiré/);
});

test('LIC-03 : établissement du jeton contrôlé strictement', () => {
  const result = validateOfflineLicenseClaims(claims(), 'school-autre', NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason, /établissement/);
});

test('LIC-03 : licence historique ou non active refusée', () => {
  assert.equal(
    validateOfflineLicenseClaims(claims({ is_current: false }), 'school-abc', NOW).valid,
    false
  );
  assert.equal(
    validateOfflineLicenseClaims(claims({ status: 'REVOKED' }), 'school-abc', NOW).valid,
    false
  );
});

test('LIC-03 : date d expiration de la licence contrôlée', () => {
  const expired = validateOfflineLicenseClaims(
    claims({ expires_at: '2026-11-01T00:00:00Z' }),
    'school-abc',
    NOW
  );
  const invalid = validateOfflineLicenseClaims(
    claims({ expires_at: 'pas-une-date' }),
    'school-abc',
    NOW
  );
  const future = validateOfflineLicenseClaims(
    claims({ starts_at: '2026-12-01T00:00:00Z' }),
    'school-abc',
    NOW
  );

  assert.equal(expired.valid, false);
  assert.match(expired.reason, /expirée/);
  assert.equal(invalid.valid, false);
  assert.equal(future.valid, false);
});

test('LIC-03 : LicenseGuard n autorise la grâce que pour la catégorie réseau', () => {
  assert.match(guardSource, /classifyLicenseGuardError\(err, 'database'\)/);
  assert.match(guardSource, /classifyLicenseGuardError\(tokenErr, 'edge'\)/);
  assert.match(guardSource, /canUseOfflineGrace\(classified\.category\)/);
  assert.match(guardSource, /validateOfflineLicenseClaims\(verifyRes\.claims, targetId\)/);
  assert.match(guardSource, /validateOfflineLicenseClaims\(claims, targetId\)/);
  assert.equal(guardSource.includes('catch (_networkErr)'), false);

  assert.match(rustSource, /MAX_TOKEN_DURATION_SECS: i64 = 7 \* 24 \* 60 \* 60/);
  assert.match(rustSource, /claims\.exp - claims\.iat > MAX_TOKEN_DURATION_SECS/);
});
