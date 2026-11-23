import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Scissors,
  Check,
  Maximize2,
  Sparkles,
  Camera,
} from 'lucide-react';

export interface VideoEditorSettings {
  startTime: number;
  endTime: number;
  duration: number;
  isMuted: boolean;
  aspectRatio: '16:9' | '1:1' | '9:16' | 'original';
  caption?: string;
  posterDataUrl?: string;
}

interface VideoEditorModalProps {
  isOpen: boolean;
  videoSrc: string;
  fileName: string;
  initialSettings?: Partial<VideoEditorSettings>;
  onClose: () => void;
  onApply: (settings: VideoEditorSettings) => void;
}

export const VideoEditorModal: React.FC<VideoEditorModalProps> = ({
  isOpen,
  videoSrc,
  fileName,
  initialSettings,
  onClose,
  onApply,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  // Trimmer states (in seconds)
  const [startTime, setStartTime] = useState(initialSettings?.startTime || 0);
  const [endTime, setEndTime] = useState(initialSettings?.endTime || 0);

  // Settings
  const [isMuted, setIsMuted] = useState(initialSettings?.isMuted ?? false);
  const [aspectRatio, setAspectRatio] = useState<VideoEditorSettings['aspectRatio']>(
    initialSettings?.aspectRatio || 'original'
  );
  const [caption, setCaption] = useState(initialSettings?.caption || '');
  const [posterDataUrl, setPosterDataUrl] = useState<string | undefined>(
    initialSettings?.posterDataUrl
  );
  const [capturedNotice, setCapturedNotice] = useState(false);

  // Load video metadata
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      const dur = video.duration || 0;
      setTotalDuration(dur);
      if (!initialSettings?.endTime || initialSettings.endTime > dur) {
        setEndTime(dur);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoSrc, initialSettings]);

  // Sync playback position & loop trimmed range
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (endTime > 0 && video.currentTime >= endTime) {
        video.currentTime = startTime;
        if (!isPlaying) {
          video.pause();
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [startTime, endTime, isPlaying]);

  if (!isOpen) return null;

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      if (video.currentTime >= endTime || video.currentTime < startTime) {
        video.currentTime = startTime;
      }
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleSeek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const handleStartTrimChange = (val: number) => {
    const newStart = Math.min(val, endTime - 1);
    setStartTime(Math.max(0, newStart));
    handleSeek(newStart);
  };

  const handleEndTrimChange = (val: number) => {
    const newEnd = Math.max(val, startTime + 1);
    setEndTime(Math.min(totalDuration, newEnd));
    handleSeek(newEnd);
  };

  const resetTrim = () => {
    setStartTime(0);
    setEndTime(totalDuration);
    handleSeek(0);
  };

  const captureFramePoster = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setPosterDataUrl(dataUrl);
      setCapturedNotice(true);
      setTimeout(() => setCapturedNotice(false), 2000);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSave = () => {
    onApply({
      startTime,
      endTime: endTime || totalDuration,
      duration: Math.max(1, (endTime || totalDuration) - startTime),
      isMuted,
      aspectRatio,
      caption: caption.trim() || undefined,
      posterDataUrl,
    });
    onClose();
  };

  const selectedClipDuration = Math.max(0, (endTime || totalDuration) - startTime);

  return (
    <div
      className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-label="Campus Video Editor"
    >
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      <div
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full sm:max-w-3xl h-full sm:h-auto sm:max-h-[92vh] sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[var(--color-text-primary)] truncate">
                Campus Video Studio
              </h2>
              <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                {fileName} · {formatTime(totalDuration)} total
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-sm transition-transform active:scale-95 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Apply</span>
            </button>
          </div>
        </div>

        {/* Studio Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
          {/* Video Preview Canvas */}
          <div className="relative rounded-2xl overflow-hidden bg-black flex items-center justify-center min-h-[240px] max-h-[380px] group border border-black/20">
            <video
              ref={videoRef}
              src={videoSrc}
              muted={isMuted}
              playsInline
              onClick={togglePlay}
              className={`max-h-[360px] w-auto mx-auto object-contain transition-all ${
                aspectRatio === '1:1'
                  ? 'aspect-square object-cover max-w-[320px]'
                  : aspectRatio === '9:16'
                  ? 'aspect-[9/16] object-cover max-w-[220px]'
                  : aspectRatio === '16:9'
                  ? 'aspect-video object-cover w-full'
                  : ''
              }`}
            />

            {/* Center Play/Pause button */}
            <button
              onClick={togglePlay}
              className={`absolute w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs transition-all ${
                isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100 scale-100'
              }`}
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>

            {/* Video Controls Bar Overlay */}
            <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsMuted((prev) => !prev)}
                  className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <span className="text-xs font-mono font-medium tracking-tight">
                  {formatTime(currentTime)} / {formatTime(totalDuration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={captureFramePoster}
                  className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[11px] font-semibold flex items-center gap-1 transition-colors backdrop-blur-xs"
                  title="Capture current frame as post cover"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{capturedNotice ? 'Cover Captured!' : 'Set Cover'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Trimmer & Timeline Controls */}
          <div className="p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-[var(--color-primary)]" />
                <span className="text-xs font-bold text-[var(--color-text-primary)]">
                  Trim Clip Range
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-bold">
                  {Math.round(selectedClipDuration)}s selected
                </span>
              </div>

              <button
                onClick={resetTrim}
                className="text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Range</span>
              </button>
            </div>

            {/* Range sliders */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between text-[11px] text-[var(--color-text-secondary)] font-mono">
                <span>Start: {formatTime(startTime)}</span>
                <span>Current: {formatTime(currentTime)}</span>
                <span>End: {formatTime(endTime || totalDuration)}</span>
              </div>

              {/* Start Slider */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] w-10">
                  Start:
                </span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, totalDuration - 1)}
                  step="0.1"
                  value={startTime}
                  onChange={(e) => handleStartTrimChange(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)] cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-[var(--color-text-primary)] w-12 text-right">
                  {formatTime(startTime)}
                </span>
              </div>

              {/* End Slider */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] w-10">
                  End:
                </span>
                <input
                  type="range"
                  min="1"
                  max={totalDuration || 1}
                  step="0.1"
                  value={endTime || totalDuration}
                  onChange={(e) => handleEndTrimChange(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)] cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-[var(--color-text-primary)] w-12 text-right">
                  {formatTime(endTime || totalDuration)}
                </span>
              </div>

              <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">
                Tip: ABSU student posts with video clips between 10s and 45s load fastest on campus Wi-Fi and mobile data.
              </p>
            </div>
          </div>

          {/* Aspect Ratio & Video Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Aspect Ratio */}
            <div className="p-3.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex flex-col gap-2">
              <span className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>Aspect Ratio Framing</span>
              </span>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {(['original', '16:9', '1:1', '9:16'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all ${
                      aspectRatio === ratio
                        ? 'bg-[var(--color-primary)] text-white shadow-xs'
                        : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    {ratio === 'original' ? 'Natural' : ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio & Cover Summary */}
            <div className="p-3.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex flex-col justify-between gap-2">
              <span className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Audio & Thumbnail</span>
              </span>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMuted((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                      isMuted
                        ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{isMuted ? 'Muted' : 'Sound On'}</span>
                  </button>
                </div>

                {posterDataUrl && (
                  <div className="flex items-center gap-1.5">
                    <img
                      src={posterDataUrl}
                      alt="Cover preview"
                      className="w-8 h-8 rounded-lg object-cover border border-[var(--color-border)]"
                    />
                    <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                      Custom cover
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Optional Caption */}
          <div className="p-3.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">
              Video Description / Caption (Optional)
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. Highlights from SUG football finals at Sports Complex"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
              enterKeyHint="done"
              className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <span className="text-[11px] text-[var(--color-text-secondary)]">
            Changes apply to your post draft attachment
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-sm transition-transform active:scale-95"
            >
              Save Clip Edits
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
