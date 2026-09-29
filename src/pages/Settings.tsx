import { useState, useEffect } from 'react';
import {
  Building2, Save, MapPin, Phone, Mail, Calendar, Check, Globe, Map, Coins, Clock,
  Upload, X, Image as ImageIcon
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import AcademicYearsManager from '../components/AcademicYearsManager';

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

// Composant de zone d'upload d'image
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
      const reader = new FileReader();
      reader.onload = () => onSet(fieldKey, reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <label className="block text-[12px] font-bold text-slate-600 w-full">{label}</label>
      <div
        onClick={handlePick}
        className="w-full h-32 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#4f46e5] bg-slate-50 hover:bg-[#f0f3ff] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group relative overflow-hidden"
      >
        {value ? (
          <>
            <img src={value} alt={label} className="absolute inset-0 w-full h-full object-contain p-2" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all">
              <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100">Changer</span>
            </div>
          </>
        ) : (
          <>
            <Upload size={22} className="text-slate-300 group-hover:text-[#4f46e5] transition-colors" />
            <span className="text-[12px] text-slate-400 group-hover:text-[#4f46e5] font-medium transition-colors">{hint}</span>
          </>
        )}
      </div>
      {value && (
        <button onClick={(e) => { e.stopPropagation(); onSet(fieldKey, ''); }} className="text-[11px] text-red-400 hover:text-red-600 flex items-center gap-1">
          <X size={12} /> Retirer
        </button>
      )}
    </div>
  );
}

export default function Settings() {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [formData, setFormData] = useState<SchoolSettings>(EMPTY);
  const [activeTab, setActiveTab] = useState<'general' | 'identity' | 'years'>('general');

  useEffect(() => {
    invoke('get_school_settings').then((data: any) => {
      if (data) setFormData(prev => ({ ...prev, ...data }));
    }).catch(console.error);
  }, []);

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
      await invoke('save_school_settings', { payload: JSON.stringify(formData) });
      setStatus({ type: 'success', msg: 'Paramètres sauvegardés avec succès.' });
      setTimeout(() => setStatus(null), 4000);
    } catch (err) {
      setStatus({ type: 'error', msg: `Erreur: ${err}` });
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = "w-full px-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700";
  const labelClass = "block text-[12px] font-semibold text-[#1e293b] mb-1.5";

  const TABS = [
    { key: 'general', label: 'Informations générales', icon: <Building2 size={14} strokeWidth={2.5} /> },
    { key: 'identity', label: 'Identité visuelle', icon: <ImageIcon size={14} strokeWidth={2.5} /> },
    { key: 'years', label: 'Années scolaires', icon: <Calendar size={14} strokeWidth={2.5} /> },
  ] as const;

  const SaveBar = () => (
    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
      <div>
        {status && (
          <span className={`text-sm flex items-center gap-1.5 font-medium ${status.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
            {status.type === 'success' ? <Check size={14} /> : <X size={14} />}
            {status.msg}
          </span>
        )}
      </div>
      <button
        onClick={handleSave}
        disabled={saving || !formData.name}
        className="bg-[#4f46e5] hover:bg-[#4338ca] text-white px-5 py-2 rounded-xl text-[13px] font-semibold flex items-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_0_rgb(79,70,229,0.35)]"
      >
        <Save size={15} />
        {saving ? 'Enregistrement...' : 'Sauvegarder'}
      </button>
    </div>
  );

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full flex flex-col bg-[#f8f9fc]">
      <div className="mb-4 flex-shrink-0">
        <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight">Paramètres</h2>
        <p className="text-slate-500 mt-0.5 text-[13px]">Configurez les informations et le cycle de vie de l'école.</p>
      </div>

      {/* Onglets */}
      <div className="flex bg-white border border-slate-200/70 p-1 rounded-xl w-fit mb-4 flex-shrink-0 gap-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-[13px] transition-all duration-200 ${activeTab === tab.key ? 'bg-[#f0f3ff] text-[#4f46e5]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-10 pr-2 custom-scrollbar">

        {/* ── ONGLET : Informations générales ── */}
        {activeTab === 'general' && (
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-[#f0f3ff] text-[#4f46e5] flex items-center justify-center flex-shrink-0"><Building2 size={18} /></div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-800">Informations générales</h3>
                <p className="text-[12px] text-slate-400">Ces informations apparaîtront sur les bulletins et documents officiels.</p>
              </div>
            </div>

            {/* Dénomination ministère */}
            <div>
              <label className={labelClass}>Dénomination du ministère de tutelle</label>
              <input name="ministry_name" value={formData.ministry_name} onChange={handleChange}
                placeholder="Ex : Ministère des Enseignements Primaire et Secondaire"
                className={fieldClass} />
            </div>

            {/* Nom + Sigle */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nom de l'établissement <span className="text-[#4f46e5]">*</span></label>
                <input name="name" value={formData.name} onChange={handleChange}
                  placeholder="Ex : Complexe Scolaire Orion" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>Sigle / Nom court</label>
                <input name="short_name" value={formData.short_name} onChange={handleChange}
                  placeholder="Ex : CSO" className={fieldClass} />
              </div>
            </div>

            {/* Numéro d'immatriculation */}
            <div>
              <label className={labelClass}>Numéro d'immatriculation / Agrément</label>
              <input name="registration_number" value={formData.registration_number} onChange={handleChange}
                placeholder="Ex : MEPS-2024-00123" className={fieldClass} />
            </div>

            {/* Slogan */}
            <div>
              <label className={labelClass}>Slogan de l'établissement</label>
              <input name="slogan" value={formData.slogan} onChange={handleChange}
                placeholder="Ex : La réussite, notre ambition" className={fieldClass} />
            </div>

            {/* Chef d'établissement */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Titre du chef d'établissement</label>
                <select name="head_title" value={formData.head_title} onChange={handleChange} className={fieldClass}>
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
              </div>
              <div>
                <label className={labelClass}>Nom du chef d'établissement</label>
                <input name="head_name" value={formData.head_name} onChange={handleChange}
                  placeholder="Ex : M. Kofi AGBENYEFIA" className={fieldClass} />
              </div>
            </div>

            {/* Contact */}
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3">Contacts</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Email de contact</label>
                  <div className="relative"><div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><Mail size={14} /></div>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="direction@ecole.tg" className={`${fieldClass} pl-9`} /></div>
                </div>
                <div>
                  <label className={labelClass}>Site Web</label>
                  <div className="relative"><div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><Globe size={14} /></div>
                    <input type="url" name="website" value={formData.website} onChange={handleChange} placeholder="https://www.ecole.tg" className={`${fieldClass} pl-9`} /></div>
                </div>
                <div>
                  <label className={labelClass}>Téléphone principal</label>
                  <div className="relative"><div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><Phone size={14} /></div>
                    <input name="phone" value={formData.phone} onChange={handleChange} placeholder="+228 90 00 00 00" className={`${fieldClass} pl-9`} /></div>
                </div>
                <div>
                  <label className={labelClass}>Téléphone secondaire</label>
                  <div className="relative"><div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><Phone size={14} /></div>
                    <input name="phone_secondary" value={formData.phone_secondary} onChange={handleChange} placeholder="+228 90 00 00 01" className={`${fieldClass} pl-9`} /></div>
                </div>
              </div>
            </div>

            {/* Localisation */}
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3">Localisation</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Adresse physique</label>
                  <div className="relative"><div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><MapPin size={14} /></div>
                    <input name="address" value={formData.address} onChange={handleChange} placeholder="Quartier, rue..." className={`${fieldClass} pl-9`} /></div>
                </div>
                <div>
                  <label className={labelClass}>Ville</label>
                  <input name="city" value={formData.city} onChange={handleChange} placeholder="Lomé" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Pays</label>
                  <div className="relative"><div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><Map size={14} /></div>
                    <input name="country" value={formData.country} onChange={handleChange} placeholder="Togo" className={`${fieldClass} pl-9`} /></div>
                </div>
              </div>
            </div>

            {/* Paramètres régionaux */}
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3">Paramètres régionaux</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Devise monétaire</label>
                  <div className="relative"><div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><Coins size={14} /></div>
                    <select name="currency" value={formData.currency} onChange={handleChange} className={`${fieldClass} pl-9 appearance-none`}>
                      <option value="XOF">Franc CFA BCEAO (XOF)</option>
                      <option value="XAF">Franc CFA CEMAC (XAF)</option>
                      <option value="EUR">Euro (€)</option>
                      <option value="USD">Dollar ($)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Fuseau horaire</label>
                  <div className="relative"><div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><Clock size={14} /></div>
                    <select name="timezone" value={formData.timezone} onChange={handleChange} className={`${fieldClass} pl-9 appearance-none`}>
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
                  </div>
                </div>
              </div>
            </div>

            <SaveBar />
          </div>
        )}

        {/* ── ONGLET : Identité visuelle ── */}
        {activeTab === 'identity' && (
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-[#fdf2f8] text-[#db2777] flex items-center justify-center flex-shrink-0"><ImageIcon size={18} /></div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-800">Identité visuelle</h3>
                <p className="text-[12px] text-slate-400">Ces éléments seront utilisés sur les bulletins, attestations et en-têtes de documents.</p>
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

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-[12px] text-amber-700">
              <strong>Formats acceptés :</strong> PNG, JPG, JPEG, SVG, WEBP. Pour un rendu optimal sur les documents, utilisez des images à fond transparent (PNG/SVG) de 300dpi minimum.
            </div>

            <SaveBar />
          </div>
        )}

        {/* ── ONGLET : Années scolaires ── */}
        {activeTab === 'years' && (
          <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm">
            <AcademicYearsManager />
          </div>
        )}
      </div>
    </div>
  );
}
