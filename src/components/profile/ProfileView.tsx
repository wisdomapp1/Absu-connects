import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { supabase } from '../../lib/supabase.ts';
import { Avatar } from '../common/Avatar.tsx';
import { LinkifiedText } from '../common/LinkifiedText.tsx';
import { PostCard } from '../home/PostCard.tsx';
import { MrAnonymousPageView } from '../pages/MrAnonymousPageView.tsx';
import { UserFriendsModal } from './UserFriendsModal.tsx';
import { ProfilePhotoModal } from './ProfilePhotoModal.tsx';
import { MR_ANONYMOUS_PAGE_ID } from '../../lib/pageService.ts';
import { EXCLUDED_STUDENT_IDS, fetchProfileById } from '../../lib/profileService.ts';
import { fetchUserPosts } from '../../lib/postService.ts';
import { CreatePageModal } from '../pages/CreatePageModal.tsx';
import type { User, Post } from '../../types/index.ts';
import {
  Edit3,
  MessageSquare,
  UserPlus,
  UserCheck,
  MapPin,
  GraduationCap,
  BookOpen,
  Calendar,
  Share2,
  ArrowLeft,
  ShieldAlert,
  Camera,
  Users,
  Loader2,
  UserX,
  MoreVertical,
  Settings,
  Trash2,
  Building2,
  AlertTriangle,
} from 'lucide-react';

interface ProfileViewProps {
  isAnotherUser?: boolean;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ isAnotherUser = false }) => {
  const {
    currentUser,
    selectedUserId,
    selectedUser,
    posts,
    setEditProfileModalOpen,
    sendFriendRequest,
    cancelFriendRequest,
    startConversationWithUser,
    goBack,
    addToast,
    users,
    isUserOnline,
    isSuperAdmin,
    openAdminDashboard,
    navigateTo,
  } = useApp();
  const { signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<'posts' | 'about'>('posts');
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createPageModalOpen, setCreatePageModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [fetchedUser, setFetchedUser] = useState<User | null>(null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [fetchedUserPosts, setFetchedUserPosts] = useState<Post[] | null>(null);

  // Resiliently resolve another user's profile from selectedUser, posts cache, or Supabase
  React.useEffect(() => {
    if (!isAnotherUser || !selectedUserId) return;
    if (selectedUser) {
      setFetchedUser(selectedUser);
    }

    // Check posts cache first for instant rendering
    const cachedAuthor = posts.find((p) => p.author.id === selectedUserId)?.author;
    if (cachedAuthor && !selectedUser) {
      setFetchedUser(cachedAuthor);
    }

    // Asynchronously fetch profile from Supabase
    let isCancelled = false;
    if (!selectedUser) setLoadingProfile(true);
    fetchProfileById(selectedUserId)
      .then((prof) => {
        if (!isCancelled && prof) {
          setFetchedUser(prof);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setLoadingProfile(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [isAnotherUser, selectedUserId, selectedUser, posts]);

  // Identify target profile user — NEVER fall back to currentUser when viewing another student!
  const profileUser: User | null = isAnotherUser
    ? (selectedUser || fetchedUser || posts.find((p) => p.author.id === selectedUserId)?.author || null)
    : currentUser;

  const isMe = !isAnotherUser || (profileUser ? profileUser.id === currentUser.id : false);

  // Fetch up-to-date posts & fresh signed media URLs specifically for the viewed profile
  React.useEffect(() => {
    const targetId = profileUser?.id;
    if (!targetId) return;
    let cancelled = false;
    fetchUserPosts(targetId, currentUser.id)
      .then((loaded) => {
        if (!cancelled) {
          setFetchedUserPosts(loaded);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profileUser?.id, currentUser.id, posts.length]);

  // If viewing another user and profile is still loading
  if (isAnotherUser && !profileUser && loadingProfile) {
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={goBack}
          className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm p-8 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
          <p className="text-sm font-semibold text-[var(--color-text-secondary)]">Loading student profile...</p>
        </div>
      </div>
    );
  }

  // If profile not found
  if (!profileUser) {
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={goBack}
          className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm p-8 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <UserX className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">Student Profile Not Found</h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              This account may have been renamed or is temporarily unavailable.
            </p>
          </div>
          <button
            onClick={goBack}
            className="mt-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Intercept Mr Anonymous and render page identity
  if (
    profileUser.id === MR_ANONYMOUS_PAGE_ID ||
    EXCLUDED_STUDENT_IDS.includes(profileUser.id) ||
    profileUser.name.toLowerCase().includes('mr anonymous')
  ) {
    return <MrAnonymousPageView />;
  }

  // Filter posts by this user, preferring freshly loaded & signed profile posts
  const cachedUserPosts = posts.filter((p) => p.author.id === profileUser.id);
  const userPosts =
    fetchedUserPosts && fetchedUserPosts.length >= cachedUserPosts.length
      ? fetchedUserPosts
      : cachedUserPosts;

  // Compute friend count for this user
  const friendsCount = isMe
    ? users.filter((u) => u.relationshipState === 'friends').length
    : (profileUser.mutualFriendsCount ?? 0);

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    addToast('Profile link copied to clipboard!', 'success');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Back button if viewing another user */}
      {isAnotherUser && (
        <button
          onClick={goBack}
          className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      )}

      {/* Profile Header Card */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm transition-colors">
        {/* Cover banner */}
        <div className="h-28 sm:h-36 bg-gradient-to-r from-[var(--color-primary)] via-[var(--color-primary-hover)] to-[var(--color-primary-subtle)] relative">
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
        </div>

        {/* Profile Info */}
        <div className="px-4 sm:px-6 pb-6 pt-0 relative">
          {/* Avatar floating & actions wrapper */}
          <div className="-mt-14 sm:-mt-16 mb-3 flex items-end justify-between flex-wrap gap-3">
            <div className="relative">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full p-1 bg-[var(--color-bg-card)] shadow-md">
                <Avatar
                  src={profileUser.avatar}
                  name={profileUser.name}
                  size="xl"
                  className="w-full h-full"
                  showOnline={isMe || isUserOnline(profileUser.id)}
                />
              </div>
              {isMe && (
                <button
                  type="button"
                  onClick={() => setPhotoModalOpen(true)}
                  className="absolute bottom-1 right-1 p-2 rounded-full bg-[var(--color-primary)] text-white shadow-md hover:opacity-90 active:scale-95 transition-all border-2 border-[var(--color-bg-card)]"
                  title="Update profile picture"
                  aria-label="Update profile picture"
                >
                  <Camera className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              {isMe ? (
                <>
                  {isSuperAdmin && (
                    <button
                      onClick={openAdminDashboard}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95 border border-emerald-400/30"
                      title="Access Super Admin Dashboard"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-white" />
                      <span>Switch to Admin</span>
                    </button>
                  )}
                  <button
                    onClick={() => setEditProfileModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Profile</span>
                  </button>
                  <button
                    onClick={handleShare}
                    className="p-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                    aria-label="Share profile"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  {/* Profile Three-Dot Menu (⋮) */}
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpen(!menuOpen)}
                      className="p-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                      aria-label="Profile actions menu"
                      title="Profile actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuOpen && (
                      <div className="absolute right-0 top-11 w-52 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            setCreatePageModalOpen(true);
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] flex items-center gap-2.5 transition-colors"
                        >
                          <Building2 className="w-4 h-4 text-[var(--color-primary)]" />
                          <span>Create Page</span>
                        </button>

                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            navigateTo('settings');
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] flex items-center gap-2.5 transition-colors"
                        >
                          <Settings className="w-4 h-4 text-[var(--color-text-secondary)]" />
                          <span>Settings</span>
                        </button>

                        <div className="my-1 border-t border-[var(--color-border)]" />

                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            setDeleteModalOpen(true);
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2.5 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete Account</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {profileUser.relationshipState === 'friends' ? (
                    <span className="px-3.5 py-2 rounded-xl bg-[var(--color-success)]/10 text-[var(--color-success)] text-xs font-bold flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4" />
                      <span>Friends</span>
                    </span>
                  ) : profileUser.relationshipState === 'request_sent' ? (
                    <button
                      onClick={() => cancelFriendRequest(profileUser.id)}
                      className="px-3.5 py-2 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-error)]"
                    >
                      Cancel Request
                    </button>
                  ) : (
                    <button
                      onClick={() => sendFriendRequest(profileUser.id)}
                      className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Add Friend</span>
                    </button>
                  )}

                  <button
                    onClick={() => startConversationWithUser(profileUser)}
                    className="px-4 py-2 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-xs font-bold hover:bg-[var(--color-primary)] hover:text-white transition-colors flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Message</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Name & Title */}
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
                {profileUser.name}
              </h1>
            </div>
            <p className="text-xs font-semibold text-[var(--color-text-secondary)] mt-0.5">
              {profileUser.handle} · {profileUser.level}
            </p>
          </div>

          {/* Bio */}
          <p className="text-xs sm:text-sm text-[var(--color-text-primary)] mt-3 leading-relaxed max-w-2xl whitespace-pre-line">
            <LinkifiedText text={profileUser.bio} />
          </p>

          {/* Academic & Campus Metadata */}
          <div className="flex flex-wrap items-center gap-y-2 gap-x-4 mt-3 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]">
            <div className="flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
              <span>{profileUser.department}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
              <span>{profileUser.faculty}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
              <span>{profileUser.campus}</span>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex items-center gap-6 mt-4 pt-3 border-t border-[var(--color-border)] text-xs">
            <button
              onClick={() => setFriendsModalOpen(true)}
              className="flex items-baseline gap-1 text-left group hover:opacity-85 transition-opacity focus:outline-none"
              title="View accepted friends"
              type="button"
            >
              <span className="font-extrabold text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors mr-1 tabular-nums">
                {friendsCount}
              </span>
              <span className="text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] transition-colors font-medium">Friends</span>
            </button>
            <div>
              <span className="font-extrabold text-sm text-[var(--color-text-primary)] mr-1 tabular-nums">
                {userPosts.length}
              </span>
              <span className="text-[var(--color-text-secondary)] font-medium">Posts</span>
            </div>
          </div>

          {/* Interests */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {profileUser.interests.map((interest) => (
              <span
                key={interest}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
              >
                #{interest}
              </span>
            ))}
          </div>
        </div>

        {/* Tabs: Posts / About */}
        <div className="flex border-t border-[var(--color-border)] bg-[var(--color-bg-main)] px-4">
          <button
            onClick={() => setActiveTab('posts')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'posts'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Posts ({userPosts.length})
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'about'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            About & Academic Info
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'posts' && (
        <div className="flex flex-col gap-4">
          {userPosts.length === 0 ? (
            <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl">
              <p className="text-sm font-bold text-[var(--color-text-primary)]">No posts yet</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                {isMe ? 'Share your first campus update from the Home feed.' : `${profileUser.name} hasn't shared any posts yet.`}
              </p>
            </div>
          ) : (
            userPosts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>
      )}

      {activeTab === 'about' && (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 shadow-sm flex flex-col gap-4 text-xs">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">
              Academic Background
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                <span className="text-[10px] uppercase font-bold text-[var(--color-text-secondary)]">
                  Department
                </span>
                <p className="font-semibold text-sm text-[var(--color-text-primary)] mt-0.5">
                  {profileUser.department}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                <span className="text-[10px] uppercase font-bold text-[var(--color-text-secondary)]">
                  Faculty
                </span>
                <p className="font-semibold text-sm text-[var(--color-text-primary)] mt-0.5">
                  {profileUser.faculty}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                <span className="text-[10px] uppercase font-bold text-[var(--color-text-secondary)]">
                  Level
                </span>
                <p className="font-semibold text-sm text-[var(--color-text-primary)] mt-0.5">
                  {profileUser.level}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                <span className="text-[10px] uppercase font-bold text-[var(--color-text-secondary)]">
                  Campus Location
                </span>
                <p className="font-semibold text-sm text-[var(--color-text-primary)] mt-0.5">
                  {profileUser.campus}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)]">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">
              Community Notice
            </h3>
            <p className="text-[var(--color-text-secondary)] leading-relaxed">
              Student profile information on ABSU Connect is designed for friendship, study collaboration, and campus interaction. Always adhere to Abia State University community guidelines.
            </p>
          </div>
        </div>
      )}

      {/* Friends List Modal */}
      <UserFriendsModal
        isOpen={friendsModalOpen}
        onClose={() => setFriendsModalOpen(false)}
        targetUser={profileUser}
      />

      {/* Separate Profile Photo Picker & Upload Modal */}
      <ProfilePhotoModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
      />

      {/* Create Campus Page Modal */}
      <CreatePageModal
        isOpen={createPageModalOpen}
        onClose={() => setCreatePageModalOpen(false)}
        userId={currentUser.id}
        onShowToast={(msg, type) => addToast(msg, type === 'error' ? 'warning' : type)}
      />

      {/* Delete Account Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--color-bg-card)] border-2 border-red-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-red-600 dark:text-red-400">
                  Delete Account Permanently?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)]">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              All your student profile details, posts, messages, and campus friendships will be permanently purged. To confirm, type <strong className="text-red-500 font-mono">DELETE</strong> below:
            </p>

            <input
              type="text"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3.5 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl font-mono font-bold text-center tracking-widest text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-red-500 uppercase text-xs"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirmationText('');
                }}
                disabled={isDeletingAccount}
                className="px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmationText.trim().toUpperCase() !== 'DELETE' || isDeletingAccount}
                onClick={async () => {
                  setIsDeletingAccount(true);
                  try {
                    const { error } = await supabase.from('profiles').delete().eq('id', currentUser.id);
                    if (error) throw error;
                    addToast('Your ABSU Connect account has been deleted.', 'info');
                    await signOut();
                  } catch (err: any) {
                    addToast(err?.message || 'Could not delete account. Please try again.', 'warning');
                  } finally {
                    setIsDeletingAccount(false);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-xl shadow-sm transition-all"
              >
                {isDeletingAccount ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
