import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReceiptSchoolInfo } from './receiptPdf';
import { formatDate, formatMoney } from './receiptPdf';

export interface ReportClassRow {
  class_id: string | null;
  class_name: string;
  student_count: number;
  total_due: number;
  total_paid: number;
  remaining_balance: number;
}

export interface ReportMethodRow {
  method: string;
  amount: number;
  payment_count: number;
}

export interface ReportDebtorRow {
  enrollment_id: string;
  first_name: string;
  last_name: string;
  class_name: string;
  total_due: number;
  total_paid: number;
  remaining_balance: number;
  status: string;
}

export interface ReportFeeRow {
  name: string;
  amount: number;
  fee_type: string;
  applies_to: string;
  class_name: string | null;
  due_date: string | null;
  is_mandatory: boolean;
}

export interface FinanceReportData {
  total_due: number;
  total_paid: number;
  remaining_balance: number;
  recovery_rate: number;
  student_count: number;
  settled_count: number;
  partial_count: number;
  unpaid_count: number;
  cancelled_payment_count: number;
  by_class: ReportClassRow[];
  by_method: ReportMethodRow[];
  debtors: ReportDebtorRow[];
  fees: ReportFeeRow[];
}

export interface BuildFinanceReportOptions {
  school: ReceiptSchoolInfo;
  year: string;
  data: FinanceReportData;
  methodLabels: { id: string; label: string }[];
  feeTypeLabels: { id: string; label: string }[];
  exportedBy: string;
}

const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [203, 213, 225];
const BRAND: [number, number, number] = [79, 70, 229];
const BRAND_LIGHT: [number, number, number] = [199, 210, 254];

const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

type AutoTableDoc = jsPDF & {
  lastAutoTable: { finalY: number };
  previousAutoTableFinalY?: number | number[];
};

function heading(doc: jsPDF, text: string, y: number): number {
  doc.setFillColor(...BRAND);
  doc.rect(MARGIN, y - 3.4, 2.4, 4.4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(text.toUpperCase(), MARGIN + 5, y);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y + 2.2, PAGE_W - MARGIN, y + 2.2);
  return y + 7;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= 272) return y;
  // L'en-tête de page est redessiné par le hook didDrawPage du tableau suivant.
  doc.addPage();
  return 35;
}

export function buildFinanceReportPdf(opts: BuildFinanceReportOptions): jsPDF {
  const { school, year, data, methodLabels, feeTypeLabels, exportedBy } = opts;
  const currency = school.currency || 'XOF';
  const money = (cents: number) => formatMoney(cents, currency);
  const labelOf = (list: { id: string; label: string }[], id: string) =>
    list.find(x => x.id === id)?.label ?? id;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const t = doc as AutoTableDoc;
  doc.setProperties({
    title: `Rapport financier ${year}`,
    subject: `Situation du recouvrement — ${school.name || year}`,
  });

  // ── En-tête (répété sur chaque page) ───────────────────────
  const drawHeader = () => {
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, PAGE_W, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(school.name || 'Établissement', MARGIN, 9.5, { maxWidth: 120 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND_LIGHT);
    const loc = [school.address, school.city, school.country].filter(Boolean).join(', ');
    doc.text(doc.splitTextToSize(loc || school.ministry_name || '', 120) as string[], MARGIN, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('RAPPORT FINANCIER', PAGE_W - MARGIN, 9.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Année scolaire ${year}`, PAGE_W - MARGIN, 14, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(
      `Édité le ${formatDate(new Date().toISOString().slice(0, 10))} par ${exportedBy}`,
      PAGE_W / 2, 28, { align: 'center' },
    );
    return 35;
  };

  let y = drawHeader();

  // ── Synthèse ────────────────────────────────────────────────
  y = heading(doc, 'Synthèse de la campagne', y);

  const kpis: { label: string; value: string; color: [number, number, number] }[] = [
    { label: 'Total attendu', value: money(data.total_due), color: INK },
    { label: 'Total encaissé', value: money(data.total_paid), color: [5, 150, 105] },
    { label: 'Reste à recouvrer', value: money(Math.max(0, data.remaining_balance)), color: [220, 38, 38] },
    { label: 'Taux de recouvrement', value: `${data.recovery_rate.toFixed(1)} %`, color: BRAND },
  ];
  const kpiW = (CONTENT_W - 9) / 4;
  kpis.forEach(({ label, value, color }, i) => {
    const x = MARGIN + i * (kpiW + 3);
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, kpiW, 16, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 3, y + 5, { maxWidth: kpiW - 6 });
    doc.setFontSize(12);
    doc.setTextColor(...color);
    doc.text(value, x + 3, y + 12, { maxWidth: kpiW - 6 });
  });
  y += 21;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  const breakdown =
    `${data.student_count} élève(s) actif(s) · ${data.settled_count} soldé(s) · `
    + `${data.partial_count} paiement(s) partiel(s) · ${data.unpaid_count} impayé(s) · `
    + `${data.cancelled_payment_count} paiement(s) annulé(s)`;
  doc.text(doc.splitTextToSize(breakdown, CONTENT_W) as string[], MARGIN, y);
  y += 8;

  // ── Grille tarifaire ────────────────────────────────────────
  y = heading(doc, 'Grille tarifaire en vigueur', y);
  if (data.fees.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('Aucun frais défini pour cette année scolaire.', MARGIN, y);
    y += 8;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Libellé', 'Type', 'Portée', 'Échéance', 'Montant']],
      body: data.fees.map(f => [
        f.name,
        labelOf(feeTypeLabels, f.fee_type),
        f.applies_to === 'CLASS' ? (f.class_name || 'Classe') : f.applies_to === 'LEVEL' ? (f.class_name || 'Niveau') : 'Tous les élèves',
        formatDate(f.due_date),
        money(f.amount),
      ]),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, lineColor: LINE, lineWidth: 0.2, textColor: INK },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        3: { cellWidth: 24 },
        4: { cellWidth: 28, halign: 'right' },
      },
      didDrawPage: () => { if (doc.getNumberOfPages() > 1) drawHeader(); },
    });
    y = t.lastAutoTable.finalY + 7;
  }

  // ── Recouvrement par classe ─────────────────────────────────
  y = ensureSpace(doc, y, 60);
  y = heading(doc, 'Recouvrement par classe', y);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Classe', 'Élèves', 'Dû', 'Encaissé', 'Reliquat', 'Taux']],
    body: data.by_class.map(c => [
      c.class_name,
      String(c.student_count),
      money(c.total_due),
      money(c.total_paid),
      money(Math.max(0, c.remaining_balance)),
      `${(c.total_due > 0 ? (c.total_paid / c.total_due) * 100 : 100).toFixed(1)} %`,
    ]),
    foot: [[
      'TOTAL',
      String(data.by_class.reduce((n, c) => n + c.student_count, 0)),
      money(data.total_due),
      money(data.total_paid),
      money(Math.max(0, data.remaining_balance)),
      `${data.recovery_rate.toFixed(1)} %`,
    ]],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, lineColor: LINE, lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      1: { cellWidth: 16, halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right', textColor: [5, 150, 105] },
      4: { halign: 'right', textColor: [220, 38, 38] },
      5: { cellWidth: 20, halign: 'right' },
    },
    didDrawPage: () => { if (doc.getNumberOfPages() > 1) drawHeader(); },
  });
  y = t.lastAutoTable.finalY + 7;

  // ── Modes d'encaissement ────────────────────────────────────
  y = ensureSpace(doc, y, 50);
  y = heading(doc, "Modes d'encaissement", y);
  if (data.by_method.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('Aucun encaissement enregistré sur la période.', MARGIN, y);
    y += 8;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Mode', 'Nombre', 'Montant', 'Part']],
      body: data.by_method.map(m => [
        labelOf(methodLabels, m.method),
        String(m.payment_count),
        money(m.amount),
        `${(data.total_paid > 0 ? (m.amount / data.total_paid) * 100 : 0).toFixed(1)} %`,
      ]),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, lineColor: LINE, lineWidth: 0.2, textColor: INK },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { cellWidth: 20, halign: 'center' },
        2: { halign: 'right' },
        3: { cellWidth: 20, halign: 'right' },
      },
      didDrawPage: () => { if (doc.getNumberOfPages() > 1) drawHeader(); },
    });
    y = t.lastAutoTable.finalY + 7;
  }

  // ── Impayés ─────────────────────────────────────────────────
  y = ensureSpace(doc, y, 60);
  y = heading(doc, 'Élèves avec reliquat', y);
  if (data.debtors.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(5, 150, 105);
    doc.text('Aucun impayé : tous les élèves sont à jour.', MARGIN, y);
  } else {
    if (data.debtors.length >= 100) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text('Liste limitée aux 100 reliquats les plus anciens.', MARGIN, y);
      y += 6;
    }
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Élève', 'Classe', 'Dû', 'Payé', 'Reliquat', 'Situation']],
      body: data.debtors.map(d => [
        `${d.last_name} ${d.first_name}`,
        d.class_name,
        money(d.total_due),
        money(d.total_paid),
        money(d.remaining_balance),
        d.status === 'PARTIEL' ? 'Partiel' : 'Impayé',
      ]),
      foot: [[
        'SOUS-TOTAL',
        '',
        money(data.debtors.reduce((n, d) => n + d.total_due, 0)),
        money(data.debtors.reduce((n, d) => n + d.total_paid, 0)),
        money(data.debtors.reduce((n, d) => n + d.remaining_balance, 0)),
        `${data.debtors.length} élève(s)`,
      ]],
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, lineColor: LINE, lineWidth: 0.2, textColor: INK },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 48 },
        1: { cellWidth: 22 },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] },
        5: { cellWidth: 22, halign: 'center' },
      },
      didParseCell: hook => {
        if (hook.section === 'body' && hook.column.index === 5) {
          const partial = hook.cell.raw === 'Partiel';
          hook.cell.styles.textColor = partial ? [217, 119, 6] : [220, 38, 38];
          hook.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: () => { if (doc.getNumberOfPages() > 1) drawHeader(); },
    });
  }

  // ── Numérotation ────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, 278, PAGE_W - MARGIN, 278);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(
      [school.short_name, school.registration_number ? `Immat. ${school.registration_number}` : '']
        .filter(Boolean).join(' · ') || school.name || '',
      MARGIN, 283,
    );
    doc.text(`Page ${p} / ${pages}`, PAGE_W - MARGIN, 283, { align: 'right' });
  }

  return doc;
}

export function saveFinanceReportPdf(opts: BuildFinanceReportOptions): void {
  const doc = buildFinanceReportPdf(opts);
  const safe = opts.year.replace(/[^a-zA-Z0-9_-]/g, '-');
  doc.save(`Rapport-financier-${safe}.pdf`);
}