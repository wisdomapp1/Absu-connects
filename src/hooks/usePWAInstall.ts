import { useEffect, useState } from 'react';
import { safeStorage } from '../utils/safeStorage.ts';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSAL_KEY = 'absu_pwa_install_dismissed_until';
const COOLDOWN_DAYS = 7;

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showPromptDelayed, setShowPromptDelayed] = useState(false);

  useEffect(() => {
    // 1. Detect standalone mode (already installed or running as PWA)
    const isStandalone =
      (typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true));
    setIsInstalled(isStandalone);

    // 2. Detect iOS devices
    const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // 3. Check dismissal cooldown
    const dismissedUntil = safeStorage.getItem(DISMISSAL_KEY);
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
      setIsDismissed(true);
    }

    // 4. Capture browser's native beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // 5. Five-second graceful delay before showing the branded banner
    const timer = setTimeout(() => {
      setShowPromptDelayed(true);
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[PWA] Error during prompt:', err);
      return false;
    }
  };

  const dismiss = () => {
    setIsDismissed(true);
    const cooldownExpiry = Date.now() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    safeStorage.setItem(DISMISSAL_KEY, String(cooldownExpiry));
  };

  const shouldShowCard =
    showPromptDelayed &&
    !isInstalled &&
    !isDismissed &&
    (Boolean(deferredPrompt) || isIOS);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    shouldShowCard,
    install,
    dismiss,
  };
}
