import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  LayoutDashboard,
  Users,
  Flag,
  FileText,
  Megaphone,
  Mail,
  ScrollText,
  Activity,
  ArrowLeft,
  LogOut,
  RotateCw,
  EyeOff,
} from 'lucide-react';
import { AdminOverviewTab } from './AdminOverviewTab.tsx';
import { AdminUsersTab } from './AdminUsersTab.tsx';
import { AdminReportsTab } from './AdminReportsTab.tsx';
import { AdminContentTab } from './AdminContentTab.tsx';
import { AdminAnonymousTab } from './AdminAnonymousTab.tsx';
import { AdminAnnouncementsTab } from './AdminAnnouncementsTab.tsx';
import { AdminInvitationsTab } from './AdminInvitationsTab.tsx';
import { AdminAuditTab } from './AdminAuditTab.tsx';
import { AdminSystemTab } from './AdminSystemTab.tsx';
import { AdminPagesTab } from './AdminPagesTab.tsx';
import {
  fetchAdminStats,
  fetchAdminSystemStatus,
  AdminStats,
  SystemStatusData,
} from '../../lib/adminService.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Building2 } from 'lucide-react';

export type AdminTab =
  | 'overview'
  | 'users'
  | 'pages'
  | 'reports'
  | 'content'
  | 'anonymous'
  | 'announcements'
  | 'invitations'
  | 'audit'
  | 'system';

interface AdminDashboardProps {
  token: string;
  adminEmail: string;
  onBackToApp: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  token,
  adminEmail,
  onBackToApp,
}) => {
  const { addToast, adminDbSynced } = useApp();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Overview metrics state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);

  const loadExecutiveData = useCallback(async () => {
    try {
      setLoadingOverview(true);
      const [statsRes, sysRes] = await Promise.all([
        fetchAdminStats(),
        fetchAdminSystemStatus(),
      ]);

      if (statsRes.success && statsRes.stats) {
        setStats(statsRes.stats);
      }
      if (sysRes.success && sysRes.status) {
        setSystemStatus(sysRes.status);
      }
    } catch {
      addToast('Could not refresh administrative telemetry', 'warning');
    } finally {
      setLoadingOverview(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadExecutiveData();
  }, [loadExecutiveData]);

  const navItems: { id: AdminTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'User Directory', icon: Users },
    { id: 'pages', label: 'Page Applications', icon: Building2 },
    { id: 'reports', label: 'Reports & Complaints', icon: Flag },
    { id: 'content', label: 'Content Moderation', icon: FileText },
    { id: 'anonymous', label: 'Anonymous Review', icon: EyeOff },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'invitations', label: 'Invitations', icon: Mail },
    { id: 'audit', label: 'Audit Trail', icon: ScrollText },
    { id: 'system', label: 'System & Controls', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Top Banner & Control Bar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Branding & Back Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={onBackToApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                title="Return to regular ABSU Connect social view"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to ABSU Connect</span>
                <span className="sm:hidden">Back</span>
              </button>

              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-sm shadow-emerald-500/20">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white">
                      ABSU CONNECT
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60">
                      Super Admin
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:block">
                    Full Authority Management Console
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Verified Super Admin Badge & Back shortcut */}
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-500 dark:text-slate-400">Authenticated:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                  {adminEmail}
                </span>
              </div>

              <button
                onClick={loadExecutiveData}
                disabled={loadingOverview}
                title="Refresh metrics"
                className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                <RotateCw className={`w-4 h-4 ${loadingOverview ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={onBackToApp}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit Console</span>
              </button>
            </div>
          </div>

          {/* Navigation Tab Bar (Desktop & Mobile Scrollable) */}
          <nav className="flex space-x-1 overflow-x-auto no-scrollbar py-2 border-t border-slate-100 dark:border-slate-800/60">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!adminDbSynced && (
          <div
            role="status"
            className="mb-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5"
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Database admin sync pending for {adminEmail}.</span>{' '}
              Your Super Admin account is active, but database-level actions (such as Page verification) require running the latest Super Admin sync SQL migration in Supabase.
            </div>
          </div>
        )}
        {activeTab === 'overview' && (
          <AdminOverviewTab
            stats={stats}
            systemStatus={systemStatus}
            loading={loadingOverview}
            onRefresh={loadExecutiveData}
            onNavigateTab={setActiveTab}
          />
        )}
        {activeTab === 'users' && <AdminUsersTab onShowToast={addToast} />}
        {activeTab === 'pages' && <AdminPagesTab onShowToast={addToast} />}
        {activeTab === 'reports' && <AdminReportsTab onShowToast={addToast} />}
        {activeTab === 'content' && <AdminContentTab onShowToast={addToast} />}
        {activeTab === 'anonymous' && <AdminAnonymousTab onShowToast={addToast} />}
        {activeTab === 'announcements' && <AdminAnnouncementsTab onShowToast={addToast} />}
        {activeTab === 'invitations' && <AdminInvitationsTab token={token} />}
        {activeTab === 'audit' && <AdminAuditTab token={token} />}
        {activeTab === 'system' && <AdminSystemTab token={token} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800 py-4 bg-white/50 dark:bg-slate-900/50 text-xs text-slate-500 dark:text-slate-400 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>ABSU Connect • Administrative Gateway</span>
          <span className="font-mono text-[11px] text-slate-400">
            Privileged session active for {adminEmail}
          </span>
        </div>
      </footer>
    </div>
  );
};
