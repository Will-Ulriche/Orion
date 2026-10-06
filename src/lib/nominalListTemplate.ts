// ─────────────────────────────────────────────────────────────────────────────
// Gabarit « LISTE NOMINATIVE DE LA CLASSE »
//
// Toute la géométrie ci-dessous a été relevée sur le modèle PDF fourni
// (Word → export PDF, A4 paysage) et est exprimée en POINTS PDF (1 pt = 1/72"),
// unités natives du fichier. Les valeurs correspondent au modèle au dixième de
// point près : ne pas les « arrondir », la reproduction se décalerait.
//
// L'aperçu HTML et le PDF généré consomment tous deux ce module, ce qui garantit
// que les deux rendus sont superposables.
// ─────────────────────────────────────────────────────────────────────────────

/** Format de la page : A4 paysage. */
export const PAGE = {
  width: 841.92,
  height: 595.32,
} as const;

/** Épaisseur des filets de tableau (Word dessine un rectangle plein de 0,48 pt). */
export const BORDER = 0.48;

/**
 * Word ancre le bord sur sa coordonnée et l'étend vers la droite/le bas ;
 * pour un tracé au centre du chemin il faut donc décaler de la moitié.
 */
export const BORDER_SHIFT = BORDER / 2;

// ── Images ───────────────────────────────────────────────────────────────────
// Rectangles de placement relevés dans le PDF (x, y, largeur, hauteur).

export const IMAGES = {
  logo: { x: 14.2, y: 9.6, w: 128.39, h: 64.2 },
  qr: { x: 135.6, y: 25.8, w: 34.2, h: 34.2 },
  watermark: { x: 224.3, y: 154.78, w: 383.15, h: 364.2 },
} as const;

/**
 * Bande horizontale libre entre les images (qui s'arrêtent à 169,80 pt) et le
 * bloc « CLASSE : » (694,54 pt). Le titre du modèle y est centré.
 */
export const TITLE_BAND = { left: 169.8, right: 694.54 } as const;
export const TITLE_BAND_CENTER = (TITLE_BAND.left + TITLE_BAND.right) / 2;

// ── Titres et libellés ───────────────────────────────────────────────────────
// `baseline` est la ligne de base mesurée (et non la hauteur de la boîte).

export const TEXT = {
  brand: {
    label: 'ORION COLLEGE EXPERIENCE',
    size: 20.04,
    baseline: 41.76,
    color: [0, 51, 204] as const, // #0033CC
  },
  classLabel: {
    label: 'CLASSE :',
    size: 11.04,
    baseline: 44.16,
    x: 694.54,
  },
  title: {
    label: 'LISTE NOMINATIVE DE LA CLASSE',
    size: 15.96,
    baseline: 62.54,
    /**
     * Bord gauche du titre, relevé sur le modèle. Le titre y est centré, mais on
     * l'ancre ici plutôt que de le recalculer : les Times du modèle et celles des
     * deux rendus (Times New Roman puis Times-Roman) ont des métriques quasi
     * identiques, donc cette position est reproductible au dixième de point.
     * C'est l'inverse du bandeau, dont le substitut (Arial Narrow) est bien plus
     * large qu'Anton et doit rester centré.
     */
    x: 298.61,
    /**
     * Filet noir qui souligne le titre dans le modèle.
     * `dy` est mesuré depuis la ligne de base du titre ; `width` est la largeur du
     * texte en Times New Roman (la police de l'aperçu HTML). Le PDF mesure la
     * sienne, qui diffère de quelques points.
     */
    underline: { dy: 1.68, thickness: 0.72, width: 263.9 },
  },
  footer: {
    label: 'Orion Exp',
    size: 12,
    baseline: 580.32,
    x: 32.04,
  },
} as const;

// ── Encadré G / F / T (effectifs garçons / filles / total) ────────────────────

export const GFT = {
  colEdges: [694.42, 736.78, 779.26, 821.76] as const,
  rowEdges: [52.92, 68.06, 83.18] as const,
  /** Fonds des trois colonnes, dans l'ordre G / F / T. */
  fills: [
    [213, 220, 228],
    [251, 228, 213],
    [255, 242, 204],
  ] as const,
  labels: ['G', 'F', 'T'] as const,
  labelBaseline: 64.82,
  valueBaseline: 79.94,
  size: 12,
} as const;

// ── Bandeau des trimestres ───────────────────────────────────────────────────

export const TRIMESTERS = {
  colEdges: [360.53, 502.87, 651.94, 821.76] as const,
  rowEdges: [97.94, 111.86] as const,
  fill: [242, 242, 242] as const,
  labels: ['TRIMESTRE 1', 'TRIMESTRE 2', 'TRIMESTRE 3'] as const,
  baseline: 108.86,
  size: 11.04,
} as const;

// ── Tableau principal ────────────────────────────────────────────────────────

/** 16 lignes verticales → 15 colonnes. */
export const COL_EDGES = [
  30.36, 65.52, 320.81, 356.21, 391.73, 427.13, 462.55, 502.75,
  538.27, 573.67, 609.19, 651.70, 694.18, 736.78, 779.26, 821.76,
] as const;

/**
 * 29 lignes horizontales : la 1ʳᵉ est le bord haut de l'en-tête de colonnes, la
 * 2ᵉ son bord bas, les 27 suivantes délimitent les 27 lignes d'élèves du modèle.
 */
export const ROW_EDGES = [
  117.14, 131.06, 146.18, 161.3, 176.42, 191.69, 206.81, 221.93, 237.05,
  252.17, 267.41, 282.53, 297.65, 312.79, 328.03, 343.15, 358.27, 373.39,
  388.63, 403.75, 418.87, 433.99, 449.26, 464.38, 479.5, 494.62, 509.86,
  524.98, 540.1,
] as const;

/** Lignes de base des 27 lignes d'élèves du modèle. */
export const ROW_BASELINES = [
  142.94, 158.06, 173.18, 188.33, 203.57, 218.69, 233.81, 248.93, 264.17,
  279.29, 294.41, 309.53, 324.79, 339.91, 355.03, 370.15, 385.39, 400.51,
  415.63, 430.75, 445.9, 461.14, 476.26, 491.38, 506.5, 521.74, 536.86,
] as const;

/** Nombre d'élèves que le modèle Printing tient sur une page. */
export const ROWS_PER_PAGE = ROW_BASELINES.length; // 27

/** Marge intérieure des cellules (alignement à gauche). */
export const PAD_X = 5.64;

/** Taille de police de l'en-tête de colonnes. */
export const HEAD_SIZE = 11.04;

/** Lignes de base de l'en-tête de colonnes : deux polices dans le modèle. */
export const HEAD_BASELINE = {
  serif: 127.82, // Times New Roman
  sans: 128.06, // Calibri
} as const;

/**
 * Le « e » de « MG » : le document d'origine le place 0,96 pt *plus bas* que la
 * ligne de base de « MG » (et non en exposant) — valeur relevée, à reproduire.
 */
export const SUPERSCRIPT = { size: 6.96, dy: 0.96 } as const;

/** Le « e » représente 63 % de la taille de l'en-tête (6,96 / 11,04). */
export const SUPERSCRIPT_RATIO = Math.round((SUPERSCRIPT.size / HEAD_SIZE) * 100) / 100;

export type HeadAlign = 'left' | 'center';

export interface HeadColumn {
  /** Libellé ; `superscript` est ajouté en exposant juste après. */
  label: string;
  superscript?: string;
  align: HeadAlign;
  font: 'serif' | 'sans';
}

/**
 * Les 15 colonnes du modèle, dans l'ordre.
 *
 * Deux particularités du document d'origine sont reproduites telles quelles :
 *   • la colonne 8 est libellée « I1 » (et non « I ») ;
 *   • les « I » du 1er et du 2e trimestre sont en Times, celui du 3e en Calibri —
 *     incohérence de saisie dans le modèle, conservée volontairement.
 *
 * Les colonnes 4 à 15 restent vides : elles sont destinations des notes.
 */
export const HEAD_COLUMNS: readonly HeadColumn[] = [
  { label: 'N°', align: 'center', font: 'serif' },
  { label: 'NOM ET PRENOM', align: 'left', font: 'serif' },
  { label: 'Sexe', align: 'left', font: 'serif' },
  { label: 'I', align: 'center', font: 'serif' },
  { label: 'D', align: 'center', font: 'sans' },
  { label: 'C', align: 'center', font: 'sans' },
  { label: 'MG', superscript: 'e', align: 'center', font: 'sans' },
  { label: 'I1', align: 'center', font: 'serif' },
  { label: 'D', align: 'center', font: 'sans' },
  { label: 'C', align: 'center', font: 'sans' },
  { label: 'MG', superscript: 'e', align: 'center', font: 'sans' },
  { label: 'I', align: 'center', font: 'sans' },
  { label: 'D', align: 'center', font: 'sans' },
  { label: 'C', align: 'center', font: 'sans' },
  { label: 'MG', superscript: 'e', align: 'center', font: 'sans' },
] as const;

/** Taille de police des lignes d'élèves. */
export const BODY_SIZE = 12;

/** Bornes horizontales d'une ligne d'élèves du modèle (index 0 → 1ʳᵉ ligne). */
export function bodyRowEdges(index: number): { top: number; bottom: number } {
  return { top: ROW_EDGES[index + 1], bottom: ROW_EDGES[index + 2] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Données : transformation des élèves en lignes de liste
// ─────────────────────────────────────────────────────────────────────────────

/** Élève minimal nécessaire à la liste nominative. */
export interface NominalListStudent {
  id?: string;
  lastName: string | null;
  firstName: string | null;
  /** 'M' / 'F' en base ; les libellés complets sont aussi acceptés. */
  gender: string | null;
}

/** Classe à imprimer : les élèves sont déjà filtrés sur cette classe. */
export interface NominalListClassInput {
  id: string;
  name: string;
  students: NominalListStudent[];
}

/** Une ligne du tableau, prête à être dessinée. */
export interface NominalListRow {
  /** Numéro d'ordre, tel qu'affiché. */
  number: string;
  /** « NOM Prénoms ». */
  fullName: string;
  /** 'M', 'F' ou chaîne vide si le sexe n'est pas renseigné. */
  gender: string;
}

/** Une page = une classe, prête à être rendue. */
export interface NominalListClassData {
  id: string;
  name: string;
  rows: NominalListRow[];
  boys: number;
  girls: number;
  total: number;
}

const deaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Ramène la valeur de `students.gender` à « M », « F » ou ''.
 * La base stocke 'M'/'F' ; on tolère les libellés complets et
 * garçon/fille saisis à la main dans d'autres jeux de données.
 */
export function genderCode(raw: string | null | undefined): string {
  const v = deaccent((raw ?? '').trim()).toLowerCase();
  if (!v) return '';
  if (v.startsWith('m') || v.startsWith('g') || v === 'h' || v === 'homme') return 'M';
  if (v.startsWith('f') || v === 'fille') return 'F';
  return '';
}

const upperFr = (s: string) => s.toLocaleUpperCase('fr-FR');

/**
 * Construit les lignes d'une classe : tri par nom puis prénom (ordre français),
 * nom en capitales comme dans le reste de l'application.
 * Le genre absent devient « » pour que l'élève reste visible dans la liste.
 */
export function buildNominalListRows(students: NominalListStudent[]): NominalListRow[] {
  const sorted = [...students].sort(
    (a, b) =>
      (a.lastName ?? '').localeCompare(b.lastName ?? '', 'fr') ||
      (a.firstName ?? '').localeCompare(b.firstName ?? '', 'fr'),
  );

  return sorted.map((s, i) => {
    const last = (s.lastName ?? '').trim();
    const first = (s.firstName ?? '').trim();
    const fullName = `${last ? upperFr(last) : ''}${first ? ` ${first}` : ''}`.trim();
    return {
      number: String(i + 1),
      fullName: fullName || '—',
      gender: genderCode(s.gender),
    };
  });
}

/** Prépare l'ensemble des pages (une par classe), avec les effectifs G/F/T. */
export function buildNominalListData(classes: NominalListClassInput[]): NominalListClassData[] {
  return classes.map(c => {
    const rows = buildNominalListRows(c.students);
    const boys = rows.filter(r => r.gender === 'M').length;
    const girls = rows.filter(r => r.gender === 'F').length;
    return { id: c.id, name: c.name, rows, boys, girls, total: rows.length };
  });
}

/**
 * Valeurs de l'encadré G / F / T : garçons, filles, total.
 * Le total prend tous les élèves, y compris ceux dont le sexe est inconnu.
 */
export function gftValues(page: NominalListClassData): string[] {
  return [String(page.boys), String(page.girls), String(page.total)];
}

/** Nom de fichier sûr pour Windows (le projet impose déjà ce filtrage). */
const ILLEGAL_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeFileName(value: string, maxLength = 60): string {
  return value
    .replace(ILLEGAL_FILE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, maxLength)
    .trim();
}

/**
 * Nom du PDF : `Liste_nominative_6eme_A_2025-2026.pdf` pour une classe,
 * `Listes_nominatives_College_2025-2026.pdf` pour un export groupé.
 */
export function nominalListFileName(pages: NominalListClassData[], groupLabel: string, yearName: string): string {
  const year = sanitizeFileName(yearName, 30) || 'annee';
  if (pages.length === 1) {
    return `Liste_nominative_${sanitizeFileName(pages[0].name) || 'classe'}_${year}.pdf`;
  }
  return `Listes_nominatives_${sanitizeFileName(groupLabel) || 'ecole'}_${year}.pdf`;
}