import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { PostCategory, PostAudience } from '../../types/index.ts';
import { Avatar } from '../common/Avatar.tsx';
import {
  validatePostSubmission,
  validateImageFile,
} from '../../utils/logic.ts';
import {
  decodeAndValidateImageFile,
} from '../../lib/storageService.ts';
import quadImg from '../../assets/images/absu_campus_quad.webp';
import libraryImg from '../../assets/images/absu_library_study.webp';
import sportsImg from '../../assets/images/absu_sports_pitch.webp';
import matriculationImg from '../../assets/images/absu_matriculation_celebration.webp';
import {
  X,
  Image as ImageIcon,
  Upload,
  Check,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Maximize2,
  Minimize2,
  Globe,
  GraduationCap,
  Users,
  Plus,
  Tag,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

export const CAMPUS_IMAGES = {
  quad: quadImg,
  library: libraryImg,
  sports: sportsImg,
  matriculation: matriculationImg,
};

const CAMPUS_QUICK_TAGS = [
  '#ABSU',
  '#CampusUpdate',
  '#Academic',
  '#Exams',
  '#HostelLife',
  '#SUG',
  '#LectureNotes',
  '#Freshers',
  '#UturuCampus',
];

export interface AttachedMediaItem {
  id: string;
  file?: File;
  buffer?: ArrayBuffer;
  previewUrl: string;
  type: 'image' | 'video';
  name: string;
  sizeLabel?: string;
  duration?: number;
  isPreset?: boolean;
}

export type PictureCategoryHashtag = '#Academic' | '#CampusUpdates' | '#GeneralPost';

export const PICTURE_CATEGORY_OPTIONS: Array<{
  tag: PictureCategoryHashtag;
  title: string;
  desc: string;
}> = [
  {
    tag: '#CampusUpdates',
    title: 'Campus Updates',
    desc: 'University announcements, important notices & campus news',
  },
  {
    tag: '#Academic',
    title: 'Academic & Study',
    desc: 'Coursemates, lecture notes, study guides & department news',
  },
  {
    tag: '#GeneralPost',
    title: 'General Post',
    desc: 'Everyday student posts, moments, discussions & more',
  },
];

export const CreatePostModal: React.FC = () => {
  const {
    currentUser,
    createPostModalOpen,
    setCreatePostModalOpen,
    createPost,
    initialPostMedia,
    clearInitialPostMedia,
    addToast,
  } = useApp();

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PostCategory>('General');
  const [audience, setAudience] = useState<PostAudience>('Public');

  // Multi-attachment states
  const [attachments, setAttachments] = useState<AttachedMediaItem[]>([]);

  // Picture Category Hashtag state: #Event, #CampusUpdates, #GeneralPost
  const [pictureCategoryHashtag, setPictureCategoryHashtag] = useState<PictureCategoryHashtag | null>(null);

  // UI state
  const [showMediaTray, setShowMediaTray] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState<'device' | 'presets'>('device');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<string>('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load any initial media (e.g. photo/video selected directly from PostComposer)
  useEffect(() => {
    if (createPostModalOpen && initialPostMedia && initialPostMedia.length > 0) {
      setAttachments((prev) => [...prev, ...initialPostMedia]);
      clearInitialPostMedia();
    }
  }, [createPostModalOpen, initialPostMedia, clearInitialPostMedia]);

  // Auto focus textarea when opened
  useEffect(() => {
    if (createPostModalOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [createPostModalOpen]);

  if (!createPostModalOpen) return null;

  const hasUnsavedContent = content.trim().length > 0 || attachments.length > 0;

  const handleAttemptClose = () => {
    if (isSubmitting) return;
    if (hasUnsavedContent) {
      setShowDiscardConfirm(true);
    } else {
      resetAndClose();
    }
  };

  const resetAndClose = () => {
    // Revoke any created blob object URLs to avoid memory leaks
    for (const a of attachments) {
      if (a.previewUrl && a.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(a.previewUrl);
      }
    }
    setContent('');
    setAttachments([]);
    setPictureCategoryHashtag(null);
    setShowMediaTray(false);
    setValidationError(null);
    setIsSubmitting(false);
    setSubmissionStep('');
    setShowDiscardConfirm(false);
    setIsFullScreen(false);
    setCreatePostModalOpen(false);
  };

  const processSelectedFiles = async (files: File[], reopenPickerOnCorrupt: boolean) => {
    if (files.length === 0) return;

    const newItems: AttachedMediaItem[] = [];
    let rejectedReason: string | null = null;

    for (const file of files) {
      const preCheck = validateImageFile({ type: file.type, size: file.size, name: file.name });
      if (!preCheck.valid) {
        rejectedReason = preCheck.error || `Only photos are supported (${file.name}).`;
        continue;
      }

      const decoded = await decodeAndValidateImageFile(file);
      if (!decoded.valid || !decoded.file || !decoded.previewUrl) {
        rejectedReason =
          decoded.error || `"${file.name}" is corrupted or unreadable. Choose another photo.`;
        continue;
      }

      newItems.push({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file: decoded.file,
        buffer: decoded.buffer,
        previewUrl: decoded.previewUrl,
        type: 'image',
        name: decoded.file.name,
        sizeLabel: `${(decoded.file.size / (1024 * 1024)).toFixed(1)} MB`,
      });
    }

    if (newItems.length > 0) {
      setAttachments((prev) => [...prev, ...newItems]);
      setShowMediaTray(false);
    }

    if (rejectedReason) {
      setValidationError(rejectedReason);
      addToast(rejectedReason, 'warning');
      if (reopenPickerOnCorrupt) {
        setTimeout(() => {
          imageInputRef.current?.click();
        }, 180);
      }
    } else if (newItems.length > 0) {
      setValidationError(null);
    }
  };

  const handleDeviceImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Reset input immediately after snapshot so the same or new file can be re-selected cleanly
    e.target.value = '';
    if (files.length === 0) return;
    await processSelectedFiles(files, true);
  };

  const handleSelectPreset = (url: string, name: string) => {
    const isAlreadySelected = attachments.some((a) => a.previewUrl === url);
    if (isAlreadySelected) {
      setAttachments((prev) => prev.filter((a) => a.previewUrl !== url));
      return;
    }

    const newItem: AttachedMediaItem = {
      id: `preset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      previewUrl: url,
      type: 'image',
      name: `Campus: ${name}`,
      isPreset: true,
    };

    setValidationError(null);
    setAttachments((prev) => [...prev, newItem]);
    setShowMediaTray(false);
  };

  const handleRemoveAttachment = (id: string) => {
    const target = attachments.find((a) => a.id === id);
    if (target?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(target.previewUrl);
    }
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleMoveAttachment = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= attachments.length) return;
    setAttachments((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const handleTagClick = (tag: string) => {
    if (!content.includes(tag)) {
      setContent((prev) => (prev.trim() ? `${prev.trim()} ${tag}` : tag));
    }
    textareaRef.current?.focus();
  };

  // Drag and drop handler for photos & videos
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    await processSelectedFiles(files, false);
  };

  const publishPostAttempt = async () => {
    if (isSubmitting) return;

    const validation = validatePostSubmission(content);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid post content');
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);
    if (attachments.length > 0) {
      setSubmissionStep(
        `Uploading ${attachments.length} attachment${attachments.length > 1 ? 's' : ''} to Supabase Storage...`
      );
    } else {
      setSubmissionStep('Publishing post...');
    }

    let failureDetail = '';
    try {
      const mediaPayload = attachments.map((a) => {
        if (a.buffer && a.name) {
          return new File([a.buffer], a.name, {
            type: a.file?.type || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
            lastModified: Date.now(),
          });
        }
        return a.file ? a.file : a.previewUrl;
      });

      // Optional category hashtag if chosen
      let finalContent = content.trim();
      if (pictureCategoryHashtag && !finalContent.includes(pictureCategoryHashtag)) {
        finalContent = `${finalContent}\n\n${pictureCategoryHashtag}`;
      }

      // Map corresponding category
      let mappedCategory: PostCategory = category;
      if (pictureCategoryHashtag === '#Academic') mappedCategory = 'Academic';
      else if (pictureCategoryHashtag === '#CampusUpdates') mappedCategory = 'Campus Update';
      else if (pictureCategoryHashtag === '#GeneralPost') mappedCategory = 'General';

      const success = await createPost(
        finalContent,
        mappedCategory,
        audience,
        mediaPayload.length > 0 ? mediaPayload : undefined,
        {
          onProgress: (step) => setSubmissionStep(step),
          onError: (err) => {
            failureDetail = err;
          },
        }
      );

      if (success) {
        resetAndClose();
      } else {
        setValidationError(failureDetail || 'Failed to publish post. Please try again.');
        setIsSubmitting(false);
        setSubmissionStep('');
      }
    } catch {
      setValidationError('Failed to publish post. Please check your network connection.');
      setIsSubmitting(false);
      setSubmissionStep('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await publishPostAttempt();
  };

  const categories: PostCategory[] = [
    'General',
    'Campus Update',
    'Academic',
    'Hostel Life',
  ];

  const presetLabels: Record<string, string> = {
    quad: 'Campus Quad',
    library: 'Main Library',
    sports: 'Sports Arena',
    matriculation: 'Matriculation',
  };

  return (
    <>
      {/* Hidden Photo File Input */}
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        onChange={handleDeviceImageSelect}
        className="hidden"
        aria-hidden="true"
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={handleAttemptClose}
      />

      {/* Modal Dialog Container */}
      <div
        className={`fixed z-50 inset-0 flex items-center justify-center p-0 sm:p-4 pointer-events-none transition-all duration-200 ${
          isFullScreen ? 'sm:p-0' : ''
        }`}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          className={`pointer-events-auto bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-2xl flex flex-col overflow-hidden transition-all duration-300 w-full ${
            isFullScreen
              ? 'h-full w-full rounded-none'
              : 'h-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-3xl'
          } ${isDraggingOver ? 'ring-4 ring-[var(--color-primary)] ring-offset-2' : ''}`}
        >
          {/* Header Bar */}
          <div className="px-4 sm:px-6 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between gap-3 bg-[var(--color-bg-card)] shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAttemptClose}
                className="p-1.5 -ml-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-full hover:bg-[var(--color-bg-main)] transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-sm sm:text-base font-bold text-[var(--color-text-primary)]">
                Create Campus Post
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Expand / Minimize Full-Screen toggle */}
              <button
                type="button"
                onClick={() => setIsFullScreen((prev) => !prev)}
                className="hidden sm:flex p-1.5 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
                title={isFullScreen ? 'Exit full-screen' : 'Full screen'}
              >
                {isFullScreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>

              {/* Publish Action Button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !content.trim()}
                className="px-4 py-1.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs sm:text-sm font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <span>Publish</span>
                )}
              </button>
            </div>
          </div>

          {/* Publishing Step Notification Banner */}
          {isSubmitting && (
            <div className="px-4 py-2 bg-[var(--color-primary-subtle)] border-b border-[var(--color-border)] text-[var(--color-primary)] text-xs font-semibold flex items-center gap-2 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{submissionStep || 'Publishing your campus post...'}</span>
            </div>
          )}

          {/* Validation / Upload Error Alert */}
          {validationError && (
            <div className="px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="break-words">{validationError}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {content.trim().length > 0 && !isSubmitting && (
                  <button
                    type="button"
                    onClick={publishPostAttempt}
                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setValidationError(null)}
                  className="text-red-600 hover:text-red-800 p-1"
                  aria-label="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
            {/* Author details & audience selector */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar
                  src={currentUser.avatar}
                  name={currentUser.name}
                  size="md"
                />
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)]">
                    {currentUser.name}
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    {currentUser.level} · {currentUser.department}
                  </p>
                </div>
              </div>

              {/* Audience Pill Selector */}
              <div className="flex items-center gap-1.5 bg-[var(--color-bg-main)] p-1 rounded-xl border border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setAudience('Public')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    audience === 'Public'
                      ? 'bg-[var(--color-bg-card)] text-[var(--color-primary)] shadow-xs'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                  title="Anyone on campus can see this"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Public</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAudience('Friends Only')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    audience === 'Friends Only'
                      ? 'bg-[var(--color-bg-card)] text-[var(--color-primary)] shadow-xs'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                  title="Only connected friends can see this"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Friends</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAudience('Campus Only')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    audience === 'Campus Only'
                      ? 'bg-[var(--color-bg-card)] text-[var(--color-primary)] shadow-xs'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                  title="Verified ABSU campus students only"
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Campus</span>
                </button>
              </div>
            </div>

            {/* Category Selector Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <span className="text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider shrink-0 mr-1">
                Category:
              </span>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    category === cat
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Main Post Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                maxLength={2000}
                rows={isFullScreen ? 8 : 5}
                placeholder="Share course updates, lecture notes, campus questions, or hostel news..."
                className="w-full bg-transparent resize-none text-[15px] sm:text-[16px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none leading-relaxed"
              />
            </div>

            {/* Campus Quick Hashtags */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider shrink-0">
                Quick Tags:
              </span>
              {CAMPUS_QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleTagClick(tag)}
                  className="px-2.5 py-1 rounded-lg bg-[var(--color-bg-main)] hover:bg-[var(--color-primary-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] text-[11px] font-medium transition-colors shrink-0 border border-[var(--color-border)]"
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Optional Topic Hashtag Selector */}
            {attachments.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex flex-col gap-2.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)]">
                    <Tag className="w-4 h-4 text-[var(--color-primary)]" />
                    <span>Topic Tag</span>
                    <span className="text-[11px] font-normal text-[var(--color-text-secondary)]">
                      · Optional
                    </span>
                  </div>
                  {pictureCategoryHashtag && (
                    <button
                      type="button"
                      onClick={() => setPictureCategoryHashtag(null)}
                      className="text-xs font-mono font-bold text-[var(--color-primary)] hover:underline"
                    >
                      {pictureCategoryHashtag} ×
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PICTURE_CATEGORY_OPTIONS.map((cat) => {
                    const isSelected = pictureCategoryHashtag === cat.tag;
                    return (
                      <button
                        key={cat.tag}
                        type="button"
                        onClick={() => {
                          setPictureCategoryHashtag(isSelected ? null : cat.tag);
                          setValidationError(null);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                          isSelected
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] ring-2 ring-[var(--color-primary)]/30 shadow-xs'
                            : 'border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-primary)]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                            {cat.tag}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[var(--color-primary)]" />}
                        </div>
                        <span className="text-[11px] text-[var(--color-text-secondary)] leading-tight">
                          {cat.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Attached Media Tray (Multi-Image Preview) */}
            {attachments.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-secondary)]">
                  <span>Attached Photos ({attachments.length})</span>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isSubmitting}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add More</span>
                  </button>
                </div>

                {attachments.length === 1 ? (
                  /* Single Attachment Full Preview */
                  <div className="rounded-2xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-main)] relative group">
                    <div className="relative">
                      <img
                        src={attachments[0].previewUrl}
                        alt="Attachment preview"
                        className="w-full max-h-[340px] object-cover rounded-2xl"
                      />
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(attachments[0].id)}
                          className="w-7 h-7 rounded-full bg-black/75 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                          title="Remove attachment"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="absolute bottom-2.5 left-2.5 px-3 py-1 rounded-xl bg-black/75 text-white text-[11px] font-medium flex items-center gap-2 backdrop-blur-xs z-10 pointer-events-none">
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="truncate max-w-[240px]">{attachments[0].name}</span>
                        {attachments[0].sizeLabel && <span>· {attachments[0].sizeLabel}</span>}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Multiple Attachments Grid Preview with Remove & Reorder Controls */
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {attachments.map((item, index) => (
                      <div
                        key={item.id}
                        className="relative rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-main)] aspect-video group"
                      >
                        <div className="relative w-full h-full">
                          <img
                            src={item.previewUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/80 text-[10px] text-white font-medium flex items-center gap-1 z-10 pointer-events-none">
                            <ImageIcon className="w-3 h-3 text-emerald-400" />
                            <span className="truncate max-w-[85px]">{item.name}</span>
                          </div>
                        </div>

                        {/* Top-left reorder controls */}
                        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 z-10">
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={() => handleMoveAttachment(index, -1)}
                              className="p-1 rounded-full bg-black/75 text-white hover:bg-[var(--color-primary)] transition-colors"
                              title="Move earlier"
                              aria-label="Move attachment left"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                          )}
                          {index < attachments.length - 1 && (
                            <button
                              type="button"
                              onClick={() => handleMoveAttachment(index, 1)}
                              className="p-1 rounded-full bg-black/75 text-white hover:bg-[var(--color-primary)] transition-colors"
                              title="Move later"
                              aria-label="Move attachment right"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Top-right remove button */}
                        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10">
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(item.id)}
                            className="p-1 rounded-full bg-black/75 text-white hover:bg-red-600 transition-colors"
                            title="Remove attachment"
                            aria-label="Remove attachment"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Media Picker Gallery Tray */}
            {showMediaTray && (
              <div className="p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex flex-col gap-3.5 animate-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveMediaTab('device')}
                      className={`text-xs font-bold pb-1 transition-colors border-b-2 ${
                        activeMediaTab === 'device'
                          ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                          : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      Photos
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMediaTab('presets')}
                      className={`text-xs font-bold pb-1 transition-colors border-b-2 ${
                        activeMediaTab === 'presets'
                          ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                          : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      ABSU Campus Presets
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowMediaTray(false)}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] p-1 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {activeMediaTab === 'device' ? (
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="min-h-[44px] py-3 px-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-primary)] text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.98]"
                    >
                      <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Choose Photos</span>
                    </button>

                    <div className="p-3 rounded-xl border border-dashed border-[var(--color-border)] text-center text-[11px] text-[var(--color-text-secondary)] flex items-center justify-center gap-2">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Drag &amp; drop JPG, PNG, or WebP photos anywhere into this window</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] text-[var(--color-text-secondary)]">
                      Select official Abia State University landmark photography:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {Object.entries(CAMPUS_IMAGES).map(([key, url]) => {
                        const isSelected = attachments.some((a) => a.previewUrl === url);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleSelectPreset(url, presetLabels[key] || key)}
                            className={`relative rounded-xl overflow-hidden h-20 border-2 transition-all ${
                              isSelected
                                ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30'
                                : 'border-transparent hover:opacity-90'
                            }`}
                          >
                            <img src={url} alt={key} className="w-full h-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-white text-[9px] font-semibold truncate text-center">
                              {presetLabels[key] || key}
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-[var(--color-primary)]/40 flex items-center justify-center">
                                <Check className="w-5 h-5 text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Controls Toolbar */}
          <div className="px-4 sm:px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center justify-between gap-3 shrink-0">
            {/* Media Attachment Action Buttons */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={isSubmitting}
                className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] transition-colors whitespace-nowrap shrink-0"
                title="Add photos from device gallery"
              >
                <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Add Photo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveMediaTab('presets');
                  setShowMediaTray(true);
                }}
                disabled={isSubmitting}
                className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] transition-colors whitespace-nowrap shrink-0"
                title="Campus Landmark Presets"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="hidden sm:inline">Landmarks</span>
              </button>
            </div>

            {/* Character Counter & Submit info */}
            <div className="flex items-center gap-3">
              <span
                className={`text-[11px] font-mono tabular-nums ${
                  content.length > 1800
                    ? 'text-[var(--color-error)] font-bold'
                    : 'text-[var(--color-text-secondary)]'
                }`}
              >
                {content.length}/2000
              </span>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !content.trim()}
                className="px-5 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSubmitting ? 'Publishing...' : 'Publish Post'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Discard Confirmation Dialog */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-70 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
              Discard this campus post?
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              If you leave now, your typed content and attached media will not be saved.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] transition-colors"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={resetAndClose}
                className="px-4 py-1.5 rounded-xl bg-[var(--color-error)] text-white text-xs font-bold shadow-xs transition-colors hover:opacity-90"
              >
                Discard Post
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
