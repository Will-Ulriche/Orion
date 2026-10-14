import {
  X, Download, RefreshCw, CheckCircle2, AlertTriangle, Sparkles,
  ArrowRight, ShieldCheck, HardDriveDownload, Rocket
} from 'lucide-react';
import { useUpdater } from '../contexts/UpdateContext';
import orionLogo from '../assets/orion_logo.png';

export default function UpdateModal() {
  const {
    status,
    currentVersion,
    updateInfo,
    progress,
    errorMessage,
    lastChecked,
    isModalOpen,
    closeModal,
    checkForUpdates,
    downloadAndInstall,
    restartApp,
  } = useUpdater();

  if (!isModalOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Mo';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} Mo`;
  };

  const isDownloading = status === 'downloading';

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/50 backdrop-blur-xs animate-fadeIn rounded-2xl"
      onClick={() => {
        if (!isDownloading) closeModal();
      }}
    >
      <div
        className="w-full max-w-lg bg-[#1f1e27] text-slate-100 rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col relative animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(59, 130, 246, 0.1)',
        }}
      >
        {/* Barre d'en-tête décorative */}
        <div className="relative px-6 pt-6 pb-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 p-1.5 flex items-center justify-center shadow-inner">
              <img src={orionLogo} alt="Orion" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white tracking-wide">Mise à jour d'Orion</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  OTA
                </span>
              </div>
              <p className="text-[12px] text-slate-400">Centre de mise à niveau directe</p>
            </div>
          </div>

          {!isDownloading && (
            <button
              onClick={closeModal}
              className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Fermer"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Corps principal selon le statut */}
        <div className="p-6 flex-1 overflow-y-auto max-h-[70vh] space-y-5">
          {/* 1. ÉTAT : RECHERCHE EN COURS */}
          {status === 'checking' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-3xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 animate-pulse">
                  <RefreshCw size={28} className="animate-spin" />
                </div>
              </div>
              <div>
                <h4 className="text-base font-medium text-slate-200">Recherche de mises à jour...</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Connexion au serveur de mise à jour pour vérifier la disponibilité d'une nouvelle version d'Orion.
                </p>
              </div>
            </div>
          )}

          {/* 2. ÉTAT : MISE À JOUR DISPONIBLE */}
          {status === 'available' && updateInfo && (
            <div className="space-y-4">
              {/* Bannière de comparaison des versions */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border border-blue-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider block">
                    Version actuelle
                  </span>
                  <span className="text-sm font-medium text-slate-300">v{currentVersion}</span>
                </div>

                <div className="flex items-center gap-2 text-blue-400">
                  <ArrowRight size={18} />
                </div>

                <div className="text-right">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                    <Sparkles size={11} /> Nouvelle version
                  </span>
                  <div className="text-base font-bold text-white flex items-center gap-1.5 justify-end">
                    <span>v{updateInfo.version}</span>
                  </div>
                </div>
              </div>

              {/* Date de release si fournie */}
              {updateInfo.date && (
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span>Publiée le :</span>
                  <span className="font-medium text-slate-300">
                    {new Date(updateInfo.date).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              )}

              {/* Notes de version / Changelog */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                  Notes de version & Nouveautés
                </label>
                <div className="p-3.5 bg-black/30 rounded-xl border border-white/5 text-xs text-slate-300 leading-relaxed font-sans max-h-44 overflow-y-auto whitespace-pre-wrap selection:bg-blue-500/30">
                  {updateInfo.body ? (
                    updateInfo.body
                  ) : (
                    <span className="italic text-slate-500">
                      Améliorations des performances, corrections de stabilité et nouvelles fonctionnalités d'Orion.
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-2.5 text-xs text-blue-300">
                <ShieldCheck size={16} className="flex-shrink-0 mt-0.5 text-blue-400" />
                <p>
                  Le téléchargement est sécurisé et signé numériquement. L'installation sera prête immédiatement après le téléchargement.
                </p>
              </div>
            </div>
          )}

          {/* 3. ÉTAT : TÉLÉCHARGEMENT EN COURS */}
          {status === 'downloading' && (
            <div className="py-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 animate-bounce">
                    <HardDriveDownload size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Téléchargement en cours...</h4>
                    <p className="text-xs text-slate-400">
                      Orion v{updateInfo?.version || ''} en cours de récupération
                    </p>
                  </div>
                </div>
                <div className="text-xl font-bold text-blue-400">{progress.percent}%</div>
              </div>

              {/* Barre de progression */}
              <div className="w-full bg-black/40 rounded-full h-3 p-0.5 overflow-hidden border border-white/10">
                <div
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-200 relative overflow-hidden"
                  style={{ width: `${Math.max(4, progress.percent)}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>

              {/* Détails du transfert */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Transféré :</span>
                <span className="font-mono text-slate-200">
                  {formatBytes(progress.downloaded)}
                  {progress.total > 0 && ` / ${formatBytes(progress.total)}`}
                </span>
              </div>

              <p className="text-[11.5px] text-center text-slate-400 italic">
                Veuillez patienter pendant le téléchargement et la vérification des paquets...
              </p>
            </div>
          )}

          {/* 4. ÉTAT : TÉLÉCHARGÉ & PRÊT À INSTALLER */}
          {status === 'downloaded' && (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Mise à jour prête !</h4>
                <p className="text-xs text-slate-300 mt-1 max-w-sm">
                  Le paquet d'installation pour la version <strong className="text-emerald-400">v{updateInfo?.version}</strong> a été téléchargé et validé avec succès.
                </p>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-slate-400 text-left w-full">
                💡 Cliquez sur <strong>Redémarrer Orion</strong> pour appliquer la mise à jour maintenant. L'application redémarrera sur la nouvelle version sans perte de vos données.
              </div>
            </div>
          )}

          {/* 5. ÉTAT : APPLICATION DÉJÀ À JOUR */}
          {status === 'up-to-date' && (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Votre application est à jour</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Vous disposez déjà de la version la plus récente d'Orion (<strong className="text-slate-200">v{currentVersion}</strong>).
                </p>
              </div>
              {lastChecked && (
                <p className="text-[11px] text-slate-500">
                  Dernière vérification : {lastChecked.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          )}

          {/* 6. ÉTAT : ERREUR */}
          {status === 'error' && (
            <div className="py-4 space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-amber-200">Vérification impossible</h4>
                  <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                    {errorMessage || "Une erreur inattendue est survenue lors de la communication avec le serveur de release."}
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-black/20 rounded-xl border border-white/5 text-xs text-slate-400 space-y-2">
                <p className="font-medium text-slate-300">Que faire ?</p>
                <ul className="list-disc list-inside space-y-1 text-[11.5px]">
                  <li>Vérifiez votre connexion Internet locale.</li>
                  <li>Si aucune nouvelle version n'est disponible sur le serveur, votre application est déjà à jour.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Barre d'actions en bas */}
        <div className="p-4 px-6 border-t border-white/5 bg-black/20 flex items-center justify-end gap-3">
          {/* Actions principales à droite */}
          <div className="flex items-center gap-2">
            {/* Si statut checking : désactivé */}
            {status === 'checking' && (
              <button
                disabled
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 text-slate-400 cursor-not-allowed flex items-center gap-2"
              >
                <RefreshCw size={13} className="animate-spin" />
                Vérification...
              </button>
            )}

            {/* Si statut available : bouton de téléchargement */}
            {status === 'available' && (
              <>
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Plus tard
                </button>
                <button
                  onClick={downloadAndInstall}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Download size={15} />
                  Télécharger et installer
                </button>
              </>
            )}

            {/* Si téléchargement en cours */}
            {status === 'downloading' && (
              <button
                disabled
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600/50 cursor-not-allowed flex items-center gap-2"
              >
                <RefreshCw size={14} className="animate-spin" />
                Téléchargement ({progress.percent}%)
              </button>
            )}

            {/* Si téléchargé avec succès */}
            {status === 'downloaded' && (
              <button
                onClick={restartApp}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Rocket size={15} />
                Redémarrer Orion maintenant
              </button>
            )}

            {/* Si déjà à jour ou erreur */}
            {(status === 'up-to-date' || status === 'error' || status === 'idle') && (
              <>
                <button
                  onClick={() => checkForUpdates(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={13} />
                  Rechercher à nouveau
                </button>
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer"
                >
                  Fermer
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
