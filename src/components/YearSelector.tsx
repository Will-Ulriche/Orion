import { useYear, AcademicYearStatus } from '../contexts/YearContext';
import { CalendarDays, ChevronDown } from 'lucide-react';

export default function YearSelector({ collapsed }: { collapsed: boolean }) {
  const { years, selectedYear, setSelectedYear, isLoading } = useYear();

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 px-6 py-2 border-b border-[#44434c] ${collapsed ? 'justify-center px-0' : ''}`}>
        <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-slate-200 animate-spin"></div>
        {!collapsed && <span className="text-sm text-slate-500">Chargement...</span>}
      </div>
    );
  }

  const getStatusColor = (status: AcademicYearStatus) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500';
      case 'PLANNED': return 'bg-yellow-500';
      case 'CLOSED': return 'bg-red-500';
      case 'ARCHIVED': return 'bg-slate-500';
      default: return 'bg-slate-500';
    }
  };

  const getStatusLabel = (status: AcademicYearStatus) => {
    switch (status) {
      case 'ACTIVE': return 'ACTIVE';
      case 'PLANNED': return 'PRÉVUE';
      case 'CLOSED': return 'CLÔTURÉE';
      case 'ARCHIVED': return 'ARCHIVÉE';
      default: return status;
    }
  };

  if (!selectedYear) {
    return (
      <div className={`flex items-center gap-2 px-6 py-2 border-b border-[#44434c] ${collapsed ? 'justify-center px-0' : ''}`}>
        <CalendarDays size={18} className="text-slate-500" />
        {!collapsed && <span className="text-sm text-slate-500">Aucune année</span>}
      </div>
    );
  }

  return (
    <div className={`relative px-6 py-2 border-b border-[#44434c] ${collapsed ? 'flex justify-center px-0' : ''}`}>
      <div className="group relative">
        <button className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-[#383742] transition-colors text-left">
          <div className="relative flex-shrink-0">
            <CalendarDays size={18} className="text-slate-300" />
            <div className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#2b2a33] ${getStatusColor(selectedYear.status)}`} />
          </div>
          
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{selectedYear.name}</p>
              <p className="text-[10px] font-bold text-slate-500 tracking-wider mt-0.5">
                {getStatusLabel(selectedYear.status)}
              </p>
            </div>
          )}
          
          {!collapsed && <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />}
        </button>

        {/* Dropdown Menu (Hover based for simplicity, in real app use click/headless UI) */}
        <div className="absolute left-0 top-full mt-2 w-56 bg-[#383742] rounded-xl shadow-xl border border-[#44434c] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
          {years.map(year => (
            <button
              key={year.id}
              onClick={() => setSelectedYear(year)}
              className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-[#4a4955] transition-colors ${selectedYear.id === year.id ? 'bg-[#4a4955]' : ''}`}
            >
              <div>
                <p className={`text-sm font-medium ${selectedYear.id === year.id ? 'text-white' : 'text-slate-300'}`}>
                  {year.name}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {getStatusLabel(year.status)}
                </p>
              </div>
              <div className={`w-2 h-2 rounded-full ${getStatusColor(year.status)}`} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
