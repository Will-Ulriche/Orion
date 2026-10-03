import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import {
  BarChart3, BookOpen, CalendarDays, CheckCircle2, ClipboardList, FileText,
  GraduationCap, Layers, Pencil, Plus, Save, Search, SlidersHorizontal, Star,
  Trash2, Trophy, UserX, Users, Weight, UserCheck, ChevronDown, X, Check,
} from 'lucide-react';
import { generateClassReport } from '../utils/pdfGenerator';
import {
  Alert, Avatar, Badge, Btn, Card, ConfirmDialog, EmptyState, Field, IconBtn, Kpi,
  Loader, Modal, NumberInput, PanelHeader, SearchInput, Segmented, Select, Switch,
  TableShell, Td, Th, TextInput, type Tone, TONES, cx,
} from '../components/ui';

// ─── Types ──────────────────────────────────────────────────

interface Subject {
  id: string; name: string; code: string; color: string | null;
}
interface ClassItem {
  id: string; name: string; level: string | null; student_count: number;
}
interface ClassSubject {
  id: string; class_id: string; subject_id: string; teacher_id: string | null;
  coefficient: number;
  weekly_hours: number | null;
  subject_type: string | null;
  is_mandatory: boolean | null;
  order_index: number | null;
  color_icon: string | null;
  subject_name: string | null; subject_code: string | null;
  class_name: string | null; teacher_name: string | null;
}
interface GradingPeriod { id: string; school_id: string; academic_year_id: string; class_id: string | null; name: string; period_order: number; start_date: string | null; end_date: string | null; is_active: boolean; }
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

// ─── Helpers d'affichage ──────────────────────────────────────

const APPRECIATION_TONE: Record<string, Tone> = {
  'Excellent': 'emerald',
  'Bien': 'blue',
  'Assez Bien': 'brand',
  'Passable': 'amber',
  'Insuffisant': 'red',
};

const TYPE_TONE: Record<string, { tone: Tone; label: string }> = {
  principal: { tone: 'emerald', label: 'Principal' },
  facultatif: { tone: 'amber', label: 'Facultatif' },
  option: { tone: 'blue', label: 'Option' },
};

const RANK_CHIP: Record<number, string> = {
  1: 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm',
  2: 'bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm',
  3: 'bg-gradient-to-br from-orange-300 to-orange-400 text-white shadow-sm',
};

const DISTRIBUTION: { label: string; bar: string; test: (a: number) => boolean }[] = [
  { label: '< 10',  bar: 'bg-red-400',     test: (a) => a < 10 },
  { label: '10-12', bar: 'bg-amber-400',   test: (a) => a >= 10 && a < 12 },
  { label: '12-14', bar: 'bg-sky-400',     test: (a) => a >= 12 && a < 14 },
  { label: '14-16', bar: 'bg-brand-500',   test: (a) => a >= 14 && a < 16 },
  { label: '≥ 16',  bar: 'bg-emerald-400', test: (a) => a >= 16 },
];

function avgText(avg: number | null) {
  if (avg === null) return 'text-slate-400';
  if (avg >= 14) return 'text-emerald-600';
  if (avg >= 12) return 'text-sky-600';
  if (avg >= 10) return 'text-amber-600';
  return 'text-red-600';
}

function initials(label: string, fallback = '??') {
  return (label || fallback).slice(0, 2);
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return 'Dates non définies';
  return `${start} → ${end ?? '?'}`;
}

// ═══════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════

type Tab = 'config' | 'saisie' | 'resultats';

export default function Pedagogie() {
  const { schoolId } = useAuth();
  const { selectedYear } = useYear();
  const [tab, setTab] = useState<Tab>('config');

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-4 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-brand">
              <GraduationCap size={21} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800">Pédagogie &amp; Notes</h1>
              <p className="text-[13px] text-slate-500">
                Matières, évaluations et résultats scolaires
              </p>
            </div>
          </div>

          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'config', label: 'Configuration', icon: SlidersHorizontal },
              { value: 'saisie', label: 'Saisie des notes', icon: ClipboardList },
              { value: 'resultats', label: 'Résultats', icon: Trophy },
            ]}
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === 'config' && <TabConfig schoolId={schoolId} yearId={selectedYear?.id ?? ''} />}
        {tab === 'saisie' && <TabSaisie schoolId={schoolId} yearId={selectedYear?.id ?? ''} />}
        {tab === 'resultats' && <TabResultats schoolId={schoolId} yearId={selectedYear?.id ?? ''} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET 1 — CONFIGURATION
// ═══════════════════════════════════════════════════════════

type LeftSection = 'subjects' | 'classes' | 'periods' | 'gradeTypes' | 'professeurs';

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

function TabConfig({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const [subjects,   setSubjects]   = useState<Subject[]>([]);
  const [classes,    setClasses]    = useState<ClassItem[]>([]);
  const [periods,    setPeriods]    = useState<GradingPeriod[]>([]);
  const [gradeTypes, setGradeTypes] = useState<GradeType[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const [selectedClass,   setSelectedClass]   = useState<ClassItem | null>(null);
  const [classSubjects,   setClassSubjects]   = useState<ClassSubject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [subjectSearch,   setSubjectSearch]   = useState('');

  const [modal, setModal] = useState<'subject' | 'period' | 'gradeType' | 'assign' | null>(null);
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '', color: '#6366f1' });
  const [periodForm, setPeriodForm] = useState({ name: '', period_order: 1, start_date: '', end_date: '', class_id: '' });
  const [gtForm, setGtForm] = useState({ name: '', weight: 1.0, max_score: 20.0 });
  const [assignForm, setAssignForm] = useState({ subject_id: '', coefficient: 1.0, weekly_hours: 2.0, subject_type: 'principal', is_mandatory: true, order_index: 0 });

  const [leftSection, setLeftSection] = useState<LeftSection>('subjects');

  const load = useCallback(async () => {
    if (!yearId) return;
    setLoading(true);
    try {
      const [s, c, p, gt] = await Promise.all([
        invoke<Subject[]>('get_subjects', { schoolId }),
        invoke<ClassItem[]>('get_classes', { schoolId, academicYearId: yearId }),
        invoke<GradingPeriod[]>('get_grading_periods', { schoolId, academicYearId: yearId, classId: null }),
        invoke<GradeType[]>('get_grade_types', { schoolId }),
      ]);
      setSubjects(s); setClasses(c); setPeriods(p); setGradeTypes(gt);
    } catch (e: any) { setError(String(e)); }
    finally { setLoading(false); }
  }, [schoolId, yearId]);

  const loadClassSubjects = useCallback(async (classId: string) => {
    if (!classId || !yearId) return;
    setLoadingSubjects(true);
    try {
      const cs = await invoke<ClassSubject[]>('get_class_subjects', { schoolId, academicYearId: yearId, classId });
      setClassSubjects(cs);
    } catch (e: any) { setError("Erreur de chargement des matières: " + String(e)); } finally { setLoadingSubjects(false); }
  }, [schoolId, yearId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selectedClass) loadClassSubjects(selectedClass.id); }, [selectedClass, loadClassSubjects]);

  const closeModal = () => {
    setModal(null); setEditSubject(null);
    setSubjectForm({ name: '', code: '', color: '#6366f1' });
    setPeriodForm({ name: '', period_order: 1, start_date: '', end_date: '', class_id: '' });
    setGtForm({ name: '', weight: 1.0, max_score: 20.0 });
    setAssignForm({ subject_id: '', coefficient: 1.0, weekly_hours: 2.0, subject_type: 'principal', is_mandatory: true, order_index: 0 });
  };

  const openSubjectModal = (s: Subject | null) => {
    setEditSubject(s);
    setSubjectForm({ name: s?.name ?? '', code: s?.code ?? '', color: s?.color ?? '#6366f1' });
    setModal('subject');
  };

  const saveSubject = async () => {
    try {
      if (editSubject) await invoke('update_subject', { id: editSubject.id, schoolId, ...subjectForm });
      else await invoke('create_subject', { schoolId, ...subjectForm });
      closeModal(); load();
    } catch (e: any) { setError(String(e)); }
  };

  const askDeleteSubject = (s: Subject) =>
    setConfirmState({
      title: 'Supprimer la matière',
      message: `« ${s.name} » sera définitivement supprimée du programme. Les affectations existantes resteront orphelines.`,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        setConfirmState(null);
        try { await invoke('delete_subject', { id: s.id, schoolId }); load(); }
        catch (e: any) { setError(String(e)); }
      },
    });

  const savePeriod = async () => {
    try {
      await invoke('create_grading_period', {
        schoolId, academicYearId: yearId, name: periodForm.name,
        periodOrder: periodForm.period_order, classId: periodForm.class_id || null,
        startDate: periodForm.start_date || null, endDate: periodForm.end_date || null,
      });
      closeModal(); load();
    } catch (e: any) { setError(String(e)); }
  };

  const togglePeriodActive = async (p: GradingPeriod) => {
    try {
      await invoke('update_grading_period', {
        id: p.id, schoolId, classId: p.class_id, name: p.name,
        periodOrder: p.period_order, startDate: p.start_date, endDate: p.end_date,
        isActive: !p.is_active,
      });
      load();
    } catch (e: any) { setError(String(e)); }
  };

  const saveGt = async () => {
    try {
      await invoke('create_grade_type', { schoolId, name: gtForm.name, weight: gtForm.weight, maxScore: gtForm.max_score });
      closeModal(); load();
    } catch (e: any) { setError(String(e)); }
  };

  const assignSubject = async () => {
    if (!selectedClass) return;
    try {
      await invoke('assign_subject_to_class', {
        schoolId, academicYearId: yearId, classId: selectedClass.id,
        subjectId: assignForm.subject_id, teacherId: null,
        coefficient: assignForm.coefficient, weeklyHours: assignForm.weekly_hours,
        subjectType: assignForm.subject_type, isMandatory: assignForm.is_mandatory,
        orderIndex: assignForm.order_index, colorIcon: null,
      });
      closeModal(); loadClassSubjects(selectedClass.id);
    } catch (e: any) { setError(String(e)); }
  };

  const askRemoveClassSubject = (cs: ClassSubject) =>
    setConfirmState({
      title: 'Retirer la matière',
      message: `${cs.subject_name} sera retirée de ${selectedClass?.name}. Les notes déjà saisies pour cette matière ne seront plus visibles.`,
      confirmLabel: 'Retirer',
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await invoke('remove_class_subject', { id: cs.id, schoolId });
          if (selectedClass) loadClassSubjects(selectedClass.id);
        } catch (e: any) { setError(String(e)); }
      },
    });

  const navItems: { id: LeftSection; icon: any; label: string; count: number | null }[] = [
    { id: 'subjects',   icon: BookOpen,     label: 'Matières',          count: subjects.length },
    { id: 'classes',    icon: Users,        label: 'Matières / Classe', count: classes.length },
    { id: 'professeurs', icon: UserCheck,   label: 'Professeur / Matière', count: null },
    { id: 'periods',    icon: ClipboardList, label: 'Périodes',         count: periods.length },
    { id: 'gradeTypes', icon: Star,         label: "Types d'éval.",     count: gradeTypes.length },
  ];

  if (!yearId) {
    return (
      <div className="p-8">
        <EmptyState
          icon={Layers}
          title="Aucune année scolaire sélectionnée"
          description="Choisissez une année scolaire dans la barre latérale pour configurer les matières, périodes et types d'évaluation."
        />
      </div>
    );
  }

  if (loading) return <Loader label="Chargement de la configuration…" />;

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-[268px] shrink-0 flex-col border-r border-slate-200/80 bg-white lg:flex">
        <p className="px-6 pb-3 pt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Configuration
        </p>
        <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {navItems.map(n => {
            const active = leftSection === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setLeftSection(n.id)}
                aria-current={active ? 'true' : undefined}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
                  active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <span
                  className={cx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                    active ? 'bg-brand-600 text-white shadow-brand' : 'bg-slate-100 text-slate-500'
                  )}
                >
                  <n.icon size={15} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{n.label}</span>
                {n.count !== null && (
                  <span
                    className={cx(
                      'rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                      active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {n.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <p className="border-t border-slate-100 px-6 py-4 text-[11px] leading-relaxed text-slate-400">
          Ces réglages alimentent la saisie des notes, les moyennes et les bulletins.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="custom-scrollbar shrink-0 overflow-x-auto border-b border-slate-200/80 bg-white px-4 py-3 lg:hidden">
          <Segmented<LeftSection>
            value={leftSection}
            onChange={setLeftSection}
            options={navItems.map(n => ({ value: n.id, label: n.label, icon: n.icon, count: n.count }))}
          />
        </div>

        <div className={cx("custom-scrollbar min-h-0 flex-1 overflow-y-auto", leftSection === 'professeurs' ? "" : "px-5 py-6 lg:px-8")}>
          {error && <Alert message={error} onClose={() => setError('')} className={leftSection === 'professeurs' ? "m-4" : ""} />}

          {leftSection === 'subjects' && (
            <PanelSubjects
              subjects={subjects}
              search={subjectSearch}
              onSearch={setSubjectSearch}
              onAdd={() => openSubjectModal(null)}
              onEdit={openSubjectModal}
              onDelete={askDeleteSubject}
            />
          )}

          {leftSection === 'classes' && (
            <PanelClass
              classes={classes}
              subjects={subjects}
              selectedClass={selectedClass}
              classSubjects={classSubjects}
              loading={loadingSubjects}
              onSelectClass={setSelectedClass}
              onAssign={() => setModal('assign')}
              onRemove={askRemoveClassSubject}
            />
          )}

          {leftSection === 'periods' && (
            <PanelPeriods
              periods={periods}
              classes={classes}
              onAdd={() => setModal('period')}
              onToggle={togglePeriodActive}
            />
          )}

          {leftSection === 'gradeTypes' && (
            <PanelGradeTypes gradeTypes={gradeTypes} onAdd={() => setModal('gradeType')} />
          )}

          {leftSection === 'professeurs' && (
            <PanelProfesseurs schoolId={schoolId} yearId={yearId} />
          )}
        </div>
      </div>

      {/* ══ MODALES ══ */}

      {modal === 'subject' && (
        <Modal
          title={editSubject ? 'Modifier la matière' : 'Nouvelle matière'}
          description="Identifiez la matière telle qu'elle apparaîtra dans les bulletins."
          onClose={closeModal}
          footer={
            <>
              <Btn onClick={closeModal}>Annuler</Btn>
              <Btn variant="primary" onClick={saveSubject} disabled={!subjectForm.name || !subjectForm.code}>
                <Save size={15} /> {editSubject ? 'Enregistrer' : 'Créer la matière'}
              </Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Nom de la matière" required>
              <TextInput
                autoFocus
                placeholder="Ex : Mathématiques"
                value={subjectForm.name}
                onChange={(e) => setSubjectForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" required hint="2 à 6 caractères, utilisé comme badge.">
                <TextInput
                  placeholder="MATH"
                  maxLength={6}
                  value={subjectForm.code}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                />
              </Field>
              <Field label="Couleur">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    aria-label="Couleur de la matière"
                    value={subjectForm.color}
                    onChange={(e) => setSubjectForm((f) => ({ ...f, color: e.target.value }))}
                    className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                  />
                  <div
                    className="flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
                    style={{ backgroundColor: subjectForm.color }}
                  >
                    {subjectForm.code || 'AB'}
                  </div>
                </div>
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'period' && (
        <Modal
          title="Nouvelle période d'évaluation"
          description="Trimestre, semestre ou période personnalisée."
          onClose={closeModal}
          footer={
            <>
              <Btn onClick={closeModal}>Annuler</Btn>
              <Btn variant="primary" onClick={savePeriod} disabled={!periodForm.name}>
                <Save size={15} /> Créer la période
              </Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Nom" required>
              <TextInput
                autoFocus
                placeholder="Ex : Trimestre 1"
                value={periodForm.name}
                onChange={(e) => setPeriodForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Classe concernée" hint="Laissez vide pour toutes les classes.">
                <Select
                  value={periodForm.class_id}
                  onChange={(e) => setPeriodForm((f) => ({ ...f, class_id: e.target.value }))}
                >
                  <option value="">Toutes les classes</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Ordre" hint="Position dans le calendrier scolaire.">
                <NumberInput
                  min={1}
                  max={6}
                  value={periodForm.period_order}
                  onChange={(e) => setPeriodForm((f) => ({ ...f, period_order: parseInt(e.target.value) || 1 }))}
                />
              </Field>
              <Field label="Date de début">
                <TextInput
                  type="date"
                  value={periodForm.start_date}
                  onChange={(e) => setPeriodForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </Field>
              <Field label="Date de fin">
                <TextInput
                  type="date"
                  value={periodForm.end_date}
                  onChange={(e) => setPeriodForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'gradeType' && (
        <Modal
          title="Nouveau type d'évaluation"
          description="Le poids détermine la part de ce type dans la moyenne générale."
          onClose={closeModal}
          footer={
            <>
              <Btn onClick={closeModal}>Annuler</Btn>
              <Btn variant="primary" onClick={saveGt} disabled={!gtForm.name}>
                <Save size={15} /> Créer
              </Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Nom" required>
              <TextInput
                autoFocus
                placeholder="Ex : Contrôle continu"
                value={gtForm.name}
                onChange={(e) => setGtForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Poids">
                <NumberInput
                  min={0.1}
                  max={10}
                  step={0.5}
                  value={gtForm.weight}
                  onChange={(e) => setGtForm((f) => ({ ...f, weight: parseFloat(e.target.value) || 1 }))}
                />
              </Field>
              <Field label="Note maximale">
                <NumberInput
                  min={5}
                  max={100}
                  step={5}
                  value={gtForm.max_score}
                  onChange={(e) => setGtForm((f) => ({ ...f, max_score: parseFloat(e.target.value) || 20 }))}
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'assign' && selectedClass && (
        <Modal
          title="Affecter une matière"
          description={`${selectedClass.name} · ${selectedClass.student_count} élève(s)`}
          onClose={closeModal}
          footer={
            <>
              <Btn onClick={closeModal}>Annuler</Btn>
              <Btn variant="primary" onClick={assignSubject} disabled={!assignForm.subject_id}>
                <Plus size={15} /> Affecter
              </Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Matière" required>
              <Select
                autoFocus
                value={assignForm.subject_id}
                onChange={(e) => setAssignForm((f) => ({ ...f, subject_id: e.target.value }))}
              >
                <option value="">-- Sélectionner --</option>
                {subjects.filter((s) => !classSubjects.find((cs) => cs.subject_id === s.id)).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type de matière">
                <div className="flex gap-2">
                  {(['principal', 'facultatif', 'option'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAssignForm((f) => ({ ...f, subject_type: t }))}
                      aria-pressed={assignForm.subject_type === t}
                      className={cx(
                        'flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition-all',
                        assignForm.subject_type === t
                          ? TONES[TYPE_TONE[t].tone]
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      )}
                    >
                      {TYPE_TONE[t].label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Obligatoire">
                <div className="flex h-[42px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5">
                  <span className="text-sm font-semibold text-slate-700">
                    {assignForm.is_mandatory ? 'Oui' : 'Non'}
                  </span>
                  <Switch
                    checked={assignForm.is_mandatory}
                    onChange={(v) => setAssignForm((f) => ({ ...f, is_mandatory: v }))}
                    label="Matière obligatoire"
                  />
                </div>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Coefficient">
                <NumberInput
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={assignForm.coefficient}
                  onChange={(e) => setAssignForm((f) => ({ ...f, coefficient: parseFloat(e.target.value) || 1 }))}
                />
              </Field>
              <Field label="Heures / semaine">
                <NumberInput
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={assignForm.weekly_hours}
                  onChange={(e) => setAssignForm((f) => ({ ...f, weekly_hours: parseFloat(e.target.value) || 1 }))}
                />
              </Field>
              <Field label="Ordre">
                <NumberInput
                  min={0}
                  max={100}
                  value={assignForm.order_index}
                  onChange={(e) => setAssignForm((f) => ({ ...f, order_index: parseInt(e.target.value) || 0 }))}
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

// ─── Panneaux ────────────────────────────────────────────────

function PanelSubjects({
  subjects, search, onSearch, onAdd, onEdit, onDelete,
}: {
  subjects: Subject[];
  search: string;
  onSearch: (v: string) => void;
  onAdd: () => void;
  onEdit: (s: Subject) => void;
  onDelete: (s: Subject) => void;
}) {
  const query = search.trim().toLowerCase();
  const filtered = subjects.filter((s) =>
    `${s.name} ${s.code}`.toLowerCase().includes(query)
  );

  return (
    <div className="space-y-6">
      <PanelHeader
        icon={BookOpen}
        title="Matières"
        subtitle={`${subjects.length} matière${subjects.length > 1 ? 's' : ''} au programme`}
        actions={
          <>
            <SearchInput
              value={search}
              onChange={onSearch}
              placeholder="Nom ou code…"
              className="w-full sm:w-52"
            />
            <Btn variant="primary" onClick={onAdd}>
              <Plus size={16} /> Nouvelle matière
            </Btn>
          </>
        }
      />

      {subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aucune matière configurée"
          description="Créez les matières du programme (mathématiques, français, sciences…) pour pouvoir ensuite les affecter à vos classes."
          action={<Btn variant="primary" onClick={onAdd}><Plus size={16} /> Créer une matière</Btn>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Aucun résultat"
          description={`Aucune matière ne correspond à « ${search} ».`}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => {
            const color = s.color || '#6366f1';
            return (
              <Card key={s.id} interactive className="relative overflow-hidden p-4">
                <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
                <div className="mt-1 flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
                    style={{ backgroundColor: color }}
                  >
                    {initials(s.code)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{s.name}</p>
                    <Badge tone="slate" className="mt-1">{s.code}</Badge>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end gap-1 border-t border-slate-100 pt-2.5">
                  <Btn size="sm" variant="ghost" onClick={() => onEdit(s)}>
                    <Pencil size={13} /> Modifier
                  </Btn>
                  <IconBtn label={`Supprimer ${s.name}`} tone="danger" onClick={() => onDelete(s)}>
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PanelClass({
  classes, subjects, selectedClass, classSubjects, loading, onSelectClass, onAssign, onRemove,
}: {
  classes: ClassItem[];
  subjects: Subject[];
  selectedClass: ClassItem | null;
  classSubjects: ClassSubject[];
  loading: boolean;
  onSelectClass: (c: ClassItem) => void;
  onAssign: () => void;
  onRemove: (cs: ClassSubject) => void;
}) {
  const totalCoef = classSubjects.reduce((s, cs) => s + cs.coefficient, 0);
  const totalHours = classSubjects.reduce((s, cs) => s + (cs.weekly_hours || 0), 0);

  return (
    <div className="space-y-6">
      <PanelHeader
        icon={Users}
        title="Matières par classe"
        subtitle="Affectez les matières, coefficients et volumes horaires de chaque classe."
        actions={
          <Btn variant="primary" onClick={onAssign} disabled={!selectedClass}>
            <Plus size={16} /> Affecter une matière
          </Btn>
        }
      />

      {classes.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucune classe cette année"
          description="Créez d'abord des classes depuis l'onglet « Classes » pour pouvoir y affecter des matières."
        />
      ) : (
        <div className="custom-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {classes.map((c) => {
            const active = selectedClass?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelectClass(c)}
                aria-pressed={active}
                className={cx(
                  'flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 transition-all',
                  active
                    ? 'border-brand-200 bg-brand-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <span
                  className={cx(
                    'flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold',
                    active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                  )}
                >
                  {initials(c.name).toUpperCase()}
                </span>
                <span className={cx('text-[13px] font-semibold', active ? 'text-brand-700' : 'text-slate-700')}>
                  {c.name}
                </span>
                <span className="text-[11px] tabular-nums text-slate-400">{c.student_count} él.</span>
              </button>
            );
          })}
        </div>
      )}

      {!selectedClass ? (
        <EmptyState
          icon={Layers}
          title="Sélectionnez une classe"
          description="Choisissez une classe ci-dessus pour gérer ses matières, ses coefficients et son volume horaire."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi icon={BookOpen} label="Matières" value={classSubjects.length} tone="brand" />
            <Kpi icon={Weight} label="Coefficient total" value={totalCoef.toFixed(1)} tone="violet" />
            <Kpi icon={CalendarDays} label="Heures / semaine" value={`${totalHours}h`} tone="blue" />
          </div>

          {loading ? (
            <Loader label="Chargement des matières…" />
          ) : classSubjects.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Aucune matière affectée"
              description="Affectez une matière à cette classe pour pouvoir saisir des notes."
              action={<Btn variant="primary" onClick={onAssign}><Plus size={16} /> Affecter une matière</Btn>}
            />
          ) : (
            <div className="space-y-2">
              {classSubjects.map((cs, i) => {
                const subject = subjects.find((s) => s.id === cs.subject_id);
                const type = TYPE_TONE[cs.subject_type || 'principal'] ?? TYPE_TONE.principal;
                return (
                  <Card key={cs.id} className="flex items-center gap-4 p-3.5">
                    <span className="w-7 shrink-0 rounded-lg bg-slate-100 py-1 text-center text-[11px] font-bold tabular-nums text-slate-400">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white shadow-sm"
                      style={{ backgroundColor: subject?.color || '#6366f1' }}
                    >
                      {initials(cs.subject_code || subject?.code || '')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-800">{cs.subject_name}</p>
                        <Badge tone={type.tone}>{type.label}</Badge>
                        {cs.is_mandatory && <Badge tone="slate">Obligatoire</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-slate-400">
                        <span>Coefficient <strong className="text-slate-600">{cs.coefficient}</strong></span>
                        {cs.weekly_hours ? (
                          <span><strong className="text-slate-600">{cs.weekly_hours}h</strong> / semaine</span>
                        ) : null}
                        {cs.teacher_name ? (
                          <span>Prof. <strong className="text-slate-600">{cs.teacher_name}</strong></span>
                        ) : (
                          <span className="italic text-amber-600">Professeur non assigné</span>
                        )}
                      </div>
                    </div>
                    <Btn variant="danger" size="sm" onClick={() => onRemove(cs)}>
                      <Trash2 size={13} /> Retirer
                    </Btn>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PanelPeriods({
  periods, classes, onAdd, onToggle,
}: {
  periods: GradingPeriod[];
  classes: ClassItem[];
  onAdd: () => void;
  onToggle: (p: GradingPeriod) => void;
}) {
  return (
    <div className="space-y-6">
      <PanelHeader
        icon={ClipboardList}
        title="Périodes d'évaluation"
        subtitle="Trimestres ou semestres de l'année scolaire en cours."
        actions={
          <Btn variant="primary" onClick={onAdd}>
            <Plus size={16} /> Nouvelle période
          </Btn>
        }
      />

      {periods.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucune période configurée"
          description="Les périodes regroupent les notes d'un même moment de l'année (trimestre, semestre, période de rattrapage)."
          action={<Btn variant="primary" onClick={onAdd}><Plus size={16} /> Créer une période</Btn>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {periods.map((p) => {
            const scope = p.class_id
              ? classes.find((c) => c.id === p.class_id)?.name ?? 'Classe inconnue'
              : 'Toutes les classes';
            return (
              <Card
                key={p.id}
                interactive
                className={cx('p-4', p.is_active && 'border-brand-200 shadow-card')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cx(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold tabular-nums',
                        p.is_active ? 'bg-brand-600 text-white shadow-brand' : 'bg-slate-100 text-slate-400'
                      )}
                    >
                      {p.period_order}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{p.name}</p>
                      <p className="truncate text-[11px] text-slate-400">{scope}</p>
                    </div>
                  </div>
                  <Switch
                    checked={p.is_active}
                    onChange={() => onToggle(p)}
                    label={p.is_active ? `Désactiver ${p.name}` : `Activer ${p.name}`}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                    <CalendarDays size={12} /> {formatDateRange(p.start_date, p.end_date)}
                  </span>
                  <Badge tone={p.is_active ? 'brand' : 'slate'}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PanelGradeTypes({ gradeTypes, onAdd }: { gradeTypes: GradeType[]; onAdd: () => void }) {
  const totalWeight = gradeTypes.reduce((s, gt) => s + gt.weight, 0);

  return (
    <div className="space-y-6">
      <PanelHeader
        icon={Star}
        title="Types d'évaluation"
        subtitle="Contrôle, examen, devoir… et leur poids respectif dans la moyenne."
        actions={
          <Btn variant="primary" onClick={onAdd}>
            <Plus size={16} /> Nouveau type
          </Btn>
        }
      />

      {gradeTypes.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Aucun type d'évaluation"
          description="Définissez les types d'évaluations utilisées dans l'établissement (contrôle, examen blanc, devoir…) pour pouvoir saisir des notes."
          action={<Btn variant="primary" onClick={onAdd}><Plus size={16} /> Créer un type</Btn>}
        />
      ) : (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Weight size={16} />
              </span>
              <p className="text-[13px] text-slate-500">
                Poids cumulé des types d'évaluation
              </p>
            </div>
            <Badge tone="amber">×{totalWeight.toFixed(1)} au total</Badge>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {gradeTypes.map((gt) => (
              <Card key={gt.id} interactive className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <Star size={17} />
                  </span>
                  <Badge tone="amber">×{gt.weight}</Badge>
                </div>
                <p className="mt-3 truncate text-sm font-bold text-slate-800">{gt.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">Note sur {gt.max_score}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${totalWeight > 0 ? Math.min((gt.weight / totalWeight) * 100, 100) : 0}%` }}
                  />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
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
  const [savedGrades,  setSavedGrades]  = useState<Grade[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');

  const [selClass,      setSelClass]      = useState('');
  const [selSubject,    setSelSubject]    = useState('');
  const [selPeriod,     setSelPeriod]     = useState('');
  const [selGradeType,  setSelGradeType]  = useState('');

  const [scoreMap, setScoreMap] = useState<Record<string, { score: string; is_absent: boolean }>>({});
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!yearId) return;
    Promise.all([
      invoke<ClassItem[]>('get_classes', { schoolId, academicYearId: yearId }),
      invoke<GradingPeriod[]>('get_grading_periods', { schoolId, academicYearId: yearId, classId: null }),
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

  useEffect(() => {
    if (!selSubject || !selPeriod || !yearId) return;
    setLoading(true);
    setError('');
    invoke<Grade[]>('get_grades_by_class', {
      schoolId, academicYearId: yearId, classSubjectId: selSubject, gradingPeriodId: selPeriod,
    }).then((gs) => {
      setSavedGrades(gs);
      setStudents((currentStudents) => {
        const map: Record<string, { score: string; is_absent: boolean }> = {};
        gs.filter((g) => !selGradeType || g.grade_type_id === selGradeType).forEach((g) => {
          map[g.student_id] = { score: String(g.score), is_absent: g.is_absent };
        });
        currentStudents.forEach((s) => {
          if (!map[s.student_id]) map[s.student_id] = { score: '', is_absent: false };
        });
        setScoreMap(map);
        return currentStudents;
      });
      setLoading(false);
    }).catch((e: any) => {
      setError('Erreur lors du chargement des notes: ' + String(e));
      setLoading(false);
    });
  }, [selSubject, selPeriod, selGradeType, schoolId, yearId]);

  const maxScore = gradeTypes.find((gt) => gt.id === selGradeType)?.max_score ?? 20;
  const ready = Boolean(selClass && selSubject && selPeriod && selGradeType);

  const entries = useMemo(
    () => students.map((s) => scoreMap[s.student_id] ?? { score: '', is_absent: false }),
    [students, scoreMap]
  );
  const filledCount = entries.filter((e) => e.score !== '' || e.is_absent).length;
  const absentCount = entries.filter((e) => e.is_absent).length;
  const classAverage = (() => {
    const scores = entries
      .filter((e) => !e.is_absent && e.score !== '')
      .map((e) => (parseFloat(e.score) / maxScore) * 20);
    return scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '—';
  })();

  const setEntry = (studentId: string, patch: Partial<{ score: string; is_absent: boolean }>) =>
    setScoreMap((m) => ({
      ...m,
      [studentId]: { ...(m[studentId] ?? { score: '', is_absent: false }), ...patch },
    }));

  const saveAll = async () => {
    if (!selSubject || !selPeriod || !selGradeType) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      let saved = 0;
      for (const student of students) {
        const entry = scoreMap[student.student_id];
        if (!entry) continue;
        if (entry.score === '' && !entry.is_absent) continue;
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
        saved++;
      }
      setSuccess(`${saved} note(s) enregistrée(s) avec succès.`);
    } catch (e: any) { setError(String(e)); }
    finally { setSaving(false); }
  };

  const selectedClassName  = classes.find((c) => c.id === selClass)?.name;
  const selectedSubjectName = classSubjects.find((cs) => cs.id === selSubject)?.subject_name;
  const selectedPeriodName  = periods.find((p) => p.id === selPeriod)?.name;
  const selectedTypeName    = gradeTypes.find((gt) => gt.id === selGradeType)?.name;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-4 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Classe">
            <Select
              value={selClass}
              onChange={(e) => { setSelClass(e.target.value); setSelSubject(''); }}
            >
              <option value="">-- Choisir une classe --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Matière">
            <Select
              value={selSubject}
              onChange={(e) => setSelSubject(e.target.value)}
              disabled={!selClass && classSubjects.length === 0}
            >
              {!selClass ? (
                <option value="">-- Sélectionnez d'abord une classe --</option>
              ) : classSubjects.length === 0 ? (
                <option value="">-- Aucune matière affectée à cette classe --</option>
              ) : (
                <option value="">-- Choisir une matière --</option>
              )}
              {classSubjects.map((cs) => (
                <option key={cs.id} value={cs.id}>{cs.subject_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Période">
            <Select value={selPeriod} onChange={(e) => setSelPeriod(e.target.value)}>
              <option value="">-- Choisir une période --</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.is_active}>
                  {p.name}{p.is_active ? '' : ' (inactive)'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type d'évaluation">
            <Select value={selGradeType} onChange={(e) => setSelGradeType(e.target.value)}>
              <option value="">-- Choisir un type --</option>
              {gradeTypes.map((gt) => (
                <option key={gt.id} value={gt.id}>{gt.name} (/{gt.max_score})</option>
              ))}
            </Select>
          </Field>
        </div>

        {ready && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
            <span className="font-semibold text-slate-700">{selectedClassName}</span>
            <span className="text-slate-300">·</span>
            <span>{selectedSubjectName}</span>
            <span className="text-slate-300">·</span>
            <span>{selectedPeriodName}</span>
            <span className="text-slate-300">·</span>
            <span>{selectedTypeName}</span>
            <Badge tone="slate" className="ml-1">note sur {maxScore}</Badge>
            {savedGrades.length > 0 && (
              <Badge tone="emerald" className="ml-1">
                {savedGrades.length} note(s) déjà enregistrée(s)
              </Badge>
            )}
          </p>
        )}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-8">
        {error && <Alert message={error} onClose={() => setError('')} />}
        {success && <Alert tone="success" message={success} onClose={() => setSuccess('')} />}

        {!ready ? (
          <EmptyState
            icon={ClipboardList}
            title="Sélectionnez le contexte de saisie"
            description="Choisissez une classe, une matière, une période et un type d'évaluation pour saisir les notes."
          />
        ) : loading ? (
          <Loader label="Chargement des notes…" />
        ) : students.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aucun élève inscrit"
            description="Cette classe ne contient aucun élève. Ajoutez des inscriptions depuis l'onglet « Élèves & Inscriptions »."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi icon={Users} label="Élèves" value={students.length} tone="blue" />
              <Kpi
                icon={CheckCircle2}
                label="Notes saisies"
                value={`${filledCount}/${students.length}`}
                tone="brand"
                progress={students.length ? (filledCount / students.length) * 100 : 0}
              />
              <Kpi icon={UserX} label="Absents" value={absentCount} tone="amber" />
              <Kpi icon={BarChart3} label="Moyenne de la classe" value={`${classAverage}/20`} tone="emerald" />
            </div>

            <TableShell>
              <div className="custom-scrollbar max-h-[60vh] overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <Th className="w-10 text-center">#</Th>
                      <Th>Élève</Th>
                      <Th className="w-32 text-center">Note /{maxScore}</Th>
                      <Th className="w-24 text-center">/20</Th>
                      <Th className="w-28 text-center">Statut</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => {
                      const entry = scoreMap[s.student_id] ?? { score: '', is_absent: false };
                      const numeric = entry.score === '' ? null : parseFloat(entry.score);
                      const invalid =
                        numeric !== null && (Number.isNaN(numeric) || numeric < 0 || numeric > maxScore);
                      const scoreOn20 =
                        !entry.is_absent && numeric !== null && !invalid ? ((numeric / maxScore) * 20).toFixed(2) : null;
                      const name = `${s.last_name ?? ''} ${s.first_name ?? ''}`.trim();
                      return (
                        <tr
                          key={s.student_id}
                          className={cx(
                            'border-b border-slate-100 transition-colors last:border-0',
                            entry.is_absent ? 'bg-amber-50/50' : 'hover:bg-slate-50/70'
                          )}
                        >
                          <Td className="text-center text-[11px] font-semibold tabular-nums text-slate-400">
                            {i + 1}
                          </Td>
                          <Td>
                            <div className="flex items-center gap-3">
                              <Avatar name={name || '?'} size={32} />
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-slate-700">
                                  {name || 'Élève sans nom'}
                                </p>
                                {s.matricule && (
                                  <p className="text-[11px] tabular-nums text-slate-400">#{s.matricule}</p>
                                )}
                              </div>
                            </div>
                          </Td>
                          <Td className="text-center">
                            <input
                              ref={(el) => { inputRefs.current[i] = el; }}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={maxScore}
                              step={0.5}
                              disabled={entry.is_absent}
                              aria-label={`Note de ${name || `l'élève ${i + 1}`}`}
                              value={entry.score}
                              placeholder="—"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  inputRefs.current[i + 1]?.focus();
                                }
                              }}
                              onChange={(e) => setEntry(s.student_id, { score: e.target.value })}
                              className={cx(
                                'w-20 rounded-lg border px-2 py-1.5 text-center text-sm font-semibold tabular-nums outline-none transition',
                                invalid
                                  ? 'border-red-300 bg-red-50 text-red-700 ring-4 ring-red-500/10'
                                  : 'border-slate-200 bg-slate-50/70 text-slate-700 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10',
                                entry.is_absent && 'cursor-not-allowed opacity-40'
                              )}
                            />
                          </Td>
                          <Td className="text-center">
                            {entry.is_absent ? (
                              <Badge tone="amber">Absent</Badge>
                            ) : scoreOn20 ? (
                              <span className={cx('text-sm font-bold tabular-nums', avgText(parseFloat(scoreOn20)))}>
                                {scoreOn20}
                              </span>
                            ) : (
                              <span className="text-sm text-slate-300">—</span>
                            )}
                          </Td>
                          <Td className="text-center">
                            <button
                              onClick={() =>
                                setEntry(s.student_id, { is_absent: !entry.is_absent, score: '' })
                              }
                              aria-pressed={entry.is_absent}
                              className={cx(
                                'rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors',
                                entry.is_absent
                                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'
                              )}
                            >
                              {entry.is_absent ? 'ABS' : 'Présent'}
                            </button>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TableShell>

            <p className="text-[11px] text-slate-400">
              Astuce : utilisez <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-sans text-[10px]">Entrée</kbd> pour passer à l'élève suivant.
            </p>
          </div>
        )}
      </div>

      {ready && students.length > 0 && !loading && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-white px-5 py-3 lg:px-8">
          <p className="text-[12px] text-slate-500">
            <strong className="text-slate-700">{filledCount}</strong> / {students.length} élève(s) noté(s)
            {absentCount > 0 && ` · ${absentCount} absent(s)`}
          </p>
          <Btn variant="primary" onClick={saveAll} disabled={saving || filledCount === 0}>
            <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer les notes'}
          </Btn>
        </div>
      )}
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
      invoke<GradingPeriod[]>('get_grading_periods', { schoolId, academicYearId: yearId, classId: null }),
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

  const averages = rankings
    .map((r) => r.general_average)
    .filter((a): a is number => a !== null);

  const filtered = rankings.filter((r) =>
    search.trim() === '' ||
    `${r.first_name} ${r.last_name}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  const distribution = DISTRIBUTION.map((b) => ({
    ...b,
    count: averages.filter(b.test).length,
  }));
  const maxBin = Math.max(1, ...distribution.map((d) => d.count));

  const exportReport = () => {
    const c = classes.find((x) => x.id === selClass);
    const p = periods.find((x) => x.id === selPeriod);
    generateClassReport(
      'ORION ÉDUCATION',
      selectedYear?.name || '',
      p ? p.name : 'Période',
      c ? c.name : 'Classe',
      rankings,
      stats
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-4 lg:px-8">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Classe" className="w-full sm:w-48">
            <Select value={selClass} onChange={(e) => setSelClass(e.target.value)}>
              <option value="">-- Choisir une classe --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Période" className="w-full sm:w-48">
            <Select value={selPeriod} onChange={(e) => setSelPeriod(e.target.value)}>
              <option value="">-- Choisir une période --</option>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>

          <Segmented<'classement' | 'stats'>
            value={view}
            onChange={setView}
            className="sm:ml-auto"
            options={[
              { value: 'classement', label: 'Classement', icon: Trophy },
              { value: 'stats', label: 'Statistiques', icon: BarChart3 },
            ]}
          />

          {view === 'classement' && (
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher un élève…"
              className="w-full sm:w-56"
            />
          )}

          {selClass && selPeriod && rankings.length > 0 && (
            <Btn variant="subtle" onClick={exportReport}>
              <FileText size={15} /> Télécharger le palmarès
            </Btn>
          )}
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-8">
        {!selClass || !selPeriod ? (
          <EmptyState
            icon={Trophy}
            title="Sélectionnez une classe et une période"
            description="Le classement, les moyennes par matière et le palmarès s'afficheront ici."
          />
        ) : loading ? (
          <Loader label="Calcul des résultats…" />
        ) : rankings.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="Aucune note sur cette période"
            description="Saisissez des notes depuis l'onglet « Saisie des notes » pour générer le classement de la classe."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi icon={Users} label="Élèves classés" value={rankings.length} tone="brand" />
              <Kpi
                icon={BarChart3}
                label="Moyenne générale"
                value={averages.length ? `${(averages.reduce((a, b) => a + b, 0) / averages.length).toFixed(2)}/20` : '—'}
                tone="blue"
              />
              <Kpi
                icon={Trophy}
                label="Meilleure moyenne"
                value={rankings[0]?.general_average?.toFixed(2) ?? '—'}
                tone="emerald"
              />
              <Kpi
                icon={CheckCircle2}
                label="Taux de réussite"
                value={`${Math.round((rankings.filter((r) => (r.general_average ?? 0) >= 10).length / rankings.length) * 100)}%`}
                tone="amber"
                progress={(rankings.filter((r) => (r.general_average ?? 0) >= 10).length / rankings.length) * 100}
              />
            </div>

            {view === 'classement' ? (
              <div className="mt-4 space-y-4">
                <Card className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-slate-800">Répartition des moyennes</p>
                    <p className="text-[11px] text-slate-400">{averages.length} élève(s) noté(s)</p>
                  </div>
                  <div className="mt-5 flex items-end gap-3">
                    {distribution.map((d) => (
                      <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
                        <span className="text-[13px] font-bold tabular-nums text-slate-600">{d.count}</span>
                        <div className="flex h-20 w-full items-end overflow-hidden rounded-lg bg-slate-100/70">
                          <div
                            className={cx('w-full rounded-lg transition-all duration-500', d.bar)}
                            style={{ height: `${(d.count / maxBin) * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums text-slate-400">{d.label}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <TableShell>
                  <div className="custom-scrollbar max-h-[60vh] overflow-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <Th className="w-16 text-center">Rang</Th>
                          <Th>Élève</Th>
                          <Th className="w-40 text-center">Moyenne générale</Th>
                          <Th className="w-48 text-center">Appréciation</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => {
                          const name = `${r.last_name} ${r.first_name}`;
                          return (
                            <tr
                              key={r.enrollment_id}
                              className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70"
                            >
                              <Td className="text-center">
                                <span
                                  className={cx(
                                    'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                                    RANK_CHIP[r.rank] ?? 'bg-slate-100 text-slate-500'
                                  )}
                                >
                                  {r.rank}
                                </span>
                              </Td>
                              <Td>
                                <div className="flex items-center gap-3">
                                  <Avatar name={name} size={32} />
                                  <p className="truncate text-[13px] font-semibold text-slate-700">{name}</p>
                                </div>
                              </Td>
                              <Td className="text-center">
                                <span
                                  className={cx(
                                    'text-base font-bold tabular-nums',
                                    avgText(r.general_average)
                                  )}
                                >
                                  {r.general_average !== null ? r.general_average.toFixed(2) : '—'}
                                </span>
                              </Td>
                              <Td className="text-center">
                                <Badge tone={APPRECIATION_TONE[r.appreciation] ?? 'slate'} className="px-2.5 py-1 text-xs">
                                  {r.appreciation}
                                </Badge>
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </TableShell>

                {filtered.length === 0 && (
                  <p className="py-6 text-center text-[13px] text-slate-400">
                    Aucun élève ne correspond à « {search} ».
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {stats.length === 0 ? (
                  <EmptyState
                    icon={BarChart3}
                    title="Aucune statistique disponible"
                    description="Les statistiques par matière apparaîtront dès que des notes seront saisies pour cette période."
                  />
                ) : (
                  stats.map((s) => {
                    const good = s.success_rate >= 50;
                    return (
                      <Card key={s.class_subject_id} className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-[11px] font-bold text-brand-700">
                              {initials(s.subject_code).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-800">{s.subject_name}</p>
                              <p className="text-[11px] text-slate-400">{s.grade_count} note(s) saisie(s)</p>
                            </div>
                          </div>
                          <Badge tone={good ? 'emerald' : 'amber'}>
                            {s.success_rate.toFixed(0)}% de réussite
                          </Badge>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {[
                            { label: 'Moyenne classe', val: s.class_average?.toFixed(2) ?? '—', cls: 'text-brand-600' },
                            { label: 'Minimum', val: s.min_score?.toFixed(2) ?? '—', cls: 'text-red-500' },
                            { label: 'Maximum', val: s.max_score?.toFixed(2) ?? '—', cls: 'text-emerald-600' },
                            { label: 'Taux de réussite', val: `${s.success_rate.toFixed(0)}%`, cls: good ? 'text-emerald-600' : 'text-amber-600' },
                          ].map((k) => (
                            <div key={k.label} className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
                              <p className={cx('text-lg font-bold tabular-nums', k.cls)}>{k.val}</p>
                              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                {k.label}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="relative mt-5 h-2 overflow-visible rounded-full bg-slate-100">
                          <div
                            className={cx('h-full rounded-full transition-all duration-500', good ? 'bg-emerald-400' : 'bg-amber-400')}
                            style={{ width: `${Math.min(Math.max(s.success_rate, 0), 100)}%` }}
                          />
                          <span
                            className="absolute -top-1.5 h-5 w-px bg-slate-400"
                            style={{ left: '50%' }}
                            aria-hidden
                          />
                        </div>
                        <div className="mt-2 flex justify-between text-[10px] font-medium text-slate-400">
                          <span>0%</span>
                          <span className="text-slate-500">Seuil de réussite · 50%</span>
                          <span>100%</span>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET 4 — PROFESSEUR / MATIÈRE
// ═══════════════════════════════════════════════════════════

interface StaffMember {
  id: string;
  nom: string;
  prenoms: string;
  type_personnel: string | null;
  fonction: string | null;
  specialite: string | null;
  matiere_principale: string | null;
  statut_administratif: string;
}

function PanelProfesseurs({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  
  // Nouveau state pour la sélection multi-classes
  const [selectedClassesAssign, setSelectedClassesAssign] = useState<string[]>([]);
  const [savingMulti, setSavingMulti] = useState<boolean>(false);

  // Reset des classes sélectionnées quand on change de prof
  useEffect(() => {
    setSelectedClassesAssign([]);
  }, [selectedStaff]);

  const load = useCallback(async () => {
    if (!yearId) return;
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        invoke<StaffMember[]>('get_staff', { schoolId }),
        invoke<ClassItem[]>('get_classes', { schoolId, academicYearId: yearId }),
      ]);
      setStaff(s.filter(m => {
        const type = (m.type_personnel || '').toLowerCase();
        const f = (m.fonction || '').toLowerCase();
        return type === 'enseignant' || f.includes('prof');
      }));
      setClasses(c);
    } catch (e: any) { setError(String(e)); }
    finally { setLoading(false); }
  }, [schoolId, yearId]);

  const loadClassSubjectsForStaff = useCallback(async () => {
    if (!yearId) return;
    try {
      const all: ClassSubject[] = [];
      for (const cls of classes) {
        const cs = await invoke<ClassSubject[]>('get_class_subjects', { schoolId, academicYearId: yearId, classId: cls.id });
        all.push(...cs);
      }
      setClassSubjects(all);
    } catch (e: any) { setError(String(e)); }
  }, [schoolId, yearId, classes]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (classes.length > 0) loadClassSubjectsForStaff(); }, [classes, loadClassSubjectsForStaff]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const getSubjectsForStaff = (staffId: string) =>
    classSubjects.filter(cs => cs.teacher_id === staffId);

  const availableSubjectsForAssign = useMemo(() => {
    if (selectedClassesAssign.length === 0) return [];
    const map = new Map<string, { id: string; name: string; assignedCount: number; totalCount: number }>();
    
    classSubjects.forEach(cs => {
      if (selectedClassesAssign.includes(cs.class_id)) {
        const existing = map.get(cs.subject_id) || { id: cs.subject_id, name: cs.subject_name || 'Inconnu', assignedCount: 0, totalCount: 0 };
        existing.totalCount++;
        if (cs.teacher_id === selectedStaff?.id) {
          existing.assignedCount++;
        }
        map.set(cs.subject_id, existing);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [classSubjects, selectedClassesAssign, selectedStaff]);

  const toggleSubjectMulti = async (subjectId: string, isFullyAssigned: boolean) => {
    if (!selectedStaff) return;
    setSavingMulti(true);
    try {
      const toUpdate = classSubjects.filter(cs => 
        selectedClassesAssign.includes(cs.class_id) && 
        cs.subject_id === subjectId
      );
      
      const newTeacherId = isFullyAssigned ? null : selectedStaff.id;

      for (const cs of toUpdate) {
        if (cs.teacher_id !== newTeacherId) {
          await invoke('update_class_subject', {
            id: cs.id,
            schoolId,
            coefficient: cs.coefficient ?? 1,
            teacherId: newTeacherId,
            weeklyHours: cs.weekly_hours ?? null,
            subjectType: cs.subject_type ?? null,
            isMandatory: cs.is_mandatory ?? true,
            orderIndex: cs.order_index ?? 0,
            colorIcon: cs.color_icon ?? null,
          });
        }
      }
      await loadClassSubjectsForStaff();
      showSuccess('Affectations mises à jour.');
    } catch (e: any) {
      setError(String(e));
    } finally {
      setSavingMulti(false);
    }
  };

  const assignTeacher = async (csId: string, cs: ClassSubject, staffId: string | null) => {
    setSaving(csId);
    try {
      await invoke('update_class_subject', {
        id: csId,
        schoolId,
        coefficient: cs.coefficient ?? 1,
        teacherId: staffId,
        weeklyHours: cs.weekly_hours ?? null,
        subjectType: cs.subject_type ?? null,
        isMandatory: cs.is_mandatory ?? true,
        orderIndex: cs.order_index ?? 0,
        colorIcon: cs.color_icon ?? null,
      });
      await loadClassSubjectsForStaff();
      showSuccess('Affectation mise à jour.');
    } catch (e: any) { setError(String(e)); }
    finally { setSaving(null); }
  };

  const filteredStaff = staff.filter(s => {
    const q = search.toLowerCase();
    const nom = (s.nom || '').toLowerCase();
    const prenoms = (s.prenoms || '').toLowerCase();
    const spec = (s.specialite || '').toLowerCase();
    const mat = (s.matiere_principale || '').toLowerCase();
    return !q || nom.includes(q) || prenoms.includes(q) || spec.includes(q) || mat.includes(q);
  });

  const getInitials = (s: StaffMember) => {
    const p = s.prenoms || '';
    const n = s.nom || '';
    return (p.charAt(0) + n.charAt(0)).toUpperCase();
  };

  const getFullName = (s: StaffMember) => {
    const p = s.prenoms || '';
    const n = s.nom || '';
    return `${p} ${n.toUpperCase()}`.trim() || 'Inconnu';
  };

  const getRole = (s: StaffMember) => {
    return s.specialite || s.matiere_principale || s.fonction || 'Enseignant';
  };

  if (loading) return <Loader label="Chargement des professeurs..." />;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 shrink-0 border-r border-slate-100 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-[15px] font-bold text-slate-800 mb-3">Enseignants</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 placeholder:text-slate-400"
            />
          </div>
        </div>

        {error && <Alert tone="error" className="mx-4 mt-3" message={error} onClose={() => setError('')} />}
        {success && <Alert tone="success" className="mx-4 mt-3" message={success} onClose={() => setSuccess('')} />}

        <div className="flex-1 overflow-y-auto p-2">
          {filteredStaff.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-2">
              <UserCheck size={32} strokeWidth={1} className="opacity-40" />
              <p>Aucun enseignant trouvé</p>
            </div>
          ) : (
            filteredStaff.map(member => {
              const assignedCount = getSubjectsForStaff(member.id).length;
              const isSelected = selectedStaff?.id === member.id;
              return (
                <button
                  key={member.id}
                  onClick={() => setSelectedStaff(member)}
                  className={cx(
                    'w-full text-left p-3 rounded-xl mb-1 transition-all',
                    isSelected ? 'bg-brand-50 border border-brand-200' : 'hover:bg-slate-50 border border-transparent',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cx(
                      'w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0',
                      isSelected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600',
                    )}>
                      {getInitials(member)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">{getFullName(member)}</p>
                      <p className="text-[11px] text-slate-400 truncate">{getRole(member)}</p>
                    </div>
                    {assignedCount > 0 && (
                      <span className="ml-auto flex-shrink-0 text-[10px] font-bold bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-md">
                        {assignedCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fc]">
        {!selectedStaff ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <UserCheck size={48} strokeWidth={1} className="opacity-30" />
            <p className="text-sm">Sélectionnez un enseignant pour gérer ses affectations</p>
          </div>
        ) : (
          <div className="p-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-lg font-bold shadow-brand flex-shrink-0">
                {getInitials(selectedStaff)}
              </div>
              <div>
                <h2 className="text-[17px] font-bold text-slate-800">{getFullName(selectedStaff)}</h2>
                <p className="text-[13px] text-slate-500">{getRole(selectedStaff)}</p>
                <p className="text-[12px] text-brand-600 font-semibold mt-0.5">
                  {getSubjectsForStaff(selectedStaff.id).length} cours assigné(s)
                </p>
              </div>
            </div>

            <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-3">Cours déjà assignés</h3>
            {getSubjectsForStaff(selectedStaff.id).length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm mb-6">
                Aucun cours assigné à cet enseignant
              </div>
            ) : (
              <div className="space-y-2 mb-8">
                {getSubjectsForStaff(selectedStaff.id).map(cs => (
                  <div key={cs.id} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
                    <div className="w-2 h-8 rounded-full bg-brand-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-slate-800 truncate">{cs.subject_name || 'Inconnu'}</p>
                      <p className="text-[11px] text-slate-400">
                        {cs.class_name || 'Classe inconnue'} · Coeff. {cs.coefficient ?? 1}{cs.weekly_hours ? ` · ${cs.weekly_hours}h/sem` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => assignTeacher(cs.id, cs, null)}
                      disabled={saving === cs.id}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      {saving === cs.id ? <span className="w-3 h-3 border-2 border-slate-300 border-t-brand-500 rounded-full animate-spin" /> : <X size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Nouvelle interface d'affectation 2 étapes */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-brand-500" />
              
              <h3 className="text-[15px] font-bold text-slate-800 mb-6 flex items-center gap-2">
                Nouvelle affectation
              </h3>

              {/* ETAPE 1 */}
              <div className="mb-8">
                <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[11px]">1</span>
                  Sélectionner la ou les classes
                </label>
                <div className="flex flex-wrap gap-2 pl-7">
                  {classes.map(cls => {
                    const isSelected = selectedClassesAssign.includes(cls.id);
                    return (
                      <button
                        key={cls.id}
                        onClick={() => setSelectedClassesAssign(prev => 
                          isSelected ? prev.filter(id => id !== cls.id) : [...prev, cls.id]
                        )}
                        className={cx(
                          'px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all border shadow-sm',
                          isSelected
                            ? 'bg-brand-600 text-white border-brand-600 shadow-brand'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        )}
                      >
                        {cls.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ETAPE 2 */}
              <div className={cx("transition-all duration-300", selectedClassesAssign.length > 0 ? "opacity-100" : "opacity-40 pointer-events-none")}>
                <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cx("w-5 h-5 rounded-full flex items-center justify-center text-[11px]", selectedClassesAssign.length > 0 ? "bg-brand-100 text-brand-600" : "bg-slate-100 text-slate-500")}>2</span>
                    Choisir la ou les matières
                  </div>
                  {savingMulti && <span className="text-brand-500 flex items-center gap-1 normal-case font-semibold"><span className="w-3 h-3 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" /> Enregistrement...</span>}
                </label>
                
                <div className="pl-7">
                  {selectedClassesAssign.length > 0 && availableSubjectsForAssign.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-[13px] bg-slate-50 rounded-xl border border-slate-100">
                      Aucune matière n'est configurée dans ces classes pour le moment.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {availableSubjectsForAssign.map(sub => {
                        const isFullyAssigned = sub.assignedCount === sub.totalCount;
                        const isPartiallyAssigned = sub.assignedCount > 0 && sub.assignedCount < sub.totalCount;

                        return (
                          <button
                            key={sub.id}
                            disabled={savingMulti}
                            onClick={() => toggleSubjectMulti(sub.id, isFullyAssigned)}
                            className={cx(
                              'flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all',
                              isFullyAssigned
                                ? 'bg-brand-50 border-brand-300 text-brand-900 shadow-sm'
                                : isPartiallyAssigned
                                ? 'bg-brand-50/50 border-brand-200 text-brand-800'
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm text-slate-700'
                            )}
                          >
                            <span className="text-[13.5px] font-semibold truncate pr-3">{sub.name}</span>
                            <div className={cx(
                              'w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors',
                              isFullyAssigned ? 'border-brand-600 bg-brand-600 text-white' : isPartiallyAssigned ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-slate-50'
                            )}>
                              {isFullyAssigned ? <Check size={12} strokeWidth={4} /> : isPartiallyAssigned ? <div className="w-2.5 h-0.5 bg-white rounded-full" /> : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedClassesAssign.length > 0 && availableSubjectsForAssign.length > 0 && (
                     <p className="mt-4 text-[11px] text-slate-400">
                        Cliquez sur une matière pour l'assigner au professeur dans toutes les classes sélectionnées ci-dessus. Un tiret indique une assignation partielle (la matière est assignée dans certaines des classes sélectionnées mais pas toutes).
                     </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}