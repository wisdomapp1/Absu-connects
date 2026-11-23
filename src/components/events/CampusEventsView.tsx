import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  fetchCampusEvents,
  respondToEvent,
  toggleSaveEvent,
  deleteCampusEvent,
} from '../../lib/eventService.ts';
import { EVENT_CATEGORIES, type CampusEvent, type EventResponse } from '../../types/events.ts';
import { EventCard } from './EventCard.tsx';
import { CreateEventModal } from './CreateEventModal.tsx';
import {
  ArrowLeft,
  Calendar,
  Search,
  Plus,
  LayoutDashboard,
  RefreshCw,
} from 'lucide-react';

interface CampusEventsViewProps {
  onSelectEvent?: (eventId: string) => void;
}

export const CampusEventsView: React.FC<CampusEventsViewProps> = ({ onSelectEvent }) => {
  const { goBack, navigateTo, addToast, currentUser } = useApp();
  const { user } = useAuth();
  const userId = user?.id || currentUser?.id;

  const [tab, setTab] = useState<'all' | 'today' | 'saved' | 'my'>('all');
  const [category, setCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCampusEvents({
        tab,
        category: category === 'All' ? undefined : category,
        search: search.trim() || undefined,
        userId,
      });
      setEvents(list);
    } finally {
      setLoading(false);
    }
  }, [tab, category, search, userId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleRespond = async (event: CampusEvent, response: EventResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId) {
      addToast('Please sign in to RSVP to campus events.', 'warning');
      return;
    }
    const nextResponse = event.userResponse === response ? null : response;
    setActionLoadingId(event.id);
    try {
      const res = await respondToEvent(event.id, userId, nextResponse);
      if (res.success) {
        setEvents((prev) =>
          prev.map((ev) =>
            ev.id === event.id
              ? {
                  ...ev,
                  userResponse: nextResponse,
                  interestedCount: res.interestedCount,
                  goingCount: res.goingCount,
                }
              : ev
          )
        );
      } else {
        addToast(res.error || 'Could not update RSVP.', 'warning');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleSave = async (event: CampusEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId) {
      addToast('Please sign in to save events.', 'warning');
      return;
    }
    const nextSaved = !event.isSaved;
    setEvents((prev) =>
      prev.map((ev) => (ev.id === event.id ? { ...ev, isSaved: nextSaved } : ev))
    );
    const res = await toggleSaveEvent(event.id, userId, nextSaved);
    if (!res.success) {
      setEvents((prev) =>
        prev.map((ev) => (ev.id === event.id ? { ...ev, isSaved: !nextSaved } : ev))
      );
      addToast(res.error || 'Could not update saved state.', 'warning');
    }
  };

  const handleDelete = async (event: CampusEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId) return;
    const res = await deleteCampusEvent(event.id, userId);
    if (res.success) {
      addToast('Event archived.', 'info');
      setEvents((prev) => prev.filter((ev) => ev.id !== event.id));
    } else {
      addToast(res.error || 'Could not delete event.', 'warning');
    }
  };

  const handleOpenEvent = (event: CampusEvent) => {
    if (onSelectEvent) onSelectEvent(event.id);
    else navigateTo('event-detail', { eventId: event.id });
  };

  return (
    <div className="flex flex-col gap-4 pb-12">
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={goBack}
              className="p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-[var(--color-text-primary)] tracking-tight">
                Campus Events
              </h1>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Faculty weeks, SUG programmes, tech workshops &amp; fellowships
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={loadEvents}
              disabled={loading}
              className="p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              title="Refresh events"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => navigateTo('organizer-centre')}
              className="px-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] flex items-center gap-1.5"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Organizer Centre</span>
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Host Event</span>
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search seminars, venues, faculties..."
              autoCorrect="on"
              autoCapitalize="none"
              spellCheck={true}
              enterKeyHint="search"
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {[
              { id: 'all' as const, label: 'All Events' },
              { id: 'today' as const, label: 'Today' },
              { id: 'saved' as const, label: 'Saved' },
              { id: 'my' as const, label: 'My RSVPs' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-[var(--color-primary)] text-white shadow-xs'
                    : 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {['All', ...EVENT_CATEGORIES].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                  category === cat
                    ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-card)]'
                    : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-72 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] animate-pulse"
            />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">No campus events found</h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1 max-w-xs mx-auto">
              Publish a departmental seminar, fellowship programme, or campus competition!
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-1 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Host Campus Event</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {events.map((ev) => (
            <EventCard
              key={ev.id}
              event={ev}
              onSelect={handleOpenEvent}
              onRespond={handleRespond}
              onToggleSave={handleToggleSave}
              onDelete={handleDelete}
              canDelete={Boolean(ev.isOrganizer || (userId && ev.organizerId === userId))}
              isActionLoading={actionLoadingId === ev.id}
            />
          ))}
        </div>
      )}

      <CreateEventModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(newEvent) => setEvents((prev) => [newEvent, ...prev])}
      />
    </div>
  );
};
