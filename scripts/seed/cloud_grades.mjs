import { createClient } from '@supabase/supabase-js';
import { generateDataset } from './generate.mjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Variables manquantes : VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const SYNC_CURSOR = '2026-10-16T16:13:43Z';
const BATCH_SIZE = Number(process.env.GRADES_BATCH || 500);

const client = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const data = generateDataset();
const SCHOOL_IDS = data.schools.map((s) => s.id);

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

async function withRetry(fn, label) {
  let last;
  for (let i = 0; i < 6; i++) {
    const { data: res, error } = await fn();
    if (!error) return res;
    last = error;
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error(`${label} : ${last.message || last}`);
}

const t0 = Date.now();

log('Resolution des utilisateurs DIRECTION par ecole...');
const { data: roleRows, error: roleErr } = await client
  .from('roles')
  .select('id, name')
  .eq('name', 'DIRECTION');
if (roleErr) throw new Error(`roles : ${roleErr.message}`);
const directionRoleIds = roleRows.map((r) => r.id);

const { data: urRows, error: urErr } = await client
  .from('user_roles')
  .select('user_id, school_id, role_id')
  .in('school_id', SCHOOL_IDS)
  .in('role_id', directionRoleIds);
if (urErr) throw new Error(`user_roles : ${urErr.message}`);
const directionBySchool = {};
for (const row of urRows) directionBySchool[row.school_id] = row.user_id;
for (const sid of SCHOOL_IDS) {
  if (!directionBySchool[sid]) throw new Error(`Aucun utilisateur DIRECTION pour ${sid}`);
}
log(`  ${Object.keys(directionBySchool).length} direction(s) resolue(s)`);

log('Suppression des notes existantes...');
const del = await withRetry(
  () => client.from('grades').delete({ count: 'exact' }).in('school_id', SCHOOL_IDS),
  'delete grades'
);
log(`  supprimees : ${del?.count ?? '?'}`);

const prepared = data.grades.map((r) => ({
  ...r,
  recorded_by: r.recorded_by ?? directionBySchool[r.school_id],
}));
for (const g of prepared) {
  if (g.updated_at && g.updated_at >= SYNC_CURSOR) {
    log(`Date invalide pour ${g.id} : ${g.updated_at}`);
    process.exit(1);
  }
}

let count = 0;
for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
  const batch = prepared.slice(i, i + BATCH_SIZE);
  await withRetry(
    () => client.from('grades').insert(batch),
    `insert grades lot ${i / BATCH_SIZE + 1}`
  );
  count += batch.length;
  log(`  grades: ${count}/${prepared.length}`);
}

const { count: total, error: cntErr } = await client
  .from('grades')
  .select('id', { count: 'exact', head: true });
if (cntErr) throw new Error(cntErr.message);

const stale = await client
  .from('grades')
  .select('id', { count: 'exact', head: true })
  .gte('updated_at', SYNC_CURSOR);

log(`count final : ${total} (attendu ${prepared.length})`);
log(`avec updated_at >= curseur : ${stale.count}`);
log(`duree : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (total !== prepared.length) process.exit(2);
log('GRADES OK');
