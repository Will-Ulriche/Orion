import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  LoaderCircle,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  buildCarteScolairePdf,
  type CarteScolaireData,
} from '../lib/carteScolairePdf';
import type { ReceiptSchoolInfo } from '../lib/receiptPdf';

const deaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export interface CarteScolaireStudentRow {
  id: string;
  student_id: string;
  class_id: string | null;
  class_name: string | null;
  class_level: string | null;
  first_name: string | null;
  last_name: string | null;
  matricule: string | null;
  gender: string | null;
}

export interface CarteScolaireClassRow {
  id: string;
  name: string;
}

interface CarteScolaireModalProps {
  students: CarteScolaireStudentRow[];
  classes?: CarteScolaireClassRow[];
  school: ReceiptSchoolInfo;
  schoolId: string;
  yearId?: string;
  yearName: string;
  groupLabel: string;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}

export default function CarteScolaireModal({
  students, school, schoolId, yearName, groupLabel, onClose, onError, onSuccess,
}: CarteScolaireModalProps) {
  const [classQuery, setClassQuery] = useState('');
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [freshSchool, setFreshSchool] = useState<ReceiptSchoolInfo>(school);

  useEffect(() => {
    setFreshSchool(school);
  }, [school]);

  useEffect(() => {
    invoke<Partial<ReceiptSchoolInfo>>('get_school_settings', { schoolId })
      .then(s => {
        if (s) setFreshSchool(prev => ({ ...prev, ...s }));
      })
      .catch(() => {});
  }, [schoolId]);

  // ── Classes regroupées (colonne gauche) ────────────────────────────────────
  const classList = useMemo(() => {
    const byClass = new Map<string, CarteScolaireStudentRow[]>();
    for (const row of students) {
      const key = row.class_name ?? 'Sans classe';
      const list = byClass.get(key);
      if (list) list.push(row);
      else byClass.set(key, [row]);
    }
    return [...byClass.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([name, rows]) => ({
        name,
        count: rows.length,
        students: [...rows].sort((a, b) =>
          (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr')
          || (a.first_name ?? '').localeCompare(b.first_name ?? '', 'fr')
        ),
      }));
  }, [students]);

  // Filtrage des classes
  const filteredClasses = useMemo(() => {
    const q = deaccent(classQuery.trim()).toLowerCase();
    if (!q) return classList;
    return classList.filter(c => deaccent(c.name).toLowerCase().includes(q));
  }, [classList, classQuery]);

  // Sélection automatique de la 1ère classe au chargement
  useEffect(() => {
    if (!activeClass && classList.length > 0) {
      setActiveClass(classList[0].name);
      setSelectedStudentId(classList[0].students[0]?.student_id ?? null);
    }
  }, [classList, activeClass]);

  // ── Élèves correspondants à la classe active (liste en haut) ────────────────
  const currentClassStudents = useMemo(() => {
    if (!activeClass) return [];
    return classList.find(c => c.name === activeClass)?.students ?? [];
  }, [classList, activeClass]);

  // Synchronisation de l'élève sélectionné
  useEffect(() => {
    if (currentClassStudents.length > 0) {
      const exists = currentClassStudents.some(s => s.student_id === selectedStudentId);
      if (!exists) {
        setSelectedStudentId(currentClassStudents[0].student_id);
      }
    } else {
      setSelectedStudentId(null);
    }
  }, [currentClassStudents, selectedStudentId]);

  const selectedStudentIndex = useMemo(() => {
    if (!selectedStudentId) return -1;
    return currentClassStudents.findIndex(s => s.student_id === selectedStudentId);
  }, [currentClassStudents, selectedStudentId]);

  const selectedRow = useMemo(
    () => students.find(s => s.student_id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  // ── Données carte scolaire ─────────────────────────────────────────────────
  const [carte, setCarte] = useState<CarteScolaireData | null>(null);
  const [loading, setLoading] = useState(false);

  const cacheKey = selectedRow ? `${selectedRow.student_id}` : '';

  useEffect(() => {
    if (!selectedRow) {
      setCarte(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const details: any = await invoke('get_student_details', { studentId: selectedRow.student_id });

        const data: CarteScolaireData = {
          nom: details.last_name || selectedRow.last_name || '',
          prenoms: details.first_name || selectedRow.first_name || '',
          matricule: details.matricule || selectedRow.matricule,
          class_name: details.class_name || selectedRow.class_name,
          class_level: details.class_level || selectedRow.class_level,
          date_naissance: details.birth_date ?? null,
          lieu_naissance: details.birth_place ?? null,
          gender: details.gender || selectedRow.gender,
          school_name: freshSchool.name || school.name || 'Établissement scolaire',
          school_address: freshSchool.address ?? school.address,
          school_city: freshSchool.city ?? school.city,
          school_phone: freshSchool.phone ?? school.phone,
          school_logo: freshSchool.logo_url ?? school.logo_url,
          year_name: yearName,
          photo_url: details.photo_url ?? null,
        };
        if (!cancelled) setCarte(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) onError(`Impossible de charger les données de l'élève : ${String(e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cacheKey, schoolId, freshSchool, yearName, onError]);

  // ── Aperçu : le PDF réel ───────────────────────────────────────────────────
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const revokePreviewUrl = () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };

    if (!carte) {
      revokePreviewUrl();
      setPdfBlob(null);
      setBlobUrl(null);
      setPreviewing(false);
      return;
    }

    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const doc = await buildCarteScolairePdf(carte);
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        revokePreviewUrl();
        previewUrlRef.current = url;
        setPdfBlob(blob);
        setBlobUrl(url);
      } catch (e) {
        console.error(e);
        onError(`Aperçu PDF impossible : ${String(e)}`);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 10);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [carte, freshSchool, onError]);

  // Téléchargement du PDF
  const handleDownload = () => {
    if (!pdfBlob || !carte) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        const safeNom = (carte.nom || 'eleve').replace(/[^a-zA-Z0-9_-]/g, '_');
        const safePrenom = (carte.prenoms || 'eleve').replace(/[^a-zA-Z0-9_-]/g, '_');
        a.href = url;
        a.download = `Carte-scolaire-${safeNom}-${safePrenom}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onSuccess?.(`Carte scolaire de ${carte.prenoms} ${carte.nom} exportée.`);
      } catch (e) {
        onError(`Impossible de générer le PDF : ${String(e)}`);
      } finally {
        setBusy(false);
      }
    }, 50);
  };

  useEffect(() => () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const container = useMemo(() => document.querySelector('main') ?? document.body, []);

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Carte scolaire"
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in"
      >
        {/* ── En-tête : titre + fermeture ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CreditCard size={16} />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">Carte scolaire</h3>
              <p className="text-[11px] text-slate-400">
                Aperçu avant impression · A5 portrait · {groupLabel} · {yearName}
              </p>
            </div>
          </div>

          <button
            onClick={() => onClose()}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Corps : sélection classe à gauche, sélection élève en haut + aperçu PDF ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Colonne gauche : JUSTE LES CLASSES */}
          <div className="flex flex-col w-64 border-r border-slate-200 bg-slate-50 flex-shrink-0">
            <div className="px-3.5 py-3 border-b border-slate-200">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher une classe…"
                  value={classQuery}
                  onChange={e => setClassQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredClasses.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-slate-400">
                  Aucune classe trouvée.
                </div>
              ) : (
                filteredClasses.map(c => {
                  const isSelected = activeClass === c.name;
                  return (
                    <button
                      key={c.name}
                      onClick={() => {
                        setActiveClass(c.name);
                        setSelectedStudentId(c.students[0]?.student_id ?? null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] font-medium transition-all ${
                        isSelected
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Users size={14} className={isSelected ? 'text-white' : 'text-slate-400'} />
                        <span className="truncate">{c.name}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {c.count}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Colonne droite : En haut sélection de l'élève, puis aperçu PDF */}
          <div className="flex-1 flex flex-col min-w-0 bg-slate-200">
            {/* Barre supérieure : sélection de l'élève de la classe active */}
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-2.5 shadow-sm">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <label htmlFor="student-selector" className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                  <User size={15} className="text-emerald-600" />
                  Élève :
                </label>
                <select
                  id="student-selector"
                  value={selectedStudentId || ''}
                  onChange={e => setSelectedStudentId(e.target.value || null)}
                  disabled={!activeClass || currentClassStudents.length === 0}
                  className="flex-1 max-w-md rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
                >
                  {!activeClass ? (
                    <option value="">Sélectionnez d'abord une classe à gauche</option>
                  ) : currentClassStudents.length === 0 ? (
                    <option value="">Aucun élève dans cette classe</option>
                  ) : (
                    currentClassStudents.map(s => (
                      <option key={s.student_id} value={s.student_id}>
                        {(s.last_name || '').toUpperCase()} {s.first_name || ''} {s.matricule ? `(${s.matricule})` : ''}
                      </option>
                    ))
                  )}
                </select>

                {currentClassStudents.length > 0 && selectedStudentIndex >= 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        if (selectedStudentIndex > 0) {
                          setSelectedStudentId(currentClassStudents[selectedStudentIndex - 1].student_id);
                        }
                      }}
                      disabled={selectedStudentIndex <= 0}
                      className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Élève précédent"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-[11px] font-medium text-slate-500 min-w-[55px] text-center">
                      {selectedStudentIndex + 1} / {currentClassStudents.length}
                    </span>
                    <button
                      onClick={() => {
                        if (selectedStudentIndex < currentClassStudents.length - 1) {
                          setSelectedStudentId(currentClassStudents[selectedStudentIndex + 1].student_id);
                        }
                      }}
                      disabled={selectedStudentIndex >= currentClassStudents.length - 1}
                      className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Élève suivant"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>

              {activeClass && (
                <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                  Classe : <strong className="text-slate-700">{activeClass}</strong>
                </span>
              )}
            </div>

            {/* Zone aperçu PDF */}
            <div className="flex-1 min-h-0 p-4 relative">
              {(previewing || (loading && !!selectedStudentId)) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-200/50 backdrop-blur-sm text-slate-600">
                  <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin" />
                  <p className="text-sm font-medium">
                    {loading ? 'Chargement des données…' : 'Génération de l’aperçu…'}
                  </p>
                </div>
              )}
              {!selectedRow ? (
                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                  <EmptyState
                    icon={<CreditCard size={38} strokeWidth={1} />}
                    title="Sélectionnez une classe et un élève"
                    hint="Choisissez une classe dans la colonne de gauche puis sélectionnez un élève en haut pour afficher sa carte scolaire."
                  />
                </div>
              ) : blobUrl ? (
                <div className="h-full overflow-hidden rounded-xl bg-white shadow-sm">
                  <iframe
                    src={`${blobUrl}#view=FitH`}
                    className="h-full w-full border-0"
                    title="Aperçu de la carte scolaire"
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                  <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin opacity-50" />
                  <p className="text-sm">Génération de l'aperçu…</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Pied : récapitulatif + actions ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="text-[11px] text-slate-400">
            Format <strong className="text-slate-500">A5 portrait</strong> — une carte scolaire par élève, année {yearName}.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!carte || busy || previewing || loading || !pdfBlob}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
              Télécharger PDF
            </button>
          </div>
        </div>
      </div>
    </div>,
    container,
  );
}

function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center text-slate-400">
      <span className="mb-3 opacity-40">{icon}</span>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-1 max-w-sm text-[12px] text-slate-400">{hint}</p>
    </div>
  );
}