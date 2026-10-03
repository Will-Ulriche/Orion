import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useYear } from '../contexts/YearContext';
import { useAuth } from '../contexts/AuthContext';
import {
  GraduationCap, Plus, Search, Pencil, Trash2,
  Users, ChevronDown, BookOpen, X, Check, AlertCircle,
  Layers, Calendar, ChevronRight, Zap, Minus,
  LayoutGrid, Filter
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

interface PeriodDraft {
  name: string;
  period_order: number;
  start_date: string;
  end_date: string;
}

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

const GROUP_COLORS = [
  { bg: 'from-violet-500 to-indigo-600', light: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100', badge: 'bg-violet-100 text-violet-700', bar: 'bg-violet-500' },
  { bg: 'from-sky-500 to-cyan-600',      light: 'bg-sky-50',    text: 'text-sky-600',    border: 'border-sky-100',    badge: 'bg-sky-100 text-sky-700',       bar: 'bg-sky-500' },
  { bg: 'from-emerald-500 to-teal-600',  light: 'bg-emerald-50', text: 'text-emerald-600',border: 'border-emerald-100',badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  { bg: 'from-amber-500 to-orange-500',  light: 'bg-amber-50',   text: 'text-amber-600',  border: 'border-amber-100',  badge: 'bg-amber-100 text-amber-800',   bar: 'bg-amber-500' },
  { bg: 'from-rose-500 to-pink-600',     light: 'bg-rose-50',    text: 'text-rose-600',   border: 'border-rose-100',   badge: 'bg-rose-100 text-rose-700',     bar: 'bg-rose-500' },
];

function getLevelWeight(levelName: string | null | undefined): number {
  if (!levelName) return 99;
  const l = levelName.toLowerCase();
  if (l.includes('terminale')) return 1;
  if (l.includes('première') || l.includes('premiere')) return 2;
  if (l.includes('seconde')) return 3;
  if (l.includes('3ème') || l.includes('3eme')) return 4;
  if (l.includes('4ème') || l.includes('4eme')) return 5;
  if (l.includes('5ème') || l.includes('5eme')) return 6;
  if (l.includes('6ème') || l.includes('6eme')) return 7;
  if (l === 'sans niveau') return 100;
  return 50;
}

export default function Classes() {
  const { selectedYear } = useYear();
  const { schoolId } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
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
      const data: Class[] = await invoke('get_classes', {
        schoolId,
        academicYearId: selectedYear.id,
      });
      setClasses(data);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const loadStructure = async () => {
    if (!schoolId) return;
    try {
      const [sects, lvls, srs] = await Promise.all([
        invoke<Section[]>('get_sections', { schoolId }),
        invoke<Level[]>('get_levels', { schoolId, sectionId: null }),
        invoke<Series[]>('get_series', { schoolId, levelId: null }),
      ]);
      setSections(sects);
      setLevels(lvls);
      setAllSeries(srs);
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
        });
        setSuccess(`Classe "${form.name}" modifiee avec succes !`);
        resetForm();
        await loadClasses();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const created: any = await invoke('create_class', {
          schoolId,
          academicYearId: selectedYear.id,
          name: form.name.trim(),
          level: form.level || null,
          levelId: form.level_id || null,
          seriesId: form.series_id || null,
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
      setSuccess(`Classe "${form.name}" creee avec ${valid.length} periode(s) !`);
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
    setPeriods(tpl.periods.map(p => ({ ...p, start_date: '', end_date: '' })));
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
    setForm({ name: '', level: '', level_id: '', series_id: '', section_id: '' });
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

  const openEdit = (cls: Class) => {
    setEditingClass(cls);
    const clsLevel = levels.find(l => l.id === cls.level_id);
    setForm({
      name: cls.name,
      level: cls.level ?? '',
      level_id: cls.level_id ?? '',
      series_id: cls.series_id ?? '',
      section_id: clsLevel?.section_id ?? '',
    });
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

  const levelNames = useMemo(() => {
    const names = new Set(classes.map(resolveLevelName));
    return [...names].sort((a, b) => getLevelWeight(a) - getLevelWeight(b) || a.localeCompare(b));
  }, [classes, levels]);

  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = classes.filter(c => {
      const levelName = resolveLevelName(c);
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        levelName.toLowerCase().includes(q);
      const matchLevel = !filterLevel || levelName === filterLevel;
      return matchSearch && matchLevel;
    });

    const map = new Map<string, Class[]>();
    for (const cls of filtered) {
      const key = resolveLevelName(cls);
      const list = map.get(key) ?? [];
      list.push(cls);
      map.set(key, list);
    }

    return [...map.entries()]
      .map(([level, items]) => ({
        level,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
        students: items.reduce((s, c) => s + c.student_count, 0),
      }))
      .sort((a, b) => getLevelWeight(a.level) - getLevelWeight(b.level) || a.level.localeCompare(b.level));
  }, [classes, levels, search, filterLevel]);

  const hasStructure = sections.length > 0;
  const totalStudents = classes.reduce((s, c) => s + c.student_count, 0);
  const visibleCount = grouped.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full flex flex-col bg-[#f8f9fc] overflow-hidden">

      <div className="mb-5 flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight">Gestionnaire des classes</h2>
          <p className="text-slate-500 mt-0.5 text-[13px]">
            {selectedYear
              ? <>Année : <span className="font-semibold text-[#4f46e5]">{selectedYear.name}</span> · Organisez les classes par niveau</>
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
          <StatCard icon={<GraduationCap size={16} />} label="Niveaux" value={levelNames.filter(n => n !== 'Sans niveau').length} tone="emerald" />
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
        <div className="flex flex-col gap-3 mb-4 flex-shrink-0">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Rechercher une classe ou un niveau…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13.5px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] placeholder:text-slate-400 text-slate-700 shadow-sm"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Filter size={11} /> Niveau
            </span>
            <FilterChip active={!filterLevel} onClick={() => setFilterLevel('')}>
              Tous ({classes.length})
            </FilterChip>
            {levelNames.map(name => {
              const count = classes.filter(c => resolveLevelName(c) === name).length;
              return (
                <FilterChip key={name} active={filterLevel === name} onClick={() => setFilterLevel(filterLevel === name ? '' : name)}>
                  {name} ({count})
                </FilterChip>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
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
            hint="Essayez un autre mot-clé ou réinitialisez le filtre de niveau."
            action={
              <button
                onClick={() => { setSearch(''); setFilterLevel(''); }}
                className="mt-4 text-sm font-semibold text-[#4f46e5] hover:underline"
              >
                Effacer les filtres
              </button>
            }
          />
        ) : (
          <div className="space-y-7 pb-8">
            {grouped.map((group, gi) => {
              const color = GROUP_COLORS[gi % GROUP_COLORS.length];
              const maxStudents = Math.max(...group.items.map(c => c.student_count), 1);
              return (
                <section key={group.level}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-1.5 h-5 rounded-full ${color.bar}`} />
                    <h3 className="text-[13px] font-bold text-slate-800">{group.level}</h3>
                    <span className="text-[12px] text-slate-400">
                      {group.items.length} classe{group.items.length > 1 ? 's' : ''} · {group.students} élève{group.students > 1 ? 's' : ''}
                    </span>
                    <div className="flex-1 h-px bg-slate-200/80" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                    {group.items.map(cls => (
                      <ClassCard
                        key={cls.id}
                        cls={cls}
                        clsSeries={allSeries.find(s => s.id === cls.series_id)}
                        color={color}
                        maxStudents={maxStudents}
                        onEdit={() => openEdit(cls)}
                        onDelete={() => setClassToDelete(cls)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div
            className="bg-white rounded-2xl w-full shadow-2xl animate-scale-in"
            style={{ maxWidth: step === 'periods' ? '560px' : '460px' }}
          >
            {!editingClass && (
              <div className="flex items-center bg-slate-50 border-b border-slate-100 px-6 py-3.5 gap-4 rounded-t-2xl">
                <div className={`flex items-center gap-2 text-[12px] font-semibold transition-colors ${step === 'class' ? 'text-[#4f46e5]' : 'text-emerald-500'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                    step === 'class' ? 'bg-[#4f46e5] text-white shadow-md shadow-indigo-200' : 'bg-emerald-500 text-white'
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
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                    step === 'periods' ? 'bg-[#4f46e5] text-white shadow-md shadow-indigo-200' : 'bg-slate-200 text-slate-500'
                  }`}>2</span>
                  Périodes
                </div>
              </div>
            )}

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
                    <button onClick={handleSkipPeriods} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition-colors">
                      Ignorer
                    </button>
                    <button
                      onClick={handleSavePeriods}
                      disabled={savingPeriods || periods.filter(p => p.name.trim()).length === 0}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#6366f1] hover:from-[#4338ca] hover:to-[#4f46e5] text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-indigo-200"
                    >
                      <Check size={15} />
                      {savingPeriods ? 'Enregistrement...' : `Créer avec ${periods.filter(p => p.name.trim()).length} période(s)`}
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

function FilterChip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${
        active
          ? 'bg-[#4f46e5] text-white border-[#4f46e5] shadow-sm shadow-indigo-200'
          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-[#4f46e5]'
      }`}
    >
      {children}
    </button>
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

function ClassCard({
  cls, clsSeries, color, maxStudents, onEdit, onDelete,
}: {
  cls: { id: string; name: string; student_count: number; series_id: string | null };
  clsSeries: { name: string } | undefined;
  color: typeof GROUP_COLORS[0];
  maxStudents: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ratio = Math.min(100, Math.round((cls.student_count / maxStudents) * 100));
  const initial = cls.name.trim().charAt(0).toUpperCase() || 'C';

  return (
    <div className="group bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-indigo-100 transition-all duration-200">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-xl ${color.light} ${color.text} flex items-center justify-center font-bold text-base flex-shrink-0`}>
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-800 text-[14.5px] truncate leading-tight">{cls.name}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {clsSeries ? (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${color.badge}`}>
                  {clsSeries.name}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">Classe</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
              <Users size={11} />
              {cls.student_count === 0 ? 'Aucun élève' : `${cls.student_count} élève${cls.student_count > 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${color.bar} transition-all`}
              style={{ width: cls.student_count === 0 ? '0%' : `${Math.max(ratio, 8)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex border-t border-slate-100">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold text-slate-500 hover:text-[#4f46e5] hover:bg-indigo-50/70 transition-colors"
        >
          <Pencil size={12} /> Modifier
        </button>
        <div className="w-px bg-slate-100" />
        <button
          onClick={onDelete}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50/70 transition-colors"
        >
          <Trash2 size={12} /> Supprimer
        </button>
      </div>
    </div>
  );
}
