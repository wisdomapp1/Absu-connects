import React from 'react';
import { Mic, Video, ShieldCheck, AlertCircle, RefreshCw, X, Lock } from 'lucide-react';
import type { CallType } from '../../types/call.ts';

interface MediaPermissionModalProps {
  isOpen: boolean;
  callType: CallType;
  isDenied: boolean;
  onCancel: () => void;
  onContinue: () => void;
  onRetry: () => void;
}

export const MediaPermissionModal: React.FC<MediaPermissionModalProps> = ({
  isOpen,
  callType,
  isDenied,
  onCancel,
  onContinue,
  onRetry,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perm-modal-title"
    >
      <div className="relative w-full max-w-sm bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-3xl p-6 shadow-2xl transition-colors">
        {/* Close Button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
          aria-label="Cancel permission request"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-3xl bg-[var(--color-primary-subtle)] border border-[var(--color-primary)]/40 flex items-center justify-center shadow-lg shadow-[var(--color-primary)]/15 mb-3.5">
            {isDenied ? (
              <AlertCircle className="w-8 h-8 text-rose-500 animate-pulse" />
            ) : callType === 'video' ? (
              <Video className="w-8 h-8 text-[var(--color-primary)]" />
            ) : (
              <Mic className="w-8 h-8 text-[var(--color-primary)]" />
            )}
          </div>

          <h2
            id="perm-modal-title"
            className="text-lg sm:text-xl font-extrabold text-[var(--color-text-primary)] tracking-tight"
          >
            {isDenied
              ? 'Access Blocked in Browser'
              : callType === 'video'
              ? 'Allow Camera & Microphone'
              : 'Allow Microphone Access'}
          </h2>

          <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
            {isDenied
              ? 'Your browser has blocked permission. Please enable microphone and camera in your site settings to continue.'
              : callType === 'video'
              ? 'ABSU Connect needs camera and microphone access so coursemates can see and hear you during video calls.'
              : 'ABSU Connect needs microphone access so coursemates can hear you clearly during voice calls.'}
          </p>
        </div>

        {/* Explanation / Steps Box */}
        {isDenied ? (
          <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-[var(--color-text-primary)] flex flex-col gap-2">
            <div className="flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400">
              <Lock className="w-4 h-4 shrink-0" />
              <span>How to unblock on Android / Chrome:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-[var(--color-text-secondary)] pl-1">
              <li>Tap the <strong>Lock (🔒)</strong> or tune icon in the address bar.</li>
              <li>Tap <strong>Permissions</strong> or <strong>Site settings</strong>.</li>
              <li>Change <strong>Microphone</strong> &amp; <strong>Camera</strong> to <strong>Allow</strong>.</li>
              <li>Return here and tap <strong>Retry</strong> below.</li>
            </ol>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <div className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[var(--color-text-primary)]">Privacy Protected</p>
                <p className="text-[11px]">Calls connect directly peer-to-peer. Your media is never stored or recorded.</p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 flex flex-col gap-2">
          {isDenied ? (
            <button
              onClick={onRetry}
              className="w-full py-3 px-4 rounded-2xl bg-[var(--color-primary)] text-white font-bold text-xs hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-[var(--color-primary)]/25"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Permission</span>
            </button>
          ) : (
            <button
              onClick={onContinue}
              className="w-full py-3 px-4 rounded-2xl bg-[var(--color-primary)] text-white font-bold text-xs hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-[var(--color-primary)]/25"
            >
              <span>Continue</span>
            </button>
          )}

          <button
            onClick={onCancel}
            className="w-full py-2.5 px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
