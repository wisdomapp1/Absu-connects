import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchPendingSubmissions,
  reviewAnonymousSubmission,
} from '../../lib/pageService.ts';
import type { AnonymousSubmission } from '../../types/pages.ts';
import { useApp } from '../../context/AppContext.tsx';
import {
  ShieldCheck,
  Check,
  X,
  Loader2,
  AlertCircle,
  Inbox,
  Clock,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface AnonymousModerationQueueProps {
  pageId: string;
  onPostApproved?: () => void;
}

export const AnonymousModerationQueue: React.FC<AnonymousModerationQueueProps> = ({
  pageId,
  onPostApproved,
}) => {
  const { addToast } = useApp();

  const [submissions, setSubmissions] = useState<AnonymousSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const pending = await fetchPendingSubmissions(pageId);
      setSubmissions(pending);
    } catch (err) {
      console.warn('[ModerationQueue] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const handleReview = async (submissionId: string, decision: 'approved' | 'rejected') => {
    setProcessingId(submissionId);
    try {
      const res = await reviewAnonymousSubmission(submissionId, decision);

      if (res.success) {
        addToast(
          decision === 'approved'
            ? '✅ Submission approved and published to Mr Anonymous!'
            : 'Submission rejected.',
          decision === 'approved' ? 'success' : 'info'
        );

        setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));

        if (decision === 'approved' && onPostApproved) {
          onPostApproved();
        }
      } else {
        addToast(res.error || 'Review failed. You may not be an authorized manager.', 'warning');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reviewing submission';
      addToast(msg, 'warning');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-extrabold text-[var(--color-text-primary)]">
              Pending Submissions Queue
            </h3>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Review and publish anonymous stories. Submitter identities are strictly protected.
            </p>
          </div>
        </div>

        <button
          onClick={loadSubmissions}
          disabled={loading}
          className="p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          title="Refresh queue"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Submissions List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)] mb-2" />
          <p className="text-xs">Loading pending submissions...</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-[var(--color-text-primary)]">
            Queue is all clear!
          </h4>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1 max-w-xs">
            There are no pending submissions awaiting review right now.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.map((sub) => {
            const isProcessing = processingId === sub.id;

            return (
              <div
                key={sub.id}
                className="p-4 sm:p-5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs flex flex-col gap-3.5"
              >
                {/* Meta header */}
                <div className="flex items-center justify-between text-[11px] text-[var(--color-text-secondary)] pb-2 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Submitted {formatDate(sub.created_at)}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                    Pending Review
                  </span>
                </div>

                {/* Submission text content */}
                <div className="text-xs sm:text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap break-words bg-[var(--color-bg-main)] p-3.5 rounded-xl border border-[var(--color-border)]/60">
                  {sub.body}
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => handleReview(sub.id, 'rejected')}
                    disabled={isProcessing}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>

                  <button
                    onClick={() => handleReview(sub.id, 'approved')}
                    disabled={isProcessing}
                    className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-95 text-white text-xs font-bold shadow-sm shadow-[var(--color-primary)]/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Approve &amp; Publish</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
