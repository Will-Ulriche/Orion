import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StudentAverages } from '../components/StudentProfileModal';
import { ClassRankingEntry, SubjectStats } from '../pages/Pedagogie';

export const generateStudentBulletin = (
  schoolName: string,
  academicYear: string,
  periodName: string,
  studentName: string,
  matricule: string | null,
  className: string,
  averages: StudentAverages
) => {
  const doc = new jsPDF();
  
  // Couleurs
  const primaryColor: [number, number, number] = [79, 70, 229]; // #4f46e5

  // En-tête
  doc.setFontSize(22);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(schoolName, 105, 20, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(`Année académique : ${academicYear}`, 105, 28, { align: 'center' });
  
  // Titre du bulletin
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(`BULLETIN DE NOTES - ${periodName.toUpperCase()}`, 105, 42, { align: 'center' });

  // Ligne de séparation
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.line(14, 48, 196, 48);

  // Informations de l'élève
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105); // slate-600
  
  doc.text(`Élève :`, 14, 58);
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text(studentName, 30, 58);

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(`Matricule :`, 14, 65);
  doc.setTextColor(30, 41, 59);
  doc.text(matricule || 'Non renseigné', 35, 65);

  doc.setTextColor(71, 85, 105);
  doc.text(`Classe :`, 140, 58);
  doc.setTextColor(30, 41, 59);
  doc.text(className, 158, 58);

  doc.setTextColor(71, 85, 105);
  doc.text(`Effectif :`, 140, 65);
  doc.setTextColor(30, 41, 59);
  doc.text(averages.class_size.toString(), 158, 65);

  // Tableau
  const tableData = averages.subjects.map(s => [
    s.subject_name,
    s.coefficient.toString(),
    s.average !== null ? s.average.toFixed(2) : '-',
    s.class_average !== null ? s.class_average.toFixed(2) : '-',
    s.appreciation
  ]);

  autoTable(doc, {
    startY: 75,
    head: [['Matière', 'Coef.', 'Moy. Élève', 'Moy. Classe', 'Appréciation']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: 255, halign: 'center' },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      1: { halign: 'center' },
      2: { halign: 'center', fontStyle: 'bold' },
      3: { halign: 'center', textColor: 100 },
      4: { halign: 'left' }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
    styles: { fontSize: 10, cellPadding: 4, lineColor: [226, 232, 240] }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 75;

  // Résumé et KPI
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, finalY + 10, 182, 25, 3, 3, 'FD');

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text("Moyenne Générale", 30, finalY + 18);
  doc.text("Rang", 95, finalY + 18);
  doc.text("Décision", 150, finalY + 18);

  doc.setFontSize(14);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(`${averages.general_average !== null ? averages.general_average.toFixed(2) : '-'} / 20`, 30, finalY + 27);
  doc.text(`${averages.rank !== null ? averages.rank : '-'} / ${averages.class_size}`, 95, finalY + 27);
  
  const passed = averages.general_average !== null && averages.general_average >= 10;
  doc.setTextColor(passed ? 16 : 220, passed ? 185 : 38, passed ? 129 : 38); // emerald-500 or red-600
  doc.text(averages.general_average !== null ? (passed ? 'Admis(e)' : 'Ajourné(e)') : '-', 150, finalY + 27);

  // Signatures
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text("Le Titulaire", 40, finalY + 55);
  doc.text("Le Chef d'Établissement", 130, finalY + 55);

  // Génération du nom de fichier
  const cleanName = studentName.replace(/[^a-zA-Z0-9\u00C0-\u017F]/g, '_');
  const cleanPeriod = periodName.replace(/[^a-zA-Z0-9\u00C0-\u017F]/g, '_');
  doc.save(`Bulletin_${cleanName}_${cleanPeriod}.pdf`);
};

export const generateClassReport = (
  schoolName: string,
  academicYear: string,
  periodName: string,
  className: string,
  rankings: ClassRankingEntry[],
  stats: SubjectStats[]
) => {
  const doc = new jsPDF();
  const primaryColor: [number, number, number] = [79, 70, 229];

  // En-tête
  doc.setFontSize(22);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(schoolName, 105, 20, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(`Année académique : ${academicYear}`, 105, 28, { align: 'center' });
  
  // Titre du bulletin
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(`PALMARÈS DE CLASSE - ${periodName.toUpperCase()}`, 105, 42, { align: 'center' });

  // Infos de la classe
  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text(`Classe :`, 14, 55);
  doc.setTextColor(30, 41, 59);
  doc.text(className, 30, 55);
  
  doc.setTextColor(71, 85, 105);
  doc.text(`Effectif :`, 140, 55);
  doc.setTextColor(30, 41, 59);
  doc.text(rankings.length.toString(), 158, 55);

  const tableData = rankings.map(r => [
    r.rank.toString(),
    `${r.last_name} ${r.first_name}`,
    r.general_average !== null ? r.general_average.toFixed(2) : '-',
    r.appreciation
  ]);

  autoTable(doc, {
    startY: 65,
    head: [['Rang', 'Élève', 'Moyenne / 20', 'Appréciation']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: 255, halign: 'center' },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold' },
      1: { halign: 'left', fontStyle: 'bold' },
      2: { halign: 'center', fontStyle: 'bold' },
      3: { halign: 'left' }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 10, cellPadding: 4, lineColor: [226, 232, 240] }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 65;

  if (stats.length > 0) {
    // Nouvelle page si pas assez d'espace
    if (finalY > 230) doc.addPage();
    const newY = finalY > 230 ? 20 : finalY + 15;
    
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Statistiques par matière", 14, newY);
    
    const statsData = stats.map(s => [
      s.subject_name,
      s.class_average !== null ? s.class_average.toFixed(2) : '-',
      s.min_score !== null ? s.min_score.toFixed(2) : '-',
      s.max_score !== null ? s.max_score.toFixed(2) : '-',
      `${s.success_rate.toFixed(0)}%`
    ]);

    autoTable(doc, {
      startY: newY + 5,
      head: [['Matière', 'Moy. Classe', 'Note Min', 'Note Max', 'Taux de réussite']],
      body: statsData,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105], textColor: 255, halign: 'center' },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 9, cellPadding: 3, lineColor: [226, 232, 240] }
    });
  }

  const cleanClass = className.replace(/[^a-zA-Z0-9\u00C0-\u017F]/g, '_');
  const cleanPeriod = periodName.replace(/[^a-zA-Z0-9\u00C0-\u017F]/g, '_');
  doc.save(`Palmares_${cleanClass}_${cleanPeriod}.pdf`);
};
