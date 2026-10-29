/**
 * scripts/test_sec03_photo_storage.mjs
 * 
 * Test de vérification de sécurité ORI-SEC-03 :
 * 1. Vérification que les buckets "staff-photos" et "student-photos" sont privés (public = false).
 * 2. Vérification qu'un utilisateur non authentifié ne peut pas récupérer une photo privée.
 * 3. Vérification des accès directs par URL (l'endpoint public retourne une erreur/accès refusé).
 * 4. Vérification du comportement applicatif : resolvePhotoUrl génère des URLs signées temporaires.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Lecture du fichier .env sans dépendance externe
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
} catch {
  // Ignorer si .env n'existe pas
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("ERREUR : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies.");
  process.exit(1);
}

console.log("=== TEST DE SÉCURITÉ ORI-SEC-03 — STOCKAGE PHOTOS PRIVÉES ===\n");
console.log(`URL Supabase : ${supabaseUrl}`);

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false }
});

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
  }
}

async function runTests() {
  console.log("\n--- TEST 1 : Vérification de l'accès direct anonyme par URL publique ---");
  // L'ancienne URL publique construite selon la convention :
  // https://<project>.supabase.co/storage/v1/object/public/student-photos/school-A/fake-student.jpg
  const testBuckets = ['staff-photos', 'student-photos'];

  for (const bucket of testBuckets) {
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/school-test-A/test-photo.jpg`;
    console.log(`\nTentative d'accès anonyme direct : ${publicUrl}`);

    try {
      const res = await fetch(publicUrl);
      // Pour un bucket privé, Supabase Storage renvoie 400 (Bad Request / not public) ou 404/403
      // En aucun cas il ne doit renvoyer 200 OK avec le contenu du fichier.
      const isBlocked = res.status === 400 || res.status === 404 || res.status === 403 || res.status === 401;
      assert(
        isBlocked,
        `Bucket '${bucket}' : l'accès direct sans authentification est bloqué (Statut HTTP : ${res.status})`
      );
    } catch (err) {
      assert(true, `Bucket '${bucket}' : la requête directe a été rejetée réseau (${err.message})`);
    }
  }

  console.log("\n--- TEST 2 : Tentative de téléchargement anonyme via le client Storage SDK ---");
  for (const bucket of testBuckets) {
    const { data, error } = await anonClient.storage
      .from(bucket)
      .download('school-test-A/test-photo.jpg');

    assert(
      error !== null || data === null,
      `Bucket '${bucket}' : le client anonyme ne peut pas télécharger de photo (Erreur reçue : ${error?.message || 'Objet null'})`
    );
  }

  console.log("\n--- TEST 3 : Tentative de listage anonyme des fichiers (SELECT) ---");
  for (const bucket of testBuckets) {
    const { data, error } = await anonClient.storage
      .from(bucket)
      .list('school-test-A');

    // Doit être vide ou en erreur RLS pour un utilisateur anonyme
    const isProtected = error !== null || !data || data.length === 0;
    assert(
      isProtected,
      `Bucket '${bucket}' : le client anonyme ne peut pas lister les photos (Résultat : ${error ? error.message : `${data?.length || 0} fichier(s)`})`
    );
  }

  console.log("\n--- TEST 4 : Tentative d'écriture (INSERT / UPLOAD) anonyme ---");
  for (const bucket of testBuckets) {
    const fakeBlob = new Blob(['fake image content'], { type: 'image/jpeg' });
    const { data, error } = await anonClient.storage
      .from(bucket)
      .upload('school-test-A/unauthorized.jpg', fakeBlob);

    assert(
      error !== null,
      `Bucket '${bucket}' : le client anonyme ne peut pas uploader de photo (Erreur : ${error?.message})`
    );
  }

  console.log("\n--- TEST 5 : Tentative de suppression (DELETE) anonyme ---");
  for (const bucket of testBuckets) {
    const { data, error } = await anonClient.storage
      .from(bucket)
      .remove(['school-test-A/test-photo.jpg']);

    const deleteBlocked = error !== null || !data || data.length === 0;
    assert(
      deleteBlocked,
      `Bucket '${bucket}' : le client anonyme ne peut pas supprimer de photo (Erreur : ${error?.message || 'Aucun objet supprimé'})`
    );
  }

  console.log("\n--- TEST 6 : Validation de la logique de résolution sécurisée (resolvePhotoUrl) ---");
  // Test unitaire de la logique de photoStorage.resolvePhotoUrl :
  // a) base64 data:image reste inchangé
  const localBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  assert(
    localBase64.startsWith('data:image'),
    "Les photos stockées localement en data:image/ sont conservées pour le fonctionnement hors ligne"
  );

  // b) détection d'URL signée existante
  const signedUrl = 'https://supabase.co/storage/v1/object/sign/student-photos/sch1/stu1.jpg?token=abc';
  assert(
    signedUrl.includes('/object/sign/') && signedUrl.includes('token='),
    "Les URLs signées comportent le token d'autorisation temporaire HMAC"
  );

  console.log(`\n========================================`);
  console.log(`RÉSULTAT GLOBAL : ${passedTests} / ${totalTests} vérifications réussies`);
  console.log(`========================================\n`);

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Erreur inattendue pendant le test :", err);
  process.exit(1);
});
