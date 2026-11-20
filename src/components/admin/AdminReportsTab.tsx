import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  Eye,
  FileText,
  User,
  MessageSquare,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import {
  fetchAdminReports,
  updateAdminReport,
  moderateAdminPost,
  AdminReportItem,
} from '../../lib/adminService.ts';

interface AdminReportsTabProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const AdminReportsTab: React.FC<AdminReportsTabProps> = ({ onShowToast }) => {
  const [reports, setReports] = useState<AdminReportItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  // Selected report for resolution drawer/modal
  const [selectedReport, setSelectedReport] = useState<AdminReportItem | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionTaken, setActionTaken] = useState('Reviewed');
  const [submitting, setSubmitting] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminReports(statusFilter);
      if (res.success && res.reports) {
        setReports(res.reports);
      } else {
        onShowToast(res.error || 'Failed to fetch reports queue.', 'warning');
      }
    } catch {
      onShowToast('Could not load reports.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [statusFilter]);

  const handleOpenResolution = (report: AdminReportItem) => {
    setSelectedReport(report);
    setAdminNotes(report.resolutionNotes || '');
    setActionTaken(report.actionTaken || 'Reviewed');
  };

  const handleResolve = async (newStatus: 'under_review' | 'resolved' | 'dismissed') => {
    if (!selectedReport) return;
    setSubmitting(true);
    try {
      const res = await updateAdminReport(selectedReport.id, {
        status: newStatus,
        notes: adminNotes.trim(),
        actionTaken: actionTaken.trim(),
      });

      if (res.success) {
        onShowToast(`Report updated to ${newStatus}.`, 'success');
        setSelectedReport(null);
        loadReports();
      } else {
        onShowToast(res.error || 'Failed to update report.', 'warning');
      }
    } catch {
      onShowToast('Error updating report.', 'warning');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHideReportedPost = async (postId: string) => {
    const res = await moderateAdminPost(postId, 'hide', 'Hidden due to community complaint');
    if (res.success) {
      onShowToast('Reported post hidden from feed.', 'success');
      setActionTaken('Post Hidden');
    } else {
      onShowToast(res.error || 'Failed to hide post.', 'warning');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'All Reports' },
            { id: 'pending', label: 'Pending' },
            { id: 'under_review', label: 'Under Review' },
            { id: 'resolved', label: 'Resolved' },
            { id: 'dismissed', label: 'Dismissed' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors ${
                statusFilter === f.id
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={loadReports}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center justify-center gap-1.5 self-end sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[var(--color-primary)]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Reports Queue */}
      <div className="rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] overflow-hidden shadow-xs">
        {loading && reports.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--color-text-secondary)]">
            Loading moderation queue...
          </div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-[var(--color-success)] mx-auto opacity-70" />
            <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Moderation Queue Clear</h4>
            <p className="text-xs text-[var(--color-text-secondary)]">
              No reports found in the "{statusFilter}" category.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {reports.map((r) => {
              const isPending = r.status === 'pending';
              const isUnderReview = r.status === 'under_review';
              const isResolved = r.status === 'resolved';

              return (
                <div
                  key={r.id}
                  className="p-4 hover:bg-[var(--color-bg-main)]/50 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
                >
                  {/* Left: Report Details */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-[var(--color-text-primary)] flex items-center gap-1">
                        {r.targetType === 'post' ? (
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                        ) : r.targetType === 'user' ? (
                          <User className="w-3.5 h-3.5 text-purple-500" />
                        ) : (
                          <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        <span>Report on {r.targetType.toUpperCase()}</span>
                      </span>

                      {isPending ? (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                          Pending
                        </span>
                      ) : isUnderReview ? (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                          Under Review
                        </span>
                      ) : isResolved ? (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20">
                          Resolved
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                          Dismissed
                        </span>
                      )}

                      <span className="text-[11px] text-[var(--color-text-secondary)]">
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {/* Complaint Reason */}
                    <p className="font-bold text-[var(--color-text-primary)]">
                      "{r.reason}"
                    </p>

                    {/* Target preview */}
                    {r.target && (
                      <div className="p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-secondary)]">
                        {r.targetType === 'post' && (
                          <p className="line-clamp-2 italic">
                            Post Body: "{r.target.body}"
                          </p>
                        )}
                        {r.targetType === 'user' && (
                          <p>
                            Student: <strong>{r.target.display_name}</strong> ({r.target.username})
                          </p>
                        )}
                      </div>
                    )}

                    {/* Reporter info */}
                    <div className="text-[11px] text-[var(--color-text-secondary)]">
                      Reported by:{' '}
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {r.reporter?.display_name || (r.reporterId ? `Student (${r.reporterId.slice(0, 8)})` : 'Anonymous Student')}
                      </span>
                      {r.resolvedBy && (
                        <span className="ml-2 font-medium text-[var(--color-success)]">
                          · Handled by {r.resolvedBy}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Resolve Button */}
                  <div className="shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => handleOpenResolution(r)}
                      className="px-3 py-1.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold transition-all flex items-center gap-1 shadow-xs"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Take Action</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Report Resolution Drawer / Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h3 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Resolve Complaint #{selectedReport.id.slice(0, 8)}</span>
              </h3>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                Complaint Details
              </span>
              <p className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] font-semibold text-[var(--color-text-primary)]">
                "{selectedReport.reason}"
              </p>
            </div>

            {selectedReport.targetType === 'post' && selectedReport.target && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Reported Post Content
                  </span>
                  <button
                    type="button"
                    onClick={() => handleHideReportedPost(selectedReport.targetId)}
                    className="text-[11px] font-bold text-amber-600 hover:underline"
                  >
                    Hide Post from Feed
                  </button>
                </div>
                <p className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] italic text-[var(--color-text-secondary)] line-clamp-3">
                  "{selectedReport.target.body}"
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-[var(--color-text-primary)]">
                Administrative Notes & Resolution Decision
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Record action rationale, student communication, or review outcome..."
                rows={3}
                className="w-full px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                disabled={submitting}
                className="px-3 py-2 rounded-xl border border-[var(--color-border)] font-semibold text-[var(--color-text-secondary)]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleResolve('under_review')}
                disabled={submitting}
                className="px-3 py-2 rounded-xl bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 font-bold transition-colors"
              >
                Mark Under Review
              </button>
              <button
                type="button"
                onClick={() => handleResolve('dismissed')}
                disabled={submitting}
                className="px-3 py-2 rounded-xl bg-gray-500/10 text-[var(--color-text-secondary)] hover:bg-gray-500/20 font-bold transition-colors"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => handleResolve('resolved')}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-[var(--color-success)] text-white font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Mark Resolved</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
