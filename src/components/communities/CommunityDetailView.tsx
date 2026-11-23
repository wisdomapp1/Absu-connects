import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  fetchCommunityById,
  fetchCommunityMembers,
  fetchCommunityPosts,
  createCommunityPost,
  joinCommunity,
  leaveCommunity,
  manageMembershipRequest,
  togglePinCommunityPost,
  deleteCommunityPost,
  updateMemberRole,
  removeMember,
} from '../../lib/communityService.ts';
import type { Community, CommunityMember } from '../../types/communities.ts';
import type { Post, AttachedMediaItem } from '../../types/index.ts';
import {
  safeReadAndPrepareImage,
  safeReadAndPrepareVideo,
  categorizeMediaError,
  type MediaRecoveryState,
} from '../../lib/mediaRecovery.ts';
import { MediaRecoveryBanner } from '../common/MediaRecoveryBanner.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { LinkifiedText } from '../common/LinkifiedText.tsx';
import { PostCard } from '../home/PostCard.tsx';
import {
  ArrowLeft,
  Users,
  ShieldCheck,
  Lock,
  Globe,
  MapPin,
  Pin,
  Trash2,
  Send,
  Image as ImageIcon,
  Check,
  X,
  Loader2,
  UserCheck,
  UserMinus,
} from 'lucide-react';

interface CommunityDetailViewProps {
  communityId: string;
  onBack?: () => void;
}

export const CommunityDetailView: React.FC<CommunityDetailViewProps> = ({
  communityId,
  onBack,
}) => {
  const { goBack, currentUser, addToast, navigateTo } = useApp();
  const { user } = useAuth();
  const userId = user?.id || currentUser?.id;

  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feed' | 'members' | 'about'>('feed');
  const [joinLoading, setJoinLoading] = useState(false);

  // Composer inside community
  const [postText, setPostText] = useState('');
  const [attachments, setAttachments] = useState<AttachedMediaItem[]>([]);
  const [posting, setPosting] = useState(false);
  const [mediaRecovery, setMediaRecovery] = useState<MediaRecoveryState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const [comm, memList, postList] = await Promise.all([
        fetchCommunityById(communityId, userId),
        fetchCommunityMembers(communityId),
        fetchCommunityPosts(communityId, userId),
      ]);
      setCommunity(comm);
      setMembers(memList);
      setPosts(postList);
    } finally {
      setLoading(false);
    }
  }, [communityId, userId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const isManager = Boolean(
    community &&
      (community.creatorId === userId ||
        community.userRole === 'owner' ||
        community.userRole === 'admin' ||
        community.userRole === 'moderator')
  );
  const isOwner = Boolean(community && (community.creatorId === userId || community.userRole === 'owner'));

  const handleJoinOrLeave = async () => {
    if (!community || !userId || joinLoading) return;
    setJoinLoading(true);
    try {
      if (community.isMember || community.membershipStatus === 'pending') {
        const res = await leaveCommunity(community.id, userId);
        if (res.success) {
          addToast(`Left "${community.name}".`, 'info');
          await loadAll();
        } else {
          addToast(res.error || 'Could not leave community.', 'warning');
        }
      } else {
        const res = await joinCommunity(community.id, userId);
        if (res.success) {
          addToast(
            res.status === 'pending'
              ? `Join request sent to "${community.name}".`
              : `Joined "${community.name}"!`,
            'success'
          );
          await loadAll();
        } else {
          addToast(res.error || 'Could not join community.', 'warning');
        }
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const handleSelectAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, 4 - attachments.length);
    if (remainingSlots <= 0) {
      addToast('Maximum 4 photos or videos allowed per community post.', 'warning');
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      addToast(`Only ${remainingSlots} more media item(s) can be added (4 max per post).`, 'warning');
    }

    const added: AttachedMediaItem[] = [];
    let rejectedRecovery: MediaRecoveryState | null = null;

    for (const file of filesToProcess) {
      const isVideo =
        file.type.startsWith('video/') ||
        Boolean(file.name.match(/\.(mp4|webm|mov|m4v|ogg)$/i));
      if (isVideo) {
        const preparedVid = await safeReadAndPrepareVideo(file, {
          maxBytes: 50 * 1024 * 1024,
          maxDurationSeconds: 60,
        });
        if (!preparedVid.ok || !preparedVid.file || !preparedVid.previewUrl) {
          rejectedRecovery = preparedVid.recovery || null;
          if (preparedVid.recovery?.message) {
            addToast(preparedVid.recovery.message, 'warning');
          }
          continue;
        }
        const dur = preparedVid.duration ?? 60;
        added.push({
          id: `catt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          file: preparedVid.file,
          buffer: preparedVid.buffer,
          previewUrl: preparedVid.previewUrl,
          type: 'video',
          name: preparedVid.file.name,
          duration: dur,
          videoSettings: {
            startTime: 0,
            endTime: Math.min(60, dur),
            duration: dur,
            isMuted: false,
            aspectRatio: 'original',
          },
        });
        continue;
      }

      const preparedImg = await safeReadAndPrepareImage(file);
      if (!preparedImg.ok || !preparedImg.file || !preparedImg.previewUrl) {
        rejectedRecovery = preparedImg.recovery || null;
        if (preparedImg.recovery?.message) {
          addToast(preparedImg.recovery.message, 'warning');
        }
        continue;
      }
      added.push({
        id: `catt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        file: preparedImg.file,
        buffer: preparedImg.buffer,
        previewUrl: preparedImg.previewUrl,
        type: 'image',
        name: preparedImg.file.name,
      });
    }

    if (added.length > 0) {
      setAttachments((prev) => [...prev, ...added].slice(0, 4));
      setMediaRecovery(null);
    } else if (rejectedRecovery) {
      setMediaRecovery(rejectedRecovery);
    }
  };

  const publishCommunityPostAttempt = async () => {
    if (!postText.trim() || !userId || !community || posting) return;

    setMediaRecovery(null);
    setPosting(true);
    try {
      const res = await createCommunityPost(community.id, userId, postText.trim(), attachments);
      if (res.success) {
        for (const a of attachments) {
          if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl);
        }
        setPostText('');
        setAttachments([]);
        addToast('Posted to community!', 'success');
        const updatedPosts = await fetchCommunityPosts(community.id, userId);
        setPosts(updatedPosts);
      } else {
        const errMsg = res.error || 'Could not publish community post.';
        setMediaRecovery(categorizeMediaError(new Error(errMsg), { phase: 'upload' }));
        addToast(errMsg, 'warning');
      }
    } catch (err) {
      setMediaRecovery(categorizeMediaError(err, { phase: 'upload' }));
    } finally {
      setPosting(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    await publishCommunityPostAttempt();
  };

  if (loading && !community) {
    return (
      <div className="p-10 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex flex-col gap-4 pb-12">
        <button
          type="button"
          onClick={onBack || goBack}
          className="self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-8 text-center">
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">Community not found</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            This community may have been archived or removed.
          </p>
        </div>
      </div>
    );
  }

  const pendingMembers = members.filter((m) => m.membershipStatus === 'pending');
  const activeMembers = members.filter((m) => m.membershipStatus !== 'pending' && m.membershipStatus !== 'rejected');

  return (
    <div className="flex flex-col gap-4 pb-12">
      <button
        type="button"
        onClick={onBack || goBack}
        className="self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Communities</span>
      </button>

      {/* Banner & Community Header */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm">
        <div className="h-32 sm:h-44 w-full bg-slate-900 relative">
          <img
            src={
              community.coverUrl ||
              'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&auto=format&fit=crop&q=80'
            }
            alt={community.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
        </div>

        <div className="px-4 sm:px-6 pb-5 pt-0 relative">
          <div className="-mt-10 mb-3 flex items-end justify-between gap-3 flex-wrap">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[var(--color-bg-card)] p-1 border-2 border-[var(--color-bg-card)] shadow-md">
              <img
                src={
                  community.imageUrl ||
                  `https://api.dicebear.com/7.x/identicon/svg?seed=${community.id}&backgroundColor=4f46e5`
                }
                alt={community.name}
                className="w-full h-full object-cover rounded-xl"
              />
            </div>

            {!isOwner && (
              <button
                type="button"
                onClick={handleJoinOrLeave}
                disabled={joinLoading}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 ${
                  community.isMember
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : community.membershipStatus === 'pending'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-xs'
                }`}
              >
                {joinLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : community.isMember ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Joined · Leave</span>
                  </>
                ) : community.membershipStatus === 'pending' ? (
                  <span>Pending Approval</span>
                ) : (
                  <span>Join Community</span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
              {community.name}
            </h1>
            {community.isVerified && (
              <ShieldCheck className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)] mt-1">
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-primary)]">
              {community.privacy === 'private' ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Globe className="w-3.5 h-3.5" />
              )}
              {community.privacy === 'private' ? 'Private Group' : 'Public Group'}
            </span>
            <span>·</span>
            <span>{community.category}</span>
            {community.location && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {community.location}
                </span>
              </>
            )}
            <span>·</span>
            <span className="inline-flex items-center gap-1 font-bold text-[var(--color-text-primary)]">
              <Users className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              {community.membersCount} members
            </span>
          </div>

          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-3 leading-relaxed whitespace-pre-line">
            <LinkifiedText text={community.description} />
          </p>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex border-t border-[var(--color-border)] bg-[var(--color-bg-main)] px-4">
          {[
            { id: 'feed' as const, label: `Feed (${posts.length})` },
            { id: 'members' as const, label: `Members (${activeMembers.length})` },
            { id: 'about' as const, label: 'About & Rules' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* FEED TAB */}
      {activeTab === 'feed' && (
        <div className="flex flex-col gap-4">
          {(community.isMember || isManager) && (
            <form
              onSubmit={handleCreatePost}
              className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm flex flex-col gap-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v"
                onChange={handleSelectAttachment}
                className="hidden"
              />
              {mediaRecovery && (
                <MediaRecoveryBanner
                  recovery={mediaRecovery}
                  onChooseAgain={() => fileInputRef.current?.click()}
                  onRetryUpload={
                    postText.trim().length > 0 && !posting ? publishCommunityPostAttempt : undefined
                  }
                  onDismiss={() => setMediaRecovery(null)}
                />
              )}
              <textarea
                rows={3}
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder={`Share an update, note, or discussion in ${community.name}...`}
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck={true}
                className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl p-3 text-xs sm:text-sm text-[var(--color-text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              {attachments.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {attachments.map((att) => (
                    <div key={att.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-[var(--color-border)] shrink-0">
                      {att.type === 'video' ? (
                        <video src={att.previewUrl} muted className="w-full h-full object-cover bg-black" />
                      ) : (
                        <img src={att.previewUrl} alt={att.name} className="w-full h-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (att.previewUrl.startsWith('blob:')) URL.revokeObjectURL(att.previewUrl);
                          setAttachments((prev) => prev.filter((p) => p.id !== att.id));
                        }}
                        className="absolute top-1 right-1 p-0.5 rounded-full bg-black/75 text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= 4}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ImageIcon className="w-4 h-4 text-emerald-500" />
                  <span>Photo / Video ({attachments.length}/4)</span>
                </button>
                <button
                  type="submit"
                  disabled={posting || !postText.trim()}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{posting ? 'Posting...' : 'Post'}</span>
                </button>
              </div>
            </form>
          )}

          {posts.length === 0 ? (
            <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl">
              <p className="text-sm font-bold text-[var(--color-text-primary)]">No community posts yet</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                Join this group and start the conversation!
              </p>
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="relative">
                {post.isPinned && (
                  <div className="mb-1 px-2 text-[11px] font-bold text-[var(--color-primary)] flex items-center gap-1">
                    <Pin className="w-3 h-3" />
                    <span>Pinned by Community Moderator</span>
                  </div>
                )}
                <PostCard post={post} />
                {(isManager || post.author.id === userId) && (
                  <div className="flex items-center justify-end gap-2 mt-1.5 px-1">
                    {isManager && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await togglePinCommunityPost(
                            community.id,
                            post.id,
                            Boolean(post.isPinned)
                          );
                          if (res.success) {
                            addToast(post.isPinned ? 'Unpinned post.' : 'Pinned post!', 'info');
                            setPosts(await fetchCommunityPosts(community.id, userId));
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] flex items-center gap-1"
                      >
                        <Pin className="w-3 h-3" />
                        <span>{post.isPinned ? 'Unpin' : 'Pin'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!userId) return;
                        const res = await deleteCommunityPost(community.id, post.id, userId);
                        if (res.success) {
                          addToast('Post removed.', 'info');
                          setPosts((prev) => prev.filter((p) => p.id !== post.id));
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[11px] font-semibold text-rose-500 hover:bg-rose-500/10 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
        <div className="flex flex-col gap-3">
          {isManager && pendingMembers.length > 0 && (
            <div className="bg-[var(--color-bg-card)] border border-amber-500/30 rounded-2xl p-4 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500">
                Pending Join Requests ({pendingMembers.length})
              </h3>
              {pendingMembers.map((pm) => (
                <div key={pm.id} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={pm.avatar} name={pm.name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{pm.name}</p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                        {pm.department} · {pm.level}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!userId) return;
                        const r = await manageMembershipRequest(community.id, pm.userId, 'approve', userId);
                        if (r.success) {
                          addToast(`Approved ${pm.name}!`, 'success');
                          loadAll();
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!userId) return;
                        const r = await manageMembershipRequest(community.id, pm.userId, 'reject', userId);
                        if (r.success) {
                          addToast(`Declined ${pm.name}.`, 'info');
                          loadAll();
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[11px] font-semibold"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 space-y-2.5">
            {activeMembers.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 py-1.5 border-b last:border-b-0 border-[var(--color-border)]"
              >
                <button
                  type="button"
                  onClick={() => navigateTo('user-profile', { userId: m.userId })}
                  className="flex items-center gap-2.5 min-w-0 text-left"
                >
                  <Avatar src={m.avatar} name={m.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                      {m.name}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                      {m.department} · {m.level}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] capitalize">
                    {m.role}
                  </span>
                  {isOwner && m.userId !== userId && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!userId) return;
                          const nextRole = m.role === 'moderator' ? 'member' : 'moderator';
                          const r = await updateMemberRole(community.id, m.userId, nextRole, userId);
                          if (r.success) {
                            addToast(`Updated ${m.name} to ${nextRole}.`, 'info');
                            loadAll();
                          }
                        }}
                        className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                        title={m.role === 'moderator' ? 'Demote to member' : 'Promote to moderator'}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!userId) return;
                          const r = await removeMember(community.id, m.userId, userId);
                          if (r.success) {
                            addToast(`Removed ${m.name}.`, 'info');
                            loadAll();
                          }
                        }}
                        className="p-1.5 rounded-lg border border-[var(--color-border)] text-rose-500 hover:bg-rose-500/10"
                        title="Remove member"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABOUT & RULES TAB */}
      {activeTab === 'about' && (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">About</h3>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-line">
              <LinkifiedText text={community.description} />
            </p>
          </div>
          {community.rulesList && community.rulesList.length > 0 && (
            <div className="pt-3 border-t border-[var(--color-border)]">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">
                Community Rules
              </h3>
              <ul className="space-y-1.5 text-xs text-[var(--color-text-secondary)]">
                {community.rulesList.map((rule, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-bold text-[var(--color-primary)]">{idx + 1}.</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
