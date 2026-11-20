import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  fetchEventById,
  fetchEventParticipants,
  respondToEvent,
  toggleSaveEvent,
  cancelCampusEvent,
} from '../../lib/eventService.ts';
import type { CampusEvent, EventParticipant, EventResponse } from '../../types/events.ts';
import { Avatar } from '../common/Avatar.tsx';
import { LinkifiedText } from '../common/LinkifiedText.tsx';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Bookmark,
  Check,
  ExternalLink,
  Loader2,
  Users,
  XCircle,
} from 'lucide-react';

interface EventDetailViewProps {
  eventId: string;
  onBack?: () => void;
}

export const EventDetailView: React.FC<EventDetailViewProps> = ({ eventId, onBack }) => {
  const { goBack, currentUser, addToast, navigateTo } = useApp();
  const { user } = useAuth();
  const userId = user?.id || currentUser?.id;

  const [event, setEvent] = useState<CampusEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [ev, parts] = await Promise.all([
        fetchEventById(eventId, userId),
        fetchEventParticipants(eventId),
      ]);
      setEvent(ev);
      setParticipants(parts);
    } finally {
      setLoading(false);
    }
  }, [eventId, userId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleRespond = async (response: EventResponse) => {
    if (!event || !userId || actionLoading) return;
    setActionLoading(true);
    try {
      const next = event.userResponse === response ? null : response;
      const res = await respondToEvent(event.id, userId, next);
      if (res.success) {
        setEvent({
          ...event,
          userResponse: next,
          interestedCount: res.interestedCount,
          goingCount: res.goingCount,
        });
        setParticipants(await fetchEventParticipants(event.id));
      } else {
        addToast(res.error || 'Could not update RSVP.', 'warning');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !event) {
    return (
      <div className="p-10 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (!event) {
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
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">Event not found</h2>
        </div>
      </div>
    );
  }

  const startDate = new Date(event.startTime);
  const isOrganizer = Boolean(event.isOrganizer || (userId && event.organizerId === userId));

  return (
    <div className="flex flex-col gap-4 pb-12">
      <button
        type="button"
        onClick={onBack || goBack}
        className="self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Events</span>
      </button>

      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm">
        {event.posterUrl ? (
          <div className="w-full max-h-80 bg-black flex items-center justify-center overflow-hidden">
            <img src={event.posterUrl} alt={event.title} className="w-full h-full object-contain max-h-80" />
          </div>
        ) : (
          <div className="h-40 w-full bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center text-white/30">
            <Calendar className="w-12 h-12" />
          </div>
        )}

        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-md bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-xs font-bold mb-1.5">
                {event.category}
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
                {event.title}
              </h1>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                Hosted by <strong className="text-[var(--color-text-primary)]">{event.organizerName}</strong>
              </p>
            </div>

            {userId && (
              <button
                type="button"
                onClick={async () => {
                  const next = !event.isSaved;
                  setEvent({ ...event, isSaved: next });
                  await toggleSaveEvent(event.id, userId, next);
                }}
                className={`p-2.5 rounded-xl border transition-colors ${
                  event.isSaved
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                    : 'bg-[var(--color-bg-main)] border-[var(--color-border)] text-[var(--color-text-secondary)]'
                }`}
                title={event.isSaved ? 'Saved' : 'Save event'}
              >
                <Bookmark className={`w-4 h-4 ${event.isSaved ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs">
            <div className="flex items-center gap-2 text-[var(--color-text-primary)]">
              <Calendar className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
              <span>
                {startDate.toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}{' '}
                · {startDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[var(--color-text-primary)]">
              <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>
                {event.venue} · {event.campus}
              </span>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-line">
            <LinkifiedText text={event.description} />
          </p>

          {event.registrationLink && (
            <a
              href={event.registrationLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-primary)] hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>External Registration / Portal Link</span>
            </a>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <Users className="w-4 h-4 text-[var(--color-primary)]" />
              <span>
                <strong className="text-[var(--color-text-primary)]">{event.goingCount}</strong> going ·{' '}
                <strong className="text-[var(--color-text-primary)]">{event.interestedCount}</strong> interested
              </span>
            </div>

            <div className="flex items-center gap-2">
              {event.status !== 'cancelled' && (
                <>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleRespond('interested')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                      event.userResponse === 'interested'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                        : 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
                    }`}
                  >
                    Interested
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleRespond('going')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                      event.userResponse === 'going'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[var(--color-primary)] text-white'
                    }`}
                  >
                    {event.userResponse === 'going' && <Check className="w-3.5 h-3.5" />}
                    <span>{event.userResponse === 'going' ? 'Going' : 'Attend'}</span>
                  </button>
                </>
              )}

              {isOrganizer && event.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!userId) return;
                    const res = await cancelCampusEvent(event.id, userId);
                    if (res.success) {
                      addToast('Event cancelled.', 'info');
                      setEvent({ ...event, status: 'cancelled' });
                    }
                  }}
                  className="px-3 py-2 rounded-xl border border-rose-500/30 text-rose-500 text-xs font-bold flex items-center gap-1 hover:bg-rose-500/10"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancel Event</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Attendees List */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)]">
          Participants ({participants.length})
        </h2>
        {participants.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">Be the first student to RSVP!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {participants.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigateTo('user-profile', { userId: p.userId })}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar src={p.avatar} name={p.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{p.name}</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                      {p.department} · {p.level}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize shrink-0 ${
                    p.response === 'going'
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : 'bg-amber-500/15 text-amber-500'
                  }`}
                >
                  {p.response}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
