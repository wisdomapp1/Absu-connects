import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall.ts';
import { Download, X, Share, PlusSquare, Sparkles } from 'lucide-react';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, shouldShowCard, install, dismiss } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  if (isInstalled || !shouldShowCard) {
    return null;
  }

  const handleAction = async () => {
    if (isInstallable) {
      setIsInstalling(true);
      try {
        await install();
      } finally {
        setIsInstalling(false);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  };

  return (
    <>
      <div className="fixed bottom-20 md:bottom-6 right-3 sm:right-6 z-40 max-w-sm w-[calc(100%-24px)] sm:w-auto bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3.5 sm:p-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300 transition-colors backdrop-blur-md">
        <div className="flex items-start gap-3">
          {/* App Icon */}
          <img
            src="/pwa-192x192.png"
            alt="ABSU Connect"
            className="w-11 h-11 rounded-xl shadow-md shrink-0 border border-violet-500/30"
          />

          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-1.5">
              <h4 className="font-extrabold text-xs sm:text-sm text-[var(--color-text-primary)] truncate">
                Install ABSU Connect
              </h4>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] shrink-0">
                Fast App
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 leading-snug">
              Install on your home screen for quick access, offline reading, and campus push alerts.
            </p>

            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={handleAction}
                disabled={isInstalling}
                className="px-3.5 py-1.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isIOS ? 'How to Install' : isInstalling ? 'Installing...' : 'Install App'}</span>
              </button>

              <button
                type="button"
                onClick={dismiss}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
              >
                Not now
              </button>
            </div>
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={dismiss}
            className="p-1 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
            aria-label="Dismiss install card"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iOS Instructions Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl max-w-sm w-full p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <img src="/pwa-192x192.png" alt="ABSU Connect" className="w-7 h-7 rounded-lg" />
                <h3 className="font-bold text-sm text-[var(--color-text-primary)]">
                  Install on iPhone / iPad
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 mt-3 text-xs text-[var(--color-text-secondary)]">
              <p>Follow these quick steps in Safari to add ABSU Connect to your Home Screen:</p>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                  <Share className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-[var(--color-text-primary)]">1. Tap the Share button</p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">Located in the bottom toolbar of Safari.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-[var(--color-text-primary)]">2. Tap 'Add to Home Screen'</p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">Scroll down the menu list and tap Add to Home Screen.</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowIOSModal(false);
                dismiss();
              }}
              className="mt-4 w-full py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
