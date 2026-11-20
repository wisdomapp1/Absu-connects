import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Users,
  Image as ImageIcon,
  Lock,
  Globe,
  Loader2,
  Sparkles,
  MapPin,
  ListPlus,
  Trash2,
  AlertCircle,
  RefreshCw,
  Eye,
} from 'lucide-react';
import {
  COMMUNITY_CATEGORIES,
  CommunityCategory,
  CommunityPrivacy,
  CreateCommunityInput,
  Community,
} from '../../types/communities.ts';
import { createCommunity } from '../../lib/communityService.ts';
import { uploadCommunityImageToStorage } from '../../lib/storageService.ts';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

interface CreateCommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newCommunity: Community) => void;
}

export const CreateCommunityModal: React.FC<CreateCommunityModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { addToast } = useApp();
  const { user } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CommunityCategory>('Departmental');
  const [location, setLocation] = useState('Uturu (Main Campus)');
  const [privacy, setPrivacy] = useState<CommunityPrivacy>('public');
  const [ruleInput, setRuleInput] = useState('');
  const [rulesList, setRulesList] = useState<string[]>([
    'Respect all members and coursemates',
    'No spam, scam links, or unverified announcements',
  ]);

  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Clean up object URLs
  const cleanupPreviews = () => {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
      setAvatarPreview('');
    }
    if (coverPreview) {
      URL.revokeObjectURL(coverPreview);
      setCoverPreview('');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
      cleanupPreviews();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      addToast('Please select a valid image file (JPG, PNG, WebP)', 'warning');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      addToast('Group icon must be under 8MB', 'warning');
      return;
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setSelectedAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setSelectedAvatarFile(null);
    setAvatarPreview('');
  };

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      addToast('Please select a valid image file (JPG, PNG, WebP)', 'warning');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      addToast('Cover photo must be under 12MB', 'warning');
      return;
    }

    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setSelectedCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleRemoveCover = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setSelectedCoverFile(null);
    setCoverPreview('');
  };

  const handleAddRule = () => {
    if (!ruleInput.trim()) return;
    setRulesList((prev) => [...prev, ruleInput.trim()]);
    setRuleInput('');
  };

  const handleRemoveRule = (index: number) => {
    setRulesList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReset = () => {
    cleanupPreviews();
    setName('');
    setDescription('');
    setCategory('Departmental');
    setLocation('Uturu (Main Campus)');
    setPrivacy('public');
    setRuleInput('');
    setRulesList([
      'Respect all members and coursemates',
      'No spam, scam links, or unverified announcements',
    ]);
    setSelectedAvatarFile(null);
    setSelectedCoverFile(null);
    setErrorMsg(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setErrorMsg('Please enter a community name and description');
      return;
    }

    if (!user) {
      setErrorMsg('Please sign in to create a community');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setProgressMsg('Uploading community images to storage...');

    try {
      let imageUrl = '';
      let coverUrl = '';

      if (selectedAvatarFile) {
        setProgressMsg('Uploading community profile icon...');
        const res = await uploadCommunityImageToStorage(user.id, selectedAvatarFile, 'profile');
        if (res.success && res.url) {
          imageUrl = res.url;
        }
      }

      if (selectedCoverFile) {
        setProgressMsg('Uploading community cover banner...');
        const res = await uploadCommunityImageToStorage(user.id, selectedCoverFile, 'cover');
        if (res.success && res.url) {
          coverUrl = res.url;
        }
      }

      setProgressMsg('Registering campus community...');

      const input: CreateCommunityInput = {
        name: name.trim(),
        description: description.trim(),
        category,
        location: location.trim(),
        privacy,
        imageUrl: imageUrl || undefined,
        coverUrl: coverUrl || undefined,
        rulesList,
      };

      const res = await createCommunity(input, user.id);

      if (res.success && res.community) {
        addToast(`🎉 Community "${res.community.name}" created successfully!`, 'success');
        onCreated(res.community);
        handleReset();
      } else {
        setErrorMsg(res.error || 'Failed to create community. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating community';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-community-title"
    >
      <div className="relative w-full max-w-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="create-community-title"
                className="text-base sm:text-lg font-black text-[var(--color-text-primary)] tracking-tight"
              >
                Create Campus Community
              </h2>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Launch a departmental group, faculty guild, fellowship, or student hub
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Cover Photo Upload & Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">
                Community Cover Banner (16:9 Landscape)
              </label>
              {coverPreview && (
                <span className="text-[11px] text-[var(--color-primary)] font-semibold">
                  Cover attached
                </span>
              )}
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverSelect}
              className="hidden"
            />
            {coverPreview ? (
              <div className="relative h-32 sm:h-36 w-full rounded-2xl overflow-hidden bg-slate-950 border border-[var(--color-border)] shadow-md group flex items-center justify-center">
                <img
                  src={coverPreview}
                  alt="Cover preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-xl bg-black/70 hover:bg-black text-white text-[11px] font-bold backdrop-blur-md transition-all shadow-md flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Change</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveCover}
                    className="p-1 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white backdrop-blur-md transition-all shadow-md"
                    title="Remove cover"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => coverInputRef.current?.click()}
                className="h-28 w-full rounded-2xl bg-[var(--color-bg-main)] border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] cursor-pointer flex flex-col items-center justify-center transition-all p-3 text-center group"
              >
                <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[var(--color-text-primary)]">
                  Tap to upload 16:9 Cover Banner
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">
                  Wide landscape banner (JPG, PNG, WebP)
                </span>
              </div>
            )}
          </div>

          {/* Profile Picture / Icon Upload */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">
                Community Profile Picture (Circular Icon)
              </label>
              {avatarPreview && (
                <span className="text-[11px] text-[var(--color-primary)] font-semibold">
                  Profile pic attached
                </span>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
            <div className="flex items-center gap-4 p-3 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-slate-800 border-2 border-[var(--color-primary)] shadow-md shrink-0 flex items-center justify-center">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Community Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Users className="w-7 h-7 text-[var(--color-text-secondary)]" />
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold shadow-xs hover:bg-[var(--color-primary-hover)] transition-all flex items-center gap-1.5"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{avatarPreview ? 'Change Profile Pic' : 'Choose Profile Pic'}</span>
                  </button>
                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="p-1.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition-colors"
                      title="Remove profile pic"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  Displays next to all community announcements &amp; cards
                </p>
              </div>
            </div>
          </div>

          {/* Real-Time Live Community Mockup Preview */}
          <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-2 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-400">
              <Eye className="w-3.5 h-3.5" />
              <span>Live Student View Preview</span>
            </div>
            <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
              {/* Cover in card */}
              <div className="h-20 w-full bg-slate-800 overflow-hidden relative">
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-blue-900 to-indigo-900" />
                )}
              </div>
              {/* Profile icon + details */}
              <div className="p-3 pt-0 flex items-end gap-2.5 -mt-6 relative z-10">
                <div className="w-12 h-12 rounded-full border-2 border-slate-900 bg-slate-800 overflow-hidden shrink-0 shadow-lg flex items-center justify-center">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-5 h-5 text-white/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-0.5">
                  <h4 className="text-xs font-bold text-white truncate">
                    {name.trim() || 'Your Community Name'}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-semibold">
                      {category}
                    </span>
                    <span>·</span>
                    <span>1 member</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Community Name */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
              Community Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Computer Science Hub, Law Students Union..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 font-medium transition-all"
            />
          </div>

          {/* Category & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CommunityCategory)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 font-semibold transition-all"
              >
                {COMMUNITY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Campus Base
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 font-semibold transition-all"
              >
                <option value="Uturu (Main Campus)">Uturu (Main Campus)</option>
                <option value="Umuahia Campus">Umuahia Campus</option>
                <option value="Aba Health Sciences">Aba Health Sciences</option>
                <option value="Virtual / All Campuses">Virtual / All Campuses</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
              Description &amp; Goals <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this community about? Share mission, study topics, or activities..."
              className="w-full p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 resize-none transition-all"
            />
          </div>

          {/* Privacy Choice */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1.5">
              Community Privacy
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPrivacy('public')}
                className={`p-3 rounded-2xl border text-left transition-all flex items-start gap-2.5 ${
                  privacy === 'public'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] shadow-xs'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-main)] text-[var(--color-text-secondary)]'
                }`}
              >
                <Globe className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-xs font-bold">Public Group</span>
                  <span className="text-[10px] opacity-80">Anyone in ABSU can join immediately</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPrivacy('private')}
                className={`p-3 rounded-2xl border text-left transition-all flex items-start gap-2.5 ${
                  privacy === 'private'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] shadow-xs'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-main)] text-[var(--color-text-secondary)]'
                }`}
              >
                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-xs font-bold">Private Group</span>
                  <span className="text-[10px] opacity-80">Requires owner or admin approval</span>
                </div>
              </button>
            </div>
          </div>

          {/* Rules Builder */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
              Community Rules (Optional)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={ruleInput}
                onChange={(e) => setRuleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddRule();
                  }
                }}
                placeholder="e.g. Keep discussions relevant to course syllabus"
                className="flex-1 px-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
              />
              <button
                type="button"
                onClick={handleAddRule}
                disabled={!ruleInput.trim()}
                className="px-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)] text-xs font-bold text-[var(--color-text-secondary)] disabled:opacity-40 transition-colors flex items-center gap-1"
              >
                <ListPlus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </div>
            {rulesList.length > 0 && (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {rulesList.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
                  >
                    <span className="truncate pr-2">
                      {i + 1}. {r}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(i)}
                      className="text-rose-500 hover:text-rose-700 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={handleReset}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !description.trim()}
              className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-md shadow-[var(--color-primary)]/20 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{progressMsg || 'Creating Community...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Create Community</span>
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
