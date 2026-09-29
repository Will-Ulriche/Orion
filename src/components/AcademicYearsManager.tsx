import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useYear, AcademicYearStatus } from '../contexts/YearContext';
import { Calendar, Plus, Play, Lock, Archive, AlertTriangle, Pencil, X, Check, Trash2, BarChart2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function AcademicYearsManager() {
  const { years, refreshYears, selectedYear } = useYear();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [isCreating, setIsCreating] = useState(false);
  const [newYear, setNewYear] = useState({ name: '', start_date: '', end_date: '' });
  
  // Edit state
  const [editingYearId, setEditingYearId] = useState<string | null>(null);
  const [editYearData, setEditYearData] = useState({ name: '', start_date: '', end_date: '' });

  const [error, setError] = useState<string | null>(null);

  // Modal configuration state
  const [configuringYear, setConfiguringYear] = useState<any>(null);

  const handleCreate = async () => {
    try {
      setError(null);
      const schoolId = 'school-1';
      
      await invoke('create_academic_year', {
        schoolId,
        name: newYear.name,
        startDate: newYear.start_date,
        endDate: newYear.end_date,
        userId: user?.id || 'system'
      });
      setIsCreating(false);
      setNewYear({ name: '', start_date: '', end_date: '' });
      await refreshYears();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      setError(null);
      const schoolId = 'school-1';
      
      await invoke('update_academic_year', {
        id,
        schoolId,
        name: editYearData.name,
        startDate: editYearData.start_date,
        endDate: editYearData.end_date
      });
      setEditingYearId(null);
      await refreshYears();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const startEditing = (year: any) => {
    setEditingYearId(year.id);
    setEditYearData({
      name: year.name || '',
      start_date: year.start_date || '',
      end_date: year.end_date || ''
    });
  };

  const handleOpen = async (id: string) => {
    try {
      setError(null);
      const schoolId = 'school-1';
      await invoke('open_academic_year', { id, schoolId });
      await refreshYears();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleClose = async (id: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir clôturer cette année ?")) return;
    try {
      setError(null);
      const schoolId = 'school-1';
      await invoke('close_academic_year', { id, schoolId });
      await refreshYears();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'année "${name}" ?\n\nToutes les classes et inscriptions de cette année seront également supprimées.`)) return;
    try {
      setError(null);
      const schoolId = 'school-1';
      await invoke('delete_academic_year', { id, schoolId });
      await refreshYears();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleArchive = async (id: string) => {
    if (!window.confirm('Archiver cette année ? Elle restera consultable mais ne pourra plus être modifiée.')) return;
    try {
      setError(null);
      const schoolId = 'school-1';
      await invoke('archive_academic_year', { id, schoolId });
      await refreshYears();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const getStatusBadge = (status: AcademicYearStatus) => {
    switch (status) {
      case 'ACTIVE':   return <span className="px-3 py-1 bg-green-100 text-green-700 text-[11px] font-bold rounded-full">Active</span>;
      case 'PLANNED':  return <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-[11px] font-bold rounded-full">Inactive</span>;
      case 'CLOSED':   return <span className="px-3 py-1 bg-red-100 text-red-700 text-[11px] font-bold rounded-full">Clôturée</span>;
      case 'ARCHIVED': return <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[11px] font-bold rounded-full">Archivée</span>;
      default: return null;
    }
  };

  const hasPlanned = years.some(y => y.status === 'PLANNED');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Années scolaires</h3>
          <p className="text-sm text-slate-500 mt-1">{years.length} année{years.length > 1 ? 's' : ''} scolaire{years.length > 1 ? 's' : ''} enregistrée{years.length > 1 ? 's' : ''}</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          disabled={hasPlanned || isCreating}
          className="bg-[#3498db] hover:bg-[#2980b9] text-white px-5 py-2.5 rounded-md font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[13px] shadow-sm"
        >
          <Plus size={16} strokeWidth={2.5} />
          Nouvelle année
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-start gap-3 text-sm">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {isCreating && (
        <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200 mb-6">
          <h4 className="font-semibold text-slate-800 mb-4 text-[14px]">Planifier une nouvelle année</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Nom (ex: 2026-2027)</label>
              <input type="text" value={newYear.name} onChange={e => setNewYear({...newYear, name: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3498db]/20 focus:border-[#3498db] outline-none text-[13px]" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Date de début</label>
              <input type="date" value={newYear.start_date} onChange={e => setNewYear({...newYear, start_date: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3498db]/20 focus:border-[#3498db] outline-none text-[13px]" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#1e293b] mb-1.5">Date de fin</label>
              <input type="date" value={newYear.end_date} onChange={e => setNewYear({...newYear, end_date: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3498db]/20 focus:border-[#3498db] outline-none text-[13px]" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-[13px] font-medium transition-colors">Annuler</button>
            <button onClick={handleCreate} disabled={!newYear.name} className="px-4 py-2 bg-[#3498db] text-white rounded-xl text-[13px] font-medium hover:bg-[#2980b9] transition-colors disabled:opacity-50">Créer</button>
          </div>
        </div>
      )}

      <div className="bg-[#fcfdfd] rounded-2xl border border-slate-100 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px] table-fixed">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[12px] font-bold text-slate-500">
                <th className="py-4 px-3 text-center w-20">Icône</th>
                <th className="py-4 px-3">Nom de l'année</th>
                <th className="py-4 px-3">Date de début</th>
                <th className="py-4 px-3">Date de fin</th>
                <th className="py-4 px-3 w-32">Statut</th>
                <th className="py-4 px-3 text-center w-48">Opérations</th>
                <th className="py-4 px-3 text-center w-36">Action</th>
              </tr>
            </thead>
            <tbody>
              {years.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500 text-sm">
                    Aucune année scolaire n'a été créée pour cet établissement.
                  </td>
                </tr>
              ) : (
                years.map(year => (
                  <tr key={year.id} className="border-b border-slate-50/50 hover:bg-[#f4f7fb] transition-colors group">
                    
                    {/* Colonne Icône */}
                    <td className="py-4 px-3 text-center">
                      <div className="w-10 h-10 rounded-full bg-[#8b5cf6] text-white flex items-center justify-center mx-auto shadow-sm shadow-purple-200">
                        <Calendar size={18} />
                      </div>
                    </td>

                    {/* Édition en ligne si sélectionné */}
                    {editingYearId === year.id ? (
                      <td colSpan={6} className="py-4 px-3 bg-[#f4f7fb]">
                        <div className="flex items-center gap-4">
                          <input type="text" placeholder="Nom" value={editYearData.name} onChange={e => setEditYearData({...editYearData, name: e.target.value})} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-[13px] w-32" />
                          <input type="date" value={editYearData.start_date} onChange={e => setEditYearData({...editYearData, start_date: e.target.value})} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-[13px]" />
                          <input type="date" value={editYearData.end_date} onChange={e => setEditYearData({...editYearData, end_date: e.target.value})} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-[13px]" />
                          
                          <div className="flex justify-end gap-2 ml-auto">
                            <button onClick={() => setEditingYearId(null)} className="flex items-center gap-1 px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg text-[12px] font-medium transition-colors bg-slate-100">
                              <X size={14} /> Annuler
                            </button>
                            <button onClick={() => handleUpdate(year.id)} disabled={!editYearData.name} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[12px] font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50">
                              <Check size={14} /> Sauver
                            </button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        {/* Colonne Nom */}
                        <td className="py-4 px-3">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-slate-800 text-[14px] truncate">{year.name}</span>
                            {selectedYear?.id === year.id && (
                              <span className="text-[10px] bg-[#f0eaff] text-[#8b5cf6] px-2.5 py-1 rounded-md font-medium whitespace-nowrap">Dashboard</span>
                            )}
                          </div>
                        </td>

                        {/* Dates */}
                        <td className="py-4 px-3 text-[13px] text-slate-600 font-medium whitespace-nowrap">
                          {year.start_date || '-'}
                        </td>
                        <td className="py-4 px-3 text-[13px] text-slate-600 font-medium whitespace-nowrap">
                          {year.end_date || '-'}
                        </td>

                        {/* Statut */}
                        <td className="py-4 px-3">
                          {getStatusBadge(year.status)}
                        </td>

                        {/* Opérations */}
                        <td className="py-4 px-3">
                          <div className="flex items-center justify-center gap-2">
                            <button className="w-8 h-8 flex-shrink-0 rounded bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center" title="Statistiques">
                              <BarChart2 size={16} color="#3b82f6" strokeWidth={2} />
                            </button>
                            <button onClick={() => startEditing(year)} className="w-8 h-8 flex-shrink-0 rounded bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center" title="Modifier">
                              <Pencil size={16} color="#eab308" strokeWidth={2} />
                            </button>
                            {year.status === 'PLANNED' ? (
                              <button onClick={() => handleOpen(year.id)} className="w-8 h-8 flex-shrink-0 rounded bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center" title="Activer">
                                <Check size={16} color="#22c55e" strokeWidth={3} />
                              </button>
                            ) : year.status === 'ACTIVE' ? (
                              <button onClick={() => handleClose(year.id)} className="w-8 h-8 flex-shrink-0 rounded bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center" title="Clôturer">
                                <Lock size={16} color="#334155" strokeWidth={2} />
                              </button>
                            ) : (
                              <button disabled className="w-8 h-8 flex-shrink-0 rounded bg-slate-50 border border-slate-100 flex items-center justify-center opacity-50 cursor-not-allowed">
                                <Check size={16} color="#94a3b8" strokeWidth={3} />
                              </button>
                            )}
                            <button 
                              onClick={() => handleDelete(year.id, year.name)} 
                              disabled={year.status === 'ACTIVE'}
                              className="w-8 h-8 flex-shrink-0 rounded bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-slate-200"
                              title={year.status === 'ACTIVE' ? "Impossible de supprimer l'année active" : "Supprimer"}
                            >
                              <Trash2 size={16} color="#ef4444" strokeWidth={2} />
                            </button>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="py-4 px-3 text-center">
                          <button 
                            onClick={() => setConfiguringYear(year)}
                            className="text-[#8b5cf6] border border-[#8b5cf6] hover:bg-[#8b5cf6] hover:text-white px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                          >
                            Configurer
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Configuration */}
      {configuringYear && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Configuration</h3>
                <p className="text-sm text-slate-500">Année scolaire {configuringYear.name}</p>
              </div>
              <button onClick={() => setConfiguringYear(null)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <h4 className="text-sm font-semibold text-slate-800 mb-2">Gestion Pédagogique</h4>
                <button 
                  onClick={() => navigate('/students')}
                  className="w-full bg-white border border-slate-200 hover:border-purple-300 hover:bg-purple-50 text-slate-700 hover:text-purple-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-between items-center"
                >
                  Gérer les élèves (Inscriptions & Migrations)
                  <span className="text-purple-500">→</span>
                </button>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <h4 className="text-sm font-semibold text-slate-800 mb-2">Cycle de vie de l'année</h4>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => { handleOpen(configuringYear.id); setConfiguringYear(null); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-white border border-green-200 text-green-700 hover:bg-green-50"
                  >
                    <Play size={16} /> Ouvrir l'année (Rendre active)
                  </button>
                  
                  <button 
                    onClick={() => { handleClose(configuringYear.id); setConfiguringYear(null); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
                  >
                    <Lock size={16} /> Clôturer l'année
                  </button>

                  <button 
                    onClick={() => { handleArchive(configuringYear.id); setConfiguringYear(null); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    <Archive size={16} /> Archiver l'année
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
