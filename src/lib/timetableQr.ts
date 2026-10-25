/**
 * Génère un QR code dynamique spécifique à chaque emploi du temps.
 *
 * Le QR encode une représentation textuelle lisible de la grille :
 *   - Établissement, classe, professeur titulaire, année
 *   - Pour chaque jour : la liste des créneaux occupés (heure → matière)
 */

import QRCode from 'qrcode';
import { DAYS, HOURS, type TimetableGridData } from './timetableTemplate';

export interface TimetableQrInput {
  schoolName: string;
  className: string;
  yearName: string;
  teacherName?: string;
  boyCount?: number;
  girlCount?: number;
  grid: TimetableGridData;
}

/**
 * Construit le texte encodé dans le QR.
 * Format compact mais humainement lisible.
 */
function buildQrText(input: TimetableQrInput): string {
  const lines: string[] = [];

  if (input.schoolName) lines.push(input.schoolName);
  lines.push('EMPLOI DU TEMPS — ' + input.className);
  if (input.yearName) lines.push('Annee scolaire : ' + input.yearName);
  if (input.teacherName) lines.push('Prof. titulaire : ' + input.teacherName);
  const total = (input.boyCount ?? 0) + (input.girlCount ?? 0);
  if (total > 0) {
    lines.push('Effectif : ' + total + ' eleve(s) (G:' + (input.boyCount ?? 0) + ' / F:' + (input.girlCount ?? 0) + ')');
  }
  lines.push('');

  DAYS.forEach((day, dayIndex) => {
    const dayNum = dayIndex + 1;
    const slots: string[] = [];
    HOURS.forEach((hour, slot) => {
      const code = (input.grid[dayNum + '_' + slot] ?? '').trim();
      if (code) slots.push('  ' + hour + ' : ' + code);
    });
    if (slots.length > 0) {
      lines.push(day);
      slots.forEach(s => lines.push(s));
      lines.push('');
    }
  });

  const hasAny = DAYS.some((_, di) =>
    HOURS.some((_, si) => (input.grid[(di + 1) + '_' + si] ?? '').trim() !== '')
  );
  if (!hasAny) lines.push('(Grille vide)');

  return lines.join('\n').trim();
}

/**
 * Génère un QR code propre à cet emploi du temps et retourne
 * un data-URI PNG prêt à être incorporé dans jsPDF.
 */
export async function generateTimetableQr(input: TimetableQrInput): Promise<string> {
  const text = buildQrText(input);
  const dataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
    color: { dark: '#000000', light: '#ffffff' },
  });
  return dataUrl;
}
