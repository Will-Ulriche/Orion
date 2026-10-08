import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmDialog } from '../components/ui';
import {
  User, Phone, Briefcase, MapPin, BookOpen,
  Shield, FileText, Info, Search, ChevronRight,
  Camera, Mail, Users, Calendar, Building,
  Star, Clock, AlertCircle, Hash, Globe,
  Baby, GraduationCap, Award,
  UserCheck, LogOut, Plus,
  CheckCircle, XCircle, Loader2, Trash2, Save,
  Eye, Printer, Download, X
} from 'lucide-react';

// ─────────────────────────────────────────────────────
// Type miroir du modèle Rust Staff
// ─────────────────────────────────────────────────────
interface Staff {
  id: string;
  school_id: string;
  matricule: string | null;
  nom: string;
  prenoms: string;
  sexe: string | null;
  date_naissance: string | null;
  lieu_naissance: string | null;
  nationalite: string | null;
  photo_url: string | null;
  situation_matrimoniale: string | null;
  nombre_enfants: number | null;
  telephone_principal: string | null;
  telephone_secondaire: string | null;
  email: string | null;
  adresse: string | null;
  region: string | null;
  prefecture: string | null;
  commune: string | null;
  quartier: string | null;
  urgence_nom: string | null;
  urgence_telephone: string | null;
  type_personnel: string | null;
  fonction: string | null;
  statut_professionnel: string | null;
  matricule_professionnel: string | null;
  categorie: string | null;
  grade: string | null;
  classe_grade: string | null;
  echelon: string | null;
  indice: number | null;
  diplome_academique: string | null;
  diplome_professionnel: string | null;
  specialite: string | null;
  date_recrutement: string | null;
  date_entree_fonction_pub: string | null;
  etablissement: string | null;
  annee_scolaire_id: string | null;
  fonction_etablissement: string | null;
  decision_affectation_num: string | null;
  date_affectation: string | null;
  date_prise_service: string | null;
  date_arrivee_region: string | null;
  date_arrivee_etablissement: string | null;
  ancien_etablissement: string | null;
  service_direction: string | null;
  matiere_principale: string | null;
  matieres_secondaires: string | null;
  classes_principales: string | null;
  volume_horaire_hebdo: number | null;
  est_prof_principal: boolean;
  est_responsable_classe: boolean;
  heures_prevues: number | null;
  heures_effectuees: number | null;
  statut_administratif: string;
  date_debut_conge: string | null;
  date_fin_conge: string | null;
  date_disponibilite: string | null;
  date_mutation: string | null;
  date_suspension: string | null;
  date_retraite: string | null;
  date_depart: string | null;
  motif_depart: string | null;
  observations: string | null;
  est_actif: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'infos_perso',     label: 'Informations personnelles',    icon: User },
  { id: 'coordonnees',     label: 'Coordonnees',                   icon: Phone },
  { id: 'infos_pro',       label: 'Informations professionnelles', icon: Briefcase },
  { id: 'affectation',     label: 'Affectation',                   icon: MapPin },
  { id: 'enseignement',    label: 'Enseignement',                  icon: BookOpen },
  { id: 'situation_admin', label: 'Situation administrative',      icon: Shield },
  { id: 'documents',       label: 'Documents',                     icon: FileText },
  { id: 'infos_systeme',   label: 'Informations systeme',          icon: Info },
];

// ─────────────────────────────────────────────────────
// Composants de base
// ─────────────────────────────────────────────────────
function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-[17px] font-bold tracking-tight text-slate-800">{title}</h2>
      {subtitle && <p className="text-[13px] text-slate-400 mt-1">{subtitle}</p>}
      <div className="mt-3 h-px bg-gradient-to-r from-[#4f46e5]/40 via-[#4f46e5]/10 to-transparent" />
    </div>
  );
}

function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : ''} gap-4`}>
      {children}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  icon?: React.ComponentType<any>;
  span?: boolean;
}

function Field({ label, value, onChange, type = 'text', placeholder, icon: Icon, span }: FieldProps) {
  return (
    <div className={span ? 'sm:col-span-2 lg:col-span-3' : ''}>
      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      <div className="relative">
        {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"><Icon size={13} /></div>}
        <input
          type={type}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? '—'}
          className={`w-full ${Icon ? 'pl-9' : 'pl-3.5'} pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 placeholder:text-slate-300 outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] transition-all duration-200`}
        />
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options, icon: Icon }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; icon?: React.ComponentType<any>;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      <div className="relative">
        {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"><Icon size={13} /></div>}
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className={`w-full ${Icon ? 'pl-9' : 'pl-3.5'} pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] appearance-none transition-all duration-200`}
        >
          <option value="">— Selectionner —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"><ChevronRight size={13} className="rotate-90" /></div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Sections de contenu (toutes contrôlées)
// ─────────────────────────────────────────────────────

function compressImage(file: File, callback: (compressedBase64: string) => void) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 500;
      const MAX_HEIGHT = 500;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = e.target?.result as string;
  };
  reader.readAsDataURL(file);
}

function SectionInfosPerso({ form, set }: { form: Staff; set: (k: keyof Staff, v: any) => void }) {
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const initials = (form.prenoms?.[0] ?? '?') + (form.nom?.[0] ?? '?');
  return (
    <div className="space-y-5">
      {previewPhoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPreviewPhoto(null)}>
          <div className="relative max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <img src={previewPhoto} alt="Aperçu de la photo" className="max-w-full max-h-[90vh] object-contain" />
            <button onClick={() => setPreviewPhoto(null)} className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>
      )}
      <SectionTitle title="Informations personnelles" subtitle="Identité et état civil" />
      <div className="flex items-center gap-5 rounded-2xl border border-[#4f46e5]/10 bg-gradient-to-r from-[#f8f9fe] via-white to-[#ede9fe]/50 p-4">
        <div 
          className={`w-20 h-20 rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg ring-4 ring-white overflow-hidden ${form.photo_url ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
          onClick={() => { if (form.photo_url) setPreviewPhoto(form.photo_url); }}
          title={form.photo_url ? "Cliquez pour agrandir" : undefined}
        >
          {form.photo_url ? (
            <img src={form.photo_url} alt="Photo du personnel" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : (
            initials.toUpperCase()
          )}
        </div>
        <div>
          <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Photo du personnel</p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] text-slate-600 hover:bg-[#ede9fe] hover:text-[#6d28d9] hover:border-[#c4b5fd] transition-all font-medium cursor-pointer w-fit">
              <Camera size={13} /> Changer la photo
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    compressImage(file, (compressedBase64) => {
                      set('photo_url', compressedBase64);
                    });
                  }
                }}
              />
            </label>
            {form.photo_url && (
              <button
                type="button"
                onClick={() => set('photo_url', null)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-[12px] text-red-600 hover:bg-red-50 hover:border-red-300 transition-all font-medium"
              >
                <Trash2 size={13} /> Supprimer
              </button>
            )}
          </div>
        </div>
      </div>
      <Grid>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Matricule</label>
            <button 
              type="button"
              onClick={() => {
                const year = new Date().getFullYear();
                const random = Math.floor(1000 + Math.random() * 9000);
                set('matricule', `PERS-${year}-${random}`);
              }}
              className="text-[10px] font-bold text-[#4f46e5] hover:text-[#4338ca] hover:underline"
            >
              Générer auto.
            </button>
          </div>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"><Hash size={13} /></div>
            <input
              type="text"
              value={form.matricule ?? ''}
              onChange={e => set('matricule', e.target.value || null)}
              placeholder="—"
              className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 placeholder:text-slate-300 outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] transition-all duration-200"
            />
          </div>
        </div>
        <Field label="Nom" value={form.nom} onChange={v => set('nom', v)} icon={User} />
        <Field label="Prenoms" value={form.prenoms} onChange={v => set('prenoms', v)} />
      </Grid>
      <Grid>
        <Select label="Sexe" value={form.sexe ?? ''} onChange={v => set('sexe', v || null)} options={['M', 'F']} />
        <Field label="Date de naissance" type="date" value={form.date_naissance ?? ''} onChange={v => set('date_naissance', v || null)} icon={Calendar} />
        <Field label="Lieu de naissance" value={form.lieu_naissance ?? ''} onChange={v => set('lieu_naissance', v || null)} icon={MapPin} />
      </Grid>
      <Grid>
        <Field label="Nationalite" value={form.nationalite ?? ''} onChange={v => set('nationalite', v || null)} icon={Globe} />
        <Select label="Situation matrimoniale" value={form.situation_matrimoniale ?? ''} onChange={v => set('situation_matrimoniale', v || null)} options={['Celibataire', 'Marie(e)', 'Divorce(e)', 'Veuf/Veuve']} />
        <Field label="Nombre d'enfants" type="number" value={form.nombre_enfants?.toString() ?? ''} onChange={v => set('nombre_enfants', v ? parseInt(v) : null)} icon={Baby} />
      </Grid>
    </div>
  );
}

function SectionCoordonnees({ form, set }: { form: Staff; set: (k: keyof Staff, v: any) => void }) {
  return (
    <div className="space-y-5">
      <SectionTitle title="Coordonnées" subtitle="Contacts et adresse" />
      <Grid>
        <Field label="Telephone principal" type="tel" value={form.telephone_principal ?? ''} onChange={v => set('telephone_principal', v || null)} icon={Phone} />
        <Field label="Telephone secondaire" type="tel" value={form.telephone_secondaire ?? ''} onChange={v => set('telephone_secondaire', v || null)} icon={Phone} />
        <Field label="Adresse" value={form.adresse ?? ''} onChange={v => set('adresse', v || null)} icon={MapPin} />
      </Grid>
      <Field label="Adresse e-mail" type="email" value={form.email ?? ''} onChange={v => set('email', v || null)} icon={Mail} span />
      <Grid>
        <Field label="Region" value={form.region ?? ''} onChange={v => set('region', v || null)} />
        <Field label="Prefecture" value={form.prefecture ?? ''} onChange={v => set('prefecture', v || null)} />
        <Field label="Commune" value={form.commune ?? ''} onChange={v => set('commune', v || null)} />
      </Grid>
      <Field label="Quartier" value={form.quartier ?? ''} onChange={v => set('quartier', v || null)} />
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-4">
        <p className="text-[12px] font-semibold text-amber-700 flex items-center gap-1.5"><AlertCircle size={13} /> Personne a contacter en cas d'urgence</p>
        <Grid cols={2}>
          <div className="sm:col-span-2">
            <Field label="Nom et prenoms" value={form.urgence_nom ?? ''} onChange={v => set('urgence_nom', v || null)} icon={User} />
          </div>
          <Field label="Telephone" type="tel" value={form.urgence_telephone ?? ''} onChange={v => set('urgence_telephone', v || null)} icon={Phone} />
        </Grid>
      </div>
    </div>
  );
}

function SectionInfosPro({ form, set }: { form: Staff; set: (k: keyof Staff, v: any) => void }) {
  return (
    <div className="space-y-5">
      <SectionTitle title="Informations professionnelles" subtitle="Statut et qualifications" />
      <Grid>
        <Select label="Type de personnel" value={form.type_personnel ?? ''} onChange={v => set('type_personnel', v || null)} options={['Enseignant', 'Administratif', 'Technique', 'De service']} icon={Briefcase} />
        <Field label="Fonction" value={form.fonction ?? ''} onChange={v => set('fonction', v || null)} icon={Award} />
        <Select label="Statut professionnel" value={form.statut_professionnel ?? ''} onChange={v => set('statut_professionnel', v || null)} options={['Fonctionnaire', 'Contractuel', 'Vacataire', 'Benevole']} />
      </Grid>
      <Grid>
        <Field label="Matricule professionnel" value={form.matricule_professionnel ?? ''} onChange={v => set('matricule_professionnel', v || null)} icon={Hash} />
        <Field label="Categorie" value={form.categorie ?? ''} onChange={v => set('categorie', v || null)} />
      </Grid>
      <Grid>
        <Field label="Grade" value={form.grade ?? ''} onChange={v => set('grade', v || null)} icon={Star} />
        <Field label="Classe" value={form.classe_grade ?? ''} onChange={v => set('classe_grade', v || null)} />
        <Field label="Echelon" value={form.echelon ?? ''} onChange={v => set('echelon', v || null)} />
      </Grid>
      <Field label="Indice" type="number" value={form.indice?.toString() ?? ''} onChange={v => set('indice', v ? parseInt(v) : null)} icon={Hash} />
      <div className="border-t border-slate-100 pt-5">
        <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-4">Qualifications</p>
        <Grid>
          <Field label="Diplome academique" value={form.diplome_academique ?? ''} onChange={v => set('diplome_academique', v || null)} icon={GraduationCap} />
          <Field label="Diplome professionnel" value={form.diplome_professionnel ?? ''} onChange={v => set('diplome_professionnel', v || null)} icon={Award} />
          <Field label="Specialite" value={form.specialite ?? ''} onChange={v => set('specialite', v || null)} />
        </Grid>
      </div>
      <Grid cols={2}>
        <Field label="Date de recrutement" type="date" value={form.date_recrutement ?? ''} onChange={v => set('date_recrutement', v || null)} icon={Calendar} />
        <Field label="Date d'entree dans la fonction publique" type="date" value={form.date_entree_fonction_pub ?? ''} onChange={v => set('date_entree_fonction_pub', v || null)} icon={Calendar} />
      </Grid>
    </div>
  );
}

function SectionAffectation({ form, set }: { form: Staff; set: (k: keyof Staff, v: any) => void }) {
  return (
    <div className="space-y-5">
      <SectionTitle title="Affectation" subtitle="Poste et historique d'affectation" />
      <Grid>
        <div className="sm:col-span-2">
          <Field label="Etablissement" value={form.etablissement ?? ''} onChange={v => set('etablissement', v || null)} icon={Building} />
        </div>
        <Field label="Annee scolaire" value={form.annee_scolaire_id ?? ''} onChange={v => set('annee_scolaire_id', v || null)} />
      </Grid>
      <Grid>
        <Field label="Fonction dans l'etablissement" value={form.fonction_etablissement ?? ''} onChange={v => set('fonction_etablissement', v || null)} icon={Briefcase} />
        <Field label="Decision d'affectation N°" value={form.decision_affectation_num ?? ''} onChange={v => set('decision_affectation_num', v || null)} icon={Hash} />
        <Field label="Date d'affectation" type="date" value={form.date_affectation ?? ''} onChange={v => set('date_affectation', v || null)} icon={Calendar} />
      </Grid>
      <Grid>
        <Field label="Date de prise de service" type="date" value={form.date_prise_service ?? ''} onChange={v => set('date_prise_service', v || null)} icon={Calendar} />
        <Field label="Date d'arrivee dans la region" type="date" value={form.date_arrivee_region ?? ''} onChange={v => set('date_arrivee_region', v || null)} icon={Calendar} />
        <Field label="Date d'arrivee dans l'etablissement" type="date" value={form.date_arrivee_etablissement ?? ''} onChange={v => set('date_arrivee_etablissement', v || null)} icon={Calendar} />
      </Grid>
      <Grid cols={2}>
        <div className="sm:col-span-2">
          <Field label="Ancien etablissement" value={form.ancien_etablissement ?? ''} onChange={v => set('ancien_etablissement', v || null)} icon={Building} />
        </div>
        <Field label="Service / Direction" value={form.service_direction ?? ''} onChange={v => set('service_direction', v || null)} />
      </Grid>
    </div>
  );
}

function SectionEnseignement({ form, set }: { form: Staff; set: (k: keyof Staff, v: any) => void }) {
  return (
    <div className="space-y-5">
      <SectionTitle title="Enseignement" subtitle="Matières et charge horaire" />
      <Grid>
        <Field label="Matiere principale" value={form.matiere_principale ?? ''} onChange={v => set('matiere_principale', v || null)} icon={BookOpen} />
        <div className="sm:col-span-2">
          <Field label="Matieres secondaires" placeholder="Separees par des virgules" value={form.matieres_secondaires ?? ''} onChange={v => set('matieres_secondaires', v || null)} />
        </div>
      </Grid>
      <Grid>
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Classes principales</label>
          <div className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] text-slate-500 min-h-[42px] flex items-center gap-2">
            {form.classes_principales ? (
              <span className="flex flex-wrap gap-1.5">
                {form.classes_principales.split(',').map((c, i) => (
                  <span key={i} className="px-2 py-0.5 bg-[#ede9fe] text-[#6d28d9] rounded-md text-[12px] font-medium">{c.trim()}</span>
                ))}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-400 italic text-[12px]">
                <BookOpen size={12} /> Renseigné automatiquement via Pédagogie &amp; Notes
              </span>
            )}
          </div>
        </div>
      </Grid>
    </div>
  );
}

function SectionSituationAdmin({ form, set }: { form: Staff; set: (k: keyof Staff, v: any) => void }) {
  const statuses = ['Actif', 'En conge', 'En disponibilite', 'Mute', 'Suspendu', 'Retraite', 'Depart'];
  const statusStyles: Record<string, string> = {
    'Actif': 'bg-green-100 text-green-700 border-green-200',
    'En conge': 'bg-amber-100 text-amber-700 border-amber-200',
    'En disponibilite': 'bg-blue-100 text-blue-700 border-blue-200',
    'Mute': 'bg-purple-100 text-purple-700 border-purple-200',
    'Suspendu': 'bg-red-100 text-red-700 border-red-200',
    'Retraite': 'bg-slate-100 text-slate-600 border-slate-200',
    'Depart': 'bg-orange-100 text-orange-700 border-orange-200',
  };
  return (
    <div className="space-y-5">
      <SectionTitle title="Situation administrative" subtitle="État et historique administratif" />
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">État actuel du personnel</p>
        <div className="flex flex-wrap gap-2">
          {statuses.map(s => (
            <button key={s} onClick={() => set('statut_administratif', s)}
              className={`px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-all ${form.statut_administratif === s ? statusStyles[s] ?? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <Grid>
        <Field label="Date de debut de conge" type="date" value={form.date_debut_conge ?? ''} onChange={v => set('date_debut_conge', v || null)} icon={Calendar} />
        <Field label="Date de fin de conge" type="date" value={form.date_fin_conge ?? ''} onChange={v => set('date_fin_conge', v || null)} icon={Calendar} />
        <Field label="Date de mise en disponibilite" type="date" value={form.date_disponibilite ?? ''} onChange={v => set('date_disponibilite', v || null)} icon={Calendar} />
      </Grid>
      <Grid>
        <Field label="Date de mutation" type="date" value={form.date_mutation ?? ''} onChange={v => set('date_mutation', v || null)} icon={Calendar} />
        <Field label="Date de suspension" type="date" value={form.date_suspension ?? ''} onChange={v => set('date_suspension', v || null)} icon={Calendar} />
        <Field label="Date de retraite" type="date" value={form.date_retraite ?? ''} onChange={v => set('date_retraite', v || null)} icon={Calendar} />
      </Grid>
      <Grid cols={2}>
        <Field label="Date de depart" type="date" value={form.date_depart ?? ''} onChange={v => set('date_depart', v || null)} icon={LogOut} />
        <Field label="Motif de depart" value={form.motif_depart ?? ''} onChange={v => set('motif_depart', v || null)} />
      </Grid>
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Observations</label>
        <textarea rows={3} value={form.observations ?? ''} onChange={e => set('observations', e.target.value || null)}
          placeholder="Observations générales..."
          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 placeholder:text-slate-300 outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] resize-none transition-all duration-200" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Génère le contenu HTML du document pour l'aperçu et le téléchargement
// ─────────────────────────────────────────────────────
function buildDocumentHTML(docName: string, staff: Staff): string {
  const today = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  const nom_complet = `${staff.nom} ${staff.prenoms}`;
  const matricule = staff.matricule ?? 'N/A';
  const fonction = staff.fonction ?? 'N/A';
  const etablissement = staff.etablissement ?? "l'établissement";
  const date_prise_service = staff.date_prise_service
    ? new Date(staff.date_prise_service).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
    : '___________';
  const date_affectation = staff.date_affectation
    ? new Date(staff.date_affectation).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
    : '___________';

  // Corps spécifique selon le type de document
  const bodies: Record<string, string> = {
    'Attestation de service': `
      <p>Le Directeur de ${etablissement} soussigné atteste que :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet}
      </p>
      <p>Matricule : <strong>${matricule}</strong><br/>
      est actuellement en service dans notre établissement en qualité de <strong>${fonction}</strong>
      depuis le <strong>${date_prise_service}</strong>.</p>
      <p>Cette attestation lui est délivrée pour servir et valoir ce que de droit.</p>`,

    'Certificat de service': `
      <p>Nous, Directeur de ${etablissement}, certifions que :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet} — Matricule : ${matricule}
      </p>
      <p>occupe le poste de <strong>${fonction}</strong> au sein de notre établissement
      depuis le <strong>${date_affectation}</strong>.</p>
      <p>Le présent certificat est établi à sa demande pour tous usages légaux.</p>`,

    'Attestation de prise de service': `
      <p>Le Directeur de ${etablissement} atteste que :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet} — Matricule : ${matricule}
      </p>
      <p>a effectivement pris service dans notre établissement en qualité de <strong>${fonction}</strong>
      à compter du <strong>${date_prise_service}</strong>.</p>
      <p>En foi de quoi, la présente attestation lui est délivrée pour servir et valoir ce que de droit.</p>`,

    'Attestation de reprise de service': `
      <p>Le Directeur de ${etablissement} atteste que :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet} — Matricule : ${matricule}
      </p>
      <p>a repris son service en qualité de <strong>${fonction}</strong> le <strong>${today}</strong>,
      après une période d'absence autorisée.</p>
      <p>Cette attestation est délivrée pour servir et valoir ce que de droit.</p>`,

    'Attestation de fin de contrat': `
      <p>Le Directeur de ${etablissement} atteste que :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet} — Matricule : ${matricule}
      </p>
      <p>a exercé les fonctions de <strong>${fonction}</strong> au sein de notre établissement.
      Son contrat a pris fin le <strong>${staff.date_depart ? new Date(staff.date_depart).toLocaleDateString('fr-FR') : today}</strong>
      ${staff.motif_depart ? `pour le motif suivant : <em>${staff.motif_depart}</em>` : ''}.</p>
      <p>Cette attestation est délivrée pour servir et valoir ce que de droit.</p>`,

    'Quitus administratif': `
      <p>Le présent quitus administratif atteste que :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet} — Matricule : ${matricule}
      </p>
      <p>a rempli toutes les obligations administratives vis-à-vis de ${etablissement} et qu'il/elle
      ne doit rien à l'établissement au titre de ses fonctions de <strong>${fonction}</strong>.</p>
      <p>En foi de quoi, le présent quitus lui est délivré pour servir et valoir ce que de droit.</p>`,

    'Certificat de salaire': `
      <p>Nous certifions que :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet} — Matricule : ${matricule}
      </p>
      <p>est rémunéré(e) mensuellement par ${etablissement} en tant que <strong>${fonction}</strong>
      ${staff.indice ? `avec un indice de <strong>${staff.indice}</strong>` : ''}.
      Statut : <strong>${staff.statut_professionnel ?? 'N/A'}</strong>.</p>
      <p>Ce certificat est établi à la demande de l'intéressé(e).</p>`,

    'Bulletin de salaire': `
      <p style="text-align:center; margin-bottom: 16px;"><strong>BULLETIN DE PAIE — ${today}</strong></p>
      <table style="width:100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
        <tr style="background:#4f46e5; color:white;"><th style="padding:8px; text-align:left;">Désignation</th><th style="padding:8px; text-align:right;">Détail</th></tr>
        <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px;">Nom et Prénoms</td><td style="padding:8px; text-align:right; font-weight:bold;">${nom_complet}</td></tr>
        <tr style="border-bottom:1px solid #e2e8f0; background:#f8f9fa;"><td style="padding:8px;">Matricule</td><td style="padding:8px; text-align:right;">${matricule}</td></tr>
        <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px;">Fonction</td><td style="padding:8px; text-align:right;">${fonction}</td></tr>
        <tr style="border-bottom:1px solid #e2e8f0; background:#f8f9fa;"><td style="padding:8px;">Grade / Echelon</td><td style="padding:8px; text-align:right;">${staff.grade ?? '—'} / ${staff.echelon ?? '—'}</td></tr>
        <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px;">Indice</td><td style="padding:8px; text-align:right;">${staff.indice ?? '—'}</td></tr>
        <tr style="border-bottom:1px solid #e2e8f0; background:#f8f9fa;"><td style="padding:8px;">Catégorie</td><td style="padding:8px; text-align:right;">${staff.categorie ?? '—'}</td></tr>
      </table>
      <p style="font-size:11px; color:#64748b;">Ce bulletin est généré à titre indicatif. La rémunération exacte est fixée par décision administrative.</p>`,

    "Autorisation d'absence": `
      <p>Le Directeur de ${etablissement} autorise :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet} — Matricule : ${matricule}
      </p>
      <p>fonctionnaire au grade de <strong>${fonction}</strong>, à s'absenter du service
      du <strong>___________</strong> au <strong>___________</strong>
      pour le motif suivant : <strong>___________</strong>.</p>
      <p>L'intéressé(e) devra reprendre son service dès la fin de la période autorisée.</p>`,

    'Autorisation de conge': `
      <p>Le Directeur de ${etablissement} accorde à :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet} — Matricule : ${matricule}
      </p>
      <p>un congé du <strong>${staff.date_debut_conge ? new Date(staff.date_debut_conge).toLocaleDateString('fr-FR') : '___________'}</strong>
      au <strong>${staff.date_fin_conge ? new Date(staff.date_fin_conge).toLocaleDateString('fr-FR') : '___________'}</strong>.</p>
      <p>L'intéressé(e) est tenu(e) de reprendre son poste à l'expiration de ce congé.</p>`,

    'Attestation de formation': `
      <p>Le Directeur de ${etablissement} atteste que :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet} — Matricule : ${matricule}
      </p>
      <p>a participé à une formation dans le domaine de <strong>${staff.specialite ?? '___________'}</strong>
      du <strong>___________</strong> au <strong>___________</strong>.</p>
      <p>Cette attestation est délivrée pour servir et valoir ce que de droit.</p>`,

    'Attestation de stage': `
      <p>Le Directeur de ${etablissement} atteste que :</p>
      <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
        ${nom_complet} — Matricule : ${matricule}
      </p>
      <p>a effectué un stage au sein de notre établissement en qualité de <strong>${fonction}</strong>
      du <strong>___________</strong> au <strong>___________</strong>.</p>
      <p>Ce stage s'est déroulé dans de bonnes conditions. Cette attestation est délivrée pour servir et valoir ce que de droit.</p>`,
  };

  const body = bodies[docName] ?? `
    <p>Le Directeur de ${etablissement} certifie que :</p>
    <p style="margin: 20px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #4f46e5; font-size: 15px; font-weight: bold;">
      ${nom_complet} — Matricule : ${matricule}
    </p>
    <p>en qualité de <strong>${fonction}</strong>, a droit au présent document : <em>${docName}</em>.</p>
    <p>Cette attestation est délivrée pour servir et valoir ce que de droit.</p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${docName} — ${nom_complet}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; color: #1e293b; background: white; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 18mm; position: relative; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
    .header-left { text-align: left; }
    .header-right { text-align: right; }
    .country { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 600; }
    .ministry { font-size: 12px; font-weight: 700; color: #1e293b; margin: 4px 0; }
    .school { font-size: 13px; font-weight: 600; color: #4f46e5; }
    .ref { font-size: 11px; color: #94a3b8; margin-top: 4px; }
    .doc-title { text-align: center; margin: 28px 0 24px; }
    .doc-title h1 { font-family: 'Libre Baskerville', Georgia, serif; font-size: 22px; color: #1e293b; text-transform: uppercase; letter-spacing: 2px; }
    .doc-title .underline { width: 80px; height: 3px; background: #4f46e5; margin: 10px auto 0; border-radius: 2px; }
    .body { font-size: 14px; line-height: 1.9; color: #334155; }
    .body p { margin-bottom: 14px; }
    .signature { margin-top: 48px; display: flex; justify-content: flex-end; }
    .signature-block { text-align: center; min-width: 200px; }
    .signature-block .city-date { font-size: 12px; color: #64748b; margin-bottom: 60px; }
    .signature-block .name { font-size: 13px; font-weight: 600; border-top: 1px solid #cbd5e1; padding-top: 8px; }
    .signature-block .title { font-size: 11px; color: #64748b; }
    .footer { position: absolute; bottom: 15mm; left: 18mm; right: 18mm; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { margin: 0; padding: 15mm; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-left">
        <p class="country">République de Guinée</p>
        <p class="ministry">Ministère de l'Éducation Nationale</p>
        <p class="school">${etablissement}</p>
      </div>
      <div class="header-right">
        <p class="ref">Réf. : ${matricule}/${new Date().getFullYear()}</p>
        <p class="ref">Date : ${today}</p>
      </div>
    </div>

    <div class="doc-title">
      <h1>${docName.toUpperCase()}</h1>
      <div class="underline"></div>
    </div>

    <div class="body">
      ${body}
    </div>

    <div class="signature">
      <div class="signature-block">
        <p class="city-date">Fait à _____________, le ${today}</p>
        <p class="name">Le Directeur</p>
        <p class="title">Cachet et signature</p>
      </div>
    </div>

    <div class="footer">
      <span>${etablissement}</span>
      <span>Document généré le ${today} — Confidentiel</span>
    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────
// Modal d'aperçu PDF
// ─────────────────────────────────────────────────────
function DocumentPreviewModal({ docName, staff, onClose, onDownload }: {
  docName: string;
  staff: Staff;
  onClose: () => void;
  onDownload: () => void;
}) {
  const htmlContent = buildDocumentHTML(docName, staff);
  const blobUrl = useMemo(() => {
    const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
    return URL.createObjectURL(blob);
  }, [htmlContent]);

  useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
        {/* En-tête du modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#ede9fe] text-[#7c3aed] flex items-center justify-center">
              <FileText size={16} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">{docName}</h3>
              <p className="text-[11px] text-slate-400">{staff.nom} {staff.prenoms} · {staff.matricule ?? 'Sans matricule'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const iframe = document.getElementById('doc-preview-frame') as HTMLIFrameElement;
                iframe?.contentWindow?.print();
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Printer size={13} /> Imprimer / PDF
            </button>
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white rounded-lg text-[12px] font-semibold transition-colors"
            >
              <Download size={13} /> Télécharger
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors">
              <XCircle size={16} />
            </button>
          </div>
        </div>

        {/* Zone d'aperçu */}
        <div className="flex-1 overflow-hidden bg-slate-200 p-4">
          <div className="h-full rounded-xl overflow-hidden shadow-lg">
            <iframe
              id="doc-preview-frame"
              src={blobUrl}
              className="w-full h-full border-0 bg-white"
              title={`Aperçu — ${docName}`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <p className="text-[11px] text-slate-400 text-center">
            Aperçu du document · Utilisez <strong>Imprimer / PDF</strong> pour enregistrer en PDF, ou <strong>Télécharger</strong> pour obtenir le fichier HTML.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Section Documents
// ─────────────────────────────────────────────────────
function SectionDocuments({ staff }: { staff: Staff }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());

  const categories = [
    { label: 'Attestations de service', color: 'blue', docs: ['Attestation de service', 'Certificat de service', 'Attestation de prise de service', 'Attestation de reprise de service', 'Attestation de fin de contrat', 'Quitus administratif'] },
    { label: 'Documents salariaux', color: 'green', docs: ['Certificat de salaire', 'Bulletin de salaire'] },
    { label: 'Autorisations & conges', color: 'amber', docs: ["Autorisation d'absence", "Autorisation de conge"] },
    { label: 'Formation & stage', color: 'purple', docs: ['Attestation de formation', 'Attestation de stage'] },
  ];

  const colorMap: Record<string, { badge: string; icon: string; btn: string }> = {
    blue:   { badge: 'bg-blue-50 text-blue-600 border-blue-100',    icon: 'text-blue-400',   btn: 'hover:bg-blue-600 hover:border-blue-600' },
    green:  { badge: 'bg-green-50 text-green-600 border-green-100', icon: 'text-green-400',  btn: 'hover:bg-green-600 hover:border-green-600' },
    amber:  { badge: 'bg-amber-50 text-amber-600 border-amber-100', icon: 'text-amber-400',  btn: 'hover:bg-amber-600 hover:border-amber-600' },
    purple: { badge: 'bg-purple-50 text-purple-600 border-purple-100', icon: 'text-purple-400', btn: 'hover:bg-[#4f46e5] hover:border-[#4f46e5]' },
  };

  const handleDownload = (docName: string) => {
    const html = buildDocumentHTML(docName, staff);
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docName.replace(/[\s']/g, '_')}_${staff.matricule ?? staff.id}.html`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    setDownloaded(prev => new Set([...prev, docName]));
    setPreview(null);
  };

  return (
    <>
      <div className="space-y-6">
        <SectionTitle title="Documents administratifs" subtitle={`Documents officiels pour ${staff.nom} ${staff.prenoms}`} />
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2.5">
          <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-blue-600">
            Cliquez sur <strong>Aperçu</strong> pour visualiser le document avant de le télécharger.
            Utilisez <strong>Imprimer / PDF</strong> dans l'aperçu pour l'enregistrer en PDF.
          </p>
        </div>
        <div className="space-y-5">
          {categories.map(cat => {
            const c = colorMap[cat.color];
            return (
              <div key={cat.label}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${c.badge} mb-2 w-fit`}>
                  <FileText size={12} className={c.icon} />
                  <span className="text-[11px] font-bold uppercase tracking-wide">{cat.label}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cat.docs.map(doc => {
                    const isDone = downloaded.has(doc);
                    return (
                      <div key={doc} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all group">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-green-50 text-green-500' : 'bg-slate-50 text-slate-400'}`}>
                            {isDone ? <CheckCircle size={13} /> : <FileText size={13} />}
                          </div>
                          <span className="text-[12.5px] text-slate-700 font-medium truncate">{doc}</span>
                        </div>
                        <button
                          onClick={() => setPreview(doc)}
                          className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ml-2
                            ${isDone
                              ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-600 hover:text-white hover:border-green-600'
                              : `bg-white text-slate-500 border-slate-200 ${c.btn} hover:text-white`}`}
                        >
                          <Eye size={11} />
                          {isDone ? 'Revoir' : 'Aperçu'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {preview && (
        <DocumentPreviewModal
          docName={preview}
          staff={staff}
          onClose={() => setPreview(null)}
          onDownload={() => handleDownload(preview)}
        />
      )}
    </>
  );
}


function SectionInfosSysteme({ staff }: { staff: Staff }) {
  return (
    <div className="space-y-6">
      <SectionTitle title="Informations système" subtitle="Métadonnées et traçabilité" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Identifiant du personnel', value: staff.id || '—' },
          { label: 'Date de creation du dossier', value: staff.created_at ? new Date(staff.created_at).toLocaleDateString('fr-FR') : '—' },
          { label: 'Derniere modification', value: staff.updated_at ? new Date(staff.updated_at).toLocaleString('fr-FR') : '—' },
          { label: 'Cree par', value: staff.created_by ?? '—' },
          { label: 'Modifie par', value: staff.updated_by ?? '—' },
        ].map(item => (
          <div key={item.label} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{item.label}</p>
            <p className="text-[13px] font-mono text-slate-600 break-all">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Statut du dossier</p>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold border ${staff.est_actif ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
            {staff.est_actif ? <><CheckCircle size={14} /> Dossier actif</> : <><XCircle size={14} /> Dossier inactif</>}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Modal Nouveau Personnel
// ─────────────────────────────────────────────────────
function CreateModal({ schoolId, onClose, onCreate }: { schoolId: string; onClose: () => void; onCreate: (s: Staff) => void }) {
  const [nom, setNom] = useState('');
  const [prenoms, setPrenoms] = useState('');
  const [sexe, setSexe] = useState('');
  const [matricule, setMatricule] = useState(() => {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `PERS-${year}-${random}`;
  });
  const [type_personnel, setType] = useState('');
  const [fonction, setFonction] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!nom.trim() || !prenoms.trim()) { setError('Nom et Prenoms sont obligatoires.'); return; }
    setSaving(true); setError(null);
    try {
      const created = await invoke<Staff>('create_staff', {
        schoolId, nom: nom.trim(), prenoms: prenoms.trim(),
        sexe: sexe || null, matricule: matricule || null,
        typePersonnel: type_personnel || null,
        fonction: fonction || null, statutAdministratif: null,
      });
      onCreate(created);
      onClose();
    } catch (e: any) { setError(e.toString()); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-800">Nouveau membre du personnel</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5"><XCircle size={18} /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Nom <span className="text-[#4f46e5]">*</span></label>
              <input value={nom} onChange={e => setNom(e.target.value)} placeholder="NOM" className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] transition-all duration-200" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Prénoms <span className="text-[#4f46e5]">*</span></label>
              <input value={prenoms} onChange={e => setPrenoms(e.target.value)} placeholder="Prénoms" className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] transition-all duration-200" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Sexe</label>
              <select value={sexe} onChange={e => setSexe(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] appearance-none transition-all duration-200">
                <option value="">—</option><option value="M">M</option><option value="F">F</option>
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Matricule</label>
                <button 
                  type="button"
                  onClick={() => {
                    const year = new Date().getFullYear();
                    const random = Math.floor(1000 + Math.random() * 9000);
                    setMatricule(`PERS-${year}-${random}`);
                  }}
                  className="text-[10px] font-bold text-[#4f46e5] hover:text-[#4338ca] hover:underline"
                >
                  Générer auto.
                </button>
              </div>
              <input value={matricule} onChange={e => setMatricule(e.target.value)} placeholder="MAT-001" className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] transition-all duration-200" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Type de personnel</label>
            <select value={type_personnel} onChange={e => setType(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] appearance-none transition-all duration-200">
              <option value="">— Sélectionner —</option>
              {['Enseignant', 'Administratif', 'Technique', 'De service'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Fonction</label>
            <input value={fonction} onChange={e => setFonction(e.target.value)} placeholder="Ex : Professeur de Mathématiques" className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] transition-all duration-200" />
          </div>
          {error && <div className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-lg p-2.5">{error}</div>}
          <div className="flex gap-3 mt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Annuler</button>
            <button onClick={handleCreate} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Création...</> : <><Plus size={14} /> Créer</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Toast animé (succès / erreur)
// ─────────────────────────────────────────────────────
function Toast({ type, message, onClose }: { type: 'success' | 'error'; message: string; onClose: () => void }) {
  const isSuccess = type === 'success';
  return (
    <div
      role="status"
      className={`fixed bottom-6 right-6 z-[70] flex max-w-sm animate-toast-in items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-raise backdrop-blur-sm
        ${isSuccess ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800' : 'border-red-200 bg-red-50/95 text-red-700'}`}
    >
      <span className={`mt-px flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${isSuccess ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
        {isSuccess ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
      </span>
      <p className="flex-1 text-[13px] leading-relaxed">{message}</p>
      <button onClick={onClose} aria-label="Fermer" className="mt-0.5 flex-shrink-0 rounded-md p-0.5 opacity-50 transition-opacity hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────
export default function Personnel() {
  const { schoolId } = useAuth();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [form, setForm] = useState<Staff | null>(null);
  const [activeSection, setActiveSection] = useState('infos_perso');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Staff | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [dirty, setDirty] = useState(false);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), type === 'success' ? 3500 : 7000);
  }, []);

  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  /** Charge la photo complète d'un membre (la liste n'embarque plus les photos). */
  const loadPhoto = async (s: Staff): Promise<Staff | null> => {
    try {
      const photo_url = await invoke<Staff['photo_url']>('get_staff_photo', { staffId: s.id });
      return { ...s, photo_url };
    } catch (e: any) {
      showToast('error', `Impossible de charger la photo : ${e.toString()}`);
      return null;
    }
  };

  const loadStaff = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const data = await invoke<Staff[]>('get_staff', { schoolId, includePhotos: false });
      setStaffList(data);
      if (data.length > 0 && !selected) {
        const full = await loadPhoto(data[0]);
        if (full) {
          setSelected(full);
          setForm(structuredClone(full));
        }
      }
    } catch (e: any) { showToast('error', e.toString()); }
    finally { setLoading(false); }
  }, [schoolId, showToast]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const setField = useCallback((k: keyof Staff, v: any) => {
    setForm(prev => prev ? { ...prev, [k]: v } : prev);
    setDirty(true);
  }, []);

  const handleSelect = async (s: Staff) => {
    const full = await loadPhoto(s);
    if (!full) return;
    setSelected(full);
    setForm(structuredClone(full));
    setDirty(false);
    setToast(null);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await invoke('update_staff', { staff: form });
      setStaffList(prev => prev.map(s => s.id === form.id ? form : s));
      setSelected(form);
      setDirty(false);
      showToast('success', 'Modifications enregistrées avec succès !');
    } catch (e: any) { showToast('error', e.toString()); }
    finally { setSaving(false); }
  };

  const handleDiscard = () => {
    if (selected) { setForm(structuredClone(selected)); setDirty(false); }
  };

  const handleDelete = (s: Staff) => setPendingDelete(s);

  const confirmDelete = async () => {
    const s = pendingDelete;
    setPendingDelete(null);
    if (!s) return;
    try {
      await invoke('delete_staff', { id: s.id, schoolId });
      const remaining = staffList.filter(x => x.id !== s.id);
      setStaffList(remaining);
      if (remaining.length > 0) { await handleSelect(remaining[0]); }
      else { setSelected(null); setForm(null); }
      showToast('success', `Dossier de ${s.nom} ${s.prenoms} supprimé.`);
    } catch (e: any) { showToast('error', e.toString()); }
  };

  const filtered = useMemo(() =>
    staffList.filter(s =>
      `${s.nom} ${s.prenoms} ${s.matricule ?? ''} ${s.fonction ?? ''}`.toLowerCase().includes(search.toLowerCase())
    ), [staffList, search]
  );

  const statusColor = (s: string) => {
    if (s === 'Actif') return 'bg-green-100 text-green-700';
    if (s === 'En conge') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-500';
  };

  // Progression du dossier : une section est considérée comme renseignée
  // dès que ses champs principaux sont remplis.
  const isSectionDone = (id: string, f: Staff): boolean => {
    switch (id) {
      case 'infos_perso':     return !!(f.date_naissance && f.sexe);
      case 'coordonnees':     return !!(f.telephone_principal || f.email);
      case 'infos_pro':       return !!(f.type_personnel && f.fonction);
      case 'affectation':     return !!(f.etablissement || f.date_affectation);
      case 'enseignement':    return !!(f.matiere_principale || f.matieres_secondaires || f.classes_principales);
      case 'situation_admin': return f.statut_administratif !== 'Actif' || !!(f.date_debut_conge || f.date_depart || f.observations);
      case 'documents':       return true;
      case 'infos_systeme':   return true;
      default:                return false;
    }
  };

  const doneCount = form ? SECTIONS.filter(s => isSectionDone(s.id, form)).length : 0;
  const completion = Math.round((doneCount / SECTIONS.length) * 100);
  const RING_RADIUS = 16;
  const RING_CIRC = 2 * Math.PI * RING_RADIUS;

  const renderSection = () => {
    if (!form) return null;
    switch (activeSection) {
      case 'infos_perso':     return <SectionInfosPerso form={form} set={setField} />;
      case 'coordonnees':     return <SectionCoordonnees form={form} set={setField} />;
      case 'infos_pro':       return <SectionInfosPro form={form} set={setField} />;
      case 'affectation':     return <SectionAffectation form={form} set={setField} />;
      case 'enseignement':    return <SectionEnseignement form={form} set={setField} />;
      case 'situation_admin': return <SectionSituationAdmin form={form} set={setField} />;
      case 'documents':       return <SectionDocuments staff={form} />;
      case 'infos_systeme':   return <SectionInfosSysteme staff={form} />;
      default: return null;
    }
  };

  return (
    <div className="flex h-full bg-gradient-to-b from-slate-50 to-[#f8f9fc] overflow-hidden">

      {/* ── Colonne gauche : liste ── */}
      <div className="w-72 flex-shrink-0 border-r border-slate-200/70 bg-white flex flex-col h-full">
        <div className="px-4 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white shadow-sm">
                <Users size={14} />
              </span>
              <h2 className="text-[15px] font-bold tracking-tight text-slate-800">Personnel</h2>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{staffList.length}</span>
            </div>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 rounded-lg bg-gradient-to-br from-[#4f46e5] to-[#6d28d9] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110">
              <Plus size={12} /> Nouveau
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] outline-none hover:border-slate-300 focus:ring-2 focus:ring-[#4f46e5]/15 focus:border-[#4f46e5] placeholder:text-slate-300 transition-all duration-200" />
            {search && (
              <button onClick={() => setSearch('')} title="Effacer la recherche"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 px-3 py-3 border-b border-slate-100">
          {[
            { label: 'Total', value: staffList.length, tint: 'bg-[#eef2ff] text-[#4f46e5]' },
            { label: 'Actifs', value: staffList.filter(s => s.statut_administratif === 'Actif').length, tint: 'bg-emerald-50 text-emerald-600' },
            { label: 'Autres', value: staffList.filter(s => s.statut_administratif !== 'Actif').length, tint: 'bg-amber-50 text-amber-600' },
          ].map(stat => (
            <div key={stat.label} className={`rounded-xl ${stat.tint} px-2 py-2 text-center transition-transform duration-200 hover:-translate-y-0.5`}>
              <p className="text-[15px] font-bold leading-none">{stat.value}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-wider opacity-70">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 border-t border-slate-100 px-2.5 py-2.5 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Users size={32} strokeWidth={1} className="mb-2 opacity-40" />
              <p className="text-[12px]">{staffList.length === 0 ? 'Aucun personnel enregistre' : 'Aucun resultat'}</p>
            </div>
          ) : filtered.map(s => (
            <div key={s.id} onClick={() => handleSelect(s)}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-xl cursor-pointer group transition-all duration-200 ring-1 ${selected?.id === s.id ? 'bg-white shadow-raise ring-[#4f46e5]/25' : 'bg-transparent hover:bg-white hover:shadow-card ring-transparent'}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 transition-all duration-200 ${selected?.id === s.id ? 'bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white shadow-md ring-2 ring-[#ede9fe]' : 'bg-slate-200/70 text-slate-500 group-hover:bg-slate-200'}`}>
                {(s.prenoms[0] ?? '?').toUpperCase()}{(s.nom[0] ?? '?').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-semibold truncate ${selected?.id === s.id ? 'text-[#4c1d95]' : 'text-slate-700'}`}>
                  {s.nom} {s.prenoms}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{s.fonction ?? s.type_personnel ?? '—'}</p>
                <span className={`inline-flex mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusColor(s.statut_administratif)}`}>
                  {s.statut_administratif}
                </span>
              </div>
              <button onClick={e => { e.stopPropagation(); handleDelete(s); }}
                className="w-6 h-6 rounded-lg hover:bg-red-50 hover:text-red-500 text-slate-300 flex items-center justify-center transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Zone centrale : formulaire ── */}
      {form ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {/* Bandeau sticky */}
            <div className="sticky top-0 z-10 bg-white/85 backdrop-blur-md border-b border-slate-200/70 px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-base font-bold shadow-lg ring-4 ring-white">
                  {(form.prenoms[0] ?? '?').toUpperCase()}{(form.nom[0] ?? '?').toUpperCase()}
                </div>
                <div>
                  <h1 className="text-[15px] font-bold tracking-tight text-slate-800">{form.nom} {form.prenoms}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    {form.matricule && <span className="font-mono text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{form.matricule}</span>}
                    {form.fonction && <span className="text-[12px] text-slate-500">{form.fonction}</span>}
                    <span className={`ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(form.statut_administratif)}`}>
                      {form.statut_administratif}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {dirty && (
                  <span className="animate-scale-in text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">Modifié</span>
                )}
                {dirty && (
                  <button onClick={handleDiscard} className="animate-scale-in px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 font-medium transition-all duration-200">
                    Annuler
                  </button>
                )}
                <button onClick={handleSave} disabled={saving || !dirty}
                  className={`px-4 py-1.5 bg-[#4f46e5] text-white rounded-lg text-[12px] font-semibold hover:bg-[#4338ca] transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${dirty ? 'animate-scale-in shadow-sm hover:shadow-md' : ''}`}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Enregistrer
                </button>
              </div>
            </div>

            <div key={activeSection} className="px-6 py-6 animate-slide-in">
              <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200/70 bg-white p-6 shadow-card sm:p-7 lg:p-8">
                {renderSection()}
              </div>
            </div>
          </div>

          {/* ── Colonne droite : navigation sections ── */}
          <div className="w-56 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col py-4">
            {form && (
              <div className="mx-4 mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#4f46e5] via-[#6366f1] to-[#7c3aed] px-3 py-3 text-white shadow-lg">
                <div className="flex items-center gap-3">
                  <svg width="42" height="42" viewBox="0 0 42 42" className="-rotate-90 flex-shrink-0">
                    <circle cx="21" cy="21" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="5" />
                    <circle
                      cx="21" cy="21" r={RING_RADIUS} fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={RING_CIRC}
                      strokeDashoffset={RING_CIRC * (1 - completion / 100)}
                      className="transition-all duration-700 ease-out"
                    />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold">Dossier complété</p>
                    <p className="text-[10px] text-white/75">{completion}% · {doneCount}/{SECTIONS.length} sections</p>
                  </div>
                </div>
              </div>
            )}
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 mb-3">Sections</p>
            <div className="flex flex-col gap-0.5 px-2">
              {SECTIONS.map(sec => {
                const isActive = activeSection === sec.id;
                const done = form ? isSectionDone(sec.id, form) : false;
                return (
                  <button key={sec.id} onClick={() => setActiveSection(sec.id)}
                    className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-200 w-full ${isActive ? 'bg-[#ede9fe] text-[#6d28d9] shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                    <sec.icon size={14} className={`flex-shrink-0 ${isActive ? 'text-[#7c3aed]' : 'text-slate-400'}`} />
                    <span className={`text-[12px] leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>{sec.label}</span>
                    {isActive ? (
                      <>
                        <span className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#7c3aed]" />
                        <ChevronRight size={11} className="ml-auto flex-shrink-0 text-[#7c3aed]" />
                      </>
                    ) : (
                      <span className={`ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full transition-colors ${done ? 'bg-green-400' : 'bg-slate-200'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm text-center rounded-3xl border border-dashed border-slate-300 bg-white/70 px-8 py-10 backdrop-blur-sm">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white shadow-lg">
              <Users size={24} />
            </span>
            <p className="text-[15px] font-bold text-slate-700">Aucun personnel sélectionné</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">Sélectionnez un membre dans la liste à gauche ou créez un nouveau dossier.</p>
            <button onClick={() => setShowCreate(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#6d28d9] px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:brightness-110 mx-auto">
              <Plus size={14} /> Ajouter un membre
            </button>
          </div>
        </div>
      )}

      {/* Modal de creation */}
      {showCreate && (
        <CreateModal schoolId={schoolId!} onClose={() => setShowCreate(false)} onCreate={s => {
          setStaffList(prev => [...prev, s]);
          handleSelect(s);
        }} />
      )}

      {/* Confirmation de suppression */}
      {pendingDelete && (
        <ConfirmDialog
          title="Supprimer le dossier"
          message={`Le dossier de « ${pendingDelete.nom} ${pendingDelete.prenoms} » sera définitivement supprimé. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {/* Toasts */}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
