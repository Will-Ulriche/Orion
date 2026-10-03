import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Check, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';

interface Class {
  id: string;
  name: string;
  level: string | null;
}

interface StudentEnrollment {
  id: string;
  student_id: string;
  last_name: string | null;
  first_name: string | null;
}

export default function BulkMigrationModal({ onClose, onMigrated }: { onClose: () => void, onMigrated: () => void }) {
  const { schoolId } = useAuth();
  const { years, selectedYear } = useYear();
  const currentYear = selectedYear;
  const plannedYear = years.find(y => y.status === 'PLANNED');

  const [sourceClasses, setSourceClasses] = useState<Class[]>([]);
  const [targetClasses, setTargetClasses] = useState<Class[]>([]);
  const [sourceClassId, setSourceClassId] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [migrationType, setMigrationType] = useState<'PROMOTED' | 'REPEATED'>('PROMOTED');
  
  const [students, setStudents] = useState<StudentEnrollment[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentYear) {
      invoke<Class[]>('get_classes', { schoolId: schoolId || 'school-1', academicYearId: currentYear.id })
        .then(setSourceClasses).catch(e => setError(e.toString()));
    }
    if (plannedYear) {
      invoke<Class[]>('get_classes', { schoolId: schoolId || 'school-1', academicYearId: plannedYear.id })
        .then(setTargetClasses).catch(e => setError(e.toString()));
    }
  }, [currentYear, plannedYear]);

  useEffect(() => {
    if (!sourceClassId || !currentYear) {
      setStudents([]);
      setSelectedStudents(new Set());
      return;
    }
    setLoading(true);
    invoke<StudentEnrollment[]>('get_students', { schoolId: schoolId || 'school-1', academicYearId: currentYear.id, classId: sourceClassId })
      .then(res => {
        setStudents(res);
        setSelectedStudents(new Set(res.map(s => s.student_id))); // Select all by default
      })
      .catch(e => setError(e.toString()))
      .finally(() => setLoading(false));
  }, [sourceClassId, currentYear]);

  const toggleStudent = (id: string) => {
    const next = new Set(selectedStudents);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStudents(next);
  };

  const handleBulkMigrate = async () => {
    if (!plannedYear || selectedStudents.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const payload = Array.from(selectedStudents).map(student_id => ({
        student_id,
        target_class_id: targetClassId || null,
        enrollment_type: migrationType
      }));

      await invoke('bulk_migrate_students', {
        schoolId: schoolId || 'school-1',
        targetAcademicYearId: plannedYear.id,
        sourceAcademicYearId: currentYear!.id,
        students: payload
      });
      onMigrated();
      onClose();
    } catch (e: any) {
      setError(e.toString());
      setLoading(false);
    }
  };

  if (!plannedYear) {
    return (
      <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full">
          <h3 className="text-lg font-bold text-slate-800 mb-2">Impossible</h3>
          <p className="text-slate-500 text-sm mb-4">Aucune année planifiée (PLANNED) n'est disponible pour le passage de classe.</p>
          <button onClick={onClose} className="w-full py-2 bg-slate-100 rounded-xl">Fermer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
            <Users size={18} className="text-[#4f46e5]" /> Passage de classe en masse
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:bg-slate-100 rounded-full"><X size={18} /></button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Classe d'origine ({currentYear?.name})</label>
              <select value={sourceClassId} onChange={e => setSourceClassId(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm">
                <option value="">-- Choisir une classe --</option>
                {sourceClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            
            <div className="bg-[#eef2ff] p-4 rounded-xl border border-[#c7d2fe]">
              <label className="block text-xs font-bold text-[#4f46e5] uppercase mb-2 flex items-center gap-1">
                <ArrowRight size={14} /> Vers ({plannedYear.name})
              </label>
              <select value={targetClassId} onChange={e => setTargetClassId(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm mb-3">
                <option value="">-- Sans classe --</option>
                {targetClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              
              <div className="flex gap-2">
                <button onClick={() => setMigrationType('PROMOTED')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${migrationType === 'PROMOTED' ? 'bg-[#4f46e5] text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>Promotion</button>
                <button onClick={() => setMigrationType('REPEATED')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${migrationType === 'REPEATED' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>Redoublement</button>
              </div>
            </div>
          </div>

          {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{error}</div>}

          {sourceClassId && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold text-slate-700">Élèves à transférer ({selectedStudents.size}/{students.length})</h3>
                <button onClick={() => setSelectedStudents(selectedStudents.size === students.length ? new Set() : new Set(students.map(s => s.student_id)))} className="text-xs text-[#4f46e5] font-semibold">Tout (dé)sélectionner</button>
              </div>
              <div className="border border-slate-200 rounded-xl max-h-60 overflow-y-auto">
                {loading ? <div className="p-4 text-center text-sm text-slate-400">Chargement...</div> : students.length === 0 ? <div className="p-4 text-center text-sm text-slate-400">Aucun élève dans cette classe.</div> : (
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {students.map(s => (
                        <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => toggleStudent(s.student_id)}>
                          <td className="p-3 w-10">
                            <input type="checkbox" checked={selectedStudents.has(s.student_id)} readOnly className="rounded text-[#4f46e5] focus:ring-0" />
                          </td>
                          <td className="p-3 font-medium text-slate-800">{s.last_name} {s.first_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t border-slate-100 bg-[#f8f9fc] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">Annuler</button>
          <button onClick={handleBulkMigrate} disabled={loading || selectedStudents.size === 0 || !sourceClassId} className="px-6 py-2 bg-[#4f46e5] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#4338ca] disabled:opacity-50 flex items-center gap-2">
            <Check size={16} /> Confirmer {selectedStudents.size > 0 && `(${selectedStudents.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
