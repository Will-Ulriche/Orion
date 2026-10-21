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

  // 3. Récupérer l'URL publique
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  // Ajouter un cache-buster pour forcer le rechargement de la photo si mise à jour
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  return { url: publicUrl, base64Fallback };
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
