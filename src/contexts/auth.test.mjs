import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Read AuthContext.tsx source directly
const authContextPath = path.resolve('src/contexts/AuthContext.tsx');
const tsxSource = fs.readFileSync(authContextPath, 'utf8');
const firstGateSource = fs.readFileSync(
  path.resolve('src/components/FirstConnectionGate.tsx'), 'utf8'
);
const licenseGuardSource = fs.readFileSync(
  path.resolve('src/components/LicenseGuard.tsx'), 'utf8'
);

// Extract the target functions and helpers directly from AuthContext.tsx
// to test the real implementation in AuthContext.tsx
const functionRegex = /export\s+async\s+function\s+resolveUserRolesOnline[\s\S]*?export\s+function\s+shouldBypassLicenseGate[\s\S]*?\n\}/;
const match = tsxSource.match(functionRegex);
assert.ok(match, 'Les fonctions cibles doivent être présentes dans AuthContext.tsx');

const transpiled = ts.transpileModule(match[0], {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
});

const exports = {};
const fn = new Function('exports', transpiled.outputText);
fn(exports);

const { resolveUserRolesOnline, resolveUserRolesOffline, shouldBypassLicenseGate } = exports;

test('Auth System - Rôle manquant (Missing Role)', async (t) => {
  await t.test('En ligne : aucun rôle trouvé dans user_roles -> bloque les privilèges sans fallback DIRECTION', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({
            data: [],
            error: null
          })
        })
      })
    };

    const res = await resolveUserRolesOnline(mockSupabase, 'user-without-roles');
    assert.deepEqual(res.roles, [], 'Les rôles doivent être vides');
    assert.equal(res.roles.includes('DIRECTION'), false, 'Ne doit JAMAIS attribuer DIRECTION par défaut');
    assert.ok(res.error, 'Une erreur explicite doit être retournée pour bloquer les privilèges');
    assert.match(res.error, /Aucun rôle valide n'a pu être vérifié/i);
  });

  await t.test('Hors-ligne : aucun rôle dans la base locale SQLite -> bloque les privilèges sans fallback DIRECTION', async () => {
    const mockInvoke = async () => [];
    const res = await resolveUserRolesOffline(mockInvoke, 'user-without-roles', 'school-123');
    assert.deepEqual(res.roles, [], 'Les rôles locaux doivent être vides');
    assert.equal(res.roles.includes('DIRECTION'), false, 'Ne doit JAMAIS fallback sur DIRECTION');
    assert.ok(res.error, 'Une erreur explicite doit être retournée');
    assert.match(res.error, /Aucun rôle enregistré localement/i);
  });
});

test('Auth System - Erreur réseau ou DB (Network / DB error)', async (t) => {
  await t.test('En ligne : échec de requête Supabase -> bloque les privilèges et affiche une erreur explicite', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({
            data: null,
            error: { message: 'Network connection lost / timeout' }
          })
        })
      })
    };

  const res = await resolveUserRolesOnline(mockSupabase, 'user-id');

    assert.deepEqual(res.roles, [], 'Aucun privilège ne doit être accordé en cas d erreur réseau');
    assert.equal(res.roles.includes('DIRECTION'), false, 'Ne doit jamais fallback sur DIRECTION');
    assert.ok(res.error, 'L erreur doit être explicite');
    assert.match(res.error, /Network connection lost/i);
  });

  await t.test('Hors-ligne : échec SQLite -> bloque les privilèges et affiche une erreur explicite', async () => {
    const mockInvoke = async () => {
      throw new Error('Database locked / corrupted');
    };

    const res = await resolveUserRolesOffline(mockInvoke, 'user-id', 'school-123');
    assert.deepEqual(res.roles, [], 'Aucun privilège ne doit être accordé en cas d échec SQLite');
    assert.ok(res.error, 'L erreur doit être explicite');
    assert.match(res.error, /Database locked/i);
  });
});

test('Auth System - Rôle SUPER_ADMIN', async (t) => {
  await t.test('En ligne : rôle SUPER_ADMIN vérifié depuis Supabase user_roles', async () => {
    const mockSupabase = {
      from: (table) => {
        assert.equal(table, 'user_roles');
        return {
          select: (fields) => {
            assert.equal(fields, 'roles(name), school_id');
            return {
              eq: (col, val) => {
                assert.equal(col, 'user_id');
                assert.equal(val, 'super-admin-uuid');
                return Promise.resolve({
                  data: [{ school_id: 'school-123', roles: { name: 'SUPER_ADMIN' } }],
                  error: null
                });
              }
            };
          }
        };
      }
    };

    const res = await resolveUserRolesOnline(mockSupabase, 'super-admin-uuid', 'school-123');
    assert.deepEqual(res.roles, ['SUPER_ADMIN'], 'SUPER_ADMIN doit être validé depuis Supabase');
    assert.equal(res.error, null);
  });

  await t.test('Hors-ligne : rôle SUPER_ADMIN vérifié depuis le dernier état sécurisé SQLite', async () => {
    const mockInvoke = async (cmd, args) => {
      assert.equal(cmd, 'get_current_user_roles');
      assert.equal(args.userId, 'super-admin-uuid');
      return ['SUPER_ADMIN'];
    };

    const res = await resolveUserRolesOffline(mockInvoke, 'super-admin-uuid', 'school-123');
    assert.deepEqual(res.roles, ['SUPER_ADMIN'], 'SUPER_ADMIN doit être validé depuis SQLite');
    assert.equal(res.error, null);
  });

  await t.test('Bypass de licence : SUPER_ADMIN contourne intégralement FirstConnectionGate et LicenseGuard', () => {
    // Cas rôles chargés avec SUPER_ADMIN
    assert.equal(shouldBypassLicenseGate(true, ['SUPER_ADMIN']), true);
    assert.equal(shouldBypassLicenseGate(true, ['SUPER_ADMIN', 'DIRECTION']), true);

    // Si les rôles ne sont pas encore chargés, aucun contournement
    assert.equal(shouldBypassLicenseGate(false, ['SUPER_ADMIN']), false);
  });
});

test('Auth System - Utilisateur DIRECTION', async (t) => {
  await t.test('En ligne : rôle DIRECTION légitime validé depuis Supabase user_roles', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({
            data: [{ school_id: 'school-123', roles: { name: 'DIRECTION' } }],
            error: null
          })
        })
      })
    };

    const res = await resolveUserRolesOnline(mockSupabase, 'dir-uuid', 'school-123');
    assert.deepEqual(res.roles, ['DIRECTION']);
    assert.equal(res.error, null);
  });

  await t.test('Hors-ligne : rôle DIRECTION validé depuis SQLite local', async () => {
    const mockInvoke = async () => ['DIRECTION'];
    const res = await resolveUserRolesOffline(mockInvoke, 'dir-uuid', 'school-123');
    assert.deepEqual(res.roles, ['DIRECTION']);
    assert.equal(res.error, null);
  });

  await t.test('Bypass de licence : DIRECTION ne contourne PAS LicenseGuard ni FirstConnectionGate', () => {
    assert.equal(shouldBypassLicenseGate(true, ['DIRECTION']), false);
  });
});

test('Auth System - Rejet strict de user_metadata.role et fallbacks permissifs', async () => {
  // Strip comments to verify executable code
  const codeWithoutComments = tsxSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

  assert.equal(
    codeWithoutComments.includes('user_metadata.role'),
    false,
    'Aucun code exécutable ne doit lire user_metadata.role'
  );
  assert.equal(
    codeWithoutComments.includes('userMeta.role'),
    false,
    'Aucun code exécutable ne doit lire userMeta.role'
  );
  assert.equal(
    codeWithoutComments.includes("|| 'DIRECTION'"),
    false,
    'Aucun fallback || DIRECTION ne doit exister dans AuthContext.tsx'
  );
  assert.equal(
    codeWithoutComments.includes("|| ['DIRECTION']"),
    false,
    'Aucun fallback || [DIRECTION] ne doit exister dans AuthContext.tsx'
  );
});

test('Auth System - user_metadata.role ne peut jamais élever un utilisateur', async () => {
  const mockSupabase = {
    from: (table) => {
      assert.equal(table, 'user_roles');
      return {
        select: () => ({
          eq: () => Promise.resolve({
            data: [{
              school_id: 'school-123',
              roles: { name: 'DIRECTION' },
              user_metadata: { role: 'SUPER_ADMIN' },
            }],
            error: null,
          })
        })
      };
    }
  };

  const res = await resolveUserRolesOnline(mockSupabase, 'user-id', 'school-123');
  assert.deepEqual(res.roles, ['DIRECTION'], 'Seule la table user_roles fait foi');
  assert.equal(res.roles.includes('SUPER_ADMIN'), false, 'user_metadata.role ne doit jamais accord SUPER_ADMIN');
});

test('Auth System - Aucun privilège stale après déconnexion', () => {
  const signOutMatch = tsxSource.match(/const signOut = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(signOutMatch, 'signOut doit être présent dans AuthContext.tsx');
  assert.match(signOutMatch[0], /setRoles\(\[\]\)/);
  assert.match(signOutMatch[0], /setRolesLoaded\(false\)/);
  assert.match(signOutMatch[0], /setAuthError\(null\)/);
});

test('Auth System - Erreur de chargement : blocage et message explicite dans les gardes', () => {
  for (const [name, source] of [
    ['FirstConnectionGate', firstGateSource],
    ['LicenseGuard', licenseGuardSource],
  ]) {
    assert.ok(source.includes('authError'), `${name} doit lire authError`);
    assert.ok(source.includes('AuthErrorScreen'), `${name} doit afficher l'erreur explicitement`);
    assert.ok(
      source.includes('if (authError)') &&
        source.includes('return <AuthErrorScreen message={authError} />;'),
      `${name} doit bloquer l'accès dès qu'une erreur d'authentification est présente`
    );
  }
});

test('Auth System - SUPER_ADMIN : aucun appel de vérification de licence', () => {
  assert.ok(firstGateSource.includes('shouldBypassLicenseGate'));
  assert.ok(licenseGuardSource.includes('shouldBypassLicenseGate'));
  assert.equal(
    firstGateSource.includes("roles.includes('SUPER_ADMIN')"),
    false,
    'FirstConnectionGate doit utiliser le helper vérifié, pas un test direct sur roles'
  );

  const firstGuardIndex = firstGateSource.indexOf(
    'if (!rolesLoaded || isSuperAdmin || authError || licenseActivated) return;'
  );
  const firstProbeIndex = firstGateSource.indexOf('probeOnline()');
  assert.ok(firstGuardIndex > 0, 'FirstConnectionGate doit court-circuiter avant toute sonde');
  assert.ok(firstProbeIndex > firstGuardIndex, 'probeOnline ne doit jamais précéder le court-circuit SUPER_ADMIN');

  const licenseGuardIndex = licenseGuardSource.indexOf('if (!user || isSuperAdmin || authError) return;');
  const licenseQueryIndex = licenseGuardSource.indexOf(".from('licenses')");
  assert.ok(licenseGuardIndex > 0, 'LicenseGuard doit court-circuiter dans checkLicense');
  assert.ok(licenseQueryIndex > licenseGuardIndex, 'Aucune requête licenses ne doit précéder le court-circuit SUPER_ADMIN');
});

test('Auth System - les rôles locaux ne s’agrègent pas entre établissements', async () => {
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({
          data: [
            { school_id: 'school-A', roles: { name: 'SECRETAIRE' } },
            { school_id: 'school-B', roles: { name: 'PROFESSEUR' } },
            { school_id: 'school-main', roles: { name: 'SUPER_ADMIN' } },
          ],
          error: null,
        }),
      }),
    }),
  };

  const scoped = await resolveUserRolesOnline(mockSupabase, 'user-multi-school', 'school-A');
  assert.deepEqual(scoped.roles, ['SECRETAIRE', 'SUPER_ADMIN']);
  assert.equal(scoped.roles.includes('PROFESSEUR'), false);

  const withoutSchool = await resolveUserRolesOnline(mockSupabase, 'user-multi-school', '');
  assert.deepEqual(withoutSchool.roles, ['SUPER_ADMIN']);

  const syncSource = tsxSource.match(/const syncUserToLocalDb = async \([\s\S]*?\n  \};/);
  assert.ok(syncSource, 'syncUserToLocalDb doit être présent');
  const profileIndex = syncSource[0].indexOf(".from('profiles')");
  const roleIndex = syncSource[0].indexOf('resolveUserRolesOnline(supabase');
  assert.ok(profileIndex > 0 && roleIndex > profileIndex, 'Le school_id du profil doit être résolu avant les rôles');
});
