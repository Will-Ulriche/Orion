import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, User, Phone, Mail, MapPin, Activity, FileText, Save, Check, ArrowRight, Trophy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import { generateStudentBulletin } from '../utils/pdfGenerator';

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  birth_place: string | null;
  gender: string | null;
  photo_url: string | null;
  matricule: string | null;
  address: string | null;
  phone: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  blood_type: string | null;
  medical_notes: string | null;
}

interface GradingPeriod {
  id: string; name: string; period_order: number;
}
export interface SubjectAverage {
  class_subject_id: string; subject_name: string; subject_code: string;
  coefficient: number; average: number | null; class_average: number | null;
  appreciation: string; grade_count: number;
}
export interface StudentAverages {
  general_average: number | null;
  rank: number | null; class_size: number; subjects: SubjectAverage[];
}

interface StudentProfileModalProps {
  studentId: string;
  enrollmentId?: string;
  className?: string | null;
  onClose: () => void;
  onUpdated: () => void;
  onMigrateRequest?: () => void;
  readOnly?: boolean;
}

type Tab = 'identity' | 'results';

export default function StudentProfileModal({ studentId, enrollmentId, className, onClose, onUpdated, onMigrateRequest, readOnly = false }: StudentProfileModalProps) {
  const { schoolId } = useAuth();
  const { selectedYear } = useYear();
  
  const [tab, setTab] = useState<Tab>('identity');
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Résultats
  const [periods, setPeriods] = useState<GradingPeriod[]>([]);
  const [selPeriod, setSelPeriod] = useState('');
  const [averages, setAverages] = useState<StudentAverages | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    loadStudent();
    if (selectedYear) {
      invoke<GradingPeriod[]>('get_grading_periods', { schoolId, academicYearId: selectedYear.id })
        .then(p => { setPeriods(p); if (p.length > 0) setSelPeriod(p[0].id); })
        .catch(console.error);
    }
  }, [studentId, schoolId, selectedYear]);

  useEffect(() => {
    if (tab === 'results' && selPeriod && enrollmentId && selectedYear) {
      setLoadingResults(true);
      invoke<StudentAverages>('get_student_averages', {
        schoolId, academicYearId: selectedYear.id, enrollmentId, gradingPeriodId: selPeriod
      })
      .then(setAverages)
      .catch(e => console.error(e))
      .finally(() => setLoadingResults(false));
    }
  }, [tab, selPeriod, enrollmentId, schoolId, selectedYear]);

  const loadStudent = async () => {
    try {
      const data: Student = await invoke('get_student_details', { studentId });
      setStudent(data);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (student) {
      setStudent({ ...student, [e.target.name]: e.target.value });
    }
  };

  const handleSave = async () => {
    if (!student) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      await invoke('update_student', { student });
      setSuccess(true); onUpdated();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) { setError(err.toString()); } 
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-6 shadow-2xl">Chargement...</div>
      </div>
    );
  }
  if (!student) return null;

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[24px] max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-[#f8f9fc]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center border-2 border-white shadow-sm">
              {student.photo_url ? (
                <img src={student.photo_url} alt="Photo" className="w-full h-full object-cover" />
              ) : (
                <User size={24} className="text-slate-400" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">{student.first_name} {student.last_name}</h2>
              <p className="text-sm text-[#4f46e5] font-medium">{className || 'Sans classe'} {student.matricule ? `· Mat: ${student.matricule}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 rounded-full p-2 transition-colors border border-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Onglets */}
        <div className="px-6 border-b border-slate-100 flex gap-6 bg-[#f8f9fc]">
          <button onClick={() => setTab('identity')} className={`py-3 text-sm font-semibold border-b-2 transition-colors ${tab === 'identity' ? 'border-[#4f46e5] text-[#4f46e5]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <span className="flex items-center gap-2"><User size={15} /> Identité & Contacts</span>
          </button>
          <button onClick={() => setTab('results')} className={`py-3 text-sm font-semibold border-b-2 transition-colors ${tab === 'results' ? 'border-[#4f46e5] text-[#4f46e5]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <span className="flex items-center gap-2"><Trophy size={15} /> Résultats scolaires</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
          {tab === 'identity' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Colonne 1: Identité */}
              <div className="lg:col-span-1 space-y-5">
                <div className="bg-[#f8f9fc] p-4 rounded-2xl border border-slate-100">
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <User size={14} /> Identité
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Prénom</label>
                      <input name="first_name" value={student.first_name} onChange={handleChange} disabled={readOnly} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nom</label>
                      <input name="last_name" value={student.last_name} onChange={handleChange} disabled={readOnly} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Matricule</label>
                      <input name="matricule" value={student.matricule || ''} onChange={handleChange} disabled={readOnly} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]" placeholder="Automatique ou manuel" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date de naissance</label>
                      <input type="date" name="birth_date" value={student.birth_date || ''} onChange={handleChange} disabled={readOnly} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Lieu de naissance</label>
                      <input name="birth_place" value={student.birth_place || ''} onChange={handleChange} disabled={readOnly} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]" placeholder="Ville, pays..." />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Genre</label>
                      <select name="gender" value={student.gender || ''} onChange={handleChange} disabled={readOnly} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]">
                        <option value="">Sélectionner</option>
                        <option value="M">Masculin</option>
                        <option value="F">Féminin</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Colonne 2: Contacts & Parents */}
              <div className="lg:col-span-1 space-y-5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-[11px] font-bold text-[#4f46e5] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Phone size={14} /> Contact & Parents
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Téléphone de l'élève</label>
                      <input name="phone" value={student.phone || ''} onChange={handleChange} disabled={readOnly} className="w-full px-3 py-2 bg-[#f8f9fc] border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]" placeholder="Optionnel" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Adresse</label>
                      <div className="relative">
                        <div className="absolute top-2.5 left-3 text-slate-400"><MapPin size={14} /></div>
                        <input name="address" value={student.address || ''} onChange={handleChange} disabled={readOnly} className="w-full pl-9 pr-3 py-2 bg-[#f8f9fc] border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]" placeholder="Quartier, rue..." />
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tuteur Légal / Parent</label>
                      <input name="parent_name" value={student.parent_name || ''} onChange={handleChange} disabled={readOnly} className="w-full px-3 py-2 bg-[#f8f9fc] border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]" placeholder="Nom et prénom" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Téléphone Parent</label>
                      <input name="parent_phone" value={student.parent_phone || ''} onChange={handleChange} disabled={readOnly} className="w-full px-3 py-2 bg-[#f8f9fc] border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]" placeholder="Numéro joignable" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email Parent</label>
                      <div className="relative">
                        <div className="absolute top-2.5 left-3 text-slate-400"><Mail size={14} /></div>
                        <input type="email" name="parent_email" value={student.parent_email || ''} onChange={handleChange} disabled={readOnly} className="w-full pl-9 pr-3 py-2 bg-[#f8f9fc] border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#4f46e5]" placeholder="email@exemple.com" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Colonne 3: Médical */}
              <div className="lg:col-span-1 space-y-5">
                <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                  <h3 className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Activity size={14} /> Médical & Sécurité
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Groupe sanguin</label>
                      <select name="blood_type" value={student.blood_type || ''} onChange={handleChange} disabled={readOnly} className="w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-[13px] outline-none focus:border-red-400">
                        <option value="">Non renseigné</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        <FileText size={12} /> Notes médicales (Allergies, etc.)
                      </label>
                      <textarea 
                        name="medical_notes" 
                        value={student.medical_notes || ''} 
                        onChange={handleChange} disabled={readOnly} 
                        className="w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-[13px] outline-none focus:border-red-400 min-h-[120px] resize-none"
                        placeholder="Asthme, allergie aux arachides, etc..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'results' && (
            <div className="space-y-6">
              {!enrollmentId ? (
                <div className="text-center text-slate-500 py-10 bg-slate-50 rounded-2xl">
                  L'élève n'est pas inscrit dans une classe pour l'année sélectionnée.
                </div>
              ) : periods.length === 0 ? (
                <div className="text-center text-slate-500 py-10 bg-slate-50 rounded-2xl">
                  Aucune période d'évaluation configurée pour cette année.
                </div>
              ) : (
                <>
                  <div className="flex gap-4 items-center justify-between">
                    <div className="flex gap-4 items-center">
                      <label className="text-sm font-semibold text-slate-700">Période :</label>
                      <select className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none font-medium" value={selPeriod} onChange={e => setSelPeriod(e.target.value)}>
                        {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    {averages && selectedYear && (
                      <button 
                        onClick={() => {
                          const p = periods.find(x => x.id === selPeriod);
                          generateStudentBulletin(
                            "ORION ÉDUCATION", 
                            selectedYear.name, 
                            p ? p.name : 'Période', 
                            `${student.first_name} ${student.last_name}`, 
                            student.matricule, 
                            className || 'Classe', 
                            averages
                          );
                        }}
                        className="px-4 py-2 bg-indigo-50 text-[#4f46e5] hover:bg-indigo-100 font-semibold rounded-xl text-[13px] flex items-center gap-2 transition-colors"
                      >
                        <FileText size={16} />
                        Télécharger le bulletin
                      </button>
                    )}
                  </div>
                  
                  {loadingResults ? (
                    <div className="text-center text-slate-400 py-10">Chargement des résultats...</div>
                  ) : !averages || averages.subjects.length === 0 ? (
                    <div className="text-center text-slate-500 py-10 bg-slate-50 rounded-2xl">
                      Aucun résultat disponible pour cette période.
                    </div>
                  ) : (
                    <>
                      {/* En-tête KPI */}
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-blue-50 text-blue-700 rounded-2xl p-4">
                          <div className="text-2xl font-bold">{averages.general_average !== null ? averages.general_average.toFixed(2) : '—'} <span className="text-sm font-normal opacity-70">/ 20</span></div>
                          <div className="text-xs font-medium opacity-70 mt-1">Moyenne générale</div>
                        </div>
                        <div className="bg-emerald-50 text-emerald-700 rounded-2xl p-4">
                          <div className="text-2xl font-bold">{averages.rank ?? '—'} <span className="text-sm font-normal opacity-70">/ {averages.class_size}</span></div>
                          <div className="text-xs font-medium opacity-70 mt-1">Rang dans la classe</div>
                        </div>
                        <div className="bg-indigo-50 text-indigo-700 rounded-2xl p-4">
                          <div className="text-2xl font-bold">{averages.subjects.filter(s => s.average !== null && s.average >= 10).length} <span className="text-sm font-normal opacity-70">/ {averages.subjects.length}</span></div>
                          <div className="text-xs font-medium opacity-70 mt-1">Matières validées</div>
                        </div>
                      </div>

                      {/* Détail par matière */}
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                              <th className="px-4 py-3 text-left font-semibold">Matière</th>
                              <th className="px-4 py-3 text-center font-semibold">Coef.</th>
                              <th className="px-4 py-3 text-center font-semibold">Moyenne</th>
                              <th className="px-4 py-3 text-center font-semibold">Moy. Classe</th>
                              <th className="px-4 py-3 text-center font-semibold">Appréciation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {averages.subjects.map(s => (
                              <tr key={s.class_subject_id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="font-semibold text-slate-700">{s.subject_name}</div>
                                  <div className="text-[11px] text-slate-400">{s.grade_count} note(s) saisie(s)</div>
                                </td>
                                <td className="px-4 py-3 text-center text-slate-500 font-medium">{s.coefficient}</td>
                                <td className={`px-4 py-3 text-center font-bold ${s.average !== null ? (s.average >= 10 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-400'}`}>
                                  {s.average !== null ? s.average.toFixed(2) : '—'}
                                </td>
                                <td className="px-4 py-3 text-center text-slate-500">{s.class_average !== null ? s.class_average.toFixed(2) : '—'}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600`}>
                                    {s.appreciation}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 text-red-600 p-3 rounded-xl text-sm border border-red-100">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-between items-center">
          <div>
            {success && <span className="text-green-600 text-sm flex items-center gap-1 font-medium"><Check size={16} /> Enregistré !</span>}
          </div>
          <div className="flex gap-3">
            {!readOnly && onMigrateRequest && (
              <button 
                onClick={onMigrateRequest}
                className="px-5 py-2.5 rounded-xl bg-[#ede9fe] text-[#6d28d9] text-[13px] font-semibold hover:bg-[#ddd6fe] transition-colors flex items-center gap-2"
              >
                <ArrowRight size={16} />
                Transférer
              </button>
            )}
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-[13px] font-semibold hover:bg-slate-50 transition-colors">
              Fermer
            </button>
            {tab === 'identity' && (
              <button 
                onClick={handleSave} 
                disabled={saving}
                className="flex items-center gap-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white px-6 py-2.5 rounded-xl text-[13px] font-semibold transition-all shadow-[0_4px_14px_0_rgb(79,70,229,0.39)] disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? 'Enregistrement...' : 'Enregistrer la fiche'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}