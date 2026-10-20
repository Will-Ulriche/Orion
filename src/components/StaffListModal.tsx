import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2, Users, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface StaffListItem {
  id: string;
  matricule: string | null;
  nom: string;
  prenoms: string;
  date_naissance: string | null;
  fonction: string | null;
  type_personnel: string | null;
  statut_administratif: string | null;
  specialite: string | null;
  classes_enseignees: string | null;
  matieres_enseignees: string | null;
}

interface StaffListModalProps {
  staffList: StaffListItem[];
  schoolName: string;
  yearName: string;
  onClose: () => void;
  onError?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
}

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
};

const isActif = (s: string | null | undefined) => {
  const v = (s ?? '').trim().toLowerCase();
  return v === 'actif';
};

const exportCSV = (rows: StaffListItem[], filename: string) => {
  const headers = [
    'Matricule',
    'Nom',
    'Prénom(s)',
    'Date de naissance',
    'Fonction',
    'Type de personnel',
    'Classe(s) enseignée(s)',
    'Matière(s) enseignée(s)',
    'Toujours actif',
    'Statut administratif',
  ];
  const csv = [
    headers.join(';'),
    ...rows.map((r) => {
      const line = [
        r.matricule ?? '',
        (r.nom ?? '').toUpperCase(),
        r.prenoms ?? '',
        formatDate(r.date_naissance),
        r.fonction ?? '',
        r.type_personnel ?? '',
        r.classes_enseignees ?? '',
        r.matieres_enseignees ?? r.specialite ?? '',
        isActif(r.statut_administratif) ? 'Oui' : 'Non',
        r.statut_administratif ?? '',
      ]
        .map((v) => {
          const s = String(v ?? '');
          if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        })
        .join(';');
      return line;
    }),
  ].join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function StaffListModal({
  staffList,
  schoolName,
  yearName,
  onClose,
  onError,
  onSuccess,
}: StaffListModalProps) {
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null);

  const rows = useMemo(() => {
    return [...staffList].sort((a, b) => {
      const nA = (a.nom ?? '').toLocaleUpperCase('fr-FR');
      const nB = (b.nom ?? '').toLocaleUpperCase('fr-FR');
      if (nA !== nB) return nA.localeCompare(nB, 'fr-FR');
      const pA = (a.prenoms ?? '').toLocaleUpperCase('fr-FR');
      const pB = (b.prenoms ?? '').toLocaleUpperCase('fr-FR');
      return pA.localeCompare(pB, 'fr-FR');
    });
  }, [staffList]);

  const handleExportPDF = async () => {
    try {
      setExporting('pdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'A4' });

      const title = 'Liste du personnel';
      const subtitleParts = [schoolName || 'Établissement', yearName || 'Année scolaire'].filter(Boolean);
      const subtitle = subtitleParts.join(' - ');

      doc.setFontSize(14);
      doc.text(title, 40, 40);
      if (subtitle) {
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(subtitle, 40, 58);
      }
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 40, 74);

      autoTable(doc, {
        startY: 90,
        head: [
          [
            'N°',
            'Matricule',
            'Nom',
            'Prénom(s)',
            'Date de naissance',
            'Fonction',
            'Type',
            "Classe(s) enseignée(s)",
            "Matière(s) enseignée(s)",
            'Toujours actif',
          ],
        ],
        body: rows.map((r, i) => [
          String(i + 1),
          r.matricule ?? '',
          (r.nom ?? '').toUpperCase(),
          r.prenoms ?? '',
          formatDate(r.date_naissance),
          r.fonction ?? '',
          r.type_personnel ?? '',
          r.classes_enseignees ?? '',
          r.matieres_enseignees ?? r.specialite ?? '',
          isActif(r.statut_administratif) ? 'Oui' : 'Non',
        ]),
        styles: {
          fontSize: 7.5,
          cellPadding: 5,
          overflow: 'linebreak',
          valign: 'middle',
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: 255,
          fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
        tableWidth: 'auto',
      });

      const finalY = (doc as any).lastAutoTable?.finalY ?? 90;
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`${rows.length} membre(s) du personnel`, 40, finalY + 20);

      const filename = `Liste_du_personnel_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
      onSuccess?.('Liste du personnel exportée au format PDF.');
    } catch (e: any) {
      console.error(e);
      onError?.(e?.message || "Échec de l'export PDF.");
    } finally {
      setExporting(null);
    }
  };

  const handleExportCSV = () => {
    try {
      setExporting('csv');
      const filename = `Liste_du_personnel_${new Date().toISOString().slice(0, 10)}.csv`;
      exportCSV(rows, filename);
      onSuccess?.('Liste du personnel exportée au format CSV.');
    } catch (e: any) {
      onError?.(e?.message || "Échec de l'export CSV.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="flex h-[92vh] w-[98vw] max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Users size={16} />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-slate-800">Liste du personnel</h2>
              <p className="text-[11.5px] text-slate-400">
                {schoolName || 'Établissement'} — {yearName || 'Année scolaire'} — {rows.length} membre(s)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportPDF}
              disabled={exporting !== null || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Exporter en PDF
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exporting !== null || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting === 'csv' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              Exporter en CSV
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              aria-label="Fermer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="w-10 whitespace-nowrap px-3 py-3 text-center font-semibold">N°</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Matricule</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Nom</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Prénom(s)</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Date de naissance</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Fonction</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Classe(s) enseignée(s)</th>
                  <th className="px-3 py-3 font-semibold">Matière(s) enseignée(s)</th>
                  <th className="whitespace-nowrap px-3 py-3 text-center font-semibold">Toujours actif</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-[13px] text-slate-400">
                      Aucun membre du personnel à afficher.
                    </td>
                  </tr>
                ) : (
                  rows.map((s, i) => {
                    const actif = isActif(s.statut_administratif);
                    const matieres = s.matieres_enseignees || s.specialite || '—';
                    return (
                      <tr key={s.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-center text-slate-400">{i + 1}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-[11.5px] text-slate-500">{s.matricule || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{(s.nom ?? '').toLocaleUpperCase('fr-FR')}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{s.prenoms ?? ''}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDate(s.date_naissance)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{s.fonction || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{s.type_personnel || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{s.classes_enseignees || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{matieres}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${actif ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                            {actif ? 'Oui' : 'Non'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
