/* Smoke « liste nominative » : génère smoke/nominal_out.pdf (données fictives). */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildNominalListPdf } from '../src/lib/nominalListPdf';
import {
  buildNominalListData, nominalListFileName,
  type NominalListClassInput,
} from '../src/lib/nominalListTemplate';

// jsPDF attend des data-URI : en Node on lit les PNG depuis le disque
// (loadNominalListAssets, réservé au navigateur, n'est pas appelé ici).
const dataUri = (p: string): string =>
  `data:image/png;base64,${readFileSync(resolve(process.cwd(), p)).toString('base64')}`;

const assets = {
  logo: dataUri('src/assets/orion_logo.png'),
  qr: dataUri('src/assets/orion_qr.png'),
  watermark: dataUri('src/assets/orion_watermark.png'),
};

const LAST_NAMES = [
  'KPOVITCHE', 'MBALLA', 'OYANE', 'ESSOMBA', 'NKOLO ABENA', 'FOUDA', 'AMEGAN',
];
const FIRST_NAMES = [
  'GWEMENE GLORIA DE DIEU', 'Marie-José', 'Jean-Baptiste', 'Aïcha',
  'Pierre Émile Bénédicte', 'Louise',
];

// 35 élèves → 2 pages (27 + 8), noms longs + accents + genres mixtes.
const bigClass: NominalListClassInput = {
  id: 'c1',
  name: '6ème A',
  students: Array.from({ length: 35 }, (_, i) => ({
    id: `s${i}`,
    lastName: `${LAST_NAMES[i % LAST_NAMES.length]}${i > 6 ? ` ${i}` : ''}`,
    firstName: FIRST_NAMES[i % FIRST_NAMES.length],
    gender: i % 3 === 0 ? null : i % 2 ? 'M' : 'F',
  })),
};

// Petite classe → 1 page, contrôle du second export.
const smallClass: NominalListClassInput = {
  id: 'c2',
  name: '3ème B',
  students: [
    { id: 't1', lastName: 'ZONGO', firstName: 'Alice', gender: 'F' },
    { id: 't2', lastName: 'BATOGO', firstName: 'Paul', gender: 'M' },
    { id: 't3', lastName: 'NGUEMA', firstName: 'Serge', gender: 'M' },
  ],
};

// Exemple 1 : export groupé des deux classes.
const classes = [bigClass, smallClass];
const pages = buildNominalListData(classes);
const doc = buildNominalListPdf({ pages, assets, groupLabel: 'Collège', documentType: 'nominative' });
const outPath = resolve(process.cwd(), 'smoke/nominal_out.pdf');
writeFileSync(outPath, Buffer.from(doc.output('arraybuffer')));
const name = nominalListFileName(pages, 'Collège', '2025-2026', 'nominative');
console.log(`OK ${outPath} — nom : ${name}`);

// Exemple 2 : une seule classe (nom de fichier dédié), pour comparaison au gabarit.
const only = buildNominalListData([bigClass]);
const doc2 = buildNominalListPdf({ pages: only, assets, groupLabel: 'Collège', documentType: 'nominative' });
const outPath2 = resolve(process.cwd(), 'smoke/nominal_out_single.pdf');
writeFileSync(outPath2, Buffer.from(doc2.output('arraybuffer')));
console.log(`OK ${outPath2} — nom : ${nominalListFileName(only, 'Collège', '2025-2026', 'nominative')}`);

// Exemple 3 : liste de notes (même gabarit, titre « LISTE DE NOTES »).
const doc3 = buildNominalListPdf({ pages: only, assets, groupLabel: 'Collège', documentType: 'notes', subjectName: 'Mathématiques' });
const outPath3 = resolve(process.cwd(), 'smoke/nominal_out_notes.pdf');
writeFileSync(outPath3, Buffer.from(doc3.output('arraybuffer')));
console.log(`OK ${outPath3} — nom : ${nominalListFileName(only, 'Collège', '2025-2026', 'notes')}`);

// Exemple 4 : classe sans élève — gabarit nu, pour comparaison pixel au modèle
// de référence (qui est lui aussi une coquille vide).
const emptyPages = buildNominalListData([{ id: 'c0', name: '', students: [] }]);
const doc4 = buildNominalListPdf({ pages: emptyPages, assets, groupLabel: 'Collège', documentType: 'nominative' });
const outPath4 = resolve(process.cwd(), 'smoke/nominal_out_ref.pdf');
writeFileSync(outPath4, Buffer.from(doc4.output('arraybuffer')));
console.log(`OK ${outPath4} (gabarit nu)`);

