import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReceiptSchoolInfo } from '../lib/receiptPdf';

// ─────────────────────────────────────────────────────
// Générateurs PDF de la page Archives
// Style visuel identique à utils/pdfGenerator.ts
// ─────────────────────────────────────────────────────

const PRIMARY: [number, number, number] = [79, 70, 229]; // #4f46e5
const SLATE_800: [number, number, number] = [30, 41, 59];
const SLATE_100_ROW: [number, number, number] = [248, 250, 252];
const SLATE_200_LINE: [number, number, number] = [226, 232, 240];

const sanitize = (s: string) =>
  (s || 'document').replace(/[^\w\dÀ-ÿ-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

/** En-tête commun : établissement, année, titre du document. Renvoie le Y de départ. */
function addHeader(doc: jsPDF, centerX: number, schoolName: string, yearName: string, title: string): number {
  doc.setFontSize(20);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text(schoolName || 'Établissement scolaire', centerX, 18, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Année académique : ${yearName}`, centerX, 25, { align: 'center' });

  doc.setFontSize(15);
  doc.setTextColor(SLATE_800[0], SLATE_800[1], SLATE_800[2]);
  doc.text(title, centerX, 37, { align: 'center' });

  doc.setDrawColor(SLATE_200_LINE[0], SLATE_200_LINE[1], SLATE_200_LINE[2]);
  doc.line(centerX - 91, 43, centerX + 91, 43);

  return 51;
}

/** Pied de page : date de génération + pagination. */
function addFooter(doc: jsPDF, label: string) {
  const pages = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const today = new Date().toLocaleDateString('fr-FR');
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Document généré le ${today} — ${label}`, 14, pageH - 8);
    doc.text(`${i} / ${pages}`, pageW - 14, pageH - 8, { align: 'right' });
  }
}

const baseTableStyles = {
  theme: 'grid' as const,
  headStyles: { fillColor: PRIMARY, textColor: 255, halign: 'center' as const },
  alternateRowStyles: { fillColor: SLATE_100_ROW },
  styles: { fontSize: 10, cellPadding: 3, lineColor: SLATE_200_LINE },
};

// ── Liste des élèves ─────────────────────────────────

export interface StudentListRow {
  matricule: string | null;
  lastName: string | null;
  firstName: string | null;
  gender: string | null;
  className: string | null;
  level: string | null;
}

export const generateStudentListPdf = (opts: {
  schoolName: string;
  yearName: string;
  groupLabel: string;
  rows: StudentListRow[];
}) => {
  const doc = new jsPDF();
  const y = addHeader(doc, 105, opts.schoolName, opts.yearName, `LISTE DES ÉLÈVES — ${opts.groupLabel.toUpperCase()}`);

  autoTable(doc, {
    startY: y,
    head: [['N°', 'Matricule', 'Nom', 'Prénoms', 'Sexe', 'Classe', 'Niveau']],
    body: opts.rows.map((r, i) => [
      String(i + 1),
      r.matricule || '—',
      (r.lastName || '').toLocaleUpperCase('fr-FR'),
      r.firstName || '',
      r.gender || '',
      r.className || '—',
      r.level || '—',
    ]),
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      4: { halign: 'center', cellWidth: 14 },
    },
    ...baseTableStyles,
  });

  const finalY = (doc as any).lastAutoTable.finalY as number;
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Effectif total : ${opts.rows.length} élève(s)`, 14, finalY + 9);

  addFooter(doc, `Liste des élèves — ${opts.groupLabel}`);
  doc.save(`Liste_eleves_${sanitize(opts.groupLabel)}_${sanitize(opts.yearName)}.pdf`);
};

// ── Effectifs par classe ─────────────────────────────

export interface ClassStatsRow {
  name: string;
  level: string | null;
  count: number;
  teacher: string | null;
}

export const generateClassStatsPdf = (opts: {
  schoolName: string;
  yearName: string;
  groupLabel: string;
  rows: ClassStatsRow[];
}) => {
  const doc = new jsPDF();
  const y = addHeader(doc, 105, opts.schoolName, opts.yearName, `EFFECTIFS PAR CLASSE — ${opts.groupLabel.toUpperCase()}`);

  const total = opts.rows.reduce((sum, r) => sum + r.count, 0);

  autoTable(doc, {
    startY: y,
    head: [['Classe', 'Niveau', 'Effectif', 'Professeur principal']],
    body: [
      ...opts.rows.map(r => [r.name, r.level || '—', String(r.count), r.teacher || '—']),
      ['TOTAL', '', String(total), ''],
    ],
    columnStyles: {
      0: { fontStyle: 'bold' },
      2: { halign: 'center', cellWidth: 24, fontStyle: 'bold' },
    },
    ...baseTableStyles,
  });

  const finalY = (doc as any).lastAutoTable.finalY as number;
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`${opts.rows.length} classe(s) · ${total} élève(s)`, 14, finalY + 9);

  addFooter(doc, `Effectifs — ${opts.groupLabel}`);
  doc.save(`Effectifs_${sanitize(opts.groupLabel)}_${sanitize(opts.yearName)}.pdf`);
};

// ── Emploi du temps (modèle imprimable) ──────────────

export const generateTimetableTemplatePdf = (opts: {
  schoolName: string;
  yearName: string;
  className: string;
}) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const y = addHeader(doc, width / 2, opts.schoolName, opts.yearName, `EMPLOI DU TEMPS — ${opts.className.toUpperCase()}`);

  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const slots = [
    '07:30 - 08:30', '08:30 - 09:30', '09:30 - 10:30', '10:45 - 11:45',
    '11:45 - 12:45', '13:30 - 14:30', '14:30 - 15:30', '15:30 - 16:30',
  ];

  autoTable(doc, {
    startY: y,
    head: [['Horaire', ...days]],
    body: slots.map(slot => [slot, '', '', '', '', '']),
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold', cellWidth: 30, fillColor: [238, 242, 255] },
    },
    headStyles: { fillColor: PRIMARY, textColor: 255, halign: 'center', fontSize: 11 },
    alternateRowStyles: { fillColor: SLATE_100_ROW },
    styles: { fontSize: 10, cellPadding: 5, lineColor: SLATE_200_LINE, minCellHeight: 14 },
  });

  const finalY = ((doc as any).lastAutoTable.finalY as number) + 8;
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Modèle vierge à renseigner (matière / salle / professeur). Classe : ${opts.className} — Année : ${opts.yearName}`,
    14, finalY
  );

  addFooter(doc, `Emploi du temps — ${opts.className}`);
  doc.save(`Emploi_du_temps_${sanitize(opts.className)}_${sanitize(opts.yearName)}.pdf`);
};

// ── Liste du personnel ───────────────────────────────

export interface StaffListRow {
  matricule: string | null;
  nom: string;
  prenoms: string;
  type: string | null;
  fonction: string | null;
  statut: string;
}

export const generateStaffListPdf = (opts: {
  schoolName: string;
  yearName: string;
  rows: StaffListRow[];
}) => {
  const doc = new jsPDF();
  const y = addHeader(doc, 105, opts.schoolName, opts.yearName, 'LISTE DU PERSONNEL');

  autoTable(doc, {
    startY: y,
    head: [['N°', 'Matricule', 'Nom & Prénoms', 'Type', 'Fonction', 'Statut']],
    body: opts.rows.map((r, i) => [
      String(i + 1),
      r.matricule || '—',
      `${(r.nom || '').toLocaleUpperCase('fr-FR')} ${r.prenoms || ''}`.trim(),
      r.type || '—',
      r.fonction || '—',
      r.statut || '—',
    ]),
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      5: { halign: 'center' },
    },
    ...baseTableStyles,
  });

  const finalY = (doc as any).lastAutoTable.finalY as number;
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Effectif : ${opts.rows.length} membre(s)`, 14, finalY + 9);

  addFooter(doc, 'Liste du personnel');
  doc.save(`Liste_personnel_${sanitize(opts.yearName)}.pdf`);
};

// ── Fiche d'identité du personnel (A4) ────────────────

/** Type miroir des champs utiles du modèle Rust Staff (module personnel). */
export interface StaffIdentityData {
  id: string;
  matricule?: string | null;
  nom: string;
  prenoms: string;
  sexe?: string | null;
  date_naissance?: string | null;
  lieu_naissance?: string | null;
  nationalite?: string | null;
  situation_matrimoniale?: string | null;
  nombre_enfants?: number | null;
  telephone_principal?: string | null;
  telephone_secondaire?: string | null;
  email?: string | null;
  adresse?: string | null;
  region?: string | null;
  commune?: string | null;
  quartier?: string | null;
  urgence_nom?: string | null;
  urgence_telephone?: string | null;
  type_personnel?: string | null;
  fonction?: string | null;
  statut_professionnel?: string | null;
  matricule_professionnel?: string | null;
  categorie?: string | null;
  grade?: string | null;
  diplome_academique?: string | null;
  diplome_professionnel?: string | null;
  specialite?: string | null;
  date_recrutement?: string | null;
  date_prise_service?: string | null;
  date_affectation?: string | null;
  etablissement?: string | null;
  statut_administratif?: string | null;
  observations?: string | null;
}

export interface StaffIdentityDocOptions {
  staff: StaffIdentityData;
  school: ReceiptSchoolInfo;
  yearName: string;
}

type IdPair = [string, string];
interface IdSection { title: string; rows: IdPair[]; }

const idVal = (v?: string | number | null): string => {
  if (v === null || v === undefined) return '—';
  const s = String(v).trim();
  return s || '—';
};

const idDate = (d?: string | null): string => {
  if (!d) return '—';
  const iso = d.split('T')[0];
  const [y, m, day] = iso.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
};

export const staffFullName = (s: StaffIdentityData): string =>
  `${(s.nom || '').toLocaleUpperCase('fr-FR')} ${s.prenoms || ''}`.trim();

function identitySections(s: StaffIdentityData): IdSection[] {
  const adresse = [s.adresse, s.quartier, s.commune, s.region].filter(Boolean).join(', ');
  return [
    {
      title: 'Informations personnelles',
      rows: [
        ['Matricule', idVal(s.matricule)],
        ['Sexe', idVal(s.sexe)],
        ['Date de naissance', idDate(s.date_naissance)],
        ['Lieu de naissance', idVal(s.lieu_naissance)],
        ['Nationalité', idVal(s.nationalite)],
        ['Situation matrimoniale', idVal(s.situation_matrimoniale)],
        ['Nombre d\'enfants', idVal(s.nombre_enfants)],
        ['Statut administratif', idVal(s.statut_administratif)],
      ],
    },
    {
      title: 'Coordonnées',
      rows: [
        ['Téléphone', idVal(s.telephone_principal)],
        ['Téléphone secondaire', idVal(s.telephone_secondaire)],
        ['Email', idVal(s.email)],
        ['Adresse', idVal(adresse)],
        ['Contact d\'urgence', idVal(s.urgence_nom)],
        ['Téléphone d\'urgence', idVal(s.urgence_telephone)],
      ],
    },
    {
      title: 'Informations professionnelles',
      rows: [
        ['Type de personnel', idVal(s.type_personnel)],
        ['Fonction', idVal(s.fonction)],
        ['Statut professionnel', idVal(s.statut_professionnel)],
        ['Catégorie', idVal(s.categorie)],
        ['Grade', idVal(s.grade)],
        ['Matricule professionnel', idVal(s.matricule_professionnel)],
        ['Diplôme académique', idVal(s.diplome_academique)],
        ['Diplôme professionnel', idVal(s.diplome_professionnel)],
        ['Spécialité', idVal(s.specialite)],
      ],
    },
    {
      title: 'Affectation & situation',
      rows: [
        ['Établissement', idVal(s.etablissement)],
        ['Date de recrutement', idDate(s.date_recrutement)],
        ['Date de prise de service', idDate(s.date_prise_service)],
        ['Date d\'affectation', idDate(s.date_affectation)],
        ['Observations', idVal(s.observations)],
      ],
    },
  ];
}

const idEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Aperçu HTML de la fiche d'identité, mis en page au format A4 (210 × 297 mm).
 * Utilisé dans l'iframe d'aperçu : `iframe.contentWindow.print()` produit un PDF A4
 * grâce à `@page { size: A4; }`.
 */
export function buildStaffIdentityHtml(opts: StaffIdentityDocOptions): string {
  const { staff, school, yearName } = opts;
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const schoolMeta = [school.address, school.city, school.phone].filter(Boolean).join(' · ');

  const blocks = identitySections(staff).map(sec => `
      <section class="block">
        <h2>${idEscape(sec.title)}</h2>
        <div class="grid">
${sec.rows.map(([k, v]) => `          <div class="field"><span class="k">${idEscape(k)}</span><span class="v">${idEscape(v)}</span></div>`).join('\n')}
        </div>
      </section>`).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Fiche d'identité — ${idEscape(staffFullName(staff))}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: #e2e8f0; color: #1e293b; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 11pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 16mm; background: #fff; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8mm; }
  .school-name { font-size: 16pt; font-weight: 700; color: #4f46e5; line-height: 1.2; }
  .school-meta { font-size: 8.5pt; color: #64748b; margin-top: 1mm; }
  .year { text-align: right; font-size: 8.5pt; color: #64748b; white-space: nowrap; }
  .year strong { display: block; font-size: 10.5pt; color: #1e293b; }
  h1 { margin: 7mm 0 0; font-size: 15pt; font-weight: 700; letter-spacing: 0.04em; text-align: center; color: #1e293b; }
  .rule { height: 0.6mm; background: #4f46e5; margin: 3mm 0 5mm; }
  .identity { display: flex; align-items: center; justify-content: space-between; gap: 6mm; background: #eef2ff; border: 0.3mm solid #c7d2fe; border-radius: 2mm; padding: 3.5mm 4.5mm; }
  .identity .name { font-size: 13pt; font-weight: 700; color: #312e81; }
  .identity .meta { font-size: 9pt; color: #475569; margin-top: 1mm; }
  .identity .status { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #4f46e5; white-space: nowrap; }
  .block { margin-top: 5mm; }
  .block h2 { margin: 0 0 2mm; font-size: 9.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #4f46e5; border-bottom: 0.3mm solid #e2e8f0; padding-bottom: 1.2mm; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm 8mm; }
  .field { border-bottom: 0.2mm dotted #cbd5e1; padding-bottom: 1.2mm; }
  .k { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }
  .v { display: block; font-size: 10pt; color: #1e293b; font-weight: 600; word-break: break-word; }
  .foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 8mm; margin-top: 10mm; font-size: 8pt; color: #94a3b8; }
  .sign { text-align: center; font-size: 8.5pt; color: #64748b; border-top: 0.3mm solid #cbd5e1; border-radius: 1mm; padding: 2mm 4mm 0; width: 62mm; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div>
        <div class="school-name">${idEscape(school.name || 'Établissement scolaire')}</div>
        ${school.ministry_name ? `<div class="school-meta">${idEscape(school.ministry_name)}</div>` : ''}
        ${schoolMeta ? `<div class="school-meta">${idEscape(schoolMeta)}</div>` : ''}
      </div>
      <div class="year">Année académique<strong>${idEscape(yearName)}</strong></div>
    </div>

    <h1>FICHE D'IDENTITÉ</h1>
    <div class="rule"></div>

    <div class="identity">
      <div>
        <div class="name">${idEscape(staffFullName(staff))}</div>
        <div class="meta">Matricule : ${idEscape(idVal(staff.matricule))} — Fonction : ${idEscape(idVal(staff.fonction))}</div>
      </div>
      <div class="status">${idEscape(idVal(staff.statut_administratif))}</div>
    </div>
${blocks}

    <div class="foot">
      <span>Document généré le ${today} — ${idEscape(school.short_name || school.name || 'Orion')}</span>
      <span class="sign">Signature &amp; cachet</span>
    </div>
  </div>
</body>
</html>`;
}

/** Fiche d'identité au format A4 portrait (210 × 297 mm). */
export function buildStaffIdentityPdf(opts: StaffIdentityDocOptions): jsPDF {
  const { staff, school, yearName } = opts;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;
  const y = addHeader(doc, centerX, school.name || 'Établissement scolaire', yearName, "FICHE D'IDENTITÉ");

  // Bandeau identité
  const bandY = y;
  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(199, 210, 254);
  doc.roundedRect(14, bandY, 182, 17, 2.5, 2.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(49, 46, 129);
  doc.text(staffFullName(staff), 18, bandY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Matricule : ${idVal(staff.matricule)}   ·   Fonction : ${idVal(staff.fonction)}`, 18, bandY + 13);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(79, 70, 229);
  doc.text(idVal(staff.statut_administratif).toUpperCase(), 192, bandY + 10, { align: 'right' });

  // Sections en 4 colonnes : libellé/valeur ×2
  const body: any[] = [];
  for (const sec of identitySections(staff)) {
    body.push([{
      content: sec.title.toUpperCase(),
      colSpan: 4,
      styles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold', halign: 'left', fontSize: 9.5 },
    }]);
    for (let i = 0; i < sec.rows.length; i += 2) {
      const left = sec.rows[i];
      const right = sec.rows[i + 1];
      body.push([
        { content: left[0], styles: { fontStyle: 'bold', fillColor: SLATE_100_ROW } },
        left[1],
        right ? { content: right[0], styles: { fontStyle: 'bold', fillColor: SLATE_100_ROW } } : '',
        right ? right[1] : '',
      ]);
    }
  }

  autoTable(doc, {
    startY: bandY + 24,
    body,
    theme: 'grid',
    margin: { left: 14, right: 14, bottom: 16 },
    styles: { fontSize: 9.5, cellPadding: 2.6, lineColor: SLATE_200_LINE, valign: 'middle', overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 51 },
      2: { cellWidth: 40 },
      3: { cellWidth: 51 },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY as number;
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  if (finalY + 40 < pageH - 14) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Fait le ${today}`, 14, finalY + 12);
    doc.text('Signature du demandeur', pageW - 14, finalY + 12, { align: 'right' });
    doc.setDrawColor(SLATE_200_LINE[0], SLATE_200_LINE[1], SLATE_200_LINE[2]);
    doc.line(pageW - 78, finalY + 30, pageW - 14, finalY + 30);
    doc.text('Le Directeur / La Directrice — cachet', pageW - 14, finalY + 35, { align: 'right' });
  }

  addFooter(doc, `Fiche d'identité — ${staffFullName(staff)}`);
  return doc;
}

export function saveStaffIdentityPdf(opts: StaffIdentityDocOptions): void {
  buildStaffIdentityPdf(opts).save(`Fiche_identite_${sanitize(staffFullName(opts.staff))}.pdf`);
}
