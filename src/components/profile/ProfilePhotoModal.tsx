import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { uploadProfileAvatarToStorage, createInMemoryFile } from '../../lib/storageService.ts';
import { createRealPost } from '../../lib/postService.ts';
import { validateImageFile } from '../../utils/logic.ts';
import { X, Camera, Upload, AlertCircle, Loader2, Check } from 'lucide-react';

interface ProfilePhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfilePhotoModal: React.FC<ProfilePhotoModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, updateCurrentUser, refreshCurrentScreen, addToast } = useApp();
  const { user } = useAuth();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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
      const mem = await createInMemoryFile(file);
      setSelectedFile(mem.file);
      setPreviewUrl(mem.previewUrl);
    } catch {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    } finally {
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!selectedFile || !user) {
      setError('Please select a photo first.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const uploadRes = await uploadProfileAvatarToStorage(user.id, selectedFile);
      if (!uploadRes.success || !uploadRes.url) {
        setError(uploadRes.error || 'Failed to upload photo.');
        setUploading(false);
        return;
      }

      await updateCurrentUser({
        avatar: uploadRes.url,
        avatarAssetId: uploadRes.path,
      });

      // Automatically announce to campus feed
      try {
        await createRealPost({
          authorId: user.id,
          body: `${currentUser.name || 'ABSU Student'} updated their profile picture.`,
          visibility: 'public',
          media: {
            secure_url: uploadRes.url,
            asset_id: uploadRes.path,
            kind: 'image',
            provider: 'supabase',
          },
        });
        refreshCurrentScreen().catch(() => {});
      } catch (postErr) {
        console.warn('Could not create profile picture feed post:', postErr);
      }

      addToast('Profile picture updated successfully!', 'success');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full max-w-sm rounded-3xl p-5 shadow-2xl flex flex-col gap-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-sm text-[var(--color-text-primary)]">
              Update Profile Photo
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        {/* Circular Avatar Preview */}
        <div className="flex flex-col items-center justify-center py-2">
          <div className="relative group">
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-[var(--color-primary)] shadow-lg bg-[var(--color-bg-main)]">
              <img
                src={previewUrl || currentUser.avatar}
                alt="Profile Preview"
                className="w-full h-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 rounded-full bg-black/40 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Upload className="w-6 h-6 mb-1" />
              <span className="text-[11px] font-bold">Choose</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 px-3.5 py-1.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-xs font-bold text-[var(--color-text-primary)] inline-flex items-center gap-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>{previewUrl ? 'Choose Different Photo' : 'Select from Gallery'}</span>
          </button>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-1.5">
            JPG, PNG or WebP · Max 10MB
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedFile || uploading}
            className="px-5 py-2 rounded-xl bg-[var(--color-primary)] hover:opacity-95 text-white text-xs font-bold shadow-md shadow-[var(--color-primary)]/20 transition-all disabled:opacity-50 flex items-center gap-1.5 active:scale-95"
          >
            {uploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Photo</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
