import { Sparkles, Download, X } from 'lucide-react';
import { useUpdater } from '../contexts/UpdateContext';

export default function UpdateNotificationToast() {
  const { showBanner, dismissBanner, updateInfo, openModal } = useUpdater();

  if (!showBanner || !updateInfo) return null;

  const handleOpen = () => {
    dismissBanner();
    openModal();
  };

  return (
    <div
      className="absolute bottom-6 right-6 z-50 animate-slideUpFade"
      style={{
        maxWidth: '380px',
      }}
    >
      <div
        className="rounded-2xl p-4 bg-[#1f1e27]/95 border border-blue-500/30 text-white shadow-2xl backdrop-blur-md flex items-start gap-3.5"
        style={{
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6), 0 0 25px rgba(59,130,246,0.2)',
        }}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md">
          <Sparkles size={18} className="text-white animate-pulse" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
              Mise à jour disponible
            </span>
            <button
              onClick={dismissBanner}
              className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5 cursor-pointer"
              title="Masquer"
            >
              <X size={14} />
            </button>
          </div>

          <h4 className="text-sm font-semibold text-slate-100 mt-0.5 truncate">
            Orion v{updateInfo.version}
          </h4>

          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
            {updateInfo.body || "Une nouvelle version avec améliorations et correctifs est prête à être installée."}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleOpen}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={13} />
              Télécharger
            </button>
            <button
              onClick={dismissBanner}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
