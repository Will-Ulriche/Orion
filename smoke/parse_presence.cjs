// Parse le flux de contenu principal de liste_de_presence.pdf :
// - texte (Tm + Tj/TJ) => libellés et positions
// - rectangles (re) => quadrillage de la table
const fs = require('fs');
const zlib = require('zlib');

const path = 'c:/Users/Resp_ Tech/Desktop/Orion/public/liste_de_presence.pdf';
const buf = fs.readFileSync(path);
const s = buf.toString('latin1');

// ── 1. Décompression des flux ────────────────────────────────────────────────
const streams = [];
let pos = 0;
// eslint-disable-next-line no-constant-condition
while (true) {
  const m = /stream\r?\n/.exec(s.slice(pos));
  if (!m) break;
  const start = pos + m.index + m[0].length;
  const end = s.indexOf('endstream', start);
  if (end < 0) break;
  const raw = buf.subarray(start, end);
  try {
    const data = zlib.inflateSync(raw).toString('latin1');
    if (data.includes('Tj') || data.includes('TJ')) streams.push(data);
  } catch { /* flux binaire */ }
  pos = end + 9;
}
console.log('flux texte:', streams.length);
const content = streams.sort((a, b) => b.length - a.length)[0];

// ── 2. Chaînes PDF décodées ─────────────────────────────────────────────────
const decodeStr = (raw) => raw
  .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[c]))
  .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
  .replace(/\\\r?\n/g, '');

// ── 3. Extraction texte : Tm puis Tj/TJ dans le même BT/ET ─────────────────
const texts = [];
const btRe = /BT([\s\S]*?)ET/g;
let mm;
while ((mm = btRe.exec(content))) {
  const body = mm[1];
  const tm = /1 0 0 1 ([\d.\-]+) ([\d.\-]+) Tm/.exec(body);
  const tf = /\/(F\d+)\s+([\d.]+)\s+Tf/.exec(body);
  const parts = [...body.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g)];
  if (!tm || parts.length === 0) continue;
  let text = '';
  for (const p of parts) text += decodeStr(p[1] ?? p[2] ?? '').replace(/[[\]]/g, '');
  if (!text.trim()) continue;
  texts.push({
    x: parseFloat(tm[1]), y: parseFloat(tm[2]),
    font: tf ? tf[1] : '?', size: tf ? parseFloat(tf[2]) : 0,
    text: text.trim(),
  });
}
texts.sort((a, b) => b.y - a.y || a.x - b.x);
console.log('textes non vides:', texts.length);

// ── 4. Rectangles (remplissage ou contour) ──────────────────────────────────
const rects = [];
const reRe = /([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) re/g;
while ((mm = reRe.exec(content))) {
  const [x, y, w, h] = [parseFloat(mm[1]), parseFloat(mm[2]), parseFloat(mm[3]), parseFloat(mm[4])];
  if (w < 0.01 || h < 0.01) continue;
  rects.push({ x, y, w, h });
}
console.log('rects:', rects.length);

const out = [];
out.push('== TEXTES (y desc) ==');
for (const t of texts) out.push(`y=${t.y.toFixed(1)} x=${t.x.toFixed(1)} ${t.font} ${t.size} "${t.text}"`);
out.push('\n== RECTS (grands / lignes) ==');
// on garde les rects utiles : larges (lignes horizontales) ou hauts (verticales) ou grands blocs
for (const r of rects.filter(r => r.w > 30 || r.h > 30)) {
  out.push(`x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} w=${r.w.toFixed(1)} h=${r.h.toFixed(1)}`);
}
fs.writeFileSync('c:/Users/Resp_ Tech/Desktop/Orion/smoke/presence_parsed.txt', out.join('\n'), 'utf8');
console.log('écrit presence_parsed.txt');
