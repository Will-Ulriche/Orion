import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import StudentProfileModal from '../components/StudentProfileModal';
import {
  Search, UserPlus, Eye, Pencil, Trash2,
  GraduationCap, BookOpen, ChevronDown, ArrowRight,
  GraduationCap as RepeatIcon, X, Check, AlertCircle
} from 'lucide-react';

interface StudentEnrollment {
  id: string;
  student_id: string;
  class_id: string | null;
  enrollment_type: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
  matricule: string | null;
  photo_url: string | null;
  class_name: string | null;
  class_level: string | null;
  birth_date: string | null;
  birth_place: string | null;
  gender: string | null;
  address: string | null;
}

interface Class {
  id: string;
  name: string;
  level: string | null;
  student_count: number;
}

interface Class {
  id: string;
  name: string;
  level: string | null;
}

const SCHOOL_ID = 'school-1';

function formatDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span className="inline-block px-2 py-0.5 rounded-md bg-[#e0f2fe] text-[#0369a1] text-[11px] font-bold">
      {level}
    </span>
  );
}

function ClassBadge({ name }: { name: string | null }) {
  if (!name) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span className="inline-block px-2 py-0.5 rounded-md bg-[#ede9fe] text-[#6d28d9] text-[11px] font-bold">
      {name}
    </span>
  );
}

export default function StudentsMigration() {
  const { schoolId } = useAuth();
  const { years, selectedYear } = useYear();

  const currentYear = selectedYear;
  const plannedYear = years.find(y => y.status === 'PLANNED');

  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<StudentEnrollment[]>([]);
  const [loading, setLoading] = useState(false);

  // Filtres
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterClass, setFilterClass] = useState('');

  // Alertes
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modals
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStudent, setNewStudent] = useState({ firstName: '', lastName: '', classId: '' });
  const [viewingProfile, setViewingProfile] = useState<{ id: string; className: string | null } | null>(null);
  const [migratingStudent, setMigratingStudent] = useState<StudentEnrollment | null>(null);
  const [migrationTargetClass, setMigrationTargetClass] = useState('');
  const [migrationType, setMigrationType] = useState<'PROMOTED' | 'REPEATED'>('PROMOTED');
  const [targetClasses, setTargetClasses] = useState<Class[]>([]);

  useEffect(() => {
    if (currentYear) {
      fetchClasses();
      fetchStudents();
    }
    if (plannedYear) fetchTargetClasses();
  }, [currentYear, plannedYear]);

  const fetchClasses = async () => {
    try {
      const res: Class[] = await invoke('get_classes', { schoolId: schoolId || SCHOOL_ID, academicYearId: currentYear!.id });
      setClasses(res);
    } catch (e) { console.error(e); }
  };

  const fetchTargetClasses = async () => {
    try {
      const res: Class[] = await invoke('get_classes', { schoolId: schoolId || SCHOOL_ID, academicYearId: plannedYear!.id });
      setTargetClasses(res);
    } catch (e) { console.error(e); }
  };

  const fetchStudents = async () => {
    if (!currentYear) return;
    setLoading(true);
    try {
      const res: StudentEnrollment[] = await invoke('get_students', {
        schoolId: schoolId || SCHOOL_ID,
        academicYearId: currentYear.id,
        classId: null,
      });
      setStudents(res);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await invoke('create_student', {
        schoolId: schoolId || SCHOOL_ID,
        academicYearId: currentYear!.id,
        firstName: newStudent.firstName,
        lastName: newStudent.lastName,
        classId: newStudent.classId || null,
      });
      setShowAddForm(false);
      setNewStudent({ firstName: '', lastName: '', classId: '' });
      fetchStudents();
      showSuccess('Élève inscrit avec succès.');
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleDeleteStudent = async (s: StudentEnrollment) => {
    if (!window.confirm(`Supprimer l'inscription de "${s.last_name} ${s.first_name}" ? Cette action est irréversible.`)) return;
    try {
      await invoke('delete_enrollment', { id: s.id });
      fetchStudents();
      showSuccess('Inscription supprimée.');
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleMigrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!migratingStudent || !plannedYear) return;
    try {
      await invoke('migrate_student', {
        schoolId: schoolId || SCHOOL_ID,
        studentId: migratingStudent.student_id,
        targetAcademicYearId: plannedYear.id,
        targetClassId: migrationTargetClass || null,
        enrollmentType: migrationType,
      });
      setMigratingStudent(null);
      setMigrationTargetClass('');
      showSuccess(`Élève ${migrationType === 'PROMOTED' ? 'promu' : 'redoublant'} enregistré pour ${plannedYear.name}.`);
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Niveaux uniques pour le filtre
  const levels = [...new Set(students.map(s => s.class_level).filter(Boolean))] as string[];

  // Filtrage
  const filtered = students.filter(s => {
    const fullName = `${s.last_name ?? ''} ${s.first_name ?? ''}`.toLowerCase();
    const mat = (s.matricule ?? '').toLowerCase();
    const q = search.toLowerCase();
    const matchSearch = !search || fullName.includes(q) || mat.includes(q);
    const matchLevel = !filterLevel || s.class_level === filterLevel;
    const matchClass = !filterClass || s.class_id === filterClass;
    return matchSearch && matchLevel && matchClass;
  });

  if (!currentYear) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <BookOpen size={48} strokeWidth={1} className="mb-3 opacity-40" />
        <p className="text-sm">Sélectionnez une année scolaire dans la barre latérale.</p>
      </div>
    );
  }

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full flex flex-col bg-[#f8f9fc]">

      {/* En-tête */}
      <div className="mb-5 flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight">Élèves & Inscriptions</h2>
          <p className="text-slate-500 mt-0.5 text-[13px]">
            Année : <span className="font-semibold text-[#4f46e5]">{currentYear.name}</span>
            <span> · {students.length} élève(s)</span>
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-[0_4px_14px_0_rgb(79,70,229,0.4)]"
        >
          <UserPlus size={16} />
          Inscrire un élève
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

      {/* Formulaire d'ajout rapide */}
      {showAddForm && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-5 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-bold text-slate-800">Nouvelle inscription — {currentYear.name}</h3>
            <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
          </div>
          <form onSubmit={handleAddStudent} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Prénom <span className="text-[#4f46e5]">*</span></label>
              <input required value={newStudent.firstName} onChange={e => setNewStudent({ ...newStudent, firstName: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13.5px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5]" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Nom <span className="text-[#4f46e5]">*</span></label>
              <input required value={newStudent.lastName} onChange={e => setNewStudent({ ...newStudent, lastName: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13.5px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5]" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Classe</label>
              <select value={newStudent.classId} onChange={e => setNewStudent({ ...newStudent, classId: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13.5px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5]">
                <option value="">— Sans classe —</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAddForm(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-slate-600 text-[13px] font-medium hover:bg-slate-50 transition-colors">
                Annuler
              </button>
              <button type="submit"
                className="flex-1 bg-[#4f46e5] hover:bg-[#4338ca] text-white px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors">
                Inscrire
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Barre de filtres */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Rechercher par nom ou matricule..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] placeholder:text-slate-400 text-slate-700"
          />
        </div>

        <div className="relative">
          <select
            value={filterLevel}
            onChange={e => setFilterLevel(e.target.value)}
            className="appearance-none pl-4 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-700 font-medium"
          >
            <option value="">Tous les niveaux</option>
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="appearance-none pl-4 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-700 font-medium"
          >
            <option value="">Toutes les classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Tableau */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="sticky top-0 bg-white border-b border-slate-100 z-10">
                <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Matricule</th>
                <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Élève</th>
                <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sexe</th>
                <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date de naissance</th>
                <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lieu de naissance</th>
                <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Adresse</th>
                <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Niveau</th>
                <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Classe actuelle</th>
                <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="p-10 text-center text-slate-400 text-sm">Chargement...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <GraduationCap size={36} strokeWidth={1} className="opacity-40" />
                      <p className="text-sm">Aucun élève trouvé.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(s => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors group">
                    <td className="py-3.5 px-5 font-mono text-[12px] text-slate-500 font-semibold">
                      {s.matricule || <span className="text-slate-300 italic">—</span>}
                    </td>
                    <td className="py-3.5 px-5 font-bold text-slate-800">
                      {s.last_name} {s.first_name}
                    </td>
                    <td className="py-3.5 px-5 text-slate-500">
                      {s.gender === 'M' ? 'M' : s.gender === 'F' ? 'F' : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3.5 px-5 text-slate-600">{formatDate(s.birth_date)}</td>
                    <td className="py-3.5 px-5 text-slate-600">{s.birth_place || <span className="text-slate-300">—</span>}</td>
                    <td className="py-3.5 px-5 text-slate-600">{s.address || <span className="text-slate-300">—</span>}</td>
                    <td className="py-3.5 px-5"><LevelBadge level={s.class_level} /></td>
                    <td className="py-3.5 px-5"><ClassBadge name={s.class_name} /></td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Voir profil */}
                        <button
                          onClick={() => setViewingProfile({ id: s.student_id, className: s.class_name })}
                          title="Voir le profil"
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-[#e0f2fe] hover:text-[#0369a1] text-slate-400 transition-colors"
                        >
                          <Eye size={14} />
                        </button>
                        {/* Modifier (ouvre le profil en édition) */}
                        <button
                          onClick={() => setViewingProfile({ id: s.student_id, className: s.class_name })}
                          title="Modifier"
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-[#fef9c3] hover:text-[#a16207] text-slate-400 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        {/* Passage de classe */}
                        {plannedYear && (
                          <button
                            onClick={() => { setMigratingStudent(s); setMigrationTargetClass(''); }}
                            title={`Préparer le passage vers ${plannedYear.name}`}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-[#ede9fe] hover:text-[#7c3aed] text-slate-400 transition-colors"
                          >
                            <ArrowRight size={14} />
                          </button>
                        )}
                        {/* Supprimer */}
                        <button
                          onClick={() => handleDeleteStudent(s)}
                          title="Supprimer l'inscription"
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-red-50 hover:text-red-500 text-slate-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pied de tableau */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-[12px] text-slate-400 flex-shrink-0">
            {filtered.length} élève(s) affiché(s) sur {students.length}
          </div>
        )}
      </div>

      {/* Modal : Passage de classe */}
      {migratingStudent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-800">Passage de classe</h3>
              <button onClick={() => setMigratingStudent(null)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors">
                <X size={18} />
              </button>
            </div>
            <p className="text-slate-500 text-[13px] mb-5">
              Préparer l'inscription de <strong className="text-slate-700">{migratingStudent.last_name} {migratingStudent.first_name}</strong> pour <span className="text-[#4f46e5] font-semibold">{plannedYear?.name}</span>.
            </p>
            <form onSubmit={handleMigrate} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-2">Décision du conseil</label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button type="button" onClick={() => setMigrationType('PROMOTED')}
                    className={`flex-1 py-2 text-[13px] font-semibold rounded-lg flex justify-center items-center gap-2 transition-all ${migrationType === 'PROMOTED' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    <GraduationCap size={16} /> Promotion
                  </button>
                  <button type="button" onClick={() => setMigrationType('REPEATED')}
                    className={`flex-1 py-2 text-[13px] font-semibold rounded-lg flex justify-center items-center gap-2 transition-all ${migrationType === 'REPEATED' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    <RepeatIcon size={16} /> Redoublement
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-2">Classe cible (optionnel)</label>
                <select value={migrationTargetClass} onChange={e => setMigrationTargetClass(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13.5px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5]">
                  <option value="">— Sans classe —</option>
                  {targetClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {targetClasses.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-2">Aucune classe définie pour l'année planifiée.</p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setMigratingStudent(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                  Annuler
                </button>
                <button type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold transition-colors">
                  Confirmer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Profil élève */}
      {viewingProfile && (
        <StudentProfileModal
          studentId={viewingProfile.id}
          className={viewingProfile.className}
          onClose={() => setViewingProfile(null)}
          onUpdated={() => { fetchStudents(); showSuccess('Profil mis à jour.'); }}
        />
      )}
    </div>
  );
}
