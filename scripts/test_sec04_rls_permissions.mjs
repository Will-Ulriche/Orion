/**
 * scripts/test_sec04_rls_permissions.mjs
 *
 * Suite de vérification de sécurité ORI-SEC-04
 * Vulnérabilités confirmées avant correction :
 *
 *   A. Anon : fee_structures (33 lignes) et payments (3 478 lignes) publiquement lisibles
 *   B. Cross-school : Agora DIRECTION lit ET modifie les données de Saint-Louis
 *   C. Escalade de rôle : PROFESSEUR/SECRETAIRE peuvent modifier les tables financières
 *
 * Ce script vérifie que la migration 20261030000000_sec04_restrict_financial_rls.sql
 * corrige les trois vulnérabilités sans casser l'accès légitime du COMPTABLE et de DIRECTION.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// ── Lecture du fichier .env ──────────────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const supabaseUrl = env['VITE_SUPABASE_URL'];
const anonKey    = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !anonKey) {
  console.error('Variables Supabase introuvables dans .env');
  process.exit(1);
}

const baseClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

// ── Statistiques ─────────────────────────────────────────────────────────────
let totalTests  = 0;
let passedTests = 0;
const failures  = [];

function assert(condition, message, detail = '') {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}${detail ? '  →  ' + detail : ''}`);
    failures.push(message);
  }
}

async function signIn(email, password) {
  const { data, error } = await baseClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Authentification échouée (${email}): ${error?.message}`);
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }
  });
}

// ── IDs de référence ─────────────────────────────────────────────────────────
const SAINT_LOUIS_ID = '2930e1ad-570f-491f-9821-3d831487e754';
const AGORA_ID       = '8b931fe2-2780-4396-a10b-638a55a61a67';

// ── Suite de tests ────────────────────────────────────────────────────────────
async function runAudit() {
  console.log('=== VÉRIFICATION ORI-SEC-04 : RLS — TABLES FINANCIÈRES ===\n');
  console.log(`Cible : ${supabaseUrl}\n`);

  // ── Initialisation des clients ────────────────────────────────────────────
  const profClient    = await signIn('kossi.agbo@saintlouis-tg.com',          env['SEED_PW_SAINT_LOUIS_PROF_KOSSI']);
  const secClient     = await signIn('secretaire.saintlouis@saintlouis-tg.com', env['SEED_PW_SAINT_LOUIS_SECRETARY']);
  const comptClient   = await signIn('comptable.saintlouis@saintlouis-tg.com',  env['SEED_PW_SAINT_LOUIS_COMPTABLE']);
  const agoraClient   = await signIn('direction@agora-lome.tg',                env['SEED_PW_AGORA_DIRECTION']);

  // ══════════════════════════════════════════════════════════════════════════
  // BLOC A : Accès non authentifié (anon)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('--- A. ACCÈS NON AUTHENTIFIÉ (anon) ---');

  const { data: anonFee } = await baseClient.from('fee_structures').select('*').limit(1);
  assert(!anonFee || anonFee.length === 0, 'Anon bloqué en lecture sur fee_structures (SELECT)');

  const { data: anonPay } = await baseClient.from('payments').select('*').limit(1);
  assert(!anonPay || anonPay.length === 0, 'Anon bloqué en lecture sur payments (SELECT)');

  const { error: anonIns } = await baseClient.from('payments').insert({
    id: '00000000-0000-0000-0000-aaaaaaaaaaaa',
    school_id: SAINT_LOUIS_ID, amount: 1000
  });
  assert(anonIns !== null, 'Anon bloqué en écriture sur payments (INSERT)');

  // ══════════════════════════════════════════════════════════════════════════
  // BLOC B : Isolation inter-établissement (cross-school)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- B. ISOLATION INTER-ÉTABLISSEMENT (Agora → Saint-Louis) ---');

  // Agora DIRECTION ne peut pas lire les données de Saint-Louis
  const { data: crossFee } = await agoraClient.from('fee_structures').select('id, school_id').eq('school_id', SAINT_LOUIS_ID);
  assert(!crossFee || crossFee.length === 0, 'Agora DIRECTION bloqué en lecture sur fee_structures de Saint-Louis', `lignes visibles : ${crossFee?.length}`);

  const { data: crossPay } = await agoraClient.from('payments').select('id, school_id').eq('school_id', SAINT_LOUIS_ID);
  assert(!crossPay || crossPay.length === 0, 'Agora DIRECTION bloqué en lecture sur payments de Saint-Louis', `lignes visibles : ${crossPay?.length}`);

  // Agora DIRECTION ne peut pas modifier les données de Saint-Louis
  const { data: slFees } = await comptClient.from('fee_structures').select('id, amount').limit(1);
  if (slFees && slFees[0]) {
    const { data: crossUpd } = await agoraClient.from('fee_structures').update({ amount: slFees[0].amount }).eq('id', slFees[0].id).select();
    assert(!crossUpd || crossUpd.length === 0, 'Agora DIRECTION bloqué en UPDATE sur fee_structures de Saint-Louis', `lignes modifiées : ${crossUpd?.length}`);
  }

  // Agora DIRECTION ne peut pas insérer dans Saint-Louis
  const { error: crossIns } = await agoraClient.from('fee_structures').insert({
    id: '12345678-1234-1234-1234-123456789abc',
    school_id: SAINT_LOUIS_ID,
    academic_year_id: '44265ea9-ec36-47b8-b4b6-444f6f437021',
    name: 'Hack cross-school',
    amount: 9999,
    fee_type: 'MENSUALITE',
    applies_to: 'ALL'
  });
  assert(crossIns !== null, 'Agora DIRECTION bloqué en INSERT dans fee_structures de Saint-Louis');

  // ══════════════════════════════════════════════════════════════════════════
  // BLOC C : Escalade de rôle — PROFESSEUR et SECRETAIRE bloqués
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- C. ESCALADE DE RÔLE (PROFESSEUR et SECRETAIRE) ---');

  // PROFESSEUR ne peut pas voir les données financières
  const { data: profFee } = await profClient.from('fee_structures').select('id').limit(1);
  assert(!profFee || profFee.length === 0, 'PROFESSEUR bloqué en SELECT sur fee_structures', `lignes visibles : ${profFee?.length}`);

  const { data: profPay } = await profClient.from('payments').select('id').limit(1);
  assert(!profPay || profPay.length === 0, 'PROFESSEUR bloqué en SELECT sur payments', `lignes visibles : ${profPay?.length}`);

  // PROFESSEUR ne peut pas modifier les données financières
  if (slFees && slFees[0]) {
    const { data: profUpd } = await profClient.from('fee_structures').update({ amount: slFees[0].amount }).eq('id', slFees[0].id).select();
    assert(!profUpd || profUpd.length === 0, 'PROFESSEUR bloqué en UPDATE sur fee_structures', `lignes modifiées : ${profUpd?.length}`);
  }

  // SECRETAIRE ne peut pas modifier les données financières
  if (slFees && slFees[0]) {
    const { data: secUpd } = await secClient.from('fee_structures').update({ amount: slFees[0].amount }).eq('id', slFees[0].id).select();
    assert(!secUpd || secUpd.length === 0, 'SECRETAIRE bloqué en UPDATE sur fee_structures', `lignes modifiées : ${secUpd?.length}`);
  }

  // SECRETAIRE ne peut pas voir les paiements
  const { data: secPay } = await secClient.from('payments').select('id').limit(1);
  assert(!secPay || secPay.length === 0, 'SECRETAIRE bloqué en SELECT sur payments', `lignes visibles : ${secPay?.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // BLOC D : Accès autorisé — COMPTABLE et DIRECTION de Saint-Louis
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- D. ACCÈS AUTORISÉ (COMPTABLE Saint-Louis) ---');

  // SELECT
  const { data: feeList } = await comptClient.from('fee_structures').select('*').limit(1);
  assert(feeList && feeList.length > 0, 'COMPTABLE peut lire fee_structures de son école (SELECT)', `lignes : ${feeList?.length}`);

  // INSERT + UPDATE + DELETE sur un enregistrement de test
  const TEST_FEE_ID = '88888888-8888-8888-8888-888888888888';
  if (feeList && feeList[0]) {
    const sample = feeList[0];

    const { status: insStatus, data: insData } = await comptClient.from('fee_structures').insert({
      ...sample,
      id: TEST_FEE_ID,
      name: 'Sec04 Audit Fee — Test'
    }).select();
    assert(insStatus === 201 && insData?.length === 1, 'COMPTABLE peut insérer une grille tarifaire (INSERT)');

    const { data: updData } = await comptClient.from('fee_structures').update({ amount: 77777 }).eq('id', TEST_FEE_ID).select();
    assert(updData && updData[0]?.amount === 77777, 'COMPTABLE peut modifier une grille tarifaire (UPDATE)');

    const { data: delData } = await comptClient.from('fee_structures').delete().eq('id', TEST_FEE_ID).select();
    assert(delData && delData.length === 1, 'COMPTABLE peut supprimer une grille tarifaire (DELETE)');
  }

  // Paiements
  const { data: payList } = await comptClient.from('payments').select('*').limit(1);
  assert(payList && payList.length > 0, 'COMPTABLE peut lire payments de son école (SELECT)', `lignes : ${payList?.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // Résultat final
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  RÉSULTAT : ${passedTests} / ${totalTests} tests réussis`);
  console.log(`║  STATUT   : ${failures.length === 0 ? '✅  Toutes les politiques sont correctes.' : '❌  Des vulnérabilités persistent.'}`);
  if (failures.length > 0) {
    console.log('║  ÉCHECS   :');
    failures.forEach(f => console.log(`║    - ${f}`));
  }
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  process.exit(failures.length > 0 ? 1 : 0);
}

runAudit().catch(err => {
  console.error('Erreur inattendue :', err.message);
  process.exit(1);
});
