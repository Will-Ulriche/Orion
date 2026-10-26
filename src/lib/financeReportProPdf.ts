import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReceiptSchoolInfo } from './receiptPdf';
import { formatDate, formatMoney } from './receiptPdf';
import type { FinanceReportData } from './financeReportPdf';

export interface BuildFinanceReportProOptions {
  school: ReceiptSchoolInfo;
  year: string;
  data: FinanceReportData;
  methodLabels: { id: string; label: string }[];
  feeTypeLabels: { id: string; label: string }[];
  exportedBy: string;
}

type RGB = [number, number, number];

const NAVY: RGB = [12, 25, 51];
const GOLD: RGB = [194, 156, 74];
const INK: RGB = [24, 30, 42];
const MUTED: RGB = [107, 114, 128];
const FAINT: RGB = [148, 163, 184];
const LINE: RGB = [226, 230, 235];
const TRACK: RGB = [232, 235, 240];
const SURFACE: RGB = [248, 249, 251];
const ZEBRA: RGB = [251, 252, 253];
const EMERALD: RGB = [5, 150, 105];
const AMBER: RGB = [217, 119, 6];
const AMBER_SOFT: RGB = [254, 243, 199];
const RED: RGB = [220, 38, 38];
const RED_SOFT: RGB = [254, 226, 226];
const WHITE: RGB = [255, 255, 255];

const PAGE_W = 210;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_BOTTOM = 271;
const COVER_BAND_H = 36;
const FOOTER_LINE_Y = 277;
const TABLE_MARGIN = { top: 26, bottom: 24, left: MARGIN, right: MARGIN };

type AutoTableDoc = jsPDF & { lastAutoTable: { finalY: number } };

function fitText(doc: jsPDF, text: string, maxWidth: number, start: number, min: number): number {
  let size = start;
  doc.setFontSize(size);
  while (size > min && doc.getTextWidth(text) > maxWidth) {
    size = Math.max(min, size - 0.25);
    doc.setFontSize(size);
  }
  return size;
}

function pct(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} %`;
}

function addLogo(doc: jsPDF, uri: string, x: number, y: number, w: number, h: number): boolean {
  if (!uri || !uri.startsWith('data:image/')) return false;
  try {
    const format = uri.startsWith('data:image/jpeg') || uri.startsWith('data:image/jpg')
      ? 'JPEG'
      : uri.startsWith('data:image/png')
        ? 'PNG'
        : uri.startsWith('data:image/webp')
          ? 'WEBP'
          : undefined;
    if (!format) return false;
    let iw = w;
    let ih = h;
    try {
      const props = doc.getImageProperties(uri);
      if (props?.width && props?.height) {
        const ratio = props.width / props.height;
        if (ratio >= 1) { iw = w; ih = w / ratio; } else { ih = h; iw = h * ratio; }
      }
    } catch {
      iw = w;
      ih = h;
    }
    doc.addImage(uri, format as never, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, 'FAST');
    return true;
  } catch {
    return false;
  }
}

function buildObservations(data: FinanceReportData, money: (c: number) => string, currency: string, date: string): string[] {
  const lines: string[] = [];
  const rate = data.recovery_rate;

  if (rate >= 90) {
    lines.push(`La campagne de recouvrement est très satisfaisante : ${pct(rate)} des montants attendus ont déjà été encaissés.`);
  } else if (rate >= 70) {
    lines.push(`La campagne est globalement maîtrisée avec un taux de ${pct(rate)}, mais un solde de ${money(Math.max(0, data.total_due - data.total_paid))} reste à mobiliser.`);
  } else if (rate >= 40) {
    lines.push(`Le taux de recouvrement de ${pct(rate)} traduit un retard notable : des relances ciblées sont nécessaires pour préserver la trésorerie de l'établissement.`);
  } else {
    lines.push(`Le taux de recouvrement de ${pct(rate)} demeure insuffisant ; un plan de relance et un suivi hebdomadaire des impayés sont fortement recommandés.`);
  }

  if (data.remaining_balance > 0) {
    lines.push(`${data.unpaid_count + data.partial_count} élève(s) présentent un reliquat, pour un montant cumulé de ${money(Math.max(0, data.remaining_balance))}.`);
  }

  if (data.by_class.length > 1) {
    const ranked = [...data.by_class]
      .map(c => ({ name: c.class_name, rate: c.total_due > 0 ? (c.total_paid / c.total_due) * 100 : 100 }))
      .sort((a, b) => b.rate - a.rate);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.name !== worst.name) {
      lines.push(`Meilleur taux de recouvrement : ${best.name} (${pct(best.rate)}) ; le suivi doit être renforcé sur ${worst.name} (${pct(worst.rate)}).`);
    }
  }

  if (data.unpaid_count > 0) {
    lines.push(`${data.unpaid_count} élève(s) n'ont enregistré aucun paiement à ce jour : une relance prioritaire est à engager.`);
  }

  if (data.cancelled_payment_count > 0) {
    lines.push(`${data.cancelled_payment_count} paiement(s) ont été annulés sur l'exercice ; il convient d'en vérifier les motifs.`);
  }

  lines.push(`Les montants sont exprimés en ${currency} et issus des écritures validées au ${date}.`);
  return lines.slice(0, 5);
}

export function buildFinanceReportProPdf(opts: BuildFinanceReportProOptions): jsPDF {
  const { school, year, data, methodLabels, feeTypeLabels, exportedBy } = opts;
  const currency = school.currency || 'XOF';
  const money = (cents: number) => formatMoney(cents, currency);
  const labelOf = (list: { id: string; label: string }[], id: string) => list.find(x => x.id === id)?.label ?? id;
  const today = formatDate(new Date().toISOString().slice(0, 10));

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const table = doc as AutoTableDoc;
  doc.setProperties({
    title: `Rapport financier ${year}`,
    subject: `Situation annuelle du recouvrement — ${school.name || year}`,
    author: exportedBy,
    creator: 'Orion ERP',
  });

  const paintCompactHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_W, 18, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 18, PAGE_W, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    const name = school.name || 'Établissement';
    fitText(doc, name, 92, 9.2, 6.5);
    doc.text(name, MARGIN, 10.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...FAINT);
    doc.text(`RAPPORT FINANCIER · ${year}`, PAGE_W - MARGIN, 10.2, { align: 'right' });
  };

  const drawCoverHeader = (): number => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_W, COVER_BAND_H, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, COVER_BAND_H, PAGE_W, 1.4, 'F');

    const badgeX = MARGIN;
    const badgeY = 8;
    const badgeS = 20;
    doc.setFillColor(...WHITE);
    doc.roundedRect(badgeX, badgeY, badgeS, badgeS, 2, 2, 'F');
    if (!addLogo(doc, school.logo_url, badgeX + 2, badgeY + 2, badgeS - 4, badgeS - 4)) {
      const initial = (school.name || 'O').trim().charAt(0).toUpperCase() || 'O';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...NAVY);
      doc.text(initial, badgeX + badgeS / 2, badgeY + badgeS / 2 + 2.4, { align: 'center' });
    }

    const lx = MARGIN + 25;
    const lw = 74;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    fitText(doc, school.name || 'Établissement', lw, 11.5, 7);
    doc.text(school.name || 'Établissement', lx, 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...FAINT);
    const location = [school.address, school.city, school.country].filter(Boolean).join(', ');
    if (location) {
      const locationLines = (doc.splitTextToSize(location, lw) as string[]).slice(0, 2);
      doc.text(locationLines, lx, 19.8);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...GOLD);
    const ministryLinesPro = (school.ministry_name || '')
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean)
      .slice(0, 2);
    if (ministryLinesPro.length > 0) {
      ministryLinesPro.forEach((line: string, idx: number) => {
        doc.text(line.toUpperCase(), lx, 29 + idx * 3.2, { maxWidth: lw });
      });
    } else {
      doc.text('', lx, 29);
    }

    const rx = PAGE_W - MARGIN;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...WHITE);
    doc.text('RAPPORT FINANCIER', rx, 15, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...FAINT);
    doc.text('Situation annuelle du recouvrement', rx, 20.4, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(...GOLD);
    doc.text(`Année scolaire ${year}`, rx, 27.4, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Édité le ${today} par ${exportedBy.slice(0, 46)}`, MARGIN, 44);
    doc.text('Diffusion restreinte', rx, 44, { align: 'right' });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, 47, rx, 47);

    return 54;
  };

  let y = drawCoverHeader();

  const pageBreak = (needed: number) => {
    if (y + needed <= CONTENT_BOTTOM) return;
    doc.addPage();
    paintCompactHeader();
    y = TABLE_MARGIN.top;
  };

  const sectionTitle = (num: string, title: string, reserve: number) => {
    pageBreak(reserve + 8);
    doc.setFillColor(...NAVY);
    doc.roundedRect(MARGIN, y - 5.5, 8, 6, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    doc.text(num, MARGIN + 4, y - 1.65, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(...INK);
    const label = title.toUpperCase();
    doc.text(label, MARGIN + 11, y - 1.2);

    const ruleStart = MARGIN + 11 + doc.getTextWidth(label) + 4;
    if (ruleStart < PAGE_W - MARGIN - 8) {
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(ruleStart, y - 2.55, PAGE_W - MARGIN, y - 2.55);
    }
    y += 6;
  };

  const emptyNote = (text: string, color: RGB = MUTED) => {
    pageBreak(10);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.2);
    doc.setTextColor(...color);
    doc.text(text, MARGIN, y);
    y += 7;
  };

  const drawKpis = () => {
    pageBreak(28);
    const gap = 4;
    const w = (CONTENT_W - gap * 3) / 4;
    const h = 21;
    const cards: { label: string; value: string; caption: string; color: RGB }[] = [
      { label: 'TOTAL ATTENDU', value: money(data.total_due), caption: `${data.student_count} élève(s) inscrit(s)`, color: NAVY },
      { label: 'TOTAL ENCAISSÉ', value: money(data.total_paid), caption: `${data.settled_count} élève(s) soldé(s)`, color: EMERALD },
      { label: 'RESTE À RECOUVRER', value: money(Math.max(0, data.remaining_balance)), caption: `${data.unpaid_count} impayé(s) · ${data.partial_count} partiel(s)`, color: RED },
      { label: 'RECOUVREMENT', value: pct(data.recovery_rate), caption: 'Encaissé / attendu', color: GOLD },
    ];

    cards.forEach((card, i) => {
      const x = MARGIN + i * (w + gap);
      doc.setFillColor(...SURFACE);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, w, h, 1.6, 1.6, 'FD');

      doc.setFillColor(...card.color);
      doc.roundedRect(x, y, w, 6, 1.6, 1.6, 'F');
      doc.setFillColor(...SURFACE);
      doc.rect(x, y + 4.4, w, 1.8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...WHITE);
      fitText(doc, card.label, w - 6, 5.8, 4.2);
      doc.text(card.label, x + 3, y + 2.7, { maxWidth: w - 6 });

      doc.setTextColor(...card.color);
      fitText(doc, card.value, w - 6, 10.5, 5);
      doc.text(card.value, x + 3, y + 12.8, { maxWidth: w - 6 });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...MUTED);
      doc.text(card.caption, x + 3, y + 17.4, { maxWidth: w - 6 });
    });
    y += h + 6;
  };

  const drawRecoveryBar = () => {
    pageBreak(20);
    const rate = Math.max(0, Math.min(100, data.recovery_rate));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('TAUX DE RECOUVREMENT GLOBAL', MARGIN, y);
    doc.setFontSize(12);
    doc.setTextColor(...EMERALD);
    doc.text(pct(data.recovery_rate), PAGE_W - MARGIN, y, { align: 'right' });
    y += 3.8;

    const bh = 7;
    doc.setFillColor(...TRACK);
    doc.roundedRect(MARGIN, y, CONTENT_W, bh, bh / 2, bh / 2, 'F');
    const fw = CONTENT_W * rate / 100;
    if (fw > 0.6) {
      const radius = Math.min(bh / 2, fw / 2);
      doc.setFillColor(...EMERALD);
      doc.roundedRect(MARGIN, y, fw, bh, radius, radius, 'F');
    }
    doc.setDrawColor(...WHITE);
    doc.setLineWidth(0.35);
    [25, 50, 75].forEach(p => {
      const tx = MARGIN + (CONTENT_W * p) / 100;
      doc.line(tx, y + 1.4, tx, y + bh - 1.4);
    });
    y += bh + 7;
  };

  const drawSituationBar = () => {
    pageBreak(26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('RÉPARTITION DES ÉLÈVES PAR SITUATION', MARGIN, y);
    y += 3.8;

    const total = data.settled_count + data.partial_count + data.unpaid_count;
    if (total <= 0) {
      emptyNote('Aucun élève inscrit pour cette année scolaire.');
      return;
    }

    const segments = [
      { label: 'Soldés', count: data.settled_count, color: EMERALD },
      { label: 'Partiels', count: data.partial_count, color: AMBER },
      { label: 'Impayés', count: data.unpaid_count, color: RED },
    ].filter(s => s.count > 0);

    const bh = 8;
    const gapSeg = segments.length > 1 ? 1.2 : 0;
    const available = CONTENT_W - gapSeg * (segments.length - 1);
    let x = MARGIN;
    segments.forEach(s => {
      const sw = Math.max(0, (available * s.count) / total);
      doc.setFillColor(...s.color);
      doc.rect(x, y, sw, bh, 'F');
      if (sw > 16) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...WHITE);
        doc.text(`${Math.round((s.count / total) * 100)} %`, x + sw / 2, y + bh / 2 + 1, { align: 'center' });
      }
      x += sw + gapSeg;
    });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, CONTENT_W, bh);
    y += bh + 6;

    let lx = MARGIN;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    segments.forEach((s, i) => {
      doc.setFillColor(...s.color);
      doc.roundedRect(lx, y - 2.3, 2.6, 2.6, 0.6, 0.6, 'F');
      doc.setTextColor(...INK);
      const text = `${s.label} : ${s.count} (${pct((s.count / total) * 100)})`;
      doc.text(text, lx + 4, y);
      lx += 4 + doc.getTextWidth(text) + (i < segments.length - 1 ? 8 : 0);
    });
    y += 6;
  };

  const drawClassTable = () => {
    autoTable(doc, {
      startY: y,
      margin: TABLE_MARGIN,
      tableWidth: CONTENT_W,
      head: [['Classe', 'Élèves', 'Dû', 'Encaissé', 'Reliquat', 'Taux']],
      body: data.by_class.map(c => {
        const rate = c.total_due > 0 ? (c.total_paid / c.total_due) * 100 : 100;
        return [
          c.class_name,
          String(c.student_count),
          money(c.total_due),
          money(c.total_paid),
          money(Math.max(0, c.remaining_balance)),
          pct(rate),
        ];
      }),
      foot: [[
        'TOTAL',
        String(data.by_class.reduce((n, c) => n + c.student_count, 0)),
        money(data.total_due),
        money(data.total_paid),
        money(Math.max(0, data.remaining_balance)),
        pct(data.recovery_rate),
      ]],
      styles: {
        font: 'helvetica', fontSize: 7.6, cellPadding: 2.2, minCellHeight: 10,
        lineColor: LINE, lineWidth: 0.15, textColor: INK, valign: 'middle', overflow: 'linebreak',
      },
      headStyles: {
        fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.3,
        minCellHeight: 8, lineWidth: 0, overflow: 'linebreak',
      },
      footStyles: {
        fillColor: [236, 239, 243], textColor: NAVY, fontStyle: 'bold', fontSize: 7.6,
        lineColor: LINE, lineWidth: 0.15, overflow: 'linebreak',
      },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: {
        0: { cellWidth: 40, fontStyle: 'bold' },
        1: { cellWidth: 15, halign: 'center' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right', textColor: EMERALD },
        4: { cellWidth: 30, halign: 'right', textColor: RED },
        5: { cellWidth: 33, halign: 'right' },
      },
      didDrawCell: hook => {
        if (hook.section !== 'body' || hook.column.index !== 5) return;
        const value = Math.max(0, Math.min(100, parseFloat(String(hook.cell.raw).replace(',', '.')) || 0));
        const bx = hook.cell.x + 3;
        const bw = Math.max(4, hook.cell.width - 6);
        const by = hook.cell.y + hook.cell.height - 3.4;
        doc.setFillColor(...TRACK);
        doc.rect(bx, by, bw, 1.6, 'F');
        if (value > 0) {
          doc.setFillColor(...EMERALD);
          doc.rect(bx, by, Math.max(0.8, (bw * value) / 100), 1.6, 'F');
        }
      },
      didDrawPage: hook => { if (hook.pageNumber > 1) paintCompactHeader(); },
    });
    y = table.lastAutoTable.finalY + 7;
  };

  const drawMethodsTable = () => {
    autoTable(doc, {
      startY: y,
      margin: TABLE_MARGIN,
      tableWidth: CONTENT_W,
      head: [['Mode', 'Encaissements', 'Montant', 'Part']],
      body: data.by_method.map(m => [
        labelOf(methodLabels, m.method),
        String(m.payment_count),
        money(m.amount),
        pct(data.total_paid > 0 ? (m.amount / data.total_paid) * 100 : 0),
      ]),
      foot: [[
        'TOTAL',
        String(data.by_method.reduce((n, m) => n + m.payment_count, 0)),
        money(data.total_paid),
        pct(100),
      ]],
      styles: {
        font: 'helvetica', fontSize: 7.6, cellPadding: 2.2, minCellHeight: 10,
        lineColor: LINE, lineWidth: 0.15, textColor: INK, valign: 'middle', overflow: 'linebreak',
      },
      headStyles: {
        fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.3,
        minCellHeight: 8, lineWidth: 0, overflow: 'linebreak',
      },
      footStyles: {
        fillColor: [236, 239, 243], textColor: NAVY, fontStyle: 'bold', fontSize: 7.6,
        lineColor: LINE, lineWidth: 0.15, overflow: 'linebreak',
      },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: {
        0: { cellWidth: 62, fontStyle: 'bold' },
        1: { cellWidth: 24, halign: 'center' },
        2: { cellWidth: 48, halign: 'right' },
        3: { cellWidth: 44, halign: 'right' },
      },
      didDrawCell: hook => {
        if (hook.section !== 'body' || hook.column.index !== 3) return;
        const value = Math.max(0, Math.min(100, parseFloat(String(hook.cell.raw).replace(',', '.')) || 0));
        const bx = hook.cell.x + 3;
        const bw = Math.max(4, hook.cell.width - 6);
        const by = hook.cell.y + hook.cell.height - 3.4;
        doc.setFillColor(...TRACK);
        doc.rect(bx, by, bw, 1.6, 'F');
        if (value > 0) {
          doc.setFillColor(...NAVY);
          doc.rect(bx, by, Math.max(0.8, (bw * value) / 100), 1.6, 'F');
        }
      },
      didDrawPage: hook => { if (hook.pageNumber > 1) paintCompactHeader(); },
    });
    y = table.lastAutoTable.finalY + 7;
  };

  const drawFeesTable = () => {
    autoTable(doc, {
      startY: y,
      margin: TABLE_MARGIN,
      tableWidth: CONTENT_W,
      head: [['Libellé', 'Type', 'Portée', 'Échéance', 'Montant']],
      body: data.fees.map(f => [
        f.name,
        labelOf(feeTypeLabels, f.fee_type),
        f.applies_to === 'CLASS'
          ? (f.class_name || 'Classe')
          : f.applies_to === 'LEVEL'
            ? (f.class_name || 'Niveau')
            : 'Tous les élèves',
        formatDate(f.due_date),
        money(f.amount),
      ]),
      styles: {
        font: 'helvetica', fontSize: 7.6, cellPadding: 2.2,
        lineColor: LINE, lineWidth: 0.15, textColor: INK, valign: 'middle', overflow: 'linebreak',
      },
      headStyles: {
        fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.3,
        minCellHeight: 8, lineWidth: 0, overflow: 'linebreak',
      },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: {
        0: { cellWidth: 56, fontStyle: 'bold' },
        1: { cellWidth: 30 },
        2: { cellWidth: 38 },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      didDrawPage: hook => { if (hook.pageNumber > 1) paintCompactHeader(); },
    });
    y = table.lastAutoTable.finalY + 7;
  };

  const drawDebtorsTable = () => {
    pageBreak(34);
    if (data.debtors.length >= 100) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.6);
      doc.setTextColor(...MUTED);
      doc.text('Liste limitée aux 100 reliquats les plus anciens.', MARGIN, y);
      y += 5.5;
    }
    autoTable(doc, {
      startY: y,
      margin: TABLE_MARGIN,
      tableWidth: CONTENT_W,
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
      styles: {
        font: 'helvetica', fontSize: 7.6, cellPadding: 2.2,
        lineColor: LINE, lineWidth: 0.15, textColor: INK, valign: 'middle', overflow: 'linebreak',
      },
      headStyles: {
        fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.3,
        minCellHeight: 8, lineWidth: 0, overflow: 'linebreak',
      },
      footStyles: {
        fillColor: [236, 239, 243], textColor: NAVY, fontStyle: 'bold', fontSize: 7.6,
        lineColor: LINE, lineWidth: 0.15, overflow: 'linebreak',
      },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold' },
        1: { cellWidth: 28 },
        2: { cellWidth: 26, halign: 'right' },
        3: { cellWidth: 26, halign: 'right' },
        4: { cellWidth: 30, halign: 'right', textColor: RED, fontStyle: 'bold' },
        5: { cellWidth: 26, halign: 'center' },
      },
      didParseCell: hook => {
        if (hook.section !== 'body' || hook.column.index !== 5) return;
        const partial = hook.cell.raw === 'Partiel';
        hook.cell.styles.fillColor = partial ? AMBER_SOFT : RED_SOFT;
        hook.cell.styles.textColor = partial ? AMBER : RED;
        hook.cell.styles.fontStyle = 'bold';
        hook.cell.styles.halign = 'center';
      },
      didDrawPage: hook => { if (hook.pageNumber > 1) paintCompactHeader(); },
    });
    y = table.lastAutoTable.finalY + 7;
  };

  const drawObservations = () => {
    const observations = buildObservations(data, money, currency, today);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    observations.forEach(observation => {
      const lines = doc.splitTextToSize(observation, CONTENT_W - 6) as string[];
      const blockHeight = lines.length * 4 + 2.4;
      pageBreak(blockHeight);
      doc.setFillColor(...GOLD);
      doc.rect(MARGIN, y - 2.4, 1.8, 1.8, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(...INK);
      doc.text(lines, MARGIN + 5, y);
      y += blockHeight;
    });
    y += 2;
  };

  const drawSignatures = () => {
    pageBreak(48);
    const gap = 8;
    const w = (CONTENT_W - gap) / 2;
    const h = 36;
    const boxes = [
      {
        title: 'ÉDITEUR DU RAPPORT',
        city: `Fait le ${today}`,
        name: exportedBy || 'Orion ERP',
        role: 'Document généré par Orion',
      },
      {
        title: 'VISA DE LA DIRECTION',
        city: school.city ? `Fait à ${school.city}, le ${today}` : `Fait le ${today}`,
        name: school.head_name || '—',
        role: school.head_title || 'Direction',
      },
    ];

    boxes.forEach((box, i) => {
      const x = MARGIN + i * (w + gap);
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, w, h, 1.6, 1.6, 'FD');

      doc.setFillColor(...NAVY);
      doc.roundedRect(x, y, w, 6, 1.6, 1.6, 'F');
      doc.setFillColor(...WHITE);
      doc.rect(x, y + 4.4, w, 1.8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6);
      doc.setTextColor(...WHITE);
      doc.text(box.title, x + 3.5, y + 2.9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...MUTED);
      doc.text(box.city, x + 3.5, y + 11, { maxWidth: w - 7 });

      doc.setDrawColor(...FAINT);
      doc.setLineWidth(0.25);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(x + 4, y + 20, x + w - 4, y + 20);
      doc.setLineDashPattern([], 0);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...INK);
      fitText(doc, box.name, w - 8, 8.5, 6);
      doc.text(box.name, x + 4, y + 25.5, { maxWidth: w - 8 });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...MUTED);
      doc.text(box.role, x + 4, y + 30, { maxWidth: w - 8 });

      doc.setFontSize(6.2);
      doc.setTextColor(...FAINT);
      doc.text('Signature & cachet', x + w - 4, y + 33.5, { align: 'right' });
    });
    y += h + 7;
  };

  sectionTitle('01', 'Synthèse de la campagne', 72);
  drawKpis();
  drawRecoveryBar();
  drawSituationBar();

  sectionTitle('02', 'Recouvrement par classe', 52);
  if (data.by_class.length === 0) {
    emptyNote('Aucune donnée de recouvrement par classe.');
  } else {
    drawClassTable();
  }

  sectionTitle('03', "Modes d'encaissement", 42);
  if (data.by_method.length === 0) {
    emptyNote('Aucun encaissement enregistré pour cette année scolaire.');
  } else {
    drawMethodsTable();
  }

  sectionTitle('04', 'Grille tarifaire en vigueur', 42);
  if (data.fees.length === 0) {
    emptyNote('Aucun frais défini pour cette année scolaire.');
  } else {
    drawFeesTable();
  }

  sectionTitle('05', 'Élèves avec reliquat', 46);
  if (data.debtors.length === 0) {
    emptyNote('Aucun impayé : tous les élèves sont à jour.', EMERALD);
  } else {
    drawDebtorsTable();
  }

  sectionTitle('06', 'Observations et recommandations', 30);
  drawObservations();

  sectionTitle('07', 'Validation et signatures', 46);
  drawSignatures();

  pageBreak(10);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.4);
  doc.setTextColor(...FAINT);
  doc.text(
    'Document généré automatiquement par Orion — toute reproduction sans autorisation est interdite.',
    PAGE_W / 2, y, { align: 'center' },
  );

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, FOOTER_LINE_Y, PAGE_W - MARGIN, FOOTER_LINE_Y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...FAINT);
    const left = [school.short_name || school.name, `Rapport financier ${year}`].filter(Boolean).join(' · ');
    doc.text(left, MARGIN, FOOTER_LINE_Y + 4.5);
    doc.text(`Édité le ${today}`, PAGE_W / 2, FOOTER_LINE_Y + 4.5, { align: 'center' });
    doc.text(`Page ${p} / ${pages}`, PAGE_W - MARGIN, FOOTER_LINE_Y + 4.5, { align: 'right' });
  }

  return doc;
}

export function saveFinanceReportProPdf(opts: BuildFinanceReportProOptions): void {
  const doc = buildFinanceReportProPdf(opts);
  const safe = opts.year.replace(/[^a-zA-Z0-9_-]/g, '-');
  doc.save(`Rapport-financier-annuel-${safe}.pdf`);
}
