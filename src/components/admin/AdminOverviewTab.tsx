import React from 'react';
import {
  Users,
  FileText,
  AlertTriangle,
  ShieldAlert,
  Activity,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Database,
  Radio,
  RefreshCw,
  Bell,
  MessageSquare,
  Sparkles,
  EyeOff,
} from 'lucide-react';
import type { AdminStats, SystemStatusData } from '../../lib/adminService.ts';

interface AdminOverviewTabProps {
  stats: AdminStats | null;
  systemStatus: SystemStatusData | null;
  loading: boolean;
  onRefresh: () => void;
  onNavigateTab: (tab: any) => void;
}

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({
  stats,
  systemStatus,
  loading,
  onRefresh,
  onNavigateTab,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)] animate-pulse" />
            <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-text-primary)]">
              ABSU Connect Campus Overview
            </h2>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Real-time live telemetry, community metrics, and moderation queue status.
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] transition-all flex items-center gap-1.5 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[var(--color-primary)]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Accounts */}
        <div
          onClick={() => onNavigateTab('users')}
          className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] transition-colors" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tabular-nums">
            {stats ? stats.totalAccounts : '—'}
          </div>
          <div className="text-[11px] font-bold text-[var(--color-text-secondary)] mt-0.5">
            Registered Students
          </div>
          <div className="mt-2 text-[10px] font-semibold text-[var(--color-success)] flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>+{stats?.newRegistrations7d ?? 0} past 7 days</span>
          </div>
        </div>

        {/* Total Posts */}
        <div
          onClick={() => onNavigateTab('content')}
          className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] transition-colors" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tabular-nums">
            {stats ? stats.totalPosts : '—'}
          </div>
          <div className="text-[11px] font-bold text-[var(--color-text-secondary)] mt-0.5">
            Feed Posts Published
          </div>
          <div className="mt-2 text-[10px] font-semibold text-[var(--color-text-secondary)]">
            {stats ? `${stats.totalComments} comments attached` : 'Counting comments...'}
          </div>
        </div>

        {/* Pending Reports */}
        <div
          onClick={() => onNavigateTab('reports')}
          className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-error)] transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-text-secondary)] group-hover:text-[var(--color-error)] transition-colors" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tabular-nums">
            {stats ? stats.reports.pending : '—'}
          </div>
          <div className="text-[11px] font-bold text-[var(--color-text-secondary)] mt-0.5">
            Pending Reports
          </div>
          <div className="mt-2 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {stats ? `${stats.reports.resolved} resolved to date` : 'Loading queue...'}
          </div>
        </div>

        {/* Restricted Accounts */}
        <div
          onClick={() => onNavigateTab('users')}
          className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-red-500 transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-text-secondary)] group-hover:text-red-500 transition-colors" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tabular-nums">
            {stats ? stats.restrictions.suspended + stats.restrictions.disabled : '—'}
          </div>
          <div className="text-[11px] font-bold text-[var(--color-text-secondary)] mt-0.5">
            Restricted Accounts
          </div>
          <div className="mt-2 text-[10px] font-semibold text-[var(--color-text-secondary)]">
            {stats ? `${stats.restrictions.suspended} suspended · ${stats.restrictions.disabled} disabled` : '—'}
          </div>
        </div>
      </div>

      {/* Quick Action Hub & System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Administrative Actions */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Super Admin Quick Actions</span>
            </h3>
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
              Authorized as Super Admin
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => onNavigateTab('announcements')}
              className="p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-left transition-all group flex items-start gap-3"
            >
              <div className="p-2 rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)] shrink-0">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
                  Post Campus Announcement
                </h4>
                <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                  Publish an official notice to the student feed or emergency broadcast banner.
                </p>
              </div>
            </button>

            <button
              onClick={() => onNavigateTab('reports')}
              className="p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-amber-500 text-left transition-all group flex items-start gap-3"
            >
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[var(--color-text-primary)] group-hover:text-amber-600 transition-colors">
                  Review Reports ({stats?.reports.pending ?? 0})
                </h4>
                <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                  Inspect student complaints regarding harassment, scams, or inappropriate content.
                </p>
              </div>
            </button>

            <button
              onClick={() => onNavigateTab('users')}
              className="p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-purple-500 text-left transition-all group flex items-start gap-3"
            >
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[var(--color-text-primary)] group-hover:text-purple-600 transition-colors">
                  Manage Student Directory
                </h4>
                <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                  Search student profiles, apply warnings, suspensions, or password resets.
                </p>
              </div>
            </button>

            <button
              onClick={() => onNavigateTab('anonymous')}
              className="p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-purple-500 text-left transition-all group flex items-start gap-3"
            >
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
                <EyeOff className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-[var(--color-text-primary)] group-hover:text-purple-600 transition-colors">
                    Anonymous Posts Review
                  </h4>
                  {(stats?.pendingAnonymousCount ?? 0) > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400">
                      {stats?.pendingAnonymousCount}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                  Review student confessions & approve all pending anonymous submissions.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Live System Status Widget */}
        <div className="p-5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--color-primary)]" />
                <span>Backend Telemetry</span>
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--color-success)]/10 text-[var(--color-success)]">
                Online
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-text-secondary)] flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  <span>Supabase Database</span>
                </span>
                <span className="font-bold text-[var(--color-text-primary)] tabular-nums">
                  {systemStatus?.database.latencyMs ? `${systemStatus.database.latencyMs}ms` : 'Connected'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-text-secondary)]">Storage Buckets</span>
                <span className="font-bold text-[var(--color-success)] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>post-media, chat</span>
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-text-secondary)]">Uptime</span>
                <span className="font-bold text-[var(--color-text-primary)] tabular-nums">
                  {systemStatus ? `${Math.floor(systemStatus.uptimeSeconds / 60)} min` : 'Live'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-[var(--color-text-secondary)]">Audit Trail</span>
                <span className="font-bold text-[var(--color-primary)] tabular-nums">
                  {stats?.auditLogsCount ?? 0} events logged
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('system')}
            className="w-full mt-4 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-xs font-bold text-[var(--color-text-primary)] text-center transition-all"
          >
            Full System Diagnostics &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
