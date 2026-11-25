import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Save,
  Loader2,
  Camera,
  ImagePlus,
  Trash2,
  Shield,
  MessageCircle,
  MessageSquare,
  Users,
  UserPlus,
  Bell,
  Clock,
  Lock,
  AlertTriangle,
  RotateCcw,
  Check,
  X,
  Activity,
  AtSign,
  Power,
} from 'lucide-react';
import {
  PAGE_CATEGORY_OPTIONS,
  Page,
  PageAdminInvitation,
  PageAuditLogEntry,
  PageCategory,
  PageManager,
  PageNotificationPreferences,
  toCanonicalPageCategory,
} from '../../types/pages.ts';
import {
  fetchPageManagers,
  fetchPendingPageAdminInvitesForPage,
  searchUsersForPageInvite,
  invitePageAdmin,
  cancelPageAdminInvite,
  removePageAdmin,
  updatePageDetails,
  checkPageSlugAvailability,
  updatePageSlug,
  updatePageStatusByOwner,
  fetchPageNotificationPreferences,
  upsertPageNotificationPreferences,
  fetchPageAuditLogs,
  requestPageDeletion,
  cancelPageDeletion,
} from '../../lib/pageService.ts';
import { uploadPageMediaToCloudinary } from '../../lib/cloudinaryService.ts';
import { getPageNameChangeRemainingDays } from '../../utils/logic.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { ImageCropperModal } from '../common/ImageCropperModal.tsx';

interface PageSettingsViewProps {
  page: Page;
  role: 'owner' | 'admin';
}

export const PageSettingsView: React.FC<PageSettingsViewProps> = ({ page, role }) => {
  const {
    currentUser,
    addToast,
    navigateTo,
    goBack,
    refreshManagedPages,
    switchIdentity,
    activeIdentity,
  } = useApp();

  const isOwner = role === 'owner';

  // Section A: Page Info
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

  // Section B: Appearance
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
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Sections C & D: Messaging & Interaction
  const [allowMessages, setAllowMessages] = useState(page.allowMessages !== false);
  const [allowComments, setAllowComments] = useState(page.allowComments !== false);

  // Section F: Administrators
  const [managers, setManagers] = useState<PageManager[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PageAdminInvitation[]>([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSearchResults, setAdminSearchResults] = useState<
    Array<{ id: string; display_name: string; username: string; avatar_url?: string; department?: string }>
  >([]);
  const [loadingTeam, setLoadingTeam] = useState(true);

  // Section H: Notification Preferences
  const [notifPrefs, setNotifPrefs] = useState<PageNotificationPreferences>({
    page_id: page.id,
    user_id: currentUser.id,
    notify_followers: true,
    notify_messages: true,
    notify_reactions: true,
    notify_comments: true,
    notify_admin_changes: true,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Section I: Audit Logs
  const [auditLogs, setAuditLogs] = useState<PageAuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Saving & Danger Zone State
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [savingSlug, setSavingSlug] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Reset form fields cleanly whenever Page switches
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
    setAllowMessages(page.allowMessages !== false);
    setAllowComments(page.allowComments !== false);
    setDeleteConfirmName('');
  }, [page]);

  const loadSettingsData = async () => {
    setLoadingTeam(true);
    setLoadingLogs(true);
    try {
      const [mgrs, invites, prefs, logs] = await Promise.all([
        fetchPageManagers(page.id),
        isOwner ? fetchPendingPageAdminInvitesForPage(page.id) : Promise.resolve([]),
        fetchPageNotificationPreferences(page.id, currentUser.id),
        fetchPageAuditLogs(page.id, 30),
      ]);
      setManagers(mgrs);
      setPendingInvites(invites);
      setNotifPrefs(prefs);
      setAuditLogs(logs);
    } finally {
      setLoadingTeam(false);
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    void loadSettingsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, isOwner, currentUser.id]);

  // Debounced handle/slug availability check
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

  // Debounced admin invite search
  useEffect(() => {
    if (!isOwner || adminSearch.trim().length < 2) {
      setAdminSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchUsersForPageInvite(adminSearch);
      setAdminSearchResults(results);
    }, 250);
    return () => clearTimeout(timer);
  }, [adminSearch, isOwner]);

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

  const syncUpdatedIdentity = async () => {
    await refreshManagedPages();
    if (activeIdentity.type === 'page' && activeIdentity.pageId === page.id) {
      await switchIdentity(page.id);
    }
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingInfo) return;
    setSavingInfo(true);
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
        allow_messages: allowMessages,
        allow_comments: allowComments,
      });

      if (!res.success) {
        addToast(res.error || 'Could not save Page information.', 'warning');
        return;
      }

      await syncUpdatedIdentity();
      addToast('Page info & controls saved.', 'success');
      void loadSettingsData();
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSaveHandle = async () => {
    if (!isOwner || savingSlug) return;
    const clean = slug.trim().toLowerCase().replace(/^@+/, '');
    if (clean === page.slug.toLowerCase()) return;
    setSavingSlug(true);
    try {
      const res = await updatePageSlug(page.id, clean);
      if (res.success && res.slug) {
        setSlug(res.slug);
        setSlugStatus('idle');
        await syncUpdatedIdentity();
        addToast(`Page handle updated to @${res.slug}.`, 'success');
        void loadSettingsData();
      } else {
        addToast(res.error || 'Could not update Page handle.', 'warning');
      }
    } finally {
      setSavingSlug(false);
    }
  };

  const handleSaveAppearance = async () => {
    if (savingAppearance) return;
    setSavingAppearance(true);
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
      addToast('Page appearance updated.', 'success');
      void loadSettingsData();
    } finally {
      setSavingAppearance(false);
    }
  };

  const handleToggleNotifPref = async (
    key: keyof Pick<
      PageNotificationPreferences,
      'notify_followers' | 'notify_messages' | 'notify_reactions' | 'notify_comments' | 'notify_admin_changes'
    >
  ) => {
    if (savingPrefs) return;
    const nextPrefs = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(nextPrefs);
    setSavingPrefs(true);
    try {
      const res = await upsertPageNotificationPreferences(page.id, nextPrefs, currentUser.id);
      if (!res.success) {
        setNotifPrefs(notifPrefs);
        addToast(res.error || 'Could not update notification preferences.', 'warning');
      } else {
        addToast('Notification preferences saved.', 'success');
      }
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleInviteAdmin = async (username: string) => {
    if (!isOwner || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await invitePageAdmin(page.id, username);
      if (res.success) {
        addToast(`Admin invitation sent to @${username}.`, 'success');
        setAdminSearch('');
        await loadSettingsData();
      } else {
        addToast(res.error || 'Could not send admin invitation.', 'warning');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelInvite = async (invitationId: string) => {
    if (!isOwner || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await cancelPageAdminInvite(invitationId);
      if (res.success) {
        setPendingInvites((prev) => prev.filter((i) => i.id !== invitationId));
        addToast('Admin invitation cancelled.', 'info');
      } else {
        addToast(res.error || 'Could not cancel invitation.', 'warning');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    if (!isOwner || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await removePageAdmin(page.id, userId);
      if (res.success) {
        addToast('Admin removed from Page.', 'info');
        await loadSettingsData();
      } else {
        addToast(res.error || 'Could not remove Admin.', 'warning');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleVisibilityStatus = async () => {
    if (!isOwner || actionBusy) return;
    const nextStatus = page.status === 'active' ? 'disabled' : 'active';
    setActionBusy(true);
    try {
      const res = await updatePageStatusByOwner(
        page.id,
        nextStatus,
        nextStatus === 'disabled' ? 'Temporarily disabled by Page Owner' : undefined
      );
      if (res.success) {
        addToast(
          nextStatus === 'disabled'
            ? 'Page hidden from public campus feed.'
            : 'Page reactivated and visible to students.',
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
      setActionBusy(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (!isOwner || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await requestPageDeletion(page.id);
      if (res.success) {
        setDeleteModalOpen(false);
        setDeleteConfirmName('');
        addToast('Page scheduled for deletion (30-day recovery window).', 'info');
        await refreshManagedPages();
        await switchIdentity('personal');
      } else {
        addToast(res.error || 'Could not request Page deletion.', 'warning');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelDeletion = async () => {
    if (!isOwner || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await cancelPageDeletion(page.id);
      if (res.success) {
        addToast('Page restored!', 'success');
        await syncUpdatedIdentity();
      } else {
        addToast(res.error || 'Could not restore Page.', 'warning');
      }
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-extrabold text-[var(--color-text-primary)] truncate">
                Page Settings
              </h1>
              {page.isVerified && <VerifiedBadge size={16} />}
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] truncate">
              {page.name} · Role: {isOwner ? 'Owner (Full Control)' : 'Admin (Editor & Inbox)'}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION A & C & D: Page Info, Handle, Messaging & Interaction Controls */}
      <form
        onSubmit={handleSaveInfo}
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
              Page Info &amp; Identity Controls
            </h2>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Name, category, bio, contact links, and interaction permissions
            </p>
          </div>
        </div>

        {/* Page Name + 30-day Cooldown */}
        <div className="space-y-1">
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
            className="w-full min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] disabled:opacity-60"
          />
          {remainingCooldownDays > 0 && (
            <p className="text-[11px] text-amber-500">
              Page name can only be changed once every 30 days ({remainingCooldownDays} day(s) remaining).
            </p>
          )}
        </div>

        {/* Category */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-[var(--color-text-primary)]">Category</label>
          <select
            value={toCanonicalPageCategory(category)}
            onChange={(e) => setCategory(e.target.value as PageCategory)}
            className="w-full min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)]"
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
            placeholder="Tell ABSU students what this Page is about..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] resize-none"
          />
        </div>

        {/* Contact Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Uturu, Abia State"
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">WhatsApp</label>
            <input
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+234..."
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">Contact Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="page@absuconnect.edu.ng"
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-primary)]">Contact Phone</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+234..."
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
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
            className="w-full min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
          />
        </div>

        {/* Sections C & D: Messaging & Interaction Toggles */}
        <div className="p-3.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Messaging &amp; Interaction Controls</span>
            </h3>
            <button
              type="button"
              onClick={() => navigateTo('page-inbox', { pageId: page.id })}
              className="text-[11px] font-bold text-[var(--color-primary)] hover:underline"
            >
              Open Page Inbox
            </button>
          </div>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="flex items-center gap-2.5">
              <MessageCircle className="w-4 h-4 text-[var(--color-primary)]" />
              <div>
                <p className="text-xs font-bold text-[var(--color-text-primary)]">Allow Direct Messages</p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">Students can message {page.name}</p>
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
                <p className="text-[11px] text-[var(--color-text-secondary)]">Turn off to restrict student replies on posts</p>
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

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingInfo}
            className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            {savingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{savingInfo ? 'Saving...' : 'Save Page Info'}</span>
          </button>
        </div>
      </form>

      {/* Handle / Slug Update (Owner Only) */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <AtSign className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Page Handle (@slug)</span>
            </h2>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Unique public handle used for {page.name}
            </p>
          </div>
          {!isOwner && (
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Owner only</span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <input
              type="text"
              disabled={!isOwner}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/^@+/, ''))}
              placeholder="page-handle"
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] disabled:opacity-60"
            />
            {slugStatus === 'checking' && (
              <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">Checking availability...</p>
            )}
            {slugStatus === 'available' && (
              <p className="text-[11px] text-emerald-500 font-semibold mt-1">@{slug} is available!</p>
            )}
            {slugStatus === 'taken' && (
              <p className="text-[11px] text-rose-500 font-semibold mt-1">
                Handle is invalid or already taken.
              </p>
            )}
          </div>
          {isOwner && (
            <button
              type="button"
              disabled={savingSlug || slugStatus === 'taken' || slug.trim().toLowerCase() === page.slug.toLowerCase()}
              onClick={handleSaveHandle}
              className="min-h-[42px] px-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {savingSlug ? 'Updating...' : 'Update Handle'}
            </button>
          )}
        </div>
      </div>

      {/* SECTION B: Page Appearance (Cloudinary ONLY) */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
            Page Appearance
          </h2>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            Update avatar &amp; cover banner (Cloudinary-hosted media)
          </p>
        </div>

        <div className="space-y-3">
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5"
            >
              <ImagePlus className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Upload Cover (16:9)</span>
            </button>
            {(coverPreview && !removeCover) && (
              <button
                type="button"
                onClick={() => {
                  setCoverFile(null);
                  setCoverPreview('');
                  setRemoveCover(true);
                }}
                className="min-h-[40px] px-3 rounded-xl border border-rose-500/30 text-xs font-bold text-rose-500"
              >
                Remove Cover
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--color-border)]">
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>Upload Avatar</span>
              </button>
              {(avatarPreview && !removeAvatar) && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreview('');
                    setRemoveAvatar(true);
                  }}
                  className="min-h-[40px] px-3 rounded-xl border border-rose-500/30 text-xs font-bold text-rose-500"
                >
                  Remove
                </button>
              )}
            </div>
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
        </div>

        {(avatarFile || coverFile || removeAvatar || removeCover) && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={savingAppearance}
              onClick={handleSaveAppearance}
              className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              {savingAppearance ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{savingAppearance ? 'Uploading...' : 'Save Appearance'}</span>
            </button>
          </div>
        )}
      </div>

      {/* SECTION E: Followers & Community Shortcut */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Users className="w-4 h-4 text-[var(--color-primary)]" />
            <span>Followers &amp; Community</span>
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            {page.followersCount.toLocaleString()} followers · Manage audience, blocks &amp; friend invites
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigateTo('page-followers', { pageId: page.id })}
          className="min-h-[42px] px-4 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-xs font-bold whitespace-nowrap"
        >
          Manage Followers
        </button>
      </div>

      {/* SECTION F: Page Administrators */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-[var(--color-primary)]" />
            <span>Page Administrators</span>
          </h2>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            {isOwner
              ? 'Invite trusted students to post, reply to inbox messages, and manage this Page.'
              : 'Only the Page Owner can add or remove Administrators.'}
          </p>
        </div>

        {isOwner && (
          <div className="space-y-2">
            <input
              type="search"
              value={adminSearch}
              onChange={(e) => setAdminSearch(e.target.value)}
              placeholder="Search student by name or @username to invite..."
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)]"
            />
            {adminSearchResults.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto p-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)]">
                {adminSearchResults.map((u) => (
                  <div
                    key={u.id}
                    className="p-2 rounded-xl flex items-center justify-between gap-2 bg-[var(--color-bg-card)]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar src={u.avatar_url} name={u.display_name} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                          {u.display_name}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                          @{u.username}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleInviteAdmin(u.username)}
                      className="min-h-[38px] px-3 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Invite Admin</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loadingTeam ? (
          <div className="py-4 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : (
          <div className="space-y-2">
            {managers.map((m) => (
              <div
                key={m.user_id}
                className="p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-between gap-2"
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
                    </p>
                    <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                      {m.role === 'owner' ? 'Owner' : 'Admin'}
                      {m.user?.username ? ` · @${m.user.username}` : ''}
                    </p>
                  </div>
                </div>
                {isOwner && m.role !== 'owner' && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleRemoveAdmin(m.user_id)}
                    className="min-h-[38px] px-3 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}

            {isOwner && pendingInvites.length > 0 && (
              <div className="pt-2 space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Pending Admin Invitations ({pendingInvites.length})
                </p>
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                        {inv.inviter?.display_name || `@${inv.inviter?.username || 'student'}`}
                      </p>
                      <p className="text-[11px] text-amber-500">Pending acceptance</p>
                    </div>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleCancelInvite(inv.id)}
                      className="min-h-[36px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)] hover:text-rose-500"
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

      {/* SECTION H: Page Notification Preferences */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-[var(--color-primary)]" />
            <span>Page Notification Preferences</span>
          </h2>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            Choose which Page alerts notify your Page inbox &amp; alert center
          </p>
        </div>

        {(
          [
            { key: 'notify_followers', label: 'New Followers', desc: 'Alert when students follow this Page' },
            { key: 'notify_messages', label: 'Page Messages', desc: 'Alert when students message Page Inbox' },
            { key: 'notify_reactions', label: 'Post Reactions', desc: 'Alert on reactions to Page posts' },
            { key: 'notify_comments', label: 'Post Comments', desc: 'Alert on new comments & replies' },
            { key: 'notify_admin_changes', label: 'Admin & Verification Alerts', desc: 'Team role changes & moderation updates' },
          ] as const
        ).map((item) => (
          <label
            key={item.key}
            className="flex items-center justify-between gap-3 py-1.5 cursor-pointer"
          >
            <div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">{item.label}</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">{item.desc}</p>
            </div>
            <input
              type="checkbox"
              disabled={savingPrefs}
              checked={Boolean(notifPrefs[item.key])}
              onChange={() => handleToggleNotifPref(item.key)}
              className="w-4 h-4 accent-[var(--color-primary)]"
            />
          </label>
        ))}
      </div>

      {/* SECTION I: Page Activity & Audit Logs */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-[var(--color-primary)]" />
            <span>Page Activity &amp; Security Log</span>
          </h2>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            Recorded Page updates, verification changes, and manager actions
          </p>
        </div>

        {loadingLogs ? (
          <div className="py-4 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : auditLogs.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)] py-2">
            No administrative actions recorded yet.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-bold text-[var(--color-text-primary)] truncate">
                    {log.details || log.action.replace(/_/g, ' ')}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    {log.actor?.display_name || 'Page Manager'} ·{' '}
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTIONS G & J: Visibility Status & Soft Deletion (Owner Only) */}
      {isOwner && (
        <div className="bg-[var(--color-bg-card)] border border-rose-500/30 rounded-2xl p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="text-sm font-extrabold text-rose-500 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Page Visibility &amp; Deletion</span>
            </h2>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Temporarily unpublish your Page or schedule a 30-day soft deletion
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">
                {page.status === 'active' ? 'Temporarily Disable Page' : 'Reactivate Page'}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                {page.status === 'active'
                  ? 'Hides Page from discovery while preserving all posts and followers.'
                  : 'Restores Page visibility across campus feeds.'}
              </p>
            </div>
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleToggleVisibilityStatus}
              className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Power className="w-3.5 h-3.5 text-amber-500" />
              <span>{page.status === 'active' ? 'Disable Page' : 'Activate Page'}</span>
            </button>
          </div>

          {page.deletion_requested_at ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div>
                <p className="text-xs font-bold text-amber-500">Scheduled for Deletion</p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  Requested on {new Date(page.deletion_requested_at).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleCancelDeletion}
                className="min-h-[42px] px-4 rounded-xl bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Page</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <div>
                <p className="text-xs font-bold text-rose-500">Delete Page</p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  Starts a 30-day recovery period before permanent deletion.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Page</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Typed Delete Confirmation Modal */}
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
                className="p-1 text-[var(--color-text-secondary)]"
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
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirmName('');
                }}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  actionBusy ||
                  deleteConfirmName.trim().toLowerCase() !== page.name.trim().toLowerCase()
                }
                onClick={handleRequestDeletion}
                className="min-h-[42px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
