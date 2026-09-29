# SESSION 2 — ANNÉES SCOLAIRES & CONTEXTE DES DONNÉES

## Objectif

La Session 2 approfondit le fonctionnement métier des années scolaires et du parcours annuel des élèves.

Le périmètre validé comprend :

- création d'une nouvelle année ;
- ouverture ;
- clôture ;
- archivage ;
- changement d'année ;
- promotion ;
- redoublement ;
- transfert ;
- changement de classe ;
- historique ;
- données copiables d'une année à l'autre ;
- données qui ne doivent jamais être copiées ;
- verrouillage des années clôturées ;
- contrôle anti-mélange entre années ;
- interface du sélecteur d'année.

Cette session doit être conçue et validée avant son implémentation.

---

# 1. RÈGLE FONDAMENTALE DU MODÈLE ÉLÈVE

Un élève n'est jamais recréé chaque année.

```text
                  ÉLÈVE
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
      2024-25     2025-26    2026-27
         │          │          │
        6e A       5e A       4e A
```

L'élève est une personne unique.

C'est son inscription annuelle qui change :

```text
student
   ↓
enrollment année N
   ↓
enrollment année N+1
   ↓
enrollment année N+2
```

---

# 2. CONTEXTE DES DONNÉES

Toute donnée réellement annuelle doit respecter son contexte :

```text
school_id
+
academic_year_id
```

Le système doit empêcher notamment :

```text
❌ Note 2026-2027 liée à une inscription 2025-2026
❌ Paiement 2026-2027 rattaché à une scolarité 2025-2026
❌ Présence 2026-2027 rattachée à une classe d'une autre année
```

Toute future table métier devra être analysée selon cette règle.

---

# 3. SOCLE HÉRITÉ DE LA SESSION 1

La Session 1 a préparé :

```text
academic_years
enrollments
enrollment_history
```

`academic_years` contient notamment :

```text
id
school_id
name
start_date
end_date
status
is_current
created_at
updated_at
closed_at
created_by
```

Statuts :

```text
PLANNED
ACTIVE
CLOSED
ARCHIVED
```

Règle déjà définie :

> Un établissement ne doit avoir qu'une seule année avec `is_current = TRUE` à la fois.

`enrollments` contient notamment :

```text
id
school_id
academic_year_id
student_id
class_id
enrollment_number
enrollment_date
status
enrollment_type
previous_class_id
created_at
updated_at
```

Types prévus :

```text
NEW
RE_ENROLLMENT
PROMOTION
REPEAT
TRANSFER_IN
TRANSFER_CLASS
```

`enrollment_history` contient notamment :

```text
id
enrollment_id
student_id
academic_year_id
from_class_id
to_class_id
reason
changed_at
changed_by
```

---

# 4. CYCLE DE VIE D'UNE ANNÉE

Définir précisément :

```text
PLANNED
   ↓
ACTIVE
   ↓
CLOSED
   ↓
ARCHIVED
```

Pour chaque transition, définir :

- qui peut l'effectuer ;
- conditions nécessaires ;
- données modifiables ;
- données verrouillées ;
- audit ;
- comportement Offline ;
- synchronisation.

Ne pas inventer silencieusement une règle non validée.

---

# 5. CRÉATION D'UNE ANNÉE

Définir le processus :

```text
Créer
 ↓
Nom
 ↓
Date début
 ↓
Date fin
 ↓
PLANNED
```

Décisions à valider :

- plusieurs années futures ou non ;
- chevauchement des dates ;
- création pendant qu'une année est ACTIVE ;
- année passée ;
- droits nécessaires ;
- unicité du nom.

---

# 6. OUVERTURE

Définir :

```text
PLANNED → ACTIVE
```

Respecter :

- une seule année active par établissement ;
- contrôle des dates ;
- comportement de l'ancienne année active ;
- permissions ;
- audit.

---

# 7. ANNÉE ACTIVE ET ANNÉE SÉLECTIONNÉE

Distinguer :

### Année active

Année officiellement ouverte comme année courante de l'établissement.

### Année sélectionnée

Année actuellement consultée par l'utilisateur.

Une année historique peut être consultée sans devenir l'année active.

---

# 8. SÉLECTEUR D'ANNÉE

Prévoir une interface claire :

```text
Année scolaire
────────────────────
✓ 2026-2027  ACTIVE
  2025-2026  CLOSED
  2024-2025  ARCHIVED
────────────────────
```

Le contexte sélectionné doit être visible dans l'application.

Exemple :

```text
Tableau de bord
Établissement : École Exemple
Année : 2026-2027
```

Le changement d'année ne doit pas modifier ou déplacer silencieusement les données.

---

# 9. CLÔTURE

Définir :

```text
ACTIVE → CLOSED
```

Déterminer :

- ce qui devient non modifiable ;
- ce qui peut encore être corrigé ;
- qui peut rouvrir ;
- si la réouverture existe ;
- audit ;
- consultation des données.

---

# 10. ARCHIVAGE

Définir :

```text
CLOSED → ARCHIVED
```

L'archivage ne doit pas supprimer les données.

Une année archivée doit rester consultable selon les permissions.

Définir :

- accès ;
- recherche ;
- modification ;
- restauration éventuelle ;
- audit.

---

# 11. VERROUILLAGE

Une année `CLOSED` ou `ARCHIVED` doit être protégée selon les règles validées.

Exemple :

```text
Année 2025-2026
      ↓
CLOSED
      ↓
Modification
      ↓
REFUS
```

Le contrôle ne doit pas reposer uniquement sur l'interface.

---

# 12. PROMOTION

Exemple :

```text
2025-2026
6e A
   ↓
2026-2027
5e A
```

La promotion crée une nouvelle inscription annuelle.

Elle ne crée pas un nouvel élève.

Le type peut être :

```text
PROMOTION
```

Définir :

- promotion individuelle ;
- promotion en masse ;
- conditions ;
- classe cible ;
- historique ;
- annulation ;
- audit.

---

# 13. REDOUBLEMENT

Exemple :

```text
2025-2026
6e A
   ↓
2026-2027
6e B
```

Le même élève est conservé.

Type :

```text
REPEAT
```

Définir :

- décision ;
- validation ;
- classe cible ;
- historique ;
- individuel / masse ;
- audit.

---

# 14. TRANSFERT

### Transfert entrant

```text
Établissement extérieur
        ↓
Nouvelle inscription
```

Type :

```text
TRANSFER_IN
```

### Transfert de classe

```text
Classe A
   ↓
Classe B
```

Type :

```text
TRANSFER_CLASS
```

Définir précisément le périmètre des transferts entre établissements. Ne pas inventer une règle non validée.

---

# 15. CHANGEMENT DE CLASSE

Un changement de classe dans la même année est différent d'une promotion.

```text
2026-2027
6e A
   ↓
6e B
```

Définir :

- permissions ;
- motif ;
- date ;
- historique ;
- impact sur les données déjà saisies ;
- Offline ;
- audit.

---

# 16. HISTORIQUE

L'historique doit permettre de comprendre :

```text
où l'élève était ;
quand ;
vers quelle classe il est passé ;
pourquoi ;
qui a effectué le changement.
```

Ne jamais supprimer l'historique pour simplifier l'affichage.

---

# 17. DONNÉES COPIABLES ENTRE ANNÉES

Pour chaque donnée, décider :

```text
COPIABLE
NON COPIABLE
RECRÉÉE
RÉFÉRENTIELLE
```

Créer un tableau de décision et le faire valider avant développement.

Exemple initial à confirmer :

| Donnée | Action |
|---|---|
| Élève | Réutiliser le même élève |
| Inscription | Créer une nouvelle inscription |
| Classe | À définir selon le modèle |
| Note | Ne pas copier |
| Présence | Ne pas copier |
| Paiement annuel | À définir selon le modèle financier |
| Document | À définir selon le type |

---

# 18. DONNÉES À NE PAS COPIER

Examiner particulièrement :

- notes ;
- présences ;
- évaluations ;
- paiements annuels ;
- historiques ;
- résultats.

Aucune donnée ne doit être copiée automatiquement sans règle validée.

---

# 19. CONTRÔLE ANTI-MÉLANGE

Tester notamment :

```text
❌ inscription 2025-2026 utilisée comme contexte 2026-2027
❌ classe 2025-2026 utilisée dans une inscription 2026-2027
❌ note 2026-2027 liée à une inscription 2025-2026
```

Les contraintes doivent être appliquées autant que possible dans les données et la logique métier, pas uniquement dans l'UI.

---

# 20. PERMISSIONS

Respecter les rôles déjà validés :

```text
DIRECTION
SECRETAIRE
PROFESSEUR
SUPER_ADMIN
```

La Session 2 précise les permissions nécessaires aux opérations sur les années ; elle ne redéfinit pas arbitrairement le RBAC de la Session 1.

---

# 21. OFFLINE-FIRST ET SYNC

Pour chacune des opérations :

```text
Créer année
Ouvrir
Changer d'année
Promouvoir
Redoubler
Transférer
Changer de classe
Clôturer
Archiver
```

Définir :

- fonctionnement hors connexion ;
- données écrites localement ;
- mutation/outbox ;
- synchronisation ;
- conflits possibles ;
- comportement en cas de modification concurrente.

La Session 2 doit rester compatible avec la Session 3 et sa synchronisation avancée.

---

# 22. AUDIT

Les opérations sensibles doivent être auditables :

- création d'année ;
- ouverture ;
- clôture ;
- archivage ;
- promotion ;
- redoublement ;
- transfert ;
- changement de classe ;
- éventuelle réouverture.

Conserver selon le besoin :

```text
user_id
device_id
school_id
action
entity_type
entity_id
old_data
new_data
created_at
```

---

# 23. ORDRE DE TRAVAIL

La Session 2 doit suivre exactement cette méthode :

```text
1. Analyse de la conception
        ↓
2. Identification des décisions à valider
        ↓
3. Règles métier
        ↓
4. Validation utilisateur
        ↓
5. Schéma BDD / contraintes
        ↓
6. Validation BDD
        ↓
7. Conception UI
        ↓
8. Validation UI
        ↓
9. Développement SQLite/Supabase/Rust/Tauri/UI
        ↓
10. Tests fonctionnels
        ↓
11. Tests Offline
        ↓
12. Tests Sync
        ↓
13. Tests anti-mélange
        ↓
14. Correction
        ↓
15. Validation finale
        ↓
16. Session 2 verrouillée
```

---

# 24. RÈGLES OBLIGATOIRES POUR L'IA

## Règle 1 — Session 1 est verrouillée

Ne pas modifier son architecture sans raison.

Si une modification devient nécessaire :

```text
Identifier
→ expliquer
→ proposer une migration
→ demander validation
→ modifier
→ tester
```

## Règle 2 — Ne pas coder avant validation

Pour la conception de cette session :

```text
Analyse
→ conception
→ validation
→ BDD
→ validation
→ UI
→ validation
→ code
```

## Règle 3 — Ne jamais recréer un élève chaque année

Le même `student_id` peut avoir plusieurs inscriptions annuelles.

## Règle 4 — Ne jamais mélanger les années

Respecter :

```text
school_id
+
academic_year_id
```

lorsque la donnée est annuelle.

## Règle 5 — Ne jamais copier automatiquement une donnée sans règle validée

Présenter la règle et demander validation si nécessaire.

## Règle 6 — Ne jamais supprimer l'historique

L'historique est une donnée métier.

## Règle 7 — Ne pas contourner une année clôturée

Les verrouillages doivent être appliqués dans les couches appropriées.

## Règle 8 — Ne pas confondre les opérations

Promotion :

```text
année N → année N+1
```

Changement de classe :

```text
même année → autre classe
```

Redoublement :

```text
année N → même niveau ou classe appropriée en année N+1
```

## Règle 9 — Ne pas anticiper la Session 3

Préparer les données pour la synchronisation sans inventer toute la résolution avancée des conflits.

## Règle 10 — Tester l'anti-mélange

Utiliser au minimum deux années scolaires dans les scénarios de test.

## Règle 11 — Répondre en français

Toutes les réponses, explanations, messages d'erreur et libellés destinés au
développeur ou à l'utilisateur final sont rédigés en français.
Les identifiants de code (noms de variables, de fonctions, de tables) restent
en anglais selon la convention du code existant.

---

# 25. PROTOCOLE DE L'IA

Avant chaque étape importante :

```text
## Analyse

## Décisions nécessaires

## Proposition

## Impact BDD

## Impact UI

## Impact Offline / Sync

## Validation nécessaire
```

Après validation et développement :

```text
## Développement

## Fichiers modifiés

## BDD

## Tests

## Résultat

## Problèmes éventuels

## Prochaine étape
```

---

# 26. CRITÈRES DE FIN

La Session 2 ne sera terminée que lorsque :

```text
[ ] Cycle de vie des années défini
[ ] Création d'année
[ ] Ouverture
[ ] Année active
[ ] Sélecteur d'année
[ ] Changement de contexte
[ ] Clôture
[ ] Archivage
[ ] Verrouillage
[ ] Promotion
[ ] Redoublement
[ ] Transfert
[ ] Changement de classe
[ ] Historique
[ ] Parcours annuel élève
[ ] Règles de copie entre années
[ ] Règles de non-copie
[ ] Contrôle anti-mélange
[ ] Permissions
[ ] Audit
[ ] Offline
[ ] Préparation Sync
[ ] BDD validée
[ ] UI validée
[ ] Code validé
[ ] Tests validés
```

---

# 27. PREMIÈRE MISSION DE L'IA

**Ne code rien immédiatement.**

Commence par analyser la Session 2 et présente :

```text
## ANALYSE SESSION 2

### 1. Objectifs

### 2. Fonctionnalités à définir

### 3. Règles métier déjà verrouillées

### 4. Décisions restant à valider

### 5. Impact BDD

### 6. Impact UI

### 7. Impact Offline / Sync

### 8. Risques de mélange entre années

### 9. Ordre de conception recommandé

### 10. Première décision à valider
```

Ne commence le codage qu'après validation de la conception.

---

# PRINCIPE DIRECTEUR

> **L'année scolaire est un contexte métier, pas simplement un filtre visuel.**

> **Un élève est une personne unique ; son inscription est annuelle.**

> **Les données d'une année ne doivent jamais être mélangées avec celles d'une autre année.**

> **On conçoit → on valide → on définit la BDD → on valide → on conçoit l'UI → on valide → on code → on teste → on verrouille.**
