import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  canInstallUpdate,
  formatUpdateError,
  shouldNotifyVersion,
  withHandledVersion,
  buildDownloadProgress,
} from './updateFlow.ts';

test('aucune notification répétée pour une même version en session', () => {
  const handled = new Set();
  assert.equal(shouldNotifyVersion(handled, '1.2.0', true), true);

  const updated = withHandledVersion(handled, '1.2.0');
  assert.equal(shouldNotifyVersion(updated, '1.2.0', true), false);
  assert.equal(shouldNotifyVersion(updated, '1.3.0', true), true);
  assert.equal(updated.has('1.2.0'), true);
  assert.equal(handled.has('1.2.0'), false);
});

test('une vérification manuelle n\'est pas une notification automatique', () => {
  assert.equal(shouldNotifyVersion(new Set(), '1.2.0', false), false);
});

test('le téléchargement exige un consentement explicite', () => {
  assert.equal(canInstallUpdate('available', true, false), false);
  assert.equal(canInstallUpdate('available', false, true), false);
  assert.equal(canInstallUpdate('available', true, true), true);
});

test('aucun nouveau téléchargement ne démarre pendant une installation', () => {
  assert.equal(canInstallUpdate('downloading', true, true), false);
  assert.equal(canInstallUpdate('downloaded', true, true), false);
  assert.equal(canInstallUpdate('checking', true, true), false);
  assert.equal(canInstallUpdate('error', true, true), true);
});

test('progression du téléchargement bornée entre 0 et 100', () => {
  assert.deepEqual(buildDownloadProgress(0, 0), { downloaded: 0, total: 0, percent: 0 });
  assert.deepEqual(buildDownloadProgress(25, 100), { downloaded: 25, total: 100, percent: 25 });
  assert.deepEqual(buildDownloadProgress(150, 100), { downloaded: 150, total: 100, percent: 100 });
  assert.deepEqual(buildDownloadProgress(10, -1), { downloaded: 10, total: 0, percent: 0 });
});

test('erreurs réseau et absence de version traduites en messages utilisateur', () => {
  assert.match(formatUpdateError(new Error('failed to fetch'), true), /hors ligne|réseau/);
  assert.match(formatUpdateError(new Error('HTTP 404'), true), /aucune nouvelle version/i);
  assert.match(formatUpdateError(new Error('boom'), true), /boom/);
});

test('les actions d\'installation passent toutes un consentement explicite', () => {
  const files = [
    '../components/UpdateModal.tsx',
    '../components/UpdateNotificationToast.tsx',
    '../pages/Settings.tsx',
  ];
  for (const file of files) {
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /downloadAndInstall\(true\)/, file);
    assert.doesNotMatch(source, /downloadAndInstall\(\)/, file);
  }
});

test('les vérifications automatiques ne déclenchent jamais d\'installation', () => {
  const source = fs.readFileSync(new URL('../contexts/UpdateContext.tsx', import.meta.url), 'utf8');
  const startupEffect = source.match(/useEffect\(\(\) => \{\s*if \(!autoCheck[\s\S]*?\}, \[autoCheck[^\]]*\]\);/);
  assert.ok(startupEffect, 'effet de vérification automatique introuvable');
  assert.doesNotMatch(startupEffect[0], /downloadAndInstall|relaunch|restartApp/);
  assert.match(source, /if \(!userConfirmed[\s\S]{0,80}return/);
});

test('les ressources Update sont libérées lors d\'un report ou d\'un abandon', () => {
  const source = fs.readFileSync(new URL('../contexts/UpdateContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /await update\.close\(\)/);
  assert.match(source, /const dismissBanner[\s\S]{0,160}releaseUpdate\(\)/);
  assert.match(source, /const closeModal[\s\S]{0,160}releaseUpdate\(\)/);
  assert.match(source, /mountedRef\.current = false;[\s\S]{0,80}releaseUpdate\(\)/);
});

test('la configuration updater utilise une clé publique et des permissions dédiées', () => {
  const configSource = fs.readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8');
  const config = JSON.parse(configSource);
  assert.match(config.plugins.updater.pubkey, /^[A-Za-z0-9+/=]+$/);
  assert.ok(config.plugins.updater.endpoints.length > 0);
  assert.doesNotMatch(configSource, /private|secret/i);

  const capabilities = JSON.parse(fs.readFileSync(
    new URL('../../src-tauri/capabilities/default.json', import.meta.url),
    'utf8',
  ));
  assert.ok(capabilities.permissions.includes('updater:default'));
  assert.ok(capabilities.permissions.includes('process:default'));
});
