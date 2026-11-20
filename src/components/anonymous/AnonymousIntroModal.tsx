import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  FileText,
} from 'lucide-react';

interface AnonymousIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
}

export const AnonymousIntroModal: React.FC<AnonymousIntroModalProps> = ({
  isOpen,
  onClose,
  onContinue,
}) => {
  const [rulesExpanded, setRulesExpanded] = useState(false);

  // Lock body scroll while modal is active so background feed never scrolls
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anon-intro-title"
    >
      <div className="relative w-full max-w-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto transition-colors">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon with Purple Aura */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-600 to-purple-700 text-white flex items-center justify-center shadow-lg shadow-violet-600/25 mb-3.5">
            <EyeOff className="w-8 h-8" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300 text-xs font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Mr Anonymous · ABSU Connect</span>
          </div>

          <h2
            id="anon-intro-title"
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)] tracking-tight"
          >
            Your story. Your voice. Your privacy.
          </h2>

          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed max-w-md">
            Share a confession, campus gist, relationship experience, student experience, or question with the ABSU community.
          </p>
        </div>

        {/* Key Guarantees */}
        <div className="mt-5 space-y-2.5">
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <span className="font-bold text-[var(--color-text-primary)]">Strict Identity Protection: </span>
              The Mr Anonymous page manager will not be shown who submitted your post. Your profile is never displayed publicly.
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <CheckCircle2 className="w-5 h-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <span className="font-bold text-[var(--color-text-primary)]">Instant Anonymous Publishing: </span>
              Your post is automatically approved and published immediately under Mr Anonymous on the page and in the main campus feed.
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              <span className="font-bold">Protect Others &amp; Yourself: </span>
              Please avoid including real names, phone numbers, department matric numbers, or details that could identify you or coursemates.
            </div>
          </div>
        </div>

        {/* Expandable Community Guidelines */}
        <div className="mt-4 border border-[var(--color-border)] rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setRulesExpanded((prev) => !prev)}
            className="w-full px-4 py-2.5 bg-[var(--color-bg-main)] flex items-center justify-between text-xs font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Anonymous Community Guidelines</span>
            </div>
            {rulesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {rulesExpanded && (
            <div className="p-4 bg-[var(--color-bg-card)] text-xs text-[var(--color-text-secondary)] space-y-2 border-t border-[var(--color-border)] leading-relaxed animate-in fade-in">
              <p>
                To keep ABSU Connect safe and constructive, all anonymous posts must follow these community standards:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] pl-1">
                <li><strong>No Doxxing:</strong> Exposing private personal data, contact information, or matric numbers.</li>
                <li><strong>No Bullying &amp; Harassment:</strong> Targeted attacks or character assassinations.</li>
                <li><strong>No Threats of Harm:</strong> Violence, hate speech, or unlawful campus activities.</li>
                <li><strong>No Non-Consensual Media:</strong> Sexual imagery or invasive content.</li>
                <li><strong>No Malicious Defamation:</strong> Unsubstantiated personal accusations against identifiable individuals.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={onContinue}
            className="flex-1 py-3 px-4 rounded-2xl bg-[var(--color-primary)] text-white font-bold text-xs sm:text-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--color-primary)]/25"
          >
            <span>Continue anonymously</span>
          </button>

          <button
            onClick={onClose}
            className="py-3 px-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
