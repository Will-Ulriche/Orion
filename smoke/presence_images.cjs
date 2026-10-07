// Images du modèle liste_de_presence.pdf : positions (/Do + cm) et extraction PNG
const fs = require('fs');
const zlib = require('zlib');

const path = 'c:/Users/Resp_ Tech/Desktop/Orion/public/liste_de_presence.pdf';
const buf = fs.readFileSync(path);
const s = buf.toString('latin1');

// ── 1. Flux de contenu : opérations cm suivies de /Do ────────────────────────
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
    if (data.includes(' Do')) streams.push(data);
  } catch { /* binaire */ }
  pos = end + 9;
}
const content = streams.sort((a, b) => b.length - a.length)[0] || '';
const placements = [];
const re = /q\s*\n?([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) cm\s*\n?\s*\/(\w+) Do/g;
let m2;
while ((m2 = re.exec(content))) {
  placements.push({
    a: parseFloat(m2[1]), b: parseFloat(m2[2]), c: parseFloat(m2[3]),
    d: parseFloat(m2[4]), e: parseFloat(m2[5]), f: parseFloat(m2[6]), name: m2[7],
  });
}
console.log('placements:', JSON.stringify(placements, null, 1));

// ── 2. XObject Images : dict + données ──────────────────────────────────────
// On cherche /Subtype /Image avec leur nom d'objet
const objRe = /(\d+) 0 obj([\s\S]*?)endobj/g;
let m3;
const images = [];
while ((m3 = objRe.exec(s))) {
  const body = m3[2];
  if (!/\/Subtype\s*\/Image/.test(body)) continue;
  const dictEnd = body.indexOf('stream');
  if (dictEnd < 0) continue;
  const dict = body.slice(0, dictEnd);
  const name = /\/(Im\w+)/.exec(dict);
  const w = /\/Width\s+(\d+)/.exec(dict);
  const h = /\/Height\s+(\d+)/.exec(dict);
  const filt = /\/Filter\s*\/(\w+)/.exec(dict);
  const bpc = /\/BitsPerComponent\s+(\d+)/.exec(dict);
  const cs = /\/ColorSpace\s*(\w+|\[.*?\])/s.exec(dict);
  const sm = /stream\r?\n/.exec(body.slice(dictEnd));
  const dataStart = dictEnd + (sm ? sm[0].length : 0);
  const dataEnd = body.lastIndexOf('endstream');
  images.push({
    obj: m3[1], name: name ? name[1] : '?', w: w ? +w[1] : 0, h: h ? +h[1] : 0,
    filter: filt ? filt[1] : 'none', bpc: bpc ? +bpc[1] : 8,
    cs: cs ? cs[1].replace(/\s+/g, ' ') : '?',
    data: Buffer.from(body.slice(dataStart, dataEnd), 'latin1'),
    dict: dict.replace(/\s+/g, ' ').slice(0, 400),
  });
}
for (const im of images) {
  console.log(`obj ${im.obj} ${im.name} ${im.w}x${im.h} ${im.filter} bpc=${im.bpc} cs=${im.cs} ${im.data.length}B`);
  console.log('  dict:', im.dict);
  const outFile = `c:/Users/Resp_ Tech/Desktop/Orion/smoke/presence_img_${im.obj}.bin`;
  let png = null;
  try {
    const raw = im.filter === 'FlateDecode' ? zlib.inflateSync(im.data) : im.data;
    // Construire un PNG minimal si format brut (RGB/Gray, 8 bits)
    if (im.bpc === 8 && /^(\/DeviceRGB|3)$/.test(im.cs.replace(/[\[\]]/g, ''))) {
      png = toPng(raw, im.w, im.h, 3);
    } else if (im.bpc === 8 && /^(\/DeviceGray|1)$/.test(im.cs.replace(/[\[\]]/g, ''))) {
      png = toPng(raw, im.w, im.h, 1);
    }
  } catch (e) { console.log('  inflate/convert:', e.message); }
  if (png) {
    const pngPath = outFile.replace('.bin', '.png');
    fs.writeFileSync(pngPath, png);
    console.log('  ->', pngPath);
  } else {
    fs.writeFileSync(outFile, im.data);
    console.log('  -> raw', outFile);
  }
}

function toPng(raw, w, h, channels) {
  const zlibDef = require('zlib');
  const stride = w * channels;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const off = y * stride;
    if (off + stride > raw.length) throw new Error('données trop courtes');
    rows.push(Buffer.concat([Buffer.from([0]), raw.subarray(off, off + stride)]));
  }
  const idat = zlibDef.deflateSync(Buffer.concat(rows));
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 3 ? 2 : 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
