// Contrôle du PDF généré par smoke/run_presence.ts :
// vérifie que chaque donnée tombe DANS son emplacement (pas de débordement).
const { readFileSync } = require('fs');
const zlib = require('zlib');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const PDF_PATH = 'c:/Users/Resp_ Tech/Desktop/Orion/smoke/presence_out.pdf';

// ── Géométrie attendue (miroir de src/lib/presenceListPdf.ts) ────────────────
const STEP = (448.1 - 37.8) / 28;
const BASELINES = Array.from({ length: 28 }, (_, r) => 448.1 - (r + 1) * STEP + 4.5);
const NAME_X = 62;
const NAME_MAX_W = 176;
const NO_CENTER_X = 43;
const NO_LEFT = 21.4;
const NO_RIGHT = 56.9;
const CLASS_X = 718;
const CLASS_BASELINE = 551.2;
const CLASS_MAX_W = 100;
const YEAR_BASELINE = 510;
const GFT_BASELINE = 516.6;
const GFT_CELLS = [[665.38, 707.26], [707.74, 749.74], [750.22, 792.22]];

const approx = (a, b, eps = 0.25) => Math.abs(a - b) <= eps;
const inBaselines = (y) => BASELINES.some(b => approx(y, b));

// ── Lecture des flux texte ───────────────────────────────────────────────────
const buf = readFileSync(PDF_PATH);
const raw = buf.toString('latin1');
const streams = [];
let pos = 0;
// eslint-disable-next-line no-constant-condition
while (true) {
  const m = /stream\r?\n/.exec(raw.slice(pos));
  if (!m) break;
  const start = pos + m.index + m[0].length;
  const end = raw.indexOf('endstream', start);
  if (end < 0) break;
  try {
    const data = zlib.inflateSync(buf.subarray(start, end)).toString('latin1');
    if (data.includes('Tj') || data.includes('TJ')) streams.push(data);
  } catch { /* flux binaire */ }
  pos = end + 9;
}

const decodeStr = (s) => s
  .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[c]))
  .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));

const hexToStr = (hex) => {
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  return out;
};

const texts = [];
for (const content of streams) {
  const btRe = /BT([\s\S]*?)ET/g;
  let mm;
  while ((mm = btRe.exec(content))) {
    const body = mm[1];
    const tm = /1 0 0 1 ([\d.\-]+) ([\d.\-]+) Tm/.exec(body);
    const tf = /\/\S+\s+([\d.]+)\s+Tf/.exec(body);
    if (!tm) continue;
    let text = '';
    // pdf-lib écrit en hexadécimal ; Word écrit des TJ avec kerns entre les lettres.
    const partRe = /\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ|<([0-9A-Fa-f]+)>\s*Tj/g;
    let p;
    while ((p = partRe.exec(body))) {
      if (p[1] != null) {
        text += decodeStr(p[1]);
      } else if (p[2] != null) {
        const inner = p[2].replace(/\)-?\d+\(/g, ')(');
        const groups = [...inner.matchAll(/\(([^()]*)\)/g)].map(g => g[1]);
        if (groups.length === 0) continue; // TJ de kerns uniquement
        text += groups.map(decodeStr).join('');
      } else if (p[3] != null) {
        text += hexToStr(p[3]);
      }
    }
    if (!text.trim()) continue;
    texts.push({
      x: parseFloat(tm[1]),
      y: parseFloat(tm[2]),
      size: tf ? parseFloat(tf[1]) : 0,
      text,
    });
  }
}

const main = async () => {
  const fails = [];
  const ok = [];
  const fail = (msg) => fails.push(msg);
  const good = (cond, msg) => {
    if (cond) ok.push(msg);
    else fail(msg);
  };

  // ── Polices de mesure (les mêmes que le générateur) ──
  const scratch = await PDFDocument.create();
  const helv = await scratch.embedFont(StandardFonts.Helvetica);
  const bold = await scratch.embedFont(StandardFonts.HelveticaBold);

  // ── 1. Pages : 35 élèves → 2 pages, 3 élèves → 1 page = 3 ──
  const pageCount = (await PDFDocument.load(buf)).getPageCount();
  good(pageCount === 3, `pages = ${pageCount} (attendu 3 : 28+7 puis 3)`);

  // ── 2. Modèle intact ──
  good(texts.some(t => t.text.includes('LISTE DE PRESENCE')), 'modèle conservé (LISTE DE PRESENCE)');

  // ── 3. Champ « CLASSE : » ──
  for (const clsName of ['6ème A', '3ème B']) {
    const hits = texts.filter(t => t.text === clsName);
    const expected = clsName === '6ème A' ? 2 : 1;
    good(hits.length === expected, `"${clsName}" dessiné ${hits.length}× (attendu ${expected})`);
    for (const h of hits) {
      if (!approx(h.x, CLASS_X) || !approx(h.y, CLASS_BASELINE)) {
        fail(`"${clsName}" en (${h.x},${h.y}) ≠ (${CLASS_X},${CLASS_BASELINE})`);
      }
      const w = bold.widthOfTextAtSize(h.text, h.size);
      if (w > CLASS_MAX_W) fail(`"${clsName}" large ${w.toFixed(1)} > ${CLASS_MAX_W}`);
    }
  }

  // ── 4. Année centrée sous le titre, zone libre ──
  const years = texts.filter(t => t.text.startsWith('Année :'));
  good(years.length === 3, `année présente ${years.length}× (attendu 3)`);
  for (const y of years) {
    const w = helv.widthOfTextAtSize(y.text, y.size);
    if (!approx(y.y, YEAR_BASELINE)) fail(`année baseline ${y.y} ≠ ${YEAR_BASELINE}`);
    if (y.x + w > 530 || y.x < 300) fail(`année [${y.x.toFixed(1)}..${(y.x + w).toFixed(1)}] hors zone 300..530`);
  }

  // ── 5. Encadré G / F / T ──
  const gftExpected = [
    { v: '11', cell: 0, n: 2 }, { v: '12', cell: 1, n: 2 }, { v: '35', cell: 2, n: 2 },
    { v: '2', cell: 0, n: 1 }, { v: '1', cell: 1, n: 1 }, { v: '3', cell: 2, n: 1 },
  ];
  for (const e of gftExpected) {
    const hits = texts.filter(t =>
      t.text === e.v && approx(t.y, GFT_BASELINE) &&
      t.x >= GFT_CELLS[e.cell][0] - 1 && t.x <= GFT_CELLS[e.cell][1]);
    good(hits.length === e.n, `GFT[${e.cell}]="${e.v}" ${hits.length}× (attendu ${e.n})`);
  }

  // ── 6. Numéros : centrés dans la colonne N°, sur une baseline ──
  const nums = texts.filter(t => inBaselines(t.y) && t.x < 57 && /^\d+$/.test(t.text));
  good(nums.length === 38, `${nums.length} numéros de ligne (attendu 38)`);
  for (const n of nums) {
    const w = helv.widthOfTextAtSize(n.text, n.size);
    const left = NO_CENTER_X - w / 2;
    const right = NO_CENTER_X + w / 2;
    if (left < NO_LEFT - 0.1 || right > NO_RIGHT + 0.1) {
      fail(`numéro "${n.text}" [${left.toFixed(1)}..${right.toFixed(1)}] hors colonne N°`);
    }
  }

  // ── 7. Noms : x=62, baseline du modèle, largeur ≤ 176 ──
  const names = texts.filter(t => approx(t.x, NAME_X) && inBaselines(t.y));
  good(names.length === 38, `${names.length} noms d'élèves (attendu 38)`);
  for (const n of names) {
    if (!inBaselines(n.y)) { fail(`nom "${n.text}" baseline ${n.y} hors lignes du modèle`); continue; }
    const w = helv.widthOfTextAtSize(n.text, n.size);
    if (w > NAME_MAX_W + 0.1) fail(`nom "${n.text}" largeur ${w.toFixed(1)} > ${NAME_MAX_W} (débordement)`);
    if (NAME_X + w > 238.6) fail(`nom "${n.text}" finit à ${(NAME_X + w).toFixed(1)} > 238.6 (colonne des jours)`);
  }

  // ── Bilan ──
  console.log(`-- ${ok.length} contrôles OK --`);
  if (fails.length) {
    console.log(`\n!! ${fails.length} ÉCHEC(S) :`);
    for (const f of fails) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('SMOKE PRESENCE : PASS');
};

main().catch(e => { console.error(e); process.exit(1); });

