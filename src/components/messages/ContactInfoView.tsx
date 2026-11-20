import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import {
  ArrowLeft,
  User as UserIcon,
  Bell,
  BellOff,
  Mail,
  Trash2,
  Ban,
  Flag,
  Phone,
  Video,
  ShieldAlert,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export const ContactInfoView: React.FC = () => {
  const {
    selectedConversation,
    currentUser,
    navigateTo,
    isUserOnline,
    isConversationMuted,
    toggleMuteConversation,
    markConversationUnread,
    deleteConversationForMe,
    blockUser,
    addToast,
    reportPost,
  } = useApp();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  if (!selectedConversation) {
    return (
      <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
          No contact selected
        </p>
        <button
          onClick={() => navigateTo('messages')}
          className="mt-3 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold"
        >
          Return to Messages
        </button>
      </div>
    );
  }

  const { participant } = selectedConversation;
  const isOnline = isUserOnline(participant.id);
  const isMuted = isConversationMuted(selectedConversation.id);

  const handleToggleMute = () => {
    toggleMuteConversation(selectedConversation.id);
  };

  const handleMarkUnread = () => {
    markConversationUnread(selectedConversation.id);
    navigateTo('messages');
  };

  const handleDeleteForMe = async () => {
    await deleteConversationForMe(selectedConversation.id);
    setConfirmDeleteOpen(false);
  };

  const handleBlock = async () => {
    const success = await blockUser(participant.id);
    if (success) {
      setConfirmBlockOpen(false);
      navigateTo('messages');
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason.trim()) return;
    setIsSubmittingReport(true);
    try {
      await reportPost(participant.id, `User Report: ${reportReason}`);
      setReportModalOpen(false);
      setReportReason('');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--color-bg-card)] sm:border sm:border-[var(--color-border)] sm:rounded-2xl shadow-sm overflow-hidden transition-colors">
      {/* Top Header */}
      <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-card)] z-10">
        <button
          onClick={() => navigateTo('conversation', { convId: selectedConversation.id })}
          className="p-1.5 -ml-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center transition-colors"
          aria-label="Back to chat"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <h1 className="text-sm font-bold text-[var(--color-text-primary)]">
          Contact Info
        </h1>

        <div className="w-9" />
      </div>

      <div className="p-4 sm:p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Contact Hero */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3">
            <Avatar
              src={participant.avatar}
              name={participant.name}
              size="xl"
              showOnline={isOnline}
              className="w-24 h-24 sm:w-28 sm:h-28 text-2xl shadow-md ring-4 ring-[var(--color-primary)]/10"
            />
          </div>

          <h2 className="text-lg sm:text-xl font-extrabold text-[var(--color-text-primary)]">
            {participant.name}
          </h2>

          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-0.5">
            {participant.department} · {participant.level}
          </p>

          <p className="text-[11px] font-semibold text-[var(--color-primary)] mt-1">
            {participant.campus} · {isOnline ? 'Active now' : 'Offline'}
          </p>

          {participant.bio && (
            <p className="text-xs text-[var(--color-text-secondary)] max-w-sm mt-3 bg-[var(--color-bg-main)] p-3 rounded-xl border border-[var(--color-border)]">
              "{participant.bio}"
            </p>
          )}

          {/* Quick Actions Row */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-xs mt-4">
            <button
              onClick={() => navigateTo('user-profile', { userId: participant.id })}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-primary)] transition-all group"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center group-hover:scale-105 transition-transform">
                <UserIcon className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold">Profile</span>
            </button>

            <button
              onClick={() => addToast('Audio calling will be available in Phase 2.', 'info')}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-primary)] transition-all group"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] flex items-center justify-center group-hover:scale-105 transition-transform">
                <Phone className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold">Audio</span>
            </button>

            <button
              onClick={() => addToast('Video calling will be available in Phase 2.', 'info')}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-primary)] transition-all group"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] flex items-center justify-center group-hover:scale-105 transition-transform">
                <Video className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold">Video</span>
            </button>
          </div>
        </div>

        {/* Section 1: Chat Preferences */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] px-1 mb-1">
            Chat Preferences
          </h3>

          <div className="bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-2xl overflow-hidden divide-y divide-[var(--color-border)]">
            {/* Mute Toggle */}
            <button
              onClick={handleToggleMute}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-[var(--color-bg-card)] transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isMuted ? 'bg-amber-500/10 text-amber-500' : 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'}`}>
                  {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)]">
                    {isMuted ? 'Unmute Notifications' : 'Mute Notifications'}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">
                    {isMuted ? 'You will receive notifications for new messages' : 'Silence alerts from this conversation'}
                  </p>
                </div>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isMuted ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/10 text-emerald-600'}`}>
                {isMuted ? 'Muted' : 'Active'}
              </span>
            </button>

            {/* Mark as unread */}
            <button
              onClick={handleMarkUnread}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-[var(--color-bg-card)] transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)]">
                    Mark as Unread
                  </p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">
                    Keep a reminder to respond later
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] transition-colors" />
            </button>
          </div>
        </div>

        {/* Section 2: Privacy & Moderation */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] px-1 mb-1">
            Privacy & Management
          </h3>

          <div className="bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-2xl overflow-hidden divide-y divide-[var(--color-border)]">
            {/* Delete for Me */}
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-rose-500/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400">
                    Delete Chat for Me
                  </p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">
                    Clears this conversation from your list without deleting for {participant.name.split(' ')[0]}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-rose-400" />
            </button>

            {/* Block User */}
            <button
              onClick={() => setConfirmBlockOpen(true)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-rose-500/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                  <Ban className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400">
                    Block {participant.name.split(' ')[0]}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">
                    Blocked students cannot message, add, or view your presence
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-rose-400" />
            </button>

            {/* Report User */}
            <button
              onClick={() => setReportModalOpen(true)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-amber-500/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Flag className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)]">
                    Report Student
                  </p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">
                    Submit report to ABSU Connect campus safety team
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal: Delete Chat For Me */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl max-w-sm w-full p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">
              Delete chat for you?
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
              This will remove the conversation from your inbox. The other person will still see their message history, and sending a new message will restore the chat.
            </p>
            <div className="flex items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteForMe}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
              >
                Delete for Me
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Block User */}
      {confirmBlockOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl max-w-sm w-full p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">
              Block {participant.name}?
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
              They will not be able to message you, find you in Discover, or invite you to multiplayer games. You can unblock them anytime.
            </p>
            <div className="flex items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setConfirmBlockOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBlock}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
              >
                Block User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleReport}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl max-w-sm w-full p-5 shadow-2xl animate-in fade-in zoom-in-95"
          >
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">
              Report Student
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Please specify the safety violation or reason for reporting {participant.name}.
            </p>
            <textarea
              required
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="e.g. Harassment, impersonation, spam..."
              className="w-full mt-3 p-3 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <div className="flex items-center justify-end gap-2.5 mt-4">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingReport || !reportReason.trim()}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm disabled:opacity-50"
              >
                {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
