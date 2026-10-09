import { jsPDF } from 'jspdf';
// `?inline` : les trois images sont embarquées comme data-URI au build.
// Le fetch runtime des assets échoue dans la WebView Tauri (« Failed to
// fetch ») — l'inlining rend le chargement infaillible et hors-ligne.
import logoAsset from '../assets/orion_logo.png?inline';
import qrAsset from '../assets/orion_qr.png?inline';
import watermarkAsset from '../assets/orion_watermark.png?inline';
import {
  BORDER, BORDER_SHIFT, BODY_SIZE, COL_EDGES, GFT, HEAD_BASELINE, HEAD_COLUMNS,
  HEAD_SIZE, IMAGES, PAGE, PAD_X, ROWS_PER_PAGE, ROW_BASELINES, ROW_EDGES,
  SUPERSCRIPT, TEXT, TITLE_BAND, TITLE_BAND_CENTER, TRIMESTERS,
  gftValues,
  type HeadColumn,
  type NominalListClassData,
} from './nominalListTemplate';

// ─────────────────────────────────────────────────────────────────────────────
// Rendu du modèle « LISTE NOMINATIVE DE LA CLASSE »
//
// PDF 100 % natif (jsPDF) à partir de la géométrie partagée
// (lib/nominalListTemplate) : aucune page HTML intermédiaire, aucune conversion
// HTML → PDF. Le découpage en pages est calculé une seule fois
// (layoutNominalList) puis dessiné directement en tracés vectoriels.
//
// Les polices du modèle (Anton, Times New Roman, Calibri) ne sont ni intégrables
// dans jsPDF sans les fichiers .ttf, ni disponibles hors ligne dans le WebView :
// on pose les polices standard les plus proches. Ni la structure ni la mise en
// page ne changent.
// ─────────────────────────────────────────────────────────────────────────────

type Family = 'serif' | 'sans';
type Style = '' | 'normal' | 'bold' | 'italic';

export interface NominalListAssets {
  logo: string;
  qr: string;
  watermark: string;
}

// ── Images ───────────────────────────────────────────────────────────────────

const toDataUrl = (url: string): Promise<string> =>
  // Data-URI déjà prêt (imports `?inline`) : aucun fetch, aucune dépendance
  // au protocole de service des fichiers.
  url.startsWith('data:')
    ? Promise.resolve(url)
    : fetch(url)
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

let assetsPromise: Promise<NominalListAssets> | null = null;

/** Data-URI du logo Orion (repli si le logo de l'école est illisible par jsPDF). */
let defaultLogoDataUrl = '';

/**
 * Charge les trois images du modèle en data-URI (jsPDF ne gère pas d'URL de
 * module). Résultat mis en cache : l'aperçu et le téléchargement partagent
 * exactement les mêmes images.
 */
export function loadNominalListAssets(): Promise<NominalListAssets> {
  if (!assetsPromise) {
    assetsPromise = Promise.all([toDataUrl(logoAsset), toDataUrl(qrAsset), toDataUrl(watermarkAsset)])
      .then(([logo, qr, watermark]) => {
        defaultLogoDataUrl = logo;
        return { logo, qr, watermark };
      })
      .catch(err => {
        assetsPromise = null; // nouvel essai à la prochaine ouverture
        throw err;
      });
  }
  return assetsPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Découpage en pages
// ─────────────────────────────────────────────────────────────────────────────

/** Une page physique : une tranche d'élèves d'une classe. */
export interface NominalListPage {
  data: NominalListClassData;
  /** Index du premier élève de la page dans `data.rows`. */
  offset: number;
  /** 1-based : « page 2/3 » quand la classe dépasse 27 élèves. */
  part: number;
  parts: number;
}

/** Nombre de pages pour une seule classe (toujours ≥ 1). */
export function pageCountFor(classData: NominalListClassData): number {
  return Math.max(1, Math.ceil(classData.rows.length / ROWS_PER_PAGE));
}

/**
 * Aplatit la liste des classes en pages. C'est l'unique source de vérité du
 * découpage : l'aperçu étant le PDF lui-même (mêmes octets que le fichier
 * téléchargé), le nombre de feuilles affiché est toujours celui obtenu.
 */
export function layoutNominalList(pages: NominalListClassData[]): NominalListPage[] {
  return pages.flatMap(data => {
    const parts = pageCountFor(data);
    return Array.from({ length: parts }, (_, i) => ({
      data,
      offset: i * ROWS_PER_PAGE,
      part: i + 1,
      parts,
    }));
  });
}

const gftBottom = GFT.rowEdges[GFT.rowEdges.length - 1];
const trimesterBottom = TRIMESTERS.rowEdges[TRIMESTERS.rowEdges.length - 1];
const tableBottom = ROW_EDGES[ROW_EDGES.length - 1];

export interface NominalListDocOptions {
  pages: NominalListClassData[];
  assets: NominalListAssets;
  groupLabel: string;
  documentType?: 'nominative' | 'notes';
  subjectName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF (jsPDF)
// ─────────────────────────────────────────────────────────────────────────────

/** Anton et Calibri n'existent pas dans jsPDF : on pose la police la plus proche. */
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

/**
 * Réduit le corps (par pas de 0,25 pt) jusqu'à faire tenir `text` dans `maxW`.
 *
 * Même approche que la liste de présence : seule la taille de police baisse,
 * l'interlettrage reste naturel. L'ancienne compression d'espacement
 * (drawCondensed) collait les lettres, Anton/Calibri du modèle étant bien
 * plus étroits que les substituts jsPDF (Helvetica/Times).
 */
function fitSize(doc: jsPDF, text: string, maxW: number, base: number, min: number): number {
  for (let s = base; s > min; s -= 0.25) {
    doc.setFontSize(s);
    if (doc.getTextWidth(text) <= maxW) return s;
  }
  doc.setFontSize(min);
  return min;
}

/** Filet ancré sur sa coordonnée, comme Word (le trait part vers la droite/bas). */
function stroke(doc: jsPDF, x1: number, y1: number, x2: number, y2: number): void {
  doc.line(x1 + BORDER_SHIFT, y1 + BORDER_SHIFT, x2 + BORDER_SHIFT, y2 + BORDER_SHIFT);
}

/** Aplat entre les filets d'une bande (la couleur est posée par l'appelant). */
function drawFill(doc: jsPDF, x: number, xNext: number, top: number, bottom: number): void {
  doc.rect(x + BORDER_SHIFT, top + BORDER_SHIFT, xNext - x - BORDER_SHIFT, bottom - top - BORDER_SHIFT, 'F');
}

/** Bandeau des trimestres : trois cellules centrées sur fond gris. */
const drawTrimesters = (doc: jsPDF): void => {
  TRIMESTERS.colEdges.slice(0, -1).forEach((x, i) => {
    doc.setFillColor(TRIMESTERS.fill[0], TRIMESTERS.fill[1], TRIMESTERS.fill[2]);
    drawFill(doc, x, TRIMESTERS.colEdges[i + 1], TRIMESTERS.rowEdges[0], trimesterBottom);
  });
  TRIMESTERS.colEdges.forEach(x => stroke(doc, x, TRIMESTERS.rowEdges[0], x, trimesterBottom + BORDER));
  TRIMESTERS.rowEdges.forEach(y => stroke(doc, TRIMESTERS.colEdges[0], y, TRIMESTERS.colEdges[TRIMESTERS.colEdges.length - 1] + BORDER, y));

  useFont(doc, 'sans', 'bold');
  TRIMESTERS.labels.forEach((l, i) => {
    const from = TRIMESTERS.colEdges[i];
    const to = TRIMESTERS.colEdges[i + 1];
    fitSize(doc, l, to - from - TRIMESTERS.padX * 2, TRIMESTERS.size, 8);
    drawCentered(doc, l, from, to, TRIMESTERS.baseline);
  });
};

/** En-tête de colonnes : « MG » centré, suivi du « e » en exposant. */
function drawHeadCell(doc: jsPDF, col: HeadColumn, from: number, to: number): void {
  useFont(doc, col.font);
  doc.setFontSize(HEAD_SIZE);
  const baseline = HEAD_BASELINE[col.font];

  if (col.align === 'center') {
    if (!col.superscript) {
      drawCentered(doc, col.label, from, to, baseline);
      return;
    }
    const wLabel = doc.getTextWidth(col.label);
    doc.setFontSize(SUPERSCRIPT.size);
    const wSup = doc.getTextWidth(col.superscript);
    doc.setFontSize(HEAD_SIZE);
    const x0 = (from + to) / 2 - (wLabel + wSup) / 2;
    doc.text(col.label, x0, baseline);
    doc.setFontSize(SUPERSCRIPT.size);
    doc.text(col.superscript, x0 + wLabel, baseline + SUPERSCRIPT.dy);
    return;
  }
  doc.text(col.label, from + PAD_X, baseline);
}

/**
 * Pose une image en conservant son ratio dans le cadre du modèle.
 * Un logo importé en format que jsPDF ne sait pas décoder (BMP, corrompu…)
 * ne doit JAMAIS bloquer la génération du document : on renvoie `false` et
 * l'appelant bascule sur un repli (ou continue sans image).
 */
function addImageSafe(
  doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number,
): boolean {
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
}

/** Dessine une page complète : images, titres, encadrés, trame, élèves, filigrane. */
function drawPage(doc: jsPDF, page: NominalListPage, assets: NominalListAssets, opts: NominalListDocOptions): void {
  const { data, offset } = page;

  // ── Images ──
  // Replis successifs : logo de l'école → logo Orion → aucune image.
  if (!addImageSafe(doc, assets.logo, IMAGES.logo.x, IMAGES.logo.y, IMAGES.logo.w, IMAGES.logo.h)) {
    if (defaultLogoDataUrl && defaultLogoDataUrl !== assets.logo) {
      addImageSafe(doc, defaultLogoDataUrl, IMAGES.logo.x, IMAGES.logo.y, IMAGES.logo.w, IMAGES.logo.h);
    }
  }
  addImageSafe(doc, assets.qr, IMAGES.qr.x, IMAGES.qr.y, IMAGES.qr.w, IMAGES.qr.h);

  // ── Titres ──
  useFont(doc, 'sans', 'bold');
  doc.setTextColor(...(TEXT.brand.color as unknown as [number, number, number]));
  // Bande libre entre le logo et « CLASSE : » : le titre est centré sur le repère
  // du modèle à l'espacement naturel (comme la liste de présence) ; seul le
  // corps baisse s'il déborde de la bande.
  fitSize(doc, TEXT.brand.label, TITLE_BAND.right - TITLE_BAND.left, TEXT.brand.size, 10);
  const brandW = doc.getTextWidth(TEXT.brand.label);
  doc.text(TEXT.brand.label, TEXT.brand.center - brandW / 2, TEXT.brand.baseline);

  doc.setTextColor(0, 0, 0);
  useFont(doc, 'serif');
  doc.setFontSize(TEXT.title.size);
  
  if (opts.documentType === 'notes') {
    const titleText = 'LISTE DE NOTES';
    drawCentered(doc, titleText, TITLE_BAND.left, TITLE_BAND.right, TEXT.title.baseline);
    const w = doc.getTextWidth(titleText);
    const x0 = TITLE_BAND_CENTER - w / 2;
    doc.setFillColor(0, 0, 0);
    doc.rect(
      x0,
      TEXT.title.baseline + TEXT.title.underline.dy,
      w,
      TEXT.title.underline.thickness,
      'F',
    );
  } else {
    doc.text(TEXT.title.label, TEXT.title.x, TEXT.title.baseline);
    doc.setFillColor(0, 0, 0);
    doc.rect(
      TEXT.title.x,
      TEXT.title.baseline + TEXT.title.underline.dy,
      doc.getTextWidth(TEXT.title.label),
      TEXT.title.underline.thickness,
      'F',
    );
  }

  useFont(doc, 'serif', 'bold');
  doc.setFontSize(TEXT.classLabel.size);
  const labelWidth = doc.getTextWidth(TEXT.classLabel.label);
  doc.text(TEXT.classLabel.label, TEXT.classLabel.x, TEXT.classLabel.baseline);
  doc.text(data.name, TEXT.classLabel.x + labelWidth, TEXT.classLabel.baseline);

  useFont(doc, 'serif', 'italic');
  doc.setFontSize(TEXT.footer.size);
  doc.text(TEXT.footer.label, TEXT.footer.x, TEXT.footer.baseline);

  if (opts.documentType === 'notes' && opts.subjectName) {
    useFont(doc, 'sans', 'bold');
    doc.setFontSize(12);
    const textStr = `Matière : ${opts.subjectName}`;
    doc.text(textStr, COL_EDGES[1] + PAD_X, TRIMESTERS.baseline);
  }

  // ── Trame ──
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(BORDER);

  // Encadré G / F / T : aplats puis filets.
  GFT.fills.forEach((color, i) => {
    doc.setFillColor(color[0], color[1], color[2]);
    drawFill(doc, GFT.colEdges[i], GFT.colEdges[i + 1], GFT.rowEdges[0], gftBottom);
  });
  GFT.colEdges.forEach(x => stroke(doc, x, GFT.rowEdges[0], x, gftBottom + BORDER));
  GFT.rowEdges.forEach(y => stroke(doc, GFT.colEdges[0], y, GFT.colEdges[GFT.colEdges.length - 1] + BORDER, y));

// Bandeau des trimestres.
  drawTrimesters(doc);

  // Tableau principal.
  COL_EDGES.forEach(x => stroke(doc, x, ROW_EDGES[0], x, tableBottom + BORDER));
  ROW_EDGES.forEach(y => stroke(doc, COL_EDGES[0] + BORDER, y, COL_EDGES[COL_EDGES.length - 1], y));

  // ── Textes de l'encadré G / F / T ──
  useFont(doc, 'sans', 'bold');
  doc.setFontSize(GFT.size);
  GFT.labels.forEach((l, i) => drawCentered(doc, l, GFT.colEdges[i], GFT.colEdges[i + 1], GFT.labelBaseline));
  gftValues(data).forEach((v, i) => drawCentered(doc, v, GFT.colEdges[i], GFT.colEdges[i + 1], GFT.valueBaseline));

  // ── En-tête de colonnes ──
  HEAD_COLUMNS.forEach((col, i) => drawHeadCell(doc, col, COL_EDGES[i], COL_EDGES[i + 1]));

  // ── Lignes d'élèves ──
  useFont(doc, 'sans');
  doc.setFontSize(BODY_SIZE);
  const count = Math.min(ROWS_PER_PAGE, data.rows.length - offset);
  for (let i = 0; i < count; i += 1) {
    const row = data.rows[offset + i];
    const baseline = ROW_BASELINES[i];
    drawCentered(doc, row.number, COL_EDGES[0], COL_EDGES[1], baseline);
    doc.text(row.fullName, COL_EDGES[1] + PAD_X, baseline);
    drawCentered(doc, row.gender, COL_EDGES[2], COL_EDGES[3], baseline);

    if (row.periodGrades) {
      for (let p = 1; p <= 3; p++) {
        const pGrades = row.periodGrades[p];
        if (pGrades) {
          const colOffset = 3 + (p - 1) * 4;
          if (pGrades.i) drawCentered(doc, pGrades.i, COL_EDGES[colOffset], COL_EDGES[colOffset + 1], baseline);
          if (pGrades.d) drawCentered(doc, pGrades.d, COL_EDGES[colOffset + 1], COL_EDGES[colOffset + 2], baseline);
          if (pGrades.c) drawCentered(doc, pGrades.c, COL_EDGES[colOffset + 2], COL_EDGES[colOffset + 3], baseline);
          
          if (pGrades.mg) {
            useFont(doc, 'sans', 'bold');
            doc.setTextColor(220, 38, 38); // Tailwind red-600
            drawCentered(doc, pGrades.mg, COL_EDGES[colOffset + 3], COL_EDGES[colOffset + 4], baseline);
            doc.setTextColor(0, 0, 0);
            useFont(doc, 'sans'); // reset for next iterations
          }
        }
      }
    }
  }

  // ── Filigrane : posé après la trame, comme dans le document d'origine ──
  addImageSafe(
    doc, assets.watermark,
    IMAGES.watermark.x, IMAGES.watermark.y, IMAGES.watermark.w, IMAGES.watermark.h,
  );
}

/** Construit le document : une page par tranche d'élèves, une tranche par classe. */
export function buildNominalListPdf(opts: NominalListDocOptions): jsPDF {
  const { pages, assets } = opts;
  const doc = new jsPDF({ unit: 'pt', format: FORMAT, orientation: 'landscape' });
  doc.setProperties({
    title: pages.length === 1 ? `Liste nominative — ${pages[0].name}` : `Listes nominatives — ${opts.groupLabel}`,
    subject: opts.documentType === 'notes' ? 'Liste de notes' : 'Liste nominative de la classe',
  });

  const sheet = layoutNominalList(pages);
  sheet.forEach((page, i) => {
    if (i > 0) doc.addPage(FORMAT, 'landscape');
    drawPage(doc, page, assets, opts);
  });

  return doc;
}

