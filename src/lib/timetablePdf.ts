import { jsPDF } from 'jspdf';
import logoAsset from '../assets/orion_logo.png';
import qrAsset from '../assets/orion_qr.png';
import watermarkAsset from '../assets/orion_watermark_blue.png';
import {
  BORDER, BORDER_SHIFT, BREAK, BREAK_FILL, COL_EDGES, DAYS, GFT, HOURS,
  HOUR_BASELINES, HOUR_FILL, HOUR_SIZE, HEADER, IMAGES, PAGE, ROW_EDGES, SUBJECT,
  TEXT, gftBottom, slotRowEdges, tableBottom, timetableFileName,
  type TimetableGridData,
} from './timetableTemplate';

// ─────────────────────────────────────────────────────────────────────────────
// Rendu du modèle « EMPLOI DU TEMPS »
//
// Le module consomme le gabarit lib/timetableTemplate, relevé au dixième de
// point sur le modèle PDF fourni : le fichier généré est superposable au
// modèle (aucune coordonnée n'est « inventée » ici).
//
// Ordre de tracé repris du document source (vérifié sur le PDF) :
//   images de marque → titres → encadré G/F/T → aplats → filets → textes du
//   tableau → filigrane AU-DESSUS de la trame.
//
// Polices du modèle : Times New Roman → « times », Calibri → « helvetica »,
// Anton (bandeau) → gras helvetica — mêmes substitutions que la liste
// nominative, les polices n'étant ni intégrables sans .ttf ni disponibles hors
// ligne dans la WebView.
// ─────────────────────────────────────────────────────────────────────────────

type Family = 'serif' | 'sans';
type Style = 'normal' | 'bold' | 'italic';

export interface TimetableAssets {
  logo: string;
  qr: string;
  watermark: string;
}

export type { TimetableGridData };

export interface TimetablePdfOptions {
  className: string;
  schoolName: string;
  yearName: string;
  teacherName?: string;
  boyCount?: number;
  girlCount?: number;
  grid: TimetableGridData;
  assets: TimetableAssets;
}

// ── Asset loading (shared cache) ──────────────────────────────────────────────

const toDataUrl = (url: string): Promise<string> =>
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`Image introuvable (${res.status}) : ${url}`);
      return res.blob();
    })
    .then(
      blob =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error ?? new Error('Lecture de l’image impossible'));
          reader.readAsDataURL(blob);
        }),
    );

let assetsPromise: Promise<TimetableAssets> | null = null;

/**
 * Charge les trois images du modèle en data-URI (jsPDF ne gère pas d'URL de
 * module). Résultat mis en cache : l'aperçu et le PDF partagent exactement les
 * mêmes images.
 */
export function loadTimetableAssets(): Promise<TimetableAssets> {
  if (!assetsPromise) {
    assetsPromise = Promise.all([toDataUrl(logoAsset), toDataUrl(qrAsset), toDataUrl(watermarkAsset)])
      .then(([logo, qr, watermark]) => ({ logo, qr, watermark }))
      .catch(err => {
        assetsPromise = null; // nouvel essai à la prochaine ouverture
        throw err;
      });
  }
  return assetsPromise;
}

// ── Helpers de tracé (mêmes conventions que la liste nominative) ──────────────

const PDF_FONT: Record<Family, string> = { serif: 'times', sans: 'helvetica' };

const useFont = (doc: jsPDF, family: Family, style: Style = 'normal'): void => {
  doc.setFont(PDF_FONT[family], style);
};

/**
 * jsPDF ne propose pas A4 au dixième de point près (il utilise 841,89 × 595,28) ;
 * on impose les dimensions exactes du modèle.
 */
const FORMAT: [number, number] = [PAGE.width, PAGE.height];

/** Centre `text` dans [from, to] sur la ligne de base `baseline`. */
function drawCentered(doc: jsPDF, text: string, from: number, to: number, baseline: number): void {
  doc.text(text, (from + to) / 2, baseline, { align: 'center' });
}

/** Filet ancré sur sa coordonnée, comme Word (le trait part vers la droite/bas). */
function stroke(doc: jsPDF, x1: number, y1: number, x2: number, y2: number): void {
  doc.line(x1 + BORDER_SHIFT, y1 + BORDER_SHIFT, x2 + BORDER_SHIFT, y2 + BORDER_SHIFT);
}

/** Aplat entre les filets d'une bande (la couleur est posée par l'appelant). */
function drawFill(doc: jsPDF, x: number, xNext: number, top: number, bottom: number): void {
  doc.rect(
    x + BORDER_SHIFT,
    top + BORDER_SHIFT,
    xNext - x - BORDER_SHIFT,
    bottom - top - BORDER_SHIFT,
    'F',
  );
}

/** Ensemble des colonnes (borne gauche → borne droite). */
const lastCol = COL_EDGES[COL_EDGES.length - 1];

// ── Dessin ────────────────────────────────────────────────────────────────────

/**
 * Dessine la page complète : images de marque, titres, encadré G / F / T,
 * trame du tableau, cases, puis filigrane (au-dessus de tout, comme le modèle).
 */
function drawPage(doc: jsPDF, opts: TimetablePdfOptions): void {
  const { className, teacherName, boyCount, girlCount, grid, assets } = opts;
  const totalCount = (boyCount ?? 0) + (girlCount ?? 0);

  // ── Images de marque ──
  doc.addImage(assets.logo, 'PNG', IMAGES.logo.x, IMAGES.logo.y, IMAGES.logo.w, IMAGES.logo.h, undefined, 'FAST');
  doc.addImage(assets.qr, 'PNG', IMAGES.qr.x, IMAGES.qr.y, IMAGES.qr.w, IMAGES.qr.h, undefined, 'FAST');

  // ── Bandeau : marque (bleue, centrée) + titre souligné ──
  useFont(doc, 'sans', 'bold');
  doc.setFontSize(TEXT.brand.size);
  doc.setTextColor(...(TEXT.brand.color as unknown as [number, number, number]));
  doc.text(TEXT.brand.label, TEXT.brand.center, TEXT.brand.baseline, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  useFont(doc, 'serif');
  doc.setFontSize(TEXT.title.size);
  doc.text(TEXT.title.label, TEXT.title.x, TEXT.title.baseline);
  doc.setFillColor(0, 0, 0);
  doc.rect(
    TEXT.title.x,
    TEXT.title.baseline + TEXT.title.underline.dy,
    doc.getTextWidth(TEXT.title.label),
    TEXT.title.underline.thickness,
    'F',
  );

  // ── CLASSE : <nom> (le modèle ne prévoit pas de filet sous le libellé) ──
  useFont(doc, 'serif', 'bold');
  doc.setFontSize(TEXT.classLabel.size);
  doc.text(TEXT.classLabel.label, TEXT.classLabel.x, TEXT.classLabel.baseline);
  if (className) {
    doc.text(
      className,
      TEXT.classLabel.x + doc.getTextWidth(`${TEXT.classLabel.label} `),
      TEXT.classLabel.baseline,
    );
  }

  // ── PROFESSEUR TITULAIRE : <nom> ──
  doc.setFontSize(TEXT.profLabel.size);
  doc.text(TEXT.profLabel.label, TEXT.profLabel.x, TEXT.profLabel.baseline);
  if (teacherName) {
    doc.text(
      teacherName,
      TEXT.profLabel.x + doc.getTextWidth(`${TEXT.profLabel.label} `),
      TEXT.profLabel.baseline,
    );
  }

  // ── Encadré G / F / T : aplats, filets, textes ──
  GFT.fills.forEach((color, i) => {
    doc.setFillColor(color[0], color[1], color[2]);
    drawFill(doc, GFT.colEdges[i], GFT.colEdges[i + 1], GFT.rowEdges[0], gftBottom);
  });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(BORDER);
  GFT.colEdges.forEach(x => stroke(doc, x, GFT.rowEdges[0], x, gftBottom + BORDER));
  GFT.rowEdges.forEach(y =>
    stroke(doc, GFT.colEdges[0], y, GFT.colEdges[GFT.colEdges.length - 1] + BORDER, y),
  );

  useFont(doc, 'sans', 'bold');
  doc.setFontSize(GFT.size);
  GFT.labels.forEach((l, i) =>
    drawCentered(doc, l, GFT.colEdges[i], GFT.colEdges[i + 1], GFT.labelBaseline),
  );
  [String(boyCount ?? 0), String(girlCount ?? 0), String(totalCount)].forEach((v, i) =>
    drawCentered(doc, v, GFT.colEdges[i], GFT.colEdges[i + 1], GFT.valueBaseline),
  );

  // ── Trame : aplats sous les filets ──
  doc.setFillColor(HOUR_FILL[0], HOUR_FILL[1], HOUR_FILL[2]);
  for (let slot = 0; slot < HOURS.length; slot += 1) {
    const [top, bottom] = slotRowEdges(slot);
    drawFill(doc, COL_EDGES[0], COL_EDGES[1], top, bottom);
  }
  doc.setFillColor(BREAK_FILL[0], BREAK_FILL[1], BREAK_FILL[2]);
  drawFill(doc, COL_EDGES[0], lastCol, BREAK.top, BREAK.bottom);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(BORDER);

  // Filets verticaux : l'extérieur traverse la bande de pause, les séparateurs
  // internes s'arrêtent de part et d'autre (le modèle n'y trace aucune colonne).
  stroke(doc, COL_EDGES[0], HEADER.top, COL_EDGES[0], tableBottom + BORDER);
  stroke(doc, lastCol, HEADER.top, lastCol, tableBottom + BORDER);
  COL_EDGES.slice(1, -1).forEach(x => {
    stroke(doc, x, HEADER.top, x, BREAK.top);
    stroke(doc, x, BREAK.bottom, x, tableBottom + BORDER);
  });

  // Filets horizontaux : en-tête, chaque créneau, pause et bord bas.
  ROW_EDGES.forEach(y => stroke(doc, COL_EDGES[0] + BORDER, y, lastCol, y));

  // ── En-tête : jours ──
  useFont(doc, 'serif');
  doc.setFontSize(HEADER.size);
  DAYS.forEach((day, i) => drawCentered(doc, day, COL_EDGES[i + 1], COL_EDGES[i + 2], HEADER.baseline));

  // ── Libellés d'heures ──
  doc.setFontSize(HOUR_SIZE);
  HOURS.forEach((hour, slot) =>
    drawCentered(doc, hour, COL_EDGES[0], COL_EDGES[1], HOUR_BASELINES[slot]),
  );

  // ── Cases : codes de matières (le modèle est vierge, on centre le code) ──
  useFont(doc, 'sans', 'bold');
  doc.setFontSize(SUBJECT.size);
  const lineHeight = SUBJECT.size * 1.15;
  for (let slot = 0; slot < HOURS.length; slot += 1) {
    const [top, bottom] = slotRowEdges(slot);
    const cellBaseline = (top + bottom) / 2 + SUBJECT.dy;
    for (let day = 1; day <= DAYS.length; day += 1) {
      const code = (grid[`${day}_${slot}`] ?? '').trim();
      if (!code) continue;
      const from = COL_EDGES[day];
      const to = COL_EDGES[day + 1];
      const raw = doc.splitTextToSize(code, to - from - 2 * SUBJECT.padX) as string | string[];
      const lines: string[] = Array.isArray(raw) ? raw : [raw];
      const firstBaseline = cellBaseline - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, li) =>
        drawCentered(doc, line, from, to, firstBaseline + li * lineHeight),
      );
    }
  }

  // ── Filigrane : posé après la trame, comme dans le document d'origine ──
  doc.addImage(
    assets.watermark, 'PNG',
    IMAGES.watermark.x, IMAGES.watermark.y, IMAGES.watermark.w, IMAGES.watermark.h,
    undefined, 'FAST',
  );
}

/** Construit le document : une page A4 paysage, aux dimensions exactes du modèle. */
export function buildTimetablePdf(opts: TimetablePdfOptions): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: FORMAT, orientation: 'landscape' });
  doc.setProperties({
    title: `Emploi du temps — ${opts.className}`,
    subject: `${opts.schoolName} — ${opts.yearName}`,
  });
  drawPage(doc, opts);
  return doc;
}

export { timetableFileName };

