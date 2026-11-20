import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AuthLayout } from './AuthLayout.tsx';
import { validateImageFile } from '../../utils/logic.ts';
import { uploadProfileAvatarToStorage, createInMemoryFile } from '../../lib/storageService.ts';
import {
  Camera,
  X,
  Upload,
  RefreshCw,
  Plus,
  Check,
  AlertCircle,
  Loader2,
  GraduationCap,
  BookOpen,
  MapPin,
  Sparkles,
} from 'lucide-react';

const SUGGESTED_INTERESTS = [
  'Football',
  'Coding',
  'Music',
  'Reading',
  'Gaming',
  'Entrepreneurship',
  'Robotics',
  'Photography',
  'Design',
  'Debating',
];

const ABSU_CAMPUSES = [
  'Uturu (Main Campus)',
  'Aba (College of Health Sciences)',
  'Umuahia Campus',
];

const ACADEMIC_LEVELS = [
  '100 Level',
  '200 Level',
  '300 Level',
  '400 Level',
  '500 Level',
  'Postgraduate',
];

export const ProfileSetupView: React.FC = () => {
  const { user, session, profile, saveProfile, skipOnboarding, setAuthView } = useAuth();

  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [department, setDepartment] = useState(profile?.department && profile.department !== 'Undergraduate Student' ? profile.department : '');
  const [faculty, setFaculty] = useState(profile?.faculty && profile.faculty !== 'Abia State University' ? profile.faculty : '');
  const [level, setLevel] = useState(profile?.level || '100 Level');
  const [campus, setCampus] = useState(profile?.campus || 'Uturu (Main Campus)');
  const [bio, setBio] = useState(profile?.bio || '');
  const [interests, setInterests] = useState<string[]>(profile?.interests || ['Coding', 'Reading']);
  const [customInterest, setCustomInterest] = useState('');

  const [loading, setLoading] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile({ type: file.type, size: file.size });
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid image file.');
      return;
    }

    setErrorMessage(null);
    try {
      // Read immediately into in-memory ArrayBuffer-backed File while handle is valid
      const mem = await createInMemoryFile(file);
      setSelectedFile(mem.file);
      setAvatarPreview(mem.previewUrl);
    } catch (err) {
      console.warn('[ProfileSetupView] Fallback reading photo:', err);
      setSelectedFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    } finally {
      e.target.value = '';
    }
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    setAvatarPreview(null);
  };

  const handleToggleInterest = (item: string) => {
    if (interests.includes(item)) {
      setInterests((prev) => prev.filter((i) => i !== item));
    } else {
      if (interests.length >= 8) {
        setErrorMessage('You can choose up to 8 interests.');
        return;
      }
      setInterests((prev) => [...prev, item]);
    }
  };

  const handleAddCustomInterest = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customInterest.trim();
    if (!trimmed) return;
    if (interests.some((i) => i.toLowerCase() === trimmed.toLowerCase())) {
      setCustomInterest('');
      return;
    }
    if (interests.length >= 8) {
      setErrorMessage('You can choose up to 8 interests.');
      return;
    }
    setInterests((prev) => [...prev, trimmed]);
    setCustomInterest('');
  };

  const handleSaveAndContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setUploadNotice(null);
    setLoading(true);

    let finalAvatarUrl: string | undefined = undefined;
    let finalAssetId: string | undefined = undefined;

    // Upload to Supabase Storage 'profile-avatars' bucket if user selected a file
    if (selectedFile && user) {
      const uploadRes = await uploadProfileAvatarToStorage(user.id, selectedFile);
      if (uploadRes.success && uploadRes.url) {
        finalAvatarUrl = uploadRes.url;
        finalAssetId = uploadRes.path;
      } else {
        setLoading(false);
        setErrorMessage(uploadRes.error || 'Avatar upload failed. Please try another image.');
        return;
      }
    } else if (avatarPreview) {
      finalAvatarUrl = avatarPreview;
    }

    const nameToSave =
      profile?.name ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.display_name ||
      user?.email?.split('@')[0] ||
      'ABSU Student';

    const res = await saveProfile({
      fullName: nameToSave,
      department: department.trim() || 'Undergraduate Student',
      faculty: faculty.trim() || 'Abia State University',
      level,
      campus,
      bio: bio.trim(),
      interests,
      avatarUrl: finalAvatarUrl,
      avatarAssetId: finalAssetId,
    });

    setLoading(false);

    if (!res.success) {
      setErrorMessage(
        res.error ||
          'Failed to save profile to database. Please review your details and try again.'
      );
      return;
    }

    // Move directly into the application
    setAuthView('app');
  };

  const handleSkip = async () => {
    setSkipping(true);
    await skipOnboarding();
    setSkipping(false);
  };

  return (
    <AuthLayout
      title="Set Up Your Student Profile"
      subtitle="Personalize your ABSU Connect profile so coursemates and faculty peers can find you. All fields are optional."
    >
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-xs font-medium text-[var(--color-error)] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {uploadNotice && (
        <div className="mb-4 p-3 rounded-xl bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 text-xs font-medium text-[var(--color-warning)] flex items-center gap-2">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>{uploadNotice}</span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
        aria-hidden="true"
      />

      <form onSubmit={handleSaveAndContinue} className="flex flex-col gap-4 text-xs">
        {/* A. Profile Picture Section (Optional) */}
        <div className="flex flex-col items-center p-3 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
          <div className="relative group mb-2">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-[var(--color-bg-card)] border-2 border-[var(--color-primary)] flex items-center justify-center shadow-sm">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-[var(--color-text-secondary)]">
                  <Camera className="w-6 h-6 text-[var(--color-primary)] opacity-70" />
                  <span className="text-[9px] mt-0.5">Optional</span>
                </div>
              )}
            </div>

            {avatarPreview && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/75 text-white flex items-center justify-center hover:bg-black transition-colors shadow-sm"
                title="Remove photo"
                aria-label="Remove photo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>{avatarPreview ? 'Change Photo' : 'Upload Photo'}</span>
            </button>
          </div>
          <span className="text-[10px] text-[var(--color-text-secondary)] mt-1">
            JPG, PNG, or WebP up to 10MB
          </span>
        </div>

        {/* B. Department & Faculty */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Department (Optional)
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Computer Science, Law"
              className="w-full px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Faculty (Optional)
            </label>
            <input
              type="text"
              value={faculty}
              onChange={(e) => setFaculty(e.target.value)}
              placeholder="e.g. Physical Sciences"
              className="w-full px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
            />
          </div>
        </div>

        {/* C. Academic Level & Campus Location */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Academic Level
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
            >
              {ACADEMIC_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Campus Location
            </label>
            <select
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
            >
              {ABSU_CAMPUSES.map((cmp) => (
                <option key={cmp} value={cmp}>
                  {cmp}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* D. Bio */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block font-semibold text-[var(--color-text-primary)]">
              Student Bio (Optional)
            </label>
            <span className="text-[10px] text-[var(--color-text-secondary)] tabular-nums">
              {bio.length}/250
            </span>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 250))}
            placeholder="Tell coursemates about your academic passions, research interests, or favorite study spot..."
            rows={3}
            className="w-full p-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none resize-none leading-relaxed"
          />
        </div>

        {/* E. Interests / Hobbies */}
        <div>
          <label className="block font-semibold text-[var(--color-text-primary)] mb-1.5">
            Interests & Hobbies (Select or Add)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {SUGGESTED_INTERESTS.map((tag) => {
              const active = interests.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleToggleInterest(tag)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border flex items-center gap-1 ${
                    active
                      ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs'
                      : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {active && <Check className="w-3 h-3" />}
                  <span>{tag}</span>
                </button>
              );
            })}
          </div>

          {/* Custom interest tag input */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={customInterest}
              onChange={(e) => setCustomInterest(e.target.value)}
              placeholder="Add other interest..."
              className="flex-1 px-3 py-1.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddCustomInterest}
              disabled={!customInterest.trim()}
              className="px-3 py-1.5 rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-xs font-bold hover:bg-[var(--color-primary)] hover:text-white transition-colors disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        {/* Action Controls: Save & Continue or Skip */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-3 border-t border-[var(--color-border)]">
          <button
            type="submit"
            disabled={loading || skipping}
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs sm:text-sm font-bold shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving profile...</span>
              </>
            ) : (
              <span>Save and Continue</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            disabled={loading || skipping}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] transition-colors min-h-[44px]"
          >
            {skipping ? 'Skipping...' : 'Skip for now'}
          </button>
        </div>

        <p className="text-[11px] text-center text-[var(--color-text-secondary)]">
          You can edit any of these details anytime from your Profile page.
        </p>
      </form>
    </AuthLayout>
  );
};
