import { useState, useEffect } from 'react';
import { Users, GraduationCap, ArrowRight, UserPlus, Search, Building2, Repeat, CheckCircle2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import StudentProfileModal from '../components/StudentProfileModal';

interface StudentEnrollment {
  id: string;
  student_id: string;
  class_id: string | null;
  enrollment_type: string;
  status: string;
  first_name: string;
  last_name: string;
  class_name: string | null;
}

interface Class {
  id: string;
  name: string;
  level: string | null;
}

export default function StudentsMigration() {
  const { session } = useAuth();
  const { years, selectedYear } = useYear();
  
  const currentYear = selectedYear; // Utiliser l'année sélectionnée dans le sélecteur, même si elle est clôturée
  const plannedYear = years.find(y => y.status === 'PLANNED');

  const [classes, setClasses] = useState<Class[]>([]);
  const [targetClasses, setTargetClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [students, setStudents] = useState<StudentEnrollment[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Formulaire d'ajout rapide
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStudent, setNewStudent] = useState({ firstName: '', lastName: '', classId: '' });

  // Migration modal
  const [migratingStudent, setMigratingStudent] = useState<StudentEnrollment | null>(null);
  const [migrationTargetClass, setMigrationTargetClass] = useState<string>('');
  const [migrationType, setMigrationType] = useState<'PROMOTED' | 'REPEATED'>('PROMOTED');

  // Profile modal
  const [viewingProfile, setViewingProfile] = useState<{ id: string, className: string | null } | null>(null);

  useEffect(() => {
    if (session?.user.school_id && currentYear) {
      fetchClasses();
      fetchStudents();
    }
    if (session?.user.school_id && plannedYear) {
      fetchTargetClasses();
    }
  }, [session, currentYear, plannedYear]);

  useEffect(() => {
    if (session?.user.school_id && currentYear) {
      fetchStudents();
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      const res: Class[] = await invoke('get_classes', { 
        schoolId: session!.user.school_id, 
        academicYearId: currentYear!.id 
      });
      setClasses(res);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTargetClasses = async () => {
    try {
      const res: Class[] = await invoke('get_classes', { 
        schoolId: session!.user.school_id, 
        academicYearId: plannedYear!.id 
      });
      setTargetClasses(res);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStudents = async () => {
    if (!currentYear) return;
    setLoading(true);
    try {
      const classIdArg = selectedClass === 'all' ? null : selectedClass;
      const res: StudentEnrollment[] = await invoke('get_students', {
        schoolId: session!.user.school_id,
        academicYearId: currentYear.id,
        classId: classIdArg
      });
      setStudents(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await invoke('create_student', {
        schoolId: session!.user.school_id,
        academicYearId: currentYear!.id,
        firstName: newStudent.firstName,
        lastName: newStudent.lastName,
        classId: newStudent.classId || null
      });
      setShowAddForm(false);
      setNewStudent({ firstName: '', lastName: '', classId: '' });
      fetchStudents();
      setStatusMsg({ type: 'success', text: 'Élève ajouté avec succès.' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.toString() });
    }
  };

  const handleMigrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!migratingStudent || !plannedYear) return;
    try {
      await invoke('migrate_student', {
        schoolId: session!.user.school_id,
        studentId: migratingStudent.student_id,
        targetAcademicYearId: plannedYear.id,
        targetClassId: migrationTargetClass || null,
        enrollmentType: migrationType
      });
      setMigratingStudent(null);
      setMigrationTargetClass('');
      setStatusMsg({ type: 'success', text: `Élève ${migrationType === 'PROMOTED' ? 'promu' : 'redoublé'} avec succès.` });
      // Reload students (maybe mark them as migrated if we track it in UI)
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.toString() });
    }
  };

  if (!currentYear) {
    return (
      <div className="p-10 flex justify-center text-slate-500">
        Aucune année académique active. Veuillez en ouvrir une dans les paramètres.
      </div>
    );
  }

  return (
    <div className="p-8 md:p-10 max-w-6xl mx-auto h-full flex flex-col bg-[#f8f9fc] overflow-y-auto">
      <div className="mb-6 flex-shrink-0 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight">Élèves & Inscriptions</h2>
          <p className="text-slate-500 mt-0.5 text-[13px]">Gérez les inscriptions et les passages de classe.</p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-[#4f46e5] hover:bg-[#4338ca] text-white px-4 py-2 rounded-xl text-[13px] font-medium flex items-center gap-2 transition-all shadow-[0_4px_14px_0_rgb(79,70,229,0.39)]"
        >
          <UserPlus size={16} />
          Inscrire un élève
        </button>
      </div>

      {statusMsg && (
        <div className={`mb-6 p-4 rounded-xl text-sm ${statusMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          {statusMsg.text}
        </div>
      )}

      {showAddForm && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] mb-6 animate-in fade-in slide-in-from-top-4">
          <h3 className="text-[15px] font-bold text-slate-800 mb-4">Ajouter un élève ({currentYear.name})</h3>
          <form onSubmit={handleAddStudent} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Prénom</label>
              <input required value={newStudent.firstName} onChange={e => setNewStudent({...newStudent, firstName: e.target.value})} className="w-full px-4 py-2 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none text-[13.5px]" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Nom</label>
              <input required value={newStudent.lastName} onChange={e => setNewStudent({...newStudent, lastName: e.target.value})} className="w-full px-4 py-2 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none text-[13.5px]" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Classe</label>
              <select value={newStudent.classId} onChange={e => setNewStudent({...newStudent, classId: e.target.value})} className="w-full px-4 py-2 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none text-[13.5px]">
                <option value="">-- Sans classe --</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <button type="submit" className="w-full bg-[#1e293b] text-white px-4 py-2 rounded-xl text-[13px] font-medium transition-all hover:bg-slate-800">
                Ajouter
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste et filtres */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] flex-1 flex flex-col min-h-0">
        <div className="p-5 border-b border-slate-100 flex gap-4 items-center bg-slate-50/50 rounded-t-2xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input placeholder="Rechercher un élève..." className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] w-64" />
          </div>
          <select 
            value={selectedClass} 
            onChange={e => setSelectedClass(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] font-medium text-slate-700"
          >
            <option value="all">Toutes les classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="ml-auto text-[13px] text-slate-500 font-medium">
            Année sélectionnée: <span className="text-[#4f46e5]">{currentYear.name}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white sticky top-0 border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                <th className="py-4 px-6 font-semibold">Nom & Prénom</th>
                <th className="py-4 px-6 font-semibold">Classe Actuelle</th>
                <th className="py-4 px-6 font-semibold">Statut</th>
                <th className="py-4 px-6 text-right font-semibold">Migration</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-400 text-sm">Chargement...</td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-400 text-sm">Aucun élève trouvé.</td></tr>
              ) : (
                students.map((student) => (
                  <tr key={student.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#f0f3ff] text-[#4f46e5] flex items-center justify-center font-bold text-[12px] overflow-hidden border border-slate-100">
                          {student.photo_url ? (
                            <img src={student.photo_url} alt="Photo" className="w-full h-full object-cover" />
                          ) : (
                            `${student.first_name[0]}${student.last_name[0]}`
                          )}
                        </div>
                        <div>
                          <div className="text-[14px] font-semibold text-slate-800">{student.last_name} {student.first_name}</div>
                          {student.matricule && <div className="text-[11px] text-slate-400 mt-0.5">Mat: {student.matricule}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {student.class_name ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-[12px] font-medium">
                          <Building2 size={13} className="text-slate-400" />
                          {student.class_name}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[12px] italic">Non assigné</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {student.enrollment_type === 'NEW' && <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">NOUVEAU</span>}
                      {student.enrollment_type === 'PROMOTED' && <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">PROMU</span>}
                      {student.enrollment_type === 'REPEATED' && <span className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">REDOUBLANT</span>}
                    </td>
                    <td className="py-4 px-6 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => setViewingProfile({ id: student.student_id, className: student.class_name })}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[12px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                      >
                        <User size={13} /> Profil
                      </button>
                      {plannedYear ? (
                        <button 
                          onClick={() => setMigratingStudent(student)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[12px] font-semibold text-[#4f46e5] hover:text-[#3730a3] bg-[#f0f3ff] px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                        >
                          Préparer passage <ArrowRight size={13} />
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 self-center opacity-0 group-hover:opacity-100 transition-opacity">Aucune année planifiée</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Migration */}
      {migratingStudent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Passage de classe</h3>
            <p className="text-slate-500 text-[13px] mb-6">Préparer l'inscription de <strong className="text-slate-700">{migratingStudent.first_name} {migratingStudent.last_name}</strong> pour la rentrée prochaine ({plannedYear?.name}).</p>
            
            <form onSubmit={handleMigrate} className="space-y-5">
              <div>
                <label className="block text-[12px] font-semibold text-[#1e293b] mb-2">Décision du conseil</label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button type="button" onClick={() => setMigrationType('PROMOTED')} className={`flex-1 py-2 text-[13px] font-semibold rounded-lg flex justify-center items-center gap-2 transition-all ${migrationType === 'PROMOTED' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    <GraduationCap size={16} /> Promotion
                  </button>
                  <button type="button" onClick={() => setMigrationType('REPEATED')} className={`flex-1 py-2 text-[13px] font-semibold rounded-lg flex justify-center items-center gap-2 transition-all ${migrationType === 'REPEATED' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    <Repeat size={16} /> Redoublement
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#1e293b] mb-2">Classe d'affectation cible (Optionnel)</label>
                <select 
                  value={migrationTargetClass} 
                  onChange={e => setMigrationTargetClass(e.target.value)}
                  className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none text-[13.5px]"
                >
                  <option value="">-- Sans classe --</option>
                  {targetClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {targetClasses.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-2">Aucune classe n'est définie pour l'année prochaine. L'élève sera promu "Sans classe".</p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setMigratingStudent(null)} className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                  Annuler
                </button>
                <button type="submit" className="bg-[#4f46e5] hover:bg-[#4338ca] text-white px-6 py-2.5 rounded-xl text-[13px] font-medium flex items-center gap-2 transition-all shadow-[0_4px_14px_0_rgb(79,70,229,0.39)]">
                  Confirmer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Profile */}
      {viewingProfile && (
        <StudentProfileModal
          studentId={viewingProfile.id}
          className={viewingProfile.className}
          onClose={() => setViewingProfile(null)}
          onUpdated={() => {
            fetchStudents(); // Refresh students to potentially get updated photo/matricule
          }}
        />
      )}
    </div>
  );
}
