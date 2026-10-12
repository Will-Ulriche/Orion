import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, Calendar, ArrowDownUp } from 'lucide-react';
import Appareils from './Appareils';
import Licences from './Licences';

export default function Security() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: 'appareils' | 'licence' =
    searchParams.get('tab') === 'licence' ? 'licence' : 'appareils';

  const setActiveTab = (key: 'appareils' | 'licence') => {
    setSearchParams(key === 'licence' ? { tab: 'licence' } : {}, { replace: true });
  };

  const TABS = [
    { key: 'appareils', label: 'Appareils', icon: <Calendar size={16} /> },
    { key: 'licence', label: 'Licence', icon: <ArrowDownUp size={16} /> },
  ] as const;

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full flex flex-col bg-[#f8f9fc]">
      <div className="mb-6 flex-shrink-0">
        <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight flex items-center gap-2">
          <ShieldCheck size={28} className="text-indigo-500" />
          Sécurité et Accès
        </h2>
        <p className="text-slate-500 mt-1 text-[13px]">
          Gérez les appareils autorisés et votre licence d'utilisation.
        </p>
      </div>

      <div className="flex bg-white border border-slate-200/70 p-1 rounded-xl w-fit mb-6 flex-shrink-0 gap-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[13.5px] transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-[#f0f3ff] text-[#4f46e5] shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-8 min-h-full">
          {activeTab === 'appareils' && <Appareils />}
          {activeTab === 'licence' && <Licences />}
        </div>
      </div>
    </div>
  );
}
