import React, { useState, useRef, useEffect } from 'react';
import type { StoryMediaType } from '../../types/stories.ts';
import { createStory } from '../../lib/storyService.ts';
import { createInMemoryFile } from '../../lib/storageService.ts';
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
  AlertCircle,
  Loader2,
  Info,
  Check,
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

  // Selected media state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeBlobRef = useRef<string | null>(null);

  // Safe object URL registration that tracks the active URL without premature revocation
  const registerObjectUrl = (file: File): string => {
    if (activeBlobRef.current) {
      try {
        URL.revokeObjectURL(activeBlobRef.current);
      } catch {}
    }
    const url = URL.createObjectURL(file);
    activeBlobRef.current = url;
    setObjectUrl(url);
    return url;
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
    setErrorMessage(null);
    onClose();
  };

  const handleTabChange = (tab: 'photo' | 'video' | 'text') => {
    if (tab !== activeTab) {
      clearObjectUrl();
      setSelectedFile(null);
      setVideoDuration(null);
      setIsVideoPlaying(false);
      setErrorMessage(null);
      setActiveTab(tab);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Enforce 25 MB max size
    if (file.size > 25 * 1024 * 1024) {
      e.target.value = '';
      onShowToast?.(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 25 MB limit.`, 'warning');
      return;
    }

    const isVideo = file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|mov|webm|m4v)$/i));

    if (activeTab !== 'video' && !isVideo) {
      if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp|avif|gif)$/i)) {
        e.target.value = '';
        onShowToast?.('Please choose a valid image file (JPG, PNG, WebP).', 'warning');
        return;
      }
    }

    let safeFile = file;
    let url = '';
    try {
      const mem = await createInMemoryFile(file);
      safeFile = mem.file;
      if (activeBlobRef.current) {
        try { URL.revokeObjectURL(activeBlobRef.current); } catch {}
      }
      activeBlobRef.current = mem.previewUrl;
      setObjectUrl(mem.previewUrl);
      url = mem.previewUrl;
    } catch (readErr) {
      console.warn('[CreateStoryModal] Could not buffer story media in memory:', readErr);
      url = registerObjectUrl(file);
    }

    // Reset input value AFTER reading so same file can be re-selected cleanly
    e.target.value = '';

    if (activeTab === 'video' || isVideo) {
      setSelectedFile(safeFile);
      setActiveTab('video');

      // Check duration asynchronously
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        setVideoDuration(tempVideo.duration);
        if (tempVideo.duration > 60) {
          onShowToast?.(`Video length (${Math.round(tempVideo.duration)}s) exceeds 60s story limit.`, 'warning');
        }
      };
      tempVideo.onerror = () => {
        console.warn('[CreateStoryModal] Could not inspect video metadata');
      };
    } else {
      setSelectedFile(safeFile);
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

    setErrorMessage(null);
    setIsSubmitting(true);
    setProgressMsg('Uploading story to Supabase Storage...');

    const res = await createStory({
      userId,
      mediaType: activeTab === 'text' ? 'text' : activeTab === 'video' ? 'video' : 'image',
      file: selectedFile || undefined,
      fallbackUrl: objectUrl || undefined,
      textContent: activeTab === 'text' ? textContent.trim() : undefined,
      caption: caption.trim() || undefined,
      onProgress: (msg) => setProgressMsg(msg),
    });

    setIsSubmitting(false);

    if (res.success) {
      setProgressMsg('');
      onShowToast?.('Story shared to campus. Active for 24 hours.', 'success');
      onStoryCreated();
      handleClose();
    } else {
      const errText = res.error || 'Failed to publish story';
      setErrorMessage(errText);
      setProgressMsg('');
      onShowToast?.(errText, 'warning');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md sm:max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Create Campus Story</h2>
              <span className="text-[11px] text-blue-400 font-medium">Expires in 24 hours · Supabase Secure Storage</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Story Type Selector Tabs */}
        <div className="px-5 pt-3 pb-1">
          <div className="grid grid-cols-3 p-1 bg-slate-800/80 rounded-2xl border border-slate-700/50">
            <button
              type="button"
              onClick={() => handleTabChange('photo')}
              className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'photo'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Photo</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('video')}
              className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'video'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Video</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('text')}
              className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'text'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Text</span>
            </button>
          </div>
        </div>

        {/* Composer Canvas */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={activeTab === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/*'}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* TAB 1: TEXT STORY */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <div
                className={`w-full h-[360px] sm:h-[400px] rounded-3xl bg-gradient-to-tr ${selectedGradient.class} p-6 flex flex-col items-center justify-center text-center shadow-inner relative overflow-hidden border border-white/10`}
              >
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  maxLength={300}
                  placeholder="Type your story here...&#10;(e.g. Study group at e-Library till 5pm!)"
                  className="w-full bg-transparent text-white font-extrabold text-center text-lg sm:text-xl placeholder-white/40 resize-none focus:outline-none drop-shadow-md leading-relaxed"
                  rows={4}
                />
                <span className="absolute bottom-3 right-4 text-[11px] text-white/50 font-mono">
                  {textContent.length}/300
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 block mb-2">Select Background Vibe</label>
                <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                  {BG_GRADIENTS.map((g) => (
                    <button
                      key={g.name}
                      type="button"
                      onClick={() => setSelectedGradient(g)}
                      className={`w-8 h-8 rounded-full bg-gradient-to-tr ${g.class} ring-2 transition-all shrink-0 ${
                        selectedGradient.name === g.name
                          ? 'ring-blue-400 scale-110 shadow-lg shadow-blue-500/20'
                          : 'ring-transparent hover:scale-105 opacity-80 hover:opacity-100'
                      }`}
                      title={g.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PHOTO STORY */}
          {activeTab === 'photo' && (
            <div className="space-y-3">
              {objectUrl ? (
                <div className="relative w-full h-[360px] sm:h-[400px] rounded-3xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-800 shadow-xl group">
                  <img
                    src={objectUrl}
                    alt="Story preview"
                    className="w-full h-full object-contain rounded-3xl"
                  />
                  {/* Floating Action Controls */}
                  <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-xl bg-black/70 hover:bg-black text-white backdrop-blur-md transition-all flex items-center gap-1 text-xs font-bold shadow-md"
                      title="Replace photo"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveMedia}
                      className="p-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white backdrop-blur-md transition-all shadow-md"
                      title="Remove photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Size Info Badge */}
                  {selectedFile && (
                    <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 text-slate-300 text-[10px] font-mono backdrop-blur-xs z-10">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-[340px] sm:h-[380px] border-2 border-dashed border-slate-700/80 hover:border-blue-500 bg-slate-800/40 hover:bg-blue-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all p-6 text-center group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 group-hover:scale-110 flex items-center justify-center mb-3 transition-transform">
                    <ImageIcon className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-bold text-white mb-1">Select Campus Photo</p>
                  <p className="text-xs text-slate-400">JPG, PNG, or WebP up to 25 MB</p>
                  <span className="mt-3 px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 text-xs font-bold">
                    Browse Files
                  </span>
                </div>
              )}

              {/* Caption Input */}
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
                <div className="relative w-full h-[360px] sm:h-[400px] rounded-3xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-800 shadow-xl group">
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

                  {/* Play / Pause Overlay Button */}
                  <button
                    type="button"
                    onClick={toggleVideoPlayback}
                    className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs transition-transform active:scale-90 z-10 shadow-lg ring-2 ring-white/20"
                    aria-label={isVideoPlaying ? 'Pause' : 'Play'}
                  >
                    {isVideoPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5 fill-white" />}
                  </button>

                  {/* Floating Action Controls */}
                  <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                    <button
                      type="button"
                      onClick={toggleVideoMute}
                      className="p-2 rounded-xl bg-black/70 hover:bg-black text-white backdrop-blur-md transition-all shadow-md"
                      title={isVideoMuted ? 'Unmute' : 'Mute'}
                    >
                      {isVideoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-xl bg-black/70 hover:bg-black text-white backdrop-blur-md transition-all flex items-center gap-1 text-xs font-bold shadow-md"
                      title="Replace video"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveMedia}
                      className="p-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white backdrop-blur-md transition-all shadow-md"
                      title="Remove video"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Duration & Size Info */}
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
                  className="w-full h-[340px] sm:h-[380px] border-2 border-dashed border-slate-700/80 hover:border-blue-500 bg-slate-800/40 hover:bg-blue-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all p-6 text-center group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 group-hover:scale-110 flex items-center justify-center mb-3 transition-transform">
                    <Video className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-bold text-white mb-1">Select Campus Video</p>
                  <p className="text-xs text-slate-400">MP4, WebM or MOV up to 60s (max 25 MB)</p>
                  <span className="mt-3 px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 text-xs font-bold">
                    Browse Videos
                  </span>
                </div>
              )}

              {/* Caption Input */}
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

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-rose-300 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span className="break-words">{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={handlePublish}
                disabled={isSubmitting}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold whitespace-nowrap shrink-0"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800/80 bg-slate-900/90 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate max-w-[200px] sm:max-w-xs">
              {progressMsg || 'Visible to all students for 24 hours'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={
                isSubmitting ||
                (activeTab === 'text' && !textContent.trim()) ||
                (activeTab !== 'text' && !selectedFile) ||
                (activeTab === 'video' && videoDuration !== null && videoDuration > 60)
              }
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center gap-2 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Publishing...</span>
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
