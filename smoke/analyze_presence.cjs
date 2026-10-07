// Analyse du modèle liste_de_presence.pdf : page, flux, texte et quadrillage
const fs = require('fs');
const zlib = require('zlib');

const path = 'c:/Users/Resp_ Tech/Desktop/Orion/public/liste_de_presence.pdf';
const buf = fs.readFileSync(path);
const s = buf.toString('latin1');

const out = [];
const mb = [...s.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map(m => m[1]);
out.push('MediaBox: ' + JSON.stringify(mb));
const rot = [...s.matchAll(/\/Rotate\s+(-?\d+)/g)].map(m => m[1]);
out.push('Rotate: ' + JSON.stringify(rot));
out.push('Images (/Subtype /Image): ' + (s.match(/\/Subtype\s*\/Image/g) || []).length);
out.push('Fonts: ' + JSON.stringify([...s.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-]+)/g)].map(m => m[1])));

let pos = 0;
let n = 0;
// eslint-disable-next-line no-constant-condition
while (true) {
  const m = /stream\r?\n/.exec(s.slice(pos));
  if (!m) break;
  const start = pos + m.index + m[0].length;
  const end = s.indexOf('endstream', start);
  if (end < 0) break;
  const raw = buf.subarray(start, end);
  let data = null;
  let inflated = false;
  try { data = zlib.inflateSync(raw); inflated = true; } catch { data = raw; }
  const txt = data.toString('latin1');
  if (/(Tj|TJ|Tm|re\b| l$)/m.test(txt)) {
    n += 1;
    out.push(`\n===== stream #${n} (inflated=${inflated}, ${data.length} bytes) =====`);
    out.push(txt.slice(0, 12000));
  }
  pos = end + 9;
}

fs.writeFileSync('c:/Users/Resp_ Tech/Desktop/Orion/smoke/presence_streams.txt', out.join('\n'), 'latin1');
console.log('streams dumped:', n);
