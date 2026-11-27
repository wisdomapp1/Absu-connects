import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  formatPageCategoryLabel,
  type AdminPagesStats,
  type Page,
  type PageApplication,
  type PageReport,
  type PageStatus,
  type PageVerificationRequest,
} from '../../types/pages.ts';
import {
  fetchAdminPagesStats,
  adminListPages,
  adminSetPageVerified,
  adminSetPageStatus,
  adminListPageReports,
  adminResolvePageReport,
  adminListVerificationRequests,
  adminReviewVerificationRequest,
  fetchAllPageApplications,
  reviewPageApplication,
} from '../../lib/pageService.ts';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  Loader2,
  Search,
  Ban,
  RotateCcw,
  Flag,
  AlertTriangle,
  BadgeCheck,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.ts';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useApp } from '../../context/AppContext.tsx';

interface AdminPagesTabProps {
  onShowToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

export const AdminPagesTab: React.FC<AdminPagesTabProps> = ({ onShowToast }) => {
  const { loading: authLoading } = useAuth();
  const { refreshManagedPages } = useApp();
  const [section, setSection] = useState<'pages' | 'reports' | 'verification' | 'applications'>('pages');

  // Stats + Pages console state
  const [stats, setStats] = useState<AdminPagesStats>({
    totalPages: 0,
    activePages: 0,
    verifiedPages: 0,
    disabledPages: 0,
    deletedPages: 0,
    openReports: 0,
  });
  const [pages, setPages] = useState<Page[]>([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PageStatus>('all');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');

  // Reports state
  const [reports, setReports] = useState<PageReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  // Verification Queue state
  const [verificationRequests, setVerificationRequests] = useState<PageVerificationRequest[]>([]);
  const [loadingVerifications, setLoadingVerifications] = useState(true);
  const [verificationFilter, setVerificationFilter] = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending');
  const [reviewModalReq, setReviewModalReq] = useState<PageVerificationRequest | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');

  // Legacy Applications state (preserved)
  const [applications, setApplications] = useState<PageApplication[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [appFilter, setAppFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  // Action modals & busy states
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [disableModalPage, setDisableModalPage] = useState<Page | null>(null);
  const [disableReason, setDisableReason] = useState('Policy violation');
  const [disableExplanation, setDisableExplanation] = useState('');

  const mountedRef = useRef(true);
  const consoleSeqRef = useRef(0);
  const appsSeqRef = useRef(0);
  const hasLoadedConsoleRef = useRef(false);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestLoadConsoleRef = useRef<() => Promise<void>>(async () => {});
  const latestLoadAppsRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (realtimeTimerRef.current) {
        clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }
    };
  }, []);

  const loadConsoleData = useCallback(async (opts?: { silent?: boolean }) => {
    const seq = ++consoleSeqRef.current;
    if (!opts?.silent && !hasLoadedConsoleRef.current) {
      setLoadingPages(true);
      setLoadingReports(true);
      setLoadingVerifications(true);
    }
    try {
      const [s, pgList, repList, verList] = await Promise.all([
        fetchAdminPagesStats(),
        adminListPages({
          search: searchQuery,
          status: statusFilter,
          verified: verifiedFilter,
        }),
        adminListPageReports(),
        adminListVerificationRequests(),
      ]);
      if (!mountedRef.current || seq !== consoleSeqRef.current) return;
      hasLoadedConsoleRef.current = true;
      setStats(s);
      setPages(pgList);
      setReports(repList);
      setVerificationRequests(verList);
    } finally {
      if (mountedRef.current && seq === consoleSeqRef.current) {
        setLoadingPages(false);
        setLoadingReports(false);
        setLoadingVerifications(false);
      }
    }
  }, [searchQuery, statusFilter, verifiedFilter]);

  const loadAppsData = useCallback(async () => {
    const seq = ++appsSeqRef.current;
    if (applications.length === 0) {
      setLoadingApps(true);
    }
    try {
      const data = await fetchAllPageApplications();
      if (!mountedRef.current || seq !== appsSeqRef.current) return;
      setApplications(data);
    } finally {
      if (mountedRef.current && seq === appsSeqRef.current) {
        setLoadingApps(false);
      }
    }
  }, [applications.length]);

  useEffect(() => {
    latestLoadConsoleRef.current = () => loadConsoleData({ silent: true });
  }, [loadConsoleData]);

  useEffect(() => {
    latestLoadAppsRef.current = loadAppsData;
  }, [loadAppsData]);

  useEffect(() => {
    if (authLoading) return;
    const t = setTimeout(() => {
      loadConsoleData();
    }, 150);
    return () => clearTimeout(t);
  }, [authLoading, loadConsoleData]);

  useEffect(() => {
    latestLoadAppsRef.current();
    const scheduleConsoleRefresh = () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = setTimeout(() => {
        realtimeTimerRef.current = null;
        if (mountedRef.current) {
          void latestLoadConsoleRef.current();
        }
      }, 500);
    };

    const channel = supabase
      .channel('admin_pages_console')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pages' }, scheduleConsoleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'page_reports' }, scheduleConsoleRefresh)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'page_verification_requests' },
        scheduleConsoleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'page_applications' },
        () => {
          if (mountedRef.current) void latestLoadAppsRef.current();
        }
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) {
        clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, []);

  const handleToggleVerified = async (page: Page) => {
    setActionError(null);
    setProcessingId(page.id);
    try {
      const nextVerified = !page.isVerified;
      const res = await adminSetPageVerified(page.id, nextVerified);
      if (res.success) {
        setPages((prev) =>
          prev.map((item) =>
            item.id === page.id
              ? { ...item, isVerified: nextVerified, is_verified: nextVerified }
              : item
          )
        );
        setStats((prev) => ({
          ...prev,
          verifiedPages: Math.max(0, prev.verifiedPages + (nextVerified ? 1 : -1)),
        }));
        onShowToast(
          nextVerified ? `${page.name} verified!` : `Verification removed from ${page.name}.`,
          'success'
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('absu:page-realtime', { detail: { table: 'pages', pageId: page.id } })
          );
        }
        await loadConsoleData({ silent: true });
        void refreshManagedPages();
      } else {
        const msg = res.error || 'Database operation failed.';
        setActionError(msg);
        onShowToast(msg, 'warning');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableModalPage) return;
    setProcessingId(disableModalPage.id);
    try {
      const res = await adminSetPageStatus(
        disableModalPage.id,
        'disabled',
        disableReason,
        disableExplanation
      );
      if (res.success) {
        onShowToast(`${disableModalPage.name} disabled.`, 'info');
        setDisableModalPage(null);
        setDisableExplanation('');
        loadConsoleData();
      } else {
        onShowToast(res.error || 'Could not disable Page.', 'warning');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleRestorePage = async (page: Page) => {
    setProcessingId(page.id);
    try {
      const res = await adminSetPageStatus(page.id, 'active');
      if (res.success) {
        onShowToast(`${page.name} restored to active!`, 'success');
        loadConsoleData();
      } else {
        onShowToast(res.error || 'Could not restore Page.', 'warning');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleResolveReport = async (reportId: string) => {
    setProcessingId(reportId);
    try {
      const res = await adminResolvePageReport(reportId, 'Reviewed by Super Admin');
      if (res.success) {
        onShowToast('Report marked as resolved.', 'success');
        loadConsoleData();
      } else {
        onShowToast(res.error || 'Failed to resolve report.', 'warning');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleReviewApp = async (appId: string, decision: 'approved' | 'rejected') => {
    setProcessingId(appId);
    const res = await reviewPageApplication(appId, decision);
    setProcessingId(null);
    if (res.success) {
      onShowToast(
        decision === 'approved' ? 'Page application approved!' : 'Page application rejected.',
        'success'
      );
      loadAppsData();
    } else {
      onShowToast(res.error || 'Review action failed', 'warning');
    }
  };

  const handleConfirmVerificationReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModalReq || processingId) return;
    setActionError(null);
    setProcessingId(reviewModalReq.id);
    try {
      const res = await adminReviewVerificationRequest(
        reviewModalReq.id,
        reviewDecision,
        reviewNote.trim() || undefined
      );
      if (res.success) {
        if (reviewDecision === 'approved') {
          setPages((prev) =>
            prev.map((item) =>
              item.id === reviewModalReq.page_id
                ? { ...item, isVerified: true, is_verified: true }
                : item
            )
          );
        }
        onShowToast(
          reviewDecision === 'approved'
            ? `Verification approved for ${reviewModalReq.official_name}.`
            : `Verification rejected for ${reviewModalReq.official_name}.`,
          reviewDecision === 'approved' ? 'success' : 'info'
        );
        setReviewModalReq(null);
        setReviewNote('');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('absu:page-realtime', {
              detail: { table: 'pages', pageId: reviewModalReq.page_id },
            })
          );
        }
        await loadConsoleData({ silent: true });
        void refreshManagedPages();
      } else {
        const msg = res.error || 'Database operation failed.';
        setActionError(msg);
        onShowToast(msg, 'warning');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const pendingVerificationsCount = verificationRequests.filter((r) => r.status === 'pending').length;
  const filteredVerifications = verificationRequests.filter((r) =>
    verificationFilter === 'all' ? true : r.status === verificationFilter
  );
  const filteredApps = applications.filter((a) => (appFilter === 'all' ? true : a.status === appFilter));

  return (
    <div className="space-y-4">
      {/* Error Banner */}
      {actionError && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-xs font-semibold text-rose-500"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="truncate">{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="px-2 py-1 rounded-lg hover:bg-rose-500/10 text-[11px] font-bold shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Pages', value: stats.totalPages, color: 'text-blue-400' },
          { label: 'Active', value: stats.activePages, color: 'text-emerald-400' },
          { label: 'Verified', value: stats.verifiedPages, color: 'text-sky-400' },
          { label: 'Disabled', value: stats.disabledPages, color: 'text-amber-400' },
          { label: 'Open Reports', value: stats.openReports, color: 'text-rose-400' },
        ].map((card) => (
          <div
            key={card.label}
            className="p-3.5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)]"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              {card.label}
            </p>
            <p className={`text-xl font-extrabold mt-1 tabular-nums ${card.color}`}>
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Console Sub-Navigation */}
      <div className="p-2 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'pages', label: `All Pages (${pages.length})` },
            { id: 'verification', label: `Verification Queue (${pendingVerificationsCount})` },
            { id: 'reports', label: `Reports (${stats.openReports})` },
            { id: 'applications', label: `Legacy Applications (${applications.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id as any)}
              className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap tabular-nums ${
                section === tab.id
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            loadConsoleData();
            loadAppsData();
          }}
          className="px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] hover:underline"
        >
          Refresh
        </button>
      </div>

      {/* SECTION 1: MANAGE PAGES */}
      {section === 'pages' && (
        <div className="space-y-3">
          <div className="p-3 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Pages by name, handle, or category..."
                className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="min-h-[40px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)]"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="deleted">Deleted</option>
            </select>

            <select
              value={verifiedFilter}
              onChange={(e) => setVerifiedFilter(e.target.value as any)}
              className="min-h-[40px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)]"
            >
              <option value="all">All Badges</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>
          </div>

          {loadingPages ? (
            <div className="p-10 flex items-center justify-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
              <span>Loading Pages...</span>
            </div>
          ) : pages.length === 0 ? (
            <div className="p-10 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl text-xs text-[var(--color-text-secondary)]">
              No Pages match your filters.
            </div>
          ) : (
            <div className="space-y-2.5">
              {pages.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={p.avatarUrl}
                      name={p.name}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-sm font-extrabold text-[var(--color-text-primary)] truncate">
                          {p.name}
                        </h4>
                        {p.isVerified && <VerifiedBadge size={14} />}
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                            p.status === 'active'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : p.status === 'disabled'
                              ? 'bg-rose-500/15 text-rose-400'
                              : 'bg-slate-500/20 text-slate-400'
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] truncate">
                        @{p.slug} · {formatPageCategoryLabel(p.category)} · {p.followersCount.toLocaleString()} followers ·{' '}
                        {(p.postsCount ?? p.posts_count ?? 0).toLocaleString()} posts
                      </p>
                      {p.disabled_reason && (
                        <p className="text-[11px] text-rose-400 mt-0.5">
                          Reason: {p.disabled_reason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      disabled={processingId === p.id}
                      onClick={() => handleToggleVerified(p)}
                      className={`min-h-[38px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${
                        p.isVerified
                          ? 'border border-[var(--color-border)] text-[var(--color-text-secondary)]'
                          : 'bg-[#1877F2] text-white'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{p.isVerified ? 'Unverify' : 'Verify Page'}</span>
                    </button>

                    {p.status === 'active' ? (
                      <button
                        type="button"
                        disabled={processingId === p.id}
                        onClick={() => setDisableModalPage(p)}
                        className="min-h-[38px] px-3 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Disable</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={processingId === p.id}
                        onClick={() => handleRestorePage(p)}
                        className="min-h-[38px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: PAGE REPORTS */}
      {section === 'reports' && (
        <div className="space-y-3">
          {loadingReports ? (
            <div className="p-10 flex items-center justify-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
              <span>Loading reports...</span>
            </div>
          ) : reports.length === 0 ? (
            <div className="p-10 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl space-y-2">
              <Flag className="w-7 h-7 text-[var(--color-text-secondary)] mx-auto opacity-50" />
              <p className="text-xs text-[var(--color-text-secondary)]">No Page reports yet.</p>
            </div>
          ) : (
            reports.map((rep) => (
              <div
                key={rep.id}
                className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span className="text-sm font-extrabold text-[var(--color-text-primary)] truncate">
                      {rep.page?.name || rep.page_id}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                        rep.status === 'open'
                          ? 'bg-rose-500/15 text-rose-400'
                          : 'bg-emerald-500/15 text-emerald-400'
                      }`}
                    >
                      {rep.status}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                    Reason: {rep.reason}
                  </p>
                  {rep.description && (
                    <p className="text-xs text-[var(--color-text-secondary)]">{rep.description}</p>
                  )}
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    Reported by {rep.reporter?.display_name || 'Student'} on{' '}
                    {new Date(rep.created_at).toLocaleDateString()}
                  </p>
                </div>

                {rep.status === 'open' && (
                  <button
                    type="button"
                    disabled={processingId === rep.id}
                    onClick={() => handleResolveReport(rep.id)}
                    className="min-h-[40px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold shrink-0 whitespace-nowrap"
                  >
                    Resolve Report
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* SECTION 2B: VERIFICATION QUEUE */}
      {section === 'verification' && (
        <div className="space-y-3">
          <div className="p-3 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center gap-2 flex-wrap">
            {(['pending', 'all', 'approved', 'rejected'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setVerificationFilter(tab)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors tabular-nums ${
                  verificationFilter === tab
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
                }`}
              >
                {tab} (
                {
                  verificationRequests.filter((r) => (tab === 'all' ? true : r.status === tab))
                    .length
                }
                )
              </button>
            ))}
          </div>

          {loadingVerifications ? (
            <div className="p-10 flex items-center justify-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
              <span>Loading verification requests...</span>
            </div>
          ) : filteredVerifications.length === 0 ? (
            <div className="p-10 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl space-y-2">
              <BadgeCheck className="w-7 h-7 text-[var(--color-text-secondary)] mx-auto opacity-50" />
              <p className="text-xs text-[var(--color-text-secondary)]">
                No {verificationFilter} verification requests.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredVerifications.map((req) => {
                const safeEvidenceUrl =
                  req.evidence_url && /^https?:\/\//i.test(req.evidence_url)
                    ? req.evidence_url
                    : null;
                return (
                  <div
                    key={req.id}
                    className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          src={req.page?.avatar_url || undefined}
                          name={req.page?.name || req.official_name}
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-sm font-extrabold text-[var(--color-text-primary)] truncate">
                              {req.official_name}
                            </h4>
                            {req.page?.is_verified && <VerifiedBadge size={14} />}
                          </div>
                          <p className="text-xs text-[var(--color-text-secondary)] truncate">
                            {req.page?.name || 'Page'}
                            {req.page?.slug ? ` (@${req.page.slug})` : ''} ·{' '}
                            {formatPageCategoryLabel(req.category)}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-secondary)]">
                            Submitted {new Date(req.created_at).toLocaleDateString()} by{' '}
                            <strong className="text-[var(--color-text-primary)]">
                              {req.requester?.display_name || req.requester?.username || 'Page Manager'}
                            </strong>
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-xs font-bold capitalize flex items-center gap-1 shrink-0 ${
                          req.status === 'approved'
                            ? 'text-emerald-500'
                            : req.status === 'rejected'
                            ? 'text-rose-500'
                            : 'text-amber-500'
                        }`}
                      >
                        {req.status === 'approved' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {req.status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                        {req.status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                        <span>{req.status}</span>
                      </span>
                    </div>

                    <p className="text-xs text-[var(--color-text-primary)] leading-relaxed">
                      {req.reason}
                    </p>

                    {safeEvidenceUrl && (
                      <a
                        href={safeEvidenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View Supporting Evidence</span>
                      </a>
                    )}

                    {req.review_note && (
                      <p className="text-[11px] text-[var(--color-text-secondary)] bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl px-3 py-2">
                        Admin Note: {req.review_note}
                      </p>
                    )}

                    {req.status === 'pending' && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                        <button
                          type="button"
                          disabled={processingId === req.id}
                          onClick={() => {
                            setReviewModalReq(req);
                            setReviewDecision('rejected');
                            setReviewNote('');
                          }}
                          className="min-h-[40px] px-3.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-xs font-bold"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={processingId === req.id}
                          onClick={() => {
                            setReviewModalReq(req);
                            setReviewDecision('approved');
                            setReviewNote('');
                          }}
                          className="min-h-[40px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5"
                        >
                          <BadgeCheck className="w-3.5 h-3.5" />
                          <span>Approve &amp; Verify</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: LEGACY PAGE APPLICATIONS (PRESERVED SEPARATELY FROM PUBLISHED PAGES) */}
      {section === 'applications' && (
        <div className="space-y-4">
          <div className="p-3 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]">
            Historical page application records are kept strictly separate from published Pages metrics above.
          </div>
          <div className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {(['pending', 'all', 'approved', 'rejected'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAppFilter(tab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors ${
                    appFilter === tab
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
                  }`}
                >
                  {tab} ({applications.filter((a) => (tab === 'all' ? true : a.status === tab)).length})
                </button>
              ))}
            </div>
          </div>

          {loadingApps ? (
            <div className="p-10 flex items-center justify-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
              <span>Loading applications...</span>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="p-10 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl space-y-2">
              <Building2 className="w-7 h-7 text-[var(--color-text-secondary)] mx-auto opacity-50" />
              <p className="text-xs text-[var(--color-text-secondary)]">No {appFilter} applications.</p>
            </div>
          ) : (
            filteredApps.map((app) => (
              <div
                key={app.id}
                className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-extrabold text-[var(--color-text-primary)]">
                      {app.name} ({app.category})
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Submitted {new Date(app.created_at).toLocaleDateString()} by{' '}
                      <strong>{app.applicant?.name || 'Student'}</strong>
                    </p>
                  </div>
                  <span className="text-xs font-bold capitalize flex items-center gap-1">
                    {app.status === 'approved' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    {app.status === 'rejected' && <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                    {app.status === 'pending' && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                    {app.status}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)]">{app.description}</p>
                <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">
                  {app.contact_email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" /> {app.contact_email}
                    </span>
                  )}
                  {app.contact_phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> {app.contact_phone}
                    </span>
                  )}
                  {app.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {app.location}
                    </span>
                  )}
                </div>
                {app.status === 'pending' && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                    <button
                      disabled={processingId === app.id}
                      onClick={() => handleReviewApp(app.id, 'rejected')}
                      className="px-3.5 py-2 rounded-xl border border-rose-500/30 text-rose-500 text-xs font-bold"
                    >
                      Reject
                    </button>
                    <button
                      disabled={processingId === app.id}
                      onClick={() => handleReviewApp(app.id, 'approved')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                    >
                      Approve
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal: Disable Page Reason */}
      {disableModalPage && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDisableModalPage(null)}
        >
          <form
            onSubmit={handleConfirmDisable}
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-extrabold text-rose-500">
              Disable {disableModalPage.name}?
            </h3>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">Reason</label>
              <input
                type="text"
                required
                value={disableReason}
                onChange={(e) => setDisableReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">
                Explanation (Shown to Page Owners)
              </label>
              <textarea
                rows={3}
                value={disableExplanation}
                onChange={(e) => setDisableExplanation(e.target.value)}
                placeholder="Explain what policy was violated..."
                className="w-full px-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDisableModalPage(null)}
                className="min-h-[40px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processingId === disableModalPage.id}
                className="min-h-[40px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Disable Page
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Review Page Verification Request */}
      {reviewModalReq && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setReviewModalReq(null)}
        >
          <form
            onSubmit={handleConfirmVerificationReview}
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
          >
            <div>
              <h3
                className={`text-base font-extrabold ${
                  reviewDecision === 'approved' ? 'text-emerald-500' : 'text-rose-500'
                }`}
              >
                {reviewDecision === 'approved'
                  ? `Verify ${reviewModalReq.official_name}?`
                  : `Reject Verification Request?`}
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                {reviewDecision === 'approved'
                  ? 'Approving grants the blue verified badge to this Page and notifies the Page team.'
                  : 'Rejecting closes this request and notifies the Page team with your optional note.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">
                Review Note (Optional)
              </label>
              <textarea
                rows={3}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={
                  reviewDecision === 'approved'
                    ? 'Verified official ABSU campus Page.'
                    : 'Explain what additional proof or details are needed...'
                }
                className="w-full px-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewModalReq(null)}
                className="min-h-[40px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processingId === reviewModalReq.id}
                className={`min-h-[40px] px-4 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 ${
                  reviewDecision === 'approved' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                {processingId === reviewModalReq.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>{reviewDecision === 'approved' ? 'Approve & Verify' : 'Reject Request'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
