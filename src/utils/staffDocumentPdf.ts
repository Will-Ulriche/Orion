import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface StaffDocumentData {
  id: string;
  nom: string;
  prenoms: string;
  matricule?: string | null;
  fonction?: string | null;
  matiere_principale?: string | null;
  matieres_secondaires?: string | null;
  etablissement?: string | null;
  statut_professionnel?: string | null;
  type_personnel?: string | null;
  grade?: string | null;
  echelon?: string | null;
  indice?: number | null;
  categorie?: string | null;
  specialite?: string | null;
  date_prise_service?: string | null;
  date_affectation?: string | null;
  date_depart?: string | null;
  motif_depart?: string | null;
  date_debut_conge?: string | null;
  date_fin_conge?: string | null;
}

export interface SchoolSettingsInfo {
  name?: string | null;
  short_name?: string | null;
  ministry_name?: string | null;
  city?: string | null;
  country?: string | null;
  head_title?: string | null;
}

const PRIMARY_COLOR: [number, number, number] = [79, 70, 229]; // #4f46e5
const TEXT_DARK: [number, number, number] = [30, 41, 59]; // #1e293b
const TEXT_MUTED: [number, number, number] = [100, 116, 139]; // #64748b
const BORDER_COLOR: [number, number, number] = [226, 232, 240]; // #e2e8f0

function sanitizeFilename(name: string): string {
  return name.replace(/[\s'/\\:*?"<>|]+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function buildStaffDocumentPdf(
  docName: string,
  staff: StaffDocumentData,
  schoolSettings?: SchoolSettingsInfo | null
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const contentW = pageW - marginX * 2;
  const centerX = pageW / 2;

  const today = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const nomComplet = `${staff.nom || ''} ${staff.prenoms || ''}`.trim() || 'Personnel';
  const matricule = staff.matricule || 'N/A';
  const fonction = staff.fonction || 'Membre du personnel';
  const etablissement = schoolSettings?.name?.trim() || staff.etablissement || "L'Établissement Scolaire";
  const rawMinistry = schoolSettings?.ministry_name?.trim() || "Ministère des Enseignements Primaire et Secondaire";
  const datePrise = staff.date_prise_service
    ? new Date(staff.date_prise_service).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '___________';
  const dateAffectation = staff.date_affectation
    ? new Date(staff.date_affectation).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '___________';

  // Matière(s) enseignée(s) — affiché après la fonction si disponible
  const matierePrincipale = staff.matiere_principale?.trim() || null;
  const matieresSecondaires = staff.matieres_secondaires?.trim() || null;
  const matiereStr = matierePrincipale
    ? `, chargé(e) de l'enseignement de ${matierePrincipale}${matieresSecondaires ? ` (et de : ${matieresSecondaires})` : ''}`
    : '';

  // ── 1. En-tête officiel ──
  let y = 18;

  // Côté gauche : Pays et Ministère
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text('RÉPUBLIQUE DU TOGO', marginX, y);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Travail — Liberté — Patrie', marginX, y + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_DARK);
  const userLines = rawMinistry.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const ministryLines: string[] = [];
  for (const line of userLines) {
    const wrapped = doc.splitTextToSize(line, 95);
    ministryLines.push(...wrapped);
  }
  let curY = y + 10;
  for (const line of ministryLines) {
    doc.text(line, marginX, curY);
    curY += 4.2;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text(etablissement, marginX, curY + 2);

  // Côté droit : Référence et Date
  const refYear = new Date().getFullYear();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Réf. : ${matricule}/${refYear}`, pageW - marginX, y + 3, { align: 'right' });
  doc.text(`Fait le : ${today}`, pageW - marginX, y + 8, { align: 'right' });

  // Ligne de séparation colorée
  y = Math.max(curY + 7, y + 26);
  doc.setDrawColor(...PRIMARY_COLOR);
  doc.setLineWidth(0.8);
  doc.line(marginX, y, pageW - marginX, y);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.2);
  doc.line(marginX, y + 1.2, pageW - marginX, y + 1.2);

  // ── 2. Titre du document ──
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...TEXT_DARK);
  const titleText = docName.toUpperCase();
  const textWidth = doc.getTextWidth(titleText);
  if (textWidth > contentW) {
    const wrappedTitle = doc.splitTextToSize(titleText, contentW);
    doc.text(wrappedTitle, centerX, y, { align: 'center' });
    y += (wrappedTitle.length - 1) * 6;
  } else {
    doc.text(titleText, centerX, y, { align: 'center' });
  }

  // Souligné esthétique proportionnel
  const underlineW = Math.min(Math.max(textWidth * 0.65, 45), contentW);
  doc.setFillColor(...PRIMARY_COLOR);
  doc.roundedRect(centerX - underlineW / 2, y + 3, underlineW, 1, 0.5, 0.5, 'F');

  // ── 3. Cadre d'identification de l'agent ──
  y += 15;
  const boxHeight = 22;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, y, contentW, boxHeight, 2, 2, 'FD');

  // Barre latérale accentuée
  doc.setFillColor(...PRIMARY_COLOR);
  doc.roundedRect(marginX, y, 2.5, boxHeight, 1, 1, 'F');

  // Infos agent dans le cadre
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...TEXT_DARK);
  doc.text(nomComplet.toUpperCase(), marginX + 6, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  const details = [
    `Matricule : ${matricule}`,
    `Fonction : ${fonction}`,
    staff.statut_professionnel ? `Statut : ${staff.statut_professionnel}` : null,
  ].filter(Boolean).join('   ·   ');
  doc.text(details, marginX + 6, y + 15);

  y += boxHeight + 12;

  // ── 4. Corps du document selon le type ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85); // slate-700
  const lineHeight = 6.2;

  if (docName === 'Bulletin de salaire') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`RELEVÉ INDIVIDUEL DE SITUATION SALARIALE — ${today}`, centerX, y, { align: 'center' });
    y += 8;

    const rows: [string, string][] = [
      ['Nom et Prénoms', nomComplet],
      ['Matricule', matricule],
      ['Fonction occupée', fonction],
      ['Type de personnel', staff.type_personnel || 'Non spécifié'],
      ['Statut professionnel', staff.statut_professionnel || 'Non spécifié'],
      ['Grade / Échelon', `${staff.grade || '—'} / ${staff.echelon || '—'}`],
      ['Catégorie', staff.categorie || '—'],
      ['Indice salarial', staff.indice != null ? String(staff.indice) : '—'],
      ['Date de prise de service', datePrise],
      ['Établissement', etablissement],
    ];

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: 'striped',
      head: [['Désignation', 'Détail administratif']],
      body: rows,
      headStyles: {
        fillColor: PRIMARY_COLOR,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10,
        cellPadding: 3,
      },
      styles: {
        fontSize: 9.5,
        cellPadding: 2.8,
        lineColor: BORDER_COLOR,
        textColor: TEXT_DARK,
      },
      columnStyles: {
        0: { cellWidth: 65, fontStyle: 'bold' },
        1: { cellWidth: contentW - 65 },
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? y + 80;
    y = finalY + 8;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Ce bulletin est généré à titre indicatif selon les données administratives enregistrées dans le système.', marginX, y);
    y += 8;
  } else {
    // Paragraphe d'ouverture et texte selon le document
    let intro = `Le Directeur de ${etablissement} soussigné atteste que :`;
    let mainLines: string[] = [];
    let closing = 'Cette attestation lui est délivrée pour servir et valoir ce que de droit.';

    switch (docName) {
      case 'Attestation de service':
        intro = `Le Directeur de ${etablissement} soussigné atteste que :`;
        mainLines = [
          `L'agent susmentionné est actuellement en service actif au sein de notre établissement scolaire en qualité de ${fonction}${matiereStr}, depuis le ${datePrise}.`,
          `Durant toute la période de son exercice, l'intéressé(e) s'est acquitté(e) de ses obligations de service avec assiduité et conscience professionnelle.`,
        ];
        closing = 'La présente attestation lui est délivrée à sa demande pour servir et valoir ce que de droit.';
        break;

      case 'Certificat de service':
        intro = `Nous, Directeur de ${etablissement}, certifions que :`;
        mainLines = [
          `L'agent susnommé(e) occupe effectivement le poste de ${fonction}${matiereStr} au sein de notre établissement depuis le ${dateAffectation}.`,
          `L'agent est soumis aux obligations réglementaires en vigueur et exerce régulièrement ses fonctions administratives ou pédagogiques.`,
        ];
        closing = 'Le présent certificat est établi à sa demande pour tous usages légaux autorisés.';
        break;

      case 'Attestation de prise de service':
        intro = `Le Directeur de ${etablissement} atteste que :`;
        mainLines = [
          `L'agent a effectivement pris service dans notre établissement en qualité de ${fonction}${matiereStr} à compter du ${datePrise}.`,
          `L'intéressé(e) a été régulièrement installé(e) dans ses fonctions conformément aux directives administratives et ministérielles.`,
        ];
        closing = 'En foi de quoi, la présente attestation lui est délivrée pour servir et valoir ce que de droit.';
        break;

      case 'Attestation de reprise de service':
        intro = `Le Directeur de ${etablissement} atteste que :`;
        mainLines = [
          `L'agent a officiellement repris l'exercice effectif de ses fonctions en qualité de ${fonction}${matiereStr} le ${today}, suite à une période d'absence ou de congé régulièrement autorisée.`,
          `L'intéressé(e) a réintégré son poste de travail sans réserve.`,
        ];
        closing = 'Cette attestation est délivrée pour servir et valoir ce que de droit.';
        break;

      case 'Attestation de fin de contrat': {
        const dateFin = staff.date_depart
          ? new Date(staff.date_depart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
          : today;
        intro = `Le Directeur de ${etablissement} atteste que :`;
        mainLines = [
          `L'agent susmentionné a exercé les fonctions de ${fonction}${matiereStr} au sein de notre établissement.`,
          `Son engagement contractuel a pris fin le ${dateFin}${staff.motif_depart ? ` pour le motif suivant : ${staff.motif_depart}` : ''}.`,
          `L'intéressé(e) quitte l'établissement libre de tout engagement envers l'administration scolaire.`,
        ];
        closing = 'Cette attestation lui est délivrée pour faire valoir ses droits.';
        break;
      }

      case 'Quitus administratif':
        intro = `Le présent quitus administratif atteste que :`;
        mainLines = [
          `L'agent désigné ci-dessus a rempli l'ensemble de ses obligations administratives, matérielles et pédagogiques vis-à-vis de ${etablissement}.`,
          `Il / elle ne doit aucun matériel, document ni fonds à l'établissement au titre de ses fonctions de ${fonction}${matiereStr}.`,
        ];
        closing = 'En foi de quoi, le présent quitus administratif lui est délivré pour servir et valoir ce que de droit.';
        break;

      case 'Certificat de salaire':
        intro = `Nous certifions que :`;
        mainLines = [
          `L'agent susvisé est rémunéré mensuellement par ${etablissement} au titre de ses fonctions de ${fonction}${matiereStr}.`,
          staff.indice ? `Il / elle émarge avec un indice salarial de ${staff.indice} (Catégorie ${staff.categorie || '—'}).` : `Statut professionnel : ${staff.statut_professionnel || 'En activité'}.`,
        ];
        closing = 'Ce certificat de salaire est établi à la demande de l\'intéressé(e) pour servir et valoir ce que de droit.';
        break;

      case "Autorisation d'absence":
        intro = `Le Directeur de ${etablissement} autorise par la présente :`;
        mainLines = [
          `L'agent exerçant les fonctions de ${fonction}${matiereStr}, à s'absenter exceptionnellement de son poste de service.`,
          `Période autorisée : du ________________________ au ________________________.`,
          `Motif de l'absence : ____________________________________________________.`,
          `L'intéressé(e) est tenu(e) de reprendre son service dès l'expiration de la période accordée et de se présenter à la Direction.`,
        ];
        closing = 'Autorisation délivrée pour valoir justificatif d\'absence.';
        break;

      case 'Autorisation de conge': {
        const dDebut = staff.date_debut_conge
          ? new Date(staff.date_debut_conge).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
          : '________________________';
        const dFin = staff.date_fin_conge
          ? new Date(staff.date_fin_conge).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
          : '________________________';
        intro = `Le Directeur de ${etablissement} accorde à :`;
        mainLines = [
          `L'agent désigné un congé régulier couvrant la période du ${dDebut} au ${dFin}.`,
          `L'intéressé(e) est tenu(e) de reprendre obligatoirement son poste à l'expiration de ce congé, sous peine des sanctions administratives prévues par le statut général.`,
        ];
        closing = 'En foi de quoi, la présente autorisation de congé est accordée.';
        break;
      }

      case 'Attestation de formation':
        intro = `Le Directeur de ${etablissement} atteste que :`;
        mainLines = [
          `L'agent susmentionné a participé avec succès à une session de renforcement des capacités et de formation continue.`,
          `Domaine / Spécialité : ${staff.specialite || 'Pédagogie et administration scolaire'}.`,
          `Période de la session : du ________________________ au ________________________.`,
        ];
        closing = 'Cette attestation de formation lui est délivrée en reconnaissance de sa participation active.';
        break;

      case 'Attestation de stage':
        intro = `Le Directeur de ${etablissement} atteste que :`;
        mainLines = [
          `L'intéressé(e) a accompli un stage pratique au sein de notre établissement en qualité de ${fonction}${matiereStr}.`,
          `Ce stage s'est déroulé dans des conditions exemplaires d'assiduité, d'intégration et de discipline professionnelle.`,
        ];
        closing = 'Cette attestation de stage est délivrée pour servir et valoir ce que de droit.';
        break;

      default:
        intro = `Le Directeur de ${etablissement} certifie que :`;
        mainLines = [
          `L'agent en qualité de ${fonction}${matiereStr} est régulièrement inscrit(e) dans les registres de l'établissement.`,
          `Le présent document (${docName}) lui est octroyé en vertu des textes réglementaires en vigueur.`,
        ];
        closing = 'Cette attestation lui est délivrée pour servir et valoir ce que de droit.';
        break;
    }

    // Rendu de l'introduction
    doc.text(intro, marginX, y);
    y += lineHeight + 3;

    // Rendu des lignes principales
    for (const paragraph of mainLines) {
      const splitLines = doc.splitTextToSize(paragraph, contentW);
      doc.text(splitLines, marginX, y);
      y += splitLines.length * lineHeight + 3;
    }

    y += 4;
    // Rendu de la formule de conclusion
    doc.setFont('helvetica', 'italic');
    doc.text(closing, marginX, y);
    y += lineHeight + 8;
  }

  // ── 5. Bloc Signature et Cachet ──
  // Positionné confortablement en bas de page
  const signatureY = Math.max(y + 12, 218);

  const sigBlockW = 75;
  const sigX = pageW - marginX - sigBlockW;

  const city = schoolSettings?.city?.trim() || 'Lomé';
  const headTitle = schoolSettings?.head_title?.trim() || "Le Directeur de l'Établissement";

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text(`Fait à ${city}, le ${today}`, sigX + sigBlockW / 2, signatureY, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(headTitle, sigX + sigBlockW / 2, signatureY + 6, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('(Signature et Cachet officiel)', sigX + sigBlockW / 2, signatureY + 11, { align: 'center' });

  // Ligne pointillée ou espace pour le cachet
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.line(sigX + 5, signatureY + 36, sigX + sigBlockW - 5, signatureY + 36);

  // ── 6. Pied de page officiel ──
  const footerY = pageH - 14;
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.line(marginX, footerY - 4, pageW - marginX, footerY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${etablissement} — Document officiel d'administration scolaire`, marginX, footerY);
  doc.text(`Émis le ${today} · Page 1/1`, pageW - marginX, footerY, { align: 'right' });

  return doc;
}

export function saveStaffDocumentPdf(
  docName: string,
  staff: StaffDocumentData,
  schoolSettings?: SchoolSettingsInfo | null
): void {
  const doc = buildStaffDocumentPdf(docName, staff, schoolSettings);
  const cleanDoc = sanitizeFilename(docName);
  const cleanNom = sanitizeFilename(`${staff.nom}_${staff.prenoms}`);
  const filename = `${cleanDoc}_${cleanNom}.pdf`;
  doc.save(filename);
}

export function getStaffDocumentPdfBlobUrl(
  docName: string,
  staff: StaffDocumentData,
  schoolSettings?: SchoolSettingsInfo | null
): string {
  const doc = buildStaffDocumentPdf(docName, staff, schoolSettings);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}
