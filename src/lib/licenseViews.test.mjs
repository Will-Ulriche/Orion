import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LICENSE_VIEWS,
  classifyLicenseView,
  filterLicensesByView,
  groupLicensesByView,
} from './licenseViews.ts';

const licenses = [
  { id: 'current', is_current: true, status: 'ACTIVE' },
  { id: 'suspended', is_current: true, status: 'SUSPENDED' },
  { id: 'revoked-current', is_current: true, status: 'REVOKED' },
  { id: 'expired', is_current: true, status: 'EXPIRED' },
  { id: 'superseded', is_current: false, status: 'SUPERSEDED' },
  { id: 'revoked-archived', is_current: false, status: 'REVOKED' },
];

test('LIC-VUE-01 : une licence courante active reste dans les licences courantes', () => {
  assert.equal(classifyLicenseView(licenses[0]), 'current');
});

test('LIC-VUE-02 : une licence courante non active est suspendue/révoquée', () => {
  assert.equal(classifyLicenseView(licenses[1]), 'blocked');
  assert.equal(classifyLicenseView(licenses[2]), 'blocked');
  assert.equal(classifyLicenseView(licenses[3]), 'blocked');
});

test('LIC-VUE-03 : toute licence non courante appartient à l historique archivé', () => {
  assert.equal(classifyLicenseView(licenses[4]), 'archive');
  assert.equal(classifyLicenseView(licenses[5]), 'archive');
});

test('LIC-VUE-04 : le regroupement partitionne sans perte ni doublon', () => {
  const groups = groupLicensesByView(licenses);
  const ids = LICENSE_VIEWS.flatMap((v) => groups[v.id].map((l) => l.id));
  assert.equal(ids.length, licenses.length);
  assert.equal(new Set(ids).size, licenses.length);
  assert.deepEqual(groups.current.map((l) => l.id), ['current']);
  assert.deepEqual(groups.blocked.map((l) => l.id), ['suspended', 'revoked-current', 'expired']);
  assert.deepEqual(groups.archive.map((l) => l.id), ['superseded', 'revoked-archived']);
});

test('LIC-VUE-05 : le filtrage par vue n retourne que la vue demandée', () => {
  assert.deepEqual(filterLicensesByView(licenses, 'archive').map((l) => l.id), ['superseded', 'revoked-archived']);
  assert.deepEqual(filterLicensesByView(licenses, 'current').map((l) => l.id), ['current']);
});
