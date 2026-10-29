import { createClient } from '@supabase/supabase-js';
import { generateDataset } from './generate.mjs';
import { randomUUID, createHash } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Variables manquantes : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const BATCH_SIZE = 25;
const SYNC_CURSOR = '2026-10-16T16:13:43Z';
const SLOUIS = '2930e1ad-570f-491f-9821-3d831487e754';
const SLOUIS_LICENSE = 'd2d3a622-919b-411e-9746-23df1d089949';
const FUTURE_LICENSE_EXPIRY = '2027-08-31T23:59:00+00:00';

const client = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const data = generateDataset({ requireAccountPasswords: true });
const errors = [];
const report = [];

const root = await fetch(`${SUPABASE_URL}/rest/v1/`, {
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
}).then((r) => r.json());
const definitions = root.definitions || {};
const tableColumns = new Map(
  Object.entries(definitions).map(([t, d]) => [t, new Set(Object.keys(d.properties || {}))])
);

function columnsOf(table) {
  const cols = tableColumns.get(table);
  if (!cols) throw new Error(`Table absente du schÃ©ma cloud : ${table}`);
  return cols;
}

function project(table, row) {
  const cols = columnsOf(table);
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (cols.has(k)) out[k] = v ?? null;
  }
  return out;
}

async function withRetry(fn, label) {
  let last;
  for (let i = 0; i < 4; i++) {
    const { data: res, error } = await fn();
    if (!error) return res;
    last = error;
    if (error.code === '42703' || error.code === 'PGRST204') break;
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw new Error(`${label} : ${last.message || last}`);
}

async function upsertTable(table, rows, { nullableUserRefs = [] } = {}) {
  const prepared = prepare(table, rows, nullableUserRefs);
  return insertBatch(table, prepared, true);
}

function prepare(table, rows, nullableUserRefs = []) {
  const directionBySchool = data.directionUserBySchool;
  return rows.map((row) => {
    const projected = project(table, row);
    for (const ref of nullableUserRefs) {
      if (projected[ref] == null && directionBySchool[projected.school_id]) {
        projected[ref] = directionBySchool[projected.school_id];
      }
    }
    if (projected.updated_at && projected.updated_at >= SYNC_CURSOR) {
      errors.push(`${table} : updated_at ${projected.updated_at} >= curseur sync`);
    }
    if (projected.changed_at && projected.changed_at >= SYNC_CURSOR) {
      errors.push(`${table} : changed_at ${projected.changed_at} >= curseur sync`);
    }
    return projected;
  });
}

async function insertBatch(table, prepared, ignoreDuplicates) {
  if (!prepared.length) return 0;
  let count = 0;
  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const batch = prepared.slice(i, i + BATCH_SIZE);
    await withRetry(
      () => client.from(table).upsert(batch, { onConflict: 'id', ignoreDuplicates }),
      `${table} lot ${i / BATCH_SIZE + 1}`
    );
    count += batch.length;
    process.stdout.write(`\r  ${table}: ${count}/${prepared.length}`);
  }
  console.log(`\r  ${table}: ${count}/${prepared.length} OK`);
  return count;
}

async function replaceTable(table, rows, scopeColumn, scopeValues, { nullableUserRefs = [] } = {}) {
  const prepared = prepare(table, rows, nullableUserRefs);
  await withRetry(
    () => client.from(table).delete({ count: 'exact' }).in(scopeColumn, scopeValues),
    `delete ${table}`
  );
  return insertBatch(table, prepared, true);
}
void replaceTable;

function stableId(parts) {
  const h = createHash('sha256').update(parts.join('|')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function countOf(table) {
  const { count, error } = await client.from(table).select('id', { count: 'exact', head: true });
  if (error) return `ERR ${error.message}`;
  return count;
}

const t0 = Date.now();

const rolesRes = await client.from('roles').select('id, name');
if (rolesRes.error) {
  console.error('roles:', rolesRes.error.message);
  process.exit(1);
}
const roleIdByName = Object.fromEntries(rolesRes.data.map((r) => [r.name, r.id]));

if (dryRun) {
  console.log('Mode dry-run : aucune ecriture cloud.');
  const plan = [
    ['schools', data.schools.length],
    ['comptes (auth + users + profiles + user_roles)', data.accounts.length],
    ['academic_years', data.academicYears.length],
    ['licenses', data.licenses.length],
    ['devices', data.devices.length],
    ['sections', data.sections.length],
    ['levels', data.levels.length],
    ['series', data.series.length],
    ['subjects', data.subjects.length],
    ['grade_types', data.gradeTypes.length],
    ['grading_periods', data.gradingPeriods.length],
    ['staff', data.staff.length],
    ['classes', data.classes.length],
    ['students', data.students.length],
    ['enrollments', data.enrollments.length],
    ['enrollment_history', data.enrollmentHistory.length],
    ['class_subjects', data.classSubjects.length],
    ['teacher_assignments', data.teacherAssignments.length],
    ['grades', data.grades.length],
    ['fee_structures', data.feeStructures.length],
    ['payments', data.payments.length],
    ['timetable_slots (table absente du cloud)', 0],
  ];
  let total = 0;
  for (const [t, n] of plan) {
    console.log(`  ${t}: ${n}`);
    total += n;
  }
  console.log(`  total : ${total} ligne(s)`);
  for (const a of data.accounts) console.log(`  ${a.role.padEnd(11)} ${a.email}`);
  process.exit(0);
}

const schoolDirection = {
  [SLOUIS]: data.directionUserBySchool[SLOUIS],
};

console.log('== Ecoles ==');
await upsertTable('schools', data.schools);

console.log('== Comptes (auth + users + profiles + user_roles) ==');
const existingUsers = await client.from('users').select('id, email');
const existingProfiles = await client.from('profiles').select('id, user_id, school_id');
const existingRoles = await client.from('user_roles').select('id, user_id, school_id, role_id');
if (existingUsers.error || existingProfiles.error || existingRoles.error) {
  console.error('lecture users/profiles/user_roles:', (existingUsers.error || existingProfiles.error || existingRoles.error).message);
  process.exit(1);
}
const userIdByEmail = new Map(existingUsers.data.map((u) => [u.email, u.id]));

const newAccounts = [];
for (const account of data.accounts) {
  let uid = userIdByEmail.get(account.email);
  if (!uid) {
    const { data: created, error } = await client.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: account.metadata,
    });
    if (error) {
      errors.push(`auth.createUser ${account.email}: ${error.message}`);
      continue;
    }
    uid = created.user.id;
    const now = new Date().toISOString();
    await withRetry(
      () => client.from('users').upsert({ id: uid, email: account.email, status: 'ACTIVE', created_at: now, updated_at: now }, { onConflict: 'id' }),
      `users ${account.email}`
    );
  }
  newAccounts.push({ ...account, uid });
  if (!schoolDirection[account.schoolId] && account.role === 'DIRECTION') {
    schoolDirection[account.schoolId] = uid;
  }
  report.push(`  ${account.role.padEnd(11)} ${account.email}`);
}
for (const account of newAccounts) {
  const profileExists = existingProfiles.data.some((p) => p.user_id === account.uid);
  if (!profileExists) {
    const now = new Date().toISOString();
    await withRetry(
      () =>
        client.from('profiles').upsert(
          {
            id: `prof-${account.uid}`,
            user_id: account.uid,
            school_id: account.schoolId,
            first_name: account.first_name,
            last_name: account.last_name,
            phone: account.phone,
            created_at: now,
            updated_at: now,
          },
          { onConflict: 'id' }
        ),
      `profiles ${account.email}`
    );
  }
  const roleExists = existingRoles.data.some(
    (r) => r.user_id === account.uid && r.school_id === account.schoolId && r.role_id === roleIdByName[account.role]
  );
  if (!roleExists) {
    await withRetry(
      () =>
        client.from('user_roles').upsert(
          {
            id: stableId(['user_role', account.uid, account.schoolId, account.role]),
            user_id: account.uid,
            school_id: account.schoolId,
            role_id: roleIdByName[account.role],
            created_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        ),
      `user_roles ${account.email}`
    );
  }
}
for (const school of data.schools) {
  if (!schoolDirection[school.id] && school.id !== SLOUIS) {
    errors.push(`direction manquante pour ${school.name}`);
  }
}
data.directionUserBySchool = { ...data.directionUserBySchool, ...schoolDirection };

console.log(`  comptes traites : ${newAccounts.length}`);

const profileUserIds = new Set(existingProfiles.data.map((p) => p.user_id));
if (!profileUserIds.has(data.directionUserBySchool[SLOUIS])) {
  const now = new Date().toISOString();
  await withRetry(
    () =>
      client.from('profiles').upsert(
        {
          id: `prof-${data.directionUserBySchool[SLOUIS]}`,
          user_id: data.directionUserBySchool[SLOUIS],
          school_id: SLOUIS,
          first_name: 'Direction',
          last_name: 'SAINT LOUIS',
          created_at: now,
          updated_at: now,
        },
        { onConflict: 'id' }
      ),
    'profiles direction SLOUIS'
  );
}

console.log('== Annees scolaires ==');
const SCHOOL_IDS = data.schools.map((s) => s.id);
const YEAR_IDS = data.academicYears.map((y) => y.id);
const LICENSE_SCHOOL_IDS = [...new Set(data.licenses.map((l) => l.school_id))];

console.log('== Nettoyage des donnees metier ==');
const DELETE_ORDER = [
  ['grades', 'school_id'],
  ['payments', 'school_id'],
  ['enrollment_history', 'academic_year_id'],
  ['teacher_assignments', 'school_id'],
  ['class_subjects', 'school_id'],
  ['enrollments', 'school_id'],
  ['students', 'school_id'],
  ['classes', 'school_id'],
  ['grading_periods', 'school_id'],
  ['fee_structures', 'school_id'],
  ['subjects', 'school_id'],
  ['grade_types', 'school_id'],
  ['series', 'school_id'],
  ['levels', 'school_id'],
  ['sections', 'school_id'],
  ['staff', 'school_id'],
  ['academic_years', 'school_id'],
  ['devices', 'school_id'],
];
for (const [table, col] of DELETE_ORDER) {
  const values = col === 'academic_year_id' ? YEAR_IDS : SCHOOL_IDS;
  const res = await withRetry(
    () => client.from(table).delete({ count: 'exact' }).in(col, values),
    `delete ${table}`
  );
  console.log(`  delete ${table}: ${res?.count ?? '?'}`);
}
{
  const res = await withRetry(
    () => client.from('licenses').delete({ count: 'exact' }).in('school_id', LICENSE_SCHOOL_IDS),
    'delete licenses'
  );
  console.log(`  delete licenses: ${res?.count ?? '?'}`);
}

console.log('== Annees + donnees metier (3 etablissements) ==');
await upsertTable('academic_years', data.academicYears, { nullableUserRefs: ['created_by'] });
await upsertTable('sections', data.sections);
await upsertTable('levels', data.levels);
await upsertTable('series', data.series);
await upsertTable('subjects', data.subjects);
await upsertTable('grade_types', data.gradeTypes);
await upsertTable('grading_periods', data.gradingPeriods);
await upsertTable('staff', data.staff, { nullableUserRefs: ['created_by'] });
await upsertTable('classes', data.classes);
await upsertTable('students', data.students);
await upsertTable('enrollments', data.enrollments);
await upsertTable('class_subjects', data.classSubjects);
await upsertTable('teacher_assignments', data.teacherAssignments);
await upsertTable('enrollment_history', data.enrollmentHistory, { nullableUserRefs: ['changed_by'] });
await upsertTable('grades', data.grades, { nullableUserRefs: ['recorded_by'] });
await upsertTable('fee_structures', data.feeStructures);
await upsertTable('payments', data.payments, { nullableUserRefs: ['recorded_by'] });
await upsertTable('devices', data.devices);
await upsertTable('licenses', data.licenses);

console.log('== Rattachement comptes <-> personnel ==');
const staffIdProbe = await client.from('profiles').select('staff_id').limit(1);
if (staffIdProbe.error) {
  console.warn(
    '  colonne profiles.staff_id absente : rattachement cloud ignoré.' +
      ' Appliquez supabase/migrations/20261023000000_link_profiles_staff.sql puis relancez.'
  );
} else {
  for (const account of newAccounts) {
    if (!account.staff_id) continue;
    const { error } = await client
      .from('profiles')
      .update({ staff_id: account.staff_id, updated_at: new Date().toISOString() })
      .eq('user_id', account.uid)
      .eq('school_id', account.schoolId);
    if (error) errors.push(`profil ${account.email} -> staff: ${error.message}`);
  }
  for (const [schoolId, staffId] of Object.entries(data.headStaffBySchool)) {
    if (!staffId) continue;
    const userIds = new Set();
    if (data.directionUserBySchool[schoolId]) userIds.add(data.directionUserBySchool[schoolId]);
    for (const a of newAccounts) {
      if (a.schoolId === schoolId && a.role === 'DIRECTION') userIds.add(a.uid);
    }
    if (!userIds.size) continue;
    const { error } = await client
      .from('profiles')
      .update({ staff_id: staffId, updated_at: new Date().toISOString() })
      .eq('school_id', schoolId)
      .in('user_id', [...userIds]);
    if (error) errors.push(`profil direction ${schoolId} -> staff: ${error.message}`);
  }
}

{
  const { error: licErr } = await client
    .from('licenses')
    .update({ status: 'ACTIVE', max_devices: 5, expires_at: FUTURE_LICENSE_EXPIRY, updated_at: new Date().toISOString() })
    .eq('id', SLOUIS_LICENSE);
  if (licErr) errors.push(`licence SLOUIS: ${licErr.message}`);

  console.log('\n== Verification ==');
  const expected = [
    ['schools', 3],
    ['academic_years', 3],
    ['licenses', 4],
    ['devices', 7],
    ['sections', data.sections.length],
    ['levels', data.levels.length],
    ['series', data.series.length],
    ['subjects', data.subjects.length],
    ['grade_types', data.gradeTypes.length],
    ['grading_periods', data.gradingPeriods.length],
    ['staff', data.staff.length],
    ['classes', data.classes.length],
    ['students', data.students.length],
    ['enrollments', data.enrollments.length],
    ['enrollment_history', data.enrollmentHistory.length],
    ['class_subjects', data.classSubjects.length],
    ['teacher_assignments', data.teacherAssignments.length],
    ['grades', data.grades.length],
    ['fee_structures', data.feeStructures.length],
    ['payments', data.payments.length],
    ['users', 9],
    ['profiles', 9],
    ['user_roles', 9],
  ];
  for (const [table, exp] of expected) {
    const n = await countOf(table);
    const ok = n === exp;
    console.log(`  ${table}: ${n} (attendu ${exp}) ${ok ? 'OK' : 'ECART'}`);
    if (!ok) errors.push(`${table}: ${n} vs ${exp}`);
  }

  const stale = await client
    .from('grades')
    .select('id', { count: 'exact', head: true })
    .gte('updated_at', SYNC_CURSOR);
  console.log(`  grades avec updated_at >= curseur : ${stale.count}`);
  if (stale.count) errors.push(`${stale.count} grades viennent le curseur sync`);

  console.log('\n  max updated_at (pull tables):');
  const PULL = [
    ['academic_years', 'updated_at'],
    ['classes', 'updated_at'],
    ['students', 'updated_at'],
    ['enrollments', 'updated_at'],
    ['enrollment_history', 'changed_at'],
    ['fee_structures', 'updated_at'],
    ['payments', 'updated_at'],
  ];
  for (const [t, c] of PULL) {
    const { data } = await client.from(t).select(c).order(c, { ascending: false }).limit(1);
    const v = data?.[0]?.[c] ?? 'NULL';
    console.log(`    ${t}: ${v}`);
    if (c === 'updated_at' && v >= SYNC_CURSOR) errors.push(`${t}.${c} >= curseur (${v})`);
    if (c === 'changed_at' && v >= SYNC_CURSOR) errors.push(`${t}.${c} >= curseur (${v})`);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nDuree : ${elapsed}s`);

if (errors.length) {
  console.error('\nPROBLEMES :');
  for (const e of errors) console.error('  - ' + e);
  process.exit(2);
}
console.log('\nSeed cloud terminee avec succes.');
console.log('\nComptes crees :');
console.log(report.join('\n'));
