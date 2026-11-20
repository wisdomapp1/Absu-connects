import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchCampusEvents, respondToEvent } from '../../lib/eventService.ts';
import type { CampusEvent } from '../../types/events.ts';
import {
  Calendar,
  MapPin,
  Clock,
  ChevronRight,
  Check,
  Star,
  Plus,
  Sparkles,
} from 'lucide-react';

export const HomeEventsFeedCard: React.FC = () => {
  const { navigateTo, addToast } = useApp();
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rsvpLoadingId, setRsvpLoadingId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchCampusEvents({ tab: 'all', userId: currentUserId });
      setEvents(data.slice(0, 6));
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleRSVP = async (e: React.MouseEvent, event: CampusEvent) => {
    e.stopPropagation();
    if (!currentUserId) {
      addToast('Please sign in to RSVP for campus events', 'warning');
      return;
    }

    const nextResponse = event.userResponse === 'going' ? null : 'going';
    setRsvpLoadingId(event.id);

    try {
      const res = await respondToEvent(event.id, currentUserId, nextResponse);
      if (res.success) {
        addToast(
          nextResponse === 'going'
            ? `🎉 Marked as Going to "${event.title}"!`
            : 'RSVP updated.',
          'info'
        );
        setEvents((prev) =>
          prev.map((item) =>
            item.id === event.id
              ? {
                  ...item,
                  userResponse: nextResponse,
                  goingCount: res.goingCount,
                  interestedCount: res.interestedCount,
                }
              : item
          )
        );
      }
    } catch {
      addToast('Error updating RSVP', 'warning');
    } finally {
      setRsvpLoadingId(null);
    }
  };

  const formatEventDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
      return { day, time };
    } catch {
      return { day: 'Upcoming', time: '' };
    }
  };

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3.5 sm:p-4 shadow-sm transition-colors overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 leading-tight">
            <Calendar className="w-4 h-4 text-emerald-500" />
            <span>Campus Events & Bulletins</span>
          </h2>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
            Seminars, departmental meetings, workshops & student programmes
          </p>
        </div>

        <button
          onClick={() => navigateTo('events')}
          className="flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline shrink-0"
        >
          <span>See all</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-1 pt-1 -mx-3.5 sm:-mx-4 px-3.5 sm:px-4 hide-scrollbar">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="w-[230px] h-[160px] shrink-0 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="p-4 rounded-xl bg-[var(--color-bg-main)] border border-dashed border-[var(--color-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">No events scheduled yet</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">Organize a departmental seminar or fellowship event</p>
            </div>
          </div>
          <button
            onClick={() => navigateTo('events')}
            className="px-3 py-1.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:opacity-90 shrink-0"
          >
            Create
          </button>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 pt-1 -mx-3.5 sm:-mx-4 px-3.5 sm:px-4 hide-scrollbar snap-x">
          {events.map((event) => {
            const { day, time } = formatEventDate(event.startTime);
            const isGoing = event.userResponse === 'going';
            const isRsvping = rsvpLoadingId === event.id;

            return (
              <div
                key={event.id}
                onClick={() => navigateTo('event-detail', { eventId: event.id })}
                className="w-[240px] shrink-0 snap-start bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 rounded-2xl p-3 flex flex-col justify-between transition-all cursor-pointer hover:shadow-xs group"
              >
                <div>
                  {/* Category and Date Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-[10px] font-bold uppercase tracking-wider truncate">
                      {event.category}
                    </span>

                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold shrink-0">
                      {day}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-xs text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-2 leading-tight">
                    {event.title}
                  </h3>

                  {/* Venue and Time */}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] truncate">
                      <Clock className="w-3 h-3 text-[var(--color-primary)] shrink-0" />
                      <span className="truncate">{time || 'TBA'}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] truncate">
                      <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                      <span className="truncate">{event.venue}</span>
                    </div>
                  </div>
                </div>

                {/* RSVP Bottom Bar */}
                <div className="mt-3 pt-2.5 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
                  <div className="text-[10px] text-[var(--color-text-secondary)] font-medium">
                    <span className="font-bold text-[var(--color-text-primary)]">{event.goingCount}</span> going
                  </div>

                  <button
                    onClick={(e) => handleRSVP(e, event)}
                    disabled={isRsvping}
                    className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shadow-2xs ${
                      isGoing
                        ? 'bg-emerald-500 text-white'
                        : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white'
                    }`}
                  >
                    {isRsvping ? (
                      <span className="animate-spin text-xs">...</span>
                    ) : isGoing ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Going</span>
                      </>
                    ) : (
                      <>
                        <Star className="w-3 h-3" />
                        <span>Going?</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
