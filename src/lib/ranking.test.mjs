import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { competitionRanks } from './ranking.ts';

const ranksOf = (means) => {
  const rows = means.map((mean, index) => ({ id: `s${index}`, mean }));
  const ranks = competitionRanks(rows);
  return rows.map((row) => ranks.get(row.id));
};

test('classement sans ex æquo', () => {
  assert.deepEqual(ranksOf([16, 14, 12]), [1, 2, 3]);
});

test('deux élèves ex æquo', () => {
  assert.deepEqual(ranksOf([16, 16, 14]), [1, 1, 3]);
});

test('plusieurs élèves ex æquo', () => {
  assert.deepEqual(ranksOf([16, 16, 16, 14]), [1, 1, 1, 4]);
});

test('moyennes proches avec arrondis identiques', () => {
  assert.deepEqual(ranksOf([12.345, 12.3449999995, 11]), [1, 1, 3]);
});

test('moyennes réellement identiques', () => {
  assert.deepEqual(ranksOf([16, 16, 16]), [1, 1, 1]);
});

test('classe avec un seul élève', () => {
  assert.deepEqual(ranksOf([16]), [1]);
});

test('moyennes absentes en fin de classement', () => {
  assert.deepEqual(ranksOf([14, null, 16]), [2, 3, 1]);
});

test('classe sans moyenne', () => {
  assert.deepEqual(ranksOf([null, null]), [0, 0]);
});

test('BulletinModal : la recherche ne réduit pas les effectifs ni les rangs de classe', () => {
  const source = fs.readFileSync(new URL('../components/BulletinModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /const allGrouped = useMemo\(\(\) => \{[\s\S]*for \(const row of students\)/);
  assert.match(source, /const classRows = useMemo\(\s*\(\) => allGrouped\.find/);
  assert.doesNotMatch(source, /const classRows = useMemo\(\s*\(\) => grouped\.find/);
  assert.match(source, /classSize: classRows\.length/);
});
