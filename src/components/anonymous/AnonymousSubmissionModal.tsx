import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { submitAnonymousPost } from '../../lib/pageService.ts';
import { useApp } from '../../context/AppContext.tsx';
import {
  EyeOff,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';

interface AnonymousSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

const TOPIC_SUGGESTIONS = [
  '#Confession',
  '#CampusGist',
  '#StudentExperience',
  '#HostelLife',
  '#RelationshipGist',
  '#AcademicAdvice',
  '#FacultyStory',
];

export const AnonymousSubmissionModal: React.FC<AnonymousSubmissionModalProps> = ({
  isOpen,
  onClose,
  onSubmitted,
}) => {
  const { addToast } = useApp();

  const [text, setText] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successSubmissionId, setSuccessSubmissionId] = useState<string | null>(null);

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

  const charCount = text.trim().length;
  const minChars = 10;
  const maxChars = 2500;
  const isValidLength = charCount >= minChars && charCount <= maxChars;

  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag('');
    } else {
      setSelectedTag(tag);
      if (!text.includes(tag)) {
        setText((prev) => `${tag} ${prev}`.trim());
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidLength || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await submitAnonymousPost(text);

      if (res.success && res.submissionId) {
        setSuccessSubmissionId(res.submissionId);
        addToast('Anonymous post published to Mr Anonymous!', 'success');
        if (onSubmitted) onSubmitted();
      } else {
        setErrorMsg(res.error || 'Failed to submit post. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting post';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setText('');
    setSelectedTag('');
    setErrorMsg(null);
    setSuccessSubmissionId(null);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anon-submit-title"
    >
      <div className="relative w-full max-w-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto transition-colors">
        {/* Close Button */}
        <button
          onClick={handleResetAndClose}
          className="absolute top-4 right-4 p-2 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {successSubmissionId ? (
          // SUCCESS STATE
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-extrabold text-[var(--color-text-primary)] tracking-tight">
              Published Anonymously!
            </h3>

            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-2 max-w-sm leading-relaxed">
              Your post has been automatically approved and published immediately under <strong>Mr Anonymous</strong> in the campus feed.
            </p>

            <div className="mt-4 p-3 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Your profile identity remains completely hidden and private.</span>
            </div>

            <button
              onClick={handleResetAndClose}
              className="mt-6 w-full py-3 px-4 rounded-2xl bg-[var(--color-primary)] text-white font-bold text-xs sm:text-sm hover:opacity-95 transition-all shadow-lg shadow-[var(--color-primary)]/25"
            >
              Done
            </button>
          </div>
        ) : (
          // FORM STATE
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white flex items-center justify-center shadow-md shadow-violet-600/20 shrink-0">
                <EyeOff className="w-5 h-5" />
              </div>
              <div>
                <h3 id="anon-submit-title" className="text-base font-extrabold text-[var(--color-text-primary)]">
                  Submit to Mr Anonymous
                </h3>
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  Identity-protected confession, gist, or campus story
                </p>
              </div>
            </div>

            {/* Quick Topic Tags */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {TOPIC_SUGGESTIONS.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => handleTagClick(tag)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all border ${
                    selectedTag === tag || text.includes(tag)
                      ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs'
                      : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Textarea */}
            <div className="relative">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Share your confession, experience, campus gist, or question here. Please remember not to include real names, phone numbers, or identifying details..."
                rows={6}
                maxLength={maxChars}
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck={true}
                className="w-full p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 resize-none transition-all leading-relaxed"
              />

              {/* Character Counter */}
              <div className="flex items-center justify-between text-[11px] text-[var(--color-text-secondary)] px-1 mt-1">
                <span>
                  {charCount < minChars
                    ? `Minimum ${minChars - charCount} more characters`
                    : 'Ready to submit'}
                </span>
                <span className={charCount > maxChars - 100 ? 'text-amber-500 font-bold' : ''}>
                  {charCount} / {maxChars}
                </span>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-4 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!isValidLength || isSubmitting}
                className="py-2.5 px-5 rounded-xl bg-[var(--color-primary)] text-white font-bold text-xs hover:opacity-95 active:scale-[0.99] transition-all flex items-center gap-1.5 shadow-md shadow-[var(--color-primary)]/25 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Publish Anonymously</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};
