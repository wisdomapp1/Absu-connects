import React, { useState, useRef } from 'react';
import {
  X,
  Camera,
  ImagePlus,
  Loader2,
  Flag,
  MapPin,
  Globe,
  MessageCircle,
  CheckCircle2,
} from 'lucide-react';
import { PAGE_CATEGORY_OPTIONS, PageCategory, toCanonicalPageCategory } from '../../types/pages.ts';
import { createNewPage, updatePageDetails } from '../../lib/pageService.ts';
import { uploadPageMediaToCloudinary } from '../../lib/cloudinaryService.ts';
import { useApp } from '../../context/AppContext.tsx';
import { ImageCropperModal } from '../common/ImageCropperModal.tsx';

interface CreatePageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (pageId: string) => void;
}

/**
 * Direct Facebook-style ABSU Connect Page creation modal.
 * Flow:
 * 1. Calls live `create_page` RPC (`createNewPage`) with metadata.
 * 2. If user selected 1:1 avatar and/or 16:9 cover, uploads strictly via Cloudinary (`uploadPageMediaToCloudinary`)
 *    and saves URLs with `updatePageDetails`.
 * 3. Refreshes managed pages, switches active identity to the new Page, and navigates straight to `'page-profile'`.
 */
export const CreatePageModal: React.FC<CreatePageModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { addToast, refreshManagedPages, switchIdentity, navigateTo } = useApp();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<PageCategory>('community');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [location, setLocation] = useState('Uturu, Abia State');
  const [whatsapp, setWhatsapp] = useState('');
  const [website, setWebsite] = useState('');

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');

  const [cropTarget, setCropTarget] = useState<{
    aspectRatio: '1:1' | '16:9';
    src: string;
    fileName: string;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChosen = (
    e: React.ChangeEvent<HTMLInputElement>,
    aspectRatio: '1:1' | '16:9'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addToast('Please choose an image file (JPG, PNG, or WebP).', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropTarget({
          aspectRatio,
          src: reader.result,
          fileName: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setName('');
    setCategory('community');
    setDescription('');
    setSlug('');
    setLocation('Uturu, Abia State');
    setWhatsapp('');
    setWebsite('');
    setAvatarFile(null);
    setAvatarPreview('');
    setCoverFile(null);
    setCoverPreview('');
    setStatusText('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 3 || cleanName.length > 50) {
      addToast('Page name must be between 3 and 50 characters.', 'warning');
      return;
    }
    if (description.trim().length > 300) {
      addToast('Bio cannot exceed 300 characters.', 'warning');
      return;
    }

    setSubmitting(true);
    setStatusText('Creating Page...');
    try {
      const createRes = await createNewPage({
        name: cleanName,
        category: toCanonicalPageCategory(category),
        description: description.trim() || undefined,
        slug: slug.trim() || undefined,
        location: location.trim() || 'Uturu, Abia State',
        whatsapp: whatsapp.trim() || undefined,
        website: website.trim() || undefined,
      });

      if (!createRes.success || !createRes.pageId) {
        addToast(createRes.error || 'Could not create Page.', 'warning');
        return;
      }

      const pageId = createRes.pageId;
      let uploadedAvatarUrl: string | undefined;
      let uploadedCoverUrl: string | undefined;

      if (avatarFile) {
        setStatusText('Uploading profile picture to Cloudinary...');
        const avRes = await uploadPageMediaToCloudinary(avatarFile, 'page-profile', pageId);
        if (avRes.success && avRes.secure_url) {
          uploadedAvatarUrl = avRes.secure_url;
        } else {
          addToast(avRes.error || 'Profile picture upload failed; Page created without it.', 'warning');
        }
      }

      if (coverFile) {
        setStatusText('Uploading cover photo to Cloudinary...');
        const cvRes = await uploadPageMediaToCloudinary(coverFile, 'page-cover', pageId);
        if (cvRes.success && cvRes.secure_url) {
          uploadedCoverUrl = cvRes.secure_url;
        } else {
          addToast(cvRes.error || 'Cover photo upload failed; Page created without it.', 'warning');
        }
      }

      if (uploadedAvatarUrl || uploadedCoverUrl) {
        setStatusText('Saving Page photos...');
        await updatePageDetails(pageId, {
          ...(uploadedAvatarUrl ? { avatar_url: uploadedAvatarUrl } : {}),
          ...(uploadedCoverUrl ? { cover_url: uploadedCoverUrl } : {}),
        });
      }

      await refreshManagedPages();
      await switchIdentity(pageId);

      addToast(`${cleanName} is now live!`, 'success');
      resetForm();
      onClose();
      onCreated?.(pageId);
      navigateTo('page-profile', { pageId });
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to create Page.', 'warning');
    } finally {
      setSubmitting(false);
      setStatusText('');
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <div
          className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
                <Flag className="w-4.5 h-4.5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-[var(--color-text-primary)]">
                  Create a Page
                </h2>
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  Go live instantly — reach ABSU students across Uturu & Aba
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <form id="create-page-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Optional Cover & Profile Picture Preview */}
            <div className="space-y-2">
              <div className="relative">
                <div
                  onClick={() => coverInputRef.current?.click()}
                  className="w-full aspect-video max-h-40 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-main)] overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-[var(--color-primary)] transition-colors group relative"
                >
                  {coverPreview ? (
                    <img src={coverPreview} alt="Page cover preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-[var(--color-text-secondary)]">
                      <ImagePlus className="w-6 h-6 text-[var(--color-primary)]" />
                      <span className="text-xs font-semibold">Add Cover Photo (16:9 · Optional)</span>
                    </div>
                  )}
                  <span className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/60 text-white text-[11px] font-semibold">
                    {coverPreview ? 'Change Cover' : 'Skip or Upload'}
                  </span>
                </div>

                {/* Overlapping 1:1 Avatar */}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute -bottom-6 left-4 w-16 h-16 rounded-full border-4 border-[var(--color-bg-card)] bg-[var(--color-bg-main)] shadow-md flex items-center justify-center overflow-hidden group"
                  aria-label="Upload Page Profile Picture"
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Page avatar preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-[var(--color-primary)]">
                      <Camera className="w-5 h-5" />
                      <span className="text-[9px] font-bold mt-0.5">1:1</span>
                    </div>
                  )}
                </button>
              </div>
              <p className="pt-5 text-[11px] text-[var(--color-text-secondary)]">
                Profile picture (1:1) and Cover photo (16:9) are optional and stored securely on Cloudinary.
              </p>
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

            {/* Required Page Name */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">
                  Page Name <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
                  {name.trim().length}/50
                </span>
              </div>
              <input
                type="text"
                required
                minLength={3}
                maxLength={50}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ABSU Tech Hub, NACOS Chapter, Campus Bites"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            {/* Required Category */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={toCanonicalPageCategory(category)}
                onChange={(e) => setCategory(e.target.value as PageCategory)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                {PAGE_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Optional Bio */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">
                  Bio / Description <span className="text-[11px] font-normal text-[var(--color-text-secondary)]">(Optional)</span>
                </label>
                <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
                  {description.length}/300
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell students what your Page shares or offers..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
              />
            </div>

            {/* Optional Username + Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">
                  Username / Handle <span className="text-[11px] font-normal text-[var(--color-text-secondary)]">(Opt)</span>
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="absu-tech-hub"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[var(--color-text-secondary)]" />
                  <span>Location</span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Uturu, Abia State"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>

            {/* Optional WhatsApp + Website */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span>WhatsApp (Opt)</span>
                </label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+234 800 000 0000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-blue-500" />
                  <span>Website (Opt)</span>
                </label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>
          </form>

          {/* Footer Submit Bar */}
          <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center justify-between gap-3 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-3">
            <span className="text-[11px] text-[var(--color-text-secondary)] truncate">
              {statusText || 'Free · Ready immediately'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-page-form"
                disabled={submitting || name.trim().length < 3}
                className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{submitting ? 'Creating...' : 'Create Page'}</span>
              </button>
            </div>
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
