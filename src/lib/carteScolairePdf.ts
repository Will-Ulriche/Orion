import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export interface CarteScolaireData {
  nom: string;
  prenoms: string;
  matricule: string | null;
  class_name: string | null;
  class_level: string | null;
  date_naissance: string | null;
  lieu_naissance?: string | null;
  gender: string | null;
  school_name: string;
  school_address?: string | null;
  school_city?: string | null;
  school_phone?: string | null;
  school_logo?: string | null;
  year_name: string;
  photo_url?: string | null;
}

function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const clean = iso.slice(0, 10);
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR');
  } catch {
    return iso;
  }
}

/**
 * Dessine une carte scolaire complète (Recto en haut, Verso en bas) sur la page active d'un document jsPDF A4.
 */
export async function drawCarteScolairePage(doc: jsPDF, data: CarteScolaireData): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  const cardW = 130;
  const cardH = 82;
  const cardX = (pageW - cardW) / 2; // Centré sur A5 portrait (148 mm)
  const rectoY = 15;
  const versoY = 113;
  const centerX = cardX + cardW / 2;

  // ══════════════════════════════════════════════════════════════════════════
  // ── RECTO (Face avant) ──────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // Cadre principal de la carte
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225); // #cbd5e1
  doc.setLineWidth(0.35);
  doc.roundedRect(cardX, rectoY, cardW, cardH, 5, 5, 'FD');

  // 1. Logo (Haut - Gauche)
  const logoX = cardX + 6;
  const logoY = rectoY + 5.5;
  const logoW = 18;
  const logoH = 15;

  let logoDrawn = false;
  if (data.school_logo && data.school_logo.startsWith('data:image/')) {
    try {
      const isPng = data.school_logo.startsWith('data:image/png');
      doc.addImage(data.school_logo, isPng ? 'PNG' : 'JPEG', logoX, logoY, logoW, logoH, undefined, 'FAST');
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Logo', logoX + logoW / 2, logoY + logoH / 2 + 1.2, { align: 'center' });
  }

  // 2. En-tête officiel République Togolaise (Haut - Centre)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(15, 23, 42); // #0f172a
  doc.text('REPUBLIQUE TOGOLAISE', centerX, rectoY + 8.2, { align: 'center' });

  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(7);
  doc.setTextColor(220, 38, 38); // Rouge #dc2626
  doc.text('Travail-Liberté-Patrie', centerX, rectoY + 12.2, { align: 'center' });

  // Badge bleu : CARTE D’IDENTITE SCOLAIRE
  const badgeW = 68;
  const badgeH = 7.2;
  const badgeX = cardX + (cardW - badgeW) / 2;
  const badgeY = rectoY + 13.8;
  doc.setFillColor(96, 165, 250); // Fond bleu ciel / medium #60a5fa
  doc.setDrawColor(37, 99, 235);  // Bordure bleu roi #2563eb
  doc.setLineWidth(0.35);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42); // Texte foncé conforme au modèle
  doc.text('CARTE D’IDENTITE SCOLAIRE', badgeX + badgeW / 2, badgeY + 5.1, { align: 'center' });

  // 3. QR Code & Année (Haut - Droite)
  const qrBoxX = cardX + cardW - 24;
  const qrBoxY = rectoY + 5.5;
  const qrBoxW = 18;
  const qrBoxH = 15;

  let qrDataUrl = '';
  try {
    const qrText = [
      `ETAB:${data.school_name || ''}`,
      `MAT:${data.matricule || ''}`,
      `NOM:${data.nom || ''} ${data.prenoms || ''}`,
      `CLASSE:${data.class_name || ''}`,
      `ANNEE:${data.year_name || ''}`,
    ].join(' | ');
    qrDataUrl = await QRCode.toDataURL(qrText, {
      margin: 0,
      width: 140,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } catch {
    qrDataUrl = '';
  }

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', qrBoxX + 1.5, qrBoxY, qrBoxH, qrBoxH);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('QR', qrBoxX + qrBoxW / 2, qrBoxY + qrBoxH / 2 + 1.2, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(data.year_name || 'Année', qrBoxX + qrBoxW / 2, qrBoxY + qrBoxH + 4.2, { align: 'center' });

  // 4. Cadre Photo de l'élève (Gauche)
  const photoX = cardX + 6;
  const photoY = rectoY + 23.5;
  const photoW = 32;
  const photoH = 38;

  let photoDrawn = false;
  if (data.photo_url && data.photo_url.startsWith('data:image/')) {
    try {
      const isPng = data.photo_url.startsWith('data:image/png');
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(photoX, photoY, photoW, photoH, 2.5, 2.5, 'F');
      doc.addImage(data.photo_url, isPng ? 'PNG' : 'JPEG', photoX + 0.8, photoY + 0.8, photoW - 1.6, photoH - 1.6, undefined, 'FAST');
      photoDrawn = true;
    } catch {
      photoDrawn = false;
    }
  }

  // Illustration / Icône de profil si aucune photo n'est disponible
  if (!photoDrawn) {
    const cx = photoX + photoW / 2;

    // Fond doux grisé à l'intérieur du cadre photo
    doc.setFillColor(241, 245, 249); // slate-100
    doc.roundedRect(photoX + 0.4, photoY + 0.4, photoW - 0.8, photoH - 0.8, 2, 2, 'F');

    // Halo d'arrière-plan discret
    doc.setFillColor(226, 232, 240); // slate-200
    doc.circle(cx, photoY + 19, 12.5, 'F');

    // Silhouette de l'utilisateur (tête + buste)
    doc.setFillColor(148, 163, 184); // slate-400
    doc.circle(cx, photoY + 14, 5.0, 'F');
    doc.roundedRect(cx - 9.5, photoY + 21.5, 19, 11, 5, 5, 'F');
  }

  // Bordure extérieure nette du cadre photo
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.45);
  doc.roundedRect(photoX, photoY, photoW, photoH, 2.5, 2.5, 'S');

  // 5. Champs de renseignements de l'élève (À droite de la photo)
  const infoX = cardX + 41;
  let fieldY = rectoY + 33.5;

  // Ligne 1 : Nom
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Nom :', infoX, fieldY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text((data.nom || '').toUpperCase(), infoX + 13, fieldY);

  // Ligne 2 : Prénoms
  fieldY += 5.7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Prénoms :', infoX, fieldY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(data.prenoms || '—', infoX + 20, fieldY);

  // Ligne 3 : Date de naissance
  fieldY += 5.7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Date de naissance :', infoX, fieldY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(formatDateFr(data.date_naissance), infoX + 35.5, fieldY);

  // Ligne 4 : Classe & Sexe
  fieldY += 5.7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Classe :', infoX, fieldY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const classVal = data.class_name || '—';
  doc.text(classVal, infoX + 16, fieldY);

  const classValW = doc.getTextWidth(classVal);
  const sexeX = Math.max(infoX + 46, infoX + 16 + classValW + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Sexe :', sexeX, fieldY);
  const genderCode = data.gender === 'M' || data.gender === 'Masculin'
    ? 'M'
    : data.gender === 'F' || data.gender === 'Féminin'
    ? 'F'
    : data.gender || '—';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(genderCode, sexeX + 13, fieldY);

  // 6. Bas de carte : Ruban bleu & Nom de l'établissement
  // Ruban bleu graphique
  doc.setFillColor(30, 58, 138); // Bleu nuit #1e3a8a
  doc.lines([[44, 0], [-8, 9], [-36, 0]], cardX + 6, rectoY + 66, [1, 1], 'F', true);
  doc.setFillColor(147, 197, 253); // Accent bleu ciel #93c5fd
  doc.triangle(cardX + 50, rectoY + 66, cardX + 55, rectoY + 66, cardX + 44, rectoY + 75, 'F');

  // Boîte à bordure orange : Nom de l'établissement
  const schoolBoxX = cardX + 56;
  const schoolBoxY = rectoY + 66.5;
  const schoolBoxW = 70;
  const schoolBoxH = 7.5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(234, 88, 12); // #ea580c
  doc.setLineWidth(0.45);
  doc.roundedRect(schoolBoxX, schoolBoxY, schoolBoxW, schoolBoxH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(8);
  doc.setTextColor(220, 38, 38); // Rouge #dc2626
  doc.text(data.school_name || "Nom de l'établissement", schoolBoxX + schoolBoxW / 2, schoolBoxY + 5.1, {
    align: 'center',
    maxWidth: schoolBoxW - 4,
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ── VERSO (Face arrière) ────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.roundedRect(cardX, versoY, cardW, cardH, 5, 5, 'FD');

  // 1. Logo (Haut - Centre)
  const logoVX = cardX + (cardW - 18) / 2;
  const logoVY = versoY + 8;

  let logoVDrawn = false;
  if (data.school_logo && data.school_logo.startsWith('data:image/')) {
    try {
      const isPng = data.school_logo.startsWith('data:image/png');
      doc.addImage(data.school_logo, isPng ? 'PNG' : 'JPEG', logoVX, logoVY, 18, 15, undefined, 'FAST');
      logoVDrawn = true;
    } catch {
      logoVDrawn = false;
    }
  }
  if (!logoVDrawn) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Logo', logoVX + 9, logoVY + 8.7, { align: 'center' });
  }

  // 2. Mentions officielles & légales (Centre)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    'Cette carte est strictement personnelle et obligatoire pour toutes',
    centerX,
    versoY + 36,
    { align: 'center' }
  );
  doc.text(
    'démarches scolaires et administratives.',
    centerX,
    versoY + 41,
    { align: 'center' }
  );

  doc.text(
    'Toute reproduction, altération ou usage frauduleux est formellement',
    centerX,
    versoY + 50,
    { align: 'center' }
  );
  doc.text(
    'interdit et expose son auteur à des poursuites judiciaires.',
    centerX,
    versoY + 55,
    { align: 'center' }
  );

  // 3. Contact en bas de carte
  const contactY = versoY + 68;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42);
  const contactPrefix = "En cas de perte, prière de contacter l'établissement au : ";
  const phoneVal = data.school_phone || 'Numero';
  doc.text(contactPrefix + phoneVal, centerX, contactY, { align: 'center' });
}

/**
 * Construit un document PDF contenant la carte scolaire de l'élève (Recto + Verso sur 1 page A5).
 */
export async function buildCarteScolairePdf(data: CarteScolaireData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const fullName = `${data.nom || ''} ${data.prenoms || ''}`.trim() || 'Élève';

  doc.setProperties({
    title: `Carte scolaire — ${fullName}`,
    subject: `Carte scolaire ${data.year_name} — ${data.school_name}`,
  });

  await drawCarteScolairePage(doc, data);
  return doc;
}

/**
 * Sauvegarde la carte scolaire d'un élève.
 */
export async function saveCarteScolairePdf(data: CarteScolaireData): Promise<void> {
  const doc = await buildCarteScolairePdf(data);
  const safeNom = (data.nom || 'eleve').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safePrenom = (data.prenoms || 'eleve').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Carte-scolaire-${safeNom}-${safePrenom}.pdf`);
}