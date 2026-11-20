import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Calendar,
  MapPin,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Link as LinkIcon,
  AlertCircle,
} from 'lucide-react';
import {
  EVENT_CATEGORIES,
  EventCategory,
  CreateEventInput,
  CampusEvent,
} from '../../types/events.ts';
import { createCampusEvent } from '../../lib/eventService.ts';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newEvent: CampusEvent) => void;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { addToast } = useApp();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('Academic');
  const [venue, setVenue] = useState('');
  const [campus, setCampus] = useState('Uturu (Main Campus)');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('14:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('17:00');
  const [registrationLink, setRegistrationLink] = useState('');
  const [selectedPosterFile, setSelectedPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const posterPreviewRef = useRef<string>('');
  useEffect(() => {
    posterPreviewRef.current = posterPreview;
  }, [posterPreview]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  const cleanupPosterPreview = () => {
    const currentUrl = posterPreviewRef.current || posterPreview;
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      posterPreviewRef.current = '';
    }
    setPosterPreview('');
  };

  useEffect(() => {
    return () => {
      if (posterPreviewRef.current) {
        URL.revokeObjectURL(posterPreviewRef.current);
        posterPreviewRef.current = '';
      }
    };
  }, []);

  if (!isOpen) return null;

  const handlePosterSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      addToast('Please select a valid image file (JPG, PNG, WebP)', 'warning');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      addToast('Poster image size must be under 15MB', 'warning');
      return;
    }

    cleanupPosterPreview();
    const newPreview = URL.createObjectURL(file);
    setSelectedPosterFile(file);
    setPosterPreview(newPreview);
  };

  const handleRemovePoster = (e: React.MouseEvent) => {
    e.stopPropagation();
    cleanupPosterPreview();
    setSelectedPosterFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !venue.trim() || !startDate) {
      setErrorMsg('Please complete all required event fields (Title, Description, Venue, Date)');
      return;
    }

    if (!user) {
      setErrorMsg('Please sign in to publish a campus event');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      let fullStartISO: string;
      try {
        const d = new Date(`${startDate}T${startTime || '00:00'}`);
        fullStartISO = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      } catch {
        fullStartISO = new Date().toISOString();
      }

      let fullEndISO: string | undefined = undefined;
      if (endDate) {
        try {
          const d = new Date(`${endDate}T${endTime || '23:59'}`);
          if (!isNaN(d.getTime())) fullEndISO = d.toISOString();
        } catch {
          // ignore
        }
      }

      const input: CreateEventInput = {
        title: title.trim(),
        description: description.trim(),
        category,
        venue: venue.trim(),
        campus,
        startTime: fullStartISO,
        endTime: fullEndISO,
        registrationLink: registrationLink.trim() || undefined,
      };

      const res = await createCampusEvent(input, user.id, selectedPosterFile || undefined);

      if (res.success && res.event) {
        addToast(`🎉 Event "${res.event.title}" published to campus calendar!`, 'success');
        onCreated(res.event);
        handleReset();
      } else {
        setErrorMsg(res.error || 'Failed to create event. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating event';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setTitle('');
    setDescription('');
    setCategory('Academic');
    setVenue('');
    setCampus('Uturu (Main Campus)');
    setStartDate('');
    setStartTime('14:00');
    setEndDate('');
    setEndTime('17:00');
    setRegistrationLink('');
    setSelectedPosterFile(null);
    cleanupPosterPreview();
    setErrorMsg(null);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-event-title"
    >
      <div className="relative w-full max-w-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="create-event-title"
                className="text-base sm:text-lg font-black text-[var(--color-text-primary)] tracking-tight"
              >
                Create Campus Event
              </h2>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Publish a free seminar, competition, departmental week, or fellowship event
              </p>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="p-1.5 rounded-xl hover:bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Poster Picker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">
                Event Flyer / Poster
              </label>
              {posterPreview && (
                <span className="text-[11px] text-[var(--color-primary)] font-semibold">
                  Flyer attached
                </span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePosterSelect}
              className="hidden"
            />
            {posterPreview ? (
              <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] max-h-72 rounded-2xl bg-black/90 border border-[var(--color-border)] overflow-hidden flex items-center justify-center shadow-md group">
                <img
                  src={posterPreview}
                  alt="Flyer preview"
                  className="w-full h-full object-contain"
                />
                {/* Floating Action Controls */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-xl bg-black/70 hover:bg-black text-white text-xs font-bold backdrop-blur-md transition-all shadow-md"
                  >
                    Change Flyer
                  </button>
                  <button
                    type="button"
                    onClick={handleRemovePoster}
                    className="p-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white backdrop-blur-md transition-all shadow-md"
                    title="Remove flyer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {selectedPosterFile && (
                  <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-mono">
                    {(selectedPosterFile.size / (1024 * 1024)).toFixed(1)} MB
                  </div>
                )}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-36 rounded-2xl bg-[var(--color-bg-main)] border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] flex flex-col items-center justify-center cursor-pointer transition-all p-4 text-center group"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-[var(--color-text-primary)]">
                  Tap to upload event poster / flyer
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
                  Portrait or standard flyer proportions (PNG, JPG, WebP)
                </span>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
              Event Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. LAWSA Annual Moot Court Finals, NACOS Hackathon"
              maxLength={120}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 transition-all"
            />
          </div>

          {/* Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EventCategory)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 transition-all"
              >
                {EVENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Campus Location
              </label>
              <select
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 transition-all"
              >
                <option value="Uturu (Main Campus)">Uturu (Main Campus)</option>
                <option value="Umuahia Campus">Umuahia Campus</option>
                <option value="Aba Health Sciences">Aba Health Sciences</option>
                <option value="Online / Virtual">Online / Virtual</option>
              </select>
            </div>
          </div>

          {/* Venue */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
              Venue / Hall <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
              <input
                type="text"
                required
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. University e-Library Hall, Pavilion A Sports Arena"
                maxLength={100}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 transition-all"
              />
            </div>
          </div>

          {/* Date & Time Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Start Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 transition-all"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
              Event Details &amp; Programme <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should students expect? Mention speakers, agenda, special activities, and requirements..."
              maxLength={1000}
              className="w-full p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 resize-none transition-all"
            />
          </div>

          {/* Registration Link (Optional) */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
              External Registration Link <span className="text-[11px] font-normal text-[var(--color-text-secondary)]">(Optional)</span>
            </label>
            <div className="relative">
              <LinkIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
              <input
                type="url"
                value={registrationLink}
                onChange={(e) => setRegistrationLink(e.target.value)}
                placeholder="https://... (Google Forms, official portal or external RSVP link)"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 transition-all"
              />
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !venue.trim() || !startDate}
              className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-md shadow-[var(--color-primary)]/20 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Publishing Event...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Publish to Calendar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
