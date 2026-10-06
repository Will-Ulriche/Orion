import { jsPDF } from 'jspdf';
import logoAsset from '../assets/orion_logo.png';
import qrAsset from '../assets/orion_qr.png';
import watermarkAsset from '../assets/orion_watermark.png';
import {
  BORDER, BORDER_SHIFT, BODY_SIZE, COL_EDGES, GFT, HEAD_BASELINE, HEAD_COLUMNS,
  HEAD_SIZE, IMAGES, PAGE, PAD_X, ROWS_PER_PAGE, ROW_BASELINES, ROW_EDGES,
  SUPERSCRIPT, SUPERSCRIPT_RATIO, TEXT, TITLE_BAND, TITLE_BAND_CENTER, TRIMESTERS,
  gftValues, nominalListFileName,
  type HeadColumn,
  type NominalListClassData,
} from './nominalListTemplate';

// ─────────────────────────────────────────────────────────────────────────────
// Rendu du modèle « LISTE NOMINATIVE DE LA CLASSE »
//
// Deux sorties à partir d'une seule géométrie (lib/nominalListTemplate) :
//   • buildNominalListHtml → aperçu fidèle dans une iframe (CSS) ;
//   • buildNominalListPdf  → fichier A4 paysage (jsPDF, tracés vectoriels).
// Le découpage en pages est calculé une seule fois (layoutNominalList) et
// partagé par les deux rendus : l'aperçu et le PDF sont donc superposables.
//
// Les polices du modèle (Anton, Times New Roman, Calibri) ne sont ni intégrables
// dans jsPDF sans les fichiers .ttf, ni disponibles hors ligne dans le WebView :
// on pose les polices standard les plus proches. Ni la structure ni la mise en
// page ne changent.
// ─────────────────────────────────────────────────────────────────────────────

type Rgb = readonly [number, number, number];
type Family = 'serif' | 'sans';
type Style = '' | 'normal' | 'bold' | 'italic';

export interface NominalListAssets {
  logo: string;
  qr: string;
  watermark: string;
}

// ── Images ───────────────────────────────────────────────────────────────────

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

let assetsPromise: Promise<NominalListAssets> | null = null;

/**
 * Charge les trois images du modèle en data-URI (jsPDF et l'iframe ne gèrent pas
 * d'URL de module). Résultat mis en cache : l'aperçu et le PDF partagent
 * exactement les mêmes images.
 */
export function loadNominalListAssets(): Promise<NominalListAssets> {
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

// ─────────────────────────────────────────────────────────────────────────────
// Découpage en pages (commun aux deux rendus)
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
 * découpage : si l'aperçu et le PDF divergeaient, l'aperçu mentirait à
 * l'utilisateur sur le nombre de feuilles qu'il va obtenir.
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

// ─────────────────────────────────────────────────────────────────────────────
// Aperçu HTML
// ─────────────────────────────────────────────────────────────────────────────

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const px = (v: number): string => `${v}pt`;

/** Filet : rectangle plein ancré sur la coordonnée, comme dans le PDF. */
function rule(x: number, y: number, w: number, h: number): string {
  return `<i class="rule" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)}"></i>`;
}

/** Segment vertical (coordonnée x) et segment horizontal (coordonnée y). */
function vLines(edges: readonly number[], y0: number, y1: number): string {
  return edges.map(x => rule(x, y0, BORDER, y1 - y0)).join('');
}

function hLines(edges: readonly number[], x0: number, x1: number): string {
  return edges.map(y => rule(x0, y, x1 - x0, BORDER)).join('');
}

/** Aplat : fond d'une colonne, entre les filets, sur toute la bande. */
function fill(x: number, xNext: number, top: number, bottom: number, color: Rgb): string {
  return (
    `<i style="left:${px(x + BORDER_SHIFT)};top:${px(top + BORDER_SHIFT)};` +
    `width:${px(xNext - x - BORDER_SHIFT)};height:${px(bottom - top - BORDER_SHIFT)};` +
    `background:rgb(${color[0]},${color[1]},${color[2]})"></i>`
  );
}

/** Ancre d'un texte positionné à la ligne de base `top`. */
type Anchor =
  | { kind: 'x'; x: number } // bord gauche fixe
  | { kind: 'center'; at: number } // centré sur x
  | { kind: 'column'; from: number; to: number }; // centré dans [from, to]

/** `content` est du HTML déjà échappé. `top` est la ligne de base, pas le haut. */
function text(content: string, anchor: Anchor, top: number, size: number, cls = ''): string {
  const place =
    anchor.kind === 'x'
      ? `left:${px(anchor.x)};`
      : anchor.kind === 'center'
        ? `left:${px(anchor.at)};transform:translateX(-50%);`
        : `left:${px(anchor.from)};width:${px(anchor.to - anchor.from)};text-align:center;`;
  return `<span class="t ${cls}" style="${place}top:${px(top)};font-size:${px(size)}">${content}</span>`;
}

/** Libellé d'en-tête de colonne, avec son éventuel exposant. */
function headCell(col: HeadColumn, from: number, to: number): string {
  const anchor: Anchor =
    col.align === 'center' ? { kind: 'column', from, to } : { kind: 'x', x: from + PAD_X };
  const content = esc(col.label) + (col.superscript ? `<sup>${esc(col.superscript)}</sup>` : '');
  return text(content, anchor, HEAD_BASELINE[col.font], HEAD_SIZE, col.font);
}

const gftBottom = GFT.rowEdges[GFT.rowEdges.length - 1];
const trimesterBottom = TRIMESTERS.rowEdges[TRIMESTERS.rowEdges.length - 1];
const tableBottom = ROW_EDGES[ROW_EDGES.length - 1];

/** Une page du modèle. */
function renderPage(page: NominalListPage, assets: NominalListAssets): string {
  const { data, offset } = page;
  const gft = gftValues(data);

  const gftRow = (baseline: number, values: readonly string[]) =>
    values
      .map((v, i) =>
        text(esc(v), { kind: 'column', from: GFT.colEdges[i], to: GFT.colEdges[i + 1] }, baseline, GFT.size, 'sans b'),
      )
      .join('');

  const trimestreRow = TRIMESTERS.labels
    .map((l, i) =>
      text(esc(l), { kind: 'column', from: TRIMESTERS.colEdges[i], to: TRIMESTERS.colEdges[i + 1] }, TRIMESTERS.baseline, TRIMESTERS.size, 'sans b'),
    )
    .join('');

  const headRow = HEAD_COLUMNS.map((col, i) => headCell(col, COL_EDGES[i], COL_EDGES[i + 1])).join('');

  // Lignes d'élèves : N°, NOM ET PRENOM, Sexe. Les colonnes de notes restent
  // vides, comme sur le modèle (elles sont destinées aux moyennes).
  const rows = ROW_BASELINES.map((baseline, i) => {
    const row = data.rows[offset + i];
    if (!row) return '';
    const top = ROW_EDGES[i + 1];
    const cell = (value: string, col: number) =>
      text(esc(value), { kind: 'x', x: COL_EDGES[col] + PAD_X }, baseline, BODY_SIZE, 'sans');
    const centerCell = (value: string, col: number) =>
      text(esc(value), { kind: 'center', at: (COL_EDGES[col] + COL_EDGES[col + 1]) / 2 }, baseline, BODY_SIZE, 'sans');
    return `<div class="row" style="top:${px(top)};height:${px(ROW_EDGES[i + 2] - top)}">${centerCell(row.number, 0)}${cell(row.fullName, 1)}${centerCell(row.gender, 2)}</div>`;
  }).join('');

  return `
  <div class="page">
    <img class="abs" src="${assets.logo}" style="left:${px(IMAGES.logo.x)};top:${px(IMAGES.logo.y)};width:${px(IMAGES.logo.w)};height:${px(IMAGES.logo.h)}" alt="" />
    <img class="abs" src="${assets.qr}" style="left:${px(IMAGES.qr.x)};top:${px(IMAGES.qr.y)};width:${px(IMAGES.qr.w)};height:${px(IMAGES.qr.h)}" alt="" />

    ${text(esc(TEXT.brand.label), { kind: 'center', at: TITLE_BAND_CENTER }, TEXT.brand.baseline, TEXT.brand.size, 'brand')}
    ${text(esc(TEXT.title.label), { kind: 'x', x: TEXT.title.x }, TEXT.title.baseline, TEXT.title.size, 'serif')}
    ${rule(TEXT.title.x, TEXT.title.baseline + TEXT.title.underline.dy, TEXT.title.underline.width, TEXT.title.underline.thickness)}
    ${text(`${esc(TEXT.classLabel.label)} ${esc(data.name)}`, { kind: 'x', x: TEXT.classLabel.x }, TEXT.classLabel.baseline, TEXT.classLabel.size, 'serif b')}
    ${text(esc(TEXT.footer.label), { kind: 'x', x: TEXT.footer.x }, TEXT.footer.baseline, TEXT.footer.size, 'serif i')}

    <div class="fills">
      ${GFT.colEdges.slice(0, -1).map((x, i) => fill(x, GFT.colEdges[i + 1], GFT.rowEdges[0], gftBottom, GFT.fills[i])).join('')}
      ${TRIMESTERS.colEdges.slice(0, -1).map((x, i) => fill(x, TRIMESTERS.colEdges[i + 1], TRIMESTERS.rowEdges[0], trimesterBottom, TRIMESTERS.fill)).join('')}
    </div>

    <div class="grid">
      ${vLines(GFT.colEdges, GFT.rowEdges[0], gftBottom + BORDER)}
      ${hLines(GFT.rowEdges, GFT.colEdges[0], GFT.colEdges[GFT.colEdges.length - 1] + BORDER)}
      ${gftRow(GFT.labelBaseline, GFT.labels)}
      ${gftRow(GFT.valueBaseline, gft)}

      ${vLines(TRIMESTERS.colEdges, TRIMESTERS.rowEdges[0], trimesterBottom + BORDER)}
      ${hLines(TRIMESTERS.rowEdges, TRIMESTERS.colEdges[0], TRIMESTERS.colEdges[TRIMESTERS.colEdges.length - 1] + BORDER)}
      ${trimestreRow}

      ${vLines(COL_EDGES, ROW_EDGES[0], tableBottom + BORDER)}
      ${hLines(ROW_EDGES, COL_EDGES[0] + BORDER, COL_EDGES[COL_EDGES.length - 1])}
      ${headRow}
      ${rows}
    </div>

    <img class="abs" src="${assets.watermark}" style="left:${px(IMAGES.watermark.x)};top:${px(IMAGES.watermark.y)};width:${px(IMAGES.watermark.w)};height:${px(IMAGES.watermark.h)}" alt="" />
  </div>`;
}

export interface NominalListDocOptions {
  pages: NominalListClassData[];
  assets: NominalListAssets;
  groupLabel: string;
  documentType?: 'nominative' | 'notes';
  subjectName?: string;
}

/**
 * Aperçu HTML : une page A4 paysage par tranche d'élèves, repères et dimensions
 * identiques au PDF. `iframe.contentWindow.print()` produit le même document.
 */
export function buildNominalListHtml(opts: NominalListDocOptions): string {
  const { pages, assets, groupLabel } = opts;
  const title = pages.length === 1 ? pages[0].name : `${groupLabel} — ${pages.length} classes`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Liste nominative — ${esc(title)}</title>
<style>
  @page { size: ${PAGE.width}pt ${PAGE.height}pt; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #94a3b8; }
  .page {
    position: relative; overflow: hidden;
    width: ${PAGE.width}pt; height: ${PAGE.height}pt;
    margin: 0 auto 10pt; background: #fff;
    color: #000; font-family: Calibri, 'Segoe UI', Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .abs { position: absolute; }
  /* Filets noirs et aplats, dans cet ordre : aplats sous les filets. */
  .grid i, .rule { position: absolute; background: #000; }
  .fills i { position: absolute; }
  /* Textes : la position « top » est la ligne de base, pas le haut de la boîte. */
  .t { position: absolute; white-space: nowrap; line-height: 1; }
  .serif { font-family: 'Times New Roman', Times, serif; }
  .sans { font-family: Calibri, 'Segoe UI', Arial, sans-serif; }
  .b { font-weight: 700; }
  .i { font-style: italic; }
  /* Anton est très condensé : on resserre le substitut pour retrouver sa largeur. */
  .brand {
    font-family: 'Arial Narrow', 'Liberation Sans Narrow', Anton, Impact, sans-serif;
    font-weight: 800; letter-spacing: -0.2pt;
    transform: translateX(-50%) scaleX(0.8); transform-origin: center;
  }
  .row { position: absolute; left: 0; width: 100%; }
  /* « e » de « MG » : le modèle le place ${SUPERSCRIPT.dy} pt sous la ligne de base. */
  sup {
    font-size: ${(SUPERSCRIPT_RATIO * 100).toFixed(0)}%;
    vertical-align: baseline; position: relative; top: ${px(SUPERSCRIPT.dy)};
    line-height: 0;
  }
  @media print {
    html, body { background: #fff; }
    .page { margin: 0; break-after: page; page-break-after: always; }
    .page:last-of-type { break-after: auto; page-break-after: auto; }
  }
</style>
</head>
<body>
${layoutNominalList(pages).map(p => renderPage(p, assets)).join('\n')}
</body>
</html>`;
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
  doc.setFontSize(TRIMESTERS.size);
  TRIMESTERS.labels.forEach((l, i) =>
    drawCentered(doc, l, TRIMESTERS.colEdges[i], TRIMESTERS.colEdges[i + 1], TRIMESTERS.baseline),
  );
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

/** Dessine une page complète : images, titres, encadrés, trame, élèves, filigrane. */
function drawPage(doc: jsPDF, page: NominalListPage, assets: NominalListAssets, opts: NominalListDocOptions): void {
  const { data, offset } = page;

  // ── Images ──
  doc.addImage(assets.logo, 'PNG', IMAGES.logo.x, IMAGES.logo.y, IMAGES.logo.w, IMAGES.logo.h, undefined, 'FAST');
  doc.addImage(assets.qr, 'PNG', IMAGES.qr.x, IMAGES.qr.y, IMAGES.qr.w, IMAGES.qr.h, undefined, 'FAST');

  // ── Titres ──
  useFont(doc, 'sans', 'bold');
  doc.setFontSize(TEXT.brand.size);
  doc.setTextColor(...(TEXT.brand.color as unknown as [number, number, number]));
  drawCentered(doc, TEXT.brand.label, TITLE_BAND.left, TITLE_BAND.right, TEXT.brand.baseline);

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
  doc.addImage(
    assets.watermark, 'PNG',
    IMAGES.watermark.x, IMAGES.watermark.y, IMAGES.watermark.w, IMAGES.watermark.h,
    undefined, 'FAST',
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

/** Nombre total de feuilles qu'un export produira. */
export function nominalListPageCount(pages: NominalListClassData[]): number {
  return layoutNominalList(pages).length;
}

export function saveNominalListPdf(opts: NominalListDocOptions & { fileName: string }): void {
  buildNominalListPdf(opts).save(opts.fileName);
}

export { nominalListFileName };