// Localise les opérations /Do (images) dans TOUS les flux décompressés
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
    if (data.includes('Do')) streams.push(data);
  } catch { /* binaire */ }
  pos = end + 9;
}
console.log('flux contenant Do:', streams.length, 'tailles:', streams.map(x => x.length));
streams.forEach((c, i) => {
  let idx = 0; let n = 0;
  // eslint-disable-next-line no-cond-assign
  while ((idx = c.indexOf(' Do', idx)) >= 0 && n < 8) {
    const a = Math.max(0, idx - 300);
    console.log(`\n--- flux ${i} Do#${n} ---\n` + c.slice(a, idx + 4).replace(/\n/g, ' | '));
    idx += 3; n += 1;
  }
});
