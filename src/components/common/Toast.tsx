import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:w-96 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
          role="status"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {toast.type === 'success' && (
              <CheckCircle2 className="w-4 h-4 text-[var(--color-success)] shrink-0" />
            )}
            {toast.type === 'warning' && (
              <AlertCircle className="w-4 h-4 text-[var(--color-warning)] shrink-0" />
            )}
            {(!toast.type || toast.type === 'info') && (
              <Info className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
            )}
            <span className="text-xs font-medium truncate">{toast.message}</span>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 -mr-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-lg min-w-[28px] min-h-[28px] flex items-center justify-center transition-colors"
            aria-label="Dismiss toast"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
