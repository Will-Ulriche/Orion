import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeLicenseKey,
  validateLicenseConstraints,
  isRpcMissingError,
  activateSchoolLicense,
} from './licenseActivation.ts';

describe('LIC-01 : Validation des contraintes métier de licence (pures)', () => {
  const schoolA = '11111111-1111-4111-8111-111111111111';
  const schoolB = '22222222-2222-4222-8222-222222222222';
  const now = new Date('2026-11-02T12:00:00Z');

  it('Normalise correctement le format des clés ORION', () => {
    assert.equal(normalizeLicenseKey('orion-abcd-efgh-1234'), 'ORION-ABCD-EFGH-1234');
    assert.equal(normalizeLicenseKey('  abcdefgh1234  '), 'ORION-ABCD-EFGH-1234');
    assert.equal(normalizeLicenseKey('ORION_ABCD_EFGH_1234'), 'ORION-ABCD-EFGH-1234');
  });

  it('Une direction peut valider une licence active déjà attribuée à son établissement', () => {
    const lic = {
      id: 'lic-1',
      school_id: schoolA,
      license_key: 'ORION-ABCD-EFGH-1234',
      status: 'ACTIVE',
      starts_at: '2026-01-01T00:00:00Z',
      expires_at: '2027-01-01T00:00:00Z',
    };
    const res = validateLicenseConstraints(lic, schoolA, now);
    assert.equal(res.valid, true);
    assert.equal(res.error, undefined);
  });

  it('Une direction ne peut PAS activer une licence d’un autre établissement', () => {
    const lic = {
      id: 'lic-other',
      school_id: schoolB,
      license_key: 'ORION-OTHER-SCHL-0001',
      status: 'ACTIVE',
      starts_at: '2026-01-01T00:00:00Z',
      expires_at: '2027-01-01T00:00:00Z',
    };
    const res = validateLicenseConstraints(lic, schoolA, now);
    assert.equal(res.valid, false);
    assert.match(res.error, /pas attribuée à votre établissement/i);
  });

  it('Une clé non attribuée (unassigned) ne peut pas être auto-activée par la direction', () => {
    const lic = {
      id: 'lic-unassigned',
      school_id: 'unassigned',
      license_key: 'ORION-FREE-KEY0-0001',
      status: 'ACTIVE',
      starts_at: '2026-01-01T00:00:00Z',
      expires_at: '2027-01-01T00:00:00Z',
    };
    const res = validateLicenseConstraints(lic, schoolA, now);
    assert.equal(res.valid, false);
    assert.match(res.error, /pas attribuée à votre établissement/i);
  });

  it('Une licence suspendue est refusée', () => {
    const lic = {
      id: 'lic-susp',
      school_id: schoolA,
      license_key: 'ORION-ABCD-EFGH-1234',
      status: 'SUSPENDED',
      starts_at: '2026-01-01T00:00:00Z',
      expires_at: '2027-01-01T00:00:00Z',
    };
    const res = validateLicenseConstraints(lic, schoolA, now);
    assert.equal(res.valid, false);
    assert.match(res.error, /suspendue/i);
  });

  it('Une licence révoquée est refusée', () => {
    const lic = {
      id: 'lic-rev',
      school_id: schoolA,
      license_key: 'ORION-ABCD-EFGH-1234',
      status: 'REVOKED',
      starts_at: '2026-01-01T00:00:00Z',
      expires_at: '2027-01-01T00:00:00Z',
    };
    const res = validateLicenseConstraints(lic, schoolA, now);
    assert.equal(res.valid, false);
    assert.match(res.error, /révoquée/i);
  });

  it('Une licence expirée est refusée', () => {
    const lic = {
      id: 'lic-exp',
      school_id: schoolA,
      license_key: 'ORION-ABCD-EFGH-1234',
      status: 'ACTIVE',
      starts_at: '2025-01-01T00:00:00Z',
      expires_at: '2026-10-01T00:00:00Z',
    };
    const res = validateLicenseConstraints(lic, schoolA, now);
    assert.equal(res.valid, false);
    assert.match(res.error, /expirée/i);
  });

  it('Une licence avec starts_at dans le futur est refusée', () => {
    const lic = {
      id: 'lic-future',
      school_id: schoolA,
      license_key: 'ORION-ABCD-EFGH-1234',
      status: 'ACTIVE',
      starts_at: '2026-12-01T00:00:00Z',
      expires_at: '2027-12-01T00:00:00Z',
    };
    const res = validateLicenseConstraints(lic, schoolA, now);
    assert.equal(res.valid, false);
    assert.match(res.error, /pas encore active/i);
  });
});

describe('LIC-01 : Détection stricte de l’absence de RPC vs Erreurs d’autorisation / réseau', () => {
  it('PGRST202 : RPC absente confirmée -> fallback RLS autorisé', () => {
    const err = { code: 'PGRST202', message: 'Could not find the function public.activate_license in the schema cache' };
    assert.equal(isRpcMissingError(err), true);
  });

  it('Code SQL 42883 : undefined_function confirmée -> fallback RLS autorisé', () => {
    const err = { code: '42883', message: 'function public.activate_license(p_license_key, p_school_id) does not exist' };
    assert.equal(isRpcMissingError(err), true);
  });

  it('Message PostgREST alternatif : RPC absente -> fallback RLS autorisé', () => {
    const err = { message: 'could not find the function public.activate_license without parameters in schema cache' };
    assert.equal(isRpcMissingError(err), true);
  });

  it('Message Postgres standard : function does not exist -> fallback RLS autorisé', () => {
    const err = { message: 'function activate_license(text, text) does not exist' };
    assert.equal(isRpcMissingError(err), true);
  });

  it('401 Unauthorized : aucun fallback (fail-closed)', () => {
    const err = { code: '401', message: 'JWT expired or invalid' };
    assert.equal(isRpcMissingError(err), false);
  });

  it('403 Forbidden / 42501 permission_denied : aucun fallback (fail-closed)', () => {
    const err = { code: '42501', message: 'permission denied for function activate_license' };
    assert.equal(isRpcMissingError(err), false);
  });

  it('500 Internal Server Error : aucun fallback (fail-closed)', () => {
    const err = { code: '500', message: 'internal server error in database trigger' };
    assert.equal(isRpcMissingError(err), false);
  });

  it('Erreur réseau (Failed to fetch) : aucun fallback (fail-closed)', () => {
    const err = { message: 'TypeError: Failed to fetch' };
    assert.equal(isRpcMissingError(err), false);
  });

  it('Erreur inconnue : aucun fallback (fail-closed)', () => {
    const err = { code: 'UNKNOWN_ERROR', message: 'unexpected database failure' };
    assert.equal(isRpcMissingError(err), false);
  });
});

describe('LIC-01 : Parcours d’activation et persistance atomique SQLite', () => {
  const schoolA = '11111111-1111-4111-8111-111111111111';
  const validLic = {
    id: 'lic-valid-001',
    school_id: schoolA,
    license_key: 'ORION-ABCD-EFGH-1234',
    status: 'ACTIVE',
    starts_at: '2026-01-01T00:00:00Z',
    expires_at: '2027-01-01T00:00:00Z',
    max_devices: 5,
  };

  it('SQLite réussit : activation complète et token persisté dans localStorage', async () => {
    const storageMap = new Map();
    const mockStorage = {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, v),
      removeItem: (k) => storageMap.delete(k),
    };

    let sqliteSaved = false;
    let rustVerified = false;

    const mockInvoke = async (cmd, args) => {
      if (cmd === 'verify_license_token') {
        rustVerified = true;
        return { valid: true, claims: { sub: validLic.id, school_id: schoolA } };
      }
      if (cmd === 'save_license') {
        sqliteSaved = true;
        return null;
      }
      throw new Error(`Commande inconnue: ${cmd}`);
    };

    const mockSupabase = {
      rpc: async () => ({ error: { code: 'PGRST202', message: 'function not found' } }),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: validLic, error: null }),
          }),
        }),
      }),
      functions: {
        invoke: async () => ({
          data: { token: 'mock.valid.rs256.jwt.token' },
          error: null,
        }),
      },
    };

    const res = await activateSchoolLicense(
      { licenseKey: 'ORION-ABCD-EFGH-1234', schoolId: schoolA },
      {
        invokeFn: mockInvoke,
        supabaseClient: mockSupabase,
        storage: mockStorage,
      }
    );

    assert.equal(res.success, true);
    assert.equal(rustVerified, true, 'Le jeton doit être vérifié par Rust');
    assert.equal(sqliteSaved, true, 'La licence doit être sauvegardée dans SQLite');
    assert.equal(storageMap.get('orion_lic_token'), 'mock.valid.rs256.jwt.token');
  });

  it('SQLite échoue : exception explicite levée, aucun token persisté dans localStorage', async () => {
    const storageMap = new Map();
    const mockStorage = {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, v),
      removeItem: (k) => storageMap.delete(k),
    };

    const mockInvoke = async (cmd) => {
      if (cmd === 'verify_license_token') {
        return { valid: true, claims: { sub: validLic.id, school_id: schoolA } };
      }
      if (cmd === 'save_license') {
        throw new Error('Base de données SQLite verrouillée ou disque plein');
      }
      throw new Error(`Commande inconnue: ${cmd}`);
    };

    const mockSupabase = {
      rpc: async () => ({ error: { code: 'PGRST202', message: 'function not found' } }),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: validLic, error: null }),
          }),
        }),
      }),
      functions: {
        invoke: async () => ({
          data: { token: 'mock.valid.rs256.jwt.token' },
          error: null,
        }),
      },
    };

    let caughtError = null;
    try {
      await activateSchoolLicense(
        { licenseKey: 'ORION-ABCD-EFGH-1234', schoolId: schoolA },
        {
          invokeFn: mockInvoke,
          supabaseClient: mockSupabase,
          storage: mockStorage,
        }
      );
    } catch (e) {
      caughtError = e;
    }

    assert.ok(caughtError, 'Une erreur doit être levée en cas d’échec SQLite');
    assert.match(caughtError.message, /base locale SQLite/i);
    assert.equal(
      storageMap.get('orion_lic_token'),
      undefined,
      'Aucun jeton ne doit être persisté si la persistance SQLite échoue'
    );
  });

  it('Jeton rejeté par Rust : save_license n’est jamais appelé et aucun token n’est persisté', async () => {
    const storageMap = new Map();
    const mockStorage = {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, v),
      removeItem: (k) => storageMap.delete(k),
    };

    let sqliteAttempted = false;

    const mockInvoke = async (cmd) => {
      if (cmd === 'verify_license_token') {
        return { valid: false, reason: 'Signature cryptographique RS256 invalide' };
      }
      if (cmd === 'save_license') {
        sqliteAttempted = true;
        return null;
      }
      throw new Error(`Commande inconnue: ${cmd}`);
    };

    const mockSupabase = {
      rpc: async () => ({ error: { code: 'PGRST202', message: 'function not found' } }),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: validLic, error: null }),
          }),
        }),
      }),
      functions: {
        invoke: async () => ({
          data: { token: 'mock.tampered.token' },
          error: null,
        }),
      },
    };

    let caughtError = null;
    try {
      await activateSchoolLicense(
        { licenseKey: 'ORION-ABCD-EFGH-1234', schoolId: schoolA },
        {
          invokeFn: mockInvoke,
          supabaseClient: mockSupabase,
          storage: mockStorage,
        }
      );
    } catch (e) {
      caughtError = e;
    }

    assert.ok(caughtError);
    assert.match(caughtError.message, /rejeté par le module de sécurité local/i);
    assert.equal(sqliteAttempted, false, 'SQLite ne doit jamais être appelé si Rust rejette le jeton');
    assert.equal(storageMap.get('orion_lic_token'), undefined);
  });

  it('Erreur 403 sur la RPC bloque immédiatement sans déclencher le fallback RLS', async () => {
    let rlsFallbackTriggered = false;

    const mockSupabase = {
      rpc: async () => ({
        error: { code: '42501', message: 'Seule la direction de l’établissement peut activer la licence' },
      }),
      from: () => {
        rlsFallbackTriggered = true;
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: validLic, error: null }),
            }),
          }),
        };
      },
    };

    let caughtError = null;
    try {
      await activateSchoolLicense(
        { licenseKey: 'ORION-ABCD-EFGH-1234', schoolId: schoolA },
        { supabaseClient: mockSupabase }
      );
    } catch (e) {
      caughtError = e;
    }

    assert.ok(caughtError);
    assert.match(caughtError.message, /Seule la direction/i);
    assert.equal(
      rlsFallbackTriggered,
      false,
      'Le fallback RLS ne doit JAMAIS s’activer sur une erreur d’autorisation (403)'
    );
  });
});
