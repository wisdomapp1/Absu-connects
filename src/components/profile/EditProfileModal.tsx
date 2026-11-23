import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { uploadProfileAvatarToStorage, createInMemoryFile } from '../../lib/storageService.ts';
import { createRealPost } from '../../lib/postService.ts';
import { fetchProfileById } from '../../lib/profileService.ts';
import { validateImageFile } from '../../utils/logic.ts';
import { X, AlertCircle, Camera, Upload, Loader2 } from 'lucide-react';

export const EditProfileModal: React.FC = () => {
  const {
    currentUser,
    editProfileModalOpen,
    setEditProfileModalOpen,
    updateCurrentUser,
    refreshCurrentScreen,
  } = useApp();
  const { user } = useAuth();

  const [name, setName] = useState(currentUser.name);
  const [department, setDepartment] = useState(currentUser.department);
  const [faculty, setFaculty] = useState(currentUser.faculty);
  const [level, setLevel] = useState(currentUser.level);
  const [campus, setCampus] = useState(currentUser.campus);
  const [bio, setBio] = useState(currentUser.bio);
  const [interestsString, setInterestsString] = useState((currentUser.interests || []).join(', '));
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatar);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state whenever modal opens or fresh Supabase profile arrives
  useEffect(() => {
    if (!editProfileModalOpen) return;

    // Immediately populate from current app context
    setName(currentUser.name || '');
    setDepartment(currentUser.department || '');
    setFaculty(currentUser.faculty || 'Abia State University');
    setLevel(currentUser.level || '100 Level');
    setCampus(currentUser.campus || 'Uturu (Main Campus)');
    setBio(currentUser.bio || '');
    setInterestsString((currentUser.interests || []).join(', '));
    setAvatarPreview(currentUser.avatar);
    setSelectedFile(null);
    setError(null);

    // Also fetch fresh record directly from Supabase profiles table
    if (user?.id) {
      fetchProfileById(user.id, user.email).then((fresh) => {
        if (fresh) {
          setName(fresh.name || '');
          setDepartment(fresh.department || '');
          setFaculty(fresh.faculty || 'Abia State University');
          setLevel(fresh.level || '100 Level');
          setCampus(fresh.campus || 'Uturu (Main Campus)');
          setBio(fresh.bio || '');
          setInterestsString((fresh.interests || []).join(', '));
          setAvatarPreview(fresh.avatar);
        }
      });
    }
  }, [editProfileModalOpen, currentUser, user?.id, user?.email]);

  if (!editProfileModalOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const val = validateImageFile({ type: file.type, size: file.size });
    if (!val.valid) {
      setError(val.error || 'Invalid image file.');
      return;
    }

    setError(null);
    try {
      // Read immediately into in-memory ArrayBuffer-backed File while handle is fresh
      const mem = await createInMemoryFile(file);
      setSelectedFile(mem.file);
      setAvatarPreview(mem.previewUrl);
    } catch (readErr) {
      console.warn('[EditProfileModal] Fallback reading avatar:', readErr);
      setSelectedFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    } finally {
      // Safe to reset now that bytes are captured in memory
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Display name is required');
      return;
    }
    if (!department.trim()) {
      setError('Department is required');
      return;
    }

    setUploading(true);
    let finalAvatarUrl = currentUser.avatar;
    let finalAssetId = currentUser.avatarAssetId;
    let isNewAvatarUploaded = false;

    if (selectedFile && user) {
      const uploadRes = await uploadProfileAvatarToStorage(user.id, selectedFile);
      if (uploadRes.success && uploadRes.url) {
        finalAvatarUrl = uploadRes.url;
        finalAssetId = uploadRes.path;
        isNewAvatarUploaded = true;
      } else {
        setUploading(false);
        setError(uploadRes.error || 'Failed to upload new avatar.');
        return;
      }
    }

    await updateCurrentUser({
      name: name.trim(),
      department: department.trim(),
      faculty: faculty.trim(),
      level: level.trim(),
      campus: campus.trim(),
      bio: bio.trim(),
      interests: interestsString
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      avatar: finalAvatarUrl,
      avatarAssetId: finalAssetId,
    });

    // Automatically create feed post for profile picture update
    if (isNewAvatarUploaded && user) {
      try {
        const postAuthorName = name.trim() || currentUser.name || 'ABSU Student';
        const postBody = `${postAuthorName} updated their profile picture.`;
        console.log('[Auto Profile Post] Creating feed post for new avatar...');
        await createRealPost({
          authorId: user.id,
          body: postBody,
          visibility: 'public',
          media: {
            secure_url: finalAvatarUrl,
            asset_id: finalAssetId,
            kind: 'image',
            provider: 'supabase',
          },
        });
        // Refresh feed so new post appears immediately in Home feed
        refreshCurrentScreen().catch(() => {});
      } catch (postErr) {
        console.warn('[Auto Profile Post Error] Could not create activity post:', postErr);
      }
    }

    setUploading(false);
    setEditProfileModalOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-label="Edit Profile"
    >
      <div
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full sm:max-w-lg rounded-t-[20px] sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--color-border)]">
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">
            Edit Student Profile
          </h2>
          <button
            onClick={() => setEditProfileModalOpen(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            aria-label="Close edit profile"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto flex flex-col gap-3 text-xs">
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--color-error)]/10 text-[var(--color-error)] font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Profile Picture Upload to Supabase Storage */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--color-bg-card)] border-2 border-[var(--color-primary)] shrink-0 flex items-center justify-center">
              {avatarPreview ? (
                <img src={avatarPreview} alt={name} className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-5 h-5 text-[var(--color-text-secondary)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-xs text-[var(--color-text-primary)]">Profile Picture</p>
              <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">Stored in profile-avatars bucket (max 10MB)</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1.5 px-3 py-1 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[11px] font-semibold text-[var(--color-text-primary)] inline-flex items-center gap-1.5 transition-colors"
              >
                <Upload className="w-3 h-3 text-[var(--color-primary)]" />
                <span>{selectedFile ? 'Change Selected' : 'Upload New Avatar'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              autoCorrect="on"
              autoCapitalize="words"
              spellCheck={true}
              className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs sm:text-sm text-[var(--color-text-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
                Department *
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                autoCorrect="on"
                autoCapitalize="words"
                spellCheck={true}
                className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
                Academic Level
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
              >
                <option value="100 Level">100 Level</option>
                <option value="200 Level">200 Level</option>
                <option value="300 Level">300 Level</option>
                <option value="400 Level">400 Level</option>
                <option value="500 Level">500 Level</option>
                <option value="Postgraduate">Postgraduate</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Faculty
            </label>
            <input
              type="text"
              value={faculty}
              onChange={(e) => setFaculty(e.target.value)}
              autoCorrect="on"
              autoCapitalize="words"
              spellCheck={true}
              className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Campus Location
            </label>
            <select
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
            >
              <option value="Uturu (Main Campus)">Uturu (Main Campus)</option>
              <option value="Aba (College of Health Sciences)">Aba (College of Health Sciences)</option>
              <option value="Umuahia Campus">Umuahia Campus</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
              className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl p-3 text-xs text-[var(--color-text-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Interests (comma separated)
            </label>
            <input
              type="text"
              value={interestsString}
              onChange={(e) => setInterestsString(e.target.value)}
              placeholder="e.g. Football, Robotics, Literature"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
              className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)] mt-2">
            <button
              type="button"
              onClick={() => setEditProfileModalOpen(false)}
              className="px-4 py-2 rounded-xl font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-5 py-2 rounded-xl bg-[var(--color-primary)] text-white font-bold hover:bg-[var(--color-primary-hover)] transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{uploading ? 'Saving Changes...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
