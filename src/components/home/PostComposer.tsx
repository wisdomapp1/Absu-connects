import React, { useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { Image, Sparkles, EyeOff } from 'lucide-react';
import { decodeAndValidateImageFile } from '../../lib/storageService.ts';
import { validateImageFile } from '../../utils/logic.ts';
import type { AttachedMediaItem } from '../../types/index.ts';

interface PostComposerProps {
  onOpenAnonymous?: () => void;
}

export const PostComposer: React.FC<PostComposerProps> = ({ onOpenAnonymous }) => {
  const { currentUser, setCreatePostModalOpen, openCreatePostWithMedia, addToast } = useApp();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const mediaItems: AttachedMediaItem[] = [];
    let hadInvalid = false;

    for (const file of files) {
      const preVal = validateImageFile({ type: file.type, size: file.size, name: file.name });
      if (!preVal.valid) {
        addToast(preVal.error || `Invalid image "${file.name}"`, 'warning');
        hadInvalid = true;
        continue;
      }

      const decoded = await decodeAndValidateImageFile(file);
      if (!decoded.valid || !decoded.file || !decoded.previewUrl) {
        addToast(
          decoded.error || `"${file.name}" appears corrupted. Please choose another image.`,
          'warning'
        );
        hadInvalid = true;
        continue;
      }

      mediaItems.push({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file: decoded.file,
        buffer: decoded.buffer,
        previewUrl: decoded.previewUrl,
        type: 'image',
        name: decoded.file.name,
        sizeLabel: `${(decoded.file.size / (1024 * 1024)).toFixed(1)} MB`,
      });
    }

    if (mediaItems.length > 0) {
      openCreatePostWithMedia(mediaItems);
    } else if (hadInvalid) {
      setTimeout(() => {
        photoInputRef.current?.click();
      }, 180);
    }
  };

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3.5 sm:p-4 shadow-sm transition-colors">
      {/* Hidden Gallery Input: Photos Only */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        onChange={handlePhotoSelect}
        className="hidden"
        aria-hidden="true"
      />

      <div className="flex items-center gap-3">
        <Avatar src={currentUser.avatar} name={currentUser.name} size="md" />

        <button
          onClick={() => setCreatePostModalOpen(true)}
          className="flex-1 min-h-[44px] bg-[var(--color-bg-main)] hover:bg-[var(--color-primary-subtle)]/50 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-4 py-2.5 rounded-xl text-left text-xs sm:text-sm font-medium transition-colors border border-[var(--color-border)] truncate"
          aria-label="What is happening on campus?"
        >
          What&apos;s happening on campus, {currentUser.name.split(' ')[0]}?
        </button>
      </div>

      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--color-border)] text-xs font-semibold gap-2">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="min-h-[40px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)]/50 transition-colors whitespace-nowrap shrink-0"
            title="Upload photo from gallery"
          >
            <Image className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Photo</span>
          </button>

          <button
            type="button"
            onClick={() => setCreatePostModalOpen(true)}
            className="min-h-[40px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)]/50 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">Update</span>
          </button>

          {onOpenAnonymous && (
            <button
              type="button"
              onClick={onOpenAnonymous}
              className="min-h-[40px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors whitespace-nowrap shrink-0"
              title="Post anonymously to Mr Anonymous"
            >
              <EyeOff className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span className="hidden sm:inline">Anonymous</span>
            </button>
          )}
        </div>

        <button
          onClick={() => setCreatePostModalOpen(true)}
          className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium text-xs shadow-xs transition-transform active:scale-95 whitespace-nowrap shrink-0"
        >
          Post
        </button>
      </div>
    </div>
  );
};
