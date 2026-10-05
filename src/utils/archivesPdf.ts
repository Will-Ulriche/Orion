import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
