import React, { useEffect, useState } from 'react';
import type { MessageAttachment } from '../../types/index.ts';
import type { Story } from '../../types/stories.ts';
import { fetchStoryById } from '../../lib/storyService.ts';
import { extractStoryIdFromAttachment, isStoryExpired } from '../../lib/storyUtils.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Play, Film, AlertCircle } from 'lucide-react';

interface StoryReplyAttachmentCardProps {
  attachment: MessageAttachment;
  isOutgoing: boolean;
}

const CARD_GRADIENTS: Record<string, string> = {
  'from-blue-600 via-indigo-700 to-slate-950': 'from-blue-600 via-indigo-700 to-slate-950',
  'from-rose-600 via-pink-700 to-slate-950': 'from-rose-600 via-pink-700 to-slate-950',
  'from-emerald-600 via-teal-700 to-slate-950': 'from-emerald-600 via-teal-700 to-slate-950',
  'from-purple-600 via-fuchsia-800 to-slate-950': 'from-purple-600 via-fuchsia-800 to-slate-950',
  'from-amber-500 via-orange-600 to-rose-950': 'from-amber-500 via-orange-600 to-rose-950',
  'from-slate-900 via-neutral-900 to-black': 'from-slate-900 via-neutral-900 to-black',
};

export const StoryReplyAttachmentCard: React.FC<StoryReplyAttachmentCardProps> = ({
  attachment,
  isOutgoing,
}) => {
  const { currentUser, openStoryById } = useApp();
  const storyId = extractStoryIdFromAttachment(attachment);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    storyId ? 'loading' : 'unavailable'
  );
  const [story, setStory] = useState<Story | null>(null);
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!storyId) {
      setStatus('unavailable');
      setStory(null);
      return;
    }

    setStatus('loading');
    setMediaFailed(false);

    fetchStoryById(storyId, currentUser.id || undefined)
      .then((res) => {
        if (cancelled) return;
        if (res.status === 'ok') {
          setStory(res.story);
          setStatus('ready');
        } else {
          setStory(null);
          setStatus('unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStory(null);
          setStatus('unavailable');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storyId, currentUser.id]);

  if (status === 'loading') {
    return (
      <div
        className={`w-52 sm:w-60 rounded-xl p-2.5 border animate-pulse ${
          isOutgoing
            ? 'bg-white/10 border-white/20'
            : 'bg-[var(--color-bg-main)] border-[var(--color-border)]'
        }`}
      >
        <div className="h-3 w-24 rounded bg-current/20 mb-2" />
        <div className="h-24 w-full rounded-lg bg-current/15" />
      </div>
    );
  }

  if (status === 'unavailable' || !story) {
    return (
      <div
        className={`w-52 sm:w-60 rounded-xl p-2.5 border flex items-center gap-2.5 text-left ${
          isOutgoing
            ? 'bg-white/10 border-white/20 text-white/85'
            : 'bg-[var(--color-bg-main)] border-[var(--color-border)] text-[var(--color-text-secondary)]'
        }`}
      >
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            isOutgoing ? 'bg-white/15' : 'bg-[var(--color-border)]/60'
          }`}
        >
          <AlertCircle className="w-4 h-4 opacity-80" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold truncate">Story unavailable</p>
          <p className="text-[10px] opacity-75 leading-snug">
            This story may have been deleted or can no longer be viewed.
          </p>
        </div>
      </div>
    );
  }

  const rawResolvedUrl = story.media_url || story.storage_path || '';
  const safeMediaUrl =
    rawResolvedUrl && !rawResolvedUrl.toLowerCase().startsWith('story://')
      ? rawResolvedUrl
      : '';
  const expired = Boolean(story.is_expired || isStoryExpired(story.expires_at));
  const authorFirstName = story.user?.name?.split(' ')[0] || 'Student';
  const captionOrText =
    story.media_type === 'text' ? story.text_content : story.caption;

  return (
    <button
      type="button"
      onClick={() => openStoryById(story.id, { fallbackStory: story })}
      className={`w-52 sm:w-60 rounded-xl overflow-hidden border text-left transition-all active:scale-[0.98] block ${
        isOutgoing
          ? 'bg-white/15 border-white/25 text-white hover:bg-white/20'
          : 'bg-[var(--color-bg-main)] border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50'
      }`}
    >
      {/* Header label */}
      <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold opacity-90 border-b border-current/10">
        <span className="truncate">Replied to {authorFirstName}&apos;s story</span>
        {expired && (
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
              isOutgoing
                ? 'bg-white/20 text-white'
                : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
            }`}
          >
            Expired
          </span>
        )}
      </div>

      {/* Media or Text Preview */}
      {story.media_type === 'text' ? (
        <div
          className={`w-full h-24 bg-gradient-to-tr ${
            (story.background_color && CARD_GRADIENTS[story.background_color]) ||
            'from-indigo-800 via-blue-800 to-sky-700'
          } flex items-center justify-center p-3 text-center`}
        >
          <p className="text-white text-xs font-bold line-clamp-3 leading-snug drop-shadow-xs">
            {story.text_content || 'Text story'}
          </p>
        </div>
      ) : story.media_type === 'video' ? (
        <div className="relative w-full h-28 bg-black flex items-center justify-center overflow-hidden">
          {!mediaFailed && story.thumbnail_url ? (
            <img
              src={story.thumbnail_url}
              alt="Story video preview"
              referrerPolicy="no-referrer"
              onError={() => setMediaFailed(true)}
              className="w-full h-full object-cover opacity-90"
            />
          ) : !mediaFailed && safeMediaUrl ? (
            <video
              src={safeMediaUrl}
              muted
              playsInline
              preload="metadata"
              onError={() => setMediaFailed(true)}
              className="w-full h-full object-cover opacity-90 pointer-events-none"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-white/70 gap-1">
              <Film className="w-5 h-5" />
              <span className="text-[10px] font-medium">Video story</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
            <span className="w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-xs shadow-md">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </span>
          </div>
        </div>
      ) : (
        <div className="relative w-full h-28 bg-slate-900 flex items-center justify-center overflow-hidden">
          {!mediaFailed && safeMediaUrl ? (
            <img
              src={safeMediaUrl}
              alt="Story preview"
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => setMediaFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[10px] text-white/75 px-3 text-center">
              Tap to view story
            </span>
          )}
        </div>
      )}

      {/* Original Story Caption (for image/video stories) */}
      {story.media_type !== 'text' && captionOrText && (
        <div className="px-2.5 py-1.5 text-[11px] opacity-90 line-clamp-2 leading-snug">
          {captionOrText}
        </div>
      )}
    </button>
  );
};
