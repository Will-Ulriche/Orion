import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
}

interface UpdateContextType {
  status: UpdateStatus;
  currentVersion: string;
  updateInfo: UpdateInfo | null;
  progress: DownloadProgress;
  errorMessage: string | null;
  lastChecked: Date | null;
  isModalOpen: boolean;
  showBanner: boolean;
  autoCheck: boolean;
  isTauri: boolean;
  checkForUpdates: (silent?: boolean) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  dismissBanner: () => void;
  setAutoCheck: (enabled: boolean) => void;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

const AUTO_CHECK_KEY = 'orion_auto_check_updates';

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [currentVersion, setCurrentVersion] = useState<string>('0.1.0');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress>({ downloaded: 0, total: 0, percent: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [autoCheck, setAutoCheckState] = useState<boolean>(() => {
    const saved = localStorage.getItem(AUTO_CHECK_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const updateRef = useRef<Update | null>(null);

  const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  // Récupérer la version réelle de l'app via l'API Tauri
  useEffect(() => {
    if (isTauri) {
      getVersion()
        .then((ver) => {
          if (ver) setCurrentVersion(ver);
        })
        .catch((err) => {
          console.warn('Impossible de lire la version de l\'application:', err);
        });
    }
  }, [isTauri]);

  const setAutoCheck = (enabled: boolean) => {
    setAutoCheckState(enabled);
    localStorage.setItem(AUTO_CHECK_KEY, enabled ? 'true' : 'false');
  };

  const checkForUpdates = useCallback(
    async (silent: boolean = false) => {
      if (!isTauri) {
        if (!silent) {
          setErrorMessage("Les mises à jour directes sont uniquement actives dans l'application bureau Orion.");
          setStatus('error');
          setIsModalOpen(true);
        }
        return;
      }

      setStatus('checking');
      setErrorMessage(null);

      try {
        const update = await check();
        setLastChecked(new Date());

        if (update) {
          updateRef.current = update;
          const info: UpdateInfo = {
            version: update.version,
            currentVersion: update.currentVersion || currentVersion,
            date: update.date,
            body: update.body,
          };
          setUpdateInfo(info);
          setStatus('available');

          if (silent) {
            setShowBanner(true);
          } else {
            setIsModalOpen(true);
          }
        } else {
          updateRef.current = null;
          setUpdateInfo(null);
          setStatus('up-to-date');

          if (!silent) {
            setIsModalOpen(true);
          }
        }
      } catch (err: any) {
        console.error('Erreur lors de la vérification de mise à jour:', err);
        updateRef.current = null;
        setStatus('error');

        const rawMsg = err?.message || String(err || '');
        let friendly = "Impossible de vérifier les mises à jour.";

        if (!navigator.onLine || rawMsg.toLowerCase().includes('network') || rawMsg.toLowerCase().includes('failed to fetch')) {
          friendly = "Vous êtes actuellement hors ligne ou le réseau est indisponible.";
        } else if (rawMsg.includes('404') || rawMsg.toLowerCase().includes('release')) {
          friendly = "Votre application est à jour : aucune nouvelle version n'est disponible sur le serveur.";
        } else if (rawMsg) {
          friendly = `Vérification échouée : ${rawMsg}`;
        }

        setErrorMessage(friendly);

        if (!silent) {
          setIsModalOpen(true);
        }
      }
    },
    [isTauri, currentVersion]
  );

  const downloadAndInstall = useCallback(async () => {
    if (!updateRef.current) {
      setErrorMessage("Aucune mise à jour n'est prête à être téléchargée.");
      setStatus('error');
      return;
    }

    setStatus('downloading');
    setErrorMessage(null);
    setProgress({ downloaded: 0, total: 0, percent: 0 });

    let totalLength = 0;
    let downloadedBytes = 0;

    try {
      await updateRef.current.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          totalLength = event.data.contentLength ?? 0;
          setProgress({
            downloaded: 0,
            total: totalLength,
            percent: 0,
          });
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          const percent = totalLength > 0 ? Math.min(100, Math.round((downloadedBytes / totalLength) * 100)) : 0;
          setProgress({
            downloaded: downloadedBytes,
            total: totalLength,
            percent,
          });
        } else if (event.event === 'Finished') {
          setProgress({
            downloaded: totalLength || downloadedBytes,
            total: totalLength || downloadedBytes,
            percent: 100,
          });
        }
      });

      setStatus('downloaded');
    } catch (err: any) {
      console.error('Erreur lors du téléchargement/installation de la mise à jour:', err);
      setStatus('error');
      setErrorMessage(`Erreur de téléchargement : ${err?.message || String(err || 'Échec du transfert')}`);
    }
  }, []);

  const restartApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error('Erreur lors du redémarrage de l\'application:', err);
      setErrorMessage("Impossible de relancer automatiquement Orion. Veuillez fermer et rouvrir l'application manuellement.");
    }
  }, []);

  // Vérification automatique au démarrage (silencieuse)
  useEffect(() => {
    if (autoCheck && isTauri) {
      const timer = setTimeout(() => {
        checkForUpdates(true).catch(() => {});
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [autoCheck, isTauri, checkForUpdates]);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);
  const dismissBanner = () => setShowBanner(false);

  return (
    <UpdateContext.Provider
      value={{
        status,
        currentVersion,
        updateInfo,
        progress,
        errorMessage,
        lastChecked,
        isModalOpen,
        showBanner,
        autoCheck,
        isTauri,
        checkForUpdates,
        downloadAndInstall,
        restartApp,
        openModal,
        closeModal,
        dismissBanner,
        setAutoCheck,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdater() {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdater must be used within an UpdateProvider');
  }
  return context;
}
