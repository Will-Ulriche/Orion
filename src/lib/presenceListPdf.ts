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
    .replace(/[u2018\u2019\u201A]/g, "'")
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
  yearName: string,
  logoDataUrl?: string,
  schoolName: string = 'ORION COLLEGE EXPERIENCE'
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
  
  let embeddedLogo: any = null;
  if (logoDataUrl) {
    try {
      if (logoDataUrl.includes('image/jpeg') || logoDataUrl.includes('image/jpg')) {
        embeddedLogo = await out.embedJpg(logoDataUrl);
      } else {
        embeddedLogo = await out.embedPng(logoDataUrl);
      }
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
        // Cache l'ancien logo Orion (coordonnées pdf-lib: bas-gauche)
        pdfPage.drawRectangle({ x: 35, y: 495, width: 300, height: 85, color: rgb(1, 1, 1) });
        
        const dims = embeddedLogo.scale(1);
        const maxW = 363; // max width de la zone
        const maxH = 182; // max height (en scale PDF, on divise par 2.83 pour pt)
        // En points : 128.39 mm = 363 pt, 64.2 mm = 182 pt.
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
      const rawTitle = (schoolName || 'ORION COLLEGE EXPERIENCE').toUpperCase();
      const titleLabel = winAnsi(rawTitle);
      const titleFont = bold;
      // Largeur de la page A4 paysage est 841.92 pt. Centre exact: 420.96
      const PAGE_CENTER_X = 841.92 / 2;
      const titleSize = fitSize(titleLabel, titleFont, 460, 24, 10);
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
      // On cache l'ancien texte de l'année pour éviter qu'il ne se superpose
      pdfPage.drawRectangle({ x: GEOM.yearField.centerX - 100, y: GEOM.yearField.baseline - 2, width: 200, height: 14, color: rgb(1, 1, 1) });

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

export function buildPresenceListHtml(
  classes: NominalListClassInput[],
  groupLabel: string,
  yearName: string,
  logoDataUrl?: string,
  schoolName: string = 'ORION COLLEGE EXPERIENCE'
): string {
  const pagesHtml = classes.flatMap((cls) => {
    const students = [...cls.students].sort(
      (a, b) =>
        (a.lastName || '').localeCompare(b.lastName || '') ||
        (a.firstName || '').localeCompare(b.firstName || '')
    );
    
    let boys = 0;
    let girls = 0;
    for (const st of students) {
      const g = genderCode(st.gender);
      if (g === 'M') boys += 1;
      else if (g === 'F') girls += 1;
    }
    
    const parts = Math.max(1, Math.ceil(students.length / GEOM.table.rows));
    
    const pageHtmls = [];
    
    for (let part = 0; part < parts; part += 1) {
      const start = part * GEOM.table.rows;
      const end = Math.min(students.length, start + GEOM.table.rows);
      
      let rowsHtml = '';
      for (let k = start; k < start + GEOM.table.rows; k += 1) {
        if (k < end) {
          const st = students[k];
          const raw = `${(st.lastName || '').trim()} ${(st.firstName || '').trim()}`.replace(/\s+/g, ' ').trim();
          const label = winAnsi(raw.toUpperCase()) || '—';
          rowsHtml += `<tr><td style="text-align: center;">${k + 1}</td><td class="nom">${label}</td>${'<td></td>'.repeat(40)}</tr>`;
        } else {
          rowsHtml += `<tr><td></td><td></td>${'<td></td>'.repeat(40)}</tr>`;
        }
      }

      const logoStyle = logoDataUrl ? `background: url('${logoDataUrl}') no-repeat left center/contain;` : '';

      pageHtmls.push(`
<div class="page">
  <div class="logo" style="${logoStyle}"></div>
  <div class="qr"></div>

  <div class="title">
    <h1>${schoolName || 'ORION COLLEGE EXPERIENCE'}</h1>
    <p>LISTE DE PRESENCE</p>
    <div style="font-size: 16px; margin-top: 5px; font-family: 'Times New Roman', serif;">Année : ${yearName}</div>
  </div>

  <div class="classe">CLASSE : ${cls.name}</div>
  <table class="gft">
    <tr><td class="g">G</td><td class="f">F</td><td class="t">T</td></tr>
    <tr><td class="g">${boys}</td><td class="f">${girls}</td><td class="t">${students.length}</td></tr>
  </table>

  <div class="days">
    <div>LUNDI</div><div>MARDI</div><div>MERCREDI</div><div>JEUDI</div><div>VENDREDI</div>
  </div>

  <table class="grid">
    <colgroup>
      <col style="width:43px"><col style="width:287px">
      ${'<col style="width:22px">'.repeat(40)}
    </colgroup>
    <thead>
      <tr><th class="n">N°</th><th class="nom">NOM ET PRENOM</th>
      ${Array.from({ length: 5 }).map(() => 
        Array.from({ length: 8 }).map((_, i) => `<th>${i + 1}</th>`).join('')
      ).join('')}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <svg class="barcode" xmlns="http://www.w3.org/2000/svg" width="180" height="32" viewBox="0 0 180 32" shape-rendering="crispEdges" fill="#000"><rect x="0" y="0" width="4" height="32"/><rect x="6" y="0" width="2" height="32"/><rect x="12" y="0" width="2" height="32"/><rect x="22" y="0" width="2" height="32"/><rect x="30" y="0" width="6" height="32"/><rect x="38" y="0" width="4" height="32"/><rect x="44" y="0" width="4" height="32"/><rect x="54" y="0" width="2" height="32"/><rect x="58" y="0" width="6" height="32"/><rect x="66" y="0" width="4" height="32"/><rect x="76" y="0" width="2" height="32"/><rect x="84" y="0" width="2" height="32"/><rect x="88" y="0" width="2" height="32"/><rect x="96" y="0" width="6" height="32"/><rect x="104" y="0" width="4" height="32"/><rect x="110" y="0" width="2" height="32"/><rect x="114" y="0" width="6" height="32"/><rect x="126" y="0" width="4" height="32"/><rect x="132" y="0" width="2" height="32"/><rect x="138" y="0" width="4" height="32"/><rect x="144" y="0" width="2" height="32"/><rect x="154" y="0" width="4" height="32"/><rect x="164" y="0" width="6" height="32"/><rect x="172" y="0" width="2" height="32"/><rect x="176" y="0" width="4" height="32"/></svg>

  <div class="foot">Orion Exp</div>
</div>`);
    }
    return pageHtmls;
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #94a3b8; font-family: "Times New Roman", Times, serif; }
  .page {
    position: relative; width: 1297px; height: 917px; margin: 0 auto 10pt;
    background: #fff; overflow: hidden;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .logo { position: absolute; left: 72px; top: 38px; width: 180px; height: 64px; background: transparent; }
  .qr { position: absolute; left: calc(72px + 64px + 1.5cm); top: 42px; width: 48px; height: 48px; border: 3px solid #000; background: #fff; }
  .qr::after { content: ""; position: absolute; inset: 8px; background: #000; }

  .title { position: absolute; left: 0; width: 1297px; top: 34px; text-align: center; }
  .title h1 { margin: 0; font: 600 29px/1 "Arial Narrow", "Oswald", Impact, sans-serif; color: #1558c0; letter-spacing: 0; transform: scaleX(.82); }
  .title p { margin: 8px 0 0; font-size: 24px; text-decoration: underline; }

  .classe { position: absolute; left: 1035px; top: 54px; font-weight: bold; font-size: 17px; }
  .gft { position: absolute; left: 1033px; top: 80px; width: 199px; height: 48px; border-collapse: collapse; font: bold 14px Calibri, Arial, sans-serif; text-align: center; }
  .gft td { border: 1px solid #555; height: 24px; }
  .gft .g { background: #d6dce4; } .gft .f { background: #fbe4d5; } .gft .t { background: #fff2cc; }
  .gft tr:first-child td { height: 24px; }
  .gft tr:last-child td { height: 24px; }
  .gft .g { width: 66px; } .gft .f, .gft .t { width: 66px; }

  /* Jours */
  .days { position: absolute; left: 373px; top: 157px; width: 881px; display: flex; }
  .days div {
    flex: 1; height: 35px; border: 2px solid #2f5aa0; margin-right: 2px;
    display: flex; align-items: center; justify-content: center;
    font: bold 19px Arial, sans-serif; letter-spacing: .5px;
  }

  /* Tableau */
  table.grid { position: absolute; left: 44px; top: 205px; width: 1210px; border-collapse: collapse; table-layout: fixed; }
  .grid th, .grid td { border: 1px solid #000; padding: 0; height: 23px; }
  .grid th { height: 22px; font: 400 14px Calibri, Arial, sans-serif; text-align: center; background: transparent; }
  .grid th.n, .grid th.nom { font-family: "Times New Roman", serif; font-size: 15px; }
  .grid th.nom { text-align: left; padding-left: 10px; }
  .grid td { background: transparent; }

  .barcode { position: absolute; right: 43px; top: 876px; background: #fff; }
  .foot { position: absolute; left: 72px; top: 884px; font-style: italic; font-size: 17px; }

  @media print {
    body { background: #fff; }
    .page { margin: 0; transform-origin: top left; break-after: page; page-break-after: always; }
    .page:last-of-type { break-after: auto; page-break-after: auto; }
  }
</style>
</head>
<body>
  ${pagesHtml.join('\n')}
</body>
</html>`;
}
