import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { genderCode, type NominalListClassInput } from './nominalListTemplate';

// ─────────────────────────────────────────────────────────────────────────────
// PDF « liste_de_presence.pdf » (A4 paysage 841,92 × 595,32 pt).
//
// Le modèle est un PDF Word figé : on le COPIE page par page puis on pose les
// données (classe, année, encadré G/F/T, N° + NOM) dans les repères mesurés sur
// son flux de contenu (coordonnées PDF natives, origine en bas à gauche).
// Aucune valeur n'est inventée : elles viennent de smoke/parse_presence*.cjs.
//
// Sans ces repères, des coordonnées « à la main » (y = height − 50, pas de 20 pt)
// écrasaient le titre, l'encadré G/F/T et débordaient dans les colonnes des
// jours — c'est le débordement signalé sur l'aperçu.
// ─────────────────────────────────────────────────────────────────────────────

export const nominalListFileName = (
  classes: NominalListClassInput[],
  groupLabel: string,
  yearName: string,
  type: string
) => {
  const safeGroup = groupLabel.replace(/[^a-z0-9]/gi, '_');
  const safeYear = yearName.replace(/[^a-z0-9]/gi, '_');
  const name = classes.length === 1 ? classes[0].name.replace(/[^a-z0-9]/gi, '_') : 'Classes';
  return `Liste_${type}_${name}_${safeGroup}_${safeYear}.pdf`;
};

const GEOM = {
  /** Valeur après le « CLASSE : » du modèle (baseline 551,2 ; page à 841,92). */
  classField: { x: 718, baseline: 551.2, size: 11, maxW: 100 },
  /** « Année : … » centré sous le titre, dans la bande libre 488…530 pt. */
  yearField: { centerX: (354.05 + 507.07) / 2, baseline: 510, size: 11, maxW: 240 },
  /** Cellules de valeurs de l'encadré G / F / T (sous les lettres, baseline 516,6). */
  gft: { centers: [686.3, 728.7, 771.2] as const, baseline: 516.6, size: 12 },
  table: {
    /** Filet sous l'en-tête « N° + jours » et filet bas du cadre. */
    headerBottom: 448.1,
    bottomRule: 37.8,
    /** 28 lignes d'élèves entre ces deux filets (mesuré). */
    rows: 28,
    /** Colonne NOM : filets du modèle de 56,9 à 240,6 ; texte calé à 62. */
    nameX: 62,
    nameMaxW: 176,
    /** Colonne N° : 21,4 → 56,9 ; le numéro est centré à 43. */
    noCenterX: 43,
    size: 10.5,
    minSize: 7,
    /** baseline = bas de ligne + 4,5 (relevé sur les espaces du modèle). */
    baselineOffset: 4.5,
  },
} as const;

/** Pas vertical réel des lignes : (448,1 − 37,8) / 28 = 14,6536 pt. */
const ROW_STEP = (GEOM.table.headerBottom - GEOM.table.bottomRule) / GEOM.table.rows;

/** Baseline de la ligne `row` (0 = première ligne sous l'en-tête). */
const rowBaseline = (row: number): number =>
  GEOM.table.headerBottom - (row + 1) * ROW_STEP + GEOM.table.baselineOffset;

/**
 * WinAnsi (polices standard pdf-lib) : normalise les caractères typographiques
 * puis retire tout caractère non encodable pour éviter un plantage de drawText.
 */
const winAnsi = (s: string): string =>
  s
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\u0020-\u00FF]/g, '');

/** Réduit la taille (par pas de 0,25) jusqu'à faire tenir `text` dans `maxW`. */
const fitSize = (text: string, font: PDFFont, maxW: number, base: number, min: number): number => {
  for (let s = base; s > min; s -= 0.25) {
    if (font.widthOfTextAtSize(text, s) <= maxW) return s;
  }
  return min;
};

/** Coupe avec « ... » quand même la taille minimale ne tient pas. */
const truncate = (text: string, font: PDFFont, size: number, maxW: number): string => {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(`${text.slice(0, mid).trimEnd()}...`, size) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}...`;
};

/**
 * Génère le PDF de liste de présence : une page du modèle par tranche de
 * 28 élèves (numérotation continue), en-tête + encadré G/F/T redessinés.
 */
export const buildPresenceListPdf = async (
  classes: NominalListClassInput[],
  _groupLabel: string,
  yearName: string
): Promise<Uint8Array> => {
  // Chargement du fichier PDF de modèle depuis le dossier public
  const url = '/liste_de_presence.pdf';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Impossible de charger le modèle de liste de présence.');
  }
  const templateBytes = await response.arrayBuffer();

  const out = await PDFDocument.create();
  const regular = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const srcDoc = await PDFDocument.load(templateBytes);

  const yearLabel = winAnsi(`Année : ${yearName}`);

  for (const cls of classes) {
    const students = [...cls.students].sort(
      (a, b) =>
        (a.lastName || '').localeCompare(b.lastName || '') ||
        (a.firstName || '').localeCompare(b.firstName || '')
    );

    const className = winAnsi(cls.name);
    let boys = 0;
    let girls = 0;
    for (const st of students) {
      const g = genderCode(st.gender);
      if (g === 'M') boys += 1;
      else if (g === 'F') girls += 1;
    }
    // G = garçons, F = filles, T = total (comme sur la liste nominative).
    const gftValues = [String(boys), String(girls), String(students.length)];

    const parts = Math.max(1, Math.ceil(students.length / GEOM.table.rows));
    for (let part = 0; part < parts; part += 1) {
      const [page] = await out.copyPages(srcDoc, [0]);
      const pdfPage = out.addPage(page);

      // ── Valeur du champ « CLASSE : » ──
      const classSize = fitSize(className, bold, GEOM.classField.maxW, GEOM.classField.size, 7.5);
      pdfPage.drawText(truncate(className, bold, classSize, GEOM.classField.maxW), {
        x: GEOM.classField.x,
        y: GEOM.classField.baseline,
        size: classSize,
        font: bold,
        color: black,
      });

      // ── Année scolaire centrée sous le titre ──
      const yearSize = fitSize(yearLabel, regular, GEOM.yearField.maxW, GEOM.yearField.size, 7.5);
      const yearWidth = regular.widthOfTextAtSize(yearLabel, yearSize);
      pdfPage.drawText(yearLabel, {
        x: GEOM.yearField.centerX - yearWidth / 2,
        y: GEOM.yearField.baseline,
        size: yearSize,
        font: regular,
        color: black,
      });

      // ── Encadré G / F / T ──
      gftValues.forEach((value, i) => {
        const w = bold.widthOfTextAtSize(value, GEOM.gft.size);
        pdfPage.drawText(value, {
          x: GEOM.gft.centers[i] - w / 2,
          y: GEOM.gft.baseline,
          size: GEOM.gft.size,
          font: bold,
          color: black,
        });
      });

      // ── Lignes d'élèves : N° centré, NOM calé à 62 et réduit pour tenir ──
      const start = part * GEOM.table.rows;
      const end = Math.min(students.length, start + GEOM.table.rows);
      for (let k = start; k < end; k += 1) {
        const st = students[k];
        const raw = `${(st.lastName || '').trim()} ${(st.firstName || '').trim()}`.replace(/\s+/g, ' ').trim();
        const label = winAnsi(raw.toUpperCase()) || '—';
        const baseline = rowBaseline(k - start);

        const num = String(k + 1);
        const numWidth = regular.widthOfTextAtSize(num, GEOM.table.size);
        pdfPage.drawText(num, {
          x: GEOM.table.noCenterX - numWidth / 2,
          y: baseline,
          size: GEOM.table.size,
          font: regular,
          color: black,
        });

        const size = fitSize(label, regular, GEOM.table.nameMaxW, GEOM.table.size, GEOM.table.minSize);
        pdfPage.drawText(truncate(label, regular, size, GEOM.table.nameMaxW), {
          x: GEOM.table.nameX,
          y: baseline,
          size,
          font: regular,
          color: black,
        });
      }
    }
  }

  return out.save();
};

