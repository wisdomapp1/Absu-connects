import React, { useState, useRef, useEffect } from 'react';
import type { Page, PageCategory } from '../../types/pages.ts';
import { updatePageProfile } from '../../lib/pageService.ts';
import { uploadPageAssetToStorage } from '../../lib/storageService.ts';
import {
  Building2,
  X,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
  Eye,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface EditPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  page: Page;
  userId: string;
  onPageUpdated: (updatedPage: Page) => void;
  onShowToast?: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

const CATEGORIES: { id: PageCategory; label: string }[] = [
  { id: 'organization', label: 'Student Association / Faculty / Dept' },
  { id: 'community', label: 'Club / Campus Society / Fellowship' },
  { id: 'business', label: 'Campus Business / Vendor / Service' },
  { id: 'creator', label: 'Campus Creator / Media / News' },
  { id: 'other', label: 'Other Campus Initiative' },
];

export const EditPageModal: React.FC<EditPageModalProps> = ({
  isOpen,
  onClose,
  page,
  userId,
  onPageUpdated,
  onShowToast,
}) => {
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(page.name || '');
  const [category, setCategory] = useState<PageCategory>(page.category || 'organization');
  const [description, setDescription] = useState(page.description || '');
  const [location, setLocation] = useState(page.location || 'Abia State University, Uturu');
  const [contactEmail, setContactEmail] = useState(page.contact_email || '');
  const [contactPhone, setContactPhone] = useState(page.contact_phone || '');

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(page.avatar_url || page.avatarUrl || null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(page.cover_path || null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  // Track newly created temporary blob URLs so we can revoke them
  const tempUrlsRef = useRef<string[]>([]);

  const registerTempUrl = (url: string) => {
    tempUrlsRef.current.push(url);
    return url;
  };

  const cleanupTempUrls = () => {
    for (const url of tempUrlsRef.current) {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }
    tempUrlsRef.current = [];
  };

  useEffect(() => {
    if (isOpen) {
      setName(page.name || '');
      setCategory(page.category || 'organization');
      setDescription(page.description || '');
      setLocation(page.location || 'Abia State University, Uturu');
      setContactEmail(page.contact_email || '');
      setContactPhone(page.contact_phone || '');
      setAvatarPreview(page.avatar_url || page.avatarUrl || null);
      setCoverPreview(page.cover_path || null);
      setAvatarFile(null);
      setCoverFile(null);
    }
    return () => {
      cleanupTempUrls();
    };
  }, [isOpen, page]);

  if (!isOpen) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      onShowToast?.('Please choose a valid image file (JPG, PNG, WebP)', 'warning');
      return;
    }

    const preview = registerTempUrl(URL.createObjectURL(file));
    setAvatarFile(file);
    setAvatarPreview(preview);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      onShowToast?.('Please choose a valid image file (JPG, PNG, WebP)', 'warning');
      return;
    }

    const preview = registerTempUrl(URL.createObjectURL(file));
    setCoverFile(file);
    setCoverPreview(preview);
  };

  const handleRemoveCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    cleanupTempUrls();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || name.trim().length < 3) {
      onShowToast?.('Page name must be at least 3 characters', 'warning');
      return;
    }
    if (!description.trim()) {
      onShowToast?.('Page bio/description is required', 'warning');
      return;
    }

    setIsSubmitting(true);
    setProgressMsg('Saving page updates...');

    try {
      let finalAvatarUrl = avatarPreview || undefined;
      let finalCoverUrl = coverPreview || undefined;

      // Upload new avatar if selected
      if (avatarFile) {
        setProgressMsg('Uploading updated page logo...');
        const res = await uploadPageAssetToStorage(userId, avatarFile, 'avatar', page.id);
        if (res.success && res.url) {
          finalAvatarUrl = res.url;
        }
      }

      // Upload new cover if selected
      if (coverFile) {
        setProgressMsg('Uploading updated page banner...');
        const res = await uploadPageAssetToStorage(userId, coverFile, 'cover', page.id);
        if (res.success && res.url) {
          finalCoverUrl = res.url;
        }
      }

      setProgressMsg('Updating page database...');

      const updates: Partial<Page> = {
        name: name.trim(),
        category,
        description: description.trim(),
        location: location.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        avatar_url: finalAvatarUrl,
        cover_path: finalCoverUrl,
      };

      const updateRes = await updatePageProfile(page.id, updates);

      if (updateRes.success) {
        const updatedPageObj: Page = {
          ...page,
          ...updates,
          avatarUrl: finalAvatarUrl,
        };
        onShowToast?.('🎉 Page profile updated successfully!', 'success');
        onPageUpdated(updatedPageObj);
        handleClose();
      } else {
        onShowToast?.(updateRes.error || 'Failed to update page profile', 'warning');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating page';
      onShowToast?.(msg, 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[var(--color-text-primary)] tracking-tight">
                Edit Page Profile
              </h2>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Update logo, banner, bio, and student contact channels
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-xl hover:bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Hidden file inputs */}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverChange}
            className="hidden"
          />
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />

          {/* Cover Photo Banner */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">
                Page Cover Banner (16:9 Landscape)
              </label>
              {coverPreview && (
                <span className="text-[11px] text-[var(--color-primary)] font-semibold">
                  {coverFile ? 'New banner selected' : 'Current banner'}
                </span>
              )}
            </div>
            {coverPreview ? (
              <div className="relative h-32 sm:h-36 w-full rounded-2xl overflow-hidden bg-slate-950 border border-[var(--color-border)] shadow-md group flex items-center justify-center">
                <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
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
                  Upload Page Cover Banner
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">
                  JPG, PNG, or WebP
                </span>
              </div>
            )}
          </div>

          {/* Logo / Profile Picture */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">
                Page Logo / Circular Avatar
              </label>
              {avatarPreview && (
                <span className="text-[11px] text-[var(--color-primary)] font-semibold">
                  {avatarFile ? 'New logo selected' : 'Current logo'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 p-3 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-slate-800 border-2 border-[var(--color-primary)] shadow-md shrink-0 flex items-center justify-center">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-7 h-7 text-[var(--color-text-secondary)]" />
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
                    <span>Change Logo</span>
                  </button>
                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="p-1.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition-colors"
                      title="Remove logo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  Displayed on posts, directory listings &amp; header
                </p>
              </div>
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-2 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-400">
              <Eye className="w-3.5 h-3.5" />
              <span>Live Page Mockup</span>
            </div>
            <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
              <div className="h-20 w-full bg-slate-800 overflow-hidden relative">
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-blue-900 to-indigo-900" />
                )}
              </div>
              <div className="p-3 pt-0 flex items-end gap-2.5 -mt-6 relative z-10">
                <div className="w-12 h-12 rounded-full border-2 border-slate-900 bg-slate-800 overflow-hidden shrink-0 shadow-lg flex items-center justify-center">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-5 h-5 text-white/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-0.5">
                  <div className="flex items-center gap-1">
                    <h4 className="text-xs font-bold text-white truncate">
                      {name.trim() || page.name}
                    </h4>
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  </div>
                  <span className="text-[10px] text-slate-400 capitalize">
                    {CATEGORIES.find((c) => c.id === category)?.label || 'Official Page'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
              Page Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoCorrect="on"
              autoCapitalize="words"
              spellCheck={true}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 font-medium transition-all"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PageCategory)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 font-semibold transition-all"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
              About / Bio <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
              className="w-full p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 resize-none transition-all"
            />
          </div>

          {/* Location & Contact Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Location
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Uturu Campus"
                  autoCorrect="on"
                  autoCapitalize="words"
                  spellCheck={true}
                  className="w-full pl-8 pr-2.5 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contact@..."
                  autoComplete="email"
                  inputMode="email"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full pl-8 pr-2.5 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Phone
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+234..."
                  autoComplete="tel"
                  inputMode="tel"
                  className="w-full pl-8 pr-2.5 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                />
              </div>
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={handleClose}
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
                  <span>{progressMsg || 'Saving Changes...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Save Page Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
