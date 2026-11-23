import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchAcceptedFriends } from '../../lib/friendService.ts';
import type { User } from '../../types/index.ts';
import { Avatar } from '../common/Avatar.tsx';
import {
  X,
  Users,
  Search,
  Lock,
  MessageSquare,
  UserPlus,
  Check,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

interface UserFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: User;
}

export const UserFriendsModal: React.FC<UserFriendsModalProps> = ({
  isOpen,
  onClose,
  targetUser,
}) => {
  const {
    currentUser,
    friends: myFriends,
    sendFriendRequest,
    startConversationWithUser,
    navigateTo,
    isUserOnline,
  } = useApp();
  const { user } = useAuth();
  const viewerId = user?.id;

  const [friendsList, setFriendsList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [privacyBlocked, setPrivacyBlocked] = useState(false);
  const [privacyReason, setPrivacyReason] = useState<string | null>(null);

  const isMe = viewerId === targetUser.id;

  useEffect(() => {
    if (!isOpen || !targetUser.id) return;
    setLoading(true);
    setPrivacyBlocked(false);
    setPrivacyReason(null);

    fetchAcceptedFriends(targetUser.id, viewerId)
      .then((res) => {
        if (res.allowed) {
          setFriendsList(res.friends);
        } else {
          setPrivacyBlocked(true);
          setPrivacyReason(res.privacyReason || 'Friend list is private.');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, targetUser.id, viewerId]);

  if (!isOpen) return null;

  const filteredFriends = friendsList.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      f.department.toLowerCase().includes(q) ||
      f.handle.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full sm:max-w-md rounded-t-[24px] sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-[var(--color-text-primary)]">
                {isMe ? 'My Friends' : `${targetUser.name}'s Friends`}
              </h3>
              {!loading && !privacyBlocked && (
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  {friendsList.length} {friendsList.length === 1 ? 'accepted connection' : 'accepted connections'}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar */}
        {!privacyBlocked && friendsList.length > 5 && (
          <div className="p-3 border-b border-[var(--color-border)]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search friends..."
                autoCorrect="on"
                autoCapitalize="none"
                spellCheck={true}
                enterKeyHint="search"
                className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4 overflow-y-auto flex flex-col gap-2.5 min-h-[160px] max-h-[60vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-[var(--color-text-secondary)]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
              <p className="text-xs">Loading campus friends...</p>
            </div>
          ) : privacyBlocked ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                <Lock className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-[var(--color-text-primary)]">
                Friend List is Private
              </h4>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 max-w-xs leading-relaxed">
                {privacyReason || 'This student has chosen to keep their friend list visible only to mutual friends.'}
              </p>
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-[var(--color-text-secondary)]">
              <Users className="w-10 h-10 opacity-30 mb-2" />
              <p className="text-xs font-semibold">
                {search.trim() ? 'No friends match your search' : 'No accepted friends yet'}
              </p>
            </div>
          ) : (
            filteredFriends.map((friend) => {
              const isFriendOfMine = myFriends.some((f) => f.id === friend.id);
              const isMyself = friend.id === viewerId;

              return (
                <div
                  key={friend.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 transition-colors"
                >
                  <button
                    onClick={() => {
                      onClose();
                      navigateTo('user-profile', { userId: friend.id });
                    }}
                    className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                  >
                    <Avatar
                      src={friend.avatar}
                      name={friend.name}
                      size="md"
                      showOnline={isUserOnline(friend.id)}
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-[var(--color-text-primary)] truncate">
                        {friend.name}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                        {friend.department} · {friend.level}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {isMyself ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
                        You
                      </span>
                    ) : isMe ? (
                      <button
                        onClick={() => {
                          onClose();
                          startConversationWithUser(friend);
                        }}
                        className="p-1.5 rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-colors"
                        title="Send Message"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    ) : isFriendOfMine ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>Friends</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => sendFriendRequest(friend.id)}
                        className="p-1.5 px-2 rounded-lg bg-[var(--color-primary)] text-white text-[11px] font-bold hover:opacity-90 transition-opacity flex items-center gap-1"
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
