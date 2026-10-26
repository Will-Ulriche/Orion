import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, User, Phone, Mail, MapPin, Activity, FileText, Save, Check, ArrowRight, Camera, Trash2, Loader2, KeyRound, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { uploadStudentPhoto, deleteStudentPhoto, isLocalBase64 } from '../lib/photoStorage';

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

export default function StudentProfileModal({ studentId, className, onClose, onUpdated, onMigrateRequest, readOnly = false }: StudentProfileModalProps) {
  const { schoolId } = useAuth();

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Photo de l'élève
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Modal de code d'autorisation pour ajout/modification de photo
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [photoCode, setPhotoCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    loadStudent();
  }, [studentId]);

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

  const handlePhotoClick = () => {
    if (readOnly || uploadingPhoto) return;
    setPhotoCode('');
    setCodeError('');
    setShowCode(false);
    setShowCodeModal(true);
  };

  const handleValidateCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = photoCode.trim();
    if (!trimmed.startsWith('#')) {
      setCodeError("Code d'accès incorrect. Veuillez réessayer.");
      return;
    }
    setShowCodeModal(false);
    setPhotoCode('');
    setCodeError('');
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 60);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !student) return;
    // Réinitialiser l'input pour permettre de re-sélectionner le même fichier
    e.target.value = '';

    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const result = await uploadStudentPhoto(file, schoolId, student.id);
      if (!result) {
        setPhotoError('Envoi de la photo échoué.');
        return;
      }
      setStudent(s => (s ? { ...s, photo_url: result.url } : s));
    } catch (err: any) {
      setPhotoError(err?.message ?? "Erreur inconnue");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    if (!student) return;
    deleteStudentPhoto(schoolId, student.id);
    setStudent(s => (s ? { ...s, photo_url: null } : s));
    setPhotoError(null);
  };

  if (loading) {
    return (
      <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-6 shadow-2xl">Chargement...</div>
      </div>
    );
  }
  if (!student) return null;

  const initials = `${student.first_name?.charAt(0) ?? ''}${student.last_name?.charAt(0) ?? ''}`.toUpperCase();

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[24px] max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-[#f8f9fc]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] overflow-hidden flex items-center justify-center border-2 border-white shadow-sm">
              {student.photo_url ? (
                <img src={student.photo_url} alt="Photo" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-[13px] font-bold">{initials}</span>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Colonne 1: Identité */}
              <div className="lg:col-span-1 space-y-5">
                {/* Photo de l'élève */}
                <div className="bg-[#f8f9fc] p-4 rounded-2xl border border-slate-100">
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Camera size={14} /> Photo de l'élève
                  </h3>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handlePhotoClick}
                      disabled={readOnly || uploadingPhoto}
                      className={`relative w-20 h-20 rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-xl font-bold ring-4 ring-white shadow-md overflow-hidden flex-shrink-0 ${readOnly ? 'cursor-default' : 'cursor-pointer hover:opacity-90 transition-opacity'}`}
                      title={readOnly ? undefined : 'Cliquez pour choisir une photo'}
                    >
                      {student.photo_url ? (
                        <img src={student.photo_url} alt="Photo de l'élève" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        initials
                      )}
                      {uploadingPhoto && (
                        <span className="absolute inset-0 bg-black/45 flex items-center justify-center">
                          <Loader2 size={20} className="animate-spin" />
                        </span>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <input
                        ref={fileInputRef}
                        id="student-photo-input"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={readOnly || uploadingPhoto}
                        onChange={handlePhotoChange}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={handlePhotoClick}
                            disabled={uploadingPhoto}
                            className={`flex items-center gap-2 px-3 py-1.5 bg-white border rounded-lg text-[12px] font-medium transition-all w-fit ${
                              uploadingPhoto
                                ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                                : 'border-slate-200 text-slate-600 hover:bg-[#ede9fe] hover:text-[#6d28d9] hover:border-[#c4b5fd] cursor-pointer'
                            }`}
                          >
                            {uploadingPhoto ? (
                              <><Loader2 size={13} className="animate-spin" /> Envoi en cours…</>
                            ) : (
                              <><Camera size={13} /> {student.photo_url ? 'Changer la photo' : 'Ajouter une photo'}</>
                            )}
                          </button>
                        )}
                        {!readOnly && student.photo_url && !uploadingPhoto && (
                          <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-[12px] text-red-600 hover:bg-red-50 hover:border-red-300 transition-all font-medium"
                          >
                            <Trash2 size={13} /> Supprimer
                          </button>
                        )}
                        {isLocalBase64(student.photo_url) && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Stockée localement
                          </span>
                        )}
                      </div>
                      {photoError && <p className="mt-2 text-[11px] text-red-600">{photoError}</p>}
                      {!readOnly && (
                        <p className="mt-2 text-[11px] text-slate-400">
                          La photo est enregistrée avec la fiche (format JPG, 500 px max).
                        </p>
                      )}
                    </div>
                  </div>
                </div>

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
            <button
              onClick={handleSave} 
              disabled={saving}
              className="flex items-center gap-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white px-6 py-2.5 rounded-xl text-[13px] font-semibold transition-all shadow-[0_4px_14px_0_rgb(79,70,229,0.39)] disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Enregistrement...' : 'Enregistrer la fiche'}
            </button>
          </div>
        </div>
      </div>

      {/* Pop-up de confirmation du code pour ajouter/modifier la photo */}
      {showCodeModal && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onMouseDown={e => { if (e.target === e.currentTarget) { setShowCodeModal(false); setPhotoCode(''); setCodeError(''); } }}
        >
          <div 
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h4 className="text-[15px] font-bold text-slate-800">Code d'autorisation</h4>
                  <p className="text-[11.5px] text-slate-400">Modification de la photo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowCodeModal(false); setPhotoCode(''); setCodeError(''); }}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleValidateCode}>
              <p className="text-[12.5px] text-slate-600 mb-3 leading-relaxed">
                Veuillez entrer le code d'accès pour modifier la photo de cet élève :
              </p>

              <div className="mb-3">
                <div className="relative flex items-center">
                  <input
                    type={showCode ? "text" : "password"}
                    autoFocus
                    placeholder="Entrez le code d'accès..."
                    value={photoCode}
                    onChange={e => {
                      setPhotoCode(e.target.value);
                      if (codeError) setCodeError('');
                    }}
                    className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-[14px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-800 placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCode(v => !v)}
                    title={showCode ? "Masquer le code" : "Afficher le code"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors rounded-lg"
                  >
                    {showCode ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {codeError && (
                  <p className="text-[11.5px] text-red-600 font-medium mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} className="flex-shrink-0" />
                    <span>{codeError}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowCodeModal(false); setPhotoCode(''); setCodeError(''); }}
                  className="px-3.5 py-2 rounded-xl text-[12.5px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-[12.5px] font-semibold text-white bg-[#4f46e5] hover:bg-[#4338ca] shadow-sm transition-colors"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}