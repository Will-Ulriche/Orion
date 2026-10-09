// Vérifie qu'un même PDFDocument modèle partagé est sûr : 2 builds séquentiels
// + 2 builds CONCURRENTS (aperçu + téléchargement qui se chevauchent).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const templateBytes = readFileSync(resolve(process.cwd(), 'public/liste_de_presence.pdf'));

// Chargement unique (simule le cache de src/lib/presenceListPdf.ts).
const t0 = performance.now();
const srcDoc = await PDFDocument.load(templateBytes);
console.log(`modèle chargé en ${(performance.now() - t0).toFixed(0)}ms (une seule fois)`);

const build = async (label) => {
  const start = performance.now();
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const [page] = await out.copyPages(srcDoc, [0]);
  const pdfPage = out.addPage(page);
  pdfPage.drawText(`AMEGAN ${label}`, { x: 62, y: 440, size: 10.5, font, color: rgb(0, 0, 0) });
  const bytes = await out.save();
  return { label, bytes, ms: performance.now() - start };
};

const results = await Promise.all([build('A'), build('B')]);
const third = await build('C');
results.push(third);

let failed = false;
for (const r of results) {
  const doc = await PDFDocument.load(r.bytes);
  // Cherche « AMEGAN » (hex WinAnsi) dans les flux texte déscompressés.
  const raw = Buffer.from(r.bytes).toString('latin1');
  let found = false;
  let pos = 0;
  for (;;) {
    const m = /stream\r?\n/.exec(raw.slice(pos));
    if (!m) break;
    const start = pos + m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    try {
      const data = inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1');
      const upper = data.toUpperCase();
      if (upper.includes('414D4547414E')) found = true; // « AMEGAN »
    } catch { /* flux binaire */ }
    pos = end + 9;
  }
  const ok = doc.getPageCount() === 1 && found;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'OK ' : 'ÉCHEC'} ${r.label} : pages=${doc.getPageCount()} texte=${found} ` +
    `(${r.bytes.length} o, ${r.ms.toFixed(0)}ms)`,
  );
}

if (failed) process.exit(1);
console.log('SHARED TEMPLATE : PASS (seq + conc)');
