import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  fetchOrganizerDashboard,
  cancelCampusEvent,
} from '../../lib/eventService.ts';
import type { CampusEvent } from '../../types/events.ts';
import { CreateEventModal } from './CreateEventModal.tsx';
import {
  ArrowLeft,
  Calendar,
  Plus,
  Users,
  Sparkles,
  Loader2,
  XCircle,
} from 'lucide-react';

export const OrganizerCentreView: React.FC = () => {
  const { goBack, navigateTo, currentUser, addToast } = useApp();
  const { user } = useAuth();
  const userId = user?.id || currentUser?.id;

  const [loading, setLoading] = useState(true);
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalInterested, setTotalInterested] = useState(0);
  const [totalGoing, setTotalGoing] = useState(0);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchOrganizerDashboard(userId);
      setTotalEvents(data.totalEvents);
      setTotalInterested(data.totalInterested);
      setTotalGoing(data.totalGoing);
      setEvents(data.events);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="flex flex-col gap-4 pb-12">
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={goBack}
            className="p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[var(--color-text-primary)]">
              Organizer Centre
            </h1>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Manage your campus events and track student RSVPs
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="px-3.5 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>New Event</span>
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Events Hosted', value: totalEvents, icon: Calendar },
          { label: 'Interested', value: totalInterested, icon: Sparkles },
          { label: 'Going RSVPs', value: totalGoing, icon: Users },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-xs"
            >
              <Icon className="w-4 h-4 text-[var(--color-primary)] mb-1.5" />
              <p className="text-xl font-extrabold text-[var(--color-text-primary)] tabular-nums">
                {stat.value}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl">
          <p className="text-sm font-bold text-[var(--color-text-primary)]">
            You haven&apos;t hosted any events yet
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            Tap New Event above to publish an official campus programme.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((ev) => (
            <div
              key={ev.id}
              onClick={() => navigateTo('event-detail', { eventId: ev.id })}
              className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-[var(--color-primary)]/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                    {ev.title}
                  </h3>
                  {ev.status === 'cancelled' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-500">
                      Cancelled
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">
                  {new Date(ev.startTime).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  · {ev.venue}
                </p>
                <p className="text-[11px] text-[var(--color-primary)] font-semibold mt-1">
                  {ev.goingCount} going · {ev.interestedCount} interested
                </p>
              </div>

              {ev.status !== 'cancelled' && userId && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const res = await cancelCampusEvent(ev.id, userId);
                    if (res.success) {
                      addToast('Event cancelled.', 'info');
                      loadDashboard();
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl border border-rose-500/30 text-rose-500 text-xs font-bold flex items-center gap-1 hover:bg-rose-500/10 shrink-0"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <CreateEventModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => loadDashboard()}
      />
    </div>
  );
};
