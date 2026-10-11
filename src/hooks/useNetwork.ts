import { useState, useEffect } from 'react';

export function useNetwork() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Some browsers don't fire online/offline events reliably.
    // We can use a small polling mechanism or intercept fetch errors if needed.
    // But polling every 5 seconds is robust enough.
    const interval = setInterval(() => {
      // Just check navigator.onLine as a fallback
      if (navigator.onLine !== isOnline) {
        setIsOnline(navigator.onLine);
      }
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [isOnline]);

  return isOnline;
}
