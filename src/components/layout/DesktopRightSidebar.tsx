import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { UserPlus } from 'lucide-react';

export const DesktopRightSidebar: React.FC = () => {
  const { users, sendFriendRequest, navigateTo } = useApp();

  // Find suggested users
  const suggested = users
    .filter((u) => u.relationshipState === 'none')
    .slice(0, 5);

  return (
    <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-20 self-start gap-4">
      {/* People You May Know */}
      <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-sm transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[var(--color-text-primary)]">
            Suggested Friends
          </h2>
          <button
            onClick={() => {
              navigateTo('friends');
            }}
            className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            See all
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {suggested.length === 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)] italic py-1">
              No new suggestions right now. Check back as more students join.
            </p>
          ) : (
            suggested.map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-2.5">
                <button
                  onClick={() => navigateTo('user-profile', { userId: user.id })}
                  className="flex items-center gap-2.5 min-w-0 text-left group"
                >
                  <Avatar src={user.avatar} name={user.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                      {user.name}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                      {user.department}
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => sendFriendRequest(user.id)}
                  className="p-1.5 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-colors shrink-0"
                  title={`Add ${user.name}`}
                  aria-label={`Add friend ${user.name}`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
};
