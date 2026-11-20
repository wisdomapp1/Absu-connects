import React, { useState, useEffect } from 'react';
import { Mail, Send, RotateCw, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { adminService, InvitationItem } from '../../lib/adminService';

interface AdminInvitationsTabProps {
  token: string;
}

export const AdminInvitationsTab: React.FC<AdminInvitationsTabProps> = ({ token }) => {
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite form
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getInvitations(token);
      if (res && res.success === false) {
        setError(res.error || 'Failed to fetch invitations');
      } else {
        setInvitations(res.invitations || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch invitations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, [token]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid email address');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      const res = await adminService.sendInvitation(token, email.trim());
      if (res && res.success === false) {
        setError(res.error || 'Failed to dispatch invitation');
        return;
      }
      setSuccess(res.message || `Invitation sent to ${email}`);
      setEmail('');
      fetchInvitations();
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch invitation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (invEmail: string, id: string) => {
    try {
      setActioningId(id);
      setError(null);
      setSuccess(null);
      const res = await adminService.sendInvitation(token, invEmail);
      if (res && res.success === false) {
        setError(res.error || 'Failed to resend invitation');
        return;
      }
      setSuccess(res.message || `Invitation resent to ${invEmail}`);
      fetchInvitations();
    } catch (err: any) {
      setError(err.message || 'Failed to resend invitation');
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              Auth Admin Access
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Invitations & Account Access</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Invite students, staff, or faculty by email and monitor pending verification state.
            </p>
          </div>
          <button
            onClick={fetchInvitations}
            disabled={loading}
            className="self-start md:self-auto inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Feedback alerts */}
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

        {/* Send invite form */}
        <form onSubmit={handleSendInvite} className="mt-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Send Official Invitation
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@abiastateuniversity.edu.ng or gmail.com"
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Dispatch Invite
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            The recipient will receive an onboarding confirmation email or standard ABSU Connect link.
          </p>
        </form>
      </div>

      {/* Invitations Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            Dispatch Log & Recent Invitations ({invitations.length})
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Recorded in backend audit registry
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <RotateCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading invitations log...</p>
          </div>
        ) : invitations.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No invitations sent yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Send your first invite above to welcome staff or verified department admins.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50/80 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3">Invited Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sent At</th>
                  <th className="px-4 py-3">Invited By</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{inv.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-900/50">
                        <Clock className="w-3 h-3" />
                        {inv.status || 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                      {new Date(inv.invitedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                      {inv.invitedBy || 'wisdomchinonso82@gmail.com'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleResend(inv.email, inv.id)}
                        disabled={actioningId === inv.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition disabled:opacity-50"
                      >
                        <RotateCw className={`w-3 h-3 ${actioningId === inv.id ? 'animate-spin' : ''}`} />
                        Resend
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
