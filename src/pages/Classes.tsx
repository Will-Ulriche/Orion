import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useYear } from '../contexts/YearContext';
import { useAuth } from '../contexts/AuthContext';
import {
  GraduationCap, Plus, Search, Pencil, Trash2,
  Users, ChevronDown, BookOpen, X, Check, AlertCircle,
  Layers, Calendar, ChevronRight, Zap, Minus,
  LayoutGrid
} from 'lucide-react';
import { LevelDropdown } from '../components/ui';

interface Class {
  id: string;
  school_id: string;
  academic_year_id: string;
  name: string;
  level: string | null;
  level_id: string | null;
  series_id: string | null;
  student_count: number;
  homeroom_teacher_id: string | null;
  homeroom_teacher_name: string | null;
}

interface Staff {
  id: string;
  nom: string;
  prenoms: string;
}

interface Section {
  id: string;
  school_id: string;
  name: string;
}

interface Level {
  id: string;
  school_id: string;
  section_id: string;
  name: string;
  level_order: number;
}

interface Series {
  id: string;
  school_id: string;
  level_id: string;
  name: string;
}

interface GradingPeriod {
  id: string;
  class_id: string | null;
  name: string;
  period_order: number;
  is_active: boolean;
}

interface PeriodDraft {
  id?: string;
  name: string;
  period_order: number;
  start_date: string;
  end_date: string;
}

const ROW_COLORS = [
  { bg: '#eef2ff', bar: '#6366f1' }, // indigo
  { bg: '#eff6ff', bar: '#3b82f6' }, // blue
  { bg: '#f0fdf4', bar: '#22c55e' }, // green
  { bg: '#fff7ed', bar: '#f97316' }, // orange
  { bg: '#fdf4ff', bar: '#a855f7' }, // purple
  { bg: '#f0fdfa', bar: '#14b8a6' }, // teal
  { bg: '#fff1f2', bar: '#f43f5e' }, // rose
];

const PERIOD_TEMPLATES: { label: string; icon: string; periods: Omit<PeriodDraft, 'start_date' | 'end_date'>[] }[] = [
  {
    label: '3 Trimestres',
    icon: '3️⃣',
    periods: [
      { name: 'Trimestre 1', period_order: 1 },
      { name: 'Trimestre 2', period_order: 2 },
      { name: 'Trimestre 3', period_order: 3 },
    ],
  },
  {
    label: '2 Semestres',
    icon: '2️⃣',
    periods: [
      { name: 'Semestre 1', period_order: 1 },
      { name: 'Semestre 2', period_order: 2 },
    ],
  },
];

export default function Classes() {
  const { selectedYear } = useYear();
  const { schoolId } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [classPeriods, setClassPeriods] = useState<GradingPeriod[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [classToDelete, setClassToDelete] = useState<Class | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [step, setStep] = useState<'class' | 'periods'>('class');
  const [createdClassId, setCreatedClassId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    level: '',
    level_id: '',
    series_id: '',
    section_id: '',
    homeroom_teacher_id: '',
  });

  const [periods, setPeriods] = useState<PeriodDraft[]>([
    { name: 'Trimestre 1', period_order: 1, start_date: '', end_date: '' },
    { name: 'Trimestre 2', period_order: 2, start_date: '', end_date: '' },
    { name: 'Trimestre 3', period_order: 3, start_date: '', end_date: '' },
  ]);
  const [savingPeriods, setSavingPeriods] = useState(false);

  const filteredSeries = form.level_id
    ? allSeries.filter(s => s.level_id === form.level_id)
    : [];

  const resolveLevelName = (cls: Class): string => {
    if (cls.level_id) {
      const lvl = levels.find(l => l.id === cls.level_id);
      if (lvl) return lvl.name;
    }
    return cls.level?.trim() || 'Sans niveau';
  };

  const loadClasses = async () => {
    if (!selectedYear) return;
    setLoading(true);
    try {
      const data = await invoke<Class[]>('get_classes', { schoolId, academicYearId: selectedYear.id });
      setClasses(data);
      // Charger les périodes de CHAQUE classe pour l'affichage dans le tableau
      const allPeriods: GradingPeriod[] = [];
      for (const cls of data) {
        const ps = await invoke<GradingPeriod[]>('get_grading_periods', {
          schoolId, academicYearId: selectedYear.id, classId: cls.id,
        });
        allPeriods.push(...ps);
      }
      setClassPeriods(allPeriods);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const loadStructure = async () => {
    if (!schoolId) return;
    try {
      const [sects, lvls, srs, stf] = await Promise.all([
        invoke<Section[]>('get_sections', { schoolId }),
        invoke<Level[]>('get_levels', { schoolId, sectionId: null }),
        invoke<Series[]>('get_series', { schoolId, levelId: null }),
        invoke<Staff[]>('get_staff', { schoolId, includePhotos: false }),
      ]);
      setSections(sects);
      setLevels(lvls);
      setAllSeries(srs);
      // Garder uniquement les enseignants
      setStaff(stf.filter((s: any) => {
        const t = (s.type_personnel || '').toLowerCase();
        const f = (s.fonction || '').toLowerCase();
        return t === 'enseignant' || f.includes('prof');
      }));
    } catch (e: any) {
      console.warn('Structure pedagogique non disponible:', e);
    }
  };

  useEffect(() => { loadClasses(); }, [selectedYear]);
  useEffect(() => { loadStructure(); }, [schoolId]);

  const handleSectionChange = (sectionId: string) => {
    setForm(f => ({ ...f, section_id: sectionId, level_id: '', series_id: '', level: '' }));
  };

  const handleSubmitClass = async () => {
    setError(null);
    if (!form.name.trim()) { setError('Le nom de la classe est requis.'); return; }
    if (!selectedYear) { setError('Aucune annee scolaire selectionnee.'); return; }

    try {
      if (editingClass) {
        await invoke('update_class', {
          id: editingClass.id,
          name: form.name.trim(),
          level: form.level || null,
          levelId: form.level_id || null,
          seriesId: form.series_id || null,
          homeroomTeacherId: form.homeroom_teacher_id || null,
        });
        setCreatedClassId(editingClass.id);
        setStep('periods');
      } else {
        const created: any = await invoke('create_class', {
          schoolId,
          academicYearId: selectedYear.id,
          name: form.name.trim(),
          level: form.level || null,
          levelId: form.level_id || null,
          seriesId: form.series_id || null,
          homeroomTeacherId: form.homeroom_teacher_id || null,
        });
        setCreatedClassId(created.id ?? created);
        setStep('periods');
      }
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const handleSavePeriods = async () => {
    if (!createdClassId || !selectedYear) return;
    setSavingPeriods(true);
    setError(null);
    try {
      const valid = periods.filter(p => p.name.trim());

      if (editingClass) {
        // 1. Récupérer les périodes actuelles en BD pour cette classe
        const existingDbPeriods = await invoke<GradingPeriod[]>('get_grading_periods', {
          schoolId,
          academicYearId: selectedYear.id,
          classId: editingClass.id,
        });

        const validIds = valid.map(p => p.id).filter(Boolean);

        // 2. Supprimer uniquement les périodes qui ont été retirées par l'utilisateur
        for (const dbP of existingDbPeriods) {
          if (!validIds.includes(dbP.id)) {
            try { await invoke('delete_grading_period', { id: dbP.id, schoolId }); } catch (err) { console.error(err); }
          }
        }

        // 3. Mettre à jour les existantes, créer les nouvelles
        for (const p of valid) {
          if (p.id) {
            await invoke('update_grading_period', {
              id: p.id,
              schoolId,
              classId: editingClass.id,
              name: p.name.trim(),
              periodOrder: p.period_order,
              startDate: p.start_date || null,
              endDate: p.end_date || null,
              isActive: true,
            });
          } else {
            await invoke('create_grading_period', {
              schoolId,
              academicYearId: selectedYear.id,
              classId: editingClass.id,
              name: p.name.trim(),
              periodOrder: p.period_order,
              startDate: p.start_date || null,
              endDate: p.end_date || null,
            });
          }
        }
      } else {
        // Création : juste créer
        for (const p of valid) {
          await invoke('create_grading_period', {
            schoolId,
            academicYearId: selectedYear.id,
            classId: createdClassId,
            name: p.name.trim(),
            periodOrder: p.period_order,
            startDate: p.start_date || null,
            endDate: p.end_date || null,
          });
        }
      }

      const msg = editingClass
        ? `Classe "${form.name}" et périodes modifiées avec succès !`
        : `Classe "${form.name}" créée avec ${valid.length} période(s) !`;
      setSuccess(msg);
      resetForm();
      await loadClasses();
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setSavingPeriods(false);
    }
  };

  const handleSkipPeriods = async () => {
    setSuccess(`Classe "${form.name}" creee. Vous pouvez configurer les periodes plus tard.`);
    resetForm();
    await loadClasses();
    setTimeout(() => setSuccess(null), 4000);
  };

  const applyTemplate = (tplIdx: number) => {
    const tpl = PERIOD_TEMPLATES[tplIdx];
    // Conserver les IDs existants pour éviter d'écraser et perdre les notes
    setPeriods(tpl.periods.map((p, i) => {
      const existing = periods[i];
      return {
        ...p,
        id: existing?.id,
        start_date: existing?.start_date || '',
        end_date: existing?.end_date || '',
      };
    }));
  };

  const updatePeriod = (idx: number, patch: Partial<PeriodDraft>) => {
    setPeriods(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };

  const addPeriod = () => {
    setPeriods(prev => [...prev, { name: `Periode ${prev.length + 1}`, period_order: prev.length + 1, start_date: '', end_date: '' }]);
  };

  const removePeriod = (idx: number) => {
    setPeriods(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, period_order: i + 1 })));
  };

  const resetForm = () => {
    setForm({ name: '', level: '', level_id: '', series_id: '', section_id: '', homeroom_teacher_id: '' });
    setPeriods([
      { name: 'Trimestre 1', period_order: 1, start_date: '', end_date: '' },
      { name: 'Trimestre 2', period_order: 2, start_date: '', end_date: '' },
      { name: 'Trimestre 3', period_order: 3, start_date: '', end_date: '' },
    ]);
    setShowForm(false);
    setEditingClass(null);
    setCreatedClassId(null);
    setStep('class');
    setError(null);
  };

  const openEdit = async (cls: Class) => {
    setEditingClass(cls);
    const clsLevel = levels.find(l => l.id === cls.level_id);
    setForm({
      name: cls.name,
      level: cls.level ?? '',
      level_id: cls.level_id ?? '',
      series_id: cls.series_id ?? '',
      section_id: clsLevel?.section_id ?? '',
      homeroom_teacher_id: cls.homeroom_teacher_id ?? '',
    });
    // Charger les périodes DIRECTEMENT depuis la BD pour cette classe
    try {
      const dbPeriods = await invoke<GradingPeriod[]>('get_grading_periods', {
        schoolId, academicYearId: selectedYear!.id, classId: cls.id,
      });
      const existing = dbPeriods
        .sort((a, b) => a.period_order - b.period_order)
        .map(p => ({
          id: p.id,
          name: p.name,
          period_order: p.period_order,
          start_date: '',
          end_date: '',
        }));
      setPeriods(existing.length > 0 ? existing : [
        { name: 'Trimestre 1', period_order: 1, start_date: '', end_date: '' },
        { name: 'Trimestre 2', period_order: 2, start_date: '', end_date: '' },
        { name: 'Trimestre 3', period_order: 3, start_date: '', end_date: '' },
      ]);
    } catch (_) {
      setPeriods([
        { name: 'Trimestre 1', period_order: 1, start_date: '', end_date: '' },
        { name: 'Trimestre 2', period_order: 2, start_date: '', end_date: '' },
        { name: 'Trimestre 3', period_order: 3, start_date: '', end_date: '' },
      ]);
    }
    setStep('class');
    setShowForm(true);
  };

  const confirmDelete = async () => {
    if (!classToDelete) return;
    try {
      await invoke('delete_class', { id: classToDelete.id });
      setSuccess(`Classe "${classToDelete.name}" supprimée.`);
      await loadClasses();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setClassToDelete(null);
    }
  };

  const uniqueLevels = useMemo(() => {
    const names = new Set(classes.map(resolveLevelName));
    return [...names].filter(n => n !== 'Sans niveau').length;
  }, [classes, levels]);

  const filteredList = useMemo(() => {
    const q = search.toLowerCase().trim();
    return classes
      .filter(c => {
        if (!q) return true;
        const levelName = resolveLevelName(c);
        const series = allSeries.find(s => s.id === c.series_id)?.name ?? '';
        return (
          c.name.toLowerCase().includes(q) ||
          levelName.toLowerCase().includes(q) ||
          series.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [classes, levels, allSeries, search]);

  const hasStructure = sections.length > 0;
  const totalStudents = classes.reduce((s, c) => s + c.student_count, 0);
  const visibleCount = filteredList.length;

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full flex flex-col bg-[#f8f9fc] overflow-hidden">

      <div className="mb-5 flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight">Gestion des classes</h2>
          <p className="text-slate-500 mt-0.5 text-[13px]">
            {selectedYear
              ? <>Année : <span className="font-semibold text-[#4f46e5]">{selectedYear.name}</span> · Toutes les classes de l’année</>
              : 'Aucune année scolaire sélectionnée'}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          disabled={!selectedYear}
          className="flex items-center gap-2 bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-[0_4px_14px_0_rgb(79,70,229,0.35)] flex-shrink-0"
        >
          <Plus size={16} />
          Nouvelle classe
        </button>
      </div>

      {selectedYear && (
        <div className="grid grid-cols-3 gap-3 mb-5 flex-shrink-0">
          <StatCard icon={<LayoutGrid size={16} />} label="Classes" value={classes.length} tone="indigo" />
          <StatCard icon={<Users size={16} />} label="Élèves inscrits" value={totalStudents} tone="sky" />
          <StatCard icon={<GraduationCap size={16} />} label="Niveaux" value={uniqueLevels} tone="emerald" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 mb-4 bg-red-50 text-red-600 border border-red-100 p-3 rounded-xl text-sm flex-shrink-0 animate-fade-in">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 mb-4 bg-emerald-50 text-emerald-700 border border-emerald-100 p-3 rounded-xl text-sm flex-shrink-0 animate-fade-in">
          <Check size={15} className="flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {selectedYear && classes.length > 0 && (
        <div className="relative max-w-md mb-4 flex-shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Rechercher une classe, un niveau ou une série…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13.5px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] placeholder:text-slate-400 text-slate-700 shadow-sm"
          />
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {!selectedYear ? (
          <EmptyState
            icon={<BookOpen size={36} strokeWidth={1.5} />}
            title="Aucune année sélectionnée"
            hint="Choisissez une année scolaire dans la barre latérale pour afficher et gérer les classes."
          />
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-8 h-8 border-2 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Chargement des classes…</p>
          </div>
        ) : classes.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={36} strokeWidth={1.5} />}
            title="Aucune classe pour cette année"
            hint="Créez une première classe, puis ajoutez les périodes (trimestres ou semestres)."
            action={
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="mt-5 flex items-center gap-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-md shadow-indigo-200"
              >
                <Plus size={15} /> Créer une classe
              </button>
            }
          />
        ) : visibleCount === 0 ? (
          <EmptyState
            icon={<Search size={32} strokeWidth={1.5} />}
            title="Aucun résultat"
            hint="Essayez un autre mot-clé."
            action={
              <button
                onClick={() => setSearch('')}
                className="mt-4 text-sm font-semibold text-[#4f46e5] hover:underline"
              >
                Effacer la recherche
              </button>
            }
          />
        ) : (
          <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-0">
            <div className="overflow-y-auto flex-1 custom-scrollbar">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="sticky top-0 bg-white border-b border-slate-100 z-10">
                    <th className="py-2.5 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Classe</th>
                    <th className="py-2.5 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Niveau</th>
                    <th className="py-2.5 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Série</th>
                    <th className="py-2.5 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Élèves</th>
                    <th className="py-2.5 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Périodes</th>
                    <th className="py-2.5 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Titulaire</th>
                    <th className="py-2.5 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((cls, idx) => {
                    const levelName = resolveLevelName(cls);
                    const series = allSeries.find(s => s.id === cls.series_id);
                    const color = ROW_COLORS[idx % ROW_COLORS.length];
                    // Périodes propres à la classe uniquement
                    const perds = classPeriods.filter(p => p.class_id === cls.id)
                      .sort((a, b) => a.period_order - b.period_order);
                    // Détection trimestre vs semestre : nom OU nombre de périodes
                    const firstName = perds[0]?.name?.toLowerCase() ?? '';
                    const isSemestre = firstName.includes('sem') || (perds.length === 2 && !firstName.includes('trim'));
                    const prefix = isSemestre ? 'S' : 'T';
                    return (
                      <tr
                        key={cls.id}
                        className="border-b border-white/60 transition-all duration-200"
                        style={{ backgroundColor: color.bg }}
                        onMouseEnter={e => {
                          const row = e.currentTarget;
                          row.style.backgroundColor = color.bg;
                          row.style.boxShadow = `inset 3px 0 0 ${color.bar}`;
                          row.style.paddingLeft = '4px';
                          const bar = row.querySelector('.row-bar') as HTMLElement;
                          if (bar) { bar.style.transform = 'scaleY(1.2)'; bar.style.boxShadow = `0 0 8px ${color.bar}88`; }
                          const badges = row.querySelectorAll('.row-badge');
                          badges.forEach((b: any) => { b.style.transform = 'scale(1.06)'; b.style.transition = 'transform 0.15s ease'; });
                          const actions = row.querySelector('.row-actions') as HTMLElement;
                          if (actions) { actions.style.gap = '8px'; }
                        }}
                        onMouseLeave={e => {
                          const row = e.currentTarget;
                          row.style.boxShadow = '';
                          row.style.paddingLeft = '';
                          const bar = row.querySelector('.row-bar') as HTMLElement;
                          if (bar) { bar.style.transform = ''; bar.style.boxShadow = ''; }
                          const badges = row.querySelectorAll('.row-badge');
                          badges.forEach((b: any) => { b.style.transform = ''; });
                          const actions = row.querySelector('.row-actions') as HTMLElement;
                          if (actions) { actions.style.gap = ''; }
                        }}
                      >
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <div className="row-bar w-1.5 h-7 rounded-full flex-shrink-0 transition-all duration-200" style={{ backgroundColor: color.bar }} />
                            <p className="font-semibold text-slate-800 leading-tight">{cls.name}</p>
                          </div>
                        </td>
                        <td className="py-2 px-4">
                          {levelName === 'Sans niveau' ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span className="row-badge inline-block px-2 py-0.5 rounded-md bg-[#e0f2fe] text-[#0369a1] text-[11px] font-bold">
                              {levelName}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          {series ? (
                            <span className="row-badge inline-block px-2 py-0.5 rounded-md bg-[#ede9fe] text-[#6d28d9] text-[11px] font-bold">
                              {series.name}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <Users size={13} className="text-slate-400" />
                            {cls.student_count}
                          </span>
                        </td>
                        <td className="py-2 px-4">
                          {perds.length === 0 ? (
                            <span className="text-slate-300 text-[11px]">—</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              {perds.map((p) => (
                                <span
                                  key={p.id}
                                  title={p.name}
                                  className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-black transition-transform hover:scale-110"
                                  style={{
                                    backgroundColor: p.is_active ? color.bar : '#e2e8f0',
                                    color: p.is_active ? '#ffffff' : '#94a3b8',
                                    boxShadow: p.is_active ? `0 2px 6px ${color.bar}55` : 'none',
                                  }}
                                >
                                  {prefix}{p.period_order}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          {cls.homeroom_teacher_name ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                              <GraduationCap size={11} /> {cls.homeroom_teacher_name}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          <div className="row-actions flex items-center justify-end gap-2 transition-all duration-200">
                            <button
                              onClick={() => openEdit(cls)}
                              title="Modifier"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#4f46e5] bg-[#eef2ff] border border-[#c7d2fe] hover:bg-[#4f46e5] hover:text-white hover:border-[#4f46e5] transition-all duration-150 shadow-sm"
                            >
                              <Pencil size={12} />
                              Modifier
                            </button>
                            <button
                              onClick={() => setClassToDelete(cls)}
                              title="Supprimer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-red-500 bg-red-50 border border-red-200 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-150 shadow-sm"
                            >
                              <Trash2 size={12} />
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div
            className="bg-white rounded-2xl w-full shadow-2xl animate-scale-in"
            style={{ maxWidth: step === 'periods' ? '560px' : '460px' }}
          >
            <div className="flex items-center bg-slate-50 border-b border-slate-100 px-6 py-3.5 gap-4 rounded-t-2xl">
                <div className={`flex items-center gap-2 text-[12px] font-semibold transition-colors ${step === 'class' ? 'text-[#4f46e5]' : 'text-emerald-500'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${step === 'class' ? 'bg-[#4f46e5] text-white shadow-md shadow-indigo-200' : 'bg-emerald-500 text-white'
                    }`}>
                    {step === 'class' ? '1' : <Check size={11} />}
                  </span>
                  Informations
                </div>
                <div className="flex-1 h-px bg-slate-200 relative">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#4f46e5] to-[#818cf8] rounded-full transition-all duration-500"
                    style={{ width: step === 'periods' ? '100%' : '0%' }}
                  />
                </div>
                <div className={`flex items-center gap-2 text-[12px] font-semibold transition-colors ${step === 'periods' ? 'text-[#4f46e5]' : 'text-slate-400'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${step === 'periods' ? 'bg-[#4f46e5] text-white shadow-md shadow-indigo-200' : 'bg-slate-200 text-slate-500'
                    }`}>2</span>
                  Périodes
                </div>
              </div>

            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-[17px] font-bold text-slate-800">
                    {editingClass ? 'Modifier la classe' : step === 'class' ? 'Nouvelle classe' : `Périodes — ${form.name}`}
                  </h3>
                  <p className="text-[12px] text-slate-400 mt-0.5">
                    {step === 'class'
                      ? 'Donnez un nom clair, puis rattachez un niveau.'
                      : 'Choisissez un modèle ou ajustez les périodes.'}
                    {' · '}{selectedYear?.name}
                  </p>
                </div>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors">
                  <X size={16} />
                </button>
              </div>

              {step === 'class' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
                      Nom de la classe <span className="text-[#4f46e5]">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 6ème A, Terminale C, CP Soleil..."
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && handleSubmitClass()}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] placeholder:text-slate-400 text-slate-800 transition-all"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
                      Niveau scolaire
                    </label>
                    <LevelDropdown
                      value={form.level}
                      onChange={level => setForm({ ...form, level })}
                    />
                  </div>

                  {/* Professeur titulaire */}
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
                      Professeur titulaire <span className="text-slate-400 font-normal">(optionnel)</span>
                    </label>
                    <div className="relative">
                      <select
                        value={form.homeroom_teacher_id}
                        onChange={e => setForm({ ...form, homeroom_teacher_id: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-700 appearance-none transition-all"
                      >
                        <option value="">— Aucun titulaire —</option>
                        {staff.map(s => (
                          <option key={s.id} value={s.id}>{s.prenoms} {s.nom}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><ChevronDown size={15} /></div>
                    </div>
                    {staff.length === 0 && (
                      <p className="mt-1 text-[11px] text-slate-400">Ajoutez des enseignants dans le module Personnel pour les sélectionner ici.</p>
                    )}
                  </div>

                  {hasStructure && (
                    <>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                        <Layers size={11} className="text-indigo-400" />
                        <span>Structure pédagogique :</span>
                        <span className="text-[#4f46e5] font-semibold">Section → Série</span>
                      </div>

                      <div>
                        <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Section</label>
                        <div className="relative">
                          <select value={form.section_id} onChange={e => handleSectionChange(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-700 appearance-none transition-all">
                            <option value="">— Toutes les sections —</option>
                            {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><ChevronDown size={15} /></div>
                        </div>
                      </div>

                      {filteredSeries.length > 0 && (
                        <div>
                          <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
                            Série <span className="text-slate-400 font-normal">(optionnel)</span>
                          </label>
                          <div className="relative">
                            <select value={form.series_id} onChange={e => setForm({ ...form, series_id: e.target.value })}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-700 appearance-none transition-all">
                              <option value="">— Sans série —</option>
                              {filteredSeries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><ChevronDown size={15} /></div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {error && (
                    <div className="flex items-start gap-2 text-red-600 text-[12px] bg-red-50 border border-red-100 rounded-xl p-3">
                      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button onClick={resetForm} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                      Annuler
                    </button>
                    <button onClick={handleSubmitClass} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#6366f1] hover:from-[#4338ca] hover:to-[#4f46e5] text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-200">
                      {editingClass ? <><Check size={15} /> Enregistrer</> : <><span>Suivant</span><ChevronRight size={15} /></>}
                    </button>
                  </div>
                </div>
              )}

              {step === 'periods' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <Zap size={13} className="text-amber-500" />
                      <span className="text-[12px] font-semibold text-slate-600">Modèles rapides</span>
                    </div>
                    <div className="flex gap-2">
                      {PERIOD_TEMPLATES.map((tpl, i) => (
                        <button key={i} onClick={() => applyTemplate(i)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-slate-600 hover:text-[#4f46e5] text-[12px] font-medium transition-all">
                          <span>{tpl.icon}</span>{tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-0.5 custom-scrollbar">
                    {periods.map((p, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 hover:border-indigo-200 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                            {p.period_order}
                          </span>
                          <input
                            type="text"
                            value={p.name}
                            onChange={e => updatePeriod(idx, { name: e.target.value })}
                            placeholder="Nom de la période"
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-700 transition-all"
                          />
                          {periods.length > 1 && (
                            <button onClick={() => removePeriod(idx)} className="w-6 h-6 rounded-lg hover:bg-red-50 hover:text-red-500 text-slate-300 flex items-center justify-center transition-colors flex-shrink-0">
                              <Minus size={13} />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 pl-8">
                          <div>
                            <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Début <span className="text-slate-300">(optionnel)</span></label>
                            <input type="date" value={p.start_date} onChange={e => updatePeriod(idx, { start_date: e.target.value })}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-600" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Fin <span className="text-slate-300">(optionnel)</span></label>
                            <input type="date" value={p.end_date} onChange={e => updatePeriod(idx, { end_date: e.target.value })}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-600" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={addPeriod} className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-300 rounded-xl text-slate-400 hover:text-[#4f46e5] hover:border-[#4f46e5] hover:bg-indigo-50 text-[12px] font-medium transition-all">
                    <Plus size={13} /> Ajouter une période
                  </button>

                  <div className="flex items-center gap-2 text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <Calendar size={12} className="flex-shrink-0 text-blue-400" />
                    Les périodes seront liées à cette classe uniquement. Modifiables dans Pédagogie et Notes.
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 text-red-600 text-[12px] bg-red-50 border border-red-100 rounded-xl p-3">
                      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    {!editingClass && (
                      <button onClick={handleSkipPeriods} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition-colors">
                        Ignorer
                      </button>
                    )}
                    {editingClass && (
                      <button onClick={resetForm} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition-colors">
                        Annuler
                      </button>
                    )}
                    <button
                      onClick={handleSavePeriods}
                      disabled={savingPeriods || periods.filter(p => p.name.trim()).length === 0}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#6366f1] hover:from-[#4338ca] hover:to-[#4f46e5] text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-indigo-200"
                    >
                      <Check size={15} />
                      {savingPeriods ? 'Enregistrement...' : editingClass ? 'Enregistrer' : `Créer avec ${periods.filter(p => p.name.trim()).length} période(s)`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {classToDelete && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden animate-scale-in p-6">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={20} />
              </div>
              <h3 className="text-[17px] font-bold text-slate-800">Confirmer la suppression</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Êtes-vous sûr de vouloir supprimer la classe <span className="font-bold text-slate-800">"{classToDelete.name}"</span> ? Cette action est irréversible et supprimera également toutes les données qui y sont associées.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setClassToDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-md shadow-red-200"
              >
                <Trash2 size={15} /> Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: 'indigo' | 'sky' | 'emerald';
}) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold text-slate-800 leading-none">{value}</div>
        <div className="text-[12px] text-slate-500 mt-1">{label}</div>
      </div>
    </div>
  );
}

function EmptyState({
  icon, title, hint, action,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-300 mb-4">
        {icon}
      </div>
      <p className="text-[15px] font-semibold text-slate-700">{title}</p>
      <p className="text-[13px] text-slate-400 mt-1 max-w-sm">{hint}</p>
      {action}
    </div>
  );
}
