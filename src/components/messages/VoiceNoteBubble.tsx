import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Loader2,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Mic,
} from 'lucide-react';

interface VoiceNoteBubbleProps {
  src?: string;
  fileName?: string;
  isOutgoing: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'seen' | 'failed' | 'queued';
  isSeen?: boolean;
  onRetry?: () => void;
}

const BAR_COUNT = 28;

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export const VoiceNoteBubble: React.FC<VoiceNoteBubbleProps> = ({
  src,
  fileName,
  isOutgoing,
  status,
  isSeen,
  onRetry,
}) => {
  const instanceId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [audioError, setAudioError] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);

  // Deterministic waveform heights based on attachment metadata so bars never jitter on re-render
  const waveformBars = useMemo(() => {
    const seedInput = fileName || src || 'absu_voice_note';
    let hash = 2166136261;
    for (let i = 0; i < seedInput.length; i++) {
      hash ^= seedInput.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    const bars: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      hash ^= i * 37 + 17;
      hash = Math.imul(hash, 16777619);
      const normalized = ((hash >>> 0) % 72) + 24; // 24% .. 95%
      bars.push(normalized);
    }
    return bars;
  }, [fileName, src]);

  // Pause this player if another voice note starts playing
  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom.detail !== instanceId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener('absu-voice-play', handleOtherPlay);
    return () => {
      window.removeEventListener('absu-voice-play', handleOtherPlay);
    };
  }, [instanceId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    setAudioError(false);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [src, retryCounter]);

  const effectiveSrc = useMemo(() => {
    if (!src) return undefined;
    if (retryCounter === 0 || src.startsWith('blob:')) return src;
    const sep = src.includes('?') ? '&' : '?';
    return `${src}${sep}_r=${retryCounter}`;
  }, [src, retryCounter]);

  const isUploading = status === 'sending' || status === 'queued';
  const isSendFailed = status === 'failed';

  const togglePlay = async () => {
    if (isSendFailed || audioError || !effectiveSrc || !audioRef.current) return;

    const audio = audioRef.current;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    window.dispatchEvent(new CustomEvent('absu-voice-play', { detail: instanceId }));
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setAudioError(true);
      setIsPlaying(false);
    }
  };

  const handleScrub = (barIndex: number) => {
    if (!audioRef.current || !Number.isFinite(duration) || duration <= 0) return;
    const targetTime = ((barIndex + 0.5) / BAR_COUNT) * duration;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const cycleRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPlaybackRate((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  const handleRetryAudio = () => {
    if (isSendFailed && onRetry) {
      onRetry();
      return;
    }
    setAudioError(false);
    setRetryCounter((c) => c + 1);
  };

  const progressRatio = duration > 0 && Number.isFinite(duration) ? Math.min(1, currentTime / duration) : 0;
  const activeBars = Math.round(progressRatio * BAR_COUNT);
  const timeDisplay =
    isPlaying || currentTime > 0
      ? formatSeconds(currentTime)
      : duration > 0
      ? formatSeconds(duration)
      : '0:00';

  const renderTick = () => {
    if (!isOutgoing) return null;
    if (status === 'sending' || status === 'queued') {
      return <Clock className="w-3 h-3 opacity-80 animate-pulse" aria-label="Sending" />;
    }
    if (status === 'failed') {
      return <AlertCircle className="w-3 h-3 text-rose-200" aria-label="Failed" />;
    }
    if (status === 'seen' || isSeen) {
      return <CheckCheck className="w-3.5 h-3.5 text-sky-200" aria-label="Seen" />;
    }
    if (status === 'delivered') {
      return <CheckCheck className="w-3.5 h-3.5 opacity-85" aria-label="Delivered" />;
    }
    return <Check className="w-3.5 h-3.5 opacity-80" aria-label="Sent" />;
  };

  return (
    <div
      className={`flex flex-col gap-1.5 min-w-[230px] sm:min-w-[260px] max-w-full rounded-xl px-2.5 py-2 ${
        isOutgoing
          ? 'bg-black/20 text-white'
          : 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)]'
      }`}
    >
      {effectiveSrc && (
        <audio
          ref={audioRef}
          src={effectiveSrc}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
          }}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
          }}
          onTimeUpdate={(e) => {
            setCurrentTime(e.currentTarget.currentTime);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onError={() => {
            setAudioError(true);
            setIsPlaying(false);
          }}
        />
      )}

      <div className="flex items-center gap-2.5">
        {/* Play / Pause / Uploading / Retry Button */}
        {isUploading ? (
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
              isOutgoing ? 'bg-white/20 text-white' : 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
            }`}
            aria-label="Uploading voice note"
          >
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : isSendFailed || audioError || !effectiveSrc ? (
          <button
            type="button"
            onClick={handleRetryAudio}
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
              isOutgoing
                ? 'bg-rose-500/80 hover:bg-rose-500 text-white'
                : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400'
            }`}
            aria-label="Retry voice note"
            title="Retry"
          >
            <RotateCcw className="w-4.5 h-4.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={togglePlay}
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
              isOutgoing
                ? 'bg-white text-[var(--color-primary)] hover:bg-white/90'
                : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]'
            }`}
            aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
          >
            {isPlaying ? (
              <Pause className="w-4.5 h-4.5 fill-current" />
            ) : (
              <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
            )}
          </button>
        )}

        {/* Interactive Scrubbable Waveform + Meta Row */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {isSendFailed || audioError || !effectiveSrc ? (
            <div className="flex items-center justify-between gap-2 py-1">
              <span
                className={`text-[11px] font-semibold truncate ${
                  isOutgoing ? 'text-rose-200' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {isSendFailed ? 'Voice note failed to send' : 'Could not load audio'}
              </span>
              <button
                type="button"
                onClick={handleRetryAudio}
                className={`text-[11px] font-bold underline shrink-0 ${
                  isOutgoing ? 'text-white' : 'text-[var(--color-primary)]'
                }`}
              >
                Retry
              </button>
            </div>
          ) : (
            <div
              className="flex items-center gap-[2px] h-7 cursor-pointer select-none"
              role="slider"
              aria-label="Voice note playback progress"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration || 0)}
              aria-valuenow={Math.round(currentTime)}
            >
              {waveformBars.map((heightPct, idx) => {
                const isPlayed = idx < activeBars;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleScrub(idx)}
                    style={{ height: `${heightPct}%` }}
                    className={`flex-1 min-w-[2px] rounded-full transition-colors ${
                      isOutgoing
                        ? isPlayed
                          ? 'bg-white'
                          : 'bg-white/35 hover:bg-white/60'
                        : isPlayed
                        ? 'bg-[var(--color-primary)]'
                        : 'bg-[var(--color-text-secondary)]/30 hover:bg-[var(--color-primary)]/50'
                    }`}
                    aria-label={`Seek to ${Math.round(((idx + 1) / BAR_COUNT) * 100)}%`}
                  />
                );
              })}
            </div>
          )}

          {/* Bottom Metadata Bar */}
          <div className="flex items-center justify-between gap-2 text-[10px] leading-none">
            <div className="flex items-center gap-1.5">
              <Mic
                className={`w-3 h-3 ${
                  isOutgoing ? 'text-white/80' : 'text-[var(--color-primary)]'
                }`}
              />
              <span
                className={`font-semibold tabular-nums ${
                  isOutgoing ? 'text-white/90' : 'text-[var(--color-text-secondary)]'
                }`}
              >
                {isUploading ? 'Sending...' : timeDisplay}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {!isSendFailed && !audioError && effectiveSrc && (
                <button
                  type="button"
                  onClick={cycleRate}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums transition-colors ${
                    isOutgoing
                      ? 'bg-white/15 hover:bg-white/25 text-white'
                      : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                  title="Playback speed"
                >
                  {playbackRate}x
                </button>
              )}
              {renderTick()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
