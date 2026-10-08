# Gains rapides — Photos & PDF

Objectif : réduire le poids des transferts photo et supprimer les blocages UI à la
génération de PDF. Aucun changement d'architecture (pas de miniatures, pas de web
worker, pas de génération Rust).

## A. Photos — payload et chargement à la demande

### A1. `includePhotos: false` sur les listes qui n'affichent jamais de photo
- `src/pages/Classes.tsx:176` (`get_staff`)
- `src/pages/Pedagogie.tsx:1667` (`get_staff`)
- `src/pages/Pedagogie.tsx:991` (`get_students`)
- `src/pages/Finances.tsx:183` (`get_students`)
- `src/pages/StudentsMigration.tsx:145` (`get_students`)
- `src/components/BulkMigrationModal.tsx:56` (`get_students`)

Le backend accepte déjà le paramètre (`commands.rs`, nullification si `Some(false)`),
défaut inchangé = photos conservées.

### A2. Personnel — liste sans photo, photo chargée à l'ouverture de la fiche
1. Nouvelle commande `get_staff_photo(staff_id, state) -> Result<Option<String>, String>`
   (`SELECT photo_url FROM staff WHERE id = ?`), `#[tauri::command(async)]`,
   enregistrée dans `src-tauri/src/lib.rs` (bloc Personnel, ligne ~114).
2. `src/pages/Personnel.tsx:1067` : `includePhotos: false` sur `get_staff`.
3. `handleSelect` (`:1084`) et sélection initiale (`:1069-1072`) deviennent async :
   `await invoke('get_staff_photo')` **avant** `setSelected/setForm`.
   - Échec de la requête → toast d'erreur et **on n'ouvre pas** la fiche
     (garantit qu'aucune sauvegarde ne puisse écraser la photo avec `null`).
4. `handleDiscard` (`:1104`) inchangé : `selected` porte la photo chargée.
5. `confirmDelete` (`:1118`) : `await handleSelect(...)`.

### A3. Lazy loading des images affichées
Ajouter `loading="lazy" decoding="async"` :
- `src/components/StudentProfileModal.tsx:135`
- `src/pages/Personnel.tsx:237` (avatar du formulaire)
- `src/pages/Settings.tsx:101` et `:269`

## B. PDF — fin de la double génération + spinner visible

### B1. Réutiliser le blob de l'aperçu pour le téléchargement
- `src/components/NominalListModal.tsx` : stocker le `Blob` produit par l'effet
  (`:248`) en état (`pdfBlob`) ; `handleDownload` (`:264`) télécharge ce blob via
  ancre + `URL.createObjectURL` (modèle `src/pages/Personnel.tsx:811-816`) au lieu
  de rappeler `buildNominalListPdf` ; bouton disabled si `!pdfBlob`.
- `src/components/TimetableModal.tsx` : idem (effet `:303`, download `:353`).
- `src/components/PresenceListModal.tsx` : stocker le blob de l'effet (`:83`) ;
  `handleDownload` (`:107`) ne rappelle plus `buildPresenceListPdf`.

### B2. Spinner pendant la génération (yield avant le build synchrone)
Petit helper `nextPaint()` (`await new Promise(r => setTimeout(r, 0))`) posé après
`setBusy(...)` pour que React peigne l'état avant le build bloquant :
- `src/pages/Archives.tsx` `runDoc` (couvre rapport financier et futures docs)
- `src/pages/Finances.tsx` `handlePrintReceipt` (`:398`, passage en async) et
  `handleExportReport` (`:446`)
- `src/pages/Pedagogie.tsx` `exportReport` (`:1370`) + état `exporting` sur le
  bouton (`:1420`, spinner + disabled)
- `src/components/StudentProfileModal.tsx` bouton bulletin (`:300`) + état
  `generating` (spinner + disabled)

### B3. Loader d'aperçu manquant
- `src/components/NominalListModal.tsx:507` rend `null` pendant la génération →
  afficher le même loader que `TimetableModal.tsx:567-571`
  (« Génération de l'aperçu… »).
- `TimetableModal` a déjà son loader ✓.

## Hors périmètre
Miniatures `photo_thumb`, stockage fichier des photos, web worker jsPDF,
génération PDF côté Rust, `includePhotos` pour les pages qui affichent des photos.

## Vérification
1. `cargo check` dans `src-tauri` (nouvelle commande + inscription handler).
2. `npx tsc --noEmit` — aucune nouvelle erreur (des erreurs préexistent dans
   Dashboard1.tsx, presenceListPdf.ts, Pedagogie.tsx, Personnel.tsx).
3. `npx vite build`.
4. Test manuel :
   - Personnel : liste → sélection → la photo s'affiche ; modification + sauvegarde
     → photo conservée ; « Annuler » → photo restaurée ; suppression de la photo →
     bien enregistrée à `null`.
   - Listes nominatives : spinner puis aperçu ; « Télécharger PDF » instantané et
     identique à l'aperçu.
   - Emploi du temps / liste de présence : idem.
   - Archives → rapport financier, Finances → reçu, Pédagogie → palmarès,
     fiche élève → bulletin : le bouton « Génération… » s'affiche avant le freeze.
