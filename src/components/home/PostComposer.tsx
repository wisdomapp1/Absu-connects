import React, { useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { MediaRecoveryBanner } from '../common/MediaRecoveryBanner.tsx';
import { Image, Video, Sparkles, EyeOff, Flag, Shield } from 'lucide-react';
import {
  safeReadAndPrepareImage,
  safeReadAndPrepareVideo,
  type MediaRecoveryState,
} from '../../lib/mediaRecovery.ts';
import { formatPageRoleLabel, getPageRoleCapabilities } from '../../lib/pageUtils.ts';
import type { AttachedMediaItem } from '../../types/index.ts';

interface PostComposerProps {
  onOpenAnonymous?: () => void;
}

const MAX_POST_ATTACHMENTS = 4;

export const PostComposer: React.FC<PostComposerProps> = ({ onOpenAnonymous }) => {
  const {
    currentUser,
    activeIdentity,
    setCreatePostModalOpen,
    setCreatePageModalOpen,
    openCreatePostWithMedia,
    addToast,
  } = useApp();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [mediaRecovery, setMediaRecovery] = useState<MediaRecoveryState | null>(null);
  const [lastPickerKind, setLastPickerKind] = useState<'photo' | 'video'>('photo');
  const maxAttachments = activeIdentity.type === 'page' ? 5 : MAX_POST_ATTACHMENTS;
  const pageCaps = activeIdentity.type === 'page' ? getPageRoleCapabilities(activeIdentity.role) : null;
  const canPublishAsPage = activeIdentity.type !== 'page' || Boolean(pageCaps?.canPublishPosts);

  const handleMediaSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'photo' | 'video'
  ) => {
    const rawFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (rawFiles.length === 0) return;
    setLastPickerKind(kind);

    const files = rawFiles.slice(0, maxAttachments);
    if (rawFiles.length > maxAttachments) {
      addToast(`Up to ${maxAttachments} attachments can be attached per post.`, 'info');
    }

    const mediaItems: AttachedMediaItem[] = [];
    let lastRecovery: MediaRecoveryState | null = null;

    for (const file of files) {
      const isVideo =
        kind === 'video' ||
        file.type.startsWith('video/') ||
        Boolean(file.name.match(/\.(mp4|webm|mov|m4v|ogg)$/i));

      if (isVideo) {
        const prepared = await safeReadAndPrepareVideo(file, {
          maxBytes: 50 * 1024 * 1024,
          maxDurationSeconds: 60,
        });
        if (!prepared.ok || !prepared.file || !prepared.previewUrl) {
          lastRecovery = prepared.recovery || null;
          if (prepared.recovery?.message) {
            addToast(prepared.recovery.message, 'warning');
          }
          continue;
        }

        const duration = prepared.duration ?? 0;
        mediaItems.push({
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          file: prepared.file,
          buffer: prepared.buffer,
          previewUrl: prepared.previewUrl,
          type: 'video',
          name: prepared.file.name,
          sizeLabel: `${(prepared.file.size / (1024 * 1024)).toFixed(1)} MB`,
          duration,
          videoSettings: {
            startTime: 0,
            endTime: duration,
            duration,
            isMuted: false,
            aspectRatio: 'original',
          },
        });
        continue;
      }

      const preparedImg = await safeReadAndPrepareImage(file);
      if (!preparedImg.ok || !preparedImg.file || !preparedImg.previewUrl) {
        lastRecovery = preparedImg.recovery || null;
        if (preparedImg.recovery?.message) {
          addToast(preparedImg.recovery.message, 'warning');
        }
        continue;
      }

      mediaItems.push({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file: preparedImg.file,
        buffer: preparedImg.buffer,
        previewUrl: preparedImg.previewUrl,
        type: 'image',
        name: preparedImg.file.name,
        sizeLabel: `${(preparedImg.file.size / (1024 * 1024)).toFixed(1)} MB`,
      });
    }

    if (mediaItems.length > 0) {
      setMediaRecovery(null);
      openCreatePostWithMedia(mediaItems);
    } else if (lastRecovery) {
      setMediaRecovery(lastRecovery);
    }
  };

  if (!canPublishAsPage && activeIdentity.type === 'page') {
    return (
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
        <Avatar src={activeIdentity.page.avatarUrl} name={activeIdentity.page.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
            <span>
              Operating {activeIdentity.page.name} as {formatPageRoleLabel(activeIdentity.role)}
            </span>
          </p>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
            Moderators can reply in Page Inbox and moderate comments, while Owners, Admins, and Editors publish posts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3.5 sm:p-4 shadow-sm transition-colors">
      {/* Hidden Gallery Inputs: Photos & Videos */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        onChange={(e) => handleMediaSelect(e, 'photo')}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg"
        multiple
        onChange={(e) => handleMediaSelect(e, 'video')}
        className="hidden"
        aria-hidden="true"
      />

      {mediaRecovery && (
        <div className="mb-3">
          <MediaRecoveryBanner
            recovery={mediaRecovery}
            onChooseAgain={() =>
              (lastPickerKind === 'video' ? videoInputRef : photoInputRef).current?.click()
            }
            onDismiss={() => setMediaRecovery(null)}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Avatar
          src={activeIdentity.type === 'page' ? activeIdentity.page.avatarUrl : currentUser.avatar}
          name={activeIdentity.type === 'page' ? activeIdentity.page.name : currentUser.name}
          size="md"
        />

        <button
          type="button"
          onClick={() => setCreatePostModalOpen(true)}
          className="flex-1 min-h-[44px] bg-[var(--color-bg-main)] hover:bg-[var(--color-primary-subtle)]/50 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-4 py-2.5 rounded-xl text-left text-xs sm:text-sm font-medium transition-colors border border-[var(--color-border)] truncate"
          aria-label="What is happening on campus?"
        >
          {activeIdentity.type === 'page'
            ? `Posting as ${activeIdentity.page.name}...`
            : `What's happening on campus, ${currentUser.name.split(' ')[0]}?`}
        </button>
      </div>

      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--color-border)] text-xs font-semibold gap-2">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="min-h-[44px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)]/50 transition-colors whitespace-nowrap shrink-0"
            title="Upload photo from gallery"
          >
            <Image className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Photo</span>
          </button>

          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="min-h-[44px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)]/50 transition-colors whitespace-nowrap shrink-0"
            title="Upload short campus video (max 60s)"
          >
            <Video className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>Video</span>
          </button>

          <button
            type="button"
            onClick={() => setCreatePostModalOpen(true)}
            className="min-h-[44px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)]/50 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">Update</span>
          </button>

          {activeIdentity.type === 'personal' && (
            <button
              type="button"
              onClick={() => setCreatePageModalOpen(true)}
              className="min-h-[44px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[#1877F2] hover:bg-[#1877F2]/10 transition-colors whitespace-nowrap shrink-0"
              title="Create an official ABSU Connect Page"
            >
              <Flag className="w-4 h-4" />
              <span className="hidden sm:inline">Create a Page</span>
            </button>
          )}

          {activeIdentity.type === 'personal' && onOpenAnonymous && (
            <button
              type="button"
              onClick={onOpenAnonymous}
              className="min-h-[44px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors whitespace-nowrap shrink-0"
              title="Post anonymously to Mr Anonymous"
            >
              <EyeOff className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span className="hidden sm:inline">Anonymous</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCreatePostModalOpen(true)}
          className="min-h-[44px] px-4 py-1.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold text-xs shadow-xs transition-transform active:scale-95 whitespace-nowrap shrink-0"
        >
          Post
        </button>
      </div>
    </div>
  );
};
