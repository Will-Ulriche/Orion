import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canAccessRoute, hasAnyRole, normalizeRoles } from './rbac.ts';

const rlsFix = readFileSync(
  new URL('../../supabase/migrations/20261121130000_rbac_scope_no_implicit_super_admin.sql', import.meta.url),
  'utf8',
);
const authGuardSource = readFileSync(
  new URL('../../src-tauri/src/auth_guard.rs', import.meta.url),
  'utf8',
);
const commandsSource = readFileSync(
  new URL('../../src-tauri/src/commands.rs', import.meta.url),
  'utf8',
);
const pedagogieSource = readFileSync(
  new URL('../../src/pages/Pedagogie.tsx', import.meta.url),
  'utf8',
);

test('les rôles sont normalisés sans doublon', () => {
  assert.deepEqual(normalizeRoles([' direction ', 'professeur', 'DIRECTION', '', null]), [
    'DIRECTION',
    'PROFESSEUR',
  ]);
});

test('la Direction accède au récap des notes, la Secrétaire non', () => {
  assert.equal(canAccessRoute(['DIRECTION'], '/recap-notes'), true);
  assert.equal(canAccessRoute(['PROFESSEUR'], '/recap-notes'), true);
  assert.equal(canAccessRoute(['DIRECTION', 'PROFESSEUR'], '/recap-notes'), true);
  assert.equal(canAccessRoute(['SECRETAIRE'], '/recap-notes'), false);
  assert.equal(canAccessRoute(['COMPTABLE'], '/recap-notes'), false);
});

test('le SUPER_ADMIN reste confiné à son espace plateforme', () => {
  assert.equal(canAccessRoute(['SUPER_ADMIN'], '/super-admin'), true);
  assert.equal(canAccessRoute(['SUPER_ADMIN'], '/super-admin/comptes'), true);
  assert.equal(canAccessRoute(['SUPER_ADMIN'], '/pedagogie'), false);
  assert.equal(canAccessRoute(['SUPER_ADMIN'], '/recap-notes'), false);
  assert.equal(canAccessRoute(['SUPER_ADMIN'], '/finances'), false);
  assert.equal(canAccessRoute(['SUPER_ADMIN'], '/students'), false);
});

test('la Secrétaire conserve ses routes sans hériter du Professeur', () => {
  assert.equal(canAccessRoute(['SECRETAIRE'], '/students'), true);
  assert.equal(canAccessRoute(['SECRETAIRE'], '/classes'), true);
  assert.equal(canAccessRoute(['SECRETAIRE'], '/bibliotheque'), true);
  assert.equal(canAccessRoute(['SECRETAIRE'], '/pedagogie'), true);
  assert.equal(canAccessRoute(['SECRETAIRE'], '/recap-notes'), false);
  assert.equal(canAccessRoute(['SECRETAIRE'], '/finances'), false);
});

test('le Comptable accède aux élèves et finances uniquement', () => {
  assert.equal(canAccessRoute(['COMPTABLE'], '/students'), true);
  assert.equal(canAccessRoute(['COMPTABLE'], '/finances'), true);
  assert.equal(canAccessRoute(['COMPTABLE'], '/classes'), false);
  assert.equal(canAccessRoute(['COMPTABLE'], '/pedagogie'), false);
  assert.equal(canAccessRoute(['COMPTABLE'], '/recap-notes'), false);
});

test('le Professeur accède à la pédagogie et à son récap', () => {
  assert.equal(canAccessRoute(['PROFESSEUR'], '/pedagogie'), true);
  assert.equal(canAccessRoute(['PROFESSEUR'], '/recap-notes'), true);
  assert.equal(canAccessRoute(['PROFESSEUR'], '/classes'), false);
  assert.equal(canAccessRoute(['PROFESSEUR'], '/personnel'), false);
});

test('les routes inconnues et les rôles vides sont refusés', () => {
  assert.equal(canAccessRoute(['DIRECTION'], '/route-inconnue'), false);
  assert.equal(canAccessRoute([], '/pedagogie'), false);
  assert.equal(canAccessRoute(['DIRECTION'], '/'), true);
  assert.equal(canAccessRoute([], '/account'), true);
  assert.equal(hasAnyRole(['direction'], ['DIRECTION']), true);
});

test("la RLS n'accorde pas de droits d'établissement implicites au SUPER_ADMIN", () => {
  assert.equal(rlsFix.includes('SELECT public.is_super_admin()'), false);
  assert.equal(rlsFix.includes('public.is_super_admin() OR'), false);
  assert.equal(rlsFix.includes("ARRAY['DIRECTION','SECRETAIRE','PROFESSEUR']::text[]"), false);
  assert.match(rlsFix, /'grades',\s+NULL::text\[\],\s+ARRAY\['DIRECTION','PROFESSEUR'\]::text\[\]/);
});

test('authorize exige explicitement le rôle SUPER_ADMIN pour un accès plateforme', () => {
  assert.match(
    authGuardSource,
    /s\.is_super_admin && roles\.iter\(\)\.any\(\|role\| \*role == "SUPER_ADMIN"\)/,
  );
  assert.equal(authGuardSource.includes('if s.is_super_admin {\n        return Ok(s);'), false);
});

test('les commands pédagogiques appliquent les rôles locaux et les deux identifiants professeur', () => {
  const recapSource = commandsSource.slice(
    commandsSource.indexOf('pub fn get_class_notes_recap('),
    commandsSource.indexOf('pub fn get_teacher_assignments('),
  );
  assert.match(recapSource, /authorize\(&conn, &school_id, &\["DIRECTION", "PROFESSEUR"\]\)/);
  assert.equal(recapSource.includes('"SECRETAIRE"'), false);
  assert.match(commandsSource, /ta\.teacher_id=\?3 OR stf\.id=\?3/);
  assert.match(commandsSource, /requested != staff_id && requested != session\.user_id/);
});

test("la page Pedagogie n'offre ni configuration ni saisie à la Secrétaire", () => {
  assert.match(pedagogieSource, /const canConfigure = rolesLoaded && roles\.includes\('DIRECTION'\)/);
  assert.match(
    pedagogieSource,
    /const canEnterGrades = rolesLoaded && \(roles\.includes\('DIRECTION'\) \|\| roles\.includes\('PROFESSEUR'\)\)/,
  );
  assert.equal(pedagogieSource.includes('ADMIN_ROLES'), false);
});
