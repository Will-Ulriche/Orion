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

const PAGE_W = 210;   // A5 paysage : largeur 210 mm
const PAGE_H = 148;   // A5 paysage : hauteur 148 mm
const MARGIN = 10;
const CONTENT_W = PAGE_W - MARGIN * 2; // 190 mm

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

  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  doc.setProperties({
    title: `Reçu ${payment.receipt_number}`,
    subject: `Paiement de ${student.last_name} ${student.first_name}`,
  });

  // ── Bandeau d'en-tête ────────────────────────────────────────
  const headerH = 18;
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, headerH, 'F');
  doc.setFillColor(...BRAND_LIGHT);
  doc.rect(0, headerH - 1.2, PAGE_W, 1.2, 'F');

  let textLeft = MARGIN;
  if (school.logo_url && addImageSafe(doc, school.logo_url, MARGIN, 2, 14, 14)) {
    textLeft = MARGIN + 19;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(school.name || 'Établissement', PAGE_W - textLeft - MARGIN - 50) as string[], textLeft, 6.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(219, 234, 254);
  const sub: string[] = [];
  if (school.ministry_name) sub.push(...school.ministry_name.split('\n'));
  const loc = [school.address, school.city, school.country].filter(Boolean).join(', ');
  if (loc) sub.push(loc);
  if (school.phone || school.email) sub.push([school.phone, school.email].filter(Boolean).join(' · '));
  doc.text(sub, textLeft, 10.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('REÇU DE PAIEMENT', PAGE_W - MARGIN, 6.5, { align: 'right' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.text(payment.receipt_number, PAGE_W - MARGIN, 10.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(219, 234, 254);
  doc.text(`Année scolaire ${academicYearName}`, PAGE_W - MARGIN, 14.5, { align: 'right' });

  let y = headerH + 4;

  // ── Bandeau d'annulation ─────────────────────────────────────
  if (cancelled) {
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.4);
    doc.roundedRect(MARGIN, y, CONTENT_W, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(185, 28, 28);
    doc.text('REÇU ANNULÉ', MARGIN + 4, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(
      doc.splitTextToSize(`Motif : ${payment.cancel_reason || 'non précisé'}`, CONTENT_W - 8) as string[],
      MARGIN + 4, y + 7.5,
    );
    y += 14;
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
    ry += 4;
  }

  y = Math.max(y + 11, ry) + 2;

  const secondRow: [string, string, number][] = [
    ['Classe', student.class_name || '—', MARGIN],
    ['Matricule', student.matricule || '—', MARGIN + colW / 2 + 4],
    ['Référence', payment.reference || '—', rightX],
  ];
  for (const [label, value, x] of secondRow) {
    labelValue(doc, label, value, x, y, colW / 2);
  }
  y += 11;

  // ── Détail du règlement ──────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Désignation', 'Date', 'Mode', 'Montant', 'Référence']],
    body: [[
      payment.fee_name || 'Acompte / paiement libre',
      formatDate(payment.payment_date),
      payment.payment_method,
      formatMoney(payment.amount, currency),
      payment.reference || '—',
    ]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.6,
      lineColor: LINE,
      lineWidth: 0.2,
      textColor: INK,
      overflow: 'linebreak',
    },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    // La somme des largeurs doit égaler CONTENT_W (190 mm en A5 paysage).
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 30 },
      2: { cellWidth: 32 },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 38, halign: 'right', fontStyle: 'bold', textColor: BRAND },
    },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // ── Montant en lettres ───────────────────────────────────────
  const wordsLines = doc.splitTextToSize(
    `${amountToFrenchWords(payment.amount, currency)}.`, CONTENT_W - 8,
  ) as string[];
  const wordsH = Math.max(12, 8 + wordsLines.length * 4);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_W, wordsH, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('MONTANT EN LETTRES', MARGIN + 4, y + 4);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(wordsLines, MARGIN + 4, y + 8);
  y += wordsH + 5;

  // ── Situation + totaux (côte à côte) ─────────────────────────
  const boxW = 80;
  const boxX = PAGE_W - MARGIN - boxW;
  const rows: [string, string][] = [
    ['Montant du présent reçu', formatMoney(payment.amount, currency)],
    ['Total dû pour l\'année', formatMoney(totals.total_due, currency)],
    ['Total versé à ce jour', formatMoney(totals.total_paid, currency)],
    ['Reliquat restant', formatMoney(totals.remaining_balance, currency)],
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...INK);
  doc.text('SITUATION DE L\'ÉLÈVE', MARGIN, y + 4);

  const statusText = totals.status === 'SOLDE' ? 'COMPTE À JOUR'
    : totals.status === 'PARTIEL' ? 'PAIEMENT PARTIEL' : 'IMPAYÉ';
  stamp(doc, statusText, MARGIN, y + 6.5, 42, 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize('Situation arrêtée à la date d\'édition du reçu.', 48) as string[], MARGIN, y + 16);

  doc.setDrawColor(...LINE);
  doc.setFillColor(248, 250, 252);
  doc.setLineWidth(0.2);
  doc.roundedRect(boxX, y, boxW, 8 + rows.length * 6.5, 1.5, 1.5, 'FD');

  let ty = y + 6;
  rows.forEach(([label, value], i) => {
    const isMain = i === 0;
    doc.setFont('helvetica', isMain ? 'bold' : 'normal');
    doc.setFontSize(isMain ? 8 : 7);
    doc.setTextColor(...(isMain ? BRAND : MUTED));
    doc.text(label, boxX + 4, ty);
    doc.setTextColor(...(isMain ? BRAND : INK));
    doc.setFont('helvetica', 'bold');
    doc.text(value, boxX + boxW - 4, ty, { align: 'right' });
    ty += 6.5;
  });

  y += 8 + rows.length * 6.5 + 8;

  // ── Observations (borné à 3 lignes) ──────────────────────────
  if (payment.notes) {
    const allLines = doc.splitTextToSize(payment.notes, CONTENT_W) as string[];
    const notesLines = allLines.length > 3
      ? [...allLines.slice(0, 3).slice(0, -1), `${allLines[2].slice(0, -1)}…`]
      : allLines;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('OBSERVATIONS', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(notesLines, MARGIN, y + 4);
    y += 5 + notesLines.length * 3.8;
  }

  // ── Signatures ───────────────────────────────────────────────
  // Forcée dans la bande basse de la page A5 paysage pour rester visible.
  const sigY = Math.min(Math.max(y, PAGE_H - 42), PAGE_H - 30);
  const sigW = (CONTENT_W - 12) / 3;
  const sigLabels = ["L'élève / le tuteur", 'Le Comptable', school.head_title || 'Le Directeur'];
  sigLabels.forEach((label, i) => {
    const x = MARGIN + i * (sigW + 6);
    if (i === 2 && school.signature_url) {
      addImageSafe(doc, school.signature_url, x + sigW / 2 - 14, sigY - 1, 26, 10);
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(x, sigY + 11, x + sigW, sigY + 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const caption = i === 2 && school.head_name ? `${label}\n${school.head_name}` : label;
    doc.text(doc.splitTextToSize(caption, sigW) as string[], x + sigW / 2, sigY + 14.5, { align: 'center' });
  });

  // ── Cachet officiel ──────────────────────────────────────────
  if (school.stamp_url) {
    addImageSafe(doc, school.stamp_url, PAGE_W - MARGIN - 26, sigY - 2, 24, 24, 0.35);
  }

  // ── Pied de page ─────────────────────────────────────────────
  const footY = PAGE_H - 5;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, footY - 4, PAGE_W - MARGIN, footY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  const idLine = [
    school.short_name,
    school.registration_number ? `Immatriculation : ${school.registration_number}` : '',
  ].filter(Boolean).join(' · ');
  doc.text(idLine || school.name || '', MARGIN, footY);
  doc.text(`Édité le ${formatDate(new Date().toISOString().slice(0, 10))} par ${printedBy}`, PAGE_W - MARGIN, footY, { align: 'right' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6);
  doc.text(
    'Ce reçu atteste du règlement effectué. À conserver par l\'élève ou son tuteur.',
    PAGE_W / 2, footY + 3.5, { align: 'center' },
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

function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Génère le reçu au format HTML A5 Paysage avec double volet :
 * - Volet gauche : Copie bureau (Office copy)
 * - Volet droite : Reçu de paiement (Client copy)
 * Avec ligne de découpe et ciseaux ✂, cases à cocher, montant en chiffres et en lettres.
 */
export function buildReceiptHtml(opts: BuildReceiptOptions): string {
  const { school, student, payment, academicYearName } = opts;
  const currency = school.currency || 'GNF';
  const amountFormatted = formatMoney(payment.amount, currency);
  const amountWords = amountToFrenchWords(payment.amount, currency);
  const dateFormatted = formatDate(payment.payment_date);

  const studentFullName = `${student.last_name || ''} ${student.first_name || ''}`.trim() +
    (student.matricule ? ` · ${student.matricule}` : '');
  const studentAddress = (student as any).address || school.address || school.city || school.country || '—';
  const className = student.class_name || 'Sans classe';

  let feeTitle = payment.fee_name || payment.fee_type_label || 'Frais de scolarité';
  if (payment.reference) {
    feeTitle += ` · Réf: ${payment.reference}`;
  }
  if (academicYearName && academicYearName !== '—') {
    feeTitle += ` (${academicYearName})`;
  }

  const receiptNumber = payment.receipt_number || 'N/A';

  const method = (payment.payment_method || '').toUpperCase();
  const isEspeces = method.includes('ESPECE');
  const isCheque = method.includes('CHEQUE');
  const isMobile = method.includes('MOBILE');
  const isVirement = method.includes('VIREMENT') || method.includes('CARTE') || (!isEspeces && !isCheque && !isMobile);

  const schoolName = escapeHtml(school.name || 'ÉTABLISSEMENT SCOLAIRE');
  const schoolAddress = escapeHtml(school.address || school.city || '');
  const schoolPhone = escapeHtml(school.phone || '');
  const schoolEmail = escapeHtml(school.email || '');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reçu ${escapeHtml(receiptNumber)} - ${escapeHtml(studentFullName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --green:#2bb673;
    --green-light:#e6f8ee;
    --text:#333;
    --line:#aaa;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#e9ecee;padding:24px;
    font-family:'Poppins','Segoe UI',Arial,sans-serif;color:var(--text);
  }
  .receipt{
    position:relative;width:1200px;height:456px;background:#fff;flex:none;
    box-shadow:0 24px 30px -14px rgba(0,0,0,.25);
  }
  .divider{position:absolute;left:446px;top:0;bottom:0;border-left:1px dashed #999}
  .scissors{position:absolute;left:439px;bottom:6px;font-size:16px;background:#fff;line-height:1}

  .logo{display:flex;align-items:center;gap:6px;font-weight:700;color:#111}
  .logo svg{width:20px;height:20px}
  .pill{background:var(--green);color:#fff;border-radius:20px;padding:3px 16px;font-size:12.5px;font-weight:500;white-space:nowrap}
  .field{background:var(--green-light);border-radius:20px;height:26px;display:flex;align-items:center;padding:0 12px;font-size:12px;font-weight:600;color:#111}
  .receipt-title{font-weight:700;color:var(--green);letter-spacing:.3px}

  /* ---------- Office copy (gauche) ---------- */
  .office{position:absolute;left:0;top:0;width:446px;height:100%}
  .office .logo{position:absolute;left:34px;top:18px;font-size:15px;font-weight:700;color:#1e293b;max-width:220px;line-height:1.2}
  .office .info{position:absolute;left:34px;top:40px;font-size:9.5px;line-height:1.35;max-width:220px;color:#555}
  .office .receipt-title{position:absolute;right:20px;top:18px;font-size:22px}
  .office .rn{position:absolute;left:274px;top:62px;display:flex;align-items:center;width:150px}
  .office .dt{position:absolute;left:274px;top:90px;display:flex;align-items:center;width:150px}
  .office .rn .pill,.office .dt .pill{font-size:11px;padding:2px 12px;position:relative;z-index:1}
  .office .rn .field,.office .dt .field{flex:1;margin-left:-14px;height:22px;padding-left:18px;font-size:10.5px;font-weight:700;color:#111}
  .office .box{position:absolute;left:30px;top:130px;width:392px;height:288px}

  /* ---------- Client copy (droite) ---------- */
  .client{position:absolute;left:446px;top:0;right:0;height:100%}
  .client .receipt-title{position:absolute;left:34px;top:34px;font-size:22px}
  .client .rn{position:absolute;left:170px;top:38px;display:flex;align-items:center}
  .client .dt{position:absolute;left:455px;top:38px;display:flex;align-items:center}
  .client .rn .field{width:170px;margin-left:-14px;height:24px;padding-left:20px;font-size:11px;font-weight:700;color:#111}
  .client .dt .field{width:190px;margin-left:-14px;height:24px;padding-left:20px;font-size:11px;font-weight:700;color:#111}
  .client .rn .pill,.client .dt .pill{position:relative;z-index:1;font-size:11px;padding:3px 12px}
  .client .logo{position:absolute;left:0;right:0;top:108px;justify-content:center;font-size:19px;font-weight:700;letter-spacing:.3px;color:#1e293b;text-align:center}
  .client .logo svg{width:24px;height:24px}
  .client .box{position:absolute;left:30px;top:152px;width:704px;height:222px}
  .client .amount{position:absolute;left:500px;top:76px;width:176px;height:54px;border:2px solid var(--green);border-radius:8px;padding:3px 8px;display:flex;flex-direction:column;justify-content:center}
  .client .amount .lbl{display:block;font-size:10px;color:var(--green);font-weight:500;line-height:1.2}
  .client .amount .val{font-size:15px;font-weight:700;color:#222;height:26px;line-height:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .client .footer{position:absolute;left:34px;right:34px;top:412px;display:flex;justify-content:space-between;font-size:10px;color:#555}

  /* ---------- Cadres communs ---------- */
  .box{border:2px solid var(--green);border-radius:14px;padding:0 16px}
  .box .tag{position:absolute;top:-18px;left:50%;transform:translateX(-50%);background:var(--green);color:#fff;border-radius:20px;text-align:center;font-weight:500}
  .office .box .tag{font-size:16px;padding:3px 22px;top:-14px}
  .client .box .tag{font-size:17px;padding:4px 38px;top:-17px}
  .row{display:flex;align-items:flex-end;font-size:13px;color:#444}
  .row .lbl{font-weight:500;color:#333;white-space:nowrap;margin-right:6px}
  .row .dots{flex:1;border-bottom:1px dotted var(--line);margin-left:4px;min-height:16px;min-width:20px;padding:0 6px 1px 6px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .office .row{position:absolute;left:16px;right:16px;font-size:12.5px}
  .office .r1{top:44px}.office .r2{top:78px}.office .r3{top:112px}.office .r4{top:146px}.office .r5{top:180px}
  .client .row{position:absolute;left:14px;right:14px}
  .client .r1{top:46px}.client .r2{top:74px}.client .r3{top:102px}.client .r4{top:130px}
  .client .r3 .half{display:flex;align-items:flex-end;flex:1;min-width:0}
  .checks{display:flex;gap:10px;align-items:center;position:absolute}
  .checks label{display:flex;align-items:center;gap:4px;font-size:10px;color:#333}
  .checks i{display:inline-block;width:10px;height:10px;border:1px solid #666;border-radius:1px;cursor:pointer}
  .checks i.on::after{content:"✓";display:block;font-size:10px;line-height:9px;text-align:center;color:var(--green);font-style:normal;font-weight:700}
  .office .checks{left:14px;bottom:8px}
  .office .checks label{font-size:8px}
  .office .checks i{width:8px;height:8px}
  .client .checks{left:14px;top:158px}
  .sign{position:absolute;text-align:center;font-size:10.5px;border-top:1px solid #888;padding-top:2px;color:#333}
  .office .sign{right:16px;bottom:6px;width:98px;font-size:9px}
  .client .sign{right:30px;top:178px;width:132px}

  [contenteditable]:hover{outline:1px dashed rgba(43,182,115,.7);outline-offset:2px;cursor:text}
  [contenteditable]:focus{outline:2px solid var(--green);outline-offset:2px}
  @media print{
    body{display:block;min-height:0;background:none;padding:0;margin:0}
    .receipt{box-shadow:none;transform:scale(.65);transform-origin:0 0;margin-left:2mm}
    [contenteditable]:hover,[contenteditable]:focus{outline:none}
    @page{size:A5 landscape;margin:0}
  }
</style>
</head>
<body>

<div class="receipt">
  <div class="divider"></div>
  <div class="scissors">✂</div>

  <!-- ================= OFFICE COPY ================= -->
  <div class="office">
    <div class="logo">${schoolName}</div>
    <div class="info" contenteditable="true">Adresse : ${schoolAddress || '—'}<br>E-mail : ${schoolEmail || '—'}<br>Téléphone : ${schoolPhone || '—'}</div>
    <div class="receipt-title" contenteditable="true">REÇU</div>
    <div class="rn"><span class="pill" contenteditable="true">N° de reçu</span><div class="field" contenteditable="true">${escapeHtml(receiptNumber)}</div></div>
    <div class="dt"><span class="pill" contenteditable="true">Date</span><div class="field" contenteditable="true">${escapeHtml(dateFormatted)}</div></div>

    <div class="box">
      <span class="tag" contenteditable="true">Copie bureau</span>
      <div class="row r1"><span class="lbl" contenteditable="true">Nom</span><span class="dots" contenteditable="true">${escapeHtml(studentFullName)}</span></div>
      <div class="row r2"><span class="lbl" contenteditable="true">Adresse</span><span class="dots" contenteditable="true">${escapeHtml(studentAddress)}</span></div>
      <div class="row r3"><span class="lbl" contenteditable="true">Montant</span><span class="dots" contenteditable="true">${escapeHtml(amountFormatted)}</span></div>
      <div class="row r4"><span class="lbl" contenteditable="true">En lettres</span><span class="dots" contenteditable="true">${escapeHtml(amountWords)}</span></div>
      <div class="row r5"><span class="lbl" contenteditable="true">Au titre de</span><span class="dots" contenteditable="true">${escapeHtml(feeTitle)}</span></div>
      <div class="checks">
        <label><i class="${isEspeces ? 'on' : ''}"></i><span contenteditable="true">ESPÈCES</span></label>
        <label><i class="${isCheque ? 'on' : ''}"></i><span contenteditable="true">CHÈQUE</span></label>
        <label><i class="${isMobile ? 'on' : ''}"></i><span contenteditable="true">MOBILE MONEY</span></label>
        <label><i class="${isVirement ? 'on' : ''}"></i><span contenteditable="true">VIREMENT / CARTE</span></label>
      </div>
      <div class="sign" contenteditable="true">Signature autorisée</div>
    </div>
  </div>

  <!-- ================= CLIENT COPY ================= -->
  <div class="client">
    <div class="receipt-title" contenteditable="true">REÇU</div>
    <div class="rn"><span class="pill" contenteditable="true">N° de reçu</span><div class="field" contenteditable="true">${escapeHtml(receiptNumber)}</div></div>
    <div class="dt"><span class="pill" contenteditable="true">Date</span><div class="field" contenteditable="true">${escapeHtml(dateFormatted)}</div></div>

    <div class="logo"><span>${schoolName}</span></div>
    <div class="amount"><span class="lbl" contenteditable="true">Montant en chiffres</span><div class="val" contenteditable="true">${escapeHtml(amountFormatted)}</div></div>

    <div class="box">
      <span class="tag" contenteditable="true">Reçu de paiement</span>
      <div class="row r1"><span class="lbl" contenteditable="true">Nom</span><span class="dots" contenteditable="true">${escapeHtml(studentFullName)}</span></div>
      <div class="row r2"><span class="lbl" contenteditable="true">Adresse</span><span class="dots" contenteditable="true">${escapeHtml(studentAddress)}</span></div>
      <div class="row r3">
        <div class="half" style="flex:1.05"><span class="lbl" contenteditable="true">Classe</span><span class="dots" contenteditable="true">${escapeHtml(className)}</span></div>
        <div class="half" style="flex:.95;margin-left:8px"><span class="lbl" contenteditable="true">Au titre de</span><span class="dots" contenteditable="true">${escapeHtml(feeTitle)}</span></div>
      </div>
      <div class="row r4"><span class="lbl" contenteditable="true">En lettres</span><span class="dots" contenteditable="true">${escapeHtml(amountWords)}</span></div>
      <div class="checks">
        <label><i class="${isEspeces ? 'on' : ''}"></i><span contenteditable="true">ESPÈCES</span></label>
        <label><i class="${isCheque ? 'on' : ''}"></i><span contenteditable="true">CHÈQUE</span></label>
        <label><i class="${isMobile ? 'on' : ''}"></i><span contenteditable="true">MOBILE MONEY</span></label>
        <label><i class="${isVirement ? 'on' : ''}"></i><span contenteditable="true">VIREMENT / CARTE</span></label>
      </div>
      <div class="sign" contenteditable="true">Signature autorisée</div>
    </div>

    <div class="footer">
      <span contenteditable="true">Adresse : ${schoolAddress || '—'}</span>
      <span contenteditable="true">${schoolName}</span>
      <span contenteditable="true">Téléphone : ${schoolPhone || '—'}</span>
    </div>
  </div>

</div>

<script>
  // Cases à cocher : un clic coche / décoche
  document.querySelectorAll('.checks i').forEach(function(b){
    b.addEventListener('click',function(){b.classList.toggle('on')});
  });
</script>
</body>
</html>`;
}

export function saveReceiptPdf(opts: BuildReceiptOptions): void {
  const doc = buildReceiptPdf(opts);
  doc.save(buildReceiptFileName(opts));
}

