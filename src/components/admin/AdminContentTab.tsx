import React, { useState, useEffect } from 'react';
import {
  Search,
  FileText,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  Video,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  X,
  ShieldAlert,
} from 'lucide-react';
import {
  fetchAdminPosts,
  moderateAdminPost,
  AdminPostItem,
} from '../../lib/adminService.ts';

interface AdminContentTabProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const AdminContentTab: React.FC<AdminContentTabProps> = ({ onShowToast }) => {
  const [posts, setPosts] = useState<AdminPostItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [moderateModal, setModerateModal] = useState<{
    postId: string;
    action: 'hide' | 'restore' | 'delete';
    reason: string;
  } | null>(null);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminPosts(search.trim() || undefined);
      if (res.success && res.posts) {
        setPosts(res.posts);
      } else {
        onShowToast(res.error || 'Failed to fetch posts.', 'warning');
      }
    } catch {
      onShowToast('Could not load campus posts.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPosts();
  };

  const handleModerate = (postId: string, action: 'hide' | 'restore' | 'delete') => {
    setModerateModal({
      postId,
      action,
      reason: action === 'restore' ? 'Content verified by admin' : '',
    });
  };

  const confirmModerate = async () => {
    if (!moderateModal) return;
    const { postId, action, reason } = moderateModal;

    setActionInProgress(postId);
    try {
      const res = await moderateAdminPost(postId, action, reason.trim() || `Admin ${action} action`);
      if (res.success) {
        onShowToast(res.message || `Post ${action}d successfully.`, 'success');
        setModerateModal(null);
        loadPosts();
      } else {
        onShowToast(res.error || `Failed to ${action} post.`, 'warning');
      }
    } catch {
      onShowToast(`Error attempting to ${action} post.`, 'warning');
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Search Bar */}
      <div className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campus posts by caption or keyword..."
            className="w-full pl-9 pr-20 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-[var(--color-primary)] text-white text-[11px] font-bold"
          >
            Search
          </button>
        </form>

        <button
          onClick={loadPosts}
          disabled={loading}
          className="px-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center justify-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[var(--color-primary)]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Posts List */}
      <div className="rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] overflow-hidden shadow-xs">
        {loading && posts.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--color-text-secondary)]">
            Loading feed posts...
          </div>
        ) : posts.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FileText className="w-8 h-8 text-[var(--color-text-secondary)] mx-auto opacity-50" />
            <h4 className="text-sm font-bold text-[var(--color-text-primary)]">No Posts Found</h4>
            <p className="text-xs text-[var(--color-text-secondary)]">
              No campus posts matching your criteria.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {posts.map((post) => {
              const isHidden = post.isHidden || post.visibility === 'hidden';

              return (
                <div
                  key={post.id}
                  className="p-4 hover:bg-[var(--color-bg-main)]/50 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4 text-xs"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    {/* Author & Status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-[var(--color-text-primary)]">
                        {post.author.name}
                      </span>
                      <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                        {post.author.handle}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-secondary)]">
                        · {new Date(post.createdAt).toLocaleDateString()}
                      </span>

                      {isHidden ? (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
                          Hidden
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20">
                          Public
                        </span>
                      )}
                    </div>

                    {/* Body */}
                    <p className="text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed line-clamp-4">
                      {post.body}
                    </p>

                    {/* Media Attachments Preview */}
                    {post.media && post.media.length > 0 && (
                      <div className="flex items-center gap-2 pt-1 overflow-x-auto">
                        {post.media.map((m, idx) => (
                          <div
                            key={m.id || idx}
                            className="w-16 h-16 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] overflow-hidden shrink-0 relative flex items-center justify-center"
                          >
                            {m.kind === 'video' ? (
                              <div className="w-full h-full bg-black/80 flex items-center justify-center text-white">
                                <Video className="w-5 h-5 text-white/80" />
                              </div>
                            ) : m.secure_url ? (
                              <img
                                src={m.secure_url}
                                alt="Attachment"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-[var(--color-text-secondary)]" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    {isHidden ? (
                      <button
                        onClick={() => handleModerate(post.id, 'restore')}
                        disabled={actionInProgress === post.id}
                        className="px-3 py-1.5 rounded-xl border border-[var(--color-success)] text-[var(--color-success)] hover:bg-[var(--color-success)]/10 font-bold transition-all flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleModerate(post.id, 'hide')}
                        disabled={actionInProgress === post.id}
                        className="px-3 py-1.5 rounded-xl border border-[var(--color-border)] hover:border-amber-500 text-[var(--color-text-secondary)] hover:text-amber-600 font-bold transition-all flex items-center gap-1"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleModerate(post.id, 'delete')}
                      disabled={actionInProgress === post.id}
                      className="p-1.5 rounded-xl border border-red-500/30 text-red-600 hover:bg-red-500/10 transition-colors"
                      title="Permanently Delete Post"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Post Moderation Modal */}
      {moderateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setModerateModal(null)}
        >
          <div
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[var(--color-primary)]" />
                <h3 className="font-extrabold text-sm sm:text-base text-[var(--color-text-primary)] capitalize">
                  {moderateModal.action === 'delete'
                    ? 'Delete Post Permanently'
                    : moderateModal.action === 'hide'
                    ? 'Hide Post from Feed'
                    : 'Restore Post Visibility'}
                </h3>
              </div>
              <button
                onClick={() => setModerateModal(null)}
                className="p-1 rounded-lg hover:bg-[var(--color-bg-main)] text-[var(--color-text-secondary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)]">
              {moderateModal.action === 'delete'
                ? 'This action will permanently delete the post and remove all its attachments and comments.'
                : moderateModal.action === 'hide'
                ? 'This post will immediately disappear from the campus feed and student timelines.'
                : 'This post will become visible again on the campus feed and user profile.'}
            </p>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Moderation Reason / Audit Note
              </label>
              <textarea
                value={moderateModal.reason}
                onChange={(e) =>
                  setModerateModal({ ...moderateModal, reason: e.target.value })
                }
                placeholder="Specify policy violation, student report reference, or reason..."
                rows={3}
                className="w-full p-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <button
                onClick={() => setModerateModal(null)}
                disabled={Boolean(actionInProgress)}
                className="px-3.5 py-2 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
              >
                Cancel
              </button>
              <button
                onClick={confirmModerate}
                disabled={Boolean(actionInProgress)}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-all active:scale-95 ${
                  moderateModal.action === 'delete'
                    ? 'bg-red-600 hover:bg-red-500'
                    : moderateModal.action === 'hide'
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {actionInProgress === moderateModal.postId
                  ? 'Processing...'
                  : moderateModal.action === 'delete'
                  ? 'Confirm Delete'
                  : moderateModal.action === 'hide'
                  ? 'Hide Post'
                  : 'Restore Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
