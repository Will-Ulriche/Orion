import { jsPDF, GState } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReceiptSchoolInfo {
  name: string;
  short_name: string;
  ministry_name: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  registration_number: string;
  logo_url: string;
  stamp_url: string;
  signature_url: string;
  head_title: string;
  head_name: string;
  slogan: string;
  currency: string;
}

export interface ReceiptPayment {
  receipt_number: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  status: string;
  cancel_reason: string | null;
  fee_name: string | null;
  fee_type_label: string;
  fee_due_date: string | null;
  fee_expected: number | null;
}

export interface ReceiptStudent {
  last_name: string;
  first_name: string;
  class_name: string;
  matricule: string | null;
}

export interface ReceiptTotals {
  total_due: number;
  total_paid: number;
  remaining_balance: number;
  status: string;
}

const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [203, 213, 225];
const BRAND: [number, number, number] = [14, 116, 144];
const BRAND_LIGHT: [number, number, number] = [36, 200, 219];

const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
const SCALES = [
  { one: 'million', many: 'millions' },
  { one: 'milliard', many: 'milliards' },
  { one: 'billion', many: 'billions' },
];

function under100(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const r = n % 10;
  if (t === 7 || t === 9) {
    if (r === 0) return `${t === 7 ? 'soixante' : 'quatre-vingt'}-dix`;
    if (r === 1) return `${t === 7 ? 'soixante et onze' : 'quatre-vingt-onze'}`;
    return `${t === 7 ? 'soixante' : 'quatre-vingt'}-${UNITS[r + 10]}`;
  }
  if (r === 0) return t === 8 ? 'quatre-vingts' : TENS[t];
  if (r === 1) return `${TENS[t]} et un`;
  return `${TENS[t]}-${UNITS[r]}`;
}

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h > 0) {
    if (h === 1) parts.push('cent');
    else parts.push(`${UNITS[h]} cent${rest === 0 ? 's' : ''}`);
  }
  if (rest > 0) parts.push(under100(rest));
  return parts.join(' ');
}

function integerToFrench(n: number): string {
  if (n === 0) return 'zéro';
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    // groups[0] est le groupe des unités : l'échelle suit donc l'index du tableau.
    const scaleIdx = i;
    const words = under1000(g);
    if (scaleIdx === 0) {
      parts.push(words);
    } else if (scaleIdx === 1) {
      parts.push(g === 1 ? 'mille' : `${words} mille`);
    } else {
      const s = SCALES[scaleIdx - 2];
      if (!s) continue;
      parts.push(`${words} ${g === 1 ? s.one : s.many}`);
    }
  }
  return parts.join(' ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function amountToFrenchWords(cents: number, currency: string): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const majorWords = capitalize(integerToFrench(major));
  const minorWords = integerToFrench(minor);
  const unit = currency === 'XOF' ? 'F CFA' : currency;
  let out = `${majorWords} ${unit}`;
  if (minor > 0) out += ` et ${minorWords} centimes`;
  return negative ? `moins ${out}` : out;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

export function formatMoney(cents: number, currency: string): string {
  const value = (cents / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: currency === 'XOF' ? 0 : 2,
  });
  return `${value} ${currency}`;
}

function stamp(doc: jsPDF, text: string, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 1.5, 1.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND);
  doc.text(text, x + w / 2, y + h / 2 + 1.1, { align: 'center' });
}

function dataUriFormat(uri: string): 'JPEG' | 'PNG' | 'WEBP' | undefined {
  if (uri.startsWith('data:image/jpeg') || uri.startsWith('data:image/jpg')) return 'JPEG';
  if (uri.startsWith('data:image/png')) return 'PNG';
  if (uri.startsWith('data:image/webp')) return 'WEBP';
  return undefined;
}

function addImageSafe(
  doc: jsPDF, uri: string, x: number, y: number, w: number, h: number, opacity = 1,
): boolean {
  try {
    if (opacity < 1) doc.setGState(new GState({ opacity }));
    doc.addImage(uri, dataUriFormat(uri) as never, x, y, w, h, undefined, 'FAST');
    if (opacity < 1) doc.setGState(new GState({ opacity: 1 }));
    return true;
  } catch {
    if (opacity < 1) {
      try { doc.setGState(new GState({ opacity: 1 })); } catch { /* ignoré */ }
    }
    return false;
  }
}

function labelValue(
  doc: jsPDF, label: string, value: string,
  x: number, y: number, w: number,
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(value || '—', w) as string[];
  doc.text(lines.slice(0, 2), x, y + 4.4);
  return y + 4.4 + Math.min(lines.length, 2) * 4.4;
}

export interface BuildReceiptOptions {
  school: ReceiptSchoolInfo;
  student: ReceiptStudent;
  payment: ReceiptPayment;
  totals: ReceiptTotals;
  academicYearName: string;
  printedBy: string;
}

export function buildReceiptPdf(opts: BuildReceiptOptions): jsPDF {
  const { school, student, payment, totals, academicYearName, printedBy } = opts;
  const currency = school.currency || 'XOF';
  const cancelled = payment.status === 'CANCELLED';

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({
    title: `Reçu ${payment.receipt_number}`,
    subject: `Paiement de ${student.last_name} ${student.first_name}`,
  });

  // ── Bandeau d'en-tête ────────────────────────────────────────
  const headerH = 30;
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, headerH, 'F');
  doc.setFillColor(...BRAND_LIGHT);
  doc.rect(0, headerH - 1.2, PAGE_W, 1.2, 'F');

  let textLeft = MARGIN;
  if (school.logo_url && addImageSafe(doc, school.logo_url, MARGIN, 5.5, 19, 19)) {
    textLeft = MARGIN + 24;
  }

  const headW = 118;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(school.name || 'Établissement', headW) as string[], textLeft, 10.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(219, 234, 254);
  const sub: string[] = [];
  if (school.ministry_name) {
    sub.push(...school.ministry_name.split('\n'));
  }
  const loc = [school.address, school.city, school.country].filter(Boolean).join(', ');
  if (loc) sub.push(loc);
  if (school.phone || school.email) sub.push([school.phone, school.email].filter(Boolean).join(' · '));
  doc.text(sub, textLeft, 16.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('REÇU DE PAIEMENT', PAGE_W - MARGIN, 10, { align: 'right' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.text(payment.receipt_number, PAGE_W - MARGIN, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(219, 234, 254);
  doc.text(`Année scolaire ${academicYearName}`, PAGE_W - MARGIN, 21, { align: 'right' });

  let y = headerH + 10;

  // ── Bandeau d'annulation ─────────────────────────────────────
  if (cancelled) {
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.4);
    doc.roundedRect(MARGIN, y, CONTENT_W, 12, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(185, 28, 28);
    doc.text('REÇU ANNULÉ', MARGIN + 5, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      doc.splitTextToSize(`Motif : ${payment.cancel_reason || 'non précisé'}`, CONTENT_W - 10) as string[],
      MARGIN + 5, y + 9,
    );
    y += 18;
  }

  // ── Bloc identité élève / paiement ────────────────────────────
  const colW = (CONTENT_W - 8) / 2;
  labelValue(doc, 'Élève', `${student.last_name} ${student.first_name}`, MARGIN, y, colW);
  const rightX = MARGIN + colW + 8;
  const rightValues: [string, string][] = [
    ['Date du paiement', formatDate(payment.payment_date)],
    ['Mode de paiement', payment.payment_method],
  ];
  let ry = y;
  for (const [label, value] of rightValues) {
    ry = labelValue(doc, label, value, rightX, ry, colW);
    ry += 4.6;
  }

  y = Math.max(y + 13, ry) + 2;

  const secondRow: [string, string, number][] = [
    ['Classe', student.class_name || '—', MARGIN],
    ['Matricule', student.matricule || '—', MARGIN + colW / 2 + 4],
    ['Référence', payment.reference || '—', rightX],
  ];
  for (const [label, value, x] of secondRow) {
    labelValue(doc, label, value, x, y, colW / 2);
  }
  y += 13;

  // ── Détail du règlement ──────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Désignation', 'Type', 'Échéance', 'Attendu', 'Payé']],
    body: [[
      payment.fee_name || 'Acompte / paiement libre',
      payment.fee_type_label,
      formatDate(payment.fee_due_date),
      payment.fee_expected != null ? formatMoney(payment.fee_expected, currency) : '—',
      formatMoney(payment.amount, currency),
    ]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.4,
      lineColor: LINE,
      lineWidth: 0.2,
      textColor: INK,
      overflow: 'linebreak',
    },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    // La somme des largeurs doit égaler CONTENT_W, sinon autoTable laisse
    // la différence non allouée et tronque la table.
    columnStyles: {
      0: { cellWidth: 70, fontStyle: 'bold' },
      1: { cellWidth: 30 },
      2: { cellWidth: 26 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: BRAND },
    },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;

  // ── Montant en lettres ───────────────────────────────────────
  const wordsLines = doc.splitTextToSize(
    `${amountToFrenchWords(payment.amount, currency)}.`, CONTENT_W - 8,
  ) as string[];
  const wordsH = Math.max(14, 9 + wordsLines.length * 4.4);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_W, wordsH, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('MONTANT EN LETTRES', MARGIN + 4, y + 5);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(wordsLines, MARGIN + 4, y + 10.5);
  y += wordsH + 6;

  // ── Totaux ───────────────────────────────────────────────────
  const boxW = 84;
  const boxX = PAGE_W - MARGIN - boxW;
  const rows: [string, string][] = [
    ['Montant du présent reçu', formatMoney(payment.amount, currency)],
    ['Total dû pour l\'année', formatMoney(totals.total_due, currency)],
    ['Total versé à ce jour', formatMoney(totals.total_paid, currency)],
    ['Reliquat restant', formatMoney(totals.remaining_balance, currency)],
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text('SITUATION DE L\'ÉLÈVE', MARGIN, y + 4);

  const statusText = totals.status === 'SOLDE' ? 'COMPTE À JOUR'
    : totals.status === 'PARTIEL' ? 'PAIEMENT PARTIEL' : 'IMPAYÉ';
  stamp(doc, statusText, MARGIN, y + 7, 46, 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize('Situation arrêtée à la date d\'édition du présent reçu.', 52) as string[], MARGIN, y + 21);

  doc.setDrawColor(...LINE);
  doc.setFillColor(248, 250, 252);
  doc.setLineWidth(0.2);
  doc.roundedRect(boxX, y, boxW, 10 + rows.length * 7.5, 1.5, 1.5, 'FD');

  let ty = y + 8;
  rows.forEach(([label, value], i) => {
    const isMain = i === 0;
    doc.setFont('helvetica', isMain ? 'bold' : 'normal');
    doc.setFontSize(isMain ? 9.5 : 8.5);
    doc.setTextColor(...(isMain ? BRAND : MUTED));
    doc.text(label, boxX + 4, ty);
    doc.setTextColor(...(isMain ? BRAND : INK));
    doc.setFont('helvetica', 'bold');
    doc.text(value, boxX + boxW - 4, ty, { align: 'right' });
    ty += 7.5;
  });

  y += 10 + rows.length * 7.5 + 12;

  // ── Observations ─────────────────────────────────────────────
  // Borné à 4 lignes : au-delà, le bloc empiéterait sur la zone des signatures.
  if (payment.notes) {
    const allLines = doc.splitTextToSize(payment.notes, CONTENT_W) as string[];
    const notesLines = allLines.length > 4
      ? [...allLines.slice(0, 4).slice(0, -1), `${allLines[3].slice(0, -1)}…`]
      : allLines;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('OBSERVATIONS', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(notesLines, MARGIN, y + 4.5);
    y += 5.5 + notesLines.length * 4.2;
  }

  // ── Signatures ───────────────────────────────────────────────
  const sigY = Math.min(Math.max(y, 214), 236);
  const sigW = (CONTENT_W - 12) / 3;
  const sigLabels = ["L'élève / le tuteur", 'Le Comptable', school.head_title || 'Le Directeur'];
  sigLabels.forEach((label, i) => {
    const x = MARGIN + i * (sigW + 6);
    if (i === 2 && school.signature_url) {
      addImageSafe(doc, school.signature_url, x + sigW / 2 - 17, sigY - 1, 34, 13);
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(x, sigY + 14, x + sigW, sigY + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const caption = i === 2 && school.head_name ? `${label}\n${school.head_name}` : label;
    doc.text(doc.splitTextToSize(caption, sigW) as string[], x + sigW / 2, sigY + 18, { align: 'center' });
  });

  // ── Cachet officiel ──────────────────────────────────────────
  if (school.stamp_url) {
    addImageSafe(doc, school.stamp_url, PAGE_W - MARGIN - 30, sigY - 3, 30, 30, 0.35);
  }

  // ── Slogan ───────────────────────────────────────────────────
  if (school.slogan) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND);
    doc.text(
      doc.splitTextToSize(school.slogan, 90) as string[],
      MARGIN, Math.min(sigY + 22, 268),
    );
  }

  // ── Pied de page ─────────────────────────────────────────────
  const footY = 282;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, footY - 5, PAGE_W - MARGIN, footY - 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const idLine = [
    school.short_name,
    school.registration_number ? `Immatriculation : ${school.registration_number}` : '',
  ].filter(Boolean).join(' · ');
  doc.text(idLine || school.name || '', MARGIN, footY);
  doc.text(`Édité le ${formatDate(new Date().toISOString().slice(0, 10))} par ${printedBy}`, PAGE_W - MARGIN, footY, { align: 'right' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.text(
    'Ce reçu atteste du règlement effectué. Il doit être conservé par l\'élève ou son tuteur.',
    PAGE_W / 2, footY + 4, { align: 'center' },
  );

  return doc;
}

// ── Nom de fichier ────────────────────────────────────────────
// Windows interdit < > : " / \ | ? * et les caractères de contrôle ; "/" est en
// plus un séparateur de chemin, d'où le format jj_mm_aaaa.
const ILLEGAL_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

function sanitizeFileName(value: string, maxLength = 60): string {
  return value
    .replace(ILLEGAL_FILE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Un nom ne peut pas se terminer par un point ou une espace sous Windows.
    .replace(/[. ]+$/, '')
    .slice(0, maxLength)
    .trim();
}

export function buildReceiptFileName(opts: BuildReceiptOptions): string {
  const { student, payment } = opts;
  const name = sanitizeFileName(`${student.last_name} ${student.first_name}`.trim());
  const [y, m, d] = payment.payment_date.split('-');
  const date = y && m && d ? `${d}_${m}_${y}` : 'date_inconnue';
  const parts = [
    'RECU',
    sanitizeFileName(payment.receipt_number, 30),
    name || 'eleve',
    date,
  ].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}

export function saveReceiptPdf(opts: BuildReceiptOptions): void {
  const doc = buildReceiptPdf(opts);
  doc.save(buildReceiptFileName(opts));
}
