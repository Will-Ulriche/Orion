import { useState } from 'react';
import { Building2, Save, MapPin, Phone, Mail, Calendar, Check, Globe, Map, Coins, Clock } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import AcademicYearsManager from '../components/AcademicYearsManager';

export default function Settings() {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    short_name: '',
    address: '',
    city: '',
    country: 'Gabon',
    phone: '',
    phone_secondary: '',
    email: '',
    website: '',
    currency: 'XAF',
    timezone: 'Africa/Libreville'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await invoke('save_school_settings', { payload: JSON.stringify(formData) });
      setStatus({ type: 'success', msg: 'Paramètres sauvegardés localement.' });
    } catch (err) {
      setStatus({ type: 'error', msg: `Erreur: ${err}` });
    } finally {
      setSaving(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'general' | 'years'>('general');

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full flex flex-col bg-[#f8f9fc]">
      <div className="mb-4 flex-shrink-0">
        <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight">Paramètres</h2>
        <p className="text-slate-500 mt-0.5 text-[13px]">Configurez les informations et le cycle de vie de l'école.</p>
      </div>

      <div className="flex bg-white border border-slate-200/70 p-1 rounded-xl w-fit mb-4 flex-shrink-0">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-[13px] transition-all duration-300 ${activeTab === 'general' ? 'bg-[#f0f3ff] text-[#4f46e5]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
        >
          <Building2 size={14} strokeWidth={2.5} />
          Informations générales
        </button>
        <button
          onClick={() => setActiveTab('years')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-[13px] transition-all duration-300 ${activeTab === 'years' ? 'bg-[#f0f3ff] text-[#4f46e5]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
        >
          <Calendar size={14} strokeWidth={2.5} />
          Années scolaires
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-10 pr-2 custom-scrollbar">
        {activeTab === 'general' ? (
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] w-full">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-[#f0f3ff] text-[#4f46e5] flex items-center justify-center flex-shrink-0">
                <Building2 size={18} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-800 tracking-tight">Informations générales</h3>
                <p className="text-[12px] text-slate-400">Ces informations apparaîtront sur les bulletins et documents officiels.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Nom */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">
                    Nom de l'établissement <span className="text-[#4f46e5]">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Ex : Complexe Scolaire Orion"
                    className="w-full px-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700"
                  />
                </div>
                {/* Sigle */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Sigle / Nom court</label>
                  <input
                    type="text"
                    name="short_name"
                    value={formData.short_name}
                    onChange={handleChange}
                    placeholder="Ex : CSO"
                    className="w-full px-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Email */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Email de contact</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail size={15} strokeWidth={1.5} />
                    </div>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="direction@orion.com"
                      className="w-full pl-9 pr-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700"
                    />
                  </div>
                </div>

                {/* Site Web */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Site Web</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Globe size={15} strokeWidth={1.5} />
                    </div>
                    <input
                      type="url"
                      name="website"
                      value={formData.website}
                      onChange={handleChange}
                      placeholder="https://www.orion.com"
                      className="w-full pl-9 pr-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Téléphone */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Téléphone principal</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Phone size={15} strokeWidth={1.5} />
                    </div>
                    <input
                      type="text"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+241 00 00 00 00"
                      className="w-full pl-9 pr-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700"
                    />
                  </div>
                </div>

                {/* Téléphone secondaire */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Téléphone secondaire</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Phone size={15} strokeWidth={1.5} />
                    </div>
                    <input
                      type="text"
                      name="phone_secondary"
                      value={formData.phone_secondary}
                      onChange={handleChange}
                      placeholder="+241 00 00 00 01"
                      className="w-full pl-9 pr-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Adresse */}
                <div>
                  <label className="flex items-center gap-2 text-[12px] font-semibold text-[#1e293b] mb-1.5">
                    Adresse physique
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <MapPin size={15} strokeWidth={1.5} />
                    </div>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="Quartier, rue..."
                      className="w-full pl-9 pr-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700"
                    />
                  </div>
                </div>

                {/* Ville */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Ville</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Building2 size={15} strokeWidth={1.5} />
                    </div>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      placeholder="Libreville"
                      className="w-full pl-9 pr-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700"
                    />
                  </div>
                </div>

                {/* Pays */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Pays</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Map size={15} strokeWidth={1.5} />
                    </div>
                    <input
                      type="text"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      placeholder="Gabon"
                      className="w-full pl-9 pr-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] placeholder:text-slate-400 text-slate-700"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Devise */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Devise monétaire</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Coins size={15} strokeWidth={1.5} />
                    </div>
                    <select
                      name="currency"
                      value={formData.currency}
                      onChange={handleChange as any}
                      className="w-full pl-9 pr-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] text-slate-700 appearance-none"
                    >
                      <option value="XAF">Franc CFA (XAF)</option>
                      <option value="EUR">Euro (€)</option>
                      <option value="USD">Dollar ($)</option>
                    </select>
                  </div>
                </div>

                {/* Fuseau horaire */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Fuseau horaire</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Clock size={15} strokeWidth={1.5} />
                    </div>
                    <select
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleChange as any}
                      className="w-full pl-9 pr-4 py-2.5 bg-[#f8fafc] border border-slate-200/60 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] outline-none transition-all text-[13.5px] text-slate-700 appearance-none"
                    >
                      <option value="Africa/Libreville">Libreville (WAT)</option>
                      <option value="Africa/Douala">Douala (WAT)</option>
                      <option value="Europe/Paris">Paris (CET/CEST)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-400 text-[12px]">
                <Check size={13} className="text-green-500" />
                Enregistrement automatique désactivé
              </div>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name}
                className="bg-[#3c38cf] hover:bg-[#3431b3] text-white px-5 py-2 rounded-xl text-[13px] font-medium flex items-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_0_rgb(60,56,207,0.39)]"
              >
                <Save size={15} />
                {saving ? 'Enregistrement...' : 'Sauvegarder'}
              </button>
            </div>

            {status && (
              <div className={`mt-4 p-4 rounded-xl text-sm ${status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {status.msg}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] w-full">
            <AcademicYearsManager />
          </div>
        )}
      </div>
    </div>
  );
}
