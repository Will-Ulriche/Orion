import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { ClipboardList, Download, LoaderCircle, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  buildBulletinPdf, bulletinFileName, appreciationFor,
  type BulletinData, type BulletinSubjectRow,
} from '../lib/bulletinPdf';
import type { ReceiptSchoolInfo } from '../lib/receiptPdf';

const deaccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Zoom de l'aperçu : 30 % → 300 %, par pas de 10 %. */
const clampZoom = (z: number) => Math.min(3, Math.max(0.3, Math.round(z * 100) / 100));

/** Ligne d'inscription d'Archives (get_students). */
export interface BulletinStudentRow {
  /** id d'inscription (enrollments.id) — attendu par get_student_averages. */
  id: string;
  student_id: string;
  class_id: string | null;
  class_name: string | null;
  first_name: string | null;
  last_name: string | null;
  matricule: string | null;
}

/** Classe d'Archives (pour le titulaire de la fiche). */
export interface BulletinClassRow {
  id: string;
  name: string;
  homeroom_teacher_name: string | null;
}

interface BulletinModalProps {
  students: BulletinStudentRow[];
  classes: BulletinClassRow[];
  school: ReceiptSchoolInfo;
  schoolId: string;
  yearId: string;
  yearName: string;
  groupLabel: string;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}

const PERIOD_LABELS = ['T1', 'T2', 'T3'] as const;

/** Notes i/d/c d'un élève dans une matière (mêmes règles que la liste de notes). */
interface TypeAverages {
  i: number[]; d: number[]; c: number[];
}

const avg = (arr: number[]): number | null =>
  arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

export default function BulletinModal({
  students, classes, school, schoolId, yearId, yearName, groupLabel, onClose, onError, onSuccess,
}: BulletinModalProps) {
  const [query, setQuery] = useState('');
  // Une seule classe à la fois ; l'élève se choisit dans la liste déroulante.
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  // Un seul trimestre à la fois (1 | 2 | 3).
  const [periodOrder, setPeriodOrder] = useState(1);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [zoom, setZoom] = useState(1);

  // ── Classes de l'onglet (une seule sélectionnable) ─────────────────────────
  const grouped = useMemo(() => {
    const q = deaccent(query.trim()).toLowerCase();
    const match = (r: BulletinStudentRow) =>
      !q || deaccent(`${r.last_name ?? ''} ${r.first_name ?? ''} ${r.matricule ?? ''} ${r.class_name ?? ''}`)
        .toLowerCase().includes(q);
    const byClass = new Map<string, BulletinStudentRow[]>();
    for (const row of students) {
      if (!match(row)) continue;
      const key = row.class_name ?? 'Sans classe';
      const list = byClass.get(key);
      if (list) list.push(row);
      else byClass.set(key, [row]);
    }
    return [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([cls, rows]) => [cls, [...rows].sort((a, b) =>
        (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr')
        || (a.first_name ?? '').localeCompare(b.first_name ?? '', 'fr'))] as const);
  }, [students, query]);

  const classRows = useMemo(
    () => grouped.find(([cls]) => cls === activeClass)?.[1] ?? [],
    [grouped, activeClass],
  );

  const pickClass = (cls: string, rows: BulletinStudentRow[]) => {
    setActiveClass(cls);
    setSelectedStudentId(rows[0]?.student_id ?? null);
  };

  const activeClassVisible = activeClass !== null && grouped.some(([cls]) => cls === activeClass);

  // La recherche peut masquer la classe active : on repart d'une sélection vide.
  useEffect(() => {
    if (activeClass !== null && !activeClassVisible) {
      setActiveClass(null);
      setSelectedStudentId(null);
    }
  }, [activeClass, activeClassVisible]);

  const selectedRow = useMemo(
    () => students.find(s => s.student_id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );


  // ── Chargement des données réelles du bulletin ─────────────────────────────
  const cacheRef = useRef(new Map<string, BulletinData>());
  const [bulletin, setBulletin] = useState<BulletinData | null>(null);
  const [loading, setLoading] = useState(false);

  const cacheKey = selectedRow ? `${selectedRow.student_id}:${periodOrder}` : '';

  useEffect(() => {
    if (!selectedRow || !selectedRow.class_id) {
      setBulletin(null);
      return;
    }
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setBulletin(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const classId = selectedRow.class_id!;
        // Période du trimestre choisi (un seul à la fois).
        const periods = await invoke<{ id: string; period_order: number }[]>('get_grading_periods', {
          schoolId, academicYearId: yearId, classId,
        });
        const period = periods.find(p => p.period_order === periodOrder);
        if (!period) {
          if (!cancelled) {
            setBulletin(null);
            setLoading(false);
            onError(`Aucune période « ${PERIOD_LABELS[periodOrder - 1]} » configurée pour cette classe.`);
          }
          return;
        }
        const [classSubjects, rankings] = await Promise.all([
          invoke<{ id: string; subject_name: string; coefficient: number }[]>('get_class_subjects', {
            schoolId, academicYearId: yearId, classId,
          }),
          invoke<{
            rank: number; student_id: string; general_average: number | null; appreciation: string;
          }[]>('get_class_rankings', {
            schoolId, academicYearId: yearId, classId, gradingPeriodId: period.id,
          }).catch(() => []),
        ]);
        // ── Règle du bulletin :
        //  • une note absente vaut 0 ;
        //  • moyenne d'une matière = (interro + devoir + compo) ÷ 3 ;
        //  • moyenne trimestrielle = Σ (moyenne matière × coef) ÷ Σ coefs.
        const subjectsRows: BulletinSubjectRow[] = [];
        // Cumul par élève de la classe pour la moyenne générale / le classement.
        const totalByStudent = new Map<string, number>(
          classRows.map(r => [r.student_id, 0]),
        );
        let totalCoefs = 0;

        for (const cs of classSubjects) {
          const grades = await invoke<{
            student_id: string; score: number; max_score: number; grade_type_name: string;
          }[]>('get_grades_by_class', {
            schoolId, academicYearId: yearId,
            classSubjectId: cs.id, gradingPeriodId: period.id,
          });
          const byStudent = new Map<string, TypeAverages>();
          for (const g of grades) {
            let entry = byStudent.get(g.student_id);
            if (!entry) { entry = { i: [], d: [], c: [] }; byStudent.set(g.student_id, entry); }
            const scoreOn20 = g.max_score > 0 ? (g.score / g.max_score) * 20 : 0;
            const gName = (g.grade_type_name || '').toLowerCase();
            if (gName.includes('devoir')) entry.d.push(scoreOn20);
            else if (gName.includes('compo')) entry.c.push(scoreOn20);
            else entry.i.push(scoreOn20);
          }
          // Moyenne matière par élève : note absente = 0.
          const meanOf = (t: TypeAverages | undefined): number =>
            t ? ((avg(t.i) ?? 0) + (avg(t.d) ?? 0) + (avg(t.c) ?? 0)) / 3 : 0;

          totalCoefs += cs.coefficient;
          for (const row of classRows) {
            const m = meanOf(byStudent.get(row.student_id));
            totalByStudent.set(row.student_id, (totalByStudent.get(row.student_id) ?? 0) + m * cs.coefficient);
          }

          // Rang dans la matière : classement sur ces mêmes moyennes.
          const means = classRows.map(row => ({
            id: row.student_id, mean: meanOf(byStudent.get(row.student_id)),
          }));
          const sorted = [...means].sort((a, b) => b.mean - a.mean);
          const rankIdx = sorted.findIndex(m => m.id === selectedRow.student_id);
          const own = byStudent.get(selectedRow.student_id);

          subjectsRows.push({
            name: cs.subject_name,
            coefficient: cs.coefficient,
            interro: own ? avg(own.i) : 0,
            devoir: own ? avg(own.d) : 0,
            compo: own ? avg(own.c) : 0,
            average: meanOf(own),
            rank: rankIdx >= 0 ? rankIdx + 1 : null,
            // Appréciation automatique selon la moyenne de la matière (barème officiel).
            appreciation: appreciationFor(meanOf(own)),
          });
        }

        // Moyenne générale / classement de la classe (même règle).
        const generalMeans = classRows.map(row => ({
          id: row.student_id,
          mean: totalCoefs > 0 ? (totalByStudent.get(row.student_id) ?? 0) / totalCoefs : 0,
        }));
        const generalSorted = [...generalMeans].sort((a, b) => b.mean - a.mean);
        const ownIdx = generalSorted.findIndex(m => m.id === selectedRow.student_id);
        const generalAvgs = generalMeans.map(m => m.mean);
        const ownRanking = rankings.find(r => r.student_id === selectedRow.student_id);
        const homeroom = classes.find(c => c.id === classId)?.homeroom_teacher_name ?? null;

        const data: BulletinData = {
          studentFirstName: selectedRow.first_name,
          studentLastName: selectedRow.last_name,
          matricule: selectedRow.matricule,
          className: selectedRow.class_name,
          periodOrder,
          yearName,
          subjects: subjectsRows,
          generalAverage: ownIdx >= 0 ? generalSorted[ownIdx].mean : null,
          rank: ownIdx >= 0 ? ownIdx + 1 : null,
          classSize: classRows.length,
          classAverage: generalAvgs.length > 0
            ? generalAvgs.reduce((a, b) => a + b, 0) / generalAvgs.length : null,
          bestAverage: generalAvgs.length > 0 ? Math.max(...generalAvgs) : null,
          worstAverage: generalAvgs.length > 0 ? Math.min(...generalAvgs) : null,
          // Appréciation globale : texte du conseil s'il existe, sinon le barème.
          globalAppreciation: (ownRanking?.appreciation ?? '').trim()
            || appreciationFor(ownIdx >= 0 ? generalSorted[ownIdx].mean : null),
          homeroomTeacher: homeroom,
        };
        cacheRef.current.set(cacheKey, data);
        if (!cancelled) setBulletin(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) onError(`Impossible de charger le bulletin : ${String(e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, schoolId, yearId]);


  // ── Aperçu : le PDF réel (mêmes octets que le fichier téléchargé) ──────────
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

    if (!bulletin) {
      revokePreviewUrl();
      setPdfBlob(null);
      setBlobUrl(null);
      setPreviewing(false);
      return;
    }

    let cancelled = false;
    setPreviewing(true);
    // Court délai : React peint le spinner avant le build jsPDF synchrone.
    const timer = setTimeout(() => {
      if (cancelled) return;
      try {
        const doc = buildBulletinPdf({ bulletin, school });
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
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bulletin, school, onError]);

  // Dernière URL de l'aperçu : révoquée au démontage du modal.
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

  // ── Téléchargement : réutilise les octets de l'aperçu ──────────────────────
  const handleDownload = () => {
    if (!pdfBlob || !bulletin) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = bulletinFileName([bulletin], yearName);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        const name = [bulletin.studentLastName, bulletin.studentFirstName].filter(Boolean).join(' ');
        onSuccess?.(
          `Bulletin ${PERIOD_LABELS[bulletin.periodOrder - 1]} de ${name || 'l’élève'} exporté.`,
        );
      } catch (e) {
        onError(`Impossible de générer le PDF : ${String(e)}`);
      } finally {
        setBusy(false);
      }
    }, 50);
  };


  const container = useMemo(() => document.querySelector('main') ?? document.body, []);

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulletin de notes"
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in"
      >
        {/* ── En-tête : titre + trimestre (un seul) + fermeture ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <ClipboardList size={16} />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">Bulletin de notes</h3>
              <p className="text-[11px] text-slate-400">
                Aperçu avant impression · A4 portrait · {groupLabel} · {yearName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* ── Sélecteur de trimestre : un seul à la fois ── */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {PERIOD_LABELS.map((label, i) => {
                const order = i + 1;
                const on = periodOrder === order;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setPeriodOrder(order)}
                    aria-pressed={on}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                      on ? 'bg-white text-[#800020] shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>
        </div>


        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* ── Panneau : liste déroulante élève + classes (sélection unique) ── */}
          <aside className="flex max-h-56 w-full flex-shrink-0 flex-col border-b border-slate-200 bg-slate-50 md:max-h-none md:w-80 md:border-b-0 md:border-r">
            <div className="flex-shrink-0 space-y-2.5 border-b border-slate-200/70 p-3">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Rechercher une classe…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-8 text-[12.5px] text-slate-700 outline-none transition-all placeholder:text-slate-300 hover:border-slate-300 focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/15"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label="Effacer la recherche"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 transition-colors hover:text-slate-500"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* ── Liste déroulante : élève de la classe choisie ── */}
              <div>
                <label
                  htmlFor="bulletin-student-select"
                  className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-slate-400"
                >
                  Élève de la classe
                </label>
                <select
                  id="bulletin-student-select"
                  value={selectedStudentId ?? ''}
                  onChange={e => setSelectedStudentId(e.target.value || null)}
                  disabled={!activeClass || classRows.length === 0}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-700 outline-none transition-all hover:border-slate-300 focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">
                    {!activeClass
                      ? 'Sélectionnez une classe…'
                      : classRows.length === 0
                        ? 'Aucun élève dans cette classe'
                        : 'Choisir un élève…'}
                  </option>
                  {classRows.map(r => (
                    <option key={r.student_id} value={r.student_id}>
                      {[r.last_name, r.first_name].filter(Boolean).join(' ') || '—'}
                      {r.matricule ? ` (${r.matricule})` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {activeClass
                    ? `${activeClass} · ${classRows.length} élève${classRows.length > 1 ? 's' : ''}`
                    : `${grouped.length} classe${grouped.length > 1 ? 's' : ''} · ${students.length} élève${students.length > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            {/* ── Liste des classes : une seule sélection à la fois ── */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {grouped.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-slate-400">
                  {students.length === 0 ? 'Aucune classe dans cet onglet.' : 'Aucune classe ne correspond.'}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {grouped.map(([cls, rows]) => {
                    const on = activeClass === cls;
                    return (
                      <li key={cls}>
                        <button
                          onClick={() => pickClass(cls, rows)}
                          aria-pressed={on}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                            on ? 'bg-[#800020]/10 ring-1 ring-[#800020]/25' : 'hover:bg-slate-100'
                          }`}
                        >
                          {/* Pastille radio : jamais deux classes actives */}
                          <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                            on ? 'border-[#800020]' : 'border-slate-300 bg-white'
                          }`}>
                            {on && <span className="h-2 w-2 rounded-full bg-[#800020]" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-semibold text-slate-700">
                              {cls}
                            </span>
                            <span className="block text-[10.5px] text-slate-400">
                              {rows.length} élève{rows.length > 1 ? 's' : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>


          {/* ── Aperçu ── */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <ClipboardList size={13} className="flex-shrink-0 text-slate-400" />
                <p className="truncate text-[12px] font-semibold text-slate-600">
                  {!selectedStudentId
                    ? 'Aucun élève sélectionné'
                    : loading
                      ? 'Chargement du bulletin…'
                      : bulletin
                        ? `Bulletin ${PERIOD_LABELS[bulletin.periodOrder - 1]} de ${[bulletin.studentLastName, bulletin.studentFirstName].filter(Boolean).join(' ') || 'l’élève'}`
                        : 'Aucune donnée pour ce trimestre'}
                </p>
              </div>

              {/* ── Zoom de l'aperçu ── */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom(z => clampZoom(z - 0.1))}
                  disabled={zoom <= 0.3}
                  aria-label="Dézoomer"
                  title="Dézoomer"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ZoomOut size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  aria-label="Réinitialiser le zoom à 100 %"
                  title="Réinitialiser à 100 %"
                  className="min-w-[3.1rem] rounded-lg px-1.5 py-1 text-[11px] font-semibold tabular-nums text-slate-600 transition-colors hover:bg-slate-100"
                >
                  {Math.round(zoom * 100)} %
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(z => clampZoom(z + 0.1))}
                  disabled={zoom >= 3}
                  aria-label="Zoomer"
                  title="Zoomer"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ZoomIn size={13} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden bg-slate-200 p-4 relative">
              {(previewing || (loading && !!selectedStudentId)) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-200/50 backdrop-blur-sm text-slate-600">
                  <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin" />
                  <p className="text-sm font-medium">
                    {loading ? 'Chargement des notes…' : 'Génération de l’aperçu…'}
                  </p>
                </div>
              )}
              {students.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList size={38} strokeWidth={1} />}
                  title="Aucun élève enregistré"
                  hint="Inscrivez d'abord des élèves dans cet onglet pour générer leurs bulletins."
                />
              ) : !activeClass || !selectedStudentId ? (
                <EmptyState
                  icon={<ClipboardList size={38} strokeWidth={1} />}
                  title="Sélectionnez une classe"
                  hint="Choisissez une classe dans la liste de gauche, puis un élève dans la liste déroulante pour afficher son bulletin."
                />
              ) : blobUrl ? (
                <div className="h-full overflow-hidden rounded-xl bg-slate-200">
                  <iframe
                    src={`${blobUrl}#view=FitH`}
                    // CSS `zoom` : 100 % remplit le cadre, seul le contenu grossit.
                    style={{ zoom: `${zoom}` }}
                    className="h-full w-full border-0"
                    title="Aperçu du bulletin de notes"
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
            Format <strong className="text-slate-500">A4 portrait</strong> — un bulletin par élève et par trimestre, année {yearName}.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!bulletin || busy || previewing || loading || !pdfBlob}
              className="flex items-center gap-1.5 rounded-lg bg-[#800020] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#6b001b] disabled:cursor-not-allowed disabled:opacity-50"
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
