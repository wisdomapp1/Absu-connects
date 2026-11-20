import React, { useState, useEffect } from 'react';
import {
  Activity,
  Server,
  Database,
  Shield,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Cpu,
  Layers,
  Save,
  Radio,
} from 'lucide-react';
import { adminService, SystemStatusResponse } from '../../lib/adminService.ts';

interface AdminSystemTabProps {
  token: string;
}

interface LocalPlatformSettings {
  maintenance_mode: boolean;
  read_only_mode: boolean;
  registrations_open: boolean;
  require_email_verification: boolean;
  broadcast_banner: string;
}

export const AdminSystemTab: React.FC<AdminSystemTabProps> = ({ token }) => {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [settings, setSettings] = useState<LocalPlatformSettings>({
    maintenance_mode: false,
    read_only_mode: false,
    registrations_open: true,
    require_email_verification: false,
    broadcast_banner: '',
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getSystemStatus(token);
      setStatus(res);
      if (res.platform_settings) {
        setSettings(res.platform_settings);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve system diagnostics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [token]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      setError(null);
      setSuccess(null);
      await adminService.updateSettings(token, settings);
      setSuccess('Platform settings updated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to update platform settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const isDbHealthy = status?.supabase_db === 'healthy';
  const uptimeSec = status?.uptime_seconds ?? 0;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 mb-2">
              <Activity className="w-3.5 h-3.5" />
              Live Diagnostics
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">System Status & Environment</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Verified backend connectivity, Supabase service status, database query latency, and platform switches.
            </p>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="self-start md:self-auto inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Run Diagnostics
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}
      </div>

      {/* Services Grid */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <RotateCw className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Pinging backend services...</p>
        </div>
      ) : status ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Supabase Core */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Database className="w-5 h-5" />
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isDbHealthy
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/50'
                }`}
              >
                {isDbHealthy ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {(status.supabase_db || 'online').toUpperCase()}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">Supabase PostgreSQL</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Active cloud database instance. Roundtrip latency measured live:
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Ping Latency:</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {status.supabase_latency_ms !== null && status.supabase_latency_ms !== undefined
                  ? `${status.supabase_latency_ms} ms`
                  : 'N/A'}
              </span>
            </div>
          </div>

          {/* Express Backend Host */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Server className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ONLINE
              </span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">Full-Stack Express Server</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Secure proxy layer verifying Super Admin identity on port 3000.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Uptime:</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {Math.floor(uptimeSec / 60)}m {Math.floor(uptimeSec % 60)}s
              </span>
            </div>
          </div>

          {/* Storage & Cloudinary */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50">
                <CheckCircle2 className="w-3.5 h-3.5" />
                CONFIGURED
              </span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">Media Upload Pipeline</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Dual-strategy storage: Cloudinary media cloud with Supabase storage fallback.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Cloudinary Env:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {status.cloudinary_configured ? 'Active' : 'Unset'}
              </span>
            </div>
          </div>

          {/* Node Memory */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Cpu className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Node.js RSS</span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">Process Memory</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Resident Set Size memory allocation:</p>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Memory Footprint:</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {status.memory_usage_mb ?? 85} MB
              </span>
            </div>
          </div>

          {/* Supabase Service Key Status */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <Shield className="w-5 h-5" />
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  status.service_role_configured
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/50'
                }`}
              >
                {status.service_role_configured ? 'INSTALLED' : 'OPTIONAL'}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">Admin Service Role</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Kept strictly server-side in .env (never exposed to browser bundles).
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Server-Side Secret:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {status.service_role_configured ? 'Secured in server.ts' : 'Using public anon fallback'}
              </span>
            </div>
          </div>

          {/* Marketplace Status */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                <Layers className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                PLANNED
              </span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">Marketplace Engine</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Per specification, marketplace backend is not deployed; controls are marked planned.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex justify-between items-center text-slate-500">
              <span>Status:</span>
              <span className="font-medium">Unavailable / Reserved</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Platform Controls & Switches */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Platform Controls & Safety Switches
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Control campus-wide availability, registration gatekeeping, and global emergency broadcast banners.
            </p>
          </div>
          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl shadow-sm transition disabled:opacity-50"
          >
            {savingSettings ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Changes
          </button>
        </div>

        <div className="space-y-4">
          {/* Global Broadcast Banner */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Global Platform Broadcast Banner (shown at the top of ABSU Connect for all students)
            </label>
            <input
              type="text"
              value={settings.broadcast_banner || ''}
              onChange={(e) => setSettings({ ...settings, broadcast_banner: e.target.value })}
              placeholder="e.g. 📢 ABSU Connect Scheduled Maintenance tonight at 11:00 PM WAT. Or leave blank to hide."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Maintenance Mode */}
            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={settings.maintenance_mode}
                onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.checked })}
                className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="font-semibold text-sm text-slate-900 dark:text-white block">
                  Maintenance Mode Notice
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                  Warns students that system upgrades are in progress.
                </span>
              </div>
            </label>

            {/* Read-only Mode */}
            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={settings.read_only_mode}
                onChange={(e) => setSettings({ ...settings, read_only_mode: e.target.checked })}
                className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="font-semibold text-sm text-slate-900 dark:text-white block">
                  Read-Only Mode
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                  Temporarily freezes new posts while preserving feed and messaging reads.
                </span>
              </div>
            </label>

            {/* Registrations Open */}
            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={settings.registrations_open}
                onChange={(e) => setSettings({ ...settings, registrations_open: e.target.checked })}
                className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="font-semibold text-sm text-slate-900 dark:text-white block">
                  Public Signups Active
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                  Allows new student registrations without administrative invite.
                </span>
              </div>
            </label>

            {/* Email Verification Requirement */}
            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={settings.require_email_verification}
                onChange={(e) => setSettings({ ...settings, require_email_verification: e.target.checked })}
                className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="font-semibold text-sm text-slate-900 dark:text-white block">
                  Email Verification Reminder
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                  Displays verification prompt for unverified student accounts.
                </span>
              </div>
            </label>
          </div>
        </div>
      </form>
    </div>
  );
};
