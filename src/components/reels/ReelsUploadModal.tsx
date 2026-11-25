import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { AttachedMediaItem, PostAudience, VideoEditSettings } from '../../types/index.ts';
import { safeReadAndPrepareVideo, categorizeMediaError, type MediaRecoveryState } from '../../lib/mediaRecovery.ts';
import { MediaRecoveryBanner } from '../common/MediaRecoveryBanner.tsx';
import { VideoEditorModal } from '../home/VideoEditorModal.tsx';
import { ReelsIcon } from '../common/ReelsIcon.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { Globe, GraduationCap, Loader2, Scissors, Users, Video, X } from 'lucide-react';

interface ReelsUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublished?: () => void;
}

const SUGGESTED_TAGS = ['#ABSU', '#CampusReels', '#Uturu', '#StudentLife', '#Talent'];

export const ReelsUploadModal: React.FC<ReelsUploadModalProps> = ({
  isOpen,
  onClose,
  onPublished,
}) => {
  const { createPost, addToast, activeIdentity } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [selectedVideo, setSelectedVideo] = useState<AttachedMediaItem | null>(null);
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<PostAudience>('Public');
  const [recovery, setRecovery] = useState<MediaRecoveryState | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const [isPublishing, setIsPublishing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  const revokePreview = (item: AttachedMediaItem | null) => {
    if (item?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }
  };

  const resetAll = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    revokePreview(selectedVideo);
    setSelectedVideo(null);
    setCaption('');
    setAudience('Public');
    setRecovery(null);
    setEditorOpen(false);
    setIsPublishing(false);
    setProgressText('');
    setProgressPercent(0);
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isPublishing) {
      abortRef.current?.abort();
    }
    resetAll();
    onClose();
  };

  const handleChooseVideo = () => {
    if (isPublishing) return;
    fileInputRef.current?.click();
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRecovery(null);
    const prepared = await safeReadAndPrepareVideo(file, {
      maxBytes: 50 * 1024 * 1024,
      maxDurationSeconds: 60,
    });

    if (!prepared.ok || !prepared.file || !prepared.previewUrl) {
      setRecovery(
        prepared.recovery || {
          category: 'file_read',
          fileName: file.name,
          title: 'Could Not Load Video',
          message: `Could not read "${file.name}". Tap "Choose File Again" to select another video.`,
          canChooseAgain: true,
        }
      );
      return;
    }

    revokePreview(selectedVideo);
    const item: AttachedMediaItem = {
      id: `reel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      file: prepared.file,
      buffer: prepared.buffer,
      previewUrl: prepared.previewUrl,
      type: 'video',
      name: prepared.file.name,
      sizeLabel: `${(prepared.file.size / (1024 * 1024)).toFixed(1)} MB`,
      duration: prepared.duration,
      videoSettings: {
        startTime: 0,
        endTime: prepared.duration || 0,
        duration: prepared.duration || 0,
        isMuted: false,
        aspectRatio: '9:16',
      },
    };
    setSelectedVideo(item);
  };

  const handleApplyEdit = (settings: VideoEditSettings) => {
    setSelectedVideo((prev) =>
      prev
        ? {
            ...prev,
            duration: settings.duration,
            videoSettings: settings,
          }
        : null
    );
    if (settings.caption && !caption.trim()) {
      setCaption(settings.caption);
    }
    setEditorOpen(false);
  };

  const handlePublish = async () => {
    if (!selectedVideo || isPublishing) return;
    setRecovery(null);
    setIsPublishing(true);
    setProgressPercent(2);
    setProgressText('Preparing reel...');

    const controller = new AbortController();
    abortRef.current = controller;

    let capturedError = '';
    try {
      const targetPageId = activeIdentity.type === 'page' ? activeIdentity.pageId : undefined;
      const ok = await createPost(
        caption.trim(),
        'General',
        targetPageId ? 'Public' : audience,
        selectedVideo,
        {
          pageId: targetPageId,
          signal: controller.signal,
          onProgress: (step) => setProgressText(step),
          onPercent: (pct) => setProgressPercent(pct),
          onError: (err) => {
            capturedError = err;
          },
        }
      );

      if (ok) {
        resetAll();
        onPublished?.();
        onClose();
        return;
      }

      if (controller.signal.aborted) {
        addToast('Reel upload cancelled.', 'info');
      } else {
        setRecovery(
          categorizeMediaError(
            new Error(capturedError || 'Could not upload reel. Check your connection and retry.'),
            {
              fileName: selectedVideo.name,
              phase: 'upload',
            }
          )
        );
      }
    } catch (err) {
      setRecovery(
        categorizeMediaError(err, {
          fileName: selectedVideo.name,
          phase: 'upload',
        })
      );
    } finally {
      setIsPublishing(false);
      abortRef.current = null;
    }
  };

  const appendTag = (tag: string) => {
    setCaption((prev) => {
      if (prev.toLowerCase().includes(tag.toLowerCase())) return prev;
      return prev.trim() ? `${prev.trim()} ${tag}` : `${tag} `;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Create Reel"
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ReelsIcon className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-[var(--color-text-primary)] truncate flex items-center gap-1.5">
                <span>{activeIdentity.type === 'page' ? `Reel as ${activeIdentity.page.name}` : 'Create Reel'}</span>
                {activeIdentity.type === 'page' && activeIdentity.page.isVerified && <VerifiedBadge size={14} />}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            onChange={handleVideoFileChange}
            className="hidden"
          />

          <MediaRecoveryBanner
            recovery={recovery}
            onChooseAgain={handleChooseVideo}
            onRetryUpload={selectedVideo ? handlePublish : undefined}
            onDismiss={() => setRecovery(null)}
          />

          {!selectedVideo ? (
            <button
              type="button"
              onClick={handleChooseVideo}
              className="w-full py-12 px-4 rounded-2xl border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] bg-[var(--color-bg-main)] flex flex-col items-center justify-center gap-2.5 transition-colors"
            >
              <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
                <Video className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-[var(--color-text-primary)]">
                Select Video for Reel
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-xs text-center">
                MP4, WebM, or MOV · Up to 60 seconds and 50 MB. Uploads securely to Cloudinary and appears in Reels & Home Feed.
              </p>
            </button>
          ) : (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[9/16] max-h-[320px] mx-auto w-full max-w-[200px] border border-[var(--color-border)]">
              <video
                src={selectedVideo.previewUrl}
                muted={Boolean(selectedVideo.videoSettings?.isMuted)}
                loop
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  disabled={isPublishing}
                  className="px-2.5 py-1.5 rounded-full bg-black/70 hover:bg-black text-white text-[11px] font-bold flex items-center gap-1 backdrop-blur-xs"
                >
                  <Scissors className="w-3 h-3" />
                  <span>Trim</span>
                </button>
                <button
                  type="button"
                  onClick={handleChooseVideo}
                  disabled={isPublishing}
                  className="px-2.5 py-1.5 rounded-full bg-black/70 hover:bg-black text-white text-[11px] font-bold backdrop-blur-xs"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {/* Caption & Hashtags */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-1.5">
              Caption & Hashtags
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={isPublishing}
              rows={3}
              maxLength={600}
              placeholder="Write a caption for your campus reel... e.g. Vibes at Uturu Main Gate! #ABSU #CampusReels"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] outline-none focus:border-[var(--color-primary)] resize-none"
            />
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {SUGGESTED_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  disabled={isPublishing}
                  onClick={() => appendTag(tag)}
                  className="px-2.5 py-1 rounded-full bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[11px] font-semibold text-[var(--color-text-primary)]"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Audience */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs font-bold text-[var(--color-text-secondary)]">Visibility</span>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'Public', icon: Globe },
                  { id: 'Campus Only', icon: GraduationCap },
                  { id: 'Friends Only', icon: Users },
                ] as const
              ).map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  disabled={isPublishing}
                  onClick={() => setAudience(id)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-colors ${
                    audience === id
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Numeric Progress */}
          {isPublishing && (
            <div className="p-3 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-primary)]">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
                  {progressText || 'Uploading Reel...'}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--color-border)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-primary)] transition-all duration-200"
                  style={{ width: `${Math.max(4, progressPercent)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-end gap-2.5 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {isPublishing ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 text-xs font-bold"
            >
              Cancel Upload
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--color-bg-main)] text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!selectedVideo || isPublishing}
            onClick={handlePublish}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs sm:text-sm font-bold disabled:opacity-45 shadow-sm transition-all active:scale-95"
          >
            {isPublishing ? `Uploading ${progressPercent}%` : 'Publish Reel'}
          </button>
        </div>
      </div>

      {selectedVideo && (
        <VideoEditorModal
          isOpen={editorOpen}
          videoSrc={selectedVideo.previewUrl}
          fileName={selectedVideo.name}
          initialSettings={selectedVideo.videoSettings}
          onClose={() => setEditorOpen(false)}
          onApply={handleApplyEdit}
        />
      )}
    </div>
  );
};
