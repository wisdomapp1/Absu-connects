import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativePickedPhoto {
  path: string;
  webPath: string;
  name?: string;
  mimeType?: string;
  kind?: 'image' | 'video';
}

interface PhotoGalleryPlugin {
  pickPhotos(options?: { maxCount?: number; includeVideos?: boolean }): Promise<{
    cancelled: boolean;
    images?: NativePickedPhoto[];
    media?: NativePickedPhoto[];
  }>;
}

const PhotoGallery = registerPlugin<PhotoGalleryPlugin>('PhotoGallery');

export interface NativeGalleryPickResult {
  supported: boolean;
  cancelled: boolean;
  files: File[];
}

function inferMimeFromName(name?: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

/**
 * Opens the native Android photo/video gallery (system Photo Picker on API 33+)
 * via Capacitor's custom PhotoGalleryPlugin so DM camera taps show both photos
 * and videos directly without requesting storage permissions or file managers.
 *
 * Returns `supported: false` on web/PWA or if the native plugin is unavailable,
 * allowing callers to fall back cleanly to an <input type="file" accept="image/*,video/*" />.
 */
export async function pickNativeGalleryPhotos(
  maxCount = 10,
  includeVideos = true
): Promise<NativeGalleryPickResult> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return { supported: false, cancelled: false, files: [] };
  }

  try {
    const result = await PhotoGallery.pickPhotos({ maxCount, includeVideos });
    const pickedItems = Array.isArray(result.media)
      ? result.media
      : Array.isArray(result.images)
        ? result.images
        : [];

    if (result.cancelled || pickedItems.length === 0) {
      return { supported: true, cancelled: true, files: [] };
    }

    const files: File[] = [];
    for (let i = 0; i < pickedItems.length; i += 1) {
      const item = pickedItems[i];
      const fetchUrl = item.webPath || (item.path ? Capacitor.convertFileSrc(item.path) : '');
      if (!fetchUrl) continue;

      const response = await fetch(fetchUrl);
      if (!response.ok) continue;

      const blob = await response.blob();
      if (!blob || blob.size === 0) continue;

      const isSupportedMime = (m?: string) =>
        Boolean(m && (m.startsWith('image/') || m.startsWith('video/')));

      const mimeType = isSupportedMime(item.mimeType)
        ? item.mimeType!
        : isSupportedMime(blob.type)
          ? blob.type
          : inferMimeFromName(item.name) ||
            (item.kind === 'video' ? 'video/mp4' : 'image/jpeg');

      const isVideo = mimeType.startsWith('video/');
      const rawSubType = mimeType.split('/')[1]?.toLowerCase() || '';
      const normalizedExt =
        rawSubType === 'quicktime'
          ? 'mov'
          : rawSubType.replace(/[^a-z0-9]/gi, '') || (isVideo ? 'mp4' : 'jpg');

      const fileName =
        item.name && item.name.trim().length > 0
          ? item.name.trim()
          : `${isVideo ? 'dm_video' : 'dm_photo'}_${Date.now()}_${i + 1}.${normalizedExt}`;

      files.push(
        new File([blob], fileName, {
          type: mimeType,
          lastModified: Date.now(),
        })
      );
    }

    return {
      supported: true,
      cancelled: files.length === 0,
      files,
    };
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    const code = String(err?.code || '').toUpperCase();
    if (
      code === 'UNIMPLEMENTED' ||
      msg.includes('not implemented') ||
      (msg.includes('plugin') && msg.includes('not available'))
    ) {
      return { supported: false, cancelled: false, files: [] };
    }
    throw err;
  }
}

export const pickNativeGalleryMedia = pickNativeGalleryPhotos;
