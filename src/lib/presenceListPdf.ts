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
  yearField: { centerX: 841.92 / 2, baseline: 510, size: 11, maxW: 240 },
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

/** Format MIME d'une data-URI image ('' si ce n'en est pas une). */
const dataUrlMime = (dataUrl: string): string =>
  /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(dataUrl)?.[1]?.toLowerCase() ?? '';

/**
 * pdf-lib n'intègre que du PNG ou du JPEG, alors que la page Réglages encode le
 * logo en WebP (canvas.toDataURL('image/webp')). On repasse par un canvas pour
 * obtenir un PNG ; sans DOM (smoke Node) on renvoie l'original et l'intégration
 * échoue proprement.
 */
const toEmbeddableImage = async (logoDataUrl: string): Promise<string> => {
  const mime = dataUrlMime(logoDataUrl);
  if (mime === 'png' || mime === 'jpeg' || mime === 'jpg') return logoDataUrl;
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error(`Format de logo non pris en charge (${mime || 'inconnu'}).`);
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Logo illisible.'));
    el.src = logoDataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 1;
  canvas.height = img.naturalHeight || 1;
  canvas.getContext('2d')?.drawImage(img, 0, 0);
  const png = canvas.toDataURL('image/png');
  if (dataUrlMime(png) !== 'png') throw new Error('Conversion du logo en PNG impossible.');
  return png;
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

// ── Modèle en cache : fetch + parse UNE seule fois ──────────────────────────
// PDFDocument.load de ce modèle Word (250 ko, images) coûte 350-410 ms
// (mesure : smoke/time_presence.mjs). Sans cache, chaque régénération de
// l'aperçu refaisait ce parse → chargement perçu comme lent. `copyPages`
// ne modifie pas la source (PDFObjectCopier lit le contexte source et écrit
// dans la cible), donc le même PDFDocument modèle peut être réutilisé.
let templatePromise: Promise<PDFDocument> | null = null;

const getTemplate = (): Promise<PDFDocument> => {
  if (!templatePromise) {
    const promise = (async () => {
      const response = await fetch('/liste_de_presence.pdf');
      if (!response.ok) {
        throw new Error('Impossible de charger le modèle de liste de présence.');
      }
      return PDFDocument.load(await response.arrayBuffer());
    })();
    templatePromise = promise;
    // En cas d'échec on libère le cache pour permettre une nouvelle tentative.
    promise.catch(() => {
      if (templatePromise === promise) templatePromise = null;
    });
  }
  return templatePromise;
};

/**
 * Précharge le modèle dès l'ouverture de la page Archives / du modal :
 * le premier aperçu saute le fetch + parse (~400 ms).
 */
export const preloadPresenceTemplate = (): void => {
  void getTemplate().catch(() => {});
};

/**
 * Génère le PDF de liste de présence : une page du modèle par tranche de
 * 28 élèves (numérotation continue), en-tête + encadré G/F/T redessinés.
 */
export const buildPresenceListPdf = async (
  classes: NominalListClassInput[],
  _groupLabel: string,
  yearName: string,
  logoDataUrl?: string,
  schoolName: string = ''
): Promise<Uint8Array> => {
  // Modèle : 1ʳᵉ appelée = fetch + parse (~400 ms), suivantes = cache mémoire.
  const srcDoc = await getTemplate();

  const out = await PDFDocument.create();
  const regular = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  
  let embeddedLogo: any = null;
  if (logoDataUrl) {
    try {
      const embeddable = await toEmbeddableImage(logoDataUrl);
      embeddedLogo =
        dataUrlMime(embeddable) === 'png'
          ? await out.embedPng(embeddable)
          : await out.embedJpg(embeddable);
    } catch (e) {
      console.warn("Could not embed logo", e);
    }
  }

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

      if (embeddedLogo) {
        // Cache l'ancien logo Orion (coordonnées pdf-lib: bas-gauche).
        // Le bas (497) reste AU-DESSUS des encadrés des jours, dont le filet
        // haut est à 493,3 pt (595,32 − 102,0) : sinon il mange le cadre.
        pdfPage.drawRectangle({ x: 35, y: 497, width: 300, height: 83, color: rgb(1, 1, 1) });
        
        const dims = embeddedLogo.scale(1);
        // Zone de pose : 180 × 65 pt en haut à gauche (40 → 220 pt, y 505 → 570 pt),
        // centrée dans la zone, sous le cache blanc (35 → 335, y 497 → 580).
        const maxPtW = 180; // on limite à 180 pt de large max
        const maxPtH = 65;  // on limite à 65 pt de haut max
        const ratio = Math.min(maxPtW / dims.width, maxPtH / dims.height);
        const w = dims.width * ratio;
        const h = dims.height * ratio;
        
        const offsetX = 40 + (maxPtW - w) / 2;
        const offsetY = 505 + (maxPtH - h) / 2; 
        
        pdfPage.drawImage(embeddedLogo, {
          x: offsetX,
          y: offsetY,
          width: w,
          height: h,
        });
      }

      // ── Cache de l'ancien titre "ORION COLLEGE EXPERIENCE" ──
      // La ligne de l'ancien titre est centrée vers Y=545-560.
      pdfPage.drawRectangle({ x: 200, y: 545, width: 460, height: 35, color: rgb(1, 1, 1) });
      
      // ── Nouveau Titre ──
      const rawTitle = (schoolName || 'ÉTABLISSEMENT').toUpperCase();
      const titleLabel = winAnsi(rawTitle);
      const titleFont = bold;
      // Largeur de la page A4 paysage est 841.92 pt. Centre exact: 420.96
      const PAGE_CENTER_X = 841.92 / 2;
      const titleSize = fitSize(titleLabel, titleFont, 460, 16, 10);
      const titleWidth = titleFont.widthOfTextAtSize(titleLabel, titleSize);
      pdfPage.drawText(titleLabel, {
        x: PAGE_CENTER_X - titleWidth / 2,
        y: 550,
        size: titleSize,
        font: titleFont,
        color: rgb(0.08, 0.34, 0.75), // #1558c0 approximatif
      });

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
      // Cache éventuel de l'ancien texte d'année. Il doit rester dans la bande
      // libre mesurée : 497 pt (filet haut des encadrés des jours à 493,3) à
      // 530 pt (soulignement de « LISTE DE PRESENCE » à 530,4). Au-delà de
      // 493,3 il effaçait le cadre des cases LUNDI/MARDI/MERCREDI.
      pdfPage.drawRectangle({ x: GEOM.yearField.centerX - 150, y: 497, width: 300, height: 33, color: rgb(1, 1, 1) });

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
