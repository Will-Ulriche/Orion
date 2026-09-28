import { useState } from 'react';
import { Building2, Save, MapPin, Phone, Mail } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export default function Settings() {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    phone: '',
    email: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      // Simuler l'appel à la commande Tauri qui enregistre dans pending_mutations
      await invoke('save_school_settings', { payload: JSON.stringify(formData) });
      setStatus({ type: 'success', msg: 'Paramètres sauvegardés localement. Ils seront synchronisés en arrière-plan.' });
    } catch (err) {
      setStatus({ type: 'error', msg: `Erreur: ${err}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-10 max-w-4xl">
      <div className="mb-10">
        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Paramètres de l'établissement</h2>
        <p className="text-slate-500 mt-2 text-sm">Configurez les informations principales de l'école (mode Offline-First).</p>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-50">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Building2 size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Informations générales</h3>
            <p className="text-sm text-slate-400">Ces informations apparaîtront sur les bulletins et documents officiels.</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Nom */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nom de l'établissement *</label>
            <input 
              type="text" 
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Ex: Complexe Scolaire Orion"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email de contact</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Mail size={16} />
                </div>
                <input 
                  type="email" 
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="direction@orion.com"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Téléphone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Téléphone principal</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Phone size={16} />
                </div>
                <input 
                  type="text" 
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+241 00 00 00 00"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Adresse */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Adresse physique</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <MapPin size={16} />
                </div>
                <input 
                  type="text" 
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Quartier, Rue..."
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Ville */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ville</label>
              <input 
                type="text" 
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Libreville"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {status && (
          <div className={`mt-6 p-4 rounded-xl text-sm ${status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
            {status.msg}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-50 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={saving || !formData.name}
            className="bg-[#3b82f6] hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {saving ? 'Enregistrement...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}
