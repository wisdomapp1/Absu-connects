import React from 'react';
import type { MediaRecoveryState } from '../../lib/mediaRecovery.ts';
import { AlertCircle, FolderOpen, RefreshCw, X } from 'lucide-react';

interface MediaRecoveryBannerProps {
  recovery: MediaRecoveryState | null;
  onChooseAgain?: () => void;
  onRetryUpload?: () => void;
  onDismiss: () => void;
  darkSurface?: boolean;
}

export const MediaRecoveryBanner: React.FC<MediaRecoveryBannerProps> = ({
  recovery,
  onChooseAgain,
  onRetryUpload,
  onDismiss,
  darkSurface = false,
}) => {
  if (!recovery) return null;

  return (
    <div
      role="alert"
      className={`rounded-2xl border p-3.5 flex flex-col gap-2.5 animate-in fade-in duration-150 ${
        darkSurface
          ? 'bg-rose-950/60 border-rose-500/40 text-rose-100'
          : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold">{recovery.title}</p>
              {recovery.fileName && (
                <span className="text-[10px] font-mono opacity-80 truncate max-w-[200px]">
                  ({recovery.fileName})
                </span>
              )}
            </div>
            <p className="text-[11px] leading-relaxed mt-0.5 opacity-95 break-words">
              {recovery.message}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[36px] min-w-[36px] -mr-1 -mt-1 rounded-xl flex items-center justify-center opacity-75 hover:opacity-100 transition-opacity shrink-0"
          aria-label="Dismiss media error"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap pl-6">
        {recovery.canChooseAgain && onChooseAgain && (
          <button
            type="button"
            onClick={onChooseAgain}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Choose File Again</span>
          </button>
        )}

        {recovery.canRetryUpload && onRetryUpload && (
          <button
            type="button"
            onClick={onRetryUpload}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Upload</span>
          </button>
        )}
      </div>
    </div>
  );
};
