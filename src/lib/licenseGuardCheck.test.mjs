import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECHECK_INTERVAL_MS,
  runLicenseGuardCheck,
  startLicenseGuardLifecycle,
} from './licenseGuardCheck.ts';
import { LS_LIC_TOKEN } from './licenseActivation.ts';
import {
  MAX_OFFLINE_TOKEN_SECONDS,
  classifyLicenseGuardError,
} from './licenseGuardErrors.ts';

const NOW = new Date('2026-11-25T12:00:00.000Z');
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

function makeMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function sampleCloudLicense(overrides = {}) {
  return {
    id: 'lic-1',
    school_id: 'school-1',
    license_key: 'ORION-1111-2222-3333',
    status: 'ACTIVE',
    starts_at: '2026-01-01T00:00:00Z',
    expires_at: '2027-01-01T00:00:00Z',
    max_devices: 5,
    is_current: true,
    ...overrides,
  };
}

function sampleClaims(overrides = {}) {
  return {
    sub: 'lic-1',
    school_id: 'school-1',
    license_key: 'ORION-1111-2222-3333',
    status: 'ACTIVE',
    starts_at: '2026-01-01T00:00:00Z',
    expires_at: '2027-01-01T00:00:00Z',
    is_current: true,
    max_devices: 5,
    device_id: 'dev-uuid-1',
    device_identifier: 'hw-uid-123',
    jti: 'jti-1',
    iat: NOW_SEC,
    exp: NOW_SEC + MAX_OFFLINE_TOKEN_SECONDS,
    ...overrides,
  };
}

function makeSupabaseMock({ licenses = [sampleCloudLicense()], edgeResult, edgeError } = {}) {
  const edgeCalls = [];
  const client = {
    from(table) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { school_id: 'school-1' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'licenses') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: licenses, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    functions: {
      invoke: async (name, opts) => {
        edgeCalls.push({ name, body: opts?.body });
        if (edgeError) return { data: null, error: edgeError };
        return { data: edgeResult ?? { token: 'signed.jwt.token' }, error: null };
      },
    },
  };
  return { client, edgeCalls };
}

test('LIC-02 : vérification automatique avec appareil correctement identifié transmet les 5 paramètres', async () => {
  const storage = makeMemoryStorage();
  const { client, edgeCalls } = makeSupabaseMock();
  const rustCalls = [];

  const invokeFn = async (cmd, args) => {
    rustCalls.push({ cmd, args });
    if (cmd === 'get_device_info') {
      return { identifier: 'hw-uid-123', name: 'PC-DIRECTION', platform: 'Windows' };
    }
    if (cmd === 'verify_license_token') {
      return { valid: true, claims: sampleClaims() };
    }
    if (cmd === 'save_license') {
      return null;
    }
    throw new Error(`Unexpected invoke ${cmd}`);
  };

  const outcome = await runLicenseGuardCheck(
    { userId: 'u-dir', targetSchoolId: 'school-1' },
    { invokeFn, supabaseClient: client, storage, now: NOW }
  );

  assert.equal(outcome.status, 'valid');
  assert.equal(outcome.errorMessage, null);
  assert.equal(edgeCalls.length, 1);
  assert.equal(edgeCalls[0].name, 'issue-license-token');
  assert.deepEqual(edgeCalls[0].body, {
    license_id: 'lic-1',
    school_id: 'school-1',
    device_identifier: 'hw-uid-123',
    device_name: 'PC-DIRECTION',
    platform: 'Windows',
  });
  assert.equal(rustCalls.some((c) => c.cmd === 'verify_license_token'), true);
  const saveCall = rustCalls.find((c) => c.cmd === 'save_license');
  assert.ok(saveCall, 'save_license doit être appelé');
  assert.equal(saveCall.args.token, 'signed.jwt.token');
  assert.equal(storage.getItem(LS_LIC_TOKEN), 'signed.jwt.token');
});

test('LIC-02 : refus propre avec erreur explicite si device_identifier est absent sans supprimer la licence valide', async () => {
  const storage = makeMemoryStorage({ [LS_LIC_TOKEN]: 'existing.valid.token' });
  const { client, edgeCalls } = makeSupabaseMock();

  const invokeFn = async (cmd) => {
    if (cmd === 'get_device_info') {
      return { identifier: '   ', name: 'PC-DIRECTION', platform: 'Windows' };
    }
    throw new Error(`Unexpected invoke ${cmd}`);
  };

  const outcome = await runLicenseGuardCheck(
    { userId: 'u-dir', targetSchoolId: 'school-1' },
    { invokeFn, supabaseClient: client, storage, now: NOW }
  );

  assert.equal(outcome.status, 'verification_error');
  assert.match(outcome.errorMessage, /Identifiant machine/i);
  assert.equal(edgeCalls.length, 0, "issue-license-token ne doit pas être appelé sans device_identifier");
  assert.equal(storage.getItem(LS_LIC_TOKEN), 'existing.valid.token');
});

test('LIC-02 : refus si l appareil ne correspond pas au jeton reçu', async () => {
  const storage = makeMemoryStorage({ [LS_LIC_TOKEN]: 'existing.valid.token' });
  const { client } = makeSupabaseMock({ edgeResult: { token: 'wrong.device.jwt' } });

  const invokeFn = async (cmd) => {
    if (cmd === 'get_device_info') {
      return { identifier: 'hw-uid-123', name: 'PC-DIRECTION', platform: 'Windows' };
    }
    if (cmd === 'verify_license_token') {
      return {
        valid: true,
        claims: sampleClaims({ device_identifier: 'autre-machine-999' }),
      };
    }
    throw new Error(`Unexpected invoke ${cmd}`);
  };

  const outcome = await runLicenseGuardCheck(
    { userId: 'u-dir', targetSchoolId: 'school-1' },
    { invokeFn, supabaseClient: client, storage, now: NOW }
  );

  assert.equal(outcome.status, 'verification_error');
  assert.match(outcome.errorMessage, /ne correspond pas à cet appareil/i);
  assert.equal(storage.getItem(LS_LIC_TOKEN), 'existing.valid.token');
});

test('LIC-02 : erreur HTTP 400, 401, 403 ou de configuration jamais traitée comme réseau et ne supprime pas la licence', async () => {
  for (const err of [
    { status: 400, message: 'Bad Request: device_identifier required' },
    { status: 401, message: 'Unauthorized' },
    { status: 403, message: 'Forbidden' },
    { status: 500, message: 'Server misconfigured: ORION_LICENSE_PRIVATE_KEY_PEM absent' },
  ]) {
    const classified = classifyLicenseGuardError(err, 'edge');
    assert.equal(classified.offlineAllowed, false);

    const storage = makeMemoryStorage({ [LS_LIC_TOKEN]: 'existing.valid.token' });
    const { client } = makeSupabaseMock({ edgeError: err });
    const invokeFn = async (cmd) => {
      if (cmd === 'get_device_info') {
        return { identifier: 'hw-uid-123', name: 'PC', platform: 'Windows' };
      }
      throw new Error(`Unexpected invoke ${cmd}`);
    };

    const outcome = await runLicenseGuardCheck(
      { userId: 'u-dir', targetSchoolId: 'school-1' },
      { invokeFn, supabaseClient: client, storage, now: NOW }
    );

    assert.equal(outcome.status, 'verification_error');
    assert.equal(storage.getItem(LS_LIC_TOKEN), 'existing.valid.token');
  }
});

test('LIC-02 : vérification immédiate après redémarrage, sur renouvellement, et toutes les cinq minutes', () => {
  assert.equal(RECHECK_INTERVAL_MS, 5 * 60 * 1000);

  let checks = 0;
  let scheduledInterval = null;
  let scheduledCallback = null;
  let clearedId = null;
  const listeners = new Map();

  const cleanup = startLicenseGuardLifecycle({
    checkLicense: () => {
      checks += 1;
    },
    setIntervalFn: (cb, ms) => {
      scheduledCallback = cb;
      scheduledInterval = ms;
      return 42;
    },
    clearIntervalFn: (id) => {
      clearedId = id;
    },
    addEventListenerFn: (evt, handler) => listeners.set(evt, handler),
    removeEventListenerFn: (evt) => listeners.delete(evt),
  });

  // 1. Vérification après redémarrage (montage initial)
  assert.equal(checks, 1);
  assert.equal(scheduledInterval, 5 * 60 * 1000);

  // 2. Vérification après renouvellement
  listeners.get('orion:license-updated')();
  assert.equal(checks, 2);

  // 3. Vérification toutes les cinq minutes
  scheduledCallback();
  assert.equal(checks, 3);

  cleanup();
  assert.equal(clearedId, 42);
  assert.equal(listeners.has('orion:license-updated'), false);
});
