import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ActionConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ActionConfirmModal: React.FC<ActionConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isDestructive = true,
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 sm:p-6 shadow-2xl transition-all animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              isDestructive
                ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                : 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border border-[var(--color-primary)]/20'
            }`}
          >
            {isDestructive ? (
              <Trash2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[var(--color-text-primary)] leading-tight">
              {title}
            </h3>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
              {message}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-border)] transition-colors -mr-1 -mt-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-app)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors min-h-[38px]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm min-h-[38px] flex items-center gap-1.5 active:scale-95 ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'
            }`}
          >
            {isLoading && (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
