import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { generateDataset } from './generate.mjs';

const SLOUIS = '2930e1ad-570f-491f-9821-3d831487e754';
const SLOUIS_YEAR = 'ebec981f-587f-4a39-8672-c5693d573366';
const SLOUIS_LICENSE = 'd2d3a622-919b-411e-9746-23df1d089949';
const FUTURE_LICENSE_EXPIRY = '2027-08-31T23:59:00+00:00';
const SEED_STAMP_LOCAL = '2026-10-16 16:30:00';

const dbPath =
  process.env.ORION_LOCAL_DB ??
  path.join(os.homedir(), 'AppData', 'Roaming', 'com.orion.app', 'orion.sqlite');

const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(dbPath)) {
  console.error(`Base locale introuvable : ${dbPath}`);
  process.exit(1);
}

const data = generateDataset();
const only = (rows) => rows.filter((r) => r.school_id === SLOUIS);
const onlyYear = (rows) => rows.filter((r) => r.academic_year_id === SLOUIS_YEAR);

const INSERT_PLAN = [
  ['sections', only(data.sections)],
  ['levels', only(data.levels)],
  ['series', only(data.series)],
  ['subjects', only(data.subjects)],
  ['grade_types', only(data.gradeTypes)],
  ['grading_periods', only(data.gradingPeriods)],
  ['staff', only(data.staff)],
  ['classes', only(data.classes)],
  ['students', only(data.students)],
  ['enrollments', only(data.enrollments)],
  ['class_subjects', only(data.classSubjects)],
  ['teacher_assignments', only(data.teacherAssignments)],
  ['enrollment_history', onlyYear(data.enrollmentHistory)],
  ['grades', only(data.grades)],
  ['fee_structures', only(data.feeStructures)],
  ['payments', only(data.payments)],
  ['timetable_slots', only(data.timetableSlots)],
  ['devices', only(data.devices)],
];

const PURGE_PLAN = [
  ['timetable_slots', `school_id = '${SLOUIS}'`],
  ['payments', `school_id = '${SLOUIS}'`],
  ['grades', `school_id = '${SLOUIS}'`],
  ['enrollment_history', `academic_year_id = '${SLOUIS_YEAR}'`],
  ['teacher_assignments', `school_id = '${SLOUIS}'`],
  ['class_subjects', `school_id = '${SLOUIS}'`],
  ['enrollments', `school_id = '${SLOUIS}'`],
  ['students', `school_id = '${SLOUIS}'`],
  ['fee_structures', `school_id = '${SLOUIS}'`],
  ['grading_periods', `school_id = '${SLOUIS}'`],
  ['grade_types', `school_id = '${SLOUIS}'`],
  ['subjects', `school_id = '${SLOUIS}'`],
  ['series', `school_id = '${SLOUIS}'`],
  ['levels', `school_id = '${SLOUIS}'`],
  ['sections', `school_id = '${SLOUIS}'`],
  ['classes', `school_id = '${SLOUIS}'`],
];

const PURGED_TABLES = new Set(PURGE_PLAN.map(([t]) => t));
const NO_PURGE_TABLES = new Set(['staff', 'devices']);

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function normalize(value) {
  if (typeof value === 'string' && ISO_UTC.test(value)) {
    return value.slice(0, 19) + '+00:00';
  }
  return value;
}

let db;
try {
  db = new DatabaseSync(dbPath);
} catch (e) {
  console.error(`Impossible d'ouvrir ${dbPath} : ${e.message}`);
  console.error("Fermez l'application Orion puis relancez.");
  process.exit(1);
}

const tableColumns = new Map();
function columnsOf(table) {
  if (!tableColumns.has(table)) {
    tableColumns.set(
      table,
      db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name)
    );
  }
  return tableColumns.get(table);
}

function project(table, row) {
  const out = {};
  for (const col of columnsOf(table)) {
    if (Object.prototype.hasOwnProperty.call(row, col)) {
      out[col] = normalize(row[col] ?? null);
    }
  }
  return out;
}

function insertRows(table, rows) {
  const cols = columnsOf(table);
  const projected = rows.map((r) => project(table, r));
  const present = new Set();
  for (const row of projected) {
    for (const k of Object.keys(row)) present.add(k);
  }
  const insertCols = cols.filter((c) => present.has(c));
  const sql = `INSERT OR IGNORE INTO "${table}" ("${insertCols.join('","')}") VALUES (${insertCols
    .map(() => '?')
    .join(',')})`;
  const stmt = db.prepare(sql);
  let inserted = 0;
  for (const row of projected) {
    inserted += stmt.run(...insertCols.map((c) => row[c] ?? null)).changes;
  }
  return { inserted, expected: rows.length };
}

function updateRow(table, patch, whereSql, whereParams) {
  const cols = columnsOf(table);
  const setCols = Object.keys(patch).filter((c) => cols.includes(c));
  if (!setCols.length) return 0;
  const sql = `UPDATE "${table}" SET ${setCols.map((c) => `"${c}" = ?`).join(', ')} WHERE ${whereSql}`;
  const r = db
    .prepare(sql)
    .run(...setCols.map((c) => normalize(patch[c] ?? null)), ...whereParams);
  return r.changes;
}

const schoolRow = project('schools', data.schools.find((s) => s.id === SLOUIS));
delete schoolRow.created_at;
delete schoolRow.id;
schoolRow.updated_at = SEED_STAMP_LOCAL;

const yearRow = project(
  'academic_years',
  data.academicYears.find((y) => y.id === SLOUIS_YEAR)
);
delete yearRow.created_at;
delete yearRow.id;
yearRow.status = 'ACTIVE';
yearRow.is_current = 1;
yearRow.updated_at = SEED_STAMP_LOCAL;

const problems = [];

console.log(`Base locale : ${dbPath}`);

if (dryRun) {
  console.log('Mode dry-run : aucune ecriture.');
  let total = 0;
  for (const [table, rows] of INSERT_PLAN) {
    const missing = columnsOf(table).length;
    if (!missing) problems.push(`table inexistante : ${table}`);
    console.log(`  ${table}: ${rows.length} ligne(s) a inserer (${missing} colonne(s))`);
    total += rows.length;
  }
  console.log(`  purge de ${PURGE_PLAN.length} table(s) pour SAINT LOUIS`);
  console.log(`  total : ${total} ligne(s)`);
  db.close();
  process.exit(problems.length ? 2 : 0);
}

const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const backup = `${dbPath}.bak-${ts}`;
fs.copyFileSync(dbPath, backup);
console.log(`Sauvegarde : ${backup}`);

db.exec('BEGIN IMMEDIATE');
try {
  for (const [table, where] of PURGE_PLAN) {
    const r = db.prepare(`DELETE FROM "${table}" WHERE ${where}`).run();
    if (r.changes) console.log(`  purge ${table}: ${r.changes}`);
  }

  console.log(`  update schools: ${updateRow('schools', schoolRow, 'id = ?', [SLOUIS])} ligne(s)`);
  console.log(
    `  update academic_years -> ACTIVE: ${updateRow('academic_years', yearRow, 'id = ?', [SLOUIS_YEAR])} ligne(s)`
  );

  for (const [table, rows] of INSERT_PLAN) {
    const { inserted, expected } = insertRows(table, rows);
    console.log(`  insert ${table}: ${inserted}/${expected}`);
    if (inserted < expected && PURGED_TABLES.has(table)) {
      problems.push(`${table}: ${expected - inserted} ligne(s) absente(s)`);
    }
  }

  const licenseChanges = updateRow(
    'licenses',
    {
      status: 'ACTIVE',
      max_devices: 5,
      expires_at: FUTURE_LICENSE_EXPIRY,
      updated_at: SEED_STAMP_LOCAL,
    },
    'id = ? AND school_id = ?',
    [SLOUIS_LICENSE, SLOUIS]
  );
  console.log(`  update licenses (max_devices=5, expire 2027-08-31): ${licenseChanges} ligne(s)`);
  if (!licenseChanges) problems.push('licence SAINT LOUIS introuvable');

  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('ROLLBACK :', e.message);
  process.exit(1);
}

const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
console.log(`\nforeign_key_check : ${fkViolations.length} violation(s)`);
for (const v of fkViolations) console.log('  ', JSON.stringify(v));

function countTable(table) {
  if (table === 'enrollment_history') {
    return db.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE academic_year_id = ?`).get(SLOUIS_YEAR).n;
  }
  if (table === 'devices') {
    return db.prepare('SELECT COUNT(*) AS n FROM devices').get().n;
  }
  return db.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE school_id = ?`).get(SLOUIS).n;
}

console.log('\nComptages SAINT LOUIS :');
for (const [table, rows] of INSERT_PLAN) {
  const n = countTable(table);
  const mark = PURGED_TABLES.has(table)
    ? n === rows.length
      ? 'OK'
      : 'ECART'
    : n >= rows.length
      ? 'OK'
      : 'ECART';
  console.log(`  ${table}: ${n} (attendu ${PURGED_TABLES.has(table) ? '=' : '>='} ${rows.length}) ${mark}`);
  if (mark === 'ECART') problems.push(`${table}: ${n} vs ${rows.length}`);
}

const year = db
  .prepare('SELECT status, is_current FROM academic_years WHERE id = ?')
  .get(SLOUIS_YEAR);
console.log(`\nAnnee 2026-2027 : status=${year?.status}, is_current=${year?.is_current}`);
if (year?.status !== 'ACTIVE') problems.push('annee non ACTIVE');

try {
  db.exec('VACUUM');
  console.log('VACUUM effectue.');
} catch (e) {
  console.log('VACUUM ignore :', e.message);
}

console.log(`Taille base : ${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(2)} Mo`);
db.close();

if (problems.length || fkViolations.length) {
  console.error('\nPROBLEMES :');
  for (const p of problems) console.error('  - ' + p);
  for (const v of fkViolations) console.error('  - FK ' + JSON.stringify(v));
  process.exit(2);
}
console.log('\nSeed locale terminee avec succes.');
