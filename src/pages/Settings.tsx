import { useState, useEffect, type ReactNode } from 'react';
import {
  Building2, Save, MapPin, Phone, Mail, Calendar, Check, Globe, Coins, Clock,
  Upload, X, Image as ImageIcon, Landmark, UserCog, Contact, Lightbulb,
  Tag, Hash, School, ShieldCheck, Sparkles, Download, DownloadCloud, RefreshCw,
  AlertTriangle, CheckCircle2, HardDriveDownload, Rocket
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import AcademicYearsManager from '../components/AcademicYearsManager';
import { useAuth } from '../contexts/AuthContext';
import { useUpdater } from '../contexts/UpdateContext';
import { updateSchoolSettings } from '../lib/superAdminApi';
import orionLogo from '../assets/orion_logo.png';

interface SchoolSettings {
  name: string;
  short_name: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  phone_secondary: string;
  email: string;
  website: string;
  currency: string;
  timezone: string;
  logo_url: string;
  stamp_url: string;
  signature_url: string;
  ministry_name: string;
  head_title: string;
  head_name: string;
  slogan: string;
  registration_number: string;
}

const EMPTY: SchoolSettings = {
  name: '', short_name: '', address: '', city: '', country: 'Togo',
  phone: '', phone_secondary: '', email: '', website: '',
  currency: 'XOF', timezone: 'Africa/Lome',
  logo_url: '', stamp_url: '', signature_url: '',
  ministry_name: '', head_title: 'Directeur', head_name: '', slogan: '', registration_number: '',
};

// ─── Zone d'upload d'image ────────────────────────────────────────────────────
function ImageUploadZone({
  label, value, fieldKey, onSet, hint
}: {
  label: string;
  value: string;
  fieldKey: string;
  onSet: (key: string, val: string) => void;
  hint: string;
}) {
  const handlePick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (ev: any) => {
      const file = ev.target.files?.[0];
      if (!file) return;

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const max = 800;
        let { width, height } = img;
        
        if (width > max || height > max) {
          const ratio = Math.min(max / width, max / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/webp', 0.8);
          onSet(fieldKey, dataUrl);
        } else {
          const reader = new FileReader();
          reader.onload = () => onSet(fieldKey, reader.result as string);
          reader.readAsDataURL(file);
        }
      };
      img.src = url;
    };
    input.click();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <label className="block text-[12px] font-medium text-[#787774] w-full">{label}</label>
      <div
        onClick={handlePick}
        className="w-full h-32 rounded-xl border border-dashed border-[#e3e2de] hover:border-[#2383e2] bg-[#fbfbfa] hover:bg-[#f1f1ef] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group relative overflow-hidden"
      >
        {value ? (
          <>
            <img src={value} alt={label} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-contain p-2" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all">
              <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 bg-[#37352f]/80 px-2 py-1 rounded">Remplacer</span>
            </div>
          </>
        ) : (
          <>
            <Upload size={20} className="text-[#9b9a97] group-hover:text-[#2383e2] transition-colors" />
            <span className="text-[12px] text-[#787774] group-hover:text-[#2383e2] font-normal transition-colors">{hint}</span>
          </>
        )}
      </div>
      {value && (
        <button onClick={(e) => { e.stopPropagation(); onSet(fieldKey, ''); }} className="text-[11px] text-[#eb5757] hover:underline flex items-center gap-1">
          <X size={12} /> Supprimer
        </button>
      )}
    </div>
  );
}

// ─── Composants Notion Style ──────────────────────────────────────────────────
const notionInputClass = "w-full px-3 py-2 bg-[#fbfbfa] hover:bg-[#f1f1ef]/60 focus:bg-white border border-[#e3e2de] focus:border-[#2383e2] focus:ring-2 focus:ring-[#2383e2]/15 rounded-lg outline-none transition-all text-[13.5px] text-[#37352f] placeholder:text-[#9b9a97] shadow-[0_1px_2px_rgba(15,15,15,0.03)]";
const notionLabelClass = "block text-[12px] font-medium text-[#787774] mb-1.5";

function NotionSection({
  icon, title, description, children, className = ''
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-[#e9e8e4] p-5 shadow-[0_1px_3px_rgba(15,15,15,0.02)] space-y-4 hover:border-[#dedcd5] transition-colors ${className}`}>
      <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#f1f1ef]">
        {icon && <span className="text-[#787774] text-base">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-[#37352f] leading-snug">{title}</h3>
          {description && <p className="text-[12px] text-[#787774] mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function NotionField({
  label, icon, required, children
}: {
  label: string;
  icon?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className={notionLabelClass}>
        {icon && <span className="text-[#9b9a97]">{icon}</span>}
        <span>{label}</span>
        {required && <span className="text-[#eb5757] ml-0.5">*</span>}
      </label>
      <div className="relative group">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { schoolId } = useAuth();
  const {
    status: updateStatus,
    currentVersion,
    updateInfo,
    progress: updateProgress,
    errorMessage: updateError,
    lastChecked,
    autoCheck,
    setAutoCheck,
    checkForUpdates,
    downloadAndInstall,
    restartApp,
  } = useUpdater();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [formData, setFormData] = useState<SchoolSettings>(EMPTY);
  const [activeTab, setActiveTab] = useState<'general' | 'identity' | 'years' | 'updates'>('general');

  useEffect(() => {
    invoke('get_school_settings', { schoolId })
      .then((data: any) => {
        if (data) setFormData(prev => ({ ...prev, ...data }));
      }).catch(console.error);
  }, [schoolId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageSet = (key: string, val: string) => {
    setFormData(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await invoke('save_school_settings', { payload: JSON.stringify(formData), schoolId });
      setStatus({ type: 'success', msg: 'Modifications enregistrées' });
      setTimeout(() => setStatus(null), 4000);

      // Propagation best-effort vers le cloud : la direction et la
      // super-administration partagent ainsi les mêmes informations.
      if (schoolId && schoolId !== 'school-1') {
        updateSchoolSettings(schoolId, {
          name: formData.name,
          short_name: formData.short_name || null,
          address: formData.address || null,
          city: formData.city || null,
          country: formData.country || null,
          phone_primary: formData.phone || null,
          phone_secondary: formData.phone_secondary || null,
          email: formData.email || null,
          website: formData.website || null,
          currency: formData.currency || null,
          timezone: formData.timezone || null,
        }).catch(err => console.warn('Propagation cloud des paramètres échouée:', err));
      }
    } catch (err) {
      setStatus({ type: 'error', msg: `Erreur: ${err}` });
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { key: 'general', label: 'Informations générales', icon: <Building2 size={14} /> },
    { key: 'identity', label: 'Identité visuelle', icon: <ImageIcon size={14} /> },
    { key: 'years', label: 'Années scolaires', icon: <Calendar size={14} /> },
    { key: 'updates', label: 'Mises à jour', icon: <DownloadCloud size={14} /> },
  ] as const;

  return (
    <div className="w-full min-h-full bg-[#fbfbfa] text-[#37352f]">

      {/* ── Top Bar Notion ── sticky */}
      <div className="sticky top-0 z-10 px-8 pt-5 pb-3 flex items-center justify-between border-b border-[#e9e8e4] bg-white shadow-[0_1px_0_rgba(55,53,47,0.06)] flex-shrink-0">
        <div className="flex items-center gap-2 text-[13px] text-[#787774]">
          <span className="cursor-default">Workspace</span>
          <span>/</span>
          <span className="font-medium text-[#37352f] flex items-center gap-1.5">
            <School size={15} className="text-[#787774]" /> Paramètres
          </span>
        </div>

        <div className="flex items-center gap-3">
          {status && (
            <span className={`text-[12.5px] flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-md ${
              status.type === 'success' ? 'bg-[#edf7ed] text-[#2e7d32]' : 'bg-[#fdeded] text-[#d32f2f]'
            }`}>
              {status.type === 'success' ? <Check size={13} /> : <X size={13} />}
              {status.msg}
            </span>
          )}
          {activeTab === 'updates' ? (
            <button
              onClick={() => checkForUpdates(false)}
              disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
              className="bg-[#2383e2] hover:bg-[#1a73e8] text-white px-3.5 py-1.5 rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            >
              <RefreshCw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
              {updateStatus === 'checking' ? 'Vérification...' : 'Rechercher les mises à jour'}
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || !formData.name}
              className="bg-[#2383e2] hover:bg-[#1a73e8] text-white px-3.5 py-1.5 rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            >
              <Save size={14} />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>

      {/* ── Onglets ── sticky juste en dessous */}
      <div className="sticky top-[53px] z-10 px-8 border-b border-[#e9e8e4] bg-white flex items-center gap-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-3 py-2.5 border-b-2 text-[13px] font-medium transition-all cursor-pointer ${
              activeTab === tab.key
                ? 'border-[#37352f] text-[#37352f]'
                : 'border-transparent text-[#787774] hover:text-[#37352f]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Contenu (défilement géré par le <main> du Layout) ── */}
      <div className="px-8 py-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* ── ONGLET : INFORMATIONS GÉNÉRALES (NOTION DESIGN) ── */}
          {/* ═════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in duration-200">

              {/* 1. Couverture Notion & En-tête de page */}
              <div className="relative rounded-2xl overflow-visible border border-[#e9e8e4] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">

                {/* Bannière / Couverture */}
                <div className="h-36 w-full rounded-t-2xl bg-gradient-to-br from-[#dde8f5] via-[#edf1f7] to-[#ede8f5] relative overflow-hidden">
                  {/* Motif pointillé subtil */}
                  <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#a5b4c5_1px,transparent_1px)] [background-size:18px_18px]" />
                  {/* Halo doux à gauche */}
                  <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full bg-[#93b5e1]/30 blur-3xl pointer-events-none" />
                  {/* Badge vérifié */}
                  <div className="absolute top-3 right-3">
                    <span className="text-[11px] font-semibold text-[#2383e2] bg-white/95 backdrop-blur-sm border border-[#d0e4f7] px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1.5">
                      <ShieldCheck size={12} className="text-[#2383e2]" /> Établissement vérifié
                    </span>
                  </div>
                </div>

                {/* Zone logo + titre : chevauchement contrôlé */}
                <div className="px-6 pt-0 pb-5">
                  {/* Ligne logo + titre */}
                  <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-9 mb-5">
                    {/* Logo */}
                    <div
                      onClick={() => setActiveTab('identity')}
                      title="Modifier le logo dans Identité visuelle"
                      className="w-[72px] h-[72px] flex-shrink-0 rounded-2xl bg-white border-[3px] border-white shadow-lg ring-1 ring-black/8 flex items-center justify-center overflow-hidden cursor-pointer hover:scale-105 transition-transform z-10"
                    >
                      {formData.logo_url ? (
                        <img src={formData.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                      ) : (
                        <span className="text-3xl select-none">🏫</span>
                      )}
                    </div>

                    {/* Titre & Slogan */}
                    <div className="relative z-10 min-w-0 pb-1 pt-10 sm:pt-0">
                      <h1 className="text-[22px] sm:text-[26px] font-bold text-[#37352f] tracking-tight leading-tight">
                        {formData.name || <span className="text-[#b5b3ad] font-medium italic">Nom de l'établissement</span>}
                      </h1>
                      <p className="text-[12.5px] text-[#9b9a97] mt-1 italic leading-snug">
                        {formData.slogan ? `« ${formData.slogan} »` : 'Ajouter une devise ou un slogan…'}
                      </p>
                    </div>
                  </div>

                  {/* Propriétés de fiche — séparateur + grille */}
                  <div className="border-t border-[#f0eeeb] pt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                      {[
                        { icon: <Tag size={12} />, label: 'Sigle', value: formData.short_name },
                        { icon: <Hash size={12} />, label: 'Agrément', value: formData.registration_number },
                        { icon: <UserCog size={12} />, label: 'Direction', value: formData.head_name ? `${formData.head_title} ${formData.head_name}` : null },
                        { icon: <MapPin size={12} />, label: 'Ville', value: [formData.city, formData.country].filter(Boolean).join(', ') || null },
                      ].map(({ icon, label, value }) => (
                        <div key={label} className="flex flex-col gap-0.5">
                          <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#9b9a97] flex items-center gap-1">
                            {icon} {label}
                          </span>
                          <span className={`text-[12.5px] font-medium truncate ${value ? 'text-[#37352f]' : 'text-[#b5b3ad] italic'}`}>
                            {value || 'Non défini'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Blocs de formulaire Notion */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Bloc 1 : Établissement & Dénomination */}
                <NotionSection
                  icon={<Landmark size={16} className="text-[#787774]" />}
                  title="Établissement & Dénomination"
                  description="Informations officielles déclarées auprès du ministère"
                >
                  <NotionField label="Ministère de tutelle">
                    <textarea
                      name="ministry_name"
                      value={formData.ministry_name}
                      onChange={handleChange}
                      placeholder="Ex : Ministère des Enseignements Primaire et Secondaire"
                      className={`${notionInputClass} resize-none`}
                      rows={2}
                    />
                  </NotionField>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <NotionField label="Nom complet de l'établissement" required>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          placeholder="Ex : Complexe Scolaire Orion"
                          className={notionInputClass}
                        />
                      </NotionField>
                    </div>
                    <div>
                      <NotionField label="Sigle / Court">
                        <input
                          type="text"
                          name="short_name"
                          value={formData.short_name}
                          onChange={handleChange}
                          placeholder="CSO"
                          className={notionInputClass}
                        />
                      </NotionField>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NotionField label="Numéro d'agrément / Immatriculation">
                      <input
                        type="text"
                        name="registration_number"
                        value={formData.registration_number}
                        onChange={handleChange}
                        placeholder="Ex : MEPS-2024-00123"
                        className={notionInputClass}
                      />
                    </NotionField>
                    <NotionField label="Devise / Slogan">
                      <input
                        type="text"
                        name="slogan"
                        value={formData.slogan}
                        onChange={handleChange}
                        placeholder="Ex : Travail - Discipline - Succès"
                        className={notionInputClass}
                      />
                    </NotionField>
                  </div>
                </NotionSection>

                {/* Bloc 2 : Direction & Signature */}
                <NotionSection
                  icon={<UserCog size={16} className="text-[#787774]" />}
                  title="Direction & Représentation"
                  description="Signataire officiel pour les documents et attestations"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <NotionField label="Titre officiel">
                        <select
                          name="head_title"
                          value={formData.head_title}
                          onChange={handleChange}
                          className={`${notionInputClass} cursor-pointer`}
                        >
                          <option value="Directeur">Directeur</option>
                          <option value="Directrice">Directrice</option>
                          <option value="Proviseur">Proviseur</option>
                          <option value="Proviseure">Proviseure</option>
                          <option value="Censeur">Censeur</option>
                          <option value="Principal">Principal</option>
                          <option value="Principale">Principale</option>
                          <option value="Recteur">Recteur</option>
                          <option value="Administrateur">Administrateur</option>
                        </select>
                      </NotionField>
                    </div>
                    <div className="sm:col-span-2">
                      <NotionField label="Nom complet du responsable">
                        <input
                          type="text"
                          name="head_name"
                          value={formData.head_name}
                          onChange={handleChange}
                          placeholder="Ex : M. Kofi AGBENYEFIA"
                          className={notionInputClass}
                        />
                      </NotionField>
                    </div>
                  </div>

                  {/* Callout Notion */}
                  <div className="bg-[#fbfbfa] border border-[#e9e8e4] rounded-lg p-3.5 text-[12.5px] text-[#37352f] flex items-start gap-2.5">
                    <Lightbulb size={16} className="text-[#f2994a] flex-shrink-0 mt-0.5" />
                    <span className="leading-relaxed text-[#787774]">
                      Le titre et le nom renseignés ici seront automatiquement apposés au bas de tous les <strong className="text-[#eb5757]">bulletins de notes</strong>, <strong className="text-[#eb5757]">reçus de paiement</strong> et <strong className="text-[#eb5757]">certificats de scolarité</strong>.
                    </span>
                  </div>
                </NotionSection>

                {/* Bloc 3 : Coordonnées & Contact */}
                <NotionSection
                  icon={<Contact size={16} className="text-[#787774]" />}
                  title="Coordonnées & Contact"
                  description="Moyens de communication pour les parents et administrations"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NotionField label="Email de contact" icon={<Mail size={12} className="inline mr-1" />}>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="direction@ecole.tg"
                        className={notionInputClass}
                      />
                    </NotionField>
                    <NotionField label="Site web officiel" icon={<Globe size={12} className="inline mr-1" />}>
                      <input
                        type="url"
                        name="website"
                        value={formData.website}
                        onChange={handleChange}
                        placeholder="https://www.ecole.tg"
                        className={notionInputClass}
                      />
                    </NotionField>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NotionField label="Téléphone principal" icon={<Phone size={12} className="inline mr-1" />}>
                      <input
                        type="text"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+228 90 00 00 00"
                        className={notionInputClass}
                      />
                    </NotionField>
                    <NotionField label="Téléphone secondaire" icon={<Phone size={12} className="inline mr-1" />}>
                      <input
                        type="text"
                        name="phone_secondary"
                        value={formData.phone_secondary}
                        onChange={handleChange}
                        placeholder="+228 90 00 00 01"
                        className={notionInputClass}
                      />
                    </NotionField>
                  </div>
                </NotionSection>

                {/* Bloc 4 : Localisation géographique */}
                <NotionSection
                  icon={<MapPin size={16} className="text-[#787774]" />}
                  title="Localisation physique"
                  description="Adresse postale figurant sur les en-têtes officiels"
                >
                  <NotionField label="Adresse physique / Quartier">
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="Quartier, rue ou boîte postale..."
                      className={notionInputClass}
                    />
                  </NotionField>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NotionField label="Ville">
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        placeholder="Lomé"
                        className={notionInputClass}
                      />
                    </NotionField>
                    <NotionField label="Pays">
                      <input
                        type="text"
                        name="country"
                        value={formData.country}
                        onChange={handleChange}
                        placeholder="Togo"
                        className={notionInputClass}
                      />
                    </NotionField>
                  </div>
                </NotionSection>

                {/* Bloc 5 : Paramètres régionaux & Monétaires (Plein format) */}
                <NotionSection
                  icon={<Coins size={16} className="text-[#787774]" />}
                  title="Paramètres régionaux & Financiers"
                  description="Devise de facturation et référence horaire pour l'historique et les reçus"
                  className="md:col-span-2"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <NotionField label="Devise monétaire" icon={<Coins size={12} className="inline mr-1" />}>
                      <select
                        name="currency"
                        value={formData.currency}
                        onChange={handleChange}
                        className={`${notionInputClass} cursor-pointer`}
                      >
                        <option value="XOF">Franc CFA BCEAO (XOF)</option>
                        <option value="XAF">Franc CFA CEMAC (XAF)</option>
                        <option value="EUR">Euro (€)</option>
                        <option value="USD">Dollar ($)</option>
                      </select>
                    </NotionField>

                    <NotionField label="Fuseau horaire" icon={<Clock size={12} className="inline mr-1" />}>
                      <select
                        name="timezone"
                        value={formData.timezone}
                        onChange={handleChange}
                        className={`${notionInputClass} cursor-pointer`}
                      >
                        <option value="Africa/Lome">Lomé / Togo (GMT+0)</option>
                        <option value="Africa/Abidjan">Abidjan / Côte d'Ivoire (GMT+0)</option>
                        <option value="Africa/Accra">Accra / Ghana (GMT+0)</option>
                        <option value="Africa/Dakar">Dakar / Sénégal (GMT+0)</option>
                        <option value="Africa/Libreville">Libreville / Gabon (GMT+1)</option>
                        <option value="Africa/Douala">Douala / Cameroun (GMT+1)</option>
                        <option value="Africa/Lagos">Lagos / Nigeria (GMT+1)</option>
                        <option value="Africa/Kinshasa">Kinshasa / RDC (GMT+1)</option>
                        <option value="Europe/Paris">Paris (CET/CEST)</option>
                      </select>
                    </NotionField>
                  </div>
                </NotionSection>

              </div>

              {/* Barre d'action finale Notion */}
              <div className="flex items-center justify-between pt-4 border-t border-[#e9e8e4] text-[12px] text-[#787774]">
                <span>Toutes les modifications sont synchronisées avec la base locale.</span>
                <button
                  onClick={handleSave}
                  disabled={saving || !formData.name}
                  className="bg-[#2383e2] hover:bg-[#1a73e8] text-white px-4 py-2 rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <Save size={14} />
                  {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
                </button>
              </div>

            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* ── ONGLET : IDENTITÉ VISUELLE ── */}
          {/* ═════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'identity' && (
            <div className="bg-white rounded-xl p-6 border border-[#e9e8e4] shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-[#f1f1ef]">
                <div className="w-8 h-8 rounded-lg bg-[#f1f1ef] text-[#37352f] flex items-center justify-center flex-shrink-0">
                  <ImageIcon size={16} />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[#37352f]">Identité visuelle</h3>
                  <p className="text-[12px] text-[#787774]">Ces éléments seront intégrés sur les bulletins, attestations et documents officiels.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ImageUploadZone
                  label="Logo de l'établissement"
                  value={formData.logo_url}
                  fieldKey="logo_url"
                  onSet={handleImageSet}
                  hint="Cliquer pour importer"
                />
                <ImageUploadZone
                  label="Cachet officiel"
                  value={formData.stamp_url}
                  fieldKey="stamp_url"
                  onSet={handleImageSet}
                  hint="Importer le cachet"
                />
                <ImageUploadZone
                  label="Signature du responsable"
                  value={formData.signature_url}
                  fieldKey="signature_url"
                  onSet={handleImageSet}
                  hint="Importer la signature"
                />
              </div>

              <div className="bg-[#fbfbfa] border border-[#e9e8e4] rounded-lg p-3 text-[12px] text-[#787774] flex items-start gap-2">
                <Lightbulb size={15} className="text-[#f2994a] flex-shrink-0 mt-0.5" />
                <span><strong>Conseil format :</strong> Pour un rendu optimal, utilisez des fichiers PNG à fond transparent d'au moins 300 DPI.</span>
              </div>

              <div className="flex justify-end pt-3 border-t border-[#f1f1ef]">
                <button
                  onClick={handleSave}
                  disabled={saving || !formData.name}
                  className="bg-[#2383e2] hover:bg-[#1a73e8] text-white px-4 py-2 rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Save size={14} />
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* ── ONGLET : ANNÉES SCOLAIRES ── */}
          {/* ═════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'years' && (
            <div className="bg-white rounded-xl p-6 border border-[#e9e8e4] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <AcademicYearsManager />
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* ── ONGLET : MISES À JOUR (DIRECT DOWNLOAD OTA) ── */}
          {/* ═════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'updates' && (
            <div className="space-y-6 animate-in fade-in duration-200">

              {/* 1. Carte principale : État & Téléchargement */}
              <div className="bg-white rounded-xl border border-[#e9e8e4] p-6 shadow-[0_1px_3px_rgba(15,15,15,0.02)] space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#f1f1ef]">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#fbfbfa] border border-[#e3e2de] p-2 flex items-center justify-center shadow-xs">
                      <img src={orionLogo} alt="Orion" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-[#37352f]">Mises à jour d'Orion</h3>
                        <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#f1f1ef] text-[#787774] border border-[#e3e2de]">
                          v{currentVersion}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-[#787774] mt-0.5">
                        Canal officiel de distribution · Téléchargement et installation directe
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => checkForUpdates(false)}
                    disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                    className="bg-[#2383e2] hover:bg-[#1a73e8] text-white px-4 py-2 rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer self-start sm:self-auto"
                  >
                    <RefreshCw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                    {updateStatus === 'checking' ? 'Vérification...' : 'Vérifier maintenant'}
                  </button>
                </div>

                {/* Statut dynamique */}
                {updateStatus === 'checking' && (
                  <div className="p-5 rounded-xl bg-[#fbfbfa] border border-[#e9e8e4] flex items-center gap-3 text-[13px] text-[#787774]">
                    <RefreshCw size={18} className="animate-spin text-[#2383e2] flex-shrink-0" />
                    <span>Recherche de mises à jour auprès du serveur officiel Orion...</span>
                  </div>
                )}

                {/* MISE À JOUR DISPONIBLE */}
                {updateStatus === 'available' && updateInfo && (
                  <div className="p-5 rounded-xl bg-gradient-to-br from-[#ebf5ff] to-[#f0f4fa] border border-[#b8dbfc] space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0066cc] uppercase tracking-wider bg-white/80 px-2 py-0.5 rounded-md border border-[#cce4ff]">
                          <Sparkles size={12} className="text-[#0066cc]" /> Nouvelle version disponible
                        </span>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-base font-bold text-[#1f2937]">Orion v{updateInfo.version}</span>
                          <span className="text-[12px] text-[#4b5563]">
                            (actuelle : v{currentVersion})
                          </span>
                        </div>
                        {updateInfo.date && (
                          <p className="text-[11.5px] text-[#6b7280] mt-0.5">
                            Date de publication : {new Date(updateInfo.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={downloadAndInstall}
                        className="bg-[#2383e2] hover:bg-[#1a73e8] active:scale-[0.98] text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer self-start sm:self-auto"
                      >
                        <Download size={15} />
                        Télécharger et installer
                      </button>
                    </div>

                    {/* Notes de version */}
                    <div className="bg-white/90 rounded-lg p-3.5 border border-[#d8e6f5] space-y-1.5">
                      <p className="text-[11.5px] font-bold text-[#4b5563] uppercase tracking-wider">
                        Nouveautés & Correctifs inclus
                      </p>
                      <div className="text-[12.5px] text-[#374151] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                        {updateInfo.body || "Mise à niveau de stabilité, de sécurité et améliorations ergonomiques d'Orion."}
                      </div>
                    </div>
                  </div>
                )}

                {/* TÉLÉCHARGEMENT EN COURS */}
                {updateStatus === 'downloading' && (
                  <div className="p-5 rounded-xl bg-[#f0f9ff] border border-[#bae6fd] space-y-3">
                    <div className="flex items-center justify-between text-[13px]">
                      <div className="flex items-center gap-2 text-[#0369a1] font-semibold">
                        <HardDriveDownload size={18} className="animate-bounce" />
                        <span>Téléchargement d'Orion v{updateInfo?.version || ''}...</span>
                      </div>
                      <span className="font-bold text-[#0284c7]">{updateProgress.percent}%</span>
                    </div>

                    <div className="w-full bg-[#e0f2fe] rounded-full h-3 overflow-hidden p-0.5 border border-[#bae6fd]">
                      <div
                        className="bg-[#0284c7] h-full rounded-full transition-all duration-200"
                        style={{ width: `${Math.max(5, updateProgress.percent)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11.5px] text-[#64748b]">
                      <span>Volume transféré</span>
                      <span className="font-mono">
                        {(updateProgress.downloaded / (1024 * 1024)).toFixed(1)} Mo
                        {updateProgress.total > 0 && ` / ${(updateProgress.total / (1024 * 1024)).toFixed(1)} Mo`}
                      </span>
                    </div>
                  </div>
                )}

                {/* TÉLÉCHARGÉ ET PRÊT À INSTALLER */}
                {updateStatus === 'downloaded' && (
                  <div className="p-5 rounded-xl bg-[#ecfdf5] border border-[#a7f3d0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 size={22} className="text-[#059669] flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-[13.5px] font-bold text-[#065f46]">Mise à jour prête pour l'installation</h4>
                        <p className="text-[12px] text-[#047857] mt-0.5">
                          Le fichier d'installation a été téléchargé et validé cryptographiquement. Relancez l'application pour finaliser.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={restartApp}
                      className="bg-[#059669] hover:bg-[#047857] text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer self-start sm:self-auto"
                    >
                      <Rocket size={15} />
                      Redémarrer Orion
                    </button>
                  </div>
                )}

                {/* DÉJÀ À JOUR */}
                {updateStatus === 'up-to-date' && (
                  <div className="p-4 rounded-xl bg-[#f6fbf7] border border-[#d1ebd7] flex items-center justify-between gap-3 text-[13px]">
                    <div className="flex items-center gap-2.5 text-[#2e7d32]">
                      <CheckCircle2 size={18} className="flex-shrink-0 text-[#2e7d32]" />
                      <span>Votre application est parfaitement à jour (version <strong>v{currentVersion}</strong>).</span>
                    </div>
                    {lastChecked && (
                      <span className="text-[11.5px] text-[#787774]">
                        Dernier contrôle : {lastChecked.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}

                {/* ERREUR */}
                {updateStatus === 'error' && (
                  <div className="p-4 rounded-xl bg-[#fff8f5] border border-[#fed7aa] space-y-2">
                    <div className="flex items-start gap-2.5 text-[#c2410c]">
                      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[13px] font-semibold">Impossible de vérifier les mises à jour</p>
                        <p className="text-[12px] text-[#9a3412] mt-0.5">
                          {updateError || "Vérifiez votre connexion Internet ou réessayez dans quelques instants."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Préférences : Vérification automatique */}
              <div className="bg-white rounded-xl border border-[#e9e8e4] p-5 shadow-[0_1px_3px_rgba(15,15,15,0.02)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h4 className="text-[13.5px] font-semibold text-[#37352f]">
                      Recherche automatique au démarrage
                    </h4>
                    <p className="text-[12px] text-[#787774]">
                      Orion vérifiera automatiquement en arrière-plan la disponibilité d'une nouvelle version chaque fois que l'application s'ouvre.
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
                    <input
                      type="checkbox"
                      checked={autoCheck}
                      onChange={(e) => setAutoCheck(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-[#e3e2de] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2383e2]"></div>
                  </label>
                </div>
              </div>

              {/* 3. Informations techniques et sécurité */}
              <div className="bg-white rounded-xl border border-[#e9e8e4] p-5 shadow-[0_1px_3px_rgba(15,15,15,0.02)] space-y-3">
                <h4 className="text-[13.5px] font-semibold text-[#37352f] flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[#2e7d32]" /> Sécurité et Intégrité
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12.5px] pt-1">
                  <div className="p-3 rounded-lg bg-[#fbfbfa] border border-[#e9e8e4]">
                    <span className="text-[#787774] block text-[11px] uppercase tracking-wider font-medium">Source officielle</span>
                    <span className="text-[#37352f] font-medium text-[12px] truncate block mt-0.5">
                      Serveur officiel sécurisé Orion
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#fbfbfa] border border-[#e9e8e4]">
                    <span className="text-[#787774] block text-[11px] uppercase tracking-wider font-medium">Signature cryptographique</span>
                    <span className="text-[#2e7d32] font-semibold flex items-center gap-1 mt-0.5">
                      <Check size={13} /> Minisign Ed25519 vérifiée
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
