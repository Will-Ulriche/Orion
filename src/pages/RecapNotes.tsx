import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import { GraduationCap, Layers, Search, Users, Trophy } from 'lucide-react';
import {
  Avatar, Badge, EmptyState, Field, Kpi, Loader, SearchInput, Select,
  TableShell, Td, Th, cx,
} from '../components/ui';

// ─── Types ──────────────────────────────────────────────────

interface ClassItem { id: string; name: string; level: string | null; student_count: number; }
interface GradingPeriod { id: string; name: string; period_order: number; }
interface ClassSubject {
  id: string; class_id: string; subject_id: string;
  subject_name: string | null; subject_code: string | null;
}

interface RecapSubjectColumn {
  class_subject_id: string; subject_name: string; subject_code: string; coefficient: number;
}
interface RecapStudentRow {
  enrollment_id: string; student_id: string;
  first_name: string; last_name: string; matricule: string | null;
  averages: Record<string, number | null>;
  general_average: number | null;
  rank: number;
}
interface ClassNotesRecap { subjects: RecapSubjectColumn[]; students: RecapStudentRow[]; }

const ADMIN_ROLES = ['DIRECTION', 'SECRETAIRE', 'SUPER_ADMIN'];

function avgTone(avg: number | null | undefined) {
  if (avg === null || avg === undefined) return 'text-slate-300';
  if (avg >= 14) return 'text-emerald-600';
  if (avg >= 12) return 'text-sky-600';
  if (avg >= 10) return 'text-amber-600';
  return 'text-red-600';
}

const RANK_CHIP: Record<number, string> = {
  1: 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm',
  2: 'bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm',
  3: 'bg-gradient-to-br from-orange-300 to-orange-400 text-white shadow-sm',
};

// ═══════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════

export default function RecapNotes() {
  const { schoolId, roles, rolesLoaded, user } = useAuth();
  const { selectedYear } = useYear();
  const yearId = selectedYear?.id ?? '';

  const isTeacherOnly = rolesLoaded && roles.includes('PROFESSEUR') && !roles.some(r => ADMIN_ROLES.includes(r));
  const [staffId, setStaffId] = useState<string | null>(null);
  const [scopeReady, setScopeReady] = useState(false);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [periods, setPeriods] = useState<GradingPeriod[]>([]);
  const [recap, setRecap] = useState<ClassNotesRecap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [selClass, setSelClass] = useState('');
  const [selPeriod, setSelPeriod] = useState('');

  // Résolution de la fiche professeur (restriction aux classes/matières attribuées)
  useEffect(() => {
    if (!isTeacherOnly) { setScopeReady(true); return; }
    if (!user?.id) return;
    let cancelled = false;
    invoke<string | null>('get_current_staff_id', { userId: user.id, schoolId })
      .then(id => { if (!cancelled) setStaffId(id ?? null); })
      .catch(() => { if (!cancelled) setStaffId(null); })
      .finally(() => { if (!cancelled) setScopeReady(true); });
    return () => { cancelled = true; };
  }, [isTeacherOnly, user?.id, schoolId]);

  // Chargement des classes (filtrées pour un professeur)
  useEffect(() => {
    if (!yearId) return;
    if (isTeacherOnly && !scopeReady) return;
    Promise.all([
      invoke<ClassItem[]>('get_classes', { schoolId, academicYearId: yearId }),
      isTeacherOnly && staffId
        ? invoke<ClassSubject[]>('get_teacher_class_subjects', { schoolId, academicYearId: yearId, teacherId: staffId })
        : Promise.resolve<ClassSubject[]>([]),
    ]).then(([c, ts]) => {
      if (isTeacherOnly) {
        const allowed = new Set(ts.map(t => t.class_id));
        setClasses(c.filter(x => allowed.has(x.id)));
      } else {
        setClasses(c);
      }
    }).catch((e: any) => setError(String(e)));
  }, [schoolId, yearId, isTeacherOnly, staffId, scopeReady]);

  // Périodes de la classe sélectionnée
  useEffect(() => {
    if (!selClass || !yearId) { setPeriods([]); return; }
    invoke<GradingPeriod[]>('get_grading_periods', { schoolId, academicYearId: yearId, classId: selClass })
      .then(setPeriods);
  }, [selClass, schoolId, yearId]);

  // Récap des notes
  useEffect(() => {
    if (!selClass || !selPeriod || !yearId) { setRecap(null); return; }
    setLoading(true);
    setError('');
    invoke<ClassNotesRecap>('get_class_notes_recap', {
      schoolId, academicYearId: yearId, classId: selClass, gradingPeriodId: selPeriod,
      teacherId: isTeacherOnly ? staffId : null,
    })
      .then(setRecap)
      .catch((e: any) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [selClass, selPeriod, schoolId, yearId, isTeacherOnly, staffId]);

  const selectedClassName = classes.find(c => c.id === selClass)?.name ?? '';
  const selectedPeriodName = periods.find(p => p.id === selPeriod)?.name ?? '';

  const filteredStudents = useMemo(() => {
    if (!recap) return [];
    const q = search.trim().toLowerCase();
    if (!q) return recap.students;
    return recap.students.filter(s =>
      `${s.last_name} ${s.first_name} ${s.matricule ?? ''}`.toLowerCase().includes(q)
    );
  }, [recap, search]);

  const classAverage = useMemo(() => {
    const values = (recap?.students ?? [])
      .map(s => s.general_average)
      .filter((v): v is number => v !== null && v !== undefined);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }, [recap]);

  const ready = Boolean(selClass && selPeriod);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-4 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-brand">
              <GraduationCap size={21} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800">Récap des notes</h1>
              <p className="text-[13px] text-slate-500">
                {isTeacherOnly
                  ? 'Moyennes de vos élèves dans vos matières'
                  : 'Liste des élèves avec leurs notes dans toutes les matières'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-4 lg:px-8">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Classe" className="w-full sm:w-56">
            <Select
              value={selClass}
              onChange={(e) => { setSelClass(e.target.value); setSelPeriod(''); setRecap(null); }}
            >
              <option value="">-- Choisir une classe --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Période" className="w-full sm:w-56">
            <Select
              value={selPeriod}
              onChange={(e) => setSelPeriod(e.target.value)}
              disabled={!selClass}
            >
              {!selClass ? (
                <option value="">-- Sélectionnez d'abord une classe --</option>
              ) : periods.length === 0 ? (
                <option value="">-- Aucune période pour cette classe --</option>
              ) : (
                <option value="">-- Choisir une période --</option>
              )}
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un élève…"
            className="w-full sm:w-64 sm:ml-auto"
          />
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-8">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
        )}

        {!yearId ? (
          <EmptyState
            icon={Layers}
            title="Aucune année scolaire sélectionnée"
            description="Choisissez une année scolaire dans la barre latérale pour consulter le récap des notes."
          />
        ) : !scopeReady && isTeacherOnly ? (
          <Loader label="Chargement de vos affectations…" />
        ) : !ready ? (
          <EmptyState
            icon={Trophy}
            title="Sélectionnez une classe et une période"
            description="Le récapitulatif des moyennes de chaque élève s'affichera ici."
          />
        ) : loading ? (
          <Loader label="Calcul du récap des notes…" />
        ) : !recap || recap.students.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aucun élève inscrit"
            description="Cette classe ne contient aucun élève actif pour l'année en cours."
          />
        ) : recap.subjects.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Aucune matière"
            description="Aucune matière n'est affectée à cette classe (ou à votre profil) pour cette année."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi icon={Users} label="Élèves" value={recap.students.length} tone="blue" />
              <Kpi icon={Layers} label="Matières" value={recap.subjects.length} tone="violet" />
              <Kpi
                icon={Trophy}
                label="Moyenne de la classe"
                value={classAverage !== null ? `${classAverage.toFixed(2)}/20` : '—'}
                tone="emerald"
              />
              <Kpi
                icon={GraduationCap}
                label="Meilleure moyenne"
                value={recap.students[0]?.general_average?.toFixed(2) ?? '—'}
                tone="brand"
              />
            </div>

            <p className="text-[12px] text-slate-500">
              <span className="font-semibold text-slate-700">{selectedClassName}</span>
              <span className="text-slate-300"> · </span>
              {selectedPeriodName}
              <span className="text-slate-300"> · </span>
              {recap.students.length} élève(s)
            </p>

            <TableShell>
              <div className="custom-scrollbar max-h-[65vh] overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-20 w-12 bg-slate-50 px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">#</th>
                      <th className="sticky left-12 top-0 z-20 min-w-[220px] bg-slate-50 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Élève</th>
                      {recap.subjects.map((sub) => (
                        <Th key={sub.class_subject_id} className="min-w-[76px] text-center">
                          <span
                            className="inline-flex items-center"
                            title={`${sub.subject_name} (coef. ${sub.coefficient})`}
                          >
                            <span className="font-bold">{sub.subject_code || sub.subject_name.slice(0, 4).toUpperCase()}</span>
                            <span className="ml-1 text-[10px] font-normal text-slate-400">×{sub.coefficient}</span>
                          </span>
                        </Th>
                      ))}
                      <Th className="min-w-[110px] text-center">Moyenne</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s) => {
                      const name = `${s.last_name} ${s.first_name}`.trim();
                      return (
                        <tr key={s.enrollment_id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                          <td className="sticky left-0 z-10 w-12 bg-white px-4 py-2.5 text-center">
                            <span
                              className={cx(
                                'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums',
                                RANK_CHIP[s.rank] ?? 'bg-slate-100 text-slate-500'
                              )}
                            >
                              {s.rank}
                            </span>
                          </td>
                          <td className="sticky left-12 z-10 bg-white px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={name || '?'} size={30} />
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-slate-700">{name || 'Élève sans nom'}</p>
                                {s.matricule && <p className="text-[11px] tabular-nums text-slate-400">#{s.matricule}</p>}
                              </div>
                            </div>
                          </td>
                          {recap.subjects.map((sub) => {
                            const avg = s.averages[sub.class_subject_id];
                            return (
                              <Td key={sub.class_subject_id} className="text-center">
                                {avg === null || avg === undefined ? (
                                  <span className="text-slate-300">—</span>
                                ) : (
                                  <span className={cx('text-[13px] font-semibold tabular-nums', avgTone(avg))}>
                                    {avg.toFixed(2)}
                                  </span>
                                )}
                              </Td>
                            );
                          })}
                          <Td className="text-center">
                            {s.general_average === null || s.general_average === undefined ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              <Badge tone={s.general_average >= 10 ? 'emerald' : 'red'} className="px-2.5 py-1 text-[13px] font-bold tabular-nums">
                                {s.general_average.toFixed(2)}
                              </Badge>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TableShell>

            {filteredStudents.length === 0 && (
              <p className="py-6 text-center text-[13px] text-slate-400">
                Aucun élève ne correspond à « {search} ».
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
