// ─────────────────────────────────────────────────────────────────────────────
// Gabarit « EMPLOI DU TEMPS »
//
// Toute la géométrie ci-dessous a été relevée sur le modèle PDF fourni
// (Word → export PDF, A4 paysage) et est exprimée en POINTS PDF (1 pt = 1/72"),
// unités natives du fichier. Les valeurs correspondent au modèle au dixième de
// point près : ne pas les « arrondir », la reproduction se décalerait.
//
// Le PDF généré consomme ce module, ce qui garantit que la reproduction reste
// superposable au modèle.
//
// Particularités du modèle reproduites telles quelles :
//   • le titre « EMPLOI DU TEMPS » est souligné d'un filet de 0,7 pt ;
//   • la bande de pause (entre 5 H et 6 H) traverse toute la largeur du tableau
//     et supprime les séparateurs de colonnes sur sa hauteur ;
//   • la colonne des heures est sur fond gris, l'en-tête des jours est blanc ;
//   • le modèle ne comporte ni pied de page, ni filet sous « CLASSE : » /
//     « PROFESSEUR TITULAIRE : » (la valeur suit simplement le libellé) ;
//   • le filigrane est posé AU-DESSUS de la trame (vérifié sur le PDF source).
// ─────────────────────────────────────────────────────────────────────────────

import { sanitizeFileName } from './nominalListTemplate';

/** Format de la page : A4 paysage. */
export const PAGE = {
  width: 841.92,
  height: 595.32,
} as const;

/** Épaisseur des filets de tableau (Word dessine un rectangle plein de ~0,48 pt). */
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
  watermark: { x: 263.4, y: 178.22, w: 315.6, h: 298.8 },
} as const;

// ── Titres et libellés ───────────────────────────────────────────────────────
// `baseline` est la ligne de base mesurée (et non la hauteur de la boîte).

export const TEXT = {
  brand: {
    label: 'ORION COLLEGE EXPERIENCE',
    size: 20,
    baseline: 41.8,
    /**
     * Centre horizontal relevé sur le modèle (le titre occupe 327,0 → 534,4 pt,
     * espace final compris). Le modèle utilise Anton, ni disponible dans jsPDF ni
     * hors ligne dans la WebView : on centre le substitut sur ce même axe.
     */
    center: 430.7,
    color: [0, 51, 204] as const, // #0033CC
  },
  title: {
    label: 'EMPLOI DU TEMPS',
    size: 16,
    baseline: 62.5,
    /** Bord gauche du titre, relevé sur le modèle (titre centré sur 430,6 pt). */
    x: 359.5,
    /**
     * Filet noir qui souligne le titre dans le modèle (largeur mesurée : 142,2 pt).
     * `dy` est mesuré depuis la ligne de base ; la largeur est en revanche
     * recalculée sur la police réellement dessinée afin que le filet épouse
     * toujours le texte sortant.
     */
    underline: { dy: 1.7, thickness: 0.7, width: 142.2 },
  },
  /** La valeur (nom de classe) suit le libellé, sans filet. */
  classLabel: {
    label: 'CLASSE :',
    size: 11,
    baseline: 107.8,
    x: 666.3,
  },
  /** Idem : le nom du professeur suit le libellé, sans filet. */
  profLabel: {
    label: 'PROFESSEUR TITULAIRE :',
    size: 14,
    baseline: 144.7,
    x: 50.6,
  },
} as const;

// ── Encadré G / F / T (effectifs garçons / filles / total) ────────────────────

export const GFT = {
  /** Origines des 4 filets verticaux (bord gauche de chaque filet). */
  colEdges: [663.7, 706.1, 748.5, 791.0] as const,
  /** Origines des 3 filets horizontaux (haut, séparateur, bas). */
  rowEdges: [118.2, 133.5, 148.6] as const,
  /** Fonds des trois colonnes (aussi bien l'en-tête que la ligne de valeurs). */
  fills: [
    [213, 220, 228],
    [251, 228, 213],
    [255, 242, 204],
  ] as const,
  labels: ['G', 'F', 'T'] as const,
  labelBaseline: 130.2,
  valueBaseline: 145.3,
  size: 12,
} as const;

/** Bas de l'encadré G / F / T (origine du filet bas, avant épaisseur). */
export const gftBottom = GFT.rowEdges[GFT.rowEdges.length - 1];


// ── Tableau principal ────────────────────────────────────────────────────────

/**
 * 8 filets verticaux → 7 colonnes : [heure, Lundi … Samedi].
 * Le premier filet démarre à 49,3 pt, le dernier à 793,7 pt (bord à 794,1 pt).
 */
export const COL_EDGES = [49.3, 155.7, 247.8, 347.1, 461.4, 566.8, 680.3, 793.7] as const;

/**
 * 10 filets horizontaux (origines) :
 *   0    156,6 — haut de l'en-tête des jours
 *   1    189,4 — bas de l'en-tête / haut de 1 H
 *   2-5  231,3 / 273,2 / 315,1 / 357,0 — séparations 2 H … 5 H
 *   6    398,8 — bas de 5 H / haut de la bande de pause
 *   7    425,0 — bas de la bande de pause / haut de 6 H
 *   8    466,9 — bas de 6 H / haut de 7 H
 *   9    508,8 — bas de 7 H (bord bas du tableau)
 */
export const ROW_EDGES = [
  156.6, 189.4, 231.3, 273.2, 315.1, 357.0, 398.8, 425.0, 466.9, 508.8,
] as const;

/** Ligne d'en-tête : jours, fond blanc (modèle). */
export const HEADER = {
  top: ROW_EDGES[0],
  bottom: ROW_EDGES[1],
  baseline: 180.4,
  size: 20,
} as const;

/** Bande de pause : pleine largeur, sans colonnes internes. */
export const BREAK = {
  top: ROW_EDGES[6],
  bottom: ROW_EDGES[7],
} as const;

/**
 * Bornes [haut, bas] d'un créneau horaire.
 * Les créneaux 0 à 4 (1 H → 5 H) sont au-dessus de la pause, 5 et 6 (6 H, 7 H)
 * en dessous — d'où le décalage d'index de deux après la bande.
 */
export function slotRowEdges(slot: number): [number, number] {
  const offset = slot <= 4 ? 1 : 2;
  return [ROW_EDGES[slot + offset], ROW_EDGES[slot + offset + 1]];
}

/** Bas du tableau (origine du filet bas, avant épaisseur). */
export const tableBottom = ROW_EDGES[ROW_EDGES.length - 1];

/** Jours de la semaine, en-têtes du tableau (modèle : capitales, Times 20). */
export const DAYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'] as const;

/** Créneaux horaires, tels que libellés dans le modèle (« 1 H » … « 6H », « 7H »). */
export const HOURS = ['1 H', '2 H', '3 H', '4 H', '5 H', '6H', '7H'] as const;

/** Lignes de base des libellés d'heures (centrés verticalement dans leur ligne). */
export const HOUR_BASELINES = [223.5, 265.4, 307.2, 349.2, 391.0, 459.1, 501.0] as const;

/** Taille des libellés d'heures (Times 36 pt dans le modèle). */
export const HOUR_SIZE = 36;

/** Aplat gris de la colonne des heures et de la bande de pause (RGB 242). */
export const HOUR_FILL = [242, 242, 242] as const;
export const BREAK_FILL = [242, 242, 242] as const;

/**
 * Code de matière dans une case : le modèle fournit des cases vides, on pose le
 * code en sans gras noir, centré — cohérent avec le reste de l'application.
 * `dy` recale la ligne de base pour un centrage optique (capitales / chiffres).
 */
export const SUBJECT = {
  size: 13,
  dy: 4.7,
  /** Marge intérieure de part et d'autre du texte. */
  padX: 6,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Données : grille et nom de fichier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grille de l'emploi du temps : clé `${jour}_${créneau}` (jour 1-6, créneau 0-6),
 * valeur = code de la matière ('' = case vide).
 */
export type TimetableGridData = Record<string, string>;

/**
 * Nom du PDF : `Emploi_du_temps_6eme_A_2025-2026.pdf`.
 * Le filtrage Windows est celui de la liste nominative (mêmes règles partout).
 */
export function timetableFileName(className: string, yearName: string): string {
  const year = sanitizeFileName(yearName, 30) || 'annee';
  return `Emploi_du_temps_${sanitizeFileName(className) || 'classe'}_${year}.pdf`;
}
