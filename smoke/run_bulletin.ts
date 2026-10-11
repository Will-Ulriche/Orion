/* Smoke « bulletin » : génère smoke/bulletin_out.pdf (données fictives). */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildBulletinPdf, bulletinFileName } from '../src/lib/bulletinPdf';
import type { BulletinData, BulletinSubjectRow } from '../src/lib/bulletinPdf';
import type { ReceiptSchoolInfo } from '../src/lib/receiptPdf';

const school: ReceiptSchoolInfo = {
  name: 'ORION COLLEGE EXPERIENCE',
  short_name: 'ORION',
  ministry_name: "Ministère de l'Enseignement Primaire, Secondaire et de l'Artisanat\nDirection Régionale de l'Éducation (DRE-Maritime)",
  address: '',
  city: 'Lomé',
  country: 'Togo',
  phone: '',
  email: '',
  website: '',
  registration_number: '',
  logo_url: '',
  stamp_url: '',
  signature_url: '',
  head_title: 'Directeur',
  head_name: '',
  slogan: '',
  currency: 'XOF',
};

// Matières du gabarit (valeurs du dump de référence).
const subjects: BulletinSubjectRow[] = [
  { name: 'Français / Littérature', coefficient: 4, interro: 14.5, devoir: 13, compo: 15, average: 14.13, rank: 4, appreciation: 'Excellent' },
  { name: 'Anglais', coefficient: 3, interro: 15, devoir: 14, compo: 16, average: 15, rank: 2, appreciation: 'Excellent' },
  { name: 'Allemand', coefficient: 3, interro: 12, devoir: 13.5, compo: 13, average: 12.88, rank: 8, appreciation: 'Bien' },
  { name: 'Histoire - Géographie', coefficient: 3, interro: 11, devoir: 12, compo: 11.5, average: 11.5, rank: 15, appreciation: 'Assez Bien' },
  { name: 'ECM / Philosophie', coefficient: 2, interro: 13, devoir: 12.5, compo: 14, average: 13.13, rank: 6, appreciation: 'Bien' },
  { name: 'Mathématiques', coefficient: 2, interro: 8, devoir: 9.5, compo: 7, average: 8.13, rank: 35, appreciation: 'Insuffisant' },
  { name: 'Sciences Physiques (PCT)', coefficient: 2, interro: 9, devoir: 10, compo: 8.5, average: 9.13, rank: 30, appreciation: 'Passable' },
  { name: 'SVT', coefficient: 2, interro: 10.5, devoir: 11, compo: 12, average: 11.25, rank: 18, appreciation: 'Assez Bien' },
  { name: 'EPS', coefficient: 1, interro: 16, devoir: 15, compo: 16, average: 15.67, rank: 3, appreciation: 'Excellent' },
  { name: 'Informatique / TIC', coefficient: 1, interro: 15, devoir: 14, compo: 16, average: 15, rank: 5, appreciation: 'Excellent' },
  { name: 'Économie / Entrepreneuriat', coefficient: 1, interro: 12, devoir: 11, compo: 13, average: 12, rank: 14, appreciation: 'Bien' },
  { name: 'Éducation Musicale / Arts', coefficient: 1, interro: 14, devoir: 15, compo: 14, average: 14.33, rank: 6, appreciation: 'Bien' },
  { name: 'Matière Optionnelle / Autre', coefficient: 1, interro: null, devoir: null, compo: null, average: null, rank: null, appreciation: '' },
];

const bulletin: BulletinData = {
  studentFirstName: 'Latevi Jean',
  studentLastName: 'LAWSON-BODY',
  matricule: '2025-CSJ-089',
  className: '1ère A4 (Littéraire)',
  periodOrder: 1,
  yearName: '2025-2026',
  subjects,
  // Règle : note absente = 0 ; moyenne matière = (i+d+c)/3 ; moyenne = Σ(moy×coef)/Σcoefs.
  generalAverage: subjects.reduce((sum, s) => sum + ((s.interro ?? 0) + (s.devoir ?? 0) + (s.compo ?? 0)) / 3 * s.coefficient, 0)
    / subjects.reduce((sum, s) => sum + s.coefficient, 0),
  rank: 10,
  classSize: 42,
  classAverage: 11.05,
  bestAverage: 16.8,
  worstAverage: 6.15,
  globalAppreciation: "Élève sérieux, discipliné et très performant dans les disciplines littéraires et langues. Consolidez les matières scientifiques au prochain trimestre pour élever encore davantage votre moyenne générale.",
  homeroomTeacher: 'Mme DOSSEH K.',
};
console.log(`Moyenne générale (règle) : ${bulletin.generalAverage?.toFixed(4)}`);

const doc = buildBulletinPdf({ bulletin, school });
const outPath = resolve(process.cwd(), 'smoke/bulletin_out.pdf');
writeFileSync(outPath, Buffer.from(doc.output('arraybuffer')));
console.log(`OK ${outPath} — nom : ${bulletinFileName([bulletin], '2025-2026')}`);

// Cas « vide » : aucune note (tout en tirets) — contrôle des placeholders.
const empty: BulletinData = {
  ...bulletin,
  studentFirstName: 'Ama',
  studentLastName: 'KOSSI',
  matricule: null,
  subjects: subjects.slice(0, 3).map(s => ({ ...s, interro: null, devoir: null, compo: null, average: null, rank: null, appreciation: '' })),
  generalAverage: null,
  rank: null,
  classAverage: null,
  bestAverage: null,
  worstAverage: null,
  globalAppreciation: '',
};
const emptyDoc = buildBulletinPdf({ bulletin: empty, school });
const emptyPath = resolve(process.cwd(), 'smoke/bulletin_out_empty.pdf');
writeFileSync(emptyPath, Buffer.from(emptyDoc.output('arraybuffer')));
console.log(`OK ${emptyPath}`);
