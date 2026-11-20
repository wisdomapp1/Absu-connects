import React from 'react';
import type { CampusEvent, EventResponse } from '../../types/events.ts';
import { Calendar, MapPin, Users, Bookmark, Check, Trash2, ArrowRight } from 'lucide-react';

interface EventCardProps {
  event: CampusEvent;
  onSelect: (event: CampusEvent) => void;
  onRespond?: (event: CampusEvent, response: EventResponse, e: React.MouseEvent) => void;
  onToggleSave?: (event: CampusEvent, e: React.MouseEvent) => void;
  onDelete?: (event: CampusEvent, e: React.MouseEvent) => void;
  canDelete?: boolean;
  isActionLoading?: boolean;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  onSelect,
  onRespond,
  onToggleSave,
  onDelete,
  canDelete,
  isActionLoading,
}) => {
  const startDate = new Date(event.startTime);
  const monthStr = startDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  const dayStr = startDate.getDate();
  const timeStr = startDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });

  const isGoing = event.userResponse === 'going';
  const isInterested = event.userResponse === 'interested';

  return (
    <div
      onClick={() => onSelect(event)}
      className="group relative bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between select-none"
    >
      <div>
        {/* Event Poster Banner */}
        <div className="relative h-40 sm:h-48 w-full bg-slate-950 overflow-hidden flex items-center justify-center">
          {event.posterUrl ? (
            <img
              src={event.posterUrl}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center text-white/30">
              <Calendar className="w-12 h-12" />
            </div>
          )}

          {/* Date Floating Badge */}
          <div className="absolute top-3 left-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl px-2.5 py-1.5 shadow-md flex flex-col items-center justify-center border border-black/5 dark:border-white/10 shrink-0">
            <span className="text-[10px] font-black text-[var(--color-primary)] tracking-wider">
              {monthStr}
            </span>
            <span className="text-base font-black text-slate-900 dark:text-white leading-none">
              {dayStr}
            </span>
          </div>

          {/* Top Right Actions: Delete & Save Bookmark */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
            {canDelete && onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(event, e);
                }}
                className="p-2 rounded-xl backdrop-blur-md bg-red-600/90 hover:bg-red-600 text-white transition-all shadow-md active:scale-95"
                title="Delete event"
                aria-label="Delete event"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {onToggleSave && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave(event, e);
                }}
                className={`p-2 rounded-xl backdrop-blur-md transition-all ${
                  event.isSaved
                    ? 'bg-[var(--color-primary)] text-white shadow-md'
                    : 'bg-black/40 hover:bg-black/60 text-white'
                }`}
                title={event.isSaved ? 'Saved to bookmarks' : 'Save event'}
              >
                <Bookmark className={`w-4 h-4 ${event.isSaved ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>

          {/* Status Overlay if cancelled */}
          {event.status === 'cancelled' && (
            <div className="absolute inset-0 bg-red-950/80 backdrop-blur-xs flex items-center justify-center text-white font-black text-xs uppercase tracking-wider">
              Event Cancelled
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--color-primary)] mb-1.5">
            <span className="px-2 py-0.5 rounded-md bg-[var(--color-primary-subtle)]">
              {event.category}
            </span>
            <span>·</span>
            <span className="text-[var(--color-text-secondary)] font-normal">{timeStr}</span>
          </div>

          <h3 className="font-extrabold text-sm sm:text-base text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-2 leading-snug">
            {event.title}
          </h3>

          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] truncate">
            <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate">{event.venue}</span>
          </div>

          <div className="mt-2 flex items-center gap-2 pt-2 border-t border-[var(--color-border)]/60">
            {event.organizerAvatar ? (
              <img
                src={event.organizerAvatar}
                alt={event.organizerName}
                className="w-5 h-5 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-[10px] font-bold flex items-center justify-center shrink-0">
                {event.organizerName.charAt(0)}
              </div>
            )}
            <span className="text-[11px] text-[var(--color-text-secondary)] truncate">
              Hosted by <strong className="text-[var(--color-text-primary)]">{event.organizerName}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Footer Info: RSVPs & Action Buttons */}
      <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-app)]/40 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)] font-medium">
          <span className="flex items-center gap-1 font-bold text-[var(--color-text-primary)]">
            <Users className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>{event.goingCount}</span>
          </span>
          <span>going</span>
          <span>·</span>
          <span>{event.interestedCount} interested</span>
        </div>

        <div className="flex items-center gap-1.5">
          {onRespond && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRespond(event, 'interested', e);
                }}
                disabled={isActionLoading || event.status === 'cancelled'}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
                  isInterested
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Interested
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRespond(event, 'going', e);
                }}
                disabled={isActionLoading || event.status === 'cancelled'}
                className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
                  isGoing
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-xs'
                }`}
              >
                {isGoing && <Check className="w-3 h-3" />}
                <span>{isGoing ? 'Going' : 'Attend'}</span>
              </button>
            </>
          )}

          <div className="w-6 h-6 rounded-lg bg-[var(--color-border)]/50 flex items-center justify-center text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] transition-colors shrink-0">
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
};
