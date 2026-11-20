import React, { useState, useEffect } from 'react';
import type { PageApplication } from '../../types/pages.ts';
import { fetchAllPageApplications, reviewPageApplication } from '../../lib/pageService.ts';
import { Building2, CheckCircle2, XCircle, Clock, ShieldCheck, Mail, Phone, MapPin, Loader2 } from 'lucide-react';
import { Avatar } from '../common/Avatar.tsx';

import { supabase } from '../../lib/supabase.ts';

interface AdminPagesTabProps {
  onShowToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

export const AdminPagesTab: React.FC<AdminPagesTabProps> = ({ onShowToast }) => {
  const [applications, setApplications] = useState<PageApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchAllPageApplications();
    setApplications(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    // Realtime subscription for instant new page applications & reviews
    const channel = supabase
      .channel('admin_page_applications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'page_applications' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleReview = async (appId: string, decision: 'approved' | 'rejected') => {
    setProcessingId(appId);
    const res = await reviewPageApplication(appId, decision);
    setProcessingId(null);

    if (res.success) {
      onShowToast(
        decision === 'approved' ? 'Page application approved and published!' : 'Page application rejected.',
        'success'
      );
      loadData();
    } else {
      onShowToast(res.error || 'Review action failed', 'warning');
    }
  };

  const filteredApps = applications.filter((a) => (filter === 'all' ? true : a.status === filter));

  return (
    <div className="space-y-4">
      {/* Top filter bar */}
      <div className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(['pending', 'all', 'approved', 'rejected'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors ${
                filter === tab
                  ? 'bg-[var(--color-primary)] text-white shadow-xs'
                  : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)]'
              }`}
            >
              {tab} ({applications.filter((a) => (tab === 'all' ? true : a.status === tab)).length})
            </button>
          ))}
        </div>

        <button
          onClick={loadData}
          className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
        >
          Refresh
        </button>
      </div>

      {/* Applications list */}
      {loading ? (
        <div className="p-12 text-center text-xs text-[var(--color-text-secondary)] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
          <span>Loading page applications...</span>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="p-12 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl space-y-2">
          <Building2 className="w-8 h-8 text-[var(--color-text-secondary)] mx-auto opacity-50" />
          <h4 className="text-sm font-bold text-[var(--color-text-primary)]">No {filter} applications</h4>
          <p className="text-xs text-[var(--color-text-secondary)]">
            When students apply to create an official campus page, their requests will appear here for review.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredApps.map((app) => (
            <div
              key={app.id}
              className="p-5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center font-bold text-base overflow-hidden border border-[var(--color-border)] shrink-0">
                    {app.avatar_path ? (
                      <img src={app.avatar_path} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Building2 className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-extrabold text-[var(--color-text-primary)]">{app.name}</h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
                        {app.category}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                      Submitted {new Date(app.created_at).toLocaleDateString()} by{' '}
                      <strong>{app.applicant?.name || 'Student'}</strong>
                      {app.applicant?.department ? ` (${app.applicant.department})` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold capitalize flex items-center gap-1.5 ${
                      app.status === 'approved'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : app.status === 'rejected'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {app.status === 'approved' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {app.status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                    {app.status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                    <span>{app.status}</span>
                  </span>
                </div>
              </div>

              {/* Bio & Purpose */}
              <div className="space-y-2 text-xs bg-[var(--color-bg-main)] p-3.5 rounded-xl border border-[var(--color-border)]">
                <div>
                  <span className="font-bold text-[var(--color-text-primary)] block mb-0.5">About Page:</span>
                  <p className="text-[var(--color-text-secondary)] leading-relaxed">{app.description}</p>
                </div>
                <div className="pt-2 border-t border-[var(--color-border)]">
                  <span className="font-bold text-[var(--color-text-primary)] block mb-0.5">Verification Note & Purpose:</span>
                  <p className="text-[var(--color-text-secondary)] leading-relaxed">{app.why_create}</p>
                </div>
              </div>

              {/* Contact info bar */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-text-secondary)]">
                {app.contact_email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    <span>{app.contact_email}</span>
                  </div>
                )}
                {app.contact_phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    <span>{app.contact_phone}</span>
                  </div>
                )}
                {app.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    <span>{app.location}</span>
                  </div>
                )}
              </div>

              {/* Action buttons if pending */}
              {app.status === 'pending' && (
                <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
                  <button
                    disabled={processingId === app.id}
                    onClick={() => handleReview(app.id, 'rejected')}
                    className="px-4 py-2 rounded-xl border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-500/10 transition-colors"
                  >
                    Reject Application
                  </button>
                  <button
                    disabled={processingId === app.id}
                    onClick={() => handleReview(app.id, 'approved')}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    {processingId === app.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Approve & Create Page</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
