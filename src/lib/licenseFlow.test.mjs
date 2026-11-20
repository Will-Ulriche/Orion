import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  LS_LICENSE_ACTIVATED,
  LS_ONLINE_CONFIGURED,
  readLicenseFlowState,
  isEffectiveLicenseActivation,
  applyLicenseActivation,
  clearLicenseActivation,
  resolveLoginMode,
  canRestoreOfflineSession,
} from './licenseFlow.ts';

const readSource = (relative) =>
  fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

const authSource = readSource('src/contexts/AuthContext.tsx');
const appSource = readSource('src/App.tsx');
const firstGateSource = readSource('src/components/FirstConnectionGate.tsx');
const licenseGuardSource = readSource('src/components/LicenseGuard.tsx');
const onlineLoginSource = readSource('src/pages/Login.tsx');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
}

test('Première connexion : un succès Supabase Auth n active jamais la licence', () => {
  const storage = memoryStorage();
  const state = readLicenseFlowState(storage);

  assert.equal(state.onlineConfigured, false);
  assert.equal(state.licenseActivated, false);
  assert.equal(resolveLoginMode({ licenseActivated: state.licenseActivated }), 'online');

  // Un objet de session Supabase n'est pas une preuve d'activation.
  assert.equal(
    isEffectiveLicenseActivation({
      user: { id: 'uuid' },
      access_token: 'supabase-token',
      roles: ['DIRECTION'],
    }),
    false
  );
  assert.equal(isEffectiveLicenseActivation(null), false);
  assert.equal(isEffectiveLicenseActivation({ success: true }), false);
  assert.equal(isEffectiveLicenseActivation({ token: 'jwt' }), false);

  // Le contexte ne doit plus écrire l'ancien flag sur simple connexion en ligne.
  assert.equal(authSource.includes("localStorage.setItem('orion_activated', '1')"), false);
  assert.match(authSource, /markOnlineConfigured\(\);/);
  assert.equal(/^\s*activate\(\);/m.test(authSource), false);
  assert.match(onlineLoginSource, /isActivation[\s\S]{0,200}connexion Supabase en ligne est obligatoire/);
});

test('Fermeture avant activation : aucun retour à la connexion locale', () => {
  const storage = memoryStorage({ [LS_ONLINE_CONFIGURED]: '1' });
  const state = readLicenseFlowState(storage);

  assert.equal(state.onlineConfigured, true, 'le compte en ligne est configuré');
  assert.equal(state.licenseActivated, false, 'aucune licence persistée');
  assert.equal(resolveLoginMode({ licenseActivated: state.licenseActivated }), 'online');
  assert.equal(canRestoreOfflineSession({ licenseActivated: state.licenseActivated }), false);

  assert.match(appSource, /resolveLoginMode\(\{ licenseActivated, wantsOnline: showOnline \}\)/);
  assert.equal(appSource.includes('const { activated }'), false);
});

test('Reprise après redémarrage : état relu du stockage, session locale refusée', () => {
  // L'application est fermée puis relancée : un nouveau stockage relit les clés.
  const beforeClose = memoryStorage({ [LS_ONLINE_CONFIGURED]: '1' });
  const afterRestart = memoryStorage(beforeClose.snapshot());

  const state = readLicenseFlowState(afterRestart);
  assert.equal(state.onlineConfigured, true);
  assert.equal(state.licenseActivated, false);
  assert.equal(resolveLoginMode({ licenseActivated: state.licenseActivated }), 'online');
  assert.equal(canRestoreOfflineSession({ licenseActivated: state.licenseActivated }), false);

  // L'ancien flag positionné par la seule auth Supabase ne doit pas non plus
  // qualifier une licence activée après migration.
  const legacy = memoryStorage({ orion_activated: '1' });
  const legacyState = readLicenseFlowState(legacy);
  assert.equal(legacyState.onlineConfigured, true);
  assert.equal(legacyState.licenseActivated, false);

  assert.match(authSource, /canRestoreOfflineSession\(\{/);
  assert.match(authSource, /Licence non activée : utilisez la connexion Supabase en ligne/);
});

test('Activation réussie : licence persistée puis connexion locale autorisée', () => {
  const storage = memoryStorage();
  assert.equal(resolveLoginMode({ licenseActivated: false }), 'online');

  const activation = { success: true, token: 'signed-jwt', license: { status: 'ACTIVE' } };
  assert.equal(isEffectiveLicenseActivation(activation), true);
  assert.equal(applyLicenseActivation(storage, activation), true);

  const state = readLicenseFlowState(storage);
  assert.equal(state.licenseActivated, true);
  assert.equal(state.onlineConfigured, true);
  assert.equal(storage.getItem(LS_LICENSE_ACTIVATED), '1');
  assert.equal(resolveLoginMode({ licenseActivated: state.licenseActivated }), 'local');
  assert.equal(canRestoreOfflineSession({ licenseActivated: state.licenseActivated }), true);

  // Un échec d'activation ne doit jamais positionner le flag.
  const other = memoryStorage();
  assert.equal(applyLicenseActivation(other, { success: false, token: 'x' }), false);
  assert.equal(readLicenseFlowState(other).licenseActivated, false);

  clearLicenseActivation(storage);
  assert.equal(readLicenseFlowState(storage).licenseActivated, false);
  assert.equal(resolveLoginMode({ licenseActivated: false }), 'online');

  assert.match(firstGateSource, /markLicenseActivated\(activation\)/);
  assert.match(licenseGuardSource, /markLicenseActivated\(res\)/);
  // L'effet de révocation ne doit pas se rejouer juste après l'activation.
  assert.equal(licenseGuardSource.includes('checkStatus, clearLicenseActivated'), false);
});

test('Super Admin : contournement intégral du parcours de licence', () => {
  assert.equal(resolveLoginMode({ licenseActivated: false, superAdmin: true }), 'online');
  assert.equal(canRestoreOfflineSession({ licenseActivated: false, superAdmin: true }), false);

  // Même avec un rôle SUPER_ADMIN, un simple succès d'auth n'est pas une activation.
  assert.equal(
    isEffectiveLicenseActivation({
      access_token: 'token',
      user_metadata: { role: 'SUPER_ADMIN' },
    }),
    false
  );

  assert.match(firstGateSource, /shouldBypassLicenseGate\(rolesLoaded, roles\)/);
  assert.match(
    firstGateSource,
    /if \(!rolesLoaded \|\| isSuperAdmin \|\| authError \|\| licenseActivated\) return;/
  );
  assert.match(licenseGuardSource, /if \(!user \|\| isSuperAdmin \|\| authError\) return;/);

  // La validation indépendante de LicenseGuard reste inchangée.
  assert.match(licenseGuardSource, /checkLicense/);
  assert.match(licenseGuardSource, /verify_license_token/);
});
