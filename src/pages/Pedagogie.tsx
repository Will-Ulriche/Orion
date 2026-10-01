import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import {
  AlertCircle, BookOpen, ChevronDown, ChevronUp, ClipboardList,
  GraduationCap, Loader2, Pencil, Plus, Save, Search, Trash2,
  Trophy, Users, X, CheckCircle2, BarChart3, Star, FileText
} from 'lucide-react';
import { generateClassReport } from '../utils/pdfGenerator';

// ─── Types ──────────────────────────────────────────────────

interface Subject {
  id: string; name: string; code: string; color: string | null;
}
interface ClassItem {
  id: string; name: string; level: string | null; student_count: number;
}
interface ClassSubject {
  id: string; class_id: string; subject_id: string; teacher_id: string | null;
  coefficient: number; subject_name: string | null; subject_code: string | null;
  class_name: string | null; teacher_name: string | null;
}
interface GradingPeriod {
  id: string; name: string; period_order: number;
  start_date: string | null; end_date: string | null; is_active: boolean;
}
interface GradeType {
  id: string; name: string; weight: number; max_score: number;
}
interface Grade {
  id: string; enrollment_id: string; student_id: string;
  class_subject_id: string; grading_period_id: string; grade_type_id: string;
  score: number; max_score: number; is_absent: boolean;
  student_first_name: string | null; student_last_name: string | null;
  subject_name: string | null; grade_type_name: string | null; grade_type_weight: number | null;
}
interface SubjectAverage {
  class_subject_id: string; subject_name: string; subject_code: string;
  coefficient: number; average: number | null; class_average: number | null;
  appreciation: string; grade_count: number;
}
interface StudentAverages {
  student_id: string; enrollment_id: string; first_name: string; last_name: string;
  grading_period_id: string; general_average: number | null;
  rank: number | null; class_size: number; subjects: SubjectAverage[];
}
export interface ClassRankingEntry {
  rank: number; student_id: string; enrollment_id: string;
  first_name: string; last_name: string;
  general_average: number | null; appreciation: string;
}
export interface SubjectStats {
  class_subject_id: string; subject_name: string; subject_code: string;
  grade_count: number; class_average: number | null;
  min_score: number | null; max_score: number | null; success_rate: number;
}
interface StudentRow {
  id: string; student_id: string; class_id: string | null; status: string;
  first_name: string | null; last_name: string | null;
  matricule: string | null; class_name: string | null; class_level: string | null;
}

// ─── Constantes de style ─────────────────────────────────────

const inputClass =
  'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] placeholder:text-slate-400 text-slate-700';
const labelClass = 'block text-[12px] font-semibold text-slate-700 mb-1.5';
const primaryBtn =
  'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold transition-all shadow-[0_4px_14px_0_rgb(79,70,229,0.35)] disabled:opacity-50 disabled:shadow-none';
const ghostBtn =
  'px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors';
const dangerBtn =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors';

const APPRECIATION_COLOR: Record<string, string> = {
  'Excellent':   'text-emerald-600 bg-emerald-50',
  'Bien':        'text-blue-600 bg-blue-50',
  'Assez Bien':  'text-indigo-600 bg-indigo-50',
  'Passable':    'text-amber-600 bg-amber-50',
  'Insuffisant': 'text-red-600 bg-red-50',
};

function avg2color(avg: number | null): string {
  if (avg === null) return 'text-slate-400';
  if (avg >= 15) return 'text-emerald-600 font-bold';
  if (avg >= 12) return 'text-blue-600 font-semibold';
  if (avg >= 10) return 'text-amber-600 font-semibold';
  return 'text-red-600 font-bold';
}

// ─── Composant principal ─────────────────────────────────────

type Tab = 'config' | 'saisie' | 'resultats';

export default function Pedagogie() {
  const { schoolId } = useAuth();
  const { selectedYear } = useYear();
  const [tab, setTab] = useState<Tab>('config');

  return (
    <div className="flex flex-col h-full bg-[#f8f9fe]">
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[#4f46e5] flex items-center justify-center shadow-lg shadow-indigo-200">
            <GraduationCap size={18} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Pédagogie</h1>
        </div>
        <p className="text-sm text-slate-500 ml-12">Matières, notes et résultats scolaires</p>

        {/* Onglets */}
        <div className="flex gap-1 mt-6 bg-white border border-slate-200 rounded-2xl p-1 w-fit shadow-sm">
          {([
            { id: 'config',    label: 'Configuration',  icon: BookOpen },
            { id: 'saisie',    label: 'Saisie des notes', icon: ClipboardList },
            { id: 'resultats', label: 'Résultats',       icon: Trophy },
          ] as { id: Tab; label: string; icon: any }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-[#4f46e5] text-white shadow-md shadow-indigo-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-hidden">
        {tab === 'config'    && <TabConfig    schoolId={schoolId} yearId={selectedYear?.id ?? ''} />}
        {tab === 'saisie'    && <TabSaisie    schoolId={schoolId} yearId={selectedYear?.id ?? ''} />}
        {tab === 'resultats' && <TabResultats schoolId={schoolId} yearId={selectedYear?.id ?? ''} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET 1 — CONFIGURATION
// ═══════════════════════════════════════════════════════════

function TabConfig({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const [subjects,  setSubjects]  = useState<Subject[]>([]);
  const [classes,   setClasses]   = useState<ClassItem[]>([]);
  const [periods,   setPeriods]   = useState<GradingPeriod[]>([]);
  const [gradeTypes, setGradeTypes] = useState<GradeType[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // États formulaires
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [editSubject,     setEditSubject]     = useState<Subject | null>(null);
  const [subjectForm,     setSubjectForm]     = useState({ name: '', code: '', color: '#6366f1' });

  const [showPeriodForm,  setShowPeriodForm]  = useState(false);
  const [periodForm,      setPeriodForm]      = useState({ name: '', period_order: 1, start_date: '', end_date: '' });

  const [showGtForm,      setShowGtForm]      = useState(false);
  const [gtForm,          setGtForm]          = useState({ name: '', weight: 1.0, max_score: 20.0 });

  // Affectation matières × classes
  const [selectedClass,   setSelectedClass]   = useState('');
  const [classSubjects,   setClassSubjects]   = useState<ClassSubject[]>([]);
  const [showAssignForm,  setShowAssignForm]  = useState(false);
  const [assignForm,      setAssignForm]      = useState({ subject_id: '', coefficient: 1.0 });

  const load = useCallback(async () => {
    if (!yearId) return;
    setLoading(true);
    try {
      const [s, c, p, gt] = await Promise.all([
        invoke<Subject[]>('get_subjects', { schoolId }),
        invoke<ClassItem[]>('get_classes', { schoolId, academicYearId: yearId }),
        invoke<GradingPeriod[]>('get_grading_periods', { schoolId, academicYearId: yearId }),
        invoke<GradeType[]>('get_grade_types', { schoolId }),
      ]);
      setSubjects(s); setClasses(c); setPeriods(p); setGradeTypes(gt);
    } catch (e: any) { setError(String(e)); }
    finally { setLoading(false); }
  }, [schoolId, yearId]);

  const loadClassSubjects = useCallback(async (classId: string) => {
    if (!classId || !yearId) return;
    try {
      const cs = await invoke<ClassSubject[]>('get_class_subjects', { schoolId, academicYearId: yearId, classId });
      setClassSubjects(cs);
    } catch {}
  }, [schoolId, yearId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selectedClass) loadClassSubjects(selectedClass); }, [selectedClass, loadClassSubjects]);

  // ── Matières ──
  const saveSubject = async () => {
    try {
      if (editSubject) {
        await invoke('update_subject', { id: editSubject.id, schoolId, ...subjectForm });
      } else {
        await invoke('create_subject', { schoolId, ...subjectForm });
      }
      setShowSubjectForm(false); setEditSubject(null); setSubjectForm({ name: '', code: '', color: '#6366f1' });
      load();
    } catch (e: any) { setError(String(e)); }
  };

  const deleteSubject = async (id: string) => {
    if (!confirm('Supprimer cette matière ?')) return;
    try { await invoke('delete_subject', { id, schoolId }); load(); }
    catch (e: any) { setError(String(e)); }
  };

  // ── Périodes ──
  const savePeriod = async () => {
    try {
      await invoke('create_grading_period', {
        schoolId, academicYearId: yearId,
        name: periodForm.name, periodOrder: periodForm.period_order,
        startDate: periodForm.start_date || null, endDate: periodForm.end_date || null,
      });
      setShowPeriodForm(false); setPeriodForm({ name: '', period_order: 1, start_date: '', end_date: '' });
      load();
    } catch (e: any) { setError(String(e)); }
  };

  const togglePeriodActive = async (p: GradingPeriod) => {
    try {
      await invoke('update_grading_period', {
        id: p.id, schoolId, name: p.name, periodOrder: p.period_order,
        startDate: p.start_date, endDate: p.end_date, isActive: !p.is_active,
      });
      load();
    } catch (e: any) { setError(String(e)); }
  };

  // ── Types d'évaluation ──
  const saveGt = async () => {
    try {
      await invoke('create_grade_type', { schoolId, name: gtForm.name, weight: gtForm.weight, maxScore: gtForm.max_score });
      setShowGtForm(false); setGtForm({ name: '', weight: 1.0, max_score: 20.0 });
      load();
    } catch (e: any) { setError(String(e)); }
  };

  // ── Affectation ──
  const assignSubject = async () => {
    try {
      await invoke('assign_subject_to_class', {
        schoolId, academicYearId: yearId, classId: selectedClass,
        subjectId: assignForm.subject_id, teacherId: null, coefficient: assignForm.coefficient,
      });
      setShowAssignForm(false); setAssignForm({ subject_id: '', coefficient: 1.0 });
      loadClassSubjects(selectedClass);
    } catch (e: any) { setError(String(e)); }
  };

  const removeClassSubject = async (id: string) => {
    if (!confirm('Retirer cette matière de la classe ?')) return;
    try { await invoke('remove_class_subject', { id, schoolId }); loadClassSubjects(selectedClass); }
    catch (e: any) { setError(String(e)); }
  };

  if (!yearId) return <EmptyState message="Sélectionnez une année scolaire pour configurer les matières." />;
  if (loading) return <Loader />;

  return (
    <div className="h-full overflow-y-auto px-8 pb-8 space-y-8">
      {error && <ErrorBanner msg={error} onClose={() => setError('')} />}

      {/* ── MATIÈRES ────────────────────────────────────── */}
      <Section
        title="Matières"
        subtitle={`${subjects.length} matière(s) configurée(s)`}
        icon={BookOpen}
        action={<button onClick={() => { setShowSubjectForm(true); setEditSubject(null); setSubjectForm({ name: '', code: '', color: '#6366f1' }); }} className={primaryBtn}><Plus size={15} />Nouvelle matière</button>}
      >
        {showSubjectForm && (
          <FormCard onClose={() => setShowSubjectForm(false)}>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">{editSubject ? 'Modifier la matière' : 'Nouvelle matière'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>Nom de la matière *</label>
                <input className={inputClass} placeholder="Ex : Mathématiques" value={subjectForm.name}
                  onChange={e => setSubjectForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Code *</label>
                <input className={inputClass} placeholder="MATH" maxLength={6} value={subjectForm.code}
                  onChange={e => setSubjectForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className={labelClass}>Couleur</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={subjectForm.color}
                    onChange={e => setSubjectForm(f => ({ ...f, color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-1" />
                  <span className="text-xs text-slate-500">{subjectForm.color}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowSubjectForm(false)} className={ghostBtn}>Annuler</button>
              <button onClick={saveSubject} disabled={!subjectForm.name || !subjectForm.code} className={primaryBtn}>
                <Save size={14} /> Enregistrer
              </button>
            </div>
          </FormCard>
        )}

        {subjects.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Aucune matière configurée.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {subjects.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow group">
                <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: s.color || '#6366f1' }}>{s.code.slice(0, 2)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{s.name}</p>
                  <p className="text-[11px] text-slate-400">{s.code}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditSubject(s); setSubjectForm({ name: s.name, code: s.code, color: s.color || '#6366f1' }); setShowSubjectForm(true); }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-[#4f46e5]"><Pencil size={13} /></button>
                  <button onClick={() => deleteSubject(s.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── AFFECTATION MATIÈRES × CLASSES ──────────────── */}
      <Section
        title="Matières par classe"
        subtitle="Affectez les matières à chaque classe avec leur coefficient"
        icon={Users}
        action={null}
      >
        <div className="mb-4">
          <label className={labelClass}>Sélectionner une classe</label>
          <select className={inputClass} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option value="">-- Choisir une classe --</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedClass && (
          <>
            {showAssignForm && (
              <FormCard onClose={() => setShowAssignForm(false)}>
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Affecter une matière</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className={labelClass}>Matière *</label>
                    <select className={inputClass} value={assignForm.subject_id}
                      onChange={e => setAssignForm(f => ({ ...f, subject_id: e.target.value }))}>
                      <option value="">-- Choisir --</option>
                      {subjects.filter(s => !classSubjects.find(cs => cs.subject_id === s.id)).map(s =>
                        <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Coefficient *</label>
                    <input type="number" className={inputClass} min={0.5} max={10} step={0.5}
                      value={assignForm.coefficient} onChange={e => setAssignForm(f => ({ ...f, coefficient: parseFloat(e.target.value) }))} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setShowAssignForm(false)} className={ghostBtn}>Annuler</button>
                  <button onClick={assignSubject} disabled={!assignForm.subject_id} className={primaryBtn}>
                    <Save size={14} /> Affecter
                  </button>
                </div>
              </FormCard>
            )}

            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-slate-500">{classSubjects.length} matière(s) dans cette classe</p>
              <button onClick={() => setShowAssignForm(true)} className={primaryBtn}><Plus size={14} />Affecter une matière</button>
            </div>

            {classSubjects.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Aucune matière affectée à cette classe.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-3 text-left font-semibold">Matière</th>
                      <th className="px-4 py-3 text-left font-semibold">Code</th>
                      <th className="px-4 py-3 text-center font-semibold">Coefficient</th>
                      <th className="px-4 py-3 text-center font-semibold">Professeur</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classSubjects.map(cs => (
                      <tr key={cs.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700">{cs.subject_name}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg">{cs.subject_code}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#4f46e5]/10 text-[#4f46e5] font-bold text-sm">
                            {cs.coefficient}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-400 text-xs">
                          {cs.teacher_name ?? <span className="italic">Non attribué</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => removeClassSubject(cs.id)} className={dangerBtn}><Trash2 size={12} />Retirer</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Section>

      {/* ── PÉRIODES ────────────────────────────────────── */}
      <Section
        title="Périodes d'évaluation"
        subtitle="Trimestres ou semestres de l'année"
        icon={ClipboardList}
        action={<button onClick={() => setShowPeriodForm(true)} className={primaryBtn}><Plus size={15} />Nouvelle période</button>}
      >
        {showPeriodForm && (
          <FormCard onClose={() => setShowPeriodForm(false)}>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Nouvelle période</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>Nom *</label>
                <input className={inputClass} placeholder="Ex : Trimestre 1" value={periodForm.name}
                  onChange={e => setPeriodForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Ordre</label>
                <input type="number" min={1} max={6} className={inputClass} value={periodForm.period_order}
                  onChange={e => setPeriodForm(f => ({ ...f, period_order: parseInt(e.target.value) }))} />
              </div>
              <div>
                <label className={labelClass}>Date début</label>
                <input type="date" className={inputClass} value={periodForm.start_date}
                  onChange={e => setPeriodForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Date fin</label>
                <input type="date" className={inputClass} value={periodForm.end_date}
                  onChange={e => setPeriodForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowPeriodForm(false)} className={ghostBtn}>Annuler</button>
              <button onClick={savePeriod} disabled={!periodForm.name} className={primaryBtn}><Save size={14} /> Enregistrer</button>
            </div>
          </FormCard>
        )}

        {periods.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Aucune période configurée.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {periods.map(p => (
              <div key={p.id} className={`flex items-center gap-3 rounded-2xl border p-4 ${p.is_active ? 'border-[#4f46e5] bg-indigo-50/50' : 'border-slate-200 bg-white'} shadow-sm`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${p.is_active ? 'bg-[#4f46e5] text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {p.period_order}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {p.start_date ? `${p.start_date} → ${p.end_date ?? '?'}` : 'Dates non définies'}
                  </p>
                </div>
                <button onClick={() => togglePeriodActive(p)}
                  title={p.is_active ? 'Désactiver' : 'Activer'}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${p.is_active ? 'bg-[#4f46e5] text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                  <CheckCircle2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── TYPES D'ÉVALUATION ──────────────────────────── */}
      <Section
        title="Types d'évaluation"
        subtitle="Contrôle, Examen, Devoir… et leurs poids"
        icon={Star}
        action={<button onClick={() => setShowGtForm(true)} className={primaryBtn}><Plus size={15} />Nouveau type</button>}
      >
        {showGtForm && (
          <FormCard onClose={() => setShowGtForm(false)}>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Nouveau type d'évaluation</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3 sm:col-span-1">
                <label className={labelClass}>Nom *</label>
                <input className={inputClass} placeholder="Ex : Contrôle" value={gtForm.name}
                  onChange={e => setGtForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Poids</label>
                <input type="number" className={inputClass} min={0.1} max={10} step={0.5} value={gtForm.weight}
                  onChange={e => setGtForm(f => ({ ...f, weight: parseFloat(e.target.value) }))} />
              </div>
              <div>
                <label className={labelClass}>Note max</label>
                <input type="number" className={inputClass} min={5} max={100} step={5} value={gtForm.max_score}
                  onChange={e => setGtForm(f => ({ ...f, max_score: parseFloat(e.target.value) }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowGtForm(false)} className={ghostBtn}>Annuler</button>
              <button onClick={saveGt} disabled={!gtForm.name} className={primaryBtn}><Save size={14} /> Enregistrer</button>
            </div>
          </FormCard>
        )}

        {gradeTypes.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Aucun type configuré.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-center font-semibold">Poids</th>
                  <th className="px-4 py-3 text-center font-semibold">Note max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gradeTypes.map(gt => (
                  <tr key={gt.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-700">{gt.name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg">×{gt.weight}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">/{gt.max_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET 2 — SAISIE DES NOTES
// ═══════════════════════════════════════════════════════════

function TabSaisie({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const [classes,      setClasses]      = useState<ClassItem[]>([]);
  const [periods,      setPeriods]      = useState<GradingPeriod[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [gradeTypes,   setGradeTypes]   = useState<GradeType[]>([]);
  const [students,     setStudents]     = useState<StudentRow[]>([]);
  const [grades,       setGrades]       = useState<Grade[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');

  const [selClass,     setSelClass]     = useState('');
  const [selSubject,   setSelSubject]   = useState('');  // class_subject_id
  const [selPeriod,    setSelPeriod]    = useState('');
  const [selGradeType, setSelGradeType] = useState('');

  // Tableau de saisie : student_id → { score, is_absent }
  const [scoreMap, setScoreMap] = useState<Record<string, { score: string; is_absent: boolean }>>({});

  useEffect(() => {
    if (!yearId) return;
    Promise.all([
      invoke<ClassItem[]>('get_classes', { schoolId, academicYearId: yearId }),
      invoke<GradingPeriod[]>('get_grading_periods', { schoolId, academicYearId: yearId }),
      invoke<GradeType[]>('get_grade_types', { schoolId }),
    ]).then(([c, p, gt]) => { setClasses(c); setPeriods(p); setGradeTypes(gt); });
  }, [schoolId, yearId]);

  useEffect(() => {
    if (!selClass || !yearId) return;
    invoke<ClassSubject[]>('get_class_subjects', { schoolId, academicYearId: yearId, classId: selClass })
      .then(setClassSubjects);
    invoke<StudentRow[]>('get_students', { schoolId, academicYearId: yearId, classId: selClass })
      .then(setStudents);
  }, [selClass, schoolId, yearId]);

  // Charger les notes existantes quand tous les filtres sont sélectionnés
  useEffect(() => {
    if (!selSubject || !selPeriod || !yearId) return;
    setLoading(true);
    invoke<Grade[]>('get_grades_by_class', {
      schoolId, academicYearId: yearId, classSubjectId: selSubject, gradingPeriodId: selPeriod,
    }).then(gs => {
      // Pré-remplir le scoreMap avec les notes existantes
      const map: Record<string, { score: string; is_absent: boolean }> = {};
      gs.filter(g => !selGradeType || g.grade_type_id === selGradeType).forEach(g => {
        map[g.student_id] = { score: String(g.score), is_absent: g.is_absent };
      });
      setGrades(gs);
      // Initialiser les élèves sans note
      students.forEach(s => {
        if (!map[s.student_id]) map[s.student_id] = { score: '', is_absent: false };
      });
      setScoreMap(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selSubject, selPeriod, selGradeType, students, schoolId, yearId]);

  const maxScore = gradeTypes.find(gt => gt.id === selGradeType)?.max_score ?? 20;

  const saveAll = async () => {
    if (!selSubject || !selPeriod || !selGradeType) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const cs = classSubjects.find(c => c.id === selSubject);
      for (const student of students) {
        const entry = scoreMap[student.student_id];
        if (!entry) continue;
        if (entry.score === '' && !entry.is_absent) continue; // pas de saisie
        await invoke('upsert_grade', {
          schoolId, academicYearId: yearId,
          enrollmentId: student.id,
          studentId: student.student_id,
          classSubjectId: selSubject,
          gradingPeriodId: selPeriod,
          gradeTypeId: selGradeType,
          score: entry.is_absent ? 0 : parseFloat(entry.score || '0'),
          maxScore,
          evaluationDate: null,
          notes: null,
          recordedBy: 'user',
          isAbsent: entry.is_absent,
        });
      }
      setSuccess('Notes enregistrées avec succès.');
    } catch (e: any) { setError(String(e)); }
    finally { setSaving(false); }
  };

  const canSave = selSubject && selPeriod && selGradeType && students.length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filtres */}
      <div className="px-8 py-4 bg-white border-b border-slate-100 shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Classe</label>
            <select className={inputClass} value={selClass} onChange={e => { setSelClass(e.target.value); setSelSubject(''); }}>
              <option value="">-- Classe --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Matière</label>
            <select className={inputClass} value={selSubject} onChange={e => setSelSubject(e.target.value)} disabled={!selClass}>
              <option value="">-- Matière --</option>
              {classSubjects.map(cs => <option key={cs.id} value={cs.id}>{cs.subject_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Période</label>
            <select className={inputClass} value={selPeriod} onChange={e => setSelPeriod(e.target.value)}>
              <option value="">-- Période --</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Type d'évaluation</label>
            <select className={inputClass} value={selGradeType} onChange={e => setSelGradeType(e.target.value)}>
              <option value="">-- Type --</option>
              {gradeTypes.map(gt => <option key={gt.id} value={gt.id}>{gt.name} (/{gt.max_score})</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Grille de saisie */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {error && <ErrorBanner msg={error} onClose={() => setError('')} />}
        {success && (
          <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
            <CheckCircle2 size={16} /> {success}
          </div>
        )}

        {!selClass || !selSubject || !selPeriod || !selGradeType ? (
          <EmptyState message="Sélectionnez une classe, une matière, une période et un type d'évaluation pour saisir les notes." />
        ) : loading ? <Loader /> : students.length === 0 ? (
          <EmptyState message="Aucun élève inscrit dans cette classe." />
        ) : (
          <>
            {/* Stats rapides */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Élèves', val: students.length, color: 'bg-blue-50 text-blue-700' },
                { label: 'Saisis', val: Object.values(scoreMap).filter(e => e.score !== '' || e.is_absent).length, color: 'bg-indigo-50 text-indigo-700' },
                { label: 'Absents', val: Object.values(scoreMap).filter(e => e.is_absent).length, color: 'bg-amber-50 text-amber-700' },
                {
                  label: 'Moy. classe', color: 'bg-emerald-50 text-emerald-700',
                  val: (() => {
                    const scores = Object.values(scoreMap).filter(e => !e.is_absent && e.score !== '').map(e => parseFloat(e.score) / maxScore * 20);
                    return scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) + '/20' : '—';
                  })(),
                },
              ].map(s => (
                <div key={s.label} className={`${s.color} rounded-2xl p-4 flex flex-col gap-1`}>
                  <span className="text-2xl font-bold">{s.val}</span>
                  <span className="text-xs font-medium opacity-70">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold w-8">#</th>
                    <th className="px-4 py-3 text-left font-semibold">Élève</th>
                    <th className="px-4 py-3 text-center font-semibold w-32">Note /{maxScore}</th>
                    <th className="px-4 py-3 text-center font-semibold w-24">/20</th>
                    <th className="px-4 py-3 text-center font-semibold w-24">Absent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s, i) => {
                    const entry = scoreMap[s.student_id] ?? { score: '', is_absent: false };
                    const scoreOn20 = !entry.is_absent && entry.score !== '' ? (parseFloat(entry.score) / maxScore * 20).toFixed(2) : null;
                    return (
                      <tr key={s.student_id} className={`hover:bg-slate-50/50 transition-colors ${entry.is_absent ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-700">{s.last_name} {s.first_name}</span>
                          {s.matricule && <span className="ml-2 text-[11px] text-slate-400">#{s.matricule}</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number" min={0} max={maxScore} step={0.5}
                            disabled={entry.is_absent}
                            value={entry.score}
                            onChange={e => setScoreMap(m => ({ ...m, [s.student_id]: { ...entry, score: e.target.value } }))}
                            className="w-24 px-3 py-1.5 text-center border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] disabled:bg-slate-50 disabled:text-slate-300"
                          />
                        </td>
                        <td className={`px-4 py-3 text-center text-sm font-semibold ${avg2color(scoreOn20 ? parseFloat(scoreOn20) : null)}`}>
                          {entry.is_absent ? <span className="text-amber-500 text-xs font-medium">ABS</span> : scoreOn20 ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input type="checkbox" checked={entry.is_absent}
                            onChange={e => setScoreMap(m => ({ ...m, [s.student_id]: { score: '', is_absent: e.target.checked } }))}
                            className="w-4 h-4 rounded accent-amber-500 cursor-pointer" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={saveAll} disabled={!canSave || saving} className={primaryBtn}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Enregistrer toutes les notes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET 3 — RÉSULTATS
// ═══════════════════════════════════════════════════════════

function TabResultats({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const { selectedYear } = useYear();
  const [classes,   setClasses]   = useState<ClassItem[]>([]);
  const [periods,   setPeriods]   = useState<GradingPeriod[]>([]);
  const [rankings,  setRankings]  = useState<ClassRankingEntry[]>([]);
  const [stats,     setStats]     = useState<SubjectStats[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [selClass,  setSelClass]  = useState('');
  const [selPeriod, setSelPeriod] = useState('');
  const [view,      setView]      = useState<'classement' | 'stats'>('classement');
  const [search,    setSearch]    = useState('');

  useEffect(() => {
    if (!yearId) return;
    Promise.all([
      invoke<ClassItem[]>('get_classes', { schoolId, academicYearId: yearId }),
      invoke<GradingPeriod[]>('get_grading_periods', { schoolId, academicYearId: yearId }),
    ]).then(([c, p]) => { setClasses(c); setPeriods(p); });
  }, [schoolId, yearId]);

  useEffect(() => {
    if (!selClass || !selPeriod) return;
    setLoading(true);
    Promise.all([
      invoke<ClassRankingEntry[]>('get_class_rankings', { schoolId, academicYearId: yearId, classId: selClass, gradingPeriodId: selPeriod }),
      invoke<SubjectStats[]>('get_class_statistics', { schoolId, academicYearId: yearId, classId: selClass, gradingPeriodId: selPeriod }),
    ]).then(([r, s]) => { setRankings(r); setStats(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selClass, selPeriod, schoolId, yearId]);

  const filtered = rankings.filter(r =>
    search === '' || `${r.first_name} ${r.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filtres */}
      <div className="px-8 py-4 bg-white border-b border-slate-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-48">
            <select className={inputClass} value={selClass} onChange={e => setSelClass(e.target.value)}>
              <option value="">-- Classe --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="w-48">
            <select className={inputClass} value={selPeriod} onChange={e => setSelPeriod(e.target.value)}>
              <option value="">-- Période --</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(['classement', 'stats'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${view === v ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {v === 'classement' ? '🏆 Classement' : '📊 Statistiques'}
              </button>
            ))}
          </div>
          {view === 'classement' && (
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-9`} placeholder="Rechercher un élève…" value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
          )}
        </div>
        
        {selClass && selPeriod && rankings.length > 0 && (
          <button 
            onClick={() => {
              const c = classes.find(x => x.id === selClass);
              const p = periods.find(x => x.id === selPeriod);
              generateClassReport(
                "ORION ÉDUCATION", 
                selectedYear?.name || '', 
                p ? p.name : 'Période', 
                c ? c.name : 'Classe', 
                rankings, 
                stats
              );
            }}
            className="px-4 py-2 bg-indigo-50 text-[#4f46e5] hover:bg-indigo-100 font-semibold rounded-xl text-[13px] flex items-center gap-2 transition-colors ml-4"
          >
            <FileText size={16} />
            Télécharger le Palmarès
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {!selClass || !selPeriod ? (
          <EmptyState message="Sélectionnez une classe et une période pour afficher les résultats." />
        ) : loading ? <Loader /> : (
          <>
            {view === 'classement' && (
              <>
                {/* KPI rapides */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                  {[
                    { label: 'Élèves classés', val: rankings.length, color: 'bg-indigo-50 text-indigo-700' },
                    {
                      label: 'Moy. générale', color: 'bg-blue-50 text-blue-700',
                      val: (() => {
                        const avgs = rankings.filter(r => r.general_average !== null).map(r => r.general_average!);
                        return avgs.length ? (avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2) : '—';
                      })(),
                    },
                    { label: 'Meilleure moy.', val: rankings[0]?.general_average?.toFixed(2) ?? '—', color: 'bg-emerald-50 text-emerald-700' },
                    {
                      label: 'Taux de réussite',
                      val: rankings.length ? Math.round(rankings.filter(r => (r.general_average ?? 0) >= 10).length / rankings.length * 100) + '%' : '—',
                      color: 'bg-amber-50 text-amber-700',
                    },
                  ].map(s => (
                    <div key={s.label} className={`${s.color} rounded-2xl p-4`}>
                      <div className="text-2xl font-bold">{s.val}</div>
                      <div className="text-xs font-medium opacity-70 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                        <th className="px-4 py-3 text-center font-semibold w-12">Rang</th>
                        <th className="px-4 py-3 text-left font-semibold">Élève</th>
                        <th className="px-4 py-3 text-center font-semibold">Moy. générale</th>
                        <th className="px-4 py-3 text-center font-semibold">Appréciation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map(r => (
                        <tr key={r.enrollment_id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full font-bold text-xs ${r.rank <= 3 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              {r.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-700">{r.last_name} {r.first_name}</td>
                          <td className={`px-4 py-3 text-center text-base font-bold ${avg2color(r.general_average)}`}>
                            {r.general_average !== null ? r.general_average.toFixed(2) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${APPRECIATION_COLOR[r.appreciation] ?? 'text-slate-500 bg-slate-50'}`}>
                              {r.appreciation}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {view === 'stats' && (
              <div className="space-y-4">
                {stats.length === 0 ? (
                  <EmptyState message="Aucune statistique disponible pour cette sélection." />
                ) : stats.map(s => (
                  <div key={s.class_subject_id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg">{s.subject_code}</span>
                        <span className="font-semibold text-slate-700">{s.subject_name}</span>
                      </div>
                      <span className="text-xs text-slate-400">{s.grade_count} note(s)</span>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      {[
                        { label: 'Moy. classe', val: s.class_average?.toFixed(2) ?? '—', color: 'text-indigo-600' },
                        { label: 'Minimum', val: s.min_score?.toFixed(1) ?? '—', color: 'text-red-500' },
                        { label: 'Maximum', val: s.max_score?.toFixed(1) ?? '—', color: 'text-emerald-600' },
                        { label: 'Taux réussite', val: `${s.success_rate.toFixed(0)}%`, color: s.success_rate >= 50 ? 'text-emerald-600' : 'text-amber-600' },
                      ].map(k => (
                        <div key={k.label} className="text-center">
                          <div className={`text-xl font-bold ${k.color}`}>{k.val}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{k.label}</div>
                        </div>
                      ))}
                    </div>
                    {/* Barre de réussite */}
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                        <span>Taux de réussite</span><span>{s.success_rate.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${s.success_rate >= 50 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                          style={{ width: `${s.success_rate}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Composants utilitaires ──────────────────────────────────

function Section({ title, subtitle, icon: Icon, action, children }: {
  title: string; subtitle: string; icon: any; action: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#4f46e5]/10 flex items-center justify-center">
            <Icon size={16} className="text-[#4f46e5]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">{title}</h2>
            <p className="text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function FormCard({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="mb-6 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 relative">
      <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
        <X size={16} />
      </button>
      {children}
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-[#4f46e5]" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <BookOpen size={28} className="text-slate-300" />
      </div>
      <p className="text-sm text-slate-400 max-w-sm">{message}</p>
    </div>
  );
}

function ErrorBanner({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="flex items-start gap-2 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
      <span className="flex-1">{msg}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  );
}
