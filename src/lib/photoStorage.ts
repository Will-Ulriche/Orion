/**
 * photoStorage.ts
 * Service centralisé pour l'upload/suppression des photos vers Supabase Storage.
 *
 * Bucket "staff-photos"   : chemin staff-photos/{school_id}/{staff_id}.jpg
 * Bucket "student-photos" : chemin student-photos/{school_id}/{student_id}.jpg
 *
 * Comportement offline-first :
 *  - Si l'upload échoue (pas de réseau), la fonction retourne null.
 *  - L'appelant doit garder le base64 local en fallback et réessayer plus tard.
 */

import { supabase } from './supabaseClient';

const BUCKET = 'staff-photos';
const STUDENT_BUCKET = 'student-photos';

/**
 * Compresse un File image en Blob JPEG (max 500×500, qualité 0.82).
 * Retourne une Promise<Blob>.
 */
export function compressToBlob(file: File, maxSize = 500, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier échouée'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Décodage image échoué'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        } else {
          if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob échoué')),
          'image/jpeg',
          quality
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compresse un File puis l'upload vers un bucket Supabase Storage.
 * Retourne l'URL publique HTTPS de la photo, ou null en cas d'échec.
 */
async function uploadPhoto(file: File, bucket: string, path: string): Promise<{ url: string; base64Fallback: string } | null> {
  // 1. Comprimer l'image
  let blob: Blob;
  let base64Fallback: string;
  try {
    blob = await compressToBlob(file);
    // Aussi générer le base64 pour le fallback offline
    base64Fallback = await blobToBase64(blob);
  } catch (err) {
    console.error('[photoStorage] Compression échouée:', err);
    return null;
  }

  // 2. Tenter l'upload vers Supabase Storage
  if (!navigator.onLine) {
    console.warn('[photoStorage] Hors-ligne — photo stockée localement en base64');
    return { url: base64Fallback, base64Fallback };
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true, // Remplace si le fichier existe déjà
    });

  if (error) {
    console.error('[photoStorage] Upload Supabase échoué:', error.message);
    // Retourner le base64 comme fallback pour ne pas bloquer l'UX
    return { url: base64Fallback, base64Fallback };
  }

  // 3. Récupérer l'URL signée temporaire (bucket privé sécurisé SEC-03)
  const { data: signedData, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24); // Valide 24 heures

  if (signError || !signedData?.signedUrl) {
    console.warn('[photoStorage] createSignedUrl échoué, fallback base64:', signError?.message);
    return { url: base64Fallback, base64Fallback };
  }

  return { url: signedData.signedUrl, base64Fallback };
}

/**
 * Cache en mémoire des URLs signées pour éviter de solliciter Supabase Storage à chaque render.
 * Format clé: `${bucket}:${path}` -> { url: string, expiresAt: number }
 */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Résout une référence de photo (base64, chemin relatif ou URL Supabase)
 * en une URL directement affichable de manière sécurisée.
 * 
 * - Si `photoUrl` est un data:image/ ou blob:, il est retourné immédiatement.
 * - Si le bucket est privé, une URL signée temporaire est demandée avec le JWT utilisateur.
 */
export async function resolvePhotoUrl(
  photoUrl: string | null | undefined,
  bucket: 'staff-photos' | 'student-photos' = 'student-photos',
  expiresInSeconds = 60 * 60 * 24 // 24 heures
): Promise<string | null> {
  if (!photoUrl) return null;
  if (isLocalBase64(photoUrl) || photoUrl.startsWith('blob:')) {
    return photoUrl;
  }

  // Si c'est déjà une URL signée encore valide, la conserver
  if (photoUrl.includes('/object/sign/') && photoUrl.includes('token=')) {
    return photoUrl;
  }

  // Extraire le chemin relatif de l'objet dans le bucket
  let objectPath = photoUrl;
  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const signMarker = `/storage/v1/object/sign/${bucket}/`;

  if (photoUrl.includes(publicMarker)) {
    objectPath = photoUrl.split(publicMarker)[1]?.split('?')[0] || photoUrl;
  } else if (photoUrl.includes(signMarker)) {
    objectPath = photoUrl.split(signMarker)[1]?.split('?')[0] || photoUrl;
  }

  const cacheKey = `${bucket}:${objectPath}`;
  const now = Date.now();
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.url;
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.warn('[photoStorage] Impossible de générer l\'URL signée:', error?.message);
      return photoUrl;
    }

    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: now + expiresInSeconds * 1000,
    });

    return data.signedUrl;
  } catch (err) {
    console.warn('[photoStorage] Erreur résolution photo:', err);
    return photoUrl;
  }
}

/**
 * Compresse un File puis l'upload vers Supabase Storage.
 * Retourne l'URL publique HTTPS de la photo, ou null en cas d'échec.
 *
 * @param file        Fichier image sélectionné par l'utilisateur
 * @param schoolId    ID de l'école (pour le chemin de stockage)
 * @param staffId     ID du membre du personnel (nom du fichier)
 */
export function uploadStaffPhoto(
  file: File,
  schoolId: string,
  staffId: string
): Promise<{ url: string; base64Fallback: string } | null> {
  return uploadPhoto(file, BUCKET, `${schoolId}/${staffId}.jpg`);
}

/**
 * Compresse un File puis l'upload vers Supabase Storage (bucket "student-photos").
 * Retourne l'URL publique HTTPS de la photo, ou null en cas d'échec.
 *
 * @param file        Fichier image sélectionné par l'utilisateur
 * @param schoolId    ID de l'école (pour le chemin de stockage)
 * @param studentId   ID de l'élève (nom du fichier)
 */
export function uploadStudentPhoto(
  file: File,
  schoolId: string,
  studentId: string
): Promise<{ url: string; base64Fallback: string } | null> {
  return uploadPhoto(file, STUDENT_BUCKET, `${schoolId}/${studentId}.jpg`);
}

/**
 * Supprime la photo d'un membre du personnel depuis Supabase Storage.
 * Silencieux en cas d'échec (la photo locale reste affichée).
 */
export async function deleteStaffPhoto(schoolId: string, staffId: string): Promise<void> {
  if (!navigator.onLine) return;
  const path = `${schoolId}/${staffId}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.warn('[photoStorage] Suppression Supabase échouée:', error.message);
  }
}

/**
 * Supprime la photo d'un élève depuis Supabase Storage.
 * Silencieux en cas d'échec (la photo locale reste affichée).
 */
export async function deleteStudentPhoto(schoolId: string, studentId: string): Promise<void> {
  if (!navigator.onLine) return;
  const path = `${schoolId}/${studentId}.jpg`;
  const { error } = await supabase.storage.from(STUDENT_BUCKET).remove([path]);
  if (error) {
    console.warn('[photoStorage] Suppression Supabase échouée:', error.message);
  }
}

/**
 * Convertit un Blob en data URL base64.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * Vérifie si une photo_url est un base64 local (pas encore uploadée).
 * Utile pour identifier les photos à re-synchroniser plus tard.
 */
export function isLocalBase64(url: string | null): boolean {
  return url?.startsWith('data:image') ?? false;
}
