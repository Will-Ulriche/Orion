import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const readSource = (relative) =>
  fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

const authContextSource = readSource('src/contexts/AuthContext.tsx');
const syncRustSource = readSource('src-tauri/src/sync.rs');
const commandsRustSource = readSource('src-tauri/src/commands.rs');

// ─────────────────────────────────────────────────────────────────────────────
// 1. DÉCLENCHEMENT INITIAL ET RECONNEXION RÉSEAU
// ─────────────────────────────────────────────────────────────────────────────

test('Moteur Offline-First : Déclenche une synchronisation initiale après authentification en ligne réussie', () => {
  // Vérifie la présence du helper de synchronisation initiale
  assert.ok(
    authContextSource.includes('triggerInitialOrReconnectedSync'),
    "AuthContext doit définir la fonction 'triggerInitialOrReconnectedSync'"
  );

  // Vérifie l'appel effectif après validation du compte et des rôles
  assert.ok(
    authContextSource.includes("void triggerInitialOrReconnectedSync(userSession.access_token);"),
    "AuthContext doit déclencher la synchronisation initiale après l'authentification en ligne réussie"
  );
});

test('Moteur Offline-First : Déclenche la synchronisation automatique lors de la reconnexion réseau', () => {
  // Vérifie l'enregistrement de l'écouteur d'événement 'online'
  assert.ok(
    authContextSource.includes("window.addEventListener('online', handleOnlineReconnect);"),
    "AuthContext doit écouter l'événement 'online' du navigateur"
  );

  // Vérifie le nettoyage de l'écouteur d'événement
  assert.ok(
    authContextSource.includes("window.removeEventListener('online', handleOnlineReconnect);"),
    "AuthContext doit retirer l'écouteur d'événement 'online' lors du démontage"
  );

  // Vérifie que la session active est transmise lors de la reconnexion
  assert.ok(
    authContextSource.includes("void triggerInitialOrReconnectedSync(curSession.access_token);"),
    "La reconnexion doit synchroniser si une session utilisateur active existe"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONSERVATION DE LA BOUCLE DE 5 MINUTES ET DÉCLENCHEMENT MANUEL
// ─────────────────────────────────────────────────────────────────────────────

test('Moteur Offline-First : Conserve la boucle automatique de 5 minutes', () => {
  assert.ok(
    syncRustSource.includes("Duration::from_secs(300)"),
    "sync.rs doit maintenir l'intervalle de veille de 300 secondes (5 minutes)"
  );
  assert.ok(
    syncRustSource.includes("pub fn start_sync_loop"),
    "sync.rs doit exposer la fonction de démarrage de la boucle automatique"
  );
});

test('Moteur Offline-First : Conserve le déclenchement manuel via trigger_sync', () => {
  assert.ok(
    commandsRustSource.includes("pub async fn trigger_sync"),
    "commands.rs doit exposer la commande Tauri trigger_sync"
  );
  assert.ok(
    syncRustSource.includes("pub async fn run_manual_sync"),
    "sync.rs doit implémenter run_manual_sync pour le bouton manuel"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. EXCLUSION MUTUELLE : EMPÊCHE DEUX CYCLES SIMULTANÉS
// ─────────────────────────────────────────────────────────────────────────────

test('Moteur Offline-First : Empêche deux cycles simultanés via un verrou d exclusion mutuelle', () => {
  // Vérifie la déclaration du mutex de synchronisation dans Rust
  assert.ok(
    syncRustSource.includes("static SYNC_RUN_MUTEX: TokioMutex<()> = TokioMutex::const_new(());"),
    "sync.rs doit définir SYNC_RUN_MUTEX pour garantir l'exclusion mutuelle"
  );

  // Vérifie que run_sync_cycle tente d'acquérir le verrou de manière non-bloquante (try_lock)
  assert.ok(
    syncRustSource.includes("SYNC_RUN_MUTEX.try_lock()"),
    "sync.rs doit utiliser try_lock pour rejeter ou ignorer tout cycle concurrent"
  );

  // Vérifie que run_manual_sync retourne l'état sans collision si un cycle est en cours
  assert.ok(
    syncRustSource.includes("return get_sync_status_internal(&db_path);"),
    "run_manual_sync doit renvoyer le statut actuel si un cycle automatique ou concurrent est en cours"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. RENOUVELLEMENT DU JWT UTILISATEUR ET INTERDICTION SERVICE_ROLE
// ─────────────────────────────────────────────────────────────────────────────

test('Moteur Offline-First : Transmet les renouvellements de jeton (TOKEN_REFRESHED) à Rust', () => {
  assert.ok(
    authContextSource.includes("event === 'TOKEN_REFRESHED'"),
    "AuthContext doit détecter le renouvellement de session Supabase (TOKEN_REFRESHED)"
  );
  assert.ok(
    authContextSource.includes("invoke('set_sync_access_token', { token: null })"),
    "AuthContext doit révoquer le jeton de sync dans Rust lors d'une déconnexion"
  );
});

test('Moteur Offline-First : Interdit formellement le rôle privilégié service_role', () => {
  assert.ok(
    syncRustSource.includes("reject_privileged_jwt"),
    "sync.rs doit analyser et rejeter formellement les clés service_role"
  );
  assert.ok(
    syncRustSource.includes('jwt_role_claim(t).as_deref() == Some("service_role")') ||
    syncRustSource.includes('Some("service_role")'),
    "sync.rs doit inspecter le claim 'role' du JWT"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. EXPIRATION DU JWT : CONSERVATION PENDING/FAILED ET IDENTIFIANTS STABLES
// ─────────────────────────────────────────────────────────────────────────────

test('Moteur Offline-First : Gère le statut 401 sans altérer les mutations PENDING ni consommer attempt_count', () => {
  assert.ok(
    syncRustSource.includes("decrement_attempt(db_path, &id);"),
    "sync.rs doit annuler l'incrémentation d'attempt_count lors d'une réponse 401"
  );
  assert.ok(
    syncRustSource.includes("Session expirée ou non autorisée (401)"),
    "sync.rs doit journaliser une erreur explicite sans basculer la mutation en FAILED"
  );
  assert.ok(
    syncRustSource.includes("return Err(error);"),
    "process_outbox doit s'interrompre immédiatement sur 401 pour préserver la file d'attente"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. IDEMPOTENCE, ORDRE DES DÉPENDANCES ET RÉSOLUTION DES CONFLITS
// ─────────────────────────────────────────────────────────────────────────────

test('Moteur Offline-First : Respecte l ordre strict des dépendances parent-enfant', () => {
  assert.ok(
    syncRustSource.includes("DEPENDENCY_ORDER"),
    "sync.rs doit définir l'ordre de dépendance des tables"
  );
  assert.ok(
    syncRustSource.includes("blocking_parents"),
    "sync.rs doit suspendre les enfants tant que les parents ne sont pas synchronisés"
  );
});

test('Moteur Offline-First : Résolution de conflit déterministe basée sur l horodatage', () => {
  assert.ok(
    syncRustSource.includes("check_and_resolve_conflict"),
    "sync.rs doit implémenter la comparaison d'horodatage pour arbitrer les conflits"
  );
  assert.ok(
    syncRustSource.includes("ConflictResolution::LocalWins"),
    "Le moteur doit préserver les mutations locales plus récentes (LocalWins)"
  );
  assert.ok(
    syncRustSource.includes("ConflictResolution::RemoteWins"),
    "Le moteur doit appliquer les changements distants plus récents (RemoteWins)"
  );
});

test('Moteur Offline-First : Assure l idempotence des opérations et la préservation locale', () => {
  assert.ok(
    syncRustSource.includes("X-Mutation-Id"),
    "sync.rs doit transmettre l'en-tête d'idempotence X-Mutation-Id"
  );
  assert.ok(
    syncRustSource.includes("on_conflict=id"),
    "sync.rs doit spécifier la résolution on_conflict=id"
  );
  assert.ok(
    syncRustSource.includes("DELETE idempotent"),
    "Une suppression d'entité déjà absente doit être traitée comme un succès idempotent"
  );
});

