import { Sparkles, Download, X, BookOpen, ArrowRight } from 'lucide-react';
import { useUpdater } from '../contexts/UpdateContext';

export default function UpdateNotificationToast() {
  const {
    showBanner,
    dismissBanner,
    currentVersion,
    updateInfo,
    openModal,
    downloadAndInstall,
  } = useUpdater();

  if (!showBanner || !updateInfo) return null;

  return (
    <div
      className="absolute bottom-6 right-6 z-50 animate-slide-in"
      style={{ maxWidth: '420px' }}
    >
      <div
        className="rounded-2xl p-4 bg-[#1f1e27]/95 border border-blue-500/30 text-white shadow-2xl backdrop-blur-md"
        style={{
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6), 0 0 25px rgba(59,130,246,0.2)',
        }}
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md">
            <Sparkles size={18} className="text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold text-blue-300 uppercase tracking-wider bg-blue-500/15 border border-blue-500/30 rounded-md px-2 py-0.5">
                Nouvelle version disponible
              </span>
              <button
                onClick={() => void dismissBanner()}
                className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5 cursor-pointer"
                title="Masquer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
              <span className="font-mono">v{currentVersion}</span>
              <ArrowRight size={13} className="text-blue-400" />
              <span className="font-bold text-emerald-300">v{updateInfo.version}</span>
            </div>

            <div className="mt-2 text-[11.5px] text-slate-400 leading-relaxed whitespace-pre-wrap max-h-20 overflow-y-auto custom-scrollbar">
              {updateInfo.body || "Améliorations des performances, corrections de stabilité et nouvelles fonctionnalités d'Orion."}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => void downloadAndInstall(true)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={13} />
                Installer maintenant
              </button>
              <button
                onClick={openModal}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <BookOpen size={13} />
                Voir les nouveautés
              </button>
              <button
                onClick={() => void dismissBanner()}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Plus tard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
