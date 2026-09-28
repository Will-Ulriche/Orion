import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useYear } from '../contexts/YearContext';
import {
  GraduationCap, Plus, Search, Pencil, Trash2,
  Users, ChevronDown, BookOpen, X, Check, AlertCircle
} from 'lucide-react';

interface Class {
  id: string;
  school_id: string;
  academic_year_id: string;
  name: string;
  level: string | null;
}

const LEVELS = [
  '1ère année', '2ème année', '3ème année',
  '4ème année', '5ème année', '6ème année',
  '6ème', '5ème', '4ème', '3ème',
  '2nde', '1ère', 'Terminale',
  'Maternelle PS', 'Maternelle MS', 'Maternelle GS',
  'CP', 'CE1', 'CE2', 'CM1', 'CM2',
];

const SCHOOL_ID = 'school-1';

export default function Classes() {
  const { selectedYear } = useYear();
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', level: '' });

  const loadClasses = async () => {
    if (!selectedYear) return;
    setLoading(true);
    try {
      const data: Class[] = await invoke('get_classes', {
        schoolId: SCHOOL_ID,
        academicYearId: selectedYear.id,
      });
      setClasses(data);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClasses(); }, [selectedYear]);

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) { setError("Le nom de la classe est requis."); return; }
    if (!selectedYear) { setError("Aucune année scolaire sélectionnée."); return; }

    try {
      await invoke('create_class', {
        schoolId: SCHOOL_ID,
        academicYearId: selectedYear.id,
        name: form.name.trim(),
        level: form.level || null,
      });
      setSuccess(`Classe "${form.name}" créée avec succès !`);
      setForm({ name: '', level: '' });
      setShowForm(false);
      setEditingClass(null);
      await loadClasses();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const openEdit = (cls: Class) => {
    setEditingClass(cls);
    setForm({ name: cls.name, level: cls.level ?? '' });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingClass(null);
    setForm({ name: '', level: '' });
    setError(null);
  };

  const filtered = classes.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.level ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Grouper par niveau
  const grouped = filtered.reduce<Record<string, Class[]>>((acc, cls) => {
    const key = cls.level || 'Sans niveau';
    if (!acc[key]) acc[key] = [];
    acc[key].push(cls);
    return acc;
  }, {});

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full flex flex-col bg-[#f8f9fc]">

      {/* En-tête */}
      <div className="mb-5 flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight">Classes</h2>
          <p className="text-slate-500 mt-0.5 text-[13px]">
            {selectedYear
              ? <><span>Année : </span><span className="font-semibold text-[#4f46e5]">{selectedYear.name}</span><span> · {classes.length} classe(s)</span></>
              : 'Aucune année sélectionnée'}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingClass(null); setForm({ name: '', level: '' }); }}
          className="flex items-center gap-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-[0_4px_14px_0_rgb(79,70,229,0.4)]"
        >
          <Plus size={16} />
          Nouvelle classe
        </button>
      </div>

      {/* Alertes */}
      {error && (
        <div className="flex items-center gap-2 mb-4 bg-red-50 text-red-600 border border-red-100 p-3 rounded-xl text-sm flex-shrink-0">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 mb-4 bg-green-50 text-green-700 border border-green-100 p-3 rounded-xl text-sm flex-shrink-0">
          <Check size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* Barre de recherche */}
      <div className="relative mb-5 flex-shrink-0">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search size={15} />
        </div>
        <input
          type="text"
          placeholder="Rechercher une classe ou un niveau..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13.5px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] placeholder:text-slate-400 text-slate-700"
        />
      </div>

      {/* Contenu principal */}
      <div className="flex-1 overflow-y-auto">
        {!selectedYear ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <BookOpen size={48} strokeWidth={1} className="mb-3 opacity-40" />
            <p className="text-sm">Sélectionnez une année scolaire dans la barre latérale.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
            Chargement des classes...
          </div>
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <GraduationCap size={48} strokeWidth={1} className="mb-3 opacity-40" />
            <p className="text-sm font-medium text-slate-500">Aucune classe pour cette année</p>
            <p className="text-xs mt-1">Commencez par créer votre première classe.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 bg-[#4f46e5] text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              <Plus size={14} /> Créer une classe
            </button>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-16">Aucune classe trouvée.</div>
        ) : (
          <div className="space-y-6 pb-6">
            {Object.entries(grouped).map(([level, levelClasses]) => (
              <div key={level}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-bold text-slate-500 tracking-widest uppercase">{level}</span>
                  <div className="flex-1 h-px bg-slate-100"></div>
                  <span className="text-[11px] text-slate-400">{levelClasses.length} classe(s)</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {levelClasses.map(cls => (
                    <div
                      key={cls.id}
                      className="group bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_20px_-4px_rgba(79,70,229,0.15)] hover:border-[#c7d2fe] transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-[#ede9fe] text-[#7c3aed] flex items-center justify-center">
                          <GraduationCap size={18} />
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(cls)}
                            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-[#ede9fe] hover:text-[#7c3aed] text-slate-400 flex items-center justify-center transition-colors"
                            title="Modifier"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-red-50 hover:text-red-500 text-slate-400 flex items-center justify-center transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <p className="font-bold text-slate-800 text-[15px] truncate">{cls.name}</p>
                      <div className="flex items-center gap-1 mt-1 text-slate-400">
                        <Users size={11} />
                        <span className="text-[11px]">0 élève(s)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal : Créer / Modifier */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {editingClass ? 'Modifier la classe' : 'Nouvelle classe'}
                </h3>
                <p className="text-sm text-slate-400">{selectedYear?.name}</p>
              </div>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors">
                <X size={18} />
              </button>
            </div>

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
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] placeholder:text-slate-400"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Niveau scolaire</label>
                <div className="relative">
                  <select
                    value={form.level}
                    onChange={e => setForm({ ...form, level: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-700 appearance-none"
                  >
                    <option value="">— Choisir un niveau —</option>
                    {LEVELS.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <ChevronDown size={15} />
                  </div>
                </div>
              </div>

              {error && (
                <div className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-lg p-2.5">{error}</div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeForm}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold transition-colors"
              >
                {editingClass ? 'Enregistrer' : 'Créer la classe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
