// Affiche les flux texte de smoke/presence_out.pdf (extrait brut)
const { readFileSync } = require('fs');
const zlib = require('zlib');

const buf = readFileSync('c:/Users/Resp_ Tech/Desktop/Orion/smoke/presence_out.pdf');
const raw = buf.toString('latin1');
let pos = 0;
let i = 0;
// eslint-disable-next-line no-constant-condition
while (true) {
  const m = /stream\r?\n/.exec(raw.slice(pos));
  if (!m) break;
  const start = pos + m.index + m[0].length;
  const end = raw.indexOf('endstream', start);
  if (end < 0) break;
  let data = null;
  try { data = zlib.inflateSync(buf.subarray(start, end)).toString('latin1'); } catch { data = null; }
  if (data && (data.includes('Tj') || data.includes('TJ'))) {
    i += 1;
    const hasOurs = data.includes('10.5 Tf') || data.includes('11 Tf') || data.includes('12 Tf');
    console.log(`\n===== flux ${i} (${data.length} car.) ours=${hasOurs} =====`);
    // Extrait autour de notre texte attendu
    const forIdx = data.indexOf('Ann');
    const clsIdx = data.indexOf('A');
    const sample = hasOurs ? data.slice(0, 1500) : data.slice(0, 400);
    console.log(sample.replace(/\n/g, ' | '));
    if (hasOurs) {
      const k = data.search(/10\.5 Tf|11 Tf|12 Tf/);
      console.log('--- autour Tf ---');
      console.log(data.slice(Math.max(0, k - 200), k + 600).replace(/\n/g, ' | '));
    }
    void forIdx; void clsIdx;
  }
  pos = end + 9;
}
