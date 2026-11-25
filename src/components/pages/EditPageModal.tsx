import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  ImagePlus,
  Loader2,
  Save,
  Clock,
  MessageSquare,
  MessageCircle,
  Lock,
} from 'lucide-react';
import {
  PAGE_CATEGORY_OPTIONS,
  Page,
  PageCategory,
  formatPageCategoryLabel,
  toCanonicalPageCategory,
} from '../../types/pages.ts';
import { updatePageDetails } from '../../lib/pageService.ts';
import { uploadPageMediaToCloudinary } from '../../lib/cloudinaryService.ts';
import { getPageNameChangeRemainingDays } from '../../utils/logic.ts';
import { useApp } from '../../context/AppContext.tsx';
import { ImageCropperModal } from '../common/ImageCropperModal.tsx';

interface EditPageModalProps {
  isOpen: boolean;
  page: Page;
  onClose: () => void;
  onUpdated: (updated: Page) => void;
}

/**
 * Edit Page Modal — Owner / Admin Page Settings & Visual Branding.
 * Uses Cloudinary ONLY (`uploadPageMediaToCloudinary`) with 1:1 and 16:9 cropping,
 * maps UI category labels to canonical DB identifiers, enforces 30-day Page name cooldown,
 * and allows toggling messages/comments.
 */
export const EditPageModal: React.FC<EditPageModalProps> = ({
  isOpen,
  page,
  onClose,
  onUpdated,
}) => {
  const { addToast, refreshManagedPages, activeIdentity, switchIdentity } = useApp();

  const [name, setName] = useState(page.name);
  const [category, setCategory] = useState<PageCategory>(toCanonicalPageCategory(page.category));
  const [description, setDescription] = useState(page.description || '');
  const [location, setLocation] = useState(page.location || 'Uturu, Abia State');
  const [whatsapp, setWhatsapp] = useState(page.whatsapp || '');
  const [website, setWebsite] = useState(page.website || '');
  const [allowMessages, setAllowMessages] = useState(page.allowMessages !== false);
  const [allowComments, setAllowComments] = useState(page.allowComments !== false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(page.avatarUrl || '');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState(page.coverUrl || '');

  const [cropTarget, setCropTarget] = useState<{
    aspectRatio: '1:1' | '16:9';
    src: string;
    fileName: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(page.name);
    setCategory(toCanonicalPageCategory(page.category));
    setDescription(page.description || '');
    setLocation(page.location || 'Uturu, Abia State');
    setWhatsapp(page.whatsapp || '');
    setWebsite(page.website || '');
    setAllowMessages(page.allowMessages !== false);
    setAllowComments(page.allowComments !== false);
    setAvatarFile(null);
    setAvatarPreview(page.avatarUrl || '');
    setCoverFile(null);
    setCoverPreview(page.coverUrl || '');
  }, [isOpen, page]);

  if (!isOpen) return null;

  const remainingCooldownDays = getPageNameChangeRemainingDays(page.name_changed_at);

  const handleFileChosen = (
    e: React.ChangeEvent<HTMLInputElement>,
    aspectRatio: '1:1' | '16:9'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('Please select a valid image file.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropTarget({ aspectRatio, src: reader.result, fileName: file.name });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 3 || cleanName.length > 50) {
      addToast('Page name must be between 3 and 50 characters.', 'warning');
      return;
    }

    setSaving(true);
    try {
      let nextAvatarUrl: string | undefined;
      let nextCoverUrl: string | undefined;

      if (avatarFile) {
        const res = await uploadPageMediaToCloudinary(avatarFile, 'page-profile', page.id);
        if (!res.success || !res.secure_url) {
          addToast(res.error || 'Could not upload profile photo to Cloudinary.', 'warning');
          setSaving(false);
          return;
        }
        nextAvatarUrl = res.secure_url;
      }

      if (coverFile) {
        const res = await uploadPageMediaToCloudinary(coverFile, 'page-cover', page.id);
        if (!res.success || !res.secure_url) {
          addToast(res.error || 'Could not upload cover photo to Cloudinary.', 'warning');
          setSaving(false);
          return;
        }
        nextCoverUrl = res.secure_url;
      }

      const canonicalCat = toCanonicalPageCategory(category);
      const updateRes = await updatePageDetails(page.id, {
        name: cleanName,
        existingName: page.name,
        nameChangedAt: page.name_changed_at,
        category: canonicalCat,
        description: description.trim() || null,
        location: location.trim() || null,
        whatsapp: whatsapp.trim() || null,
        website: website.trim() || null,
        allow_messages: allowMessages,
        allow_comments: allowComments,
        ...(nextAvatarUrl ? { avatar_url: nextAvatarUrl } : {}),
        ...(nextCoverUrl ? { cover_url: nextCoverUrl } : {}),
      });

      if (!updateRes.success) {
        addToast(updateRes.error || 'Failed to save Page settings.', 'warning');
        return;
      }

      const updatedPage = updateRes.page || {
        ...page,
        name: cleanName,
        category: formatPageCategoryLabel(canonicalCat),
        description: description.trim() || null,
        location: location.trim() || null,
        whatsapp: whatsapp.trim() || null,
        website: website.trim() || null,
        allowMessages,
        allowComments,
        allow_messages: allowMessages,
        allow_comments: allowComments,
        avatarUrl: nextAvatarUrl || page.avatarUrl,
        avatar_url: nextAvatarUrl || page.avatar_url,
        coverUrl: nextCoverUrl || page.coverUrl,
        cover_url: nextCoverUrl || page.cover_url,
      };

      await refreshManagedPages();
      if (activeIdentity.type === 'page' && activeIdentity.pageId === page.id) {
        await switchIdentity(page.id);
      }
      onUpdated(updatedPage);
      addToast('Page details saved!', 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <div
          className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-base font-extrabold text-[var(--color-text-primary)]">Edit Page</h2>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Update photos, bio, contact details & privacy controls
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form id="edit-page-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Cover & Avatar */}
            <div className="relative mb-6">
              <div
                onClick={() => coverInputRef.current?.click()}
                className="w-full aspect-video max-h-40 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] overflow-hidden cursor-pointer relative group"
              >
                {coverPreview ? (
                  <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[var(--color-text-secondary)] gap-1">
                    <ImagePlus className="w-6 h-6 text-[var(--color-primary)]" />
                    <span className="text-xs font-semibold">Upload Cover Photo (16:9)</span>
                  </div>
                )}
                <span className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/65 text-white text-[11px] font-semibold">
                  Change Cover
                </span>
              </div>

              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-6 left-4 w-16 h-16 rounded-full border-4 border-[var(--color-bg-card)] bg-[var(--color-bg-main)] shadow-md overflow-hidden flex items-center justify-center"
                aria-label="Change Page Profile Picture"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt={page.name} className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-5 h-5 text-[var(--color-primary)]" />
                )}
              </button>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChosen(e, '1:1')}
              />
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChosen(e, '16:9')}
              />
            </div>

            {/* Name + 30-day cooldown indicator */}
            <div className="space-y-1 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">Page Name</label>
                {remainingCooldownDays > 0 && (
                  <span className="text-[11px] font-semibold text-amber-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {remainingCooldownDays}d cooldown
                  </span>
                )}
              </div>
              <input
                type="text"
                required
                minLength={3}
                maxLength={50}
                disabled={remainingCooldownDays > 0}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] disabled:opacity-60"
              />
              {remainingCooldownDays > 0 && (
                <p className="text-[11px] text-amber-500">
                  Page name can only be changed once every 30 days. Locked for {remainingCooldownDays} more day(s).
                </p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">Category</label>
              <select
                value={toCanonicalPageCategory(category)}
                onChange={(e) => setCategory(e.target.value as PageCategory)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)]"
              >
                {PAGE_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Bio */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">Bio</label>
                <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
                  {description.length}/300
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] resize-none"
              />
            </div>

            {/* Location / WhatsApp / Website */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">WhatsApp</label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+234..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">Website</label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
              />
            </div>

            {/* Page Controls */}
            <div className="p-3.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] space-y-3">
              <h4 className="text-xs font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>Messaging & Comments Controls</span>
              </h4>

              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <MessageCircle className="w-4 h-4 text-[var(--color-primary)]" />
                  <div>
                    <p className="text-xs font-bold text-[var(--color-text-primary)]">Allow Direct Messages</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">Students can message this Page</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowMessages}
                  onChange={(e) => setAllowMessages(e.target.checked)}
                  className="w-4 h-4 accent-[var(--color-primary)]"
                />
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-emerald-500" />
                  <div>
                    <p className="text-xs font-bold text-[var(--color-text-primary)]">Allow Comments on Posts</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">Turn off to restrict replies on posts</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowComments}
                  onChange={(e) => setAllowComments(e.target.checked)}
                  className="w-4 h-4 accent-[var(--color-primary)]"
                />
              </label>
            </div>
          </form>

          <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-end gap-2 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-3">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)] whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-page-form"
              disabled={saving}
              className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>

      {cropTarget && (
        <ImageCropperModal
          isOpen={true}
          imageSrc={cropTarget.src}
          aspectRatio={cropTarget.aspectRatio}
          fileName={cropTarget.fileName}
          onCancel={() => setCropTarget(null)}
          onConfirm={(file, previewUrl) => {
            if (cropTarget.aspectRatio === '1:1') {
              setAvatarFile(file);
              setAvatarPreview(previewUrl);
            } else {
              setCoverFile(file);
              setCoverPreview(previewUrl);
            }
            setCropTarget(null);
          }}
        />
      )}
    </>
  );
};
