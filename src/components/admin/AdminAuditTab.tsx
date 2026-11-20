import React, { useState, useEffect } from 'react';
import { FileText, Search, RotateCw, Shield, AlertCircle, CheckCircle2, User, Filter } from 'lucide-react';
import { adminService, AuditLogItem } from '../../lib/adminService';

interface AdminAuditTabProps {
  token: string;
}

export const AdminAuditTab: React.FC<AdminAuditTabProps> = ({ token }) => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getAuditLogs(token);
      if (res && res.success === false) {
        setError(res.error || 'Failed to fetch audit logs');
      } else {
        setLogs(res.logs || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [token]);

  const uniqueActions = ['ALL', ...Array.from(new Set(logs.map((l) => l.action)))];

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      searchTerm === '' ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.adminEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.targetId && log.targetId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesAction = selectedAction === 'ALL' || log.action === selectedAction;
    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 mb-2">
              <Shield className="w-3.5 h-3.5" />
              Append-Only Tamper-Evident Ledger
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Admin Activity & Audit Trail</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Comprehensive chronological log of every moderation action, suspension, warning, and configuration change.
            </p>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="self-start md:self-auto inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Filter / Search Bar */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by action, email, target ID, or reason..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              aria-label="Filter audit logs by action"
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              {uniqueActions.map((action) => (
                <option key={action} value={action}>
                  {action === 'ALL' ? 'All Action Types' : action.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            Recorded Events ({filteredLogs.length})
          </h3>
          <span className="text-xs text-slate-400">Read-only immutable records</span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <RotateCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading audit trail...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No matching audit events</p>
            <p className="text-xs text-slate-400 mt-1">Actions performed by the Super Admin will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50/80 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Target ID</th>
                  <th className="px-4 py-3">Reason / Details</th>
                  <th className="px-5 py-3 text-right">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px]">
                {filteredLogs.map((log) => {
                  const isSuccess = log.outcome === 'success' || !log.outcome;
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-semibold font-sans">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-sans text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[150px]">{log.adminEmail}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {log.targetId ? (
                          <span className="truncate max-w-[140px] block" title={log.targetId}>
                            {log.targetId}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-sans text-slate-600 dark:text-slate-300">
                        {log.details || '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-sans">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isSuccess
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50'
                              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/50'
                          }`}
                        >
                          {isSuccess ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {log.outcome || 'success'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
