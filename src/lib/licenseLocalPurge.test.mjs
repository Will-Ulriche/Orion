import test from 'node:test';
import assert from 'node:assert/strict';

import { decideLicenseLocalInvalidation } from './licenseLocalPurge.ts';

const ID = 'lic-current';
const SCHOOL = 'school-1';

test('PURGE-01 : licence courante mise en cache -> cache, date et jeton invalidés', () => {
  assert.deepEqual(
    decideLicenseLocalInvalidation(
      { id: ID, school_id: SCHOOL, is_current: true },
      ID,
      SCHOOL,
      true
    ),
    { clearCache: true, clearLastOk: true, clearToken: true }
  );
});

test('PURGE-02 : licence non courante mise en cache -> cache invalidé sans retirer un jeton étranger', () => {
  assert.deepEqual(
    decideLicenseLocalInvalidation(
      { id: ID, school_id: SCHOOL, is_current: false },
      ID,
      SCHOOL,
      false
    ),
    { clearCache: true, clearLastOk: true, clearToken: false }
  );
});

test('PURGE-03 : cache d une autre école -> aucune invalidation locale', () => {
  assert.deepEqual(
    decideLicenseLocalInvalidation(
      { id: 'lic-other', school_id: 'school-2', is_current: true },
      ID,
      SCHOOL,
      true
    ),
    { clearCache: false, clearLastOk: false, clearToken: false }
  );
});

test('PURGE-04 : sans cache mais licence courante côté serveur -> jeton retiré', () => {
  assert.deepEqual(
    decideLicenseLocalInvalidation(null, ID, SCHOOL, true),
    { clearCache: false, clearLastOk: false, clearToken: true }
  );
});

test('PURGE-05 : sans cache et licence non courante -> aucun jeton retiré', () => {
  assert.deepEqual(
    decideLicenseLocalInvalidation(null, ID, SCHOOL, false),
    { clearCache: false, clearLastOk: false, clearToken: false }
  );
});
