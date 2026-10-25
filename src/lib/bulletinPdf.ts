import { jsPDF } from 'jspdf';
// `?inline` : images embarquées en data-URI au build (WebView Tauri sans fetch).
import stateAsset from '../assets/bulletin_state.png?inline';
import csjAsset from '../assets/bulletin_csj.png?inline';
import type { ReceiptSchoolInfo } from './receiptPdf';

// ─────────────────────────────────────────────────────────────────────────────
// PDF « BULLETIN DU … TRIMESTRE » — A4 portrait natif.
//
// Géométrie relevée sur le gabarit Bulletin_de_Notes_Officiel_A4.pdf
// (.tmp_bulletin_dump.txt, déjà en A4 595,28 × 841,89 — aucune projection) :
// en-tête République / école (logos extraits du gabarit), encadré titre jaune,
// bloc élève, tableau matières à en-tête bordeaux, synthèse + discipline,
// appréciation globale et trois encadrés de signature.
// ─────────────────────────────────────────────────────────────────────────────

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

// ── Données ──────────────────────────────────────────────────────────────────

/** Une ligne du tableau des matières (données réelles de l'élève). */
export interface BulletinSubjectRow {
  name: string;
  coefficient: number;
  /**
   * Moyennes /20 du trimestre. Règle du bulletin : une note absente vaut 0
   * (le PDF affiche « 0.00 » et la moyenne matière = (interro+devoir+compo)/3).
   */
  interro: number | null;
  devoir: number | null;
  compo: number | null;
  /** Moyenne de la matière (backend, informatif — le PDF recalcule (i+d+c)/3). */
  average: number | null;
  rank: number | null;
  appreciation: string;
}

export interface BulletinData {
  studentFirstName: string | null;
  studentLastName: string | null;
  matricule: string | null;
  className: string | null;
  /** 1 | 2 | 3 (trimestre). */
  periodOrder: number;
  yearName: string;
  subjects: BulletinSubjectRow[];
  generalAverage: number | null;
  rank: number | null;
  classSize: number;
  classAverage: number | null;
  bestAverage: number | null;
  worstAverage: number | null;
  /** Appréciation générale du conseil (ClassRankingEntry.appreciation). */
  globalAppreciation: string;
  /** Nom du titulaire de la classe (homeroom). */
  homeroomTeacher: string | null;
}

export interface BulletinDocOptions {
  bulletin: BulletinData;
  school: ReceiptSchoolInfo;
}

// ── Géométrie (relevé du gabarit, A4 natif) ─────────────────────────────────

const MARRON = [128, 0, 32] as const;      // #800020 bordeaux des bandeaux
const OR = [253, 224, 71] as const;       // #FDE047 filets de l'encadré titre
const TITLE_BG = [255, 251, 227] as const; // #FFFBE3 fond de l'encadré titre
const GOLD_TEXT = [69, 26, 3] as const;   // #451A03 « ANNÉE SCOLAIRE »
const SLATE = [51, 65, 85] as const;      // #334155 textes courants
const LABEL = [100, 116, 139] as const;   // #64748B libellés du bloc élève
const VALUE = [15, 23, 42] as const;      // #0F172A valeurs du bloc élève
const ROW_TEXT = [30, 27, 75] as const;   // #1E1B4B texte du tableau
const INFO_BG = [250, 250, 250] as const; // #FAFAFA fond du bloc élève
const GRID = [241, 245, 249] as const;    // #F1F5F9 grille du bloc élève
const ROW_ROSE = [255, 241, 242] as const; // #FFF1F2 lignes impaires du tableau
const MUTED = [148, 163, 184] as const;   // #94A3B8 placeholders signatures
const BORDER = [226, 232, 240] as const;  // #E2E8F0 encadrés bas
const BADGE_ROSE = [254, 226, 226] as const; // #FEE2E2 badge moyenne

/** Carte blanche posée sur le fond gris de la page. */
const CARD = { top: 18, bottom: 824 };
const CENTER_X = 297.8;

/** En-tête : logos + 5 lignes centrées. */
const HEAD_STATE = { x: 45.7, y: 57, w: 58, h: 52 };
const HEAD_CSJ = { x: 488, y: 56, w: 58, h: 55 };
const HEAD_BASELINES = [70.3, 78.6, 91.3, 100.3, 115.7];

/** Filet bordeaux + encadré titre. */
const TITLE_RULE = { y: 123.6, x0: 45.7, x1: 549.9, h: 1.5 };
const TITLE_BOX = { x0: 45.7, x1: 549.9, top: 131.1, bottom: 167.1, bar: 3.75 };
const TITLE_BASELINE = 148.2;
const SUBTITLE_BASELINE = 158.6;

/** Bloc élève (2 × 2). */
const INFO_BOX = { x0: 45.7, x1: 549.9, top: 176, bottom: 230.7, midY: 194 };
const INFO_VX = [136.7, 298.2, 388.8];
const INFO_BASELINES = [186.4, 205.2];
const INFO_COLS = { labelL: 52.8, valueL: 143.3, labelR: 304.2, valueR: 394.6 };

/** Tableau des matières : en-tête bordeaux + colonnes (relevé du gabarit). */
const TABLE = {
  x0: 46.4, x1: 549.2,
  headTop: 240.5, headBottom: 258.4, headBaseline: 250.2,
  firstRowTop: 258.4, rowH: 18.73,
  totalH: 17.2, minRowH: 14,
};
/** [gauche, droite] de chaque colonne (9 colonnes). */
const COLS: [number, number][] = [
  [46.4, 170.1],   // MATIÈRES
  [170.1, 202.3],  // COEFF
  [202.3, 242.7],  // INTERRO
  [242.7, 283.2],  // DEVOIR
  [283.2, 322.9],  // COMPO
  [322.9, 370.1],  // MOYENNE
  [370.1, 415.1],  // TOTAL
  [415.1, 445.0],  // RANG
  [445.0, 549.2],  // APPRÉCIATION
];
const COL_HEADERS = ['MATIÈRES', 'COEFF', 'INTERRO', 'DEVOIR', 'COMPO', 'MOYENNE', 'TOTAL', 'RANG', 'APPRÉCIATION'];
const HEAD_CELL_BASELINE = 250.2;
const ROW_TEXT_BASELINE_DY = 12.3; // baseline = haut de ligne + 12,3

/** Encadrés synthèse (gauche) et discipline (droite). */
const BOTTOM_BOX_TOP = 525.5;
const BOTTOM_BOX_H = 92.5;
const SYNTH = { x0: 45.7, x1: 295, titleBaseline: 537.8 };
const DISCIPLINE = { x0: 300, x1: 549.9, titleBaseline: 537.8 };
const SYNTH_BASELINES = [560.4, 579.1, 594.1, 608.3];
const DISC_BASELINES = [557.5, 571.7, 585.9, 600.2];

/** Appréciation globale. */
const APPR_BOX = { x0: 45.7, x1: 549.9, top: 628, bottom: 682 };
const APPR_TITLE_BASELINE = 642.9;
const APPR_MENTION_BASELINE = 654.4;
const APPR_TEXT_BASELINE = 666.6;

/** Trois encadrés de signature. */
const SIG_BOXES = {
  top: 688.8, bottom: 744.2,
  titleBaseline: 701.2, placeholderBaseline: 736,
  boxes: [
    { x0: 46.4, x1: 200.8 },
    { x0: 220.0, x1: 374.4 },
    { x0: 393.7, x1: 549.5 },
  ],
};


// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Texte centré. */
const centered = (doc: jsPDF, text: string, cx: number, baseline: number): void => {
  doc.text(text, cx, baseline, { align: 'center' });
};

/** Nombre /20 formaté « 12.44 » (zero-pad sous 10, comme le gabarit) — null → « -- ». */
const fmt = (v: number | null, empty = '--'): string => {
  if (v === null || Number.isNaN(v)) return empty;
  const str = v.toFixed(2);
  return v < 10 ? `0${str}` : str;
};

/** Somme des coefficients affichée sans décimale inutile. */
const fmtCoeff = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/**
 * Appréciation automatique selon la moyenne (barème du bulletin) :
 * < 10 Insuffisant · 10–11,99 Passable · 12–13,99 Assez bien · 14–15,99 Bien ·
 * 16–17,99 Très bien · 18–20 Excellent. La moyenne est arrondie à 2 décimales
 * avant classement pour rester cohérente avec l'affichage.
 */
export const appreciationFor = (v: number | null): string => {
  if (v === null || Number.isNaN(v)) return 'Insuffisant';
  const r = Math.round(v * 100) / 100;
  if (r >= 18) return 'Excellent';
  if (r >= 16) return 'Très bien';
  if (r >= 14) return 'Bien';
  if (r >= 12) return 'Assez bien';
  if (r >= 10) return 'Passable';
  return 'Insuffisant';
};


/**
 * Totaux du tableau : total des (moyenne matière × coef) et somme des coefs des matières évaluées.
 * La moyenne trimestrielle affichée = total général ÷ somme des coefs.
 */
const computeTotals = (subjects: BulletinSubjectRow[]) => {
  let totalGeneral = 0;
  let totalCoefs = 0;
  for (const s of subjects) {
    if (s.average !== null && !Number.isNaN(s.average)) {
      totalGeneral += s.average * s.coefficient;
      totalCoefs += s.coefficient;
    }
  }
  return { totalGeneral, totalCoefs };
};

/** Pose une image en gardant son ratio dans le cadre ; jamais d'erreur fatale. */
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

/** « 10 » + « e » en exposant (comme le gabarit). */
const drawOrdinal = (doc: jsPDF, value: string, cx: number, baseline: number): void => {
  const main = doc.getTextWidth(value);
  const eSize = 7.07;
  doc.setFontSize(eSize);
  const eW = doc.getTextWidth('e');
  const x0 = cx - (main + eW) / 2;
  doc.setFontSize(8.49);
  doc.text(value, x0, baseline);
  doc.setFontSize(eSize);
  doc.text('e', x0 + main, baseline - 2.5);
};


// ── En-tête & titre ──────────────────────────────────────────────────────────

const drawHeader = (doc: jsPDF, bulletin: BulletinData, school: ReceiptSchoolInfo): void => {
  addImageSafe(doc, stateAsset, HEAD_STATE.x, HEAD_STATE.y, HEAD_STATE.w, HEAD_STATE.h);
  addImageSafe(doc, csjAsset, HEAD_CSJ.x, HEAD_CSJ.y, HEAD_CSJ.w, HEAD_CSJ.h);

  // RÉPUBLIQUE TOGOLAISE (bordeaux, gras).
  doc.setFont('times', 'bold');
  doc.setFontSize(9.99);
  doc.setTextColor(...MARRON);
  centered(doc, winAnsi('RÉPUBLIQUE TOGOLAISE'), CENTER_X, HEAD_BASELINES[0]);

  // « Travail - Liberté - Patrie » (or, italique).
  doc.setFont('times', 'italic');
  doc.setFontSize(7.99);
  doc.setTextColor(180, 83, 9);
  centered(doc, winAnsi("Travail - Liberté - Patrie"), CENTER_X, HEAD_BASELINES[1]);

  // Ministère + direction régionale (slate) : ministry_name si renseigné.
  doc.setFont('times', 'normal');
  doc.setTextColor(...SLATE);
  const ministry = school.ministry_name?.trim()
    ? school.ministry_name.split('\n').map(l => l.trim()).filter(Boolean)
    : ["Ministère de l'Enseignement Primaire, Secondaire et de l'Artisanat",
       'Direction Régionale de l’Éducation (DRE-Maritime)'];
  doc.setFontSize(7.49);
  fitSize(doc, winAnsi(ministry[0] ?? ''), 240, 7.49, 6);
  centered(doc, winAnsi(ministry[0] ?? ''), CENTER_X, HEAD_BASELINES[2]);
  const second = ministry[1] ?? 'Direction Régionale de l’Éducation (DRE-Maritime)';
  fitSize(doc, winAnsi(second), 240, 7.49, 6);
  centered(doc, winAnsi(second), CENTER_X, HEAD_BASELINES[3]);

  // Nom de l'école (bordeaux, gras) — repli Orion.
  doc.setFont('times', 'bold');
  doc.setFontSize(10.98);
  doc.setTextColor(...MARRON);
  const name = winAnsi((school.name || 'ÉTABLISSEMENT').toUpperCase());
  centered(doc, name, CENTER_X, HEAD_BASELINES[4]);

  // Filet bordeaux sous l'en-tête.
  doc.setFillColor(...MARRON);
  doc.rect(TITLE_RULE.x0, TITLE_RULE.y, TITLE_RULE.x1 - TITLE_RULE.x0, TITLE_RULE.h, 'F');

  // Encadré titre : fond jaune, filets or, barres bordeaux à gauche/droite.
  doc.setFillColor(...TITLE_BG);
  doc.rect(TITLE_BOX.x0, TITLE_BOX.top, TITLE_BOX.x1 - TITLE_BOX.x0, TITLE_BOX.bottom - TITLE_BOX.top, 'F');
  doc.setFillColor(...OR);
  doc.rect(TITLE_BOX.x0, TITLE_BOX.top, TITLE_BOX.x1 - TITLE_BOX.x0, 0.75, 'F');
  doc.rect(TITLE_BOX.x0, TITLE_BOX.bottom - 0.75, TITLE_BOX.x1 - TITLE_BOX.x0, 0.75, 'F');
  doc.setFillColor(...MARRON);
  doc.rect(TITLE_BOX.x0, TITLE_BOX.top, TITLE_BOX.bar, TITLE_BOX.bottom - TITLE_BOX.top, 'F');
  doc.rect(TITLE_BOX.x1 - TITLE_BOX.bar, TITLE_BOX.top, TITLE_BOX.bar, TITLE_BOX.bottom - TITLE_BOX.top, 'F');

  // « BULLETIN DU … TRIMESTRE » + année scolaire.
  const periodLabel = ['PREMIER', 'DEUXIÈME', 'TROISIÈME'][Math.min(Math.max(bulletin.periodOrder, 1), 3) - 1];
  doc.setFont('times', 'bold');
  doc.setFontSize(12.98);
  doc.setTextColor(...MARRON);
  const title = winAnsi(`BULLETIN DU ${periodLabel} TRIMESTRE`);
  fitSize(doc, title, 340, 12.98, 9);
  centered(doc, title, CENTER_X, TITLE_BASELINE);
  doc.setFont('times', 'normal');
  doc.setFontSize(8.49);
  doc.setTextColor(...GOLD_TEXT);
  const year = winAnsi(`ANNÉE SCOLAIRE : ${bulletin.yearName.replace(/-/g, ' - ')}`);
  centered(doc, year, CENTER_X, SUBTITLE_BASELINE);
};

// ── Bloc élève ───────────────────────────────────────────────────────────────

const drawInfoBox = (doc: jsPDF, bulletin: BulletinData): void => {
  doc.setFillColor(...INFO_BG);
  doc.rect(INFO_BOX.x0, INFO_BOX.top, INFO_BOX.x1 - INFO_BOX.x0, INFO_BOX.bottom - INFO_BOX.top, 'F');
  // Grille discrète : milieu horizontal + 3 séparateurs verticaux (relevé).
  doc.setFillColor(...GRID);
  doc.rect(INFO_BOX.x0, INFO_BOX.midY, INFO_BOX.x1 - INFO_BOX.x0, 0.75, 'F');
  INFO_VX.forEach(x => doc.rect(x - 0.375, INFO_BOX.top, 0.75, INFO_BOX.bottom - INFO_BOX.top, 'F'));

  const [l1, l2] = INFO_BASELINES;
  const label = (text: string, x: number, baseline: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.49);
    doc.setTextColor(...LABEL);
    doc.text(winAnsi(text), x, baseline);
  };
  const value = (text: string, x: number, baseline: number, maxW: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.49);
    doc.setTextColor(...VALUE);
    doc.text(truncate(doc, winAnsi(text), maxW), x, baseline);
  };

  const fullName = [bulletin.studentLastName, bulletin.studentFirstName].filter(Boolean).join(' ').trim() || '—';
  label('Nom & Prénoms :', INFO_COLS.labelL, l1);
  value(fullName, INFO_COLS.valueL, l1, 155);
  label('Matricule :', INFO_COLS.labelR, l1);
  value(bulletin.matricule ?? '—', INFO_COLS.valueR, l1, 150);
  label('Classe :', INFO_COLS.labelL, l2);
  value(bulletin.className ?? '—', INFO_COLS.valueL, l2, 155);
  label('Effectif :', INFO_COLS.labelR, l2);
  value(`${bulletin.classSize} Élèves`, INFO_COLS.valueR, l2, 150);
};

// ── Tableau des matières ─────────────────────────────────────────────────────

const drawTable = (doc: jsPDF, bulletin: BulletinData): void => {
  const { subjects } = bulletin;
  const count = Math.max(subjects.length, 1);

  // Hauteur de ligne dynamique : le tableau (jusqu'à la ligne TOTAL) tient
  // toujours au-dessus des encadrés de synthèse (y ≈ 525).
  const available = 525 - TABLE.firstRowTop - TABLE.totalH - 6;
  const rowH = Math.min(TABLE.rowH, available / count);
  const totalTop = TABLE.firstRowTop + count * rowH;

  // En-tête bordeaux.
  doc.setFillColor(...MARRON);
  doc.rect(TABLE.x0, TABLE.headTop, TABLE.x1 - TABLE.x0, TABLE.headBottom - TABLE.headTop, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.49);
  doc.setTextColor(255, 255, 255);
  COL_HEADERS.forEach((h, i) => {
    const [x0, x1] = COLS[i];
    centered(doc, h, (x0 + x1) / 2, HEAD_CELL_BASELINE);
  });

  subjects.forEach((s, i) => {
    const top = TABLE.firstRowTop + i * rowH;
    // Lignes impaires : rose pâle (relevé du gabarit).
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ROSE);
      doc.rect(TABLE.x0, top, TABLE.x1 - TABLE.x0, rowH, 'F');
    }
    const baseline = top + ROW_TEXT_BASELINE_DY * (rowH / TABLE.rowH);
    doc.setFontSize(8.49);
    doc.setTextColor(...ROW_TEXT);

    // Matière (gras, tronquée à la colonne).
    doc.setFont('helvetica', 'bold');
    const name = winAnsi(s.name);
    fitSize(doc, name, COLS[0][1] - COLS[0][0] - 10, 8.49, 6.5);
    doc.text(truncate(doc, name, COLS[0][1] - COLS[0][0] - 10), COLS[0][0] + 5, baseline);

    const cell = (text: string, col: number, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(8.49);
      const [x0, x1] = COLS[col];
      const cx = (x0 + x1) / 2;
      doc.text(text, cx, baseline, { align: 'center' });
    };

    cell(fmtCoeff(s.coefficient), 1, true);
    cell(fmt(s.interro), 2);
    cell(fmt(s.devoir), 3);
    cell(fmt(s.compo), 4);
    // Moyenne de la matière = somme des évaluations faites ÷ nombre d'évaluations faites
    cell(fmt(s.average), 5, true);
    cell(s.average !== null ? fmt(s.average * s.coefficient) : '--', 6);

    // Rang avec exposant « e ».
    if (s.rank !== null) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.49);
      doc.setTextColor(...ROW_TEXT);
      drawOrdinal(doc, String(s.rank), (COLS[7][0] + COLS[7][1]) / 2, baseline);
    } else {
      cell('--', 7);
    }

    // Appréciation automatique selon la moyenne de la matière (barème officiel).
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.49);
    const appr = winAnsi(s.average !== null ? appreciationFor(s.average) : '—');
    fitSize(doc, appr, COLS[8][1] - COLS[8][0] - 8, 8.49, 6);
    centered(doc, truncate(doc, appr, COLS[8][1] - COLS[8][0] - 8), (COLS[8][0] + COLS[8][1]) / 2, baseline);
  });

  // Ligne TOTAL GÉNÉRALE (bandeau bordeaux).
  doc.setFillColor(...MARRON);
  doc.rect(TABLE.x0, totalTop, TABLE.x1 - TABLE.x0, TABLE.totalH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.99);
  const tb = totalTop + TABLE.totalH * 0.62;
  doc.text('TOTAL GÉNÉRAL', COLS[0][0] + 5, tb);

  const totalCell = (text: string, col: number) => {
    const [x0, x1] = COLS[col];
    doc.text(text, (x0 + x1) / 2, tb, { align: 'center' });
  };
  const coeffSum = subjects.reduce((sum, s) => sum + s.coefficient, 0);
  // Total général = Σ (moyenne matière × coef) — toujours chiffré (notes absentes = 0).
  const { totalGeneral } = computeTotals(subjects);
  totalCell(fmtCoeff(coeffSum), 1);
  totalCell('—', 2);
  totalCell('—', 3);
  totalCell('—', 4);
  totalCell('—', 5);
  totalCell(fmt(totalGeneral), 6);
  totalCell('—', 7);
  totalCell('—', 8);
  void count;
};



// ── Synthèse, discipline, appréciation, signatures ───────────────────────────

/** Encadré à coins arrondis (bordure fine, fond blanc). */
const roundedBox = (doc: jsPDF, x0: number, top: number, x1: number, bottom: number): void => {
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.75);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x0, top, x1 - x0, bottom - top, 4, 4, 'FD');
};

const drawBottomBoxes = (doc: jsPDF, bulletin: BulletinData): void => {
  const bottom = BOTTOM_BOX_TOP + BOTTOM_BOX_H;
  roundedBox(doc, SYNTH.x0, BOTTOM_BOX_TOP, SYNTH.x1, bottom);
  roundedBox(doc, DISCIPLINE.x0, BOTTOM_BOX_TOP, DISCIPLINE.x1, bottom);

  // ── Synthèse des résultats (gauche) ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.99);
  doc.setTextColor(...MARRON);
  doc.text('SYNTHÈSE DES RÉSULTATS', SYNTH.x0 + 7.1, SYNTH.titleBaseline);

  const label = (text: string, x: number, baseline: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.49);
    doc.setTextColor(...ROW_TEXT);
    doc.text(winAnsi(text), x, baseline);
  };

  label('Moyenne Trimestrielle :', SYNTH.x0 + 7.1, SYNTH_BASELINES[0]);
  // Moyenne trimestrielle = total général ÷ somme des coefficients.
  const { totalGeneral, totalCoefs } = computeTotals(bulletin.subjects);
  const moyenne = totalCoefs > 0 ? totalGeneral / totalCoefs : null;
  // Badge rose autour de la moyenne (droite du bloc).
  const avgText = fmt(moyenne);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.98);
  const avgW = doc.getTextWidth(avgText);
  doc.setFillColor(...BADGE_ROSE);
  doc.roundedRect(287 - avgW - 10, SYNTH_BASELINES[0] - 9.5, avgW + 14, 13, 3, 3, 'F');
  doc.setTextColor(...MARRON);
  doc.text(avgText, 287 - avgW - 3, SYNTH_BASELINES[0] - 0.5);

  label("Rang de l'élève :", SYNTH.x0 + 7.1, SYNTH_BASELINES[1]);
  if (bulletin.rank !== null) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.49);
    doc.setTextColor(...ROW_TEXT);
    drawOrdinal(doc, String(bulletin.rank), 280, SYNTH_BASELINES[1]);
  }

  label('Moyenne de la Classe :', SYNTH.x0 + 7.1, SYNTH_BASELINES[2]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.49);
  doc.setTextColor(...ROW_TEXT);
  const classAvg = bulletin.classAverage !== null ? `${fmt(bulletin.classAverage)} / 20` : '--';
  doc.text(classAvg, 287 - doc.getTextWidth(classAvg), SYNTH_BASELINES[2]);

  label('Plus Forte / Faible Moy. :', SYNTH.x0 + 7.1, SYNTH_BASELINES[3]);
  const extremes = `${fmt(bulletin.bestAverage)}    |    ${fmt(bulletin.worstAverage)}`;
  doc.text(extremes, 287 - doc.getTextWidth(extremes), SYNTH_BASELINES[3]);

  // ── Discipline & assiduité (droite) : sans source de données, tirets ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.99);
  doc.setTextColor(...MARRON);
  doc.text('DISCIPLINE & ASSIDUITÉ', DISCIPLINE.x0 + 9, DISCIPLINE.titleBaseline);

  const discRows: [string, string][] = [
    ['Absences Non Justifiées :', '—'],
    ['Nombre de Retards :', '—'],
    ['Avertissement Discipline :', 'Aucun'],
    ['Tenue & Conduite :', '—'],
  ];
  discRows.forEach(([l, v], i) => {
    label(l, DISCIPLINE.x0 + 9, DISC_BASELINES[i]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.49);
    doc.setTextColor(...ROW_TEXT);
    doc.text(v, 542.8 - doc.getTextWidth(v), DISC_BASELINES[i]);
  });
};


const drawAppreciation = (doc: jsPDF, bulletin: BulletinData): void => {
  roundedBox(doc, APPR_BOX.x0, APPR_BOX.top, APPR_BOX.x1, APPR_BOX.bottom);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.99);
  doc.setTextColor(...MARRON);
  doc.text('APPRÉCIATION GLOBALE & MENTIONS DU CONSEIL :', APPR_BOX.x0 + 10.8, APPR_TITLE_BASELINE);

  // Mentions : déduites de la moyenne affichée et du rang (aucune donnée en base).
  // Moyenne affichée = total général ÷ somme des coefs (règle du bulletin).
  const { totalGeneral, totalCoefs } = computeTotals(bulletin.subjects);
  const avg = totalCoefs > 0 ? totalGeneral / totalCoefs : null;
  const honor = bulletin.rank !== null && bulletin.rank <= 3;
  const mention = honor ? 'honor' : avg !== null && avg >= 10 ? 'encouragement' : 'warning';
  const boxes: { key: string; text: string }[] = [
    { key: 'honor', text: '[  ] Tableau d\'Honneur' },
    { key: 'encouragement', text: '[  ] Encouragements' },
    { key: 'warning', text: '[   ] Mise en Garde' },
  ];
  let mx = APPR_BOX.x0 + 10.8;
  boxes.forEach(({ key, text }) => {
    // Seule la mention retenue reçoit la croix (jamais plus d'une).
    const finalText = key === mention ? text.replace('[  ]', '[X]').replace('[   ]', '[X]') : text;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.99);
    doc.setTextColor(...MARRON);
    doc.text(finalText, mx, APPR_MENTION_BASELINE);
    mx += doc.getTextWidth(finalText) + 12;
  });

  // Texte d'appréciation : écrit par le conseil s'il existe, sinon l'appréciation
  // automatique correspondant à la moyenne trimestrielle (barème officiel).
  const own = bulletin.globalAppreciation.trim() || appreciationFor(avg);
  const text = winAnsi(own);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.49);
  doc.setTextColor(...SLATE);
  const maxW = APPR_BOX.x1 - APPR_BOX.x0 - 21.6;
  const lines = doc.splitTextToSize(
    `« ${text} »`, maxW,
  ) as string[];
  doc.text(lines.slice(0, 2), APPR_BOX.x0 + 10.8, APPR_TEXT_BASELINE);
};

const drawSignatures = (doc: jsPDF, bulletin: BulletinData, school: ReceiptSchoolInfo): void => {
  const titles = ['Le Titulaire', 'Le Parent / Tuteur', 'Le Directeur / Principal'];
  const placeholders = [
    bulletin.homeroomTeacher?.trim() || '—',
    'Signature & Date',
    '[ Cachet & Signature ]',
  ];
  SIG_BOXES.boxes.forEach((box, i) => {
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.75);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(box.x0, SIG_BOXES.top, box.x1 - box.x0, SIG_BOXES.bottom - SIG_BOXES.top, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.49);
    doc.setTextColor(...SLATE);
    centered(doc, titles[i], (box.x0 + box.x1) / 2, SIG_BOXES.titleBaseline);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.99);
    if (i === 2 && school.signature_url) {
      // Cachet / signature numérique des réglages, dans la zone basse.
      addImageSafe(doc, school.signature_url, box.x0 + 10, SIG_BOXES.top + 30, box.x1 - box.x0 - 20, 40);
    } else {
      doc.setTextColor(...MUTED);
      centered(doc, placeholders[i], (box.x0 + box.x1) / 2, SIG_BOXES.placeholderBaseline);
    }
  });
};


// ── Construction ─────────────────────────────────────────────────────────────

/** Construit le PDF du bulletin (une page A4 portrait). */
export function buildBulletinPdf(opts: BulletinDocOptions): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait' });

  // Fond gris de la page + carte blanche (le contour du gabarit).
  doc.setFillColor(...GRID);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(0, CARD.top, PAGE_W, CARD.bottom - CARD.top, 'F');

  drawHeader(doc, opts.bulletin, opts.school);
  drawInfoBox(doc, opts.bulletin);
  drawTable(doc, opts.bulletin);
  drawBottomBoxes(doc, opts.bulletin);
  drawAppreciation(doc, opts.bulletin);
  drawSignatures(doc, opts.bulletin, opts.school);

  return doc;
}

/** Nom de fichier : un bulletin → nom de l'élève ; sinon export groupé. */
export function bulletinFileName(bulletins: BulletinData[], yearName: string): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9 -]/g, '_').replace(/\s+/g, '_').slice(0, 40);
  const periodLabel = ['T1', 'T2', 'T3'][(bulletins[0]?.periodOrder ?? 1) - 1] ?? 'T1';
  if (bulletins.length === 1) {
    const b = bulletins[0];
    const name = [b.studentLastName, b.studentFirstName].filter(Boolean).join(' ').trim() || 'eleve';
    return `Bulletin_${sanitize(name)}_${periodLabel}.pdf`;
  }
  const year = yearName.replace(/[^a-zA-Z0-9-]/g, '_') || 'annee';
  return `Bulletins_Eleves_${periodLabel}_${year}.pdf`;
}
