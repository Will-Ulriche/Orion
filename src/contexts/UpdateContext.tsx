import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import {
  STARTUP_CHECK_DELAY_MS,
  PERIODIC_CHECK_INTERVAL_MS,
  buildDownloadProgress,
  canInstallUpdate,
  formatUpdateError,
  shouldNotifyVersion,
  withHandledVersion,
  type UpdateFlowStatus,
} from '../lib/updateFlow';

export type UpdateStatus = UpdateFlowStatus;

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
  downloadAndInstall: (userConfirmed: boolean) => Promise<void>;
  restartApp: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  dismissBanner: () => Promise<void>;
  setAutoCheck: (enabled: boolean) => void;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

const AUTO_CHECK_KEY = 'orion_auto_check_updates';
const EMPTY_PROGRESS: DownloadProgress = { downloaded: 0, total: 0, percent: 0 };

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [currentVersion, setCurrentVersion] = useState<string>('0.1.0');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress>(EMPTY_PROGRESS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [autoCheck, setAutoCheckState] = useState<boolean>(() => {
    const saved = localStorage.getItem(AUTO_CHECK_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const updateRef = useRef<Update | null>(null);
  const handledVersionsRef = useRef<Set<string>>(new Set());
  const checkingRef = useRef(false);
  const installingRef = useRef(false);
  const mountedRef = useRef(false);

  const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  const releaseUpdate = useCallback(async () => {
    const update = updateRef.current;
    updateRef.current = null;
    if (!update) return;
    try {
      await update.close();
    } catch (err) {
      console.warn('Impossible de libérer la ressource de mise à jour:', err);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void releaseUpdate();
    };
  }, [releaseUpdate]);

  useEffect(() => {
    if (isTauri) {
      getVersion()
        .then((ver) => {
          if (ver && mountedRef.current) setCurrentVersion(ver);
        })
        .catch((err) => {
          console.warn('Impossible de lire la version de l\'application:', err);
        });
    }
  }, [isTauri]);

  const setAutoCheck = useCallback((enabled: boolean) => {
    setAutoCheckState(enabled);
    localStorage.setItem(AUTO_CHECK_KEY, enabled ? 'true' : 'false');
  }, []);

  const markHandled = useCallback((version: string) => {
    handledVersionsRef.current = withHandledVersion(handledVersionsRef.current, version);
  }, []);

  const toUpdateInfo = useCallback(
    (update: Update): UpdateInfo => ({
      version: update.version,
      currentVersion: update.currentVersion || currentVersion,
      date: update.date,
      body: update.body,
    }),
    [currentVersion],
  );

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
      if (checkingRef.current || installingRef.current) return;

      checkingRef.current = true;
      setStatus('checking');
      setErrorMessage(null);

      try {
        const update = await check();
        if (!mountedRef.current) {
          await update?.close();
          return;
        }
        await releaseUpdate();
        setLastChecked(new Date());

        if (!update) {
          setUpdateInfo(null);
          setStatus('up-to-date');
          setShowBanner(false);
          if (!silent) setIsModalOpen(true);
          return;
        }

        const info = toUpdateInfo(update);
        updateRef.current = update;
        setUpdateInfo(info);
        setStatus('available');

        if (shouldNotifyVersion(handledVersionsRef.current, info.version, silent)) {
          markHandled(info.version);
          setShowBanner(true);
        } else if (!silent) {
          markHandled(info.version);
          setShowBanner(false);
          setIsModalOpen(true);
        }
      } catch (err) {
        console.error('Erreur lors de la vérification de mise à jour:', err);
        await releaseUpdate();
        if (!mountedRef.current) return;
        setUpdateInfo(null);
        setStatus('error');
        setErrorMessage(formatUpdateError(err, navigator.onLine));
        setShowBanner(false);
        if (!silent) setIsModalOpen(true);
      } finally {
        checkingRef.current = false;
      }
    },
    [isTauri, releaseUpdate, toUpdateInfo, markHandled],
  );

  const acquireUpdateForInstall = useCallback(async (): Promise<Update | null> => {
    if (updateRef.current) return updateRef.current;

    const update = await check();
    if (!mountedRef.current) {
      await update?.close();
      return null;
    }
    if (!update) {
      setUpdateInfo(null);
      setStatus('up-to-date');
      setShowBanner(false);
      return null;
    }

    const expectedVersion = updateInfo?.version;
    if (expectedVersion && update.version !== expectedVersion) {
      setUpdateInfo(toUpdateInfo(update));
      setStatus('available');
      setErrorMessage("Une version plus récente est disponible. Vérifiez les informations puis confirmez à nouveau.");
      await update.close();
      return null;
    }

    updateRef.current = update;
    setUpdateInfo(toUpdateInfo(update));
    return update;
  }, [toUpdateInfo, updateInfo?.version]);

  const downloadAndInstall = useCallback(
    async (userConfirmed: boolean) => {
      if (!userConfirmed || !isTauri || installingRef.current) return;
      const hasResource = Boolean(updateRef.current) || Boolean(updateInfo);
      if (!canInstallUpdate(status, hasResource, userConfirmed)) return;

      installingRef.current = true;
      setShowBanner(false);
      setIsModalOpen(true);
      setErrorMessage(null);
      setProgress(EMPTY_PROGRESS);
      setStatus('checking');

      try {
        const update = await acquireUpdateForInstall();
        if (!update || !mountedRef.current) return;

        setStatus('downloading');
        let totalLength = 0;
        let downloadedBytes = 0;

        await update.downloadAndInstall((event: DownloadEvent) => {
          if (event.event === 'Started') {
            totalLength = event.data.contentLength ?? 0;
            setProgress(buildDownloadProgress(0, totalLength));
          } else if (event.event === 'Progress') {
            downloadedBytes += event.data.chunkLength;
            setProgress(buildDownloadProgress(downloadedBytes, totalLength));
          } else if (event.event === 'Finished') {
            setProgress(buildDownloadProgress(totalLength || downloadedBytes, totalLength || downloadedBytes));
          }
        });

        setProgress(buildDownloadProgress(totalLength || downloadedBytes, totalLength || downloadedBytes));
        setStatus('downloaded');
      } catch (err) {
        console.error('Erreur lors du téléchargement/installation de la mise à jour:', err);
        setStatus('error');
        setErrorMessage(`Erreur de téléchargement : ${err instanceof Error ? err.message : String(err || 'Échec du transfert')}`);
      } finally {
        installingRef.current = false;
      }
    },
    [isTauri, status, updateInfo, acquireUpdateForInstall],
  );

  const restartApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error('Erreur lors du redémarrage de l\'application:', err);
      setErrorMessage("Impossible de relancer automatiquement Orion. Veuillez fermer et rouvrir l'application manuellement.");
    }
  }, []);

  useEffect(() => {
    if (!autoCheck || !isTauri) return;
    const startupTimer = setTimeout(() => {
      void checkForUpdates(true);
    }, STARTUP_CHECK_DELAY_MS);
    const intervalTimer = setInterval(() => {
      void checkForUpdates(true);
    }, PERIODIC_CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(startupTimer);
      clearInterval(intervalTimer);
    };
  }, [autoCheck, isTauri, checkForUpdates]);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    void releaseUpdate();
  }, [releaseUpdate]);
  const dismissBanner = useCallback(async () => {
    setShowBanner(false);
    await releaseUpdate();
  }, [releaseUpdate]);

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
