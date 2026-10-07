// Parse les DEUX flux texte + grille (rects) de liste_de_presence.pdf
const fs = require('fs');
const zlib = require('zlib');

const path = 'c:/Users/Resp_ Tech/Desktop/Orion/public/liste_de_presence.pdf';
const buf = fs.readFileSync(path);
const s = buf.toString('latin1');

const streams = [];
let pos = 0;
// eslint-disable-next-line no-constant-condition
while (true) {
  const m = /stream\r?\n/.exec(s.slice(pos));
  if (!m) break;
  const start = pos + m.index + m[0].length;
  const end = s.indexOf('endstream', start);
  if (end < 0) break;
  try {
    const data = zlib.inflateSync(buf.subarray(start, end)).toString('latin1');
    if (data.includes('Tj') || data.includes('TJ')) streams.push(data);
  } catch { /* binaire */ }
  pos = end + 9;
}

const decodeStr = (raw) => raw
  .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[c]))
  .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
  .replace(/\\\r?\n/g, '');
const hexToStr = (hex) => {
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  return out;
};

const out = [];
let total = 0;
streams.forEach((content, si) => {
  out.push(`\n##### FLUX TEXTE #${si + 1} (${content.length} car.) #####`);
  const btRe = /BT([\s\S]*?)ET/g;
  let mm;
  const items = [];
  while ((mm = btRe.exec(content))) {
    const body = mm[1];
    const tm = /1 0 0 1 ([\d.\-]+) ([\d.\-]+) Tm/.exec(body);
    const tf = /\/(F\d+)\s+([\d.]+)\s+Tf/.exec(body);
    if (!tm) continue;
    let text = '';
    const partRe = /\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ|<([0-9A-Fa-f]+)>\s*Tj/g;
    let p;
    while ((p = partRe.exec(body))) {
      if (p[1] != null) text += decodeStr(p[1]);
      else if (p[2] != null) text += decodeStr(p[2]).replace(/[[\]]/g, '');
      else if (p[3] != null) text += hexToStr(p[3]);
    }
    if (!text.trim()) continue;
    items.push({ x: parseFloat(tm[1]), y: parseFloat(tm[2]), font: tf ? tf[1] : '?', size: tf ? parseFloat(tf[2]) : 0, text: text.trim() });
  }
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  total += items.length;
  for (const t of items) out.push(`y=${t.y.toFixed(1)} x=${t.x.toFixed(1)} ${t.font} ${t.size} "${t.text}"`);
});
console.log('textes:', total);

// ── Grille : rects ──────────────────────────────────────────────────────────
const content0 = streams.sort((a, b) => b.length - a.length)[0];
const rects = [];
const reRe = /([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) re/g;
let mm2;
while ((mm2 = reRe.exec(content0))) {
  const [x, y, w, h] = [parseFloat(mm2[1]), parseFloat(mm2[2]), parseFloat(mm2[3]), parseFloat(mm2[4])];
  if (w < 0.01 || h < 0.01) continue;
  rects.push({ x, y, w, h });
}
// lignes horizontales longues (w>=100, h<=3) : lignes de la table
const hLines = rects.filter(r => r.w >= 100 && r.h <= 3).sort((a, b) => b.y - a.y || a.w - b.w);
// lignes verticales (h>=30, w<=3)
const vLines = rects.filter(r => r.h >= 30 && r.w <= 3).sort((a, b) => a.x - b.x);
out.push('\n##### LIGNES HORIZONTALES (w>=100,h<=3) #####');
let prevY = null;
for (const r of hLines) {
  if (prevY !== null && Math.abs(r.y - prevY) < 1) continue;
  out.push(`y=${r.y.toFixed(1)} x=${r.x.toFixed(1)}..${(r.x + r.w).toFixed(1)} (w=${r.w.toFixed(1)})`);
  prevY = r.y;
}
out.push('\n##### LIGNES VERTICALES (h>=30,w<=3) #####');
let prevX = null;
for (const r of vLines) {
  if (prevX !== null && Math.abs(r.x - prevX) < 1) continue;
  out.push(`x=${r.x.toFixed(1)} y=${r.y.toFixed(1)}..${(r.y + r.h).toFixed(1)} (h=${r.h.toFixed(1)})`);
  prevX = r.x;
}
out.push('\n##### BLOCS GRANDS (w>50,h>30) #####');
for (const r of rects.filter(r => r.w > 50 && r.h > 30).slice(0, 60)) {
  out.push(`x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} w=${r.w.toFixed(1)} h=${r.h.toFixed(1)}`);
}

fs.writeFileSync('c:/Users/Resp_ Tech/Desktop/Orion/smoke/presence_parsed2.txt', out.join('\n'), 'utf8');
console.log('écrit presence_parsed2.txt, rects:', rects.length);
