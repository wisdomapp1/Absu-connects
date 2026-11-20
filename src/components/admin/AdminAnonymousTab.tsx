import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchAdminAnonymousSubmissions,
  reviewAdminAnonymousSubmission,
  approveAllAdminAnonymousSubmissions,
  AdminAnonymousSubmission,
} from '../../lib/adminService.ts';
import {
  EyeOff,
  Check,
  CheckCheck,
  X,
  Search,
  RefreshCw,
  Clock,
  Sparkles,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Filter,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';

interface AdminAnonymousTabProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const AdminAnonymousTab: React.FC<AdminAnonymousTabProps> = ({ onShowToast }) => {
  const [submissions, setSubmissions] = useState<AdminAnonymousSubmission[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('approved');
  const [search, setSearch] = useState<string>('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState<boolean>(false);
  const [showApproveAllConfirm, setShowApproveAllConfirm] = useState<boolean>(false);

  // Rejection modal state
  const [rejectingItem, setRejectingItem] = useState<AdminAnonymousSubmission | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Counts
  const [counts, setCounts] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  });

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminAnonymousSubmissions(statusFilter);
      if (res.success && res.submissions) {
        setSubmissions(res.submissions);
        setCounts({
          pending: res.pendingCount ?? 0,
          approved: res.approvedCount ?? 0,
          rejected: res.rejectedCount ?? 0,
          total: res.totalCount ?? res.submissions.length,
        });
      } else {
        onShowToast(res.error || 'Failed to load anonymous submissions.', 'warning');
      }
    } catch {
      onShowToast('Error loading anonymous submissions queue.', 'warning');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, onShowToast]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Handle individual review
  const handleReview = async (id: string, decision: 'approved' | 'rejected', reason?: string) => {
    setActionInProgress(id);
    try {
      const res = await reviewAdminAnonymousSubmission(id, decision, reason);
      if (res.success) {
        onShowToast(
          decision === 'approved'
            ? 'Submission approved and published to Mr Anonymous feed!'
            : 'Submission rejected and archived.',
          decision === 'approved' ? 'success' : 'info'
        );
        setRejectingItem(null);
        setRejectReason('');
        loadSubmissions();
      } else {
        onShowToast(res.error || `Failed to ${decision} submission.`, 'warning');
      }
    } catch {
      onShowToast(`Error while trying to ${decision} submission.`, 'warning');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Approve All
  const handleApproveAll = async () => {
    setApprovingAll(true);
    try {
      const res = await approveAllAdminAnonymousSubmissions();
      if (res.success) {
        onShowToast(
          res.message || `Successfully approved and published all ${res.count ?? 0} pending anonymous posts!`,
          'success'
        );
        setShowApproveAllConfirm(false);
        loadSubmissions();
      } else {
        onShowToast(res.error || 'Failed to approve all submissions.', 'warning');
      }
    } catch {
      onShowToast('Error while batch approving anonymous submissions.', 'warning');
    } finally {
      setApprovingAll(false);
    }
  };

  // Filter in-memory by search keyword
  const filteredSubmissions = submissions.filter((sub) => {
    if (!search.trim()) return true;
    return sub.body.toLowerCase().includes(search.trim().toLowerCase());
  });

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
    <div className="space-y-5">
      {/* Top Action Banner */}
      <div className="p-5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold shrink-0 mt-0.5">
            <EyeOff className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-extrabold text-[var(--color-text-primary)]">
                Anonymous Posts Archive (Auto-Approved)
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                Instant Publish Active
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 max-w-xl leading-relaxed">
              All new and existing anonymous posts are automatically approved and published immediately without admin intervention. Submitter identities remain strictly protected.
            </p>
          </div>
        </div>

        {/* Refresh */}
        <div className="flex items-center gap-2.5 self-start md:self-center shrink-0 flex-wrap">
          {counts.pending > 0 && (
            <button
              onClick={() => setShowApproveAllConfirm(true)}
              disabled={approvingAll || loading}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-all active:scale-95 flex items-center gap-2"
              title="Sync any remaining legacy pending submissions"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Sync Legacy Pending ({counts.pending})</span>
            </button>
          )}

          <button
            onClick={loadSubmissions}
            disabled={loading}
            className="p-2.5 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Refresh anonymous posts archive"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'pending'
                ? 'bg-[var(--color-bg-card)] text-[var(--color-primary)] font-bold shadow-xs'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Pending ({counts.pending})
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'approved'
                ? 'bg-[var(--color-bg-card)] text-[var(--color-primary)] font-bold shadow-xs'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Approved ({counts.approved})
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'rejected'
                ? 'bg-[var(--color-bg-card)] text-[var(--color-primary)] font-bold shadow-xs'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Rejected ({counts.rejected})
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'all'
                ? 'bg-[var(--color-bg-card)] text-[var(--color-primary)] font-bold shadow-xs'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            All ({counts.total})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by keyword..."
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>
      </div>

      {/* Submissions List */}
      {loading ? (
        <div className="p-12 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center">
          <RefreshCw className="w-6 h-6 text-[var(--color-primary)] animate-spin mb-2" />
          <p className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Loading anonymous submissions queue...
          </p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="p-12 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="font-extrabold text-sm text-[var(--color-text-primary)]">
            {statusFilter === 'pending'
              ? 'No pending anonymous submissions'
              : 'No submissions found'}
          </h4>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1 max-w-sm">
            {statusFilter === 'pending'
              ? 'Anonymous posts are auto-approved and published immediately upon submission.'
              : 'No anonymous posts match your current filter or keyword.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSubmissions.map((sub) => {
            const isPending = sub.status === 'pending';
            const isApproved = sub.status === 'approved';
            const isRejected = sub.status === 'rejected';

            return (
              <div
                key={sub.id}
                className="p-4 sm:p-5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs flex flex-col gap-3 transition-colors hover:border-[var(--color-border)]/80"
              >
                {/* Header row: ID, Date, Status */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[var(--color-text-secondary)] font-bold">
                      #{sub.id.substring(0, 8)}
                    </span>
                    <span className="text-[var(--color-text-secondary)]">·</span>
                    <div className="flex items-center gap-1 text-[var(--color-text-secondary)] text-[11px]">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(sub.created_at)}</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full capitalize ${
                      isApproved
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : isRejected
                        ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {isApproved ? 'Approved & Published' : isRejected ? 'Rejected' : 'Pending Review'}
                  </span>
                </div>

                {/* Content Box */}
                <div className="p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                  <p className="text-xs sm:text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed select-text">
                    "{sub.body}"
                  </p>
                </div>

                {/* Footer Review Info & Actions */}
                <div className="flex items-center justify-between gap-3 pt-1 text-xs">
                  <div className="text-[11px] text-[var(--color-text-secondary)]">
                    {sub.reviewed_at && (
                      <span>
                        Reviewed on {formatDate(sub.reviewed_at)}
                        {sub.reviewed_by ? ` by ${sub.reviewed_by}` : ''}
                      </span>
                    )}
                  </div>

                  {/* Pending Action Buttons */}
                  {isPending && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setRejectingItem(sub);
                          setRejectReason('');
                        }}
                        disabled={actionInProgress === sub.id}
                        className="px-3 py-1.5 rounded-xl border border-red-500/30 text-red-600 hover:bg-red-500/10 font-bold text-xs transition-colors flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>

                      <button
                        onClick={() => handleReview(sub.id, 'approved')}
                        disabled={actionInProgress === sub.id}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {actionInProgress === sub.id ? 'Publishing...' : 'Approve & Publish'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal: Batch Approve All Pending */}
      {showApproveAllConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setShowApproveAllConfirm(false)}
          >
            <div
              className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                  <CheckCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[var(--color-text-primary)]">
                    Approve All Pending Submissions?
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    This will publish {counts.pending} anonymous posts to the campus feed immediately.
                  </p>
                </div>
              </div>

              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                Every pending submission will be attributed to <strong className="text-[var(--color-text-primary)]">Mr Anonymous</strong> and published on student timelines. Submitter identities remain permanently protected.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                <button
                  onClick={() => setShowApproveAllConfirm(false)}
                  disabled={approvingAll}
                  className="px-3.5 py-2 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproveAll}
                  disabled={approvingAll}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all active:scale-95 flex items-center gap-1.5"
                >
                  {approvingAll ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Publishing {counts.pending} Posts...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Approve All</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Reject Modal */}
      {rejectingItem &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setRejectingItem(null)}
          >
            <div
              className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <h3 className="font-extrabold text-sm sm:text-base text-[var(--color-text-primary)]">
                    Reject Anonymous Submission
                  </h3>
                </div>
                <button
                  onClick={() => setRejectingItem(null)}
                  className="p-1 rounded-lg hover:bg-[var(--color-bg-main)] text-[var(--color-text-secondary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] italic line-clamp-3">
                "{rejectingItem.body}"
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                  Rejection Reason (Internal Record)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Defamatory, harassment, policy violation, spam, etc..."
                  rows={3}
                  className="w-full p-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                <button
                  onClick={() => setRejectingItem(null)}
                  className="px-3.5 py-2 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReview(rejectingItem.id, 'rejected', rejectReason.trim())}
                  disabled={actionInProgress === rejectingItem.id}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                >
                  {actionInProgress === rejectingItem.id ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
