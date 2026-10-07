// Inventaire des flux du PDF généré : taille, décompression, contenu attendu
const { readFileSync } = require('fs');
const zlib = require('zlib');

const buf = readFileSync('c:/Users/Resp_ Tech/Desktop/Orion/smoke/presence_out.pdf');
const raw = buf.toString('latin1');
console.log('taille fichier:', buf.length);
console.log('occurrences stream:', (raw.match(/stream/g) || []).length);

let pos = 0;
let i = 0;
// eslint-disable-next-line no-constant-condition
while (true) {
  const m = /\bstream(\r\n|\n|\r)/.exec(raw.slice(pos));
  if (!m) break;
  const start = pos + m.index + m[0].length;
  const end = raw.indexOf('endstream', start);
  if (end < 0) break;
  i += 1;
  const slice = buf.subarray(start, end);
  let info = `flux ${i}: ${slice.length}B comprimé`;
  try {
    const data = zlib.inflateSync(slice);
    const t = data.toString('latin1');
    info += ` -> ${data.length}B | Tj/TJ=${t.includes('Tj') || t.includes('TJ')} | LISTE=${t.includes('LISTE')} | Ann=${t.includes('Ann')} | 10.5Tf=${t.includes('10.5 Tf')}`;
    if (t.includes('10.5 Tf') || t.includes('Ann')) {
      const k = Math.max(t.indexOf('Ann'), 0);
      info += '\n   extrait: ' + t.slice(Math.max(0, k - 100), k + 300).replace(/\n/g, ' | ');
    }
    if (t.includes('LISTE')) {
      const k = t.indexOf('LISTE');
      info += '\n   titre: ' + t.slice(Math.max(0, k - 150), k + 100).replace(/\n/g, ' | ');
    }
  } catch (e) {
    info += ` | inflate KO: ${e.message.slice(0, 60)}`;
  }
  console.log(info);
  pos = end + 9;
}
console.log('total flux:', i);
