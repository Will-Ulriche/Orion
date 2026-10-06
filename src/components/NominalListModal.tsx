import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle, Download, GraduationCap,
  LoaderCircle, Search, Users, X,
} from 'lucide-react';
import {
  buildNominalListData, nominalListFileName,
  type NominalListClassInput,
} from '../lib/nominalListTemplate';
import {
  buildNominalListPdf, loadNominalListAssets,
  type NominalListAssets,
} from '../lib/nominalListPdf';

interface NominalListModalProps {
  /** Classes de l'onglet courant (Collège), déjà filtrées par l'établissement. */
  classes: NominalListClassInput[];
  groupLabel: string;
  yearName: string;
  documentType?: 'nominative' | 'notes';
  schoolId?: string;
  yearId?: string;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}


const deaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function NominalListModal({
  classes, groupLabel, yearName, documentType, schoolId, yearId, onClose, onError, onSuccess,
}: NominalListModalProps) {
  const isNotes = documentType === 'notes';
  const titleStr = isNotes ? 'Liste de notes' : 'Liste nominative de la classe';
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assets, setAssets] = useState<NominalListAssets | null>(null);
  const [busy, setBusy] = useState(false);

  // Real data states for 'notes'
  const [selSubject, setSelSubject] = useState<string>('');
  const [selPeriods, setSelPeriods] = useState<number[]>([1]);

  const [subjects, setSubjects] = useState<{id: string, name: string}[]>([]);
  const [realGrades, setRealGrades] = useState<Record<string, any>>({});

  useEffect(() => {
    if (isNotes && schoolId) {
      invoke<{id: string, name: string}[]>('get_subjects', { schoolId })
        .then(subs => {
          setSubjects(subs);
          if (subs.length > 0 && !selSubject) setSelSubject(subs[0].id);
        })
        .catch(console.error);
    }
  }, [isNotes, schoolId, selSubject]);

  const togglePeriod = useCallback((p: number) => {
    setSelPeriods(prev => {
      if (prev.includes(p)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter(x => x !== p);
      }
      return [...prev, p];
    });
  }, []);

  const frameRef = useRef<HTMLIFrameElement>(null);

  // ── Images du modèle (logo, QR, filigrane) ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadNominalListAssets()
      .then(a => { if (!cancelled) setAssets(a); })
      .catch(e => onError(`Aperçu impossible : ${String(e)}`));
    return () => { cancelled = true; };
  }, [onError]);

  // ── Recherche sur le nom de la classe ─────────────────────────────────────
  const filtered = useMemo(() => {
    const q = deaccent(query).trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(c => deaccent(c.name).toLowerCase().includes(q));
  }, [classes, query]);

  // ── Sélection ─────────────────────────────────────────────────────────────
  // On conserve l'ordre des classes de l'onglet : le PDF suit cet ordre.
  const selectedClasses = useMemo(
    () => classes.filter(c => selected.has(c.id)),
    [classes, selected],
  );

  const data = useMemo(() => buildNominalListData(selectedClasses), [selectedClasses]);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));

  const toggleAll = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev);
      if (filtered.every(c => next.has(c.id))) filtered.forEach(c => next.delete(c.id));
      else filtered.forEach(c => next.add(c.id));
      return next;
    });
  }, [filtered]);

  const selectAll = useCallback(() => setSelected(new Set(classes.map(c => c.id))), [classes]);
  const clearAll = useCallback(() => setSelected(new Set()), []);

  useEffect(() => {
    if (!isNotes || !schoolId || !yearId || !selSubject || selectedClasses.length === 0) return;
    
    let cancelled = false;
    setBusy(true);

    async function loadGrades() {
      try {
        const gradesMap: Record<string, Record<string, any>> = {};

        for (const cls of selectedClasses) {
          const periods = await invoke<any[]>('get_grading_periods', { schoolId, academicYearId: yearId, classId: cls.id });
          const classSubjects = await invoke<any[]>('get_class_subjects', { schoolId, academicYearId: yearId, classId: cls.id });
          const cs = classSubjects.find((cs: any) => cs.subject_id === selSubject);
          if (!cs) continue;
          
          for (const periodNum of selPeriods) {
            const period = periods.find((p: any) => p.period_order === periodNum);
            if (!period) continue;
            
            const grades = await invoke<any[]>('get_grades_by_class', { 
              schoolId, 
              academicYearId: yearId, 
              classSubjectId: cs.id, 
              gradingPeriodId: period.id 
            });
            
            for (const g of grades) {
              if (!gradesMap[g.student_id]) gradesMap[g.student_id] = {};
              if (!gradesMap[g.student_id][periodNum]) gradesMap[g.student_id][periodNum] = { i: [], d: [], c: [], mg: null };
              
              const gName = (g.grade_type_name || '').toLowerCase();
              const scoreOn20 = (g.score / g.max_score) * 20;
              
              if (gName.includes('interro')) {
                 gradesMap[g.student_id][periodNum].i.push(scoreOn20);
              } else if (gName.includes('devoir') || gName.includes('d')) {
                 gradesMap[g.student_id][periodNum].d.push(scoreOn20);
              } else if (gName.includes('compo') || gName.includes('c')) {
                 gradesMap[g.student_id][periodNum].c.push(scoreOn20);
              } else {
                 gradesMap[g.student_id][periodNum].i.push(scoreOn20);
              }
            }
          }
        }
        
        for (const sId in gradesMap) {
          for (const pNum in gradesMap[sId]) {
            const pData = gradesMap[sId][pNum];
            const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
            const iAvg = avg(pData.i);
            const dAvg = avg(pData.d);
            const cAvg = avg(pData.c);
            
            const formatGrade = (val: number) => {
              const str = val.toFixed(2).replace('.', ',');
              return val < 10 ? `0${str}` : str;
            };
            
            pData.i = formatGrade(iAvg);
            pData.d = formatGrade(dAvg);
            pData.c = formatGrade(cAvg);
            
            pData.mg = formatGrade((iAvg + dAvg + cAvg) / 3);
          }
        }
        
        if (!cancelled) {
          setRealGrades(gradesMap);
          setBusy(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setBusy(false);
        }
      }
    }
    
    loadGrades();
    return () => { cancelled = true; };
  }, [isNotes, schoolId, yearId, selSubject, selPeriods, selectedClasses]);

  const docOptions = useMemo(() => {
    if (!assets || data.length === 0) return null;
    
    // Inject real grades if it's "notes"
    const finalData = isNotes ? data.map(cls => ({
      ...cls,
      rows: cls.rows.map(r => {
        const periodGrades: Record<number, any> = {};
        selPeriods.forEach(p => {
          if (realGrades[r.studentId] && realGrades[r.studentId][p]) {
            periodGrades[p] = realGrades[r.studentId][p];
          } else {
            periodGrades[p] = { i: '00,00', d: '00,00', c: '00,00', mg: '00,00' };
          }
        });
        return { ...r, periodGrades };
      })
    })) : data;

    const selSubj = isNotes ? subjects.find(s => s.id === selSubject) : undefined;
    return { pages: finalData, assets, groupLabel, documentType, subjectName: selSubj?.name };
  }, [assets, data, groupLabel, documentType, isNotes, selPeriods, selSubject, subjects, realGrades]);

  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!docOptions) {
      setBlobUrl(null);
      return;
    }
    try {
      const doc = buildNominalListPdf(docOptions);
      const url = URL.createObjectURL(doc.output('blob'));
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setBlobUrl(null);
    }
  }, [docOptions]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!docOptions) return;
    setBusy(true);
    try {
      const fileName = nominalListFileName(data, groupLabel, yearName, documentType);
      buildNominalListPdf(docOptions).save(fileName);
      const students = data.reduce((sum, c) => sum + c.rows.length, 0);
      onSuccess?.(
        data.length === 1
          ? `${data[0].name} — ${students} élève(s) exporté(s).`
          : `${data.length} classes — ${students} élève(s) exporté(s).`,
      );
    } catch (e) {
      onError(`Impossible de générer le PDF : ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const container = useMemo(() => document.querySelector('main') ?? document.body, []);
  const totalStudents = data.reduce((sum, c) => sum + c.rows.length, 0);

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titleStr}
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in"
      >
        {/* ── En-tête ── */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <GraduationCap size={16} />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">{titleStr}</h3>
              <p className="text-[11px] text-slate-400">
                Aperçu avant impression · A4 paysage · {groupLabel} · {yearName}
              </p>
            </div>
          </div>
          {isNotes && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-[10px] text-slate-400">
                {Object.keys(realGrades).length} élèves notés
              </span>
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                {[1, 2, 3].map(p => (
                  <button
                    key={p}
                    onClick={() => togglePeriod(p)}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                      selPeriods.includes(p) 
                        ? 'bg-white text-indigo-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                    }`}
                  >
                    T{p}
                  </button>
                ))}
              </div>
              <select
                value={selSubject}
                onChange={e => setSelSubject(e.target.value)}
                className="h-8 rounded-lg border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              >
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* ── Panneau de sélection des classes ── */}
          <aside className="flex max-h-56 w-full flex-shrink-0 flex-col border-b border-slate-200 bg-slate-50 md:max-h-none md:w-72 md:border-b-0 md:border-r">
            <div className="flex-shrink-0 space-y-2.5 border-b border-slate-200/70 p-3">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Rechercher une classe…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-8 text-[12.5px] text-slate-700 outline-none transition-all placeholder:text-slate-300 hover:border-slate-300 focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15"
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

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#4f46e5] transition-colors hover:text-[#4338ca]"
                >
                  <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors ${
                    allFilteredSelected ? 'border-[#4f46e5] bg-[#4f46e5] text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {allFilteredSelected && <CheckMark />}
                  </span>
                  {allFilteredSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                <span className="text-[11px] text-slate-400">
                  {filtered.length} / {classes.length}
                </span>
              </div>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-slate-400">
                  Aucune classe ne correspond.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map(c => {
                    const on = selected.has(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => toggle(c.id)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                            on ? 'bg-[#4f46e5]/10 ring-1 ring-[#4f46e5]/25' : 'hover:bg-slate-100'
                          }`}
                        >
                          <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                            on ? 'border-[#4f46e5] bg-[#4f46e5] text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {on && <CheckMark />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-semibold text-slate-700">
                              {c.name}
                            </span>
                            <span className="block text-[10.5px] text-slate-400">
                              {c.students.length} élève{c.students.length > 1 ? 's' : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {classes.length > 0 && (
              <div className="flex flex-shrink-0 gap-2 border-t border-slate-200/70 p-3">
                <button
                  onClick={selectAll}
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Toutes
                </button>
                <button
                  onClick={clearAll}
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Aucune
                </button>
              </div>
            )}
          </aside>

          {/* ── Aperçu ── */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Users size={13} className="flex-shrink-0 text-slate-400" />
                <p className="truncate text-[12px] font-semibold text-slate-600">
                  {data.length === 0
                    ? 'Aucune classe sélectionnée'
                    : `${data.length} classe${data.length > 1 ? 's' : ''} · ${totalStudents} élève${totalStudents > 1 ? 's' : ''}`}
                </p>
              </div>

            </div>

            {isNotes && Object.keys(realGrades).length === 0 && selectedClasses.length > 0 && !busy && (
              <div className="mx-4 mt-4 rounded-lg bg-amber-50 p-3 border border-amber-200 flex items-start gap-3">
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">Aucune note trouvée</p>
                  <p>Aucune note n'a été trouvée pour la matière et le(s) trimestre(s) sélectionnés.</p>
                  <ul className="list-disc ml-5 mt-1 text-amber-700 opacity-90 text-[13px]">
                    <li>Vérifiez la matière sélectionnée en haut à droite.</li>
                    <li>Vérifiez le(s) trimestre(s) sélectionné(s) (T1, T2, T3).</li>
                    <li>Assurez-vous que les notes ont été saisies pour cette classe.</li>
                  </ul>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden bg-slate-200 p-4">
              {!assets ? (
                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                  <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin opacity-50" />
                  <p className="text-sm">Chargement du modèle…</p>
                </div>
              ) : classes.length === 0 ? (
                <EmptyState
                  icon={<GraduationCap size={38} strokeWidth={1} />}
                  title="Aucune classe enregistrée"
                  hint="Créez d'abord une classe dans cet onglet pour générer sa liste nominative."
                />
              ) : data.length === 0 ? (
                <EmptyState
                  icon={<Users size={38} strokeWidth={1} />}
                  title="Sélectionnez au moins une classe"
                  hint="Cochez une classe à gauche, ou utilisez « Tout sélectionner » pour générer toutes les listes d'un coup."
                />
              ) : blobUrl ? (
                <div className="h-full overflow-hidden rounded-xl bg-white shadow-lg">
                  <iframe
                    ref={frameRef}
                    src={`${blobUrl}#view=FitH`}
                    className="h-full w-full border-0 bg-slate-200"
                    title="Aperçu PDF de la liste nominative"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Pied : récapitulatif + actions ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            {data.some(c => c.rows.length > 27) ? (
              <>
                <AlertTriangle size={12} className="text-amber-500" />
                <span>
                  Une page contient 27 élèves : les classes plus grandes sont réparties sur plusieurs pages.
                </span>
              </>
            ) : (
              <span>
                Format <strong className="text-slate-500">A4 paysage</strong> — une page par classe.
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={data.length === 0 || !assets || busy}
              className="flex items-center gap-1.5 rounded-lg bg-[#4f46e5] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-50"
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

/** Coche de la case à cocher (glyphe unique, sans dépendance supplémentaire). */
function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
      <path d="M2 6.2 4.6 9 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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