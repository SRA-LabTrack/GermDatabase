import { useEffect, useState } from 'react';

function standaloneMode() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator?.standalone === true
  );
}

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => standaloneMode());

  useEffect(() => {
    if (typeof window === 'undefined' || window.germDesktop) return undefined;

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstalled(false);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setInstalled(true);
    };
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const syncInstalled = () => setInstalled(standaloneMode());

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (displayMode?.addEventListener) displayMode.addEventListener('change', syncInstalled);
    else displayMode?.addListener?.(syncInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (displayMode?.removeEventListener) displayMode.removeEventListener('change', syncInstalled);
      else displayMode?.removeListener?.(syncInstalled);
    };
  }, []);

  async function installApp() {
    if (window.germDesktop || installed) return { status: 'installed' };
    if (!installPrompt) return { status: 'unavailable' };

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      const status = choice?.outcome || 'dismissed';
      if (status === 'accepted') setInstallPrompt(null);
      return { status };
    } catch (error) {
      return { status: 'error', error };
    }
  }

  return {
    installed,
    canInstall: Boolean(installPrompt) && !installed,
    installApp
  };
}
