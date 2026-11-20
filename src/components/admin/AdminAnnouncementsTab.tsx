import React, { useState, useEffect } from 'react';
import {
  Radio,
  Send,
  Trash2,
  Pin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Bell,
  Sparkles,
} from 'lucide-react';
import {
  fetchAdminAnnouncements,
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  AdminAnnouncement,
} from '../../lib/adminService.ts';

interface AdminAnnouncementsTabProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const AdminAnnouncementsTab: React.FC<AdminAnnouncementsTabProps> = ({ onShowToast }) => {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isBroadcast, setIsBroadcast] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [publishToFeed, setPublishToFeed] = useState(true);

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminAnnouncements();
      if (res.success && res.announcements) {
        setAnnouncements(res.announcements);
      }
    } catch {
      onShowToast('Could not load announcements.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setSubmitting(true);
    try {
      const res = await createAdminAnnouncement({
        title: title.trim(),
        body: body.trim(),
        isBroadcast,
        isPinned,
        publishToFeed,
      });

      if (res.success) {
        onShowToast('Official announcement published!', 'success');
        setTitle('');
        setBody('');
        setIsBroadcast(false);
        setIsPinned(false);
        loadAnnouncements();
      } else {
        onShowToast(res.error || 'Failed to publish announcement.', 'warning');
      }
    } catch {
      onShowToast('Error publishing announcement.', 'warning');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteAdminAnnouncement(id);
      if (res.success) {
        onShowToast('Announcement removed.', 'success');
        setConfirmDeleteId(null);
        loadAnnouncements();
      } else {
        onShowToast(res.error || 'Failed to delete announcement.', 'warning');
      }
    } catch {
      onShowToast('Error deleting announcement.', 'warning');
    }
  };

  return (
    <div className="space-y-6">
      {/* Publisher Card */}
      <div className="p-5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-[var(--color-primary)]" />
            <h3 className="text-sm sm:text-base font-extrabold text-[var(--color-text-primary)]">
              Publish Official ABSU Connect Announcement
            </h3>
          </div>
          <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">
            Official Broadcast
          </span>
        </div>

        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-[var(--color-text-primary)] mb-1">
              Announcement Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2026/2027 Harmattan Semester Exam Schedule & Clearance"
              required
              className="w-full px-3.5 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl font-bold text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block font-bold text-[var(--color-text-primary)] mb-1">
              Notice Content & Directive <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Detailed campus directive, date deadlines, faculty notices, or instructions..."
              rows={4}
              required
              className="w-full px-3.5 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] resize-none"
            />
          </div>

          {/* Options Checkboxes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isBroadcast}
                onChange={(e) => setIsBroadcast(e.target.checked)}
                className="mt-0.5 rounded text-[var(--color-primary)] focus:ring-0"
              />
              <div>
                <span className="font-bold text-[var(--color-text-primary)] block">Top Alert Banner</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">Broadcasts persistent bar across student screens</span>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="mt-0.5 rounded text-[var(--color-primary)] focus:ring-0"
              />
              <div>
                <span className="font-bold text-[var(--color-text-primary)] block">Pin Announcement</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">Featured at the top of campus updates</span>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={publishToFeed}
                onChange={(e) => setPublishToFeed(e.target.checked)}
                className="mt-0.5 rounded text-[var(--color-primary)] focus:ring-0"
              />
              <div>
                <span className="font-bold text-[var(--color-text-primary)] block">Publish to Feed</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">Inserts official post in campus social feed</span>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={submitting || !title.trim() || !body.trim()}
              className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-xs active:scale-95"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Broadcast Announcement</span>
            </button>
          </div>
        </form>
      </div>

      {/* Active Announcements List */}
      <div className="rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h4 className="text-xs font-extrabold text-[var(--color-text-primary)]">
            Active Published Announcements ({announcements.length})
          </h4>
          <button
            onClick={loadAnnouncements}
            disabled={loading}
            className="p-1 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {announcements.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--color-text-secondary)]">
            No official campus announcements currently published.
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {announcements.map((a) => (
              <div
                key={a.id}
                className="p-4 hover:bg-[var(--color-bg-main)]/50 transition-colors flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-[var(--color-text-primary)]">
                      {a.title}
                    </span>
                    {a.isBroadcast && (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        Top Banner
                      </span>
                    )}
                    {a.isPinned && (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20 flex items-center gap-0.5">
                        <Pin className="w-2.5 h-2.5" />
                        <span>Pinned</span>
                      </span>
                    )}
                    <span className="text-[11px] text-[var(--color-text-secondary)]">
                      · {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed line-clamp-3">
                    {a.body}
                  </p>
                </div>

                {confirmDeleteId === a.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] shadow-xs"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(a.id)}
                    className="p-1.5 rounded-xl border border-red-500/30 text-red-600 hover:bg-red-500/10 transition-colors shrink-0"
                    title="Delete Announcement"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
