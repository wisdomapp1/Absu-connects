import React, { useState, useEffect } from 'react';
import {
  Search,
  Users,
  ShieldAlert,
  AlertTriangle,
  UserX,
  CheckCircle2,
  Clock,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  Trash2,
  RefreshCw,
  Filter,
} from 'lucide-react';
import {
  fetchAdminUsers,
  fetchAdminUserDetail,
  updateAdminUserStatus,
  sendAdminUserWarning,
  triggerAdminPasswordRecovery,
  permanentlyDeleteUserAccount,
  AdminUserListItem,
  AdminUserDetail,
} from '../../lib/adminService.ts';
import { UserDetailModal, ActionConfirmModal, DeleteConfirmModal } from './AdminModals.tsx';

interface AdminUsersTabProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({ onShowToast }) => {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  // Selected User for Detail View & Modals
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Action Confirm Modal
  const [actionModalType, setActionModalType] = useState<'suspend' | 'disable' | 'reactivate' | 'unsuspend' | 'warn' | 'reset-pw' | null>(null);
  const [actionTargetUser, setActionTargetUser] = useState<{ id: string; name: string } | null>(null);

  // Delete Confirm Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminUsers({
        search: search.trim() || undefined,
        status: statusFilter,
        page,
        limit,
      });

      if (res.success && res.users) {
        setUsers(res.users);
        setTotalCount(res.totalCount ?? res.users.length);
      } else {
        onShowToast(res.error || 'Failed to load user directory.', 'warning');
      }
    } catch (err: unknown) {
      onShowToast('Error loading user directory.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadUsers();
  };

  const handleOpenDetail = async (userId: string) => {
    try {
      const res = await fetchAdminUserDetail(userId);
      if (res.success && res.user) {
        setSelectedUserDetail(res.user);
        setDetailModalOpen(true);
      } else {
        onShowToast(res.error || 'Failed to fetch user record.', 'warning');
      }
    } catch {
      onShowToast('Could not open user record.', 'warning');
    }
  };

  const handleOpenAction = (user: { id: string; name: string }, type: any) => {
    setActionTargetUser(user);
    setActionModalType(type);
  };

  const handleActionConfirm = async (data: { reason: string; durationHours?: number; category?: string }) => {
    if (!actionTargetUser || !actionModalType) return;

    if (['disable', 'reactivate', 'suspend', 'unsuspend'].includes(actionModalType)) {
      const res = await updateAdminUserStatus(actionTargetUser.id, {
        action: actionModalType as any,
        reason: data.reason,
        durationHours: data.durationHours,
      });

      if (res.success) {
        onShowToast(res.message || 'Status updated', 'success');
        loadUsers();
        if (selectedUserDetail?.id === actionTargetUser.id) {
          handleOpenDetail(actionTargetUser.id);
        }
      } else {
        onShowToast(res.error || 'Status update failed', 'warning');
      }
    } else if (actionModalType === 'warn') {
      const res = await sendAdminUserWarning(actionTargetUser.id, {
        reason: data.reason,
        category: data.category,
      });
      if (res.success) {
        onShowToast('Warning issued and recorded.', 'success');
        loadUsers();
      } else {
        onShowToast(res.error || 'Failed to issue warning', 'warning');
      }
    } else if (actionModalType === 'reset-pw') {
      const res = await triggerAdminPasswordRecovery(actionTargetUser.id, (actionTargetUser as any).email || 'student@absu.edu.ng');
      if (res.success) {
        onShowToast('Password recovery sent.', 'success');
      } else {
        onShowToast(res.error || 'Recovery request failed', 'warning');
      }
    }
  };

  const handleDeleteConfirm = async (confirmationText: string) => {
    if (!actionTargetUser) return;
    const res = await permanentlyDeleteUserAccount(actionTargetUser.id, confirmationText);
    if (res.success) {
      onShowToast('Account successfully purged.', 'success');
      setDetailModalOpen(false);
      loadUsers();
    } else {
      onShowToast(res.error || 'Failed to delete account', 'warning');
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div className="space-y-4">
      {/* Top Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="flex-1 relative">
            <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student name, @handle, department, or user ID..."
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
            onClick={loadUsers}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[var(--color-primary)]' : ''}`} />
            <span>Reload</span>
          </button>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'All Students' },
            { id: 'active', label: 'Active' },
            { id: 'suspended', label: 'Suspended' },
            { id: 'disabled', label: 'Disabled' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setStatusFilter(f.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors ${
                statusFilter === f.id
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)]'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="text-[11px] text-[var(--color-text-secondary)] ml-auto font-semibold">
            {totalCount} total account{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Directory Table / Cards */}
      <div className="rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] overflow-hidden shadow-xs">
        {loading && users.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--color-text-secondary)]">
            Loading student directory...
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users className="w-8 h-8 text-[var(--color-text-secondary)] mx-auto opacity-50" />
            <h4 className="text-sm font-bold text-[var(--color-text-primary)]">No Students Found</h4>
            <p className="text-xs text-[var(--color-text-secondary)]">
              No registered user records match the query "{search}".
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {users.map((u) => {
              const isSuspended = u.accountStatus === 'suspended';
              const isDisabled = u.accountStatus === 'disabled';

              return (
                <div
                  key={u.id}
                  className="p-3.5 sm:p-4 hover:bg-[var(--color-bg-main)]/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  {/* Left: Avatar & Profile */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-[var(--color-bg-main)] border border-[var(--color-border)] shrink-0">
                      <img
                        src={
                          u.avatar ||
                          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.displayName)}&backgroundColor=6d45d9&textColor=ffffff`
                        }
                        alt={u.displayName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-[var(--color-text-primary)] truncate">
                          {u.displayName}
                        </span>
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
                        {u.warningsCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600">
                            {u.warningsCount} warn
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-[var(--color-text-secondary)] truncate">
                        {u.username} · {u.department} · {u.level}
                      </p>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    <button
                      onClick={() => handleOpenDetail(u.id)}
                      className="px-2.5 py-1.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)] font-bold text-[var(--color-text-primary)] hover:text-[var(--color-primary)] transition-all flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Details</span>
                    </button>

                    <button
                      onClick={() => handleOpenAction({ id: u.id, name: u.displayName }, 'warn')}
                      className="p-1.5 rounded-xl border border-[var(--color-border)] text-amber-600 hover:bg-amber-500/10 transition-colors"
                      title="Issue Warning"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </button>

                    {isSuspended ? (
                      <button
                        onClick={() => handleOpenAction({ id: u.id, name: u.displayName }, 'unsuspend')}
                        className="p-1.5 rounded-xl border border-[var(--color-success)] text-[var(--color-success)] hover:bg-[var(--color-success)]/10 transition-colors"
                        title="Lift Suspension"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenAction({ id: u.id, name: u.displayName }, 'suspend')}
                        className="p-1.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-amber-600 hover:border-amber-500 transition-colors"
                        title="Suspend Account"
                      >
                        <Clock className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isDisabled ? (
                      <button
                        onClick={() => handleOpenAction({ id: u.id, name: u.displayName }, 'reactivate')}
                        className="p-1.5 rounded-xl border border-[var(--color-success)] text-[var(--color-success)] hover:bg-[var(--color-success)]/10 transition-colors"
                        title="Reactivate Account"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenAction({ id: u.id, name: u.displayName }, 'disable')}
                        className="p-1.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-red-600 hover:border-red-500 transition-colors"
                        title="Disable Account"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-bg-main)] flex items-center justify-between text-xs">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 rounded-lg border border-[var(--color-border)] disabled:opacity-40 font-semibold text-[var(--color-text-primary)] flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <span className="font-bold text-[var(--color-text-secondary)]">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded-lg border border-[var(--color-border)] disabled:opacity-40 font-semibold text-[var(--color-text-primary)] flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      <UserDetailModal
        user={selectedUserDetail}
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        onOpenActionModal={(type) => {
          if (selectedUserDetail) {
            handleOpenAction({ id: selectedUserDetail.id, name: selectedUserDetail.displayName }, type);
          }
        }}
        onOpenDeleteModal={() => {
          if (selectedUserDetail) {
            setActionTargetUser({ id: selectedUserDetail.id, name: selectedUserDetail.displayName });
            setDeleteModalOpen(true);
          }
        }}
      />

      {/* Action Confirm Modal */}
      <ActionConfirmModal
        isOpen={Boolean(actionModalType)}
        type={actionModalType}
        targetUser={actionTargetUser}
        onClose={() => {
          setActionModalType(null);
          setActionTargetUser(null);
        }}
        onConfirm={handleActionConfirm}
      />

      {/* Delete Confirm Modal */}
      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        targetUser={actionTargetUser}
        onClose={() => {
          setDeleteModalOpen(false);
          setActionTargetUser(null);
        }}
        onConfirmDelete={handleDeleteConfirm}
      />
    </div>
  );
};
