import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  UserX,
  CheckCircle2,
  Clock,
  KeyRound,
  Trash2,
  Calendar,
  Building,
  GraduationCap,
  MapPin,
  FileText,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { AdminUserDetail } from '../../lib/adminService.ts';

// -------------------------------------------------------------
// 1. User Detail Modal
// -------------------------------------------------------------
interface UserDetailModalProps {
  user: AdminUserDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenActionModal: (type: 'suspend' | 'disable' | 'reactivate' | 'warn' | 'reset-pw' | 'unsuspend') => void;
  onOpenDeleteModal: () => void;
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user,
  isOpen,
  onClose,
  onOpenActionModal,
  onOpenDeleteModal,
}) => {
  if (!isOpen || !user) return null;

  const isSuspended = user.restriction?.status === 'suspended';
  const isDisabled = user.restriction?.status === 'disabled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--color-border)] flex items-center justify-between sticky top-0 bg-[var(--color-bg-card)] z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-[var(--color-bg-main)] border border-[var(--color-border)] shrink-0">
              <img
                src={
                  user.avatar ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName)}&backgroundColor=6d45d9&textColor=ffffff`
                }
                alt={user.displayName}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-[var(--color-text-primary)]">
                  {user.displayName}
                </h3>
                {isDisabled ? (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
                    Disabled
                  </span>
                ) : isSuspended ? (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                    Suspended
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-[var(--color-text-secondary)]">
                {user.username} · ID: <span className="font-mono text-[11px]">{user.id.slice(0, 8)}...</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-5 text-xs">
          {/* Active Restriction Banner */}
          {(isSuspended || isDisabled) && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    {isDisabled ? 'Account Disabled by Super Admin' : 'Account Under Temporary Suspension'}
                  </p>
                  <p className="text-[11px] opacity-90">
                    Reason: {user.restriction?.restrictionReason || 'Administrative restriction'}
                  </p>
                  {user.restriction?.suspendedUntil && (
                    <p className="text-[10px] font-semibold">
                      Suspended until: {new Date(user.restriction.suspendedUntil).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Academic Info */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
              Academic & Profile Data
            </h4>
            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <div>
                  <span className="text-[10px] text-[var(--color-text-secondary)] block">Department</span>
                  <span className="font-bold text-[var(--color-text-primary)]">{user.department}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <div>
                  <span className="text-[10px] text-[var(--color-text-secondary)] block">Level</span>
                  <span className="font-bold text-[var(--color-text-primary)]">{user.level}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <div>
                  <span className="text-[10px] text-[var(--color-text-secondary)] block">Campus</span>
                  <span className="font-bold text-[var(--color-text-primary)]">{user.campus}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <div>
                  <span className="text-[10px] text-[var(--color-text-secondary)] block">Member Since</span>
                  <span className="font-bold text-[var(--color-text-primary)]">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Recent'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bio */}
          {user.bio && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">
                Student Bio
              </h4>
              <p className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] leading-relaxed">
                {user.bio}
              </p>
            </div>
          )}

          {/* Warnings & Moderation History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                Moderation History
              </h4>
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                {user.warnings.length} warning(s) · {user.reportsAgainstUser.length} report(s)
              </span>
            </div>

            {user.warnings.length === 0 ? (
              <p className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)] text-center text-xs">
                No formal administrative warnings issued to this student.
              </p>
            ) : (
              <div className="space-y-2">
                {user.warnings.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs flex items-start gap-2.5"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        <span>Issued by {w.adminEmail}</span>
                        <span>{new Date(w.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="mt-1 text-[var(--color-text-primary)]">{w.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Administrative Control Actions */}
          <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
              Super Admin Actions
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                onClick={() => onOpenActionModal('warn')}
                className="p-2.5 rounded-xl border border-[var(--color-border)] hover:border-amber-500 hover:bg-amber-500/5 text-amber-600 dark:text-amber-400 font-bold text-center transition-all flex items-center justify-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Issue Warning</span>
              </button>

              {isSuspended ? (
                <button
                  onClick={() => onOpenActionModal('unsuspend')}
                  className="p-2.5 rounded-xl border border-[var(--color-success)] text-[var(--color-success)] hover:bg-[var(--color-success)]/10 font-bold text-center transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Lift Suspension</span>
                </button>
              ) : (
                <button
                  onClick={() => onOpenActionModal('suspend')}
                  className="p-2.5 rounded-xl border border-[var(--color-border)] hover:border-amber-500 text-[var(--color-text-primary)] hover:text-amber-600 font-bold text-center transition-all flex items-center justify-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Suspend</span>
                </button>
              )}

              {isDisabled ? (
                <button
                  onClick={() => onOpenActionModal('reactivate')}
                  className="p-2.5 rounded-xl border border-[var(--color-success)] text-[var(--color-success)] hover:bg-[var(--color-success)]/10 font-bold text-center transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Reactivate</span>
                </button>
              ) : (
                <button
                  onClick={() => onOpenActionModal('disable')}
                  className="p-2.5 rounded-xl border border-[var(--color-border)] hover:border-red-500 text-[var(--color-text-primary)] hover:text-red-600 font-bold text-center transition-all flex items-center justify-center gap-1.5"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Disable</span>
                </button>
              )}

              <button
                onClick={() => onOpenActionModal('reset-pw')}
                className="p-2.5 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-primary)] hover:text-[var(--color-primary)] font-bold text-center transition-all flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Send Password Reset</span>
              </button>

              <button
                onClick={onOpenDeleteModal}
                className="p-2.5 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-bold text-center transition-all flex items-center justify-center gap-1.5 sm:col-span-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Permanently Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 2. Action Confirmation Modal (Suspend, Disable, Warn, etc.)
// -------------------------------------------------------------
interface ActionConfirmModalProps {
  isOpen: boolean;
  type: 'suspend' | 'disable' | 'reactivate' | 'unsuspend' | 'warn' | 'reset-pw' | null;
  targetUser: { id: string; name: string } | null;
  onClose: () => void;
  onConfirm: (data: { reason: string; durationHours?: number; category?: string }) => Promise<void>;
}

export const ActionConfirmModal: React.FC<ActionConfirmModalProps> = ({
  isOpen,
  type,
  targetUser,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [durationHours, setDurationHours] = useState(24);
  const [category, setCategory] = useState('Conduct');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !type || !targetUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((type === 'suspend' || type === 'disable' || type === 'warn') && !reason.trim()) {
      setError('Please provide an administrative reason for this action.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onConfirm({ reason: reason.trim(), durationHours, category });
      setReason('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<string, string> = {
    suspend: 'Apply Temporary Suspension',
    disable: 'Disable Student Account',
    reactivate: 'Reactivate Student Account',
    unsuspend: 'Lift Account Suspension',
    warn: 'Issue Official Student Warning',
    'reset-pw': 'Send Password Recovery Email',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-[var(--color-text-primary)]">
            {titles[type] || 'Confirm Action'}
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--color-text-secondary)]">
          Target: <strong className="text-[var(--color-text-primary)]">{targetUser.name}</strong> (
          <span className="font-mono">{targetUser.id.slice(0, 8)}...</span>)
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {type === 'suspend' && (
            <div>
              <label className="block font-bold text-[var(--color-text-primary)] mb-1">
                Suspension Duration
              </label>
              <select
                value={durationHours}
                onChange={(e) => setDurationHours(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl font-semibold text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              >
                <option value={24}>24 Hours (1 Day)</option>
                <option value={72}>72 Hours (3 Days)</option>
                <option value={168}>7 Days (1 Week)</option>
                <option value={720}>30 Days (1 Month)</option>
              </select>
            </div>
          )}

          {type === 'warn' && (
            <div>
              <label className="block font-bold text-[var(--color-text-primary)] mb-1">
                Violation Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl font-semibold text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              >
                <option value="Conduct">General Campus Conduct</option>
                <option value="Spam">Spam or Irrelevant Posting</option>
                <option value="Harassment">Harassment or Offensive Language</option>
                <option value="Scam">Scam / Unauthorized Commercial Activity</option>
                <option value="Academic">Academic Dishonesty</option>
              </select>
            </div>
          )}

          {['suspend', 'disable', 'warn'].includes(type) && (
            <div>
              <label className="block font-bold text-[var(--color-text-primary)] mb-1">
                Administrative Reason & Notes <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter specific justification for audit logs and student notification..."
                rows={3}
                required
                className="w-full px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] resize-none"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-2 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirm Action</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 3. Double-Confirmation Permanent Account Deletion Modal
// -------------------------------------------------------------
interface DeleteConfirmModalProps {
  isOpen: boolean;
  targetUser: { id: string; name: string } | null;
  onClose: () => void;
  onConfirmDelete: (confirmationText: string) => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  targetUser,
  onClose,
  onConfirmDelete,
}) => {
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !targetUser) return null;

  const isConfirmed = typedConfirmation.trim().toUpperCase() === 'DELETE';

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmed) return;

    setLoading(true);
    setError(null);
    try {
      await onConfirmDelete(typedConfirmation);
      setTypedConfirmation('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Deletion failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[var(--color-bg-card)] border-2 border-red-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center mx-auto">
          <Trash2 className="w-6 h-6" />
        </div>

        <div className="text-center space-y-1">
          <h3 className="text-base font-black text-red-600 dark:text-red-400">
            Permanently Delete Account?
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            This action is <strong className="text-[var(--color-text-primary)]">irreversible</strong>.
            All profile information, student posts, comments, friendships, and messages associated with{' '}
            <strong className="text-[var(--color-text-primary)]">{targetUser.name}</strong> will be
            permanently purged from the campus platform.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleDelete} className="space-y-3.5 text-xs">
          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] space-y-1.5">
            <label className="block text-[11px] font-bold text-[var(--color-text-primary)]">
              To proceed, please type <span className="font-mono text-red-600 font-black">DELETE</span> below:
            </label>
            <input
              type="text"
              value={typedConfirmation}
              onChange={(e) => setTypedConfirmation(e.target.value)}
              placeholder="DELETE"
              required
              disabled={loading}
              className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg font-mono font-bold text-center tracking-widest text-[var(--color-text-primary)] focus:outline-none focus:border-red-500 uppercase"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isConfirmed || loading}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Permanently Delete</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
