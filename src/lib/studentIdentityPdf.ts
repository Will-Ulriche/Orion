import { jsPDF } from 'jspdf';
// `?inline` : images embarquées en data-URI au build (WebView Tauri sans fetch,
// cf. nominalListPdf) — logo Orion, QR et signature du modèle de fiche.
import logoAsset from '../assets/orion_logo.png?inline';
import qrAsset from '../assets/orion_qr.png?inline';
import signatureAsset from '../assets/orion_signature.png?inline';
import type { ReceiptSchoolInfo } from './receiptPdf';

// ─────────────────────────────────────────────────────────────────────────────
// PDF « FICHE D'IDENTITE DE L'ELEVE » — A4 portrait.
//
// Le gabarit de référence est un PDF Word en Letter (612 × 792 pt) relevé dans
// .tmp_fid_dump.txt (textes, filets, images). On projette ses coordonnées sur
// l'A4 portrait (595,28 × 841,89) : X × 0,9727 (largeur) et Y × 1,0630
// (hauteur). Seules les positions/rects sont projetés — les corps de police
// restent en points natifs et `fitSize` absorbe les colonnes 2,7 % plus étroites.
//
// Comme pour la liste de présence, rien n'est inventé : chaque repère vient du
// dump du gabarit, chaque champ non renseigné reprend le texte du modèle
// (« Non renseigné » en italique gris #A0AEC0).
// ─────────────────────────────────────────────────────────────────────────────

/** Gabarit de référence (Letter) — unités de départ. */
const T_W = 612;
const T_H = 792;
/** A4 portrait (unités jsPDF : pt). */
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

const SX = PAGE_W / T_W;
const SY = PAGE_H / T_H;

/** Projette une abscisse du gabarit Letter vers l'A4. */
const X = (v: number): number => v * SX;
/** Projette une ordonnée du gabarit Letter vers l'A4. */
const Y = (v: number): number => v * SY;

// ── Données ──────────────────────────────────────────────────────────────────

/** Fiche complète d'un élève (fusion `get_student_details` + classe inscrite). */
export interface StudentIdentityData {
  studentId: string;
  firstName: string | null;
  lastName: string | null;
  matricule: string | null;
  /** Classe de l'inscription (année courante) — absente de get_student_details. */
  className: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  gender: string | null;
  address: string | null;
  phone: string | null;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  bloodType: string | null;
  medicalNotes: string | null;
  /** Data-URI PNG/JPEG de l'élève, ou null. */
  photoUrl: string | null;
}

export interface StudentIdentityDocOptions {
  students: StudentIdentityData[];
  school: ReceiptSchoolInfo;
}


// ── Géométrie (relevé du gabarit, unités Letter → projetées en A4) ──────────

const BLUE = [43, 108, 176] as const;     // bandeaux sections 1 & 2 (#2B6CB0)
const RED = [197, 48, 48] as const;       // bandeau section 3 (#C53030)
const ROW_ALT = [247, 250, 252] as const; // fond de ligne alterné (#F7FAFC)
const LABEL_COLOR = [45, 55, 72] as const;   // libellés (#2D3748)
const VALUE_COLOR = [26, 32, 44] as const;   // valeurs (#1A202C)
const MUTED = [160, 174, 192] as const;      // vides italiques (#A0AEC0)
const BRAND = [0, 51, 204] as const;         // nom école Anton bleu (#0033CC)
const PHOTO_BORDER = [74, 125, 187] as const; // cadre photo (#4A7DBB)

const MINISTRY_LINES = [
  'MINISTERE DES ENSEIGNEMENTS PRIMAIRES,',
  'SECONDAIRE,',
  "TECHNIQUE ET DE L'ARTISANAT",
];
const MINISTRY_CX = 118.5; // centre du bloc gauche (relevé : 118,45 / 119,5)
const MINISTRY_SIZE = 9;
const MINISTRY_BASELINES = [36.8, 48.7, 60.6];

const TITLE = "FICHE D'IDENTITE DE L'ELEVE";
const TITLE_BASELINE = 167.7;
const TITLE_UNDERLINE_Y = 169.4;

/** Bandes de section : x=40,7 → 561,8 (largeur 521,1), hauteur 22,44. */
const BAND = { x: 40.7, w: 521.1, h: 22.44, tops: [188.8, 389.6, 552.0] };
const BAND_LABEL_X = 46.7;
const BAND_LABEL_DY = 14.3; // baseline = haut de bande + 14,3

/**
 * Lignes de valeurs — sections 1 et 2 pleine largeur (47,9 → 554,8) ;
 * section 3 indentée (relevé : 67,2 → 535,3, colonnes décalées).
 */
const ROWS_WIDE = { left: 47.9, right: 554.8, labelX: 52.8, valueX: 250.1, labelMaxW: 187.4, valueMaxW: 299.7 };
const ROWS_NARROW = { left: 67.2, right: 535.3, labelX: 72.3, valueX: 230.7, labelMaxW: 148.4, valueMaxW: 299.7 };
const ROW_H = 19.24;
const ROW_TOPS = [230.1, 430.9, 593.3]; // première ligne de chaque section
const ROW_TEXT_DY = 12.3; // baseline = haut de ligne + 12,3

interface FieldSpec {
  label: string;
  value: (s: StudentIdentityData) => string;
  placeholder: string;
}

/** Sections 1 et 2 (colonnes larges) : [titre, champs]. */
const WIDE_SECTIONS: [string, FieldSpec[]][] = [
  ['1. IDENTITÉ', [
    { label: 'Prénom:', value: s => (s.firstName ?? '').toUpperCase(), placeholder: 'Non renseigné' },
    { label: 'Nom :', value: s => (s.lastName ?? '').toUpperCase(), placeholder: 'Non renseigné' },
    { label: 'Matricule :', value: s => s.matricule ?? '', placeholder: 'Non renseigné' },
    { label: 'Classe :', value: s => s.className ?? '', placeholder: 'Non renseignée' },
    { label: 'Date de naissance:', value: s => formatDate(s.birthDate), placeholder: 'Non renseignée' },
    { label: 'Lieu de naissance :', value: s => s.birthPlace ?? '', placeholder: 'Non renseigné' },
    { label: 'Genre :', value: s => genderLabel(s.gender), placeholder: 'Non renseigné' },
  ]],
  ['2. CONTACT & PARENTS', [
    { label: "Téléphone de l'élève :", value: s => s.phone ?? '', placeholder: 'Non renseigné (Optionnel)' },
    { label: 'Adresse :', value: s => s.address ?? '', placeholder: 'Non renseignée' },
    { label: 'Tuteur Légal / Parent :', value: s => s.parentName ?? '', placeholder: 'Non renseigné' },
    { label: 'Téléphone Parent :', value: s => s.parentPhone ?? '', placeholder: 'Non renseigné' },
    { label: 'Email Parent :', value: s => s.parentEmail ?? '', placeholder: 'Non renseigné' },
  ]],
];

/** Section 3 (colonnes indentées) : [titre, champs]. */
const MEDICAL_SECTION: [string, FieldSpec[]] = ['3. MÉDICAL & SÉCURITÉ', [
  { label: 'Groupe sanguin :', value: s => s.bloodType ?? '', placeholder: 'Non renseigné' },
  {
    label: 'Notes médicales :',
    value: s => s.medicalNotes ?? '',
    placeholder: 'Aucune note renseignée (Asthme, allergie aux arachides, etc.)',
  },
]];

/** En bas de page : QR (relevé 288,6 / 690,1), signature (414 / 706,7). */
const QR_BOX = { x: 288.6, y: 690.1, w: 51.6 };
const HEAD_BASELINE = 702.2;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** ISO (AAAA-MM-JJ) → JJ/MM/AAAA ; renvoie la valeur brute sinon. */
const formatDate = (v: string | null): string => {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
};

const genderLabel = (v: string | null): string => {
  const g = (v ?? '').trim().toUpperCase();
  if (g === 'M' || g.startsWith('MASC')) return 'Masculin';
  if (g === 'F' || g.startsWith('FEM')) return 'Féminin';
  return '';
};

/** WinAnsi : supprime les caractères non encodables par les polices standard. */
const winAnsi = (s: string): string =>
  s
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/•/g, '-')
    .replace(/…/g, '...')
    .replace(/[^ -ÿ]/g, '');

/** Réduit le corps (par pas de 0,25 pt) jusqu'à faire tenir `text` dans `maxW`. */
const fitSize = (doc: jsPDF, text: string, maxW: number, base: number, min: number): number => {
  for (let s = base; s > min; s -= 0.25) {
    doc.setFontSize(s);
    if (doc.getTextWidth(text) <= maxW) return s;
  }
  doc.setFontSize(min);
  return min;
};

/** Coupe avec « ... » quand même la taille minimale ne tient pas. */
const truncate = (doc: jsPDF, text: string, maxW: number): string => {
  if (doc.getTextWidth(text) <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.getTextWidth(`${text.slice(0, mid)}...`) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo).trimEnd()}...` : '';
};

/**
 * Pose une image en conservant son ratio dans le cadre projeté ; un format que
 * jsPDF ne sait pas décoder (WebP…) ne bloque jamais la génération.
 */
const addImageSafe = (doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number): boolean => {
  if (!dataUrl) return false;
  try {
    const props = doc.getImageProperties(dataUrl);
    const ratio = Math.min(w / props.width, h / props.height);
    const finalW = props.width * ratio;
    const finalH = props.height * ratio;
    doc.addImage(
      dataUrl, props.fileType || 'PNG',
      x + (w - finalW) / 2, y + (h - finalH) / 2, finalW, finalH,
      undefined, 'FAST',
    );
    return true;
  } catch {
    return false;
  }
};


// ── En-tête ──────────────────────────────────────────────────────────────────

const drawHeader = (doc: jsPDF, student: StudentIdentityData, school: ReceiptSchoolInfo): void => {
  // Lignes du ministère (Times 9, centrées dans la colonne gauche du gabarit).
  doc.setFont('times', 'normal');
  doc.setTextColor(0, 0, 0);
  const ministry = school.ministry_name?.trim()
    ? school.ministry_name.split('\n').map(l => l.trim()).filter(Boolean)
    : MINISTRY_LINES;
  ministry.slice(0, 3).forEach((line, i) => {
    const text = winAnsi(line);
    fitSize(doc, text, X(198.9), MINISTRY_SIZE, 6.5);
    doc.text(text, X(MINISTRY_CX), Y(MINISTRY_BASELINES[Math.min(i, 2)]), { align: 'center' });
  });

  // Filet sous le bloc ministère (relevé : y=68,4, x 84,6 → 141).
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.7);
  doc.line(X(84.6), Y(68.4), X(141), Y(68.4));

  // Nom de l'école (Anton bleu du modèle → Helvetica bold, corps réduit si long).
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND);
  const schoolName = winAnsi((school.name || 'ÉTABLISSEMENT').toUpperCase());
  doc.setFontSize(fitSize(doc, schoolName, X(225.9), 12, 8));
  doc.text(schoolName, X(MINISTRY_CX), Y(89.2), { align: 'center' });

  // « Lomé-Togo / 00228 93 35 53 39 » → ville-pays / téléphone des réglages.
  doc.setFont('times', 'normal');
  doc.setTextColor(0, 0, 0);
  const loc = [school.city, school.country].filter(Boolean).join('-');
  const contact = winAnsi([loc, school.phone].filter(Boolean).join(' / '));
  if (contact) {
    doc.setFontSize(fitSize(doc, contact, X(155.1), 11, 7));
    doc.text(contact, X(MINISTRY_CX), Y(103.3), { align: 'center' });
  }

  // Logo de l'école au centre (repli Orion) — repris du gabarit.
  addImageSafe(doc, school.logo_url || logoAsset, X(282), Y(32.3), X(70.8), Y(72.7));

  // Cadre PHOTO à droite (photo de l'élève ou libellé).
  doc.setLineWidth(1.4);
  doc.setDrawColor(...PHOTO_BORDER);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(X(469.8), Y(27.3), X(91.2), Y(96.3), 5, 5, 'FD');
  if (!addImageSafe(doc, student.photoUrl ?? '', X(474), Y(31.5), X(82.8), Y(87.9))) {
    doc.setFont('times', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.text('PHOTO', X(517.85), Y(74.8), { align: 'center' });
  }
};


// ── Sections ─────────────────────────────────────────────────────────────────

const drawSection = (
  doc: jsPDF,
  student: StudentIdentityData,
  index: number,
  title: string,
  fields: FieldSpec[],
  geometry: typeof ROWS_WIDE,
): void => {
  const bandTop = BAND.tops[index];
  const bandColor: readonly [number, number, number] = index === 2 ? RED : BLUE;
  doc.setFillColor(bandColor[0], bandColor[1], bandColor[2]);
  doc.rect(X(BAND.x), Y(bandTop), X(BAND.w), Y(BAND.h), 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(title, X(BAND_LABEL_X), Y(bandTop + BAND_LABEL_DY));

  const rowTop = ROW_TOPS[index];
  fields.forEach((field, i) => {
    const top = rowTop + i * ROW_H;
    // Fonds alternés : ligne paire #F7FAFC, impaire blanche (page déjà blanche).
    if (i % 2 === 0) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(X(geometry.left), Y(top), X(geometry.right - geometry.left), Y(ROW_H), 'F');
    }
    const baseline = Y(top + ROW_TEXT_DY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...LABEL_COLOR);
    const label = winAnsi(field.label);
    fitSize(doc, label, X(geometry.labelMaxW), 9.96, 7.5);
    doc.text(truncate(doc, label, X(geometry.labelMaxW)), X(geometry.labelX), baseline);

    const raw = winAnsi(field.value(student)).trim();
    if (raw) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...VALUE_COLOR);
      fitSize(doc, raw, X(geometry.valueMaxW), 9.96, 7.5);
      doc.text(truncate(doc, raw, X(geometry.valueMaxW)), X(geometry.valueX), baseline);
    } else {
      // Vide : italique gris, comme les « Non renseigné » du gabarit.
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...MUTED);
      fitSize(doc, field.placeholder, X(geometry.valueMaxW), 9.96, 7);
      doc.text(truncate(doc, field.placeholder, X(geometry.valueMaxW)), X(geometry.valueX), baseline);
    }
  });
};

// ── Titre & pied de page ─────────────────────────────────────────────────────

const drawTitle = (doc: jsPDF): void => {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(TITLE, X(T_W / 2), Y(TITLE_BASELINE), { align: 'center' });
  // Filet de soulignement centré sous le titre (largeur du texte mesurée).
  const w = doc.getTextWidth(TITLE);
  doc.setLineWidth(0.84);
  doc.line(X(T_W / 2) - w / 2, Y(TITLE_UNDERLINE_Y), X(T_W / 2) + w / 2, Y(TITLE_UNDERLINE_Y));
};

const drawFooter = (doc: jsPDF, school: ReceiptSchoolInfo): void => {
  addImageSafe(doc, qrAsset, X(QR_BOX.x), Y(QR_BOX.y), X(QR_BOX.w), Y(QR_BOX.w));

  doc.setFont('times', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  const head = "CHEF D'ETABLISSEMENT";
  doc.text(head, X(388.6), Y(HEAD_BASELINE));
  const w = doc.getTextWidth(head);
  doc.setLineWidth(0.84);
  doc.line(X(388.6), Y(HEAD_BASELINE + 1.1), X(388.6) + w, Y(HEAD_BASELINE + 1.1));

  addImageSafe(doc, school.signature_url || signatureAsset, X(SIG_BOX.x), Y(SIG_BOX.y), X(SIG_BOX.w), Y(SIG_BOX.h));
};

// ── Construction ─────────────────────────────────────────────────────────────

/**
 * Construit le PDF des fiches d'identité : une page A4 portrait par élève,
 * sur le gabarit « FICHE D'IDENTITE DE L'ELEVE » (Letter → A4 projeté).
 */
export function buildStudentIdentityPdf(opts: StudentIdentityDocOptions): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait' });

  opts.students.forEach((student, i) => {
    if (i > 0) doc.addPage([PAGE_W, PAGE_H], 'portrait');

    drawHeader(doc, student, opts.school);
    drawTitle(doc);
    drawSection(doc, student, 0, WIDE_SECTIONS[0][0], WIDE_SECTIONS[0][1], ROWS_WIDE);
    drawSection(doc, student, 1, WIDE_SECTIONS[1][0], WIDE_SECTIONS[1][1], ROWS_WIDE);
    drawSection(doc, student, 2, MEDICAL_SECTION[0], MEDICAL_SECTION[1], ROWS_NARROW);
    drawFooter(doc, opts.school);
  });

  return doc;
}

/** Nom de fichier : une fiche → nom de l'élève ; plusieurs → export groupé. */
export function studentIdentityFileName(students: StudentIdentityData[], yearName: string): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9 -]/g, '_').replace(/\s+/g, '_').slice(0, 40);
  if (students.length === 1) {
    const s = students[0];
    const name = [s.lastName, s.firstName].filter(Boolean).join(' ').trim() || 'eleve';
    return `Fiche_identite_${sanitize(name)}.pdf`;
  }
  const year = yearName.replace(/[^a-zA-Z0-9-]/g, '_') || 'annee';
  return `Fiches_identite_Eleves_${year}.pdf`;
}

const SIG_BOX = { x: 414.0, y: 706.7, w: 113.4, h: 56.7 };
