import React, { useState, useRef, useEffect } from 'react';
import { createStory } from '../../lib/storyService.ts';
import {
  categorizeMediaError,
  safeReadAndPrepareImage,
  safeReadAndPrepareVideo,
  type MediaRecoveryState,
} from '../../lib/mediaRecovery.ts';
import { MediaRecoveryBanner } from '../common/MediaRecoveryBanner.tsx';
import {
  X,
  Image as ImageIcon,
  Video,
  Type,
  Sparkles,
  RefreshCw,
  Trash2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Loader2,
  Info,
} from 'lucide-react';

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onStoryCreated: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'warning' | 'info' | 'error') => void;
}

const BG_GRADIENTS = [
  { name: 'Royal Blue', class: 'from-blue-600 via-indigo-700 to-slate-950' },
  { name: 'Crimson Glow', class: 'from-rose-600 via-pink-700 to-slate-950' },
  { name: 'Emerald', class: 'from-emerald-600 via-teal-700 to-slate-950' },
  { name: 'Deep Purple', class: 'from-purple-600 via-fuchsia-800 to-slate-950' },
  { name: 'Sunset Amber', class: 'from-amber-500 via-orange-600 to-rose-950' },
  { name: 'Midnight', class: 'from-slate-900 via-neutral-900 to-black' },
];

const FONT_STYLES = [
  { id: 'classic', label: 'Classic', className: 'font-sans font-extrabold' },
  { id: 'serif', label: 'Serif', className: 'font-serif font-bold' },
  { id: 'mono', label: 'Mono', className: 'font-mono font-bold' },
] as const;

export const CreateStoryModal: React.FC<CreateStoryModalProps> = ({
  isOpen,
  onClose,
  userId,
  onStoryCreated,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'photo' | 'video' | 'text'>('photo');
  const [textContent, setTextContent] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(BG_GRADIENTS[0]);
  const [selectedFontStyle, setSelectedFontStyle] = useState<'classic' | 'serif' | 'mono'>('classic');

  // Selected media state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [recovery, setRecovery] = useState<MediaRecoveryState | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeBlobRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const setActivePreviewUrl = (url: string) => {
    if (activeBlobRef.current && activeBlobRef.current !== url) {
      try {
        URL.revokeObjectURL(activeBlobRef.current);
      } catch {}
    }
    activeBlobRef.current = url;
    setObjectUrl(url);
  };

  const clearObjectUrl = () => {
    if (activeBlobRef.current) {
      try {
        URL.revokeObjectURL(activeBlobRef.current);
      } catch {}
      activeBlobRef.current = null;
    }
    setObjectUrl(null);
  };

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (activeBlobRef.current) {
        try {
          URL.revokeObjectURL(activeBlobRef.current);
        } catch {}
        activeBlobRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSubmitting) return;
    clearObjectUrl();
    setSelectedFile(null);
    setTextContent('');
    setCaption('');
    setVideoDuration(null);
    setIsVideoPlaying(false);
    setUploadPercent(null);
    setProgressMsg('');
    setRecovery(null);
    onClose();
  };

  const handleTabChange = (tab: 'photo' | 'video' | 'text') => {
    if (tab !== activeTab && !isSubmitting) {
      clearObjectUrl();
      setSelectedFile(null);
      setVideoDuration(null);
      setIsVideoPlaying(false);
      setRecovery(null);
      setActiveTab(tab);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRecovery(null);
    const isVideo =
      file.type.startsWith('video/') ||
      Boolean(file.name.match(/\.(mp4|mov|webm|m4v|ogg)$/i)) ||
      (activeTab === 'video' && !file.type.startsWith('image/'));

    if (isVideo) {
      const prepared = await safeReadAndPrepareVideo(file, {
        maxBytes: 50 * 1024 * 1024,
        maxDurationSeconds: 60,
      });
      if (!prepared.ok || !prepared.file || !prepared.previewUrl) {
        setRecovery(
          prepared.recovery || {
            category: 'file_read',
            fileName: file.name,
            title: 'Could Not Load Story Video',
            message: `Could not read "${file.name}". Please choose the file again.`,
            canChooseAgain: true,
          }
        );
        return;
      }
      setActivePreviewUrl(prepared.previewUrl);
      setSelectedFile(prepared.file);
      setVideoDuration(prepared.duration ?? null);
      setActiveTab('video');
    } else {
      const prepared = await safeReadAndPrepareImage(file);
      if (!prepared.ok || !prepared.file || !prepared.previewUrl) {
        setRecovery(
          prepared.recovery || {
            category: 'file_read',
            fileName: file.name,
            title: 'Could Not Load Story Photo',
            message: `Could not read "${file.name}". Please choose the file again.`,
            canChooseAgain: true,
          }
        );
        return;
      }
      setActivePreviewUrl(prepared.previewUrl);
      setSelectedFile(prepared.file);
      setVideoDuration(null);
      setActiveTab('photo');
    }
  };

  const handleRemoveMedia = () => {
    clearObjectUrl();
    setSelectedFile(null);
    setVideoDuration(null);
    setIsVideoPlaying(false);
  };

  const toggleVideoPlayback = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsVideoPlaying(true);
    } else {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    }
  };

  const toggleVideoMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsVideoMuted(videoRef.current.muted);
  };

  const handleCancelUpload = () => {
    abortControllerRef.current?.abort();
  };

  const handlePublish = async () => {
    if (activeTab === 'text') {
      if (!textContent.trim()) {
        onShowToast?.('Please write something for your text story.', 'warning');
        return;
      }
    } else {
      if (!selectedFile) {
        onShowToast?.(`Please select a ${activeTab} to publish.`, 'warning');
        return;
      }
      if (activeTab === 'video' && videoDuration && videoDuration > 60) {
        onShowToast?.('Please choose a video under 60 seconds.', 'warning');
        return;
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setRecovery(null);
    setIsSubmitting(true);
    setUploadPercent(activeTab === 'text' ? 50 : 0);
    setProgressMsg(activeTab === 'text' ? 'Publishing text story...' : 'Uploading story to Cloudinary CDN...');

    const res = await createStory({
      userId,
      mediaType: activeTab === 'text' ? 'text' : activeTab === 'video' ? 'video' : 'image',
      file: selectedFile || undefined,
      fallbackUrl: objectUrl || undefined,
      textContent: activeTab === 'text' ? textContent.trim() : undefined,
      caption: caption.trim() || undefined,
      backgroundColor: activeTab === 'text' ? selectedGradient.class : undefined,
      fontStyle: activeTab === 'text' ? selectedFontStyle : undefined,
      onProgress: (msg) => setProgressMsg(msg),
      onPercent: (pct) => setUploadPercent(pct),
      signal: controller.signal,
    });

    abortControllerRef.current = null;
    setIsSubmitting(false);

    if (res.success) {
      setProgressMsg('');
      setUploadPercent(null);
      onShowToast?.('Story shared to campus. Active for 24 hours.', 'success');
      onStoryCreated();
      handleClose();
    } else if (res.aborted) {
      setProgressMsg('');
      setUploadPercent(null);
      onShowToast?.('Story upload cancelled.', 'info');
    } else {
      const errText = res.error || 'Failed to publish story';
      setRecovery(
        categorizeMediaError(new Error(errText), {
          fileName: selectedFile?.name,
          phase: 'upload',
        })
      );
      setProgressMsg('');
      setUploadPercent(null);
      onShowToast?.(errText, 'warning');
    }
  };

  const activeFontClass =
    FONT_STYLES.find((f) => f.id === selectedFontStyle)?.className || 'font-sans font-extrabold';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md sm:max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Create Campus Story</h2>
              <span className="text-[11px] text-blue-400 font-medium">Expires in 24 hours · Cloudinary CDN</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Story Type Selector Tabs */}
        <div className="px-5 pt-3 pb-1">
          <div className="grid grid-cols-3 p-1 bg-slate-800/80 rounded-2xl border border-slate-700/50 gap-1">
            <button
              type="button"
              onClick={() => handleTabChange('photo')}
              disabled={isSubmitting}
              className={`min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'photo'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Photo</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('video')}
              disabled={isSubmitting}
              className={`min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'video'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Video</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('text')}
              disabled={isSubmitting}
              className={`min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'text'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Type className="w-4 h-4" />
              <span>Text</span>
            </button>
          </div>
        </div>

        {/* Composer Canvas */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={activeTab === 'video' ? 'video/mp4,video/webm,video/quicktime,video/x-m4v' : 'image/*'}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* TAB 1: TEXT STORY */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <div
                className={`w-full h-[340px] sm:h-[380px] rounded-3xl bg-gradient-to-tr ${selectedGradient.class} p-6 flex flex-col items-center justify-center text-center shadow-inner relative overflow-hidden border border-white/10`}
              >
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  maxLength={300}
                  placeholder="Type your story here...&#10;(e.g. Study group at e-Library till 5pm!)"
                  className={`w-full bg-transparent text-white text-center text-lg sm:text-xl placeholder-white/40 resize-none focus:outline-none drop-shadow-md leading-relaxed ${activeFontClass}`}
                  rows={4}
                />
                <span className="absolute bottom-3 right-4 text-[11px] text-white/60 font-mono">
                  {textContent.length}/300
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-2">Background Vibe</label>
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                    {BG_GRADIENTS.map((g) => (
                      <button
                        key={g.name}
                        type="button"
                        onClick={() => setSelectedGradient(g)}
                        className={`w-9 h-9 rounded-full bg-gradient-to-tr ${g.class} ring-2 transition-all shrink-0 ${
                          selectedGradient.name === g.name
                            ? 'ring-blue-400 scale-110 shadow-lg shadow-blue-500/20'
                            : 'ring-transparent hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                        title={g.name}
                        aria-label={g.name}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-2">Font Style</label>
                  <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
                    {FONT_STYLES.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSelectedFontStyle(f.id)}
                        className={`min-h-[36px] px-3 rounded-lg text-xs transition-colors ${f.className} ${
                          selectedFontStyle === f.id
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PHOTO STORY */}
          {activeTab === 'photo' && (
            <div className="space-y-3">
              {objectUrl ? (
                <div className="relative w-full h-[340px] sm:h-[380px] rounded-3xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-800 shadow-xl group">
                  <img
                    src={objectUrl}
                    alt="Story preview"
                    className="w-full h-full object-contain rounded-3xl"
                  />
                  <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[40px] px-3 rounded-xl bg-black/70 hover:bg-black text-white backdrop-blur-md transition-all flex items-center gap-1.5 text-xs font-bold shadow-md"
                      title="Replace photo"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveMedia}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white backdrop-blur-md transition-all shadow-md"
                      title="Remove photo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {selectedFile && (
                    <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 text-slate-300 text-[10px] font-mono backdrop-blur-xs z-10">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-[320px] sm:h-[360px] border-2 border-dashed border-slate-700/80 hover:border-blue-500 bg-slate-800/40 hover:bg-blue-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all p-6 text-center group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 group-hover:scale-110 flex items-center justify-center mb-3 transition-transform">
                    <ImageIcon className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-bold text-white mb-1">Select Campus Photo</p>
                  <p className="text-xs text-slate-400">JPG, PNG, or WebP up to 10 MB</p>
                  <span className="mt-3 px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 text-xs font-bold">
                    Browse Files
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Photo Caption (Optional)</label>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={120}
                  placeholder="Add a campus caption..."
                  className="w-full px-4 py-2.5 text-xs bg-slate-800/80 border border-slate-700/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-500"
                />
              </div>
            </div>
          )}

          {/* TAB 3: VIDEO STORY */}
          {activeTab === 'video' && (
            <div className="space-y-3">
              {objectUrl ? (
                <div className="relative w-full h-[340px] sm:h-[380px] rounded-3xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-800 shadow-xl group">
                  <video
                    ref={videoRef}
                    src={objectUrl}
                    playsInline
                    preload="auto"
                    loop
                    muted={isVideoMuted}
                    className="w-full h-full object-contain cursor-pointer rounded-3xl"
                    onClick={toggleVideoPlayback}
                    onPlay={() => setIsVideoPlaying(true)}
                    onPause={() => setIsVideoPlaying(false)}
                  />

                  <button
                    type="button"
                    onClick={toggleVideoPlayback}
                    className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs transition-transform active:scale-90 z-10 shadow-lg ring-2 ring-white/20"
                    aria-label={isVideoPlaying ? 'Pause' : 'Play'}
                  >
                    {isVideoPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5 fill-white" />}
                  </button>

                  <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                    <button
                      type="button"
                      onClick={toggleVideoMute}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-black/70 hover:bg-black text-white backdrop-blur-md transition-all shadow-md"
                      title={isVideoMuted ? 'Unmute' : 'Mute'}
                    >
                      {isVideoMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[40px] px-3 rounded-xl bg-black/70 hover:bg-black text-white backdrop-blur-md transition-all flex items-center gap-1.5 text-xs font-bold shadow-md"
                      title="Replace video"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveMedia}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white backdrop-blur-md transition-all shadow-md"
                      title="Remove video"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 z-10">
                    {videoDuration !== null && (
                      <span className={`px-2.5 py-1 rounded-lg bg-black/75 text-[10px] font-mono font-bold backdrop-blur-xs ${
                        videoDuration > 60 ? 'text-rose-400' : 'text-blue-400'
                      }`}>
                        {Math.round(videoDuration)}s / 60s max
                      </span>
                    )}
                    {selectedFile && (
                      <span className="px-2.5 py-1 rounded-lg bg-black/75 text-slate-300 text-[10px] font-mono backdrop-blur-xs">
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-[320px] sm:h-[360px] border-2 border-dashed border-slate-700/80 hover:border-blue-500 bg-slate-800/40 hover:bg-blue-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all p-6 text-center group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 group-hover:scale-110 flex items-center justify-center mb-3 transition-transform">
                    <Video className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-bold text-white mb-1">Select Campus Video</p>
                  <p className="text-xs text-slate-400">MP4, WebM or MOV up to 60s (max 50 MB)</p>
                  <span className="mt-3 px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 text-xs font-bold">
                    Browse Videos
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Video Caption (Optional)</label>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={120}
                  placeholder="Add a campus caption..."
                  className="w-full px-4 py-2.5 text-xs bg-slate-800/80 border border-slate-700/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-500"
                />
              </div>
            </div>
          )}

          {isSubmitting && uploadPercent !== null && (
            <div className="p-3 rounded-xl bg-slate-800/90 border border-slate-700/70 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <span className="truncate pr-2">{progressMsg || 'Uploading story...'}</span>
                <span className="font-mono text-blue-400 shrink-0">{Math.round(uploadPercent)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(4, uploadPercent))}%` }}
                />
              </div>
            </div>
          )}

          <MediaRecoveryBanner
            recovery={recovery}
            darkSurface
            onChooseAgain={() => fileInputRef.current?.click()}
            onRetryUpload={selectedFile || activeTab === 'text' ? handlePublish : undefined}
            onDismiss={() => setRecovery(null)}
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800/80 bg-slate-900/90 backdrop-blur-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate">
              {progressMsg || 'Visible to all students for 24 hours'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSubmitting ? (
              <button
                type="button"
                onClick={handleCancelUpload}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl transition-colors"
              >
                Cancel Upload
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handlePublish}
              disabled={
                isSubmitting ||
                (activeTab === 'text' && !textContent.trim()) ||
                (activeTab !== 'text' && !selectedFile) ||
                (activeTab === 'video' && videoDuration !== null && videoDuration > 60)
              }
              className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center gap-2 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{uploadPercent !== null ? `${Math.round(uploadPercent)}%` : 'Publishing...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Share Story</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
