import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyLocal = args.includes('--local');
const onlyCloud = args.includes('--cloud');
const runLocal = onlyLocal || !onlyCloud;
const runCloud = onlyCloud || !onlyLocal;

const passthrough = dryRun ? ['--dry-run'] : [];

function run(label, script, extraEnv = {}) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(
    process.execPath,
    ['--env-file=.env', path.join(here, script), ...passthrough],
    { stdio: 'inherit', cwd: path.join(here, '..', '..'), env: { ...process.env, ...extraEnv } }
  );
  if (res.error) {
    console.error(`${label} : ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`${label} : echec (code ${res.status})`);
    process.exit(res.status ?? 1);
  }
  console.log(`${label} : OK`);
}

if (runLocal) run('Seed local (SAINT LOUIS)', 'local.mjs');
if (runCloud) run('Seed cloud (SLOUIS + AGORA + NDL)', 'cloud.mjs');

console.log('\nSeed termine.');
