// Mesure du temps de chaque étape du pipeline de buildPresenceListPdf.
// Compare « SANS cache » (fetch + PDFDocument.load à chaque régénération =
// ancien comportement) et « AVEC cache » (modèle partagé = comportement
// actuel de src/lib/presenceListPdf.ts après preloadPresenceTemplate).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const templateBytes = readFileSync(resolve(process.cwd(), 'public/liste_de_presence.pdf'));

// Préchargement unique (simule preloadPresenceTemplate) : mesuré une seule fois.
const tPreload = performance.now();
const sharedSrcDoc = await PDFDocument.load(templateBytes);
const preloadMs = performance.now() - tPreload;

const makeStudents = (n) => Array.from({ length: n }, (_, i) => ({
  lastName: `NOM${i} TEST`, firstName: `Prenom${i}`,
}));

const run = async (label, classCount, studentsPerClass, shared) => {
  const t0 = performance.now();

  const out = await PDFDocument.create();
  const tCreate = performance.now();
  const regular = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const tFonts = performance.now();
  // SANS cache : re-parse complet (~400 ms) — AVEC cache : résolution immédiate.
  const srcDoc = shared ?? (await PDFDocument.load(templateBytes));
  const tLoad = performance.now();

  const black = rgb(0, 0, 0);
  let pages = 0;
  for (let c = 0; c < classCount; c += 1) {
    const students = makeStudents(studentsPerClass);
    const parts = Math.ceil(students.length / 28);
    for (let part = 0; part < parts; part += 1) {
      const [page] = await out.copyPages(srcDoc, [0]);
      const pdfPage = out.addPage(page);
      pages += 1;
      const start = part * 28;
      const end = Math.min(students.length, start + 28);
      for (let k = start; k < end; k += 1) {
        const name = `${students[k].lastName} ${students[k].firstName}`.toUpperCase();
        pdfPage.drawText(String(k + 1), { x: 40, y: 440 - (k - start) * 14, size: 10.5, font: regular, color: black });
        pdfPage.drawText(name, { x: 62, y: 440 - (k - start) * 14, size: 10.5, font: regular, color: black });
      }
      // Zones titre/année/encadrés (comme le vrai générateur)
      pdfPage.drawRectangle({ x: 35, y: 497, width: 300, height: 83, color: rgb(1, 1, 1) });
      pdfPage.drawText('ORION COLLEGE EXPERIENCE', { x: 300, y: 550, size: 16, font: bold, color: black });
      pdfPage.drawRectangle({ x: 271, y: 497, width: 300, height: 33, color: rgb(1, 1, 1) });
      pdfPage.drawText('Annee : 2025-2026', { x: 360, y: 510, size: 11, font: regular, color: black });
      pdfPage.drawText('CLASSE', { x: 718, y: 551.2, size: 11, font: bold, color: black });
      ['1', '2', '35'].forEach((v, i) => pdfPage.drawText(v, { x: 680 + i * 42, y: 516.6, size: 12, font: bold, color: black }));
    }
  }
  const tDraw = performance.now();
  const bytes = await out.save();
  const tSave = performance.now();

  const ms = (a, b) => `${(b - a).toFixed(0).padStart(4)}ms`;
  console.log(
    `${label.padEnd(40)} pages=${String(pages).padStart(3)}` +
    ` | load ${ms(tFonts, tLoad)} | copy+draw ${ms(tLoad, tDraw)} | save ${ms(tDraw, tSave)}` +
    ` | TOTAL ${ms(t0, tSave)} (${bytes.length} o)`,
  );
};

console.log(`préchargement du modèle (une seule fois) : ${preloadMs.toFixed(0)}ms\n`);

const SCENARIOS = [
  ['1 classe × 28 élèves', 1, 28],
  ['3 classes × 40 élèves', 3, 40],
  ['8 classes × 45 élèves', 8, 45],
  ['15 classes × 50 élèves', 15, 50],
];
for (const [label, classes, per] of SCENARIOS) {
  await run(`SANS cache — ${label}`, classes, per, null);
  await run(`AVEC cache — ${label}`, classes, per, sharedSrcDoc);
}
