/* Smoke « fiche d'identité » : génère smoke/identity_out.pdf (données fictives). */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildStudentIdentityPdf, studentIdentityFileName } from '../src/lib/studentIdentityPdf';
import type { StudentIdentityData } from '../src/lib/studentIdentityPdf';
import type { ReceiptSchoolInfo } from '../src/lib/receiptPdf';

const school: ReceiptSchoolInfo = {
  name: 'ORION COLLEGE EXPERIENCE',
  short_name: 'ORION',
  ministry_name: 'MINISTERE DES ENSEIGNEMENTS PRIMAIRES,\nSECONDAIRE,\nTECHNIQUE ET DE L\'ARTISANAT',
  address: 'Boulevard du 13 Janvier',
  city: 'Lomé',
  country: 'Togo',
  phone: '00228 93 35 53 39',
  email: 'contact@orion.tg',
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

// Élève complet (tous les champs remplis, valeurs longues → fitSize/truncate).
const full: StudentIdentityData = {
  studentId: 's1',
  firstName: 'GWEMENE GLORIA DE DIEU',
  lastName: 'KPOVITCHE',
  matricule: 'MAT-6CC997DB',
  className: '6ème A',
  birthDate: '2013-05-17',
  birthPlace: 'Lomé',
  gender: 'F',
  address: 'Tokoin Doumassessé, 3e rue Résidentielle, face à la pharmacie Dékou',
  phone: '+228 90 12 34 56',
  parentName: 'KPOVITCHE Adjovi Bernard',
  parentPhone: '+228 91 98 76 54',
  parentEmail: 'bernard.kpovitche@example.com',
  bloodType: 'O+',
  medicalNotes: 'Asthme léger — inhalateur à la trousse, éviter les efforts prolongés par forte chaleur.',
  photoUrl: null,
};

// Élève vide : tous les placeholders « Non renseigné » du gabarit.
const empty: StudentIdentityData = {
  studentId: 's2',
  firstName: null,
  lastName: null,
  matricule: null,
  className: null,
  birthDate: null,
  birthPlace: null,
  gender: null,
  address: null,
  phone: null,
  parentName: null,
  parentPhone: null,
  parentEmail: null,
  bloodType: null,
  medicalNotes: null,
  photoUrl: null,
};

// 1. Fiche complète + fiche vide (2 pages).
const doc = buildStudentIdentityPdf({ students: [full, empty], school });
const outPath = resolve(process.cwd(), 'smoke/identity_out.pdf');
writeFileSync(outPath, Buffer.from(doc.output('arraybuffer')));
const name = studentIdentityFileName([full, empty], '2025-2026');
console.log(`OK ${outPath} — nom : ${name}`);

// 2. Gabarit nu (aucune donnée) pour comparaison pixel au modèle de référence.
const bare = buildStudentIdentityPdf({ students: [empty], school });
const barePath = resolve(process.cwd(), 'smoke/identity_out_bare.pdf');
writeFileSync(barePath, Buffer.from(bare.output('arraybuffer')));
console.log(`OK ${barePath} — nom : ${studentIdentityFileName([empty], '2025-2026')}`);
