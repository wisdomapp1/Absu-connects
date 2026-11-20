import React, { useState, useRef, useEffect } from 'react';
import type { PageCategory } from '../../types/pages.ts';
import { submitPageApplication } from '../../lib/pageService.ts';
import { uploadPageAssetToStorage } from '../../lib/storageService.ts';
import {
  Building2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
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
  HelpCircle,
} from 'lucide-react';

interface CreatePageModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onApplicationSubmitted?: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const CATEGORIES: { id: PageCategory; label: string; desc: string }[] = [
  {
    id: 'organization',
    label: 'Student Association / Faculty / Dept',
    desc: 'SUG, Faculty/Departmental associations, hall councils',
  },
  {
    id: 'community',
    label: 'Club / Campus Society / Fellowship',
    desc: 'Interest clubs, religious fellowships, volunteer groups',
  },
  {
    id: 'business',
    label: 'Campus Business / Vendor / Service',
    desc: 'Student brands, food vendors, graphic designers, printing',
  },
  {
    id: 'creator',
    label: 'Campus Creator / Media / News',
    desc: 'Podcasts, campus magazines, photography, bloggers',
  },
  {
    id: 'other',
    label: 'Other Campus Initiative',
    desc: 'Special projects, campus campaigns, academic teams',
  },
];

export const CreatePageModal: React.FC<CreatePageModalProps> = ({
  isOpen,
  onClose,
  userId,
  onApplicationSubmitted,
  onShowToast,
}) => {
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<PageCategory>('organization');
  const [description, setDescription] = useState('');
  const [whyCreate, setWhyCreate] = useState('');
  const [location, setLocation] = useState('Abia State University, Uturu');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const cleanupPreviews = () => {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
    }
    if (coverPreview) {
      URL.revokeObjectURL(coverPreview);
      setCoverPreview(null);
    }
  };

  useEffect(() => {
    return () => {
      cleanupPreviews();
    };
  }, []);

  if (!isOpen) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      onShowToast?.('Please select a valid image file (JPG, PNG, WebP)', 'error');
      return;
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      onShowToast?.('Please select a valid image file (JPG, PNG, WebP)', 'error');
      return;
    }

    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleRemoveCover = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview(null);
  };

  const handleResetAndClose = () => {
    if (isSubmitting) return;
    cleanupPreviews();
    setName('');
    setDescription('');
    setWhyCreate('');
    setContactEmail('');
    setContactPhone('');
    setAvatarFile(null);
    setCoverFile(null);
    setSubmittedSuccess(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || name.trim().length < 3) {
      onShowToast?.('Page name must be at least 3 characters', 'error');
      return;
    }
    if (!description.trim() || description.trim().length < 15) {
      onShowToast?.('Please write a descriptive bio (at least 15 characters)', 'error');
      return;
    }
    if (!whyCreate.trim() || whyCreate.trim().length < 15) {
      onShowToast?.('Please explain why you are creating this page (at least 15 characters)', 'error');
      return;
    }

    setIsSubmitting(true);
    setProgressMsg('Uploading page brand assets...');

    let avatarUrl: string | undefined;
    let coverUrl: string | undefined;

    // Upload directly to dedicated page-assets bucket
    if (avatarFile) {
      setProgressMsg('Uploading page logo to page-assets...');
      const res = await uploadPageAssetToStorage(userId, avatarFile, 'avatar');
      if (res.success && res.url) avatarUrl = res.url;
    }

    if (coverFile) {
      setProgressMsg('Uploading page banner to page-assets...');
      const res = await uploadPageAssetToStorage(userId, coverFile, 'cover');
      if (res.success && res.url) coverUrl = res.url;
    }

    setProgressMsg('Submitting application for administrative review...');

    const appRes = await submitPageApplication({
      applicantId: userId,
      name: name.trim(),
      category,
      description: description.trim(),
      whyCreate: whyCreate.trim(),
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      location: location.trim() || undefined,
      avatarPath: avatarUrl,
      coverPath: coverUrl,
    });

    setIsSubmitting(false);

    if (appRes.success) {
      setSubmittedSuccess(true);
      onShowToast?.('🎉 Page application submitted for admin review!', 'success');
      onApplicationSubmitted?.();
    } else {
      onShowToast?.(appRes.error || 'Failed to submit application', 'error');
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
                Create Campus Page
              </h2>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Official presence for departmental associations, faculty bodies, student clubs, and campus brands
              </p>
            </div>
          </div>

          <button
            onClick={handleResetAndClose}
            className="p-1.5 rounded-xl hover:bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submittedSuccess ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-[var(--color-text-primary)]">Application Submitted!</h3>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto leading-relaxed">
                Your request to create <span className="font-bold text-[var(--color-text-primary)]">"{name}"</span> has been sent to the ABSU Connect Super Admin team. You will be notified immediately once reviewed.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] max-w-md mx-auto text-left space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-primary)]">
                <ShieldCheck className="w-4 h-4" />
                <span>Verification &amp; Publishing Policy</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                Pages represent official student organizations, fellowships, or campus brands. Approval grants you access to publish official updates, manage page roles, and pin announcements.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-6 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:bg-[var(--color-primary-hover)] transition-all shadow-md active:scale-95"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
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

            {/* Page Cover Banner Picker */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">
                  Page Cover Banner (16:9 Landscape)
                </label>
                {coverPreview && (
                  <span className="text-[11px] text-[var(--color-primary)] font-semibold">
                    Banner attached
                  </span>
                )}
              </div>
              {coverPreview ? (
                <div className="relative h-32 sm:h-36 w-full rounded-2xl overflow-hidden bg-slate-950 border border-[var(--color-border)] shadow-md group flex items-center justify-center">
                  <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
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
                    Wide background header for your campus page
                  </span>
                </div>
              )}
            </div>

            {/* Page Profile / Logo Picker */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">
                  Page Logo / Profile Picture
                </label>
                {avatarPreview && (
                  <span className="text-[11px] text-[var(--color-primary)] font-semibold">
                    Logo attached
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
                      <span>{avatarPreview ? 'Change Logo' : 'Upload Official Logo'}</span>
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
                    Square or circular emblem for official identification
                  </p>
                </div>
              </div>
            </div>

            {/* Live Identity Card Mockup */}
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-2 border border-slate-800">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-400">
                <Eye className="w-3.5 h-3.5" />
                <span>Live Page Header Preview</span>
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
                        {name.trim() || 'Your Page Name'}
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

            {/* Page Name */}
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Official Page Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. LAWSA ABSU, NACOS Chapter, Campus Daily News"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 font-medium transition-all"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Category <span className="text-rose-500">*</span>
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

            {/* Bio / Description */}
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                About / Bio <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your organization, department, or initiative..."
                className="w-full p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 resize-none transition-all"
              />
            </div>

            {/* Why Create / Purpose */}
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                Why are you creating this page? <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={whyCreate}
                onChange={(e) => setWhyCreate(e.target.value)}
                placeholder="Briefly state your role (e.g. Association PRO, President, Founder) and purpose..."
                className="w-full p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 resize-none transition-all"
              />
            </div>

            {/* Location & Contacts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                  Location / Office
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Faculty of Law, Uturu"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                  Contact Phone
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+234..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={handleResetAndClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !name.trim() || !description.trim() || !whyCreate.trim()}
                className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-md shadow-[var(--color-primary)]/20 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{progressMsg || 'Submitting...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Submit Application</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
