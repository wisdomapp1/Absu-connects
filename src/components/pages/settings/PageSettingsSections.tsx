import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Save,
  Loader2,
  Camera,
  ImagePlus,
  Trash2,
  UserPlus,
  Bell,
  Clock,
  AlertTriangle,
  RotateCcw,
  Check,
  X,
  Activity,
  AtSign,
  Power,
  BadgeCheck,
  Database,
  Download,
  Pin,
  Eye,
  EyeOff,
  ExternalLink,
  Search,
  Ban,
  ShieldAlert,
  UserX,
  Plus,
  ArrowRightLeft,
} from 'lucide-react';
import {
  PAGE_CATEGORY_OPTIONS,
  Page,
  PageAdminInvitation,
  PageAuditLogEntry,
  PageBlock,
  PageCategory,
  PageCommentPermission,
  PageDefaultPostVisibility,
  PageFollower,
  PageFollowerInteractionMode,
  PageManager,
  PageMediaInventory,
  PageMessagingPermission,
  PageNotificationPreferences,
  PagePublishingPermission,
  PageRestrictedUser,
  PageRoleCapabilities,
  PageVerificationRequest,
  CanonicalPageRole,
  toCanonicalPageCategory,
  formatPageCategoryLabel,
} from '../../../types/pages.ts';
import type { Post } from '../../../types/index.ts';
import {
  fetchPageManagers,
  fetchPendingPageAdminInvitesForPage,
  searchUsersForPageInvite,
  invitePageAdmin,
  cancelPageAdminInvite,
  removePageAdmin,
  updatePageManagerRole,
  transferPageOwnership,
  updatePageDetails,
  checkPageSlugAvailability,
  updatePageSlug,
  updatePageStatusByOwner,
  fetchPageNotificationPreferences,
  upsertPageNotificationPreferences,
  fetchPageAuditLogs,
  requestPageDeletion,
  cancelPageDeletion,
  fetchPageFollowers,
  removePageFollower,
  fetchPageBlocks,
  blockUserFromPage,
  unblockUserFromPage,
  fetchPageRestrictedUsers,
  restrictUserFromPage,
  unrestrictUserFromPage,
  inviteFriendToPage,
  fetchPagePostsForManager,
  toggleHidePagePost,
  pinPagePost,
  fetchPageVerificationRequests,
  submitPageVerificationRequest,
  fetchPageMediaInventory,
  buildPageDataExportBundle,
} from '../../../lib/pageService.ts';
import { uploadPageMediaToCloudinary } from '../../../lib/cloudinaryService.ts';
import {
  formatPageRoleLabel,
  getPageNameChangeRemainingDays,
} from '../../../lib/pageUtils.ts';
import { useApp } from '../../../context/AppContext.tsx';
import { Avatar } from '../../common/Avatar.tsx';
import { VerifiedBadge } from '../../common/VerifiedBadge.tsx';
import { ImageCropperModal } from '../../common/ImageCropperModal.tsx';

export interface SectionCommonProps {
  page: Page;
  caps: PageRoleCapabilities;
  syncUpdatedIdentity: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

function formatByteSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* ============================================================================
 * SECTION A: PAGE INFORMATION & APPEARANCE
 * ============================================================================ */
export const PageInfoSection: React.FC<SectionCommonProps> = ({
  page,
  caps,
  syncUpdatedIdentity,
  onDirtyChange,
}) => {
  const { addToast } = useApp();
  const [name, setName] = useState(page.name);
  const [slug, setSlug] = useState(page.slug);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [category, setCategory] = useState<PageCategory>(toCanonicalPageCategory(page.category));
  const [description, setDescription] = useState(page.description || '');
  const [location, setLocation] = useState(page.location || '');
  const [whatsapp, setWhatsapp] = useState(page.whatsapp || '');
  const [website, setWebsite] = useState(page.website || '');
  const [contactEmail, setContactEmail] = useState(page.contact_email || '');
  const [contactPhone, setContactPhone] = useState(page.contact_phone || '');

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(page.avatarUrl || '');
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState(page.coverUrl || '');
  const [removeCover, setRemoveCover] = useState(false);
  const [cropTarget, setCropTarget] = useState<{
    aspectRatio: '1:1' | '16:9';
    src: string;
    fileName: string;
  } | null>(null);

  const [savingInfo, setSavingInfo] = useState(false);
  const [savingSlug, setSavingSlug] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [statusNote, setStatusNote] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(page.name);
    setSlug(page.slug);
    setSlugStatus('idle');
    setCategory(toCanonicalPageCategory(page.category));
    setDescription(page.description || '');
    setLocation(page.location || '');
    setWhatsapp(page.whatsapp || '');
    setWebsite(page.website || '');
    setContactEmail(page.contact_email || '');
    setContactPhone(page.contact_phone || '');
    setAvatarFile(null);
    setAvatarPreview(page.avatarUrl || '');
    setRemoveAvatar(false);
    setCoverFile(null);
    setCoverPreview(page.coverUrl || '');
    setRemoveCover(false);
  }, [page]);

  const isDirty = useMemo(() => {
    const infoChanged =
      name.trim() !== page.name.trim() ||
      toCanonicalPageCategory(category) !== toCanonicalPageCategory(page.category) ||
      description.trim() !== (page.description || '').trim() ||
      location.trim() !== (page.location || '').trim() ||
      whatsapp.trim() !== (page.whatsapp || '').trim() ||
      website.trim() !== (page.website || '').trim() ||
      contactEmail.trim() !== (page.contact_email || '').trim() ||
      contactPhone.trim() !== (page.contact_phone || '').trim() ||
      slug.trim().toLowerCase() !== page.slug.trim().toLowerCase() ||
      Boolean(avatarFile) ||
      Boolean(coverFile) ||
      removeAvatar ||
      removeCover;
    return infoChanged;
  }, [
    name,
    category,
    description,
    location,
    whatsapp,
    website,
    contactEmail,
    contactPhone,
    slug,
    avatarFile,
    coverFile,
    removeAvatar,
    removeCover,
    page,
  ]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const clean = slug.trim().toLowerCase().replace(/^@+/, '');
    if (!clean || clean === page.slug.toLowerCase()) {
      setSlugStatus('idle');
      return;
    }
    if (!/^[a-z0-9][a-z0-9_-]{2,40}$/.test(clean)) {
      setSlugStatus('taken');
      return;
    }
    setSlugStatus('checking');
    const timer = setTimeout(async () => {
      const available = await checkPageSlugAvailability(clean, page.id);
      setSlugStatus(available ? 'available' : 'taken');
    }, 300);
    return () => clearTimeout(timer);
  }, [slug, page.id, page.slug]);

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

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caps.canEditInfo || savingInfo) return;
    if (name.trim().length < 3) {
      setStatusNote({ type: 'error', text: 'Page name must be at least 3 characters.' });
      return;
    }
    if (website.trim() && !/^https?:\/\//i.test(website.trim())) {
      setStatusNote({ type: 'error', text: 'Website URL must start with https:// or http://' });
      return;
    }
    setSavingInfo(true);
    setStatusNote(null);
    try {
      const res = await updatePageDetails(page.id, {
        name: name.trim(),
        existingName: page.name,
        nameChangedAt: page.name_changed_at,
        category: toCanonicalPageCategory(category),
        description: description.trim() || null,
        location: location.trim() || null,
        whatsapp: whatsapp.trim() || null,
        website: website.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
      });

      if (!res.success) {
        const msg = res.error || 'Could not save Page information.';
        setStatusNote({ type: 'error', text: msg });
        addToast(msg, 'warning');
        return;
      }

      await syncUpdatedIdentity();
      setStatusNote({ type: 'success', text: 'Page profile information updated.' });
      addToast('Page information saved.', 'success');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSaveHandle = async () => {
    if (!caps.canEditHandle || savingSlug) return;
    const clean = slug.trim().toLowerCase().replace(/^@+/, '');
    if (clean === page.slug.toLowerCase()) return;
    setSavingSlug(true);
    setStatusNote(null);
    try {
      const res = await updatePageSlug(page.id, clean);
      if (res.success && res.slug) {
        setSlug(res.slug);
        setSlugStatus('idle');
        await syncUpdatedIdentity();
        setStatusNote({ type: 'success', text: `Handle updated to @${res.slug}.` });
        addToast(`Handle updated to @${res.slug}.`, 'success');
      } else {
        const msg = res.error || 'Could not update Page handle.';
        setStatusNote({ type: 'error', text: msg });
        addToast(msg, 'warning');
      }
    } finally {
      setSavingSlug(false);
    }
  };

  const handleSaveAppearance = async () => {
    if (!caps.canEditInfo || savingAppearance) return;
    setSavingAppearance(true);
    setStatusNote(null);
    try {
      let nextAvatarUrl: string | undefined;
      let nextCoverUrl: string | undefined;

      if (avatarFile) {
        const up = await uploadPageMediaToCloudinary(avatarFile, 'page-profile', page.id);
        if (!up.success || !up.secure_url) {
          addToast(up.error || 'Could not upload avatar to Cloudinary.', 'warning');
          return;
        }
        nextAvatarUrl = up.secure_url;
      }

      if (coverFile) {
        const up = await uploadPageMediaToCloudinary(coverFile, 'page-cover', page.id);
        if (!up.success || !up.secure_url) {
          addToast(up.error || 'Could not upload cover photo to Cloudinary.', 'warning');
          return;
        }
        nextCoverUrl = up.secure_url;
      }

      const res = await updatePageDetails(page.id, {
        ...(nextAvatarUrl ? { avatar_url: nextAvatarUrl } : {}),
        ...(nextCoverUrl ? { cover_url: nextCoverUrl } : {}),
        removeAvatar: removeAvatar && !nextAvatarUrl,
        removeCover: removeCover && !nextCoverUrl,
      });

      if (!res.success) {
        addToast(res.error || 'Could not save Page appearance.', 'warning');
        return;
      }

      setAvatarFile(null);
      setCoverFile(null);
      setRemoveAvatar(false);
      setRemoveCover(false);
      await syncUpdatedIdentity();
      setStatusNote({ type: 'success', text: 'Page avatar and cover saved on Cloudinary.' });
      addToast('Page appearance updated.', 'success');
    } finally {
      setSavingAppearance(false);
    }
  };

  return (
    <div className="space-y-4">
      {statusNote && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold ${
            statusNote.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
          }`}
        >
          {statusNote.text}
        </div>
      )}

      {!caps.canEditInfo && (
        <div className="p-3 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]">
          Your role ({formatPageRoleLabel(caps.role)}) has read-only access to Page identity details.
        </div>
      )}

      {/* Profile Identity Form */}
      <form
        onSubmit={handleSaveInfo}
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
            Identity &amp; Contact Details
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Public Page name, category, bio, and student contact links
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">Page Name</label>
            {remainingCooldownDays > 0 && (
              <span className="text-[11px] font-semibold text-amber-500 flex items-center gap-1 tabular-nums">
                <Clock className="w-3 h-3" /> {remainingCooldownDays}d cooldown
              </span>
            )}
          </div>
          <input
            type="text"
            required
            minLength={3}
            maxLength={50}
            disabled={!caps.canEditInfo || remainingCooldownDays > 0}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] disabled:opacity-60"
          />
          {remainingCooldownDays > 0 && (
            <p className="text-[11px] text-amber-500">
              Page names can only change once every 30 days ({remainingCooldownDays} day(s) left).
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-[var(--color-text-primary)]">Category</label>
          <select
            disabled={!caps.canEditInfo}
            value={toCanonicalPageCategory(category)}
            onChange={(e) => setCategory(e.target.value as PageCategory)}
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] disabled:opacity-60"
          >
            {PAGE_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

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
            disabled={!caps.canEditInfo}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what your Page shares with ABSU students..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] resize-none disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">Location</label>
            <input
              type="text"
              disabled={!caps.canEditInfo}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Uturu, Abia State"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] disabled:opacity-60"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">WhatsApp</label>
            <input
              type="text"
              disabled={!caps.canEditInfo}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+234..."
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] disabled:opacity-60"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">Contact Email</label>
            <input
              type="email"
              disabled={!caps.canEditInfo}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="page@absuconnect.edu.ng"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] disabled:opacity-60"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">Contact Phone</label>
            <input
              type="tel"
              disabled={!caps.canEditInfo}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+234..."
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] disabled:opacity-60"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-[var(--color-text-primary)]">Website</label>
          <input
            type="url"
            disabled={!caps.canEditInfo}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://..."
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] disabled:opacity-60"
          />
        </div>

        {caps.canEditInfo && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingInfo}
              className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              {savingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{savingInfo ? 'Saving...' : 'Save Page Info'}</span>
            </button>
          </div>
        )}
      </form>

      {/* Handle (@slug) */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <AtSign className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Page Handle (@slug)</span>
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Unique public handle used in Page URLs
            </p>
          </div>
          {!caps.canEditHandle && (
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Owner only</span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <input
              type="text"
              disabled={!caps.canEditHandle}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/^@+/, ''))}
              placeholder="page-handle"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] disabled:opacity-60"
            />
            {slugStatus === 'checking' && (
              <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">Checking availability...</p>
            )}
            {slugStatus === 'available' && (
              <p className="text-[11px] text-emerald-500 font-semibold mt-1">@{slug} is available</p>
            )}
            {slugStatus === 'taken' && (
              <p className="text-[11px] text-rose-500 font-semibold mt-1">
                Handle is invalid or already taken.
              </p>
            )}
          </div>
          {caps.canEditHandle && (
            <button
              type="button"
              disabled={
                savingSlug ||
                slugStatus === 'taken' ||
                slug.trim().toLowerCase() === page.slug.toLowerCase()
              }
              onClick={handleSaveHandle}
              className="min-h-[44px] px-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {savingSlug ? 'Updating...' : 'Update Handle'}
            </button>
          )}
        </div>
      </div>

      {/* Appearance (Cloudinary ONLY) */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
            Profile Picture &amp; Cover Banner
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Cloudinary-hosted branding for {page.name}
          </p>
        </div>

        <div className="relative w-full aspect-video max-h-44 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] overflow-hidden">
          {coverPreview && !removeCover ? (
            <img src={coverPreview} alt={`${page.name} cover`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[var(--color-text-secondary)] gap-1">
              <ImagePlus className="w-6 h-6 text-[var(--color-primary)]" />
              <span className="text-xs font-semibold">No cover banner set</span>
            </div>
          )}
        </div>

        {caps.canEditInfo && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap"
            >
              <ImagePlus className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Upload Cover (16:9)</span>
            </button>
            {coverPreview && !removeCover && (
              <button
                type="button"
                onClick={() => {
                  setCoverFile(null);
                  setCoverPreview('');
                  setRemoveCover(true);
                }}
                className="min-h-[44px] px-3 rounded-xl border border-rose-500/30 text-xs font-bold text-rose-500 whitespace-nowrap"
              >
                Remove Cover
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <Avatar
              src={removeAvatar ? undefined : avatarPreview || undefined}
              name={page.name}
              size="lg"
            />
            <div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">Page Avatar</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">Square 1:1 crop</p>
            </div>
          </div>
          {caps.canEditInfo && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>Upload Avatar</span>
              </button>
              {avatarPreview && !removeAvatar && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreview('');
                    setRemoveAvatar(true);
                  }}
                  className="min-h-[44px] px-3 rounded-xl border border-rose-500/30 text-xs font-bold text-rose-500 whitespace-nowrap"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>

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

        {(avatarFile || coverFile || removeAvatar || removeCover) && caps.canEditInfo && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={savingAppearance}
              onClick={handleSaveAppearance}
              className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              {savingAppearance ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{savingAppearance ? 'Uploading...' : 'Save Appearance'}</span>
            </button>
          </div>
        )}
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
              setRemoveAvatar(false);
            } else {
              setCoverFile(file);
              setCoverPreview(previewUrl);
              setRemoveCover(false);
            }
            setCropTarget(null);
          }}
        />
      )}
    </div>
  );
};

/* ============================================================================
 * SECTION B: PAGE ACCESS & ROLES (4-ROLE RBAC + TRANSFER OWNERSHIP)
 * ============================================================================ */
export const PageAccessRolesSection: React.FC<SectionCommonProps> = ({
  page,
  caps,
  syncUpdatedIdentity,
  onDirtyChange,
}) => {
  const { currentUser, addToast } = useApp();
  const [managers, setManagers] = useState<PageManager[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PageAdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; display_name: string; username: string; avatar_url?: string; department?: string }>
  >([]);
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'moderator'>('admin');
  const [busy, setBusy] = useState(false);
  const [transferTarget, setTransferTarget] = useState<PageManager | null>(null);
  const [transferConfirmText, setTransferConfirmText] = useState('');

  useEffect(() => {
    onDirtyChange(false);
  }, [onDirtyChange]);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    try {
      const [mgrs, invites] = await Promise.all([
        fetchPageManagers(page.id),
        caps.canManageRoles ? fetchPendingPageAdminInvitesForPage(page.id) : Promise.resolve([]),
      ]);
      setManagers(mgrs);
      setPendingInvites(invites);
    } finally {
      setLoading(false);
    }
  }, [page.id, caps.canManageRoles]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  useEffect(() => {
    if (!caps.canManageRoles || search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchUsersForPageInvite(search);
      setSearchResults(res);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, caps.canManageRoles]);

  const handleInvite = async (username: string) => {
    if (!caps.canManageRoles || busy) return;
    setBusy(true);
    try {
      const res = await invitePageAdmin(page.id, username, inviteRole);
      if (res.success) {
        addToast(`Invited @${username} as ${formatPageRoleLabel(inviteRole)}.`, 'success');
        setSearch('');
        await loadTeam();
      } else {
        addToast(res.error || 'Could not send team invitation.', 'warning');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (userId: string, nextRole: 'admin' | 'editor' | 'moderator') => {
    if (!caps.canManageRoles || busy) return;
    setBusy(true);
    try {
      const res = await updatePageManagerRole(page.id, userId, nextRole);
      if (res.success) {
        addToast(`Updated member role to ${formatPageRoleLabel(nextRole)}.`, 'success');
        await loadTeam();
      } else {
        addToast(res.error || 'Could not update role.', 'warning');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!caps.canManageRoles || busy) return;
    setBusy(true);
    try {
      const res = await removePageAdmin(page.id, userId);
      if (res.success) {
        addToast('Team member removed.', 'info');
        await loadTeam();
      } else {
        addToast(res.error || 'Could not remove team member.', 'warning');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCancelInvite = async (id: string) => {
    if (!caps.canManageRoles || busy) return;
    setBusy(true);
    try {
      const res = await cancelPageAdminInvite(id);
      if (res.success) {
        setPendingInvites((prev) => prev.filter((i) => i.id !== id));
        addToast('Invitation cancelled.', 'info');
      } else {
        addToast(res.error || 'Could not cancel invitation.', 'warning');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!caps.canTransferOwnership || !transferTarget || busy) return;
    setBusy(true);
    try {
      const res = await transferPageOwnership(page.id, transferTarget.user_id);
      if (res.success) {
        setTransferTarget(null);
        setTransferConfirmText('');
        addToast(`Ownership transferred to ${transferTarget.user?.display_name || 'selected Admin'}.`, 'success');
        await syncUpdatedIdentity();
        await loadTeam();
      } else {
        addToast(res.error || 'Could not transfer ownership.', 'warning');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Role Capability Guide */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-2.5">
        <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
          Role Permissions Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <p className="font-bold text-[var(--color-text-primary)]">Owner</p>
            <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
              Full Page control, handle changes, ownership transfer, deactivation, and deletion.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <p className="font-bold text-[var(--color-text-primary)]">Admin</p>
            <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
              Manage Page info, team roles, privacy, messaging, followers, and verification requests.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <p className="font-bold text-[var(--color-text-primary)]">Editor</p>
            <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
              Publish, edit, pin, and hide Page posts, reply to comments, and handle Page Inbox.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <p className="font-bold text-[var(--color-text-primary)]">Moderator</p>
            <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
              Moderate comments, block or restrict accounts, remove followers, and reply in Inbox.
            </p>
          </div>
        </div>
      </div>

      {/* Invite New Team Member */}
      {caps.canManageRoles && (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Invite Page Team Member</span>
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Choose a role first, then search by name or @username
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'editor' | 'moderator')}
              className="min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)]"
              aria-label="Role for new invitation"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="moderator">Moderator</option>
            </select>

            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student by name or @username..."
              className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)]"
            />
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto p-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)]">
              {searchResults.map((u) => (
                <div
                  key={u.id}
                  className="p-2.5 rounded-xl flex items-center justify-between gap-2 bg-[var(--color-bg-card)]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={u.avatar_url} name={u.display_name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                        {u.display_name}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                        @{u.username}
                        {u.department ? ` · ${u.department}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleInvite(u.username)}
                    className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Invite {formatPageRoleLabel(inviteRole)}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Team & Pending Invites */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
          Active Team ({managers.length})
        </h3>

        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : (
          <div className="space-y-2">
            {managers.map((m) => {
              const isRowOwner = m.role === 'owner';
              const isSelf = m.user_id === currentUser.id;
              return (
                <div
                  key={m.user_id}
                  className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      src={m.user?.avatar_url}
                      name={m.user?.display_name || 'Manager'}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                        {m.user?.display_name || 'Manager'}
                        {isSelf ? ' (You)' : ''}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                        {formatPageRoleLabel(m.role)}
                        {m.user?.username ? ` · @${m.user.username}` : ''}
                      </p>
                    </div>
                  </div>

                  {!isRowOwner && caps.canManageRoles && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        disabled={busy || (caps.role === 'admin' && m.role === 'admin' && !isSelf)}
                        value={m.role === 'manager' ? 'admin' : m.role}
                        onChange={(e) =>
                          handleRoleChange(
                            m.user_id,
                            e.target.value as 'admin' | 'editor' | 'moderator'
                          )
                        }
                        className="min-h-[38px] px-2.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)] disabled:opacity-50"
                        aria-label={`Change role for ${m.user?.display_name || 'member'}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="moderator">Moderator</option>
                      </select>

                      {caps.canTransferOwnership && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setTransferTarget(m)}
                          className="min-h-[38px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] whitespace-nowrap flex items-center gap-1"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Make Owner</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemove(m.user_id)}
                        className="min-h-[38px] px-3 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 whitespace-nowrap"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {caps.canManageRoles && pendingInvites.length > 0 && (
              <div className="pt-3 space-y-1.5 border-t border-[var(--color-border)]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Pending Invitations ({pendingInvites.length})
                </p>
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                        {inv.invitee?.display_name ||
                          (inv.invitee?.username ? `@${inv.invitee.username}` : 'Invited student')}
                      </p>
                      <p className="text-[11px] text-amber-500">
                        Invited as {formatPageRoleLabel(inv.role || 'admin')} · Pending acceptance
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleCancelInvite(inv.id)}
                      className="min-h-[38px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)] hover:text-rose-500 whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transfer Ownership Modal */}
      {transferTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setTransferTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-bg-card)] border border-amber-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[var(--color-text-primary)]">
                Transfer Page Ownership
              </h3>
              <button
                type="button"
                onClick={() => setTransferTarget(null)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[var(--color-text-secondary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <strong className="text-[var(--color-text-primary)]">
                {transferTarget.user?.display_name || 'This team member'}
              </strong>{' '}
              will become the sole Owner of <strong>{page.name}</strong>, and your role will change to Admin. Type{' '}
              <strong className="text-[var(--color-text-primary)]">TRANSFER</strong> to confirm:
            </p>
            <input
              type="text"
              value={transferConfirmText}
              onChange={(e) => setTransferConfirmText(e.target.value)}
              placeholder="TRANSFER"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTransferTarget(null);
                  setTransferConfirmText('');
                }}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || transferConfirmText.trim().toUpperCase() !== 'TRANSFER'}
                onClick={handleConfirmTransfer}
                className="min-h-[44px] px-4 rounded-xl bg-amber-600 text-white text-xs font-bold disabled:opacity-40 whitespace-nowrap"
              >
                Transfer Ownership
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * SECTION C: PRIVACY & SAFETY
 * ============================================================================ */
export const PagePrivacySection: React.FC<SectionCommonProps> = ({
  page,
  caps,
  syncUpdatedIdentity,
  onDirtyChange,
}) => {
  const { addToast } = useApp();
  const [isDiscoverable, setIsDiscoverable] = useState(page.is_discoverable !== false);
  const [followerInteractionMode, setFollowerInteractionMode] =
    useState<PageFollowerInteractionMode>(page.follower_interaction_mode || 'open');
  const [defaultPostVisibility, setDefaultPostVisibility] = useState<PageDefaultPostVisibility>(
    page.default_post_visibility || 'public'
  );
  const [commentPermission, setCommentPermission] = useState<PageCommentPermission>(
    page.comment_permission || (page.allowComments === false ? 'disabled' : 'everyone')
  );
  const [messagingPermission, setMessagingPermission] = useState<PageMessagingPermission>(
    page.messaging_permission || (page.allowMessages === false ? 'disabled' : 'everyone')
  );

  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [restricted, setRestricted] = useState<PageRestrictedUser[]>([]);
  const [loadingSafety, setLoadingSafety] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    setIsDiscoverable(page.is_discoverable !== false);
    setFollowerInteractionMode(page.follower_interaction_mode || 'open');
    setDefaultPostVisibility(page.default_post_visibility || 'public');
    setCommentPermission(
      page.comment_permission || (page.allowComments === false ? 'disabled' : 'everyone')
    );
    setMessagingPermission(
      page.messaging_permission || (page.allowMessages === false ? 'disabled' : 'everyone')
    );
  }, [page]);

  const isDirty = useMemo(() => {
    const initialComment =
      page.comment_permission || (page.allowComments === false ? 'disabled' : 'everyone');
    const initialMessaging =
      page.messaging_permission || (page.allowMessages === false ? 'disabled' : 'everyone');
    return (
      isDiscoverable !== (page.is_discoverable !== false) ||
      followerInteractionMode !== (page.follower_interaction_mode || 'open') ||
      defaultPostVisibility !== (page.default_post_visibility || 'public') ||
      commentPermission !== initialComment ||
      messagingPermission !== initialMessaging
    );
  }, [
    isDiscoverable,
    followerInteractionMode,
    defaultPostVisibility,
    commentPermission,
    messagingPermission,
    page,
  ]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const loadSafetyLists = useCallback(async () => {
    setLoadingSafety(true);
    try {
      const [blks, rsts] = await Promise.all([
        fetchPageBlocks(page.id),
        fetchPageRestrictedUsers(page.id),
      ]);
      setBlocks(blks);
      setRestricted(rsts);
    } finally {
      setLoadingSafety(false);
    }
  }, [page.id]);

  useEffect(() => {
    void loadSafetyLists();
  }, [loadSafetyLists]);

  const handleSavePrivacy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caps.canEditPrivacy || saving) return;
    setSaving(true);
    try {
      const res = await updatePageDetails(page.id, {
        is_discoverable: isDiscoverable,
        follower_interaction_mode: followerInteractionMode,
        default_post_visibility: defaultPostVisibility,
        comment_permission: commentPermission,
        messaging_permission: messagingPermission,
      });
      if (res.success) {
        await syncUpdatedIdentity();
        addToast('Privacy & safety controls saved.', 'success');
      } else {
        addToast(res.error || 'Could not save privacy settings.', 'warning');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUnblock = async (userId: string) => {
    if (!caps.canManageFollowers || busyUserId) return;
    setBusyUserId(userId);
    try {
      const res = await unblockUserFromPage(page.id, userId);
      if (res.success) {
        setBlocks((prev) => prev.filter((b) => b.user_id !== userId));
        addToast('User unblocked.', 'info');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const handleUnrestrict = async (userId: string) => {
    if (!caps.canManageFollowers || busyUserId) return;
    setBusyUserId(userId);
    try {
      const res = await unrestrictUserFromPage(page.id, userId);
      if (res.success) {
        setRestricted((prev) => prev.filter((r) => r.user_id !== userId));
        addToast('Restriction removed.', 'info');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSavePrivacy}
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
            Visibility &amp; Interaction Boundaries
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Control who can find, comment on, and message {page.name}
          </p>
        </div>

        <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
          <div>
            <p className="text-xs font-bold text-[var(--color-text-primary)]">
              Show Page in Campus Discovery
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              When off, students can only view this Page via direct link or existing follows
            </p>
          </div>
          <input
            type="checkbox"
            disabled={!caps.canEditPrivacy}
            checked={isDiscoverable}
            onChange={(e) => setIsDiscoverable(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--color-border)]">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">
              Default Post Audience
            </label>
            <select
              disabled={!caps.canEditPrivacy}
              value={defaultPostVisibility}
              onChange={(e) =>
                setDefaultPostVisibility(e.target.value as PageDefaultPostVisibility)
              }
              className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            >
              <option value="public">Public (All ABSU Students)</option>
              <option value="followers">Followers Only</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">
              Who Can Comment
            </label>
            <select
              disabled={!caps.canEditPrivacy}
              value={commentPermission}
              onChange={(e) => setCommentPermission(e.target.value as PageCommentPermission)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            >
              <option value="everyone">Everyone</option>
              <option value="followers">Followers Only</option>
              <option value="disabled">Turned Off</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">
              Who Can Message Page
            </label>
            <select
              disabled={!caps.canEditPrivacy}
              value={messagingPermission}
              onChange={(e) => setMessagingPermission(e.target.value as PageMessagingPermission)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            >
              <option value="everyone">Everyone</option>
              <option value="followers">Followers Only</option>
              <option value="disabled">Messages Off</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">
              Follower Discussion Mode
            </label>
            <select
              disabled={!caps.canEditPrivacy}
              value={followerInteractionMode}
              onChange={(e) =>
                setFollowerInteractionMode(e.target.value as PageFollowerInteractionMode)
              }
              className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            >
              <option value="open">Open Discussion</option>
              <option value="followers_only_comments">Prioritize Followers</option>
            </select>
          </div>
        </div>

        {caps.canEditPrivacy && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Privacy Settings</span>
            </button>
          </div>
        )}
      </form>

      {/* Block vs Restrict Explanation + Lists */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
            Blocked &amp; Restricted Accounts
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            <strong>Block</strong> removes follows and prevents viewing or interacting with this Page.{' '}
            <strong>Restrict</strong> keeps them from commenting or messaging without removing them as a follower.
          </p>
        </div>

        {loadingSafety ? (
          <div className="py-5 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] space-y-2">
              <p className="text-xs font-bold text-[var(--color-text-primary)]">
                Blocked Accounts ({blocks.length})
              </p>
              {blocks.length === 0 ? (
                <p className="text-[11px] text-[var(--color-text-secondary)]">No blocked accounts.</p>
              ) : (
                blocks.map((b) => (
                  <div key={b.user_id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-[var(--color-text-primary)]">
                      {b.user?.display_name || b.user?.username || 'Student'}
                    </span>
                    {caps.canManageFollowers && (
                      <button
                        type="button"
                        disabled={busyUserId === b.user_id}
                        onClick={() => handleUnblock(b.user_id)}
                        className="text-[11px] font-bold text-[var(--color-primary)] hover:underline shrink-0"
                      >
                        Unblock
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] space-y-2">
              <p className="text-xs font-bold text-[var(--color-text-primary)]">
                Restricted Accounts ({restricted.length})
              </p>
              {restricted.length === 0 ? (
                <p className="text-[11px] text-[var(--color-text-secondary)]">No restricted accounts.</p>
              ) : (
                restricted.map((r) => (
                  <div key={r.user_id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-[var(--color-text-primary)]">
                      {r.user?.display_name || r.user?.username || 'Student'}
                    </span>
                    {caps.canManageFollowers && (
                      <button
                        type="button"
                        disabled={busyUserId === r.user_id}
                        onClick={() => handleUnrestrict(r.user_id)}
                        className="text-[11px] font-bold text-[var(--color-primary)] hover:underline shrink-0"
                      >
                        Unrestrict
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * SECTION D: PAGE MESSAGING SETTINGS
 * ============================================================================ */
export const PageMessagingSection: React.FC<SectionCommonProps> = ({
  page,
  caps,
  syncUpdatedIdentity,
  onDirtyChange,
}) => {
  const { currentUser, addToast, navigateTo } = useApp();
  const [allowMessages, setAllowMessages] = useState(page.allowMessages !== false);
  const [messageRequestsEnabled, setMessageRequestsEnabled] = useState(
    page.message_requests_enabled !== false
  );
  const [welcomeMessage, setWelcomeMessage] = useState(page.welcome_message || '');
  const [awayModeEnabled, setAwayModeEnabled] = useState(Boolean(page.away_mode_enabled));
  const [awayMessage, setAwayMessage] = useState(page.away_message || '');
  const [inboxRoles, setInboxRoles] = useState<CanonicalPageRole[]>(
    page.inbox_access_roles && page.inbox_access_roles.length > 0
      ? page.inbox_access_roles
      : ['owner', 'admin', 'editor', 'moderator']
  );
  const [inboxAlerts, setInboxAlerts] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAllowMessages(page.allowMessages !== false);
    setMessageRequestsEnabled(page.message_requests_enabled !== false);
    setWelcomeMessage(page.welcome_message || '');
    setAwayModeEnabled(Boolean(page.away_mode_enabled));
    setAwayMessage(page.away_message || '');
    setInboxRoles(
      page.inbox_access_roles && page.inbox_access_roles.length > 0
        ? page.inbox_access_roles
        : ['owner', 'admin', 'editor', 'moderator']
    );
    void fetchPageNotificationPreferences(page.id, currentUser.id).then((prefs) => {
      setInboxAlerts(prefs.notify_messages);
    });
  }, [page, currentUser.id]);

  const isDirty = useMemo(() => {
    const initialRoles =
      page.inbox_access_roles && page.inbox_access_roles.length > 0
        ? page.inbox_access_roles
        : ['owner', 'admin', 'editor', 'moderator'];
    return (
      allowMessages !== (page.allowMessages !== false) ||
      messageRequestsEnabled !== (page.message_requests_enabled !== false) ||
      welcomeMessage.trim() !== (page.welcome_message || '').trim() ||
      awayModeEnabled !== Boolean(page.away_mode_enabled) ||
      awayMessage.trim() !== (page.away_message || '').trim() ||
      inboxRoles.slice().sort().join(',') !== initialRoles.slice().sort().join(',')
    );
  }, [allowMessages, messageRequestsEnabled, welcomeMessage, awayModeEnabled, awayMessage, inboxRoles, page]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const toggleRole = (role: CanonicalPageRole) => {
    if (role === 'owner') return;
    setInboxRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caps.canEditMessagingSettings || saving) return;
    if (awayModeEnabled && !awayMessage.trim()) {
      addToast('Enter an away message before enabling Away Mode.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const [res] = await Promise.all([
        updatePageDetails(page.id, {
          allow_messages: allowMessages,
          messaging_permission: allowMessages
            ? page.messaging_permission === 'followers'
              ? 'followers'
              : 'everyone'
            : 'disabled',
          message_requests_enabled: messageRequestsEnabled,
          welcome_message: welcomeMessage.trim() || null,
          away_mode_enabled: awayModeEnabled,
          away_message: awayMessage.trim() || null,
          inbox_access_roles: inboxRoles,
        }),
        upsertPageNotificationPreferences(page.id, { notify_messages: inboxAlerts }, currentUser.id),
      ]);
      if (res.success) {
        await syncUpdatedIdentity();
        addToast('Page messaging settings saved.', 'success');
      } else {
        addToast(res.error || 'Could not save messaging settings.', 'warning');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
            Inbox &amp; Automated Replies
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Configure direct messages, greeting text, away auto-replies, and team inbox access
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigateTo('page-inbox', { pageId: page.id })}
          className="text-xs font-bold text-[var(--color-primary)] hover:underline whitespace-nowrap"
        >
          Open Inbox
        </button>
      </div>

      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-xs font-bold text-[var(--color-text-primary)]">Allow Direct Messages</p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Let students send messages to {page.name}
            </p>
          </div>
          <input
            type="checkbox"
            disabled={!caps.canEditMessagingSettings}
            checked={allowMessages}
            onChange={(e) => setAllowMessages(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
        </label>

        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-xs font-bold text-[var(--color-text-primary)]">
              Enable Message Requests
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Allow inquiries from students who do not follow the Page yet
            </p>
          </div>
          <input
            type="checkbox"
            disabled={!caps.canEditMessagingSettings}
            checked={messageRequestsEnabled}
            onChange={(e) => setMessageRequestsEnabled(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
        </label>

        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-xs font-bold text-[var(--color-text-primary)]">
              Inbox Message Notifications
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Notify you when students message Page Inbox
            </p>
          </div>
          <input
            type="checkbox"
            checked={inboxAlerts}
            onChange={(e) => setInboxAlerts(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
        </label>
      </div>

      <div className="space-y-1 pt-2 border-t border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-[var(--color-text-primary)]">
            Welcome Greeting Message
          </label>
          <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
            {welcomeMessage.length}/500
          </span>
        </div>
        <textarea
          rows={2}
          maxLength={500}
          disabled={!caps.canEditMessagingSettings}
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          placeholder="Sent automatically the first time a student messages this Page..."
          className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] resize-none"
        />
      </div>

      <div className="p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] space-y-2.5">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-xs font-bold text-[var(--color-text-primary)]">Away Mode Auto-Reply</p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Send an automated away reply when managers are unavailable
            </p>
          </div>
          <input
            type="checkbox"
            disabled={!caps.canEditMessagingSettings}
            checked={awayModeEnabled}
            onChange={(e) => setAwayModeEnabled(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
        </label>

        {awayModeEnabled && (
          <textarea
            rows={2}
            maxLength={500}
            disabled={!caps.canEditMessagingSettings}
            value={awayMessage}
            onChange={(e) => setAwayMessage(e.target.value)}
            placeholder="Thanks for reaching out! Our admins are currently in lectures and will reply shortly."
            className="w-full px-3 py-2 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] resize-none"
          />
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
        <p className="text-xs font-bold text-[var(--color-text-primary)]">
          Team Roles Allowed in Page Inbox
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['owner', 'admin', 'editor', 'moderator'] as CanonicalPageRole[]).map((role) => (
            <label
              key={role}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold cursor-pointer"
            >
              <input
                type="checkbox"
                disabled={role === 'owner' || !caps.canEditMessagingSettings}
                checked={inboxRoles.includes(role)}
                onChange={() => toggleRole(role)}
                className="w-4 h-4 accent-[var(--color-primary)]"
              />
              <span>{formatPageRoleLabel(role)}</span>
            </label>
          ))}
        </div>
      </div>

      {caps.canEditMessagingSettings && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Messaging Settings</span>
          </button>
        </div>
      )}
    </form>
  );
};

/* ============================================================================
 * SECTION E: PAGE NOTIFICATIONS
 * ============================================================================ */
export const PageNotificationsSection: React.FC<SectionCommonProps> = ({
  page,
  onDirtyChange,
}) => {
  const { currentUser, addToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<PageNotificationPreferences>({
    page_id: page.id,
    user_id: currentUser.id,
    notify_followers: true,
    notify_messages: true,
    notify_reactions: true,
    notify_comments: true,
    notify_replies: true,
    notify_admin_changes: true,
    notify_admin_invites: true,
    notify_verification: true,
    notify_security_events: true,
  });

  useEffect(() => {
    onDirtyChange(false);
  }, [onDirtyChange]);

  useEffect(() => {
    setLoading(true);
    void fetchPageNotificationPreferences(page.id, currentUser.id)
      .then((loaded) => setPrefs(loaded))
      .finally(() => setLoading(false));
  }, [page.id, currentUser.id]);

  const toggleKey = async (
    key: keyof Omit<PageNotificationPreferences, 'page_id' | 'user_id' | 'updated_at'>
  ) => {
    if (saving) return;
    const prev = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    try {
      const res = await upsertPageNotificationPreferences(page.id, next, currentUser.id);
      if (!res.success) {
        setPrefs(prev);
        addToast(res.error || 'Could not update notification preferences.', 'warning');
      } else {
        addToast('Notification preference updated.', 'success');
      }
    } finally {
      setSaving(false);
    }
  };

  const rows: Array<{
    key: keyof Omit<PageNotificationPreferences, 'page_id' | 'user_id' | 'updated_at'>;
    label: string;
    desc: string;
  }> = [
    { key: 'notify_followers', label: 'New Followers', desc: 'Alert when students follow this Page' },
    { key: 'notify_messages', label: 'Page Messages', desc: 'Alert on new student inquiries in Page Inbox' },
    { key: 'notify_reactions', label: 'Post Reactions', desc: 'Alert when students react to Page posts' },
    { key: 'notify_comments', label: 'Post Comments', desc: 'Alert on new comments on Page posts' },
    { key: 'notify_replies', label: 'Comment Replies', desc: 'Alert on threaded replies to Page comments' },
    { key: 'notify_admin_invites', label: 'Admin Invitations', desc: 'Alert when team invites are accepted or declined' },
    { key: 'notify_admin_changes', label: 'Team Role Changes', desc: 'Alert when manager roles or ownership update' },
    { key: 'notify_verification', label: 'Verification Updates', desc: 'Alert when verification requests are reviewed' },
    { key: 'notify_security_events', label: 'Security & Status Events', desc: 'Alert on visibility, moderation, or deletion updates' },
  ];

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Isolated Page Notification Preferences</span>
        </h2>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
          Page alerts appear only inside {page.name}&apos;s alert center and stay separate from your personal alerts.
        </p>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {rows.map((item) => (
            <label
              key={item.key}
              className="flex items-center justify-between gap-3 py-3 cursor-pointer"
            >
              <div>
                <p className="text-xs font-bold text-[var(--color-text-primary)]">{item.label}</p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">{item.desc}</p>
              </div>
              <input
                type="checkbox"
                disabled={saving}
                checked={Boolean(prefs[item.key])}
                onChange={() => toggleKey(item.key)}
                className="w-4 h-4 accent-[var(--color-primary)] shrink-0"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * SECTION F: CONTENT & POST MANAGEMENT
 * ============================================================================ */
export const PageContentSection: React.FC<SectionCommonProps> = ({
  page,
  caps,
  syncUpdatedIdentity,
  onDirtyChange,
}) => {
  const { currentUser, addToast, navigateTo, deletePost } = useApp();
  const [publishingPerm, setPublishingPerm] = useState<PagePublishingPermission>(
    page.publishing_permission || 'admins_editors'
  );
  const [commentPerm, setCommentPerm] = useState<PageCommentPermission>(
    page.comment_permission || (page.allowComments === false ? 'disabled' : 'everyone')
  );
  const [defaultVisibility, setDefaultVisibility] = useState<PageDefaultPostVisibility>(
    page.default_post_visibility || 'public'
  );
  const [hiddenWords, setHiddenWords] = useState<string[]>(page.hidden_words || []);
  const [newWord, setNewWord] = useState('');
  const [savingRules, setSavingRules] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [deleteTargetPost, setDeleteTargetPost] = useState<Post | null>(null);

  useEffect(() => {
    setPublishingPerm(page.publishing_permission || 'admins_editors');
    setCommentPerm(
      page.comment_permission || (page.allowComments === false ? 'disabled' : 'everyone')
    );
    setDefaultVisibility(page.default_post_visibility || 'public');
    setHiddenWords(page.hidden_words || []);
  }, [page]);

  const isDirty = useMemo(() => {
    const initialWords = (page.hidden_words || []).join(',');
    const initialComment =
      page.comment_permission || (page.allowComments === false ? 'disabled' : 'everyone');
    return (
      publishingPerm !== (page.publishing_permission || 'admins_editors') ||
      commentPerm !== initialComment ||
      defaultVisibility !== (page.default_post_visibility || 'public') ||
      hiddenWords.join(',') !== initialWords
    );
  }, [publishingPerm, commentPerm, defaultVisibility, hiddenWords, page]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const list = await fetchPagePostsForManager(page.id, currentUser.id);
      setPosts(list);
    } finally {
      setLoadingPosts(false);
    }
  }, [page.id, currentUser.id]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const handleAddWord = () => {
    const clean = newWord.trim().toLowerCase();
    if (!clean || clean.length > 60) return;
    if (!hiddenWords.includes(clean)) {
      setHiddenWords((prev) => [...prev, clean]);
    }
    setNewWord('');
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caps.canEditPrivacy || savingRules) return;
    setSavingRules(true);
    try {
      const res = await updatePageDetails(page.id, {
        publishing_permission: publishingPerm,
        comment_permission: commentPerm,
        default_post_visibility: defaultVisibility,
        hidden_words: hiddenWords,
      });
      if (res.success) {
        await syncUpdatedIdentity();
        addToast('Content & moderation rules saved.', 'success');
      } else {
        addToast(res.error || 'Could not save content rules.', 'warning');
      }
    } finally {
      setSavingRules(false);
    }
  };

  const handleTogglePin = async (post: Post) => {
    if (!caps.canModeratePosts || busyPostId) return;
    setBusyPostId(post.id);
    try {
      const res = await pinPagePost(page.id, post.isPinned ? null : post.id);
      if (res.success) {
        addToast(post.isPinned ? 'Post unpinned.' : 'Post pinned to top of Page.', 'success');
        await loadPosts();
      } else {
        addToast(res.error || 'Could not update pin state.', 'warning');
      }
    } finally {
      setBusyPostId(null);
    }
  };

  const handleToggleHide = async (post: Post) => {
    if (!caps.canModeratePosts || busyPostId) return;
    const isCurrentlyHidden = String(post.visibility || '').toLowerCase() === 'hidden';
    setBusyPostId(post.id);
    try {
      const res = await toggleHidePagePost(page.id, post.id, !isCurrentlyHidden);
      if (res.success) {
        addToast(
          !isCurrentlyHidden ? 'Post hidden from public campus feed.' : 'Post restored to public feed.',
          'info'
        );
        await loadPosts();
      } else {
        addToast(res.error || 'Could not update post visibility.', 'warning');
      }
    } finally {
      setBusyPostId(null);
    }
  };

  const handleConfirmDeletePost = async () => {
    if (!deleteTargetPost || busyPostId) return;
    setBusyPostId(deleteTargetPost.id);
    try {
      deletePost(deleteTargetPost.id);
      setPosts((prev) => prev.filter((p) => p.id !== deleteTargetPost.id));
      setDeleteTargetPost(null);
    } finally {
      setBusyPostId(null);
    }
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSaveRules}
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
            Publishing &amp; Keyword Moderation Rules
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Define who publishes posts, default visibility, and blocked words in posts/comments
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">Who Can Publish</label>
            <select
              disabled={!caps.canEditPrivacy}
              value={publishingPerm}
              onChange={(e) => setPublishingPerm(e.target.value as PagePublishingPermission)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            >
              <option value="admins_editors">Owners, Admins &amp; Editors</option>
              <option value="admins_only">Owners &amp; Admins Only</option>
              <option value="owner_only">Owner Only</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">Default Post Audience</label>
            <select
              disabled={!caps.canEditPrivacy}
              value={defaultVisibility}
              onChange={(e) => setDefaultVisibility(e.target.value as PageDefaultPostVisibility)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            >
              <option value="public">Public</option>
              <option value="followers">Followers Only</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">Comment Permission</label>
            <select
              disabled={!caps.canEditPrivacy}
              value={commentPerm}
              onChange={(e) => setCommentPerm(e.target.value as PageCommentPermission)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            >
              <option value="everyone">Everyone</option>
              <option value="followers">Followers Only</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        {/* Hidden Keywords */}
        <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
          <label className="text-xs font-bold text-[var(--color-text-primary)]">
            Hidden Words Filter ({hiddenWords.length})
          </label>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            Posts or comments containing these words are blocked from publishing on {page.name}.
          </p>
          {caps.canEditPrivacy && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newWord}
                maxLength={60}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddWord();
                  }
                }}
                placeholder="Add blocked word or phrase..."
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
              />
              <button
                type="button"
                onClick={handleAddWord}
                className="min-h-[42px] px-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-primary)] flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          )}

          {hiddenWords.length > 0 && (
            <div className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3">
              {hiddenWords.map((word) => (
                <div key={word} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-[var(--color-text-primary)]">{word}</span>
                  {caps.canEditPrivacy && (
                    <button
                      type="button"
                      onClick={() => setHiddenWords((prev) => prev.filter((w) => w !== word))}
                      className="text-[11px] font-bold text-rose-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {caps.canEditPrivacy && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingRules}
              className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              {savingRules ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Content Rules</span>
            </button>
          </div>
        )}
      </form>

      {/* Published & Hidden Page Posts List */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
            Manage Page Posts ({posts.length})
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)]">
            View, pin, hide from feed, or delete posts published by {page.name}
          </p>
        </div>

        {loadingPosts ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : posts.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)] py-4">
            No posts have been published by this Page yet.
          </p>
        ) : (
          <div className="space-y-2.5">
            {posts.map((post) => {
              const isHidden = String(post.visibility || '').toLowerCase() === 'hidden';
              const busy = busyPostId === post.id;
              return (
                <div
                  key={post.id}
                  className="p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-[var(--color-text-secondary)] tabular-nums">
                        {post.createdAt}
                        {post.isPinned ? ' · Pinned' : ''}
                        {isHidden ? ' · Hidden from public feed' : ''}
                      </p>
                      <p className="text-xs text-[var(--color-text-primary)] mt-1 line-clamp-2">
                        {post.content || '(Media post)'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => navigateTo('post-detail', { postId: post.id })}
                      className="min-h-[36px] px-3 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[11px] font-bold text-[var(--color-text-primary)] inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View</span>
                    </button>

                    {caps.canModeratePosts && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleTogglePin(post)}
                          className="min-h-[36px] px-3 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[11px] font-bold text-[var(--color-primary)] inline-flex items-center gap-1"
                        >
                          <Pin className="w-3 h-3" />
                          <span>{post.isPinned ? 'Unpin' : 'Pin'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleToggleHide(post)}
                          className="min-h-[36px] px-3 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[11px] font-bold text-[var(--color-text-primary)] inline-flex items-center gap-1"
                        >
                          {isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          <span>{isHidden ? 'Unhide' : 'Hide'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDeleteTargetPost(post)}
                          className="min-h-[36px] px-3 rounded-lg border border-rose-500/30 text-[11px] font-bold text-rose-500 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Post Confirmation Modal */}
      {deleteTargetPost && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDeleteTargetPost(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-bg-card)] border border-rose-500/30 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-extrabold text-rose-500">Delete Page Post?</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">
              This post and its reactions will be permanently removed from {page.name}.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetPost(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyPostId === deleteTargetPost.id}
                onClick={handleConfirmDeletePost}
                className="min-h-[42px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Delete Post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * SECTION G: FOLLOWERS & COMMUNITY MANAGEMENT
 * ============================================================================ */
export const PageFollowersSection: React.FC<SectionCommonProps> = ({
  page,
  caps,
  syncUpdatedIdentity,
  onDirtyChange,
}) => {
  const { friends, navigateTo, addToast } = useApp();
  const [followers, setFollowers] = useState<PageFollower[]>([]);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [restricted, setRestricted] = useState<PageRestrictedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'followers' | 'restricted' | 'blocked'>('followers');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    onDirtyChange(false);
  }, [onDirtyChange]);

  const loadAudience = useCallback(async () => {
    setLoading(true);
    try {
      const [fols, blks, rsts] = await Promise.all([
        fetchPageFollowers(page.id, 120),
        fetchPageBlocks(page.id),
        fetchPageRestrictedUsers(page.id),
      ]);
      setFollowers(fols);
      setBlocks(blks);
      setRestricted(rsts);
    } finally {
      setLoading(false);
    }
  }, [page.id]);

  useEffect(() => {
    void loadAudience();
  }, [loadAudience]);

  const filteredFollowers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return followers;
    return followers.filter(
      (f) =>
        (f.user?.display_name || '').toLowerCase().includes(q) ||
        (f.user?.username || '').toLowerCase().includes(q)
    );
  }, [followers, search]);

  const handleRemoveFollower = async (userId: string) => {
    if (!caps.canManageFollowers || busyUserId) return;
    setBusyUserId(userId);
    try {
      const res = await removePageFollower(page.id, userId);
      if (res.success) {
        setFollowers((prev) => prev.filter((f) => f.user_id !== userId));
        addToast('Follower removed.', 'info');
        await syncUpdatedIdentity();
      } else {
        addToast(res.error || 'Could not remove follower.', 'warning');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const handleBlock = async (userId: string) => {
    if (!caps.canManageFollowers || busyUserId) return;
    setBusyUserId(userId);
    try {
      const res = await blockUserFromPage(page.id, userId, 'Blocked by Page manager');
      if (res.success) {
        addToast('User blocked from this Page.', 'info');
        await loadAudience();
        await syncUpdatedIdentity();
      } else {
        addToast(res.error || 'Could not block user.', 'warning');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRestrict = async (userId: string) => {
    if (!caps.canManageFollowers || busyUserId) return;
    setBusyUserId(userId);
    try {
      const res = await restrictUserFromPage(page.id, userId, 'Restricted by Page manager');
      if (res.success) {
        addToast('User restricted from commenting or messaging.', 'info');
        await loadAudience();
      } else {
        addToast(res.error || 'Could not restrict user.', 'warning');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
              Community &amp; Audience ({Math.max(page.followersCount, followers.length).toLocaleString()})
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Manage followers, restricted accounts, blocks, and friend invitations
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInviteModalOpen(true)}
            className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Invite Friends</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'followers', label: `Followers (${followers.length})` },
              { id: 'restricted', label: `Restricted (${restricted.length})` },
              { id: 'blocked', label: `Blocked (${blocks.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap ${
                tab === t.id
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search followers by name or @username..."
            className="w-full min-h-[42px] pl-10 pr-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : tab === 'followers' ? (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl divide-y divide-[var(--color-border)]">
          {filteredFollowers.length === 0 ? (
            <p className="p-6 text-center text-xs text-[var(--color-text-secondary)]">
              No matching followers found.
            </p>
          ) : (
            filteredFollowers.map((f) => {
              const name = f.user?.display_name || f.user?.username || 'Student';
              const busy = busyUserId === f.user_id;
              return (
                <div key={f.user_id} className="p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => navigateTo('user-profile', { userId: f.user_id })}
                    className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                  >
                    <Avatar src={f.user?.avatar_url} name={name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{name}</p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                        {f.user?.username ? `@${f.user.username}` : 'Student'}
                      </p>
                    </div>
                  </button>
                  {caps.canManageFollowers && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRestrict(f.user_id)}
                        className="min-h-[36px] px-2.5 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[11px] font-bold text-amber-500 flex items-center gap-1"
                      >
                        <ShieldAlert className="w-3 h-3" />
                        <span>Restrict</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemoveFollower(f.user_id)}
                        className="min-h-[36px] px-2.5 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[11px] font-bold text-[var(--color-text-secondary)] flex items-center gap-1"
                      >
                        <UserX className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleBlock(f.user_id)}
                        className="min-h-[36px] px-2.5 rounded-lg bg-rose-500/10 text-rose-500 text-[11px] font-bold flex items-center gap-1"
                      >
                        <Ban className="w-3 h-3" />
                        <span>Block</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : tab === 'restricted' ? (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl divide-y divide-[var(--color-border)]">
          {restricted.length === 0 ? (
            <p className="p-6 text-center text-xs text-[var(--color-text-secondary)]">
              No restricted users.
            </p>
          ) : (
            restricted.map((r) => (
              <div key={r.user_id} className="p-3.5 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                  {r.user?.display_name || r.user?.username || 'Restricted user'}
                </span>
                <button
                  type="button"
                  disabled={busyUserId === r.user_id}
                  onClick={async () => {
                    setBusyUserId(r.user_id);
                    const res = await unrestrictUserFromPage(page.id, r.user_id);
                    setBusyUserId(null);
                    if (res.success) {
                      setRestricted((prev) => prev.filter((x) => x.user_id !== r.user_id));
                      addToast('Restriction removed.', 'info');
                    }
                  }}
                  className="min-h-[36px] px-3 rounded-lg border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)]"
                >
                  Unrestrict
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl divide-y divide-[var(--color-border)]">
          {blocks.length === 0 ? (
            <p className="p-6 text-center text-xs text-[var(--color-text-secondary)]">
              No blocked users.
            </p>
          ) : (
            blocks.map((b) => (
              <div key={b.user_id} className="p-3.5 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                  {b.user?.display_name || b.user?.username || 'Blocked user'}
                </span>
                <button
                  type="button"
                  disabled={busyUserId === b.user_id}
                  onClick={async () => {
                    setBusyUserId(b.user_id);
                    const res = await unblockUserFromPage(page.id, b.user_id);
                    setBusyUserId(null);
                    if (res.success) {
                      setBlocks((prev) => prev.filter((x) => x.user_id !== b.user_id));
                      addToast('User unblocked.', 'info');
                    }
                  }}
                  className="min-h-[36px] px-3 rounded-lg border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)]"
                >
                  Unblock
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Invite Friends Modal */}
      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setInviteModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[75vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
                Invite Friends to Follow
              </h3>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[var(--color-text-secondary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {friends.length === 0 ? (
                <p className="text-xs text-[var(--color-text-secondary)] text-center py-6">
                  Connect with coursemates in Friends to invite them.
                </p>
              ) : (
                friends.map((friend) => {
                  const invited = invitedFriendIds.has(friend.id);
                  return (
                    <div
                      key={friend.id}
                      className="p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar src={friend.avatar} name={friend.name} size="sm" />
                        <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                          {friend.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={invited}
                        onClick={async () => {
                          const res = await inviteFriendToPage(page.id, friend.id);
                          if (res.success) {
                            setInvitedFriendIds((prev) => new Set(prev).add(friend.id));
                            addToast('Follow invitation sent.', 'success');
                          } else {
                            addToast(res.error || 'Could not invite friend.', 'warning');
                          }
                        }}
                        className="min-h-[36px] px-3 rounded-lg bg-[var(--color-primary)] text-white text-xs font-bold disabled:opacity-50"
                      >
                        {invited ? 'Invited' : 'Invite'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * SECTION H: VERIFICATION & TRUST
 * ============================================================================ */
export const PageVerificationSection: React.FC<SectionCommonProps> = ({
  page,
  caps,
  onDirtyChange,
}) => {
  const { addToast } = useApp();
  const [requests, setRequests] = useState<PageVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [officialName, setOfficialName] = useState(page.name);
  const [category, setCategory] = useState<PageCategory>(toCanonicalPageCategory(page.category));
  const [reason, setReason] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    onDirtyChange(reason.trim().length > 0 || evidenceUrl.trim().length > 0);
  }, [reason, evidenceUrl, onDirtyChange]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchPageVerificationRequests(page.id);
      setRequests(list);
    } finally {
      setLoading(false);
    }
  }, [page.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const hasPending = requests.some((r) => r.status === 'pending');

  const checklist = [
    { label: 'Page is active and not disabled', passed: page.status === 'active' },
    { label: 'Profile avatar uploaded', passed: Boolean(page.avatarUrl || page.avatar_url) },
    { label: 'Bio completed (at least 20 characters)', passed: (page.description || '').trim().length >= 20 },
    { label: 'At least 1 post published', passed: (page.postsCount ?? page.posts_count ?? 0) >= 1 },
    { label: 'At least 5 followers', passed: page.followersCount >= 5 },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caps.canRequestVerification || submitting || hasPending || page.isVerified) return;
    setSubmitting(true);
    try {
      const res = await submitPageVerificationRequest({
        pageId: page.id,
        category,
        officialName,
        reason,
        evidenceUrl,
      });
      if (res.success) {
        addToast('Verification request submitted for Super Admin review.', 'success');
        setReason('');
        setEvidenceUrl('');
        await loadHistory();
      } else {
        addToast(res.error || 'Could not submit verification request.', 'warning');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {page.isVerified ? (
              <VerifiedBadge size={20} />
            ) : (
              <BadgeCheck className="w-5 h-5 text-[var(--color-text-secondary)]" />
            )}
            <div>
              <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
                {page.isVerified ? 'Verified Campus Page' : 'Not Yet Verified'}
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Verification badges are granted exclusively by ABSU Connect Super Admins.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-[var(--color-border)] space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Readiness Checklist
          </p>
          {checklist.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              {item.passed ? (
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <span
                className={
                  item.passed
                    ? 'text-[var(--color-text-primary)] font-semibold'
                    : 'text-[var(--color-text-secondary)]'
                }
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {!page.isVerified && caps.canRequestVerification && (
        <form
          onSubmit={handleSubmit}
          className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3.5"
        >
          <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
            Request Verification Badge
          </h3>

          {hasPending ? (
            <p className="text-xs font-semibold text-amber-500">
              You already have a verification request awaiting Super Admin review.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">
                  Official Page / Organization Name
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={officialName}
                  onChange={(e) => setOfficialName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">Category</label>
                <select
                  value={toCanonicalPageCategory(category)}
                  onChange={(e) => setCategory(e.target.value as PageCategory)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)]"
                >
                  {PAGE_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">
                  Why should {page.name} be verified?
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={15}
                  maxLength={800}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Share official department, fellowship, SUG, or campus media context..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">
                  Supporting Link (Optional)
                </label>
                <input
                  type="url"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                  <span>Submit Request</span>
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {/* Request History */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-2.5">
        <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
          Request History ({requests.length})
        </h3>
        {loading ? (
          <div className="py-4 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : requests.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">No verification requests submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <div
                key={req.id}
                className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] space-y-1"
              >
                <p className="text-xs font-bold text-[var(--color-text-primary)]">
                  {req.official_name} ·{' '}
                  <span
                    className={
                      req.status === 'approved'
                        ? 'text-emerald-500'
                        : req.status === 'rejected'
                        ? 'text-rose-500'
                        : 'text-amber-500'
                    }
                  >
                    {req.status.toUpperCase()}
                  </span>
                </p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  {formatPageCategoryLabel(req.category)} · {new Date(req.created_at).toLocaleDateString()}
                </p>
                {req.review_note && (
                  <p className="text-xs text-[var(--color-text-primary)] pt-1">
                    Reviewer note: {req.review_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * SECTION I: ACTIVITY & AUDIT LOGS
 * ============================================================================ */
export const PageActivityLogsSection: React.FC<SectionCommonProps> = ({
  page,
  onDirtyChange,
}) => {
  const [logs, setLogs] = useState<PageAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onDirtyChange(false);
  }, [onDirtyChange]);

  useEffect(() => {
    setLoading(true);
    void fetchPageAuditLogs(page.id, 60)
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [page.id]);

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Administrative Activity &amp; Audit Log</span>
        </h2>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Recorded updates to Page details, roles, posts, privacy, and verification
        </p>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-[var(--color-text-secondary)] py-4">
          No administrative activity recorded yet.
        </p>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {logs.map((log) => (
            <div key={log.id} className="py-2.5 flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-[var(--color-text-primary)]">
                  {log.details || log.action.replace(/_/g, ' ')}
                </p>
                <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 tabular-nums">
                  {log.actor?.display_name || 'Page Manager'} ·{' '}
                  {new Date(log.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * SECTION J: DATA, CLOUDINARY MEDIA & EXPORT
 * ============================================================================ */
export const PageDataStorageSection: React.FC<SectionCommonProps> = ({
  page,
  caps,
  onDirtyChange,
}) => {
  const { currentUser, addToast, setImageLightboxUrl } = useApp();
  const [inventory, setInventory] = useState<PageMediaInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    onDirtyChange(false);
  }, [onDirtyChange]);

  useEffect(() => {
    setLoading(true);
    void fetchPageMediaInventory(page)
      .then(setInventory)
      .finally(() => setLoading(false));
  }, [page]);

  const handleExportJson = async () => {
    if (!caps.canExportData || exporting) return;
    setExporting(true);
    try {
      const bundle = await buildPageDataExportBundle(page, currentUser.id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${page.slug || 'absu-page'}-export.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      addToast('Page archive JSON downloaded.', 'success');
    } catch {
      addToast('Could not generate Page data export.', 'warning');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <Database className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Cloudinary Media Inventory</span>
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              All Page photos, avatars, covers, and videos are hosted on Cloudinary
            </p>
          </div>
          {caps.canExportData && (
            <button
              type="button"
              disabled={exporting}
              onClick={handleExportJson}
              className="min-h-[44px] px-4 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{exporting ? 'Exporting...' : 'Download JSON Export'}</span>
            </button>
          )}
        </div>

        {loading || !inventory ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                <p className="text-[11px] text-[var(--color-text-secondary)]">Total Files</p>
                <p className="text-base font-extrabold text-[var(--color-text-primary)] tabular-nums mt-0.5">
                  {inventory.totalFiles.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                <p className="text-[11px] text-[var(--color-text-secondary)]">Photos</p>
                <p className="text-base font-extrabold text-[var(--color-text-primary)] tabular-nums mt-0.5">
                  {inventory.imageCount.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                <p className="text-[11px] text-[var(--color-text-secondary)]">Videos</p>
                <p className="text-base font-extrabold text-[var(--color-text-primary)] tabular-nums mt-0.5">
                  {inventory.videoCount.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                <p className="text-[11px] text-[var(--color-text-secondary)]">Tracked Size</p>
                <p className="text-base font-extrabold text-[var(--color-text-primary)] tabular-nums mt-0.5">
                  {formatByteSize(inventory.totalBytes)}
                </p>
              </div>
            </div>

            {inventory.items.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {inventory.items.slice(0, 12).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.kind !== 'post_video') setImageLightboxUrl(item.url);
                    }}
                    className="aspect-square rounded-xl overflow-hidden bg-[var(--color-bg-main)] border border-[var(--color-border)] relative"
                  >
                    {item.kind === 'post_video' ? (
                      <video
                        src={item.url}
                        poster={item.thumbnailUrl || undefined}
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img src={item.url} alt={item.kind} className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * SECTION K: DANGER ZONE (OWNER ONLY)
 * ============================================================================ */
export const PageDangerZoneSection: React.FC<SectionCommonProps> = ({
  page,
  caps,
  syncUpdatedIdentity,
  onDirtyChange,
}) => {
  const { addToast, refreshManagedPages, switchIdentity } = useApp();
  const [busy, setBusy] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  useEffect(() => {
    onDirtyChange(false);
  }, [onDirtyChange]);

  const handleToggleVisibility = async () => {
    if (!caps.canDisableOrDelete || busy) return;
    const nextStatus = page.status === 'active' ? 'disabled' : 'active';
    setBusy(true);
    try {
      const res = await updatePageStatusByOwner(
        page.id,
        nextStatus,
        nextStatus === 'disabled' ? 'Temporarily disabled by Page Owner' : undefined
      );
      if (res.success) {
        addToast(
          nextStatus === 'disabled'
            ? 'Page hidden from public campus feeds.'
            : 'Page reactivated across campus feeds.',
          'info'
        );
        await refreshManagedPages();
        if (nextStatus === 'disabled') {
          await switchIdentity('personal');
        } else {
          await syncUpdatedIdentity();
        }
      } else {
        addToast(res.error || 'Could not update Page visibility.', 'warning');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRequestDelete = async () => {
    if (!caps.canDisableOrDelete || busy) return;
    setBusy(true);
    try {
      const res = await requestPageDeletion(page.id);
      if (res.success) {
        setDeleteModalOpen(false);
        setDeleteConfirmName('');
        addToast('Page scheduled for deletion (30-day recovery window).', 'info');
        await refreshManagedPages();
        await switchIdentity('personal');
      } else {
        addToast(res.error || 'Could not schedule Page deletion.', 'warning');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCancelDelete = async () => {
    if (!caps.canDisableOrDelete || busy) return;
    setBusy(true);
    try {
      const res = await cancelPageDeletion(page.id);
      if (res.success) {
        addToast('Page deletion cancelled and Page restored.', 'success');
        await syncUpdatedIdentity();
      } else {
        addToast(res.error || 'Could not restore Page.', 'warning');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!caps.canDisableOrDelete) {
    return (
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 text-xs text-[var(--color-text-secondary)]">
        Only the Page Owner can temporarily disable, restore, or delete {page.name}.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-bg-card)] border border-rose-500/30 rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="text-sm font-extrabold text-rose-500 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            <span>Deactivation &amp; Permanent Deletion</span>
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Deleted Pages stay recoverable for 30 days before permanent removal of posts and followers.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
          <div>
            <p className="text-xs font-bold text-[var(--color-text-primary)]">
              {page.status === 'active' ? 'Temporarily Deactivate Page' : 'Reactivate Page'}
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              {page.status === 'active'
                ? 'Hides your Page from discovery and feeds without losing followers or posts.'
                : 'Makes your Page visible again across ABSU Connect.'}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={handleToggleVisibility}
            className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Power className="w-3.5 h-3.5 text-amber-500" />
            <span>{page.status === 'active' ? 'Deactivate Page' : 'Activate Page'}</span>
          </button>
        </div>

        {page.deletion_requested_at ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div>
              <p className="text-xs font-bold text-amber-500">Scheduled for Deletion</p>
              <p className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
                Requested on {new Date(page.deletion_requested_at).toLocaleDateString()} · 30-day recovery active
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleCancelDelete}
              className="min-h-[44px] px-4 rounded-xl bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Cancel Deletion</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <div>
              <p className="text-xs font-bold text-rose-500">Delete Page</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Starts a 30-day soft deletion window before permanent removal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Page</span>
            </button>
          </div>
        )}
      </div>

      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDeleteModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-bg-card)] border border-rose-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-rose-500">Delete {page.name}?</h3>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[var(--color-text-secondary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Your Page will enter a 30-day pending deletion window. Type{' '}
              <strong className="text-[var(--color-text-primary)]">{page.name}</strong> below to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={page.name}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirmName('');
                }}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  deleteConfirmName.trim().toLowerCase() !== page.name.trim().toLowerCase()
                }
                onClick={handleRequestDelete}
                className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
