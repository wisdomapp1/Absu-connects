import { supabase } from './supabase.ts';
import { validateImageFile, validateVideoFile } from '../utils/logic.ts';
import {
  compressImageForUpload,
  getImageDimensions,
} from './mediaCompression.ts';
import type { MessageAttachment } from '../types/index.ts';

export const AVATAR_BUCKET = 'profile-avatars';
export const POST_MEDIA_BUCKET = 'post-media';
export const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';
export const EVENT_FLYERS_BUCKET = 'event-flyers';
export const COMMUNITY_IMAGES_BUCKET = 'community-images';
export const STORY_MEDIA_BUCKET = 'story-media';
export const PAGE_ASSETS_BUCKET = 'page-assets';

export interface StorageUploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

export interface PostMediaUploadItem {
  asset_id: string; // The exact Storage object path, e.g. "{userId}/{uniqueFileName}"
  secure_url: string; // Storage path or initial signed/public url
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  kind: 'image' | 'video';
  provider: 'supabase';
}

export interface ChatAttachmentUploadResult {
  success: boolean;
  attachment?: {
    asset_id: string;
    file_name: string;
    bytes: number;
    format: string;
    kind: 'image' | 'video' | 'audio' | 'pdf' | 'document';
    provider: 'supabase';
    secure_url?: string;
  };
  error?: string;
}

/**
 * Generate a clean, unique file path inside a user's scoped folder:
 * "{userId}/{timestamp}_{random}.{cleanExt}"
 */
function generateScopedFilePath(userId: string, originalName: string, fallbackExt: string): {
  fileName: string;
  filePath: string;
  ext: string;
} {
  const parts = originalName.split('.');
  const ext = (parts.length > 1 ? parts.pop() : fallbackExt)?.toLowerCase().replace(/[^a-z0-9]/g, '') || fallbackExt;
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const fileName = `${uniqueId}.${ext}`;
  const filePath = `${userId}/${fileName}`;
  return { fileName, filePath, ext };
}

/**
 * Safely reads a File, Blob, ArrayBuffer, or Blob URL into an in-memory ArrayBuffer.
 * Uses 6 resilient strategies for maximal browser, Android Chrome, mobile WebView, and iframe compatibility.
 */
export async function readFileAsArrayBuffer(fileOrUrl: File | Blob | ArrayBuffer | string): Promise<ArrayBuffer> {
  // Strategy 1: Already an ArrayBuffer
  if (fileOrUrl instanceof ArrayBuffer) {
    return fileOrUrl;
  }

  // Strategy 2: Typed array view
  if (ArrayBuffer.isView(fileOrUrl)) {
    const view = fileOrUrl as unknown as ArrayBufferView;
    const buf = view.buffer;
    return buf.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }

  // Strategy 3: String URL (blob:, data:, or http)
  if (typeof fileOrUrl === 'string') {
    const res = await fetch(fileOrUrl);
    if (!res.ok) throw new Error(`Failed to fetch media from URL (${res.status})`);
    return await res.arrayBuffer();
  }

  const file = fileOrUrl;

  // Strategy 4: Native arrayBuffer() method
  if (typeof file.arrayBuffer === 'function') {
    try {
      const buf = await file.arrayBuffer();
      if (buf && buf.byteLength > 0) return buf;
    } catch (err) {
      console.warn('[FileRead] arrayBuffer() method failed, attempting blob fetch:', err);
    }
  }

  // Strategy 5: URL.createObjectURL + fetch()
  // Captures browser's internal blob buffer, bypassing Android content URI permission expirations
  try {
    const tempBlobUrl = URL.createObjectURL(file);
    try {
      const resp = await fetch(tempBlobUrl);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        if (buf && buf.byteLength > 0) return buf;
      }
    } finally {
      URL.revokeObjectURL(tempBlobUrl);
    }
  } catch (blobErr) {
    console.warn('[FileRead] fetch(blobUrl) failed, attempting slice:', blobErr);
  }

  // Strategy 6: file.slice().arrayBuffer()
  try {
    const sliced = file.slice(0, file.size, file.type);
    if (typeof sliced.arrayBuffer === 'function') {
      const buf = await sliced.arrayBuffer();
      if (buf && buf.byteLength > 0) return buf;
    }
  } catch (sliceErr) {
    console.warn('[FileRead] file.slice().arrayBuffer() failed:', sliceErr);
  }

  // Strategy 7: new Response(file).arrayBuffer()
  try {
    const resp = new Response(file);
    const buf = await resp.arrayBuffer();
    if (buf && buf.byteLength > 0) return buf;
  } catch (respErr) {
    console.warn('[FileRead] new Response(file).arrayBuffer() failed:', respErr);
  }

  // Strategy 8: FileReader fallback
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not produce an ArrayBuffer'));
      }
    };
    reader.onerror = () => {
      reject(reader.error || new Error('The requested file could not be read.'));
    };
    reader.onabort = () => {
      reject(new Error('File reading was aborted.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

function inferMimeTypeFromFile(file: File): string {
  if (file.type && file.type.trim().length > 0) return file.type;
  const lower = (file.name || '').toLowerCase();
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/mp4';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

/**
 * Creates an in-memory, permanent File from any source File or Blob immediately.
 * The resulting File's buffer is retained in memory so it never encounters
 * Android content-URI permission expiration or NotReadableError.
 */
export async function createInMemoryFile(file: File): Promise<{
  file: File;
  buffer: ArrayBuffer;
  previewUrl: string;
}> {
  const buffer = await readFileAsArrayBuffer(file);
  const memoryFile = new File([buffer], file.name, {
    type: inferMimeTypeFromFile(file),
    lastModified: file.lastModified || Date.now(),
  });
  const previewUrl = URL.createObjectURL(memoryFile);
  return { file: memoryFile, buffer, previewUrl };
}

/**
 * Reads an image File into memory and decodes it via Image() to reject corrupt/empty/truncated images before previewing.
 */
export async function decodeAndValidateImageFile(file: File): Promise<{
  valid: boolean;
  file?: File;
  buffer?: ArrayBuffer;
  previewUrl?: string;
  width?: number;
  height?: number;
  error?: string;
}> {
  const validation = validateImageFile({
    type: file.type || inferMimeTypeFromFile(file),
    size: file.size,
    name: file.name,
  });
  if (!validation.valid) {
    return { valid: false, error: validation.error || 'Unsupported image file.' };
  }
  if (!file.size || file.size <= 0) {
    return { valid: false, error: `"${file.name}" is empty or corrupted.` };
  }

  let mem: { file: File; buffer: ArrayBuffer; previewUrl: string };
  try {
    mem = await createInMemoryFile(file);
  } catch {
    return { valid: false, error: `Could not read "${file.name}". Please choose a valid image.` };
  }

  if (!mem.buffer || mem.buffer.byteLength === 0) {
    URL.revokeObjectURL(mem.previewUrl);
    return { valid: false, error: `"${file.name}" could not be read or has 0 bytes.` };
  }

  if (typeof Image === 'undefined') {
    return { valid: true, file: mem.file, buffer: mem.buffer, previewUrl: mem.previewUrl };
  }

  const decodeRes = await new Promise<{ ok: boolean; width?: number; height?: number }>((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok: boolean, width?: number, height?: number) => {
      if (settled) return;
      settled = true;
      resolve({ ok, width, height });
    };
    const timer = setTimeout(() => finish(false), 6000);
    img.onload = () => {
      clearTimeout(timer);
      const ok = img.naturalWidth > 0 && img.naturalHeight > 0;
      finish(ok, img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };
    img.src = mem.previewUrl;
  });

  if (!decodeRes.ok) {
    URL.revokeObjectURL(mem.previewUrl);
    return {
      valid: false,
      error: `"${file.name}" appears corrupted or unreadable. Please select another image.`,
    };
  }

  return {
    valid: true,
    file: mem.file,
    buffer: mem.buffer,
    previewUrl: mem.previewUrl,
    width: decodeRes.width,
    height: decodeRes.height,
  };
}

/**
 * Upload a post image or video directly to Supabase Storage 'post-media' bucket.
 * Applies client-side image compression for photos and validates type & size for both photos and videos.
 * Never falls back to Base64 data URLs or fake placeholder paths.
 */
let inFlightUploadSessionRefresh: Promise<any> | null = null;

async function getActiveUploadSession() {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session || null;
    if (!session) return null;

    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    const isNearExpiry = expiresAtMs > 0 && expiresAtMs - Date.now() < 30_000;
    if (isNearExpiry && session.refresh_token) {
      if (!inFlightUploadSessionRefresh) {
        inFlightUploadSessionRefresh = supabase.auth
          .refreshSession()
          .then((res) => res?.data?.session || session)
          .catch(() => session)
          .finally(() => {
            inFlightUploadSessionRefresh = null;
          });
      }
      return await inFlightUploadSessionRefresh;
    }
    return session;
  } catch {
    return null;
  }
}

export async function uploadPostMediaToSupabaseStorage(
  userId: string,
  fileOrBuffer: File | Blob | ArrayBuffer | string,
  onProgress?: (status: string) => void,
  fallbackUrl?: string
): Promise<{ success: boolean; media?: PostMediaUploadItem; error?: string }> {
  try {
    // 1. Verify active Supabase session and ensure scoped path matches authenticated user
    const activeSession = await getActiveUploadSession();
    const effectiveUserId = activeSession?.user?.id || userId;
    if (!effectiveUserId) {
      return {
        success: false,
        error: 'Please sign in to upload post photos.',
      };
    }

    const fileName =
      fileOrBuffer instanceof File
        ? fileOrBuffer.name
        : typeof fileOrBuffer === 'string'
        ? fileOrBuffer.split('/').pop()?.split('?')[0] || 'photo.jpg'
        : `photo_${Date.now()}.jpg`;

    const fileType =
      fileOrBuffer instanceof File || fileOrBuffer instanceof Blob
        ? fileOrBuffer.type
        : '';

    const isVideo =
      fileType.startsWith('video/') || Boolean(fileName.match(/\.(mp4|webm|mov|m4v|ogg)$/i));

    if (isVideo) {
      return {
        success: false,
        error: 'Video posting is currently disabled. Please choose a photo.',
      };
    }

    if (fileOrBuffer instanceof File) {
      const validation = validateImageFile({
        type: fileOrBuffer.type || inferMimeTypeFromFile(fileOrBuffer),
        size: fileOrBuffer.size,
        name: fileOrBuffer.name,
      });
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || 'Unsupported image file or size exceeds 10 MB limit.',
        };
      }
    }

    // 2. Read file into in-memory ArrayBuffer immediately to guarantee readability
    let initialBuffer: ArrayBuffer;
    try {
      initialBuffer = await readFileAsArrayBuffer(fileOrBuffer);
    } catch (readErr: unknown) {
      if (fallbackUrl) {
        try {
          console.log('[Storage] Initial read failed, falling back to cached preview URL...');
          initialBuffer = await readFileAsArrayBuffer(fallbackUrl);
        } catch {
          const msg = readErr instanceof Error ? readErr.message : 'The selected media could not be read.';
          console.error('[Storage Error] Initial file reading failed even with fallback:', msg);
          return { success: false, error: msg };
        }
      } else {
        const msg = readErr instanceof Error ? readErr.message : 'The selected media could not be read.';
        console.error('[Storage Error] Initial file reading failed:', msg);
        return { success: false, error: msg };
      }
    }

    if (!initialBuffer || initialBuffer.byteLength === 0) {
      return {
        success: false,
        error: 'The selected media file is empty or unreadable.',
      };
    }

    const maxBytes = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (initialBuffer.byteLength > maxBytes) {
      return {
        success: false,
        error: isVideo
          ? 'Video size exceeds the 50 MB maximum upload limit.'
          : 'Image size exceeds the 10 MB maximum upload limit.',
      };
    }

    // Create an in-memory File backed by the buffer
    let fileToUpload: File = new File([initialBuffer], fileName, {
      type: fileType || (isVideo ? 'video/mp4' : 'image/jpeg'),
      lastModified: Date.now(),
    });

    let width: number | undefined = undefined;
    let height: number | undefined = undefined;

    if (!isVideo) {
      onProgress?.('Preparing photo...');
      try {
        const compRes = await compressImageForUpload(fileToUpload);
        fileToUpload = compRes.file;
        if (compRes.savedPercent > 0) {
          console.log(
            `[Storage] Photo compressed: ${(compRes.originalBytes / 1024).toFixed(0)}KB → ${(compRes.compressedBytes / 1024).toFixed(0)}KB (-${compRes.savedPercent}%)`
          );
        }
        const dims = await getImageDimensions(fileToUpload);
        width = dims.width;
        height = dims.height;
      } catch (cErr) {
        console.warn('[Storage] Image compression bypassed, using original file:', cErr);
      }
    } else {
      onProgress?.('Preparing video...');
    }

    onProgress?.(isVideo ? 'Uploading video to Supabase Storage...' : 'Uploading photo to Supabase Storage...');
    const { filePath, ext } = generateScopedFilePath(
      effectiveUserId,
      fileToUpload.name,
      isVideo ? 'mp4' : 'jpg'
    );

    const contentType =
      fileToUpload.type ||
      (isVideo
        ? ext === 'webm'
          ? 'video/webm'
          : ext === 'mov'
          ? 'video/quicktime'
          : ext === 'ogg'
          ? 'video/ogg'
          : 'video/mp4'
        : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
        ? 'image/webp'
        : ext === 'gif'
        ? 'image/gif'
        : 'image/jpeg');

    const fileBuffer = await readFileAsArrayBuffer(fileToUpload);

    let uploadSuccess = false;
    let uploadErrMsg = '';

    // Primary attempt: Direct upload with ArrayBuffer into post-media bucket
    try {
      const { error: directError } = await supabase.storage
        .from(POST_MEDIA_BUCKET)
        .upload(filePath, fileBuffer, {
          cacheControl: '3600',
          upsert: false,
          contentType,
        });

      if (!directError) {
        uploadSuccess = true;
      } else {
        uploadErrMsg = directError.message;
        console.warn('[Storage] Direct upload notice:', directError.message);
      }
    } catch (directCatch: unknown) {
      uploadErrMsg = directCatch instanceof Error ? directCatch.message : 'Network error';
      console.warn('[Storage] Direct upload caught error:', uploadErrMsg);
    }

    // Secondary attempt: Supabase signed upload URL if direct upload failed transiently
    if (!uploadSuccess) {
      console.log('[Storage] Attempting Supabase signed upload retry...');
      try {
        const { data: signData, error: signErr } = await supabase.storage
          .from(POST_MEDIA_BUCKET)
          .createSignedUploadUrl(filePath);

        if (!signErr && signData?.token) {
          const { error: signedUpError } = await supabase.storage
            .from(POST_MEDIA_BUCKET)
            .uploadToSignedUrl(filePath, signData.token, fileBuffer, {
              cacheControl: '3600',
              contentType,
            });

          if (!signedUpError) {
            uploadSuccess = true;
            uploadErrMsg = '';
          } else {
            uploadErrMsg = signedUpError.message;
            console.error('[Storage Error] Signed upload failed:', signedUpError.message);
          }
        }
      } catch (fallbackCatch: unknown) {
        const msg = fallbackCatch instanceof Error ? fallbackCatch.message : 'Signed upload failed';
        console.error('[Storage Error] Signed upload exception:', msg);
        if (!uploadErrMsg) uploadErrMsg = msg;
      }
    }

    if (!uploadSuccess) {
      const sanitized = uploadErrMsg.includes('Failed to fetch')
        ? 'Network error reaching Supabase Storage. Please check your internet connection and retry.'
        : uploadErrMsg || 'Media upload to Supabase Storage failed.';
      console.error('[Storage Error] post-media upload failed:', uploadErrMsg);
      return {
        success: false,
        error: sanitized,
      };
    }

    // Generate a 24h signed URL for immediate UI rendering (not saved permanently in DB)
    const { data: signData, error: signUrlErr } = await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .createSignedUrl(filePath, 86400);

    if (signUrlErr || !signData?.signedUrl) {
      await deletePostMediaFilesFromStorage([filePath]);
      return {
        success: false,
        error: signUrlErr?.message || 'Uploaded media could not be verified for display.',
      };
    }

    return {
      success: true,
      media: {
        asset_id: filePath,
        secure_url: signData.signedUrl,
        format: ext,
        bytes: fileToUpload.size,
        width,
        height,
        kind: isVideo ? 'video' : 'image',
        provider: 'supabase',
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    console.error('[Storage Error] Unexpected upload error:', msg);
    return { success: false, error: msg };
  }
}

export const uploadPostMediaFile = uploadPostMediaToSupabaseStorage;

/**
 * Remove orphaned post-media files if a post creation transaction fails
 */
export async function deletePostMediaFilesFromStorage(paths: string[]): Promise<void> {
  if (!paths || paths.length === 0) return;
  const cleanPaths = paths.filter((p) => Boolean(p) && !p.startsWith('http') && !p.startsWith('data:') && !p.startsWith('/'));
  if (cleanPaths.length === 0) return;
  try {
    await supabase.storage.from(POST_MEDIA_BUCKET).remove(cleanPaths);
  } catch (err) {
    console.warn('[Storage] Failed to cleanup orphaned post-media files:', err);
  }
}

/**
 * Extract the canonical object path inside the private `post-media` bucket.
 * Returns null for public buckets (`profile-avatars`), legacy external URLs (`cloudinary`),
 * data URIs, or local preset assets.
 */
export function extractPostMediaStoragePath(
  assetId?: string | null,
  secureUrl?: string | null,
  provider?: string | null
): string | null {
  const url = (secureUrl || '').trim();
  const aid = (assetId || '').trim();

  if (
    provider === 'cloudinary' ||
    provider === 'campus_preset' ||
    url.startsWith('data:') ||
    url.includes('/storage/v1/object/public/') ||
    aid.startsWith('inline_') ||
    url.startsWith('/assets/') ||
    url.startsWith('/src/assets/')
  ) {
    return null;
  }

  // Prefer explicit post-media path inside asset_id when not a full URL
  if (aid && !aid.startsWith('http://') && !aid.startsWith('https://') && !aid.startsWith('/')) {
    return aid;
  }

  // Fallback: extract object path from legacy signed/unsigned post-media Supabase URLs
  const signMarker = `/storage/v1/object/sign/${POST_MEDIA_BUCKET}/`;
  const objMarker = `/storage/v1/object/${POST_MEDIA_BUCKET}/`;
  const source = url || aid;

  if (source.includes(signMarker)) {
    const after = source.split(signMarker)[1]?.split('?')[0];
    return after ? decodeURIComponent(after) : null;
  }
  if (source.includes(objMarker)) {
    const after = source.split(objMarker)[1]?.split('?')[0];
    return after ? decodeURIComponent(after) : null;
  }

  if (source && !source.startsWith('http://') && !source.startsWith('https://') && !source.startsWith('/')) {
    return source;
  }

  return null;
}

/**
 * Batch resolve signed URLs for private 'post-media' items.
 * Preserves public bucket URLs (`profile-avatars`), legacy Cloudinary URLs, and campus presets untouched.
 */
export async function batchResolvePostMediaSignedUrls(
  mediaItems: Array<{ asset_id?: string | null; secure_url?: string; provider?: string }>
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  const pathsToSignSet = new Set<string>();

  for (const item of mediaItems) {
    const storagePath = extractPostMediaStoragePath(item.asset_id, item.secure_url, item.provider);
    if (storagePath) {
      pathsToSignSet.add(storagePath);
    } else if (item.secure_url) {
      urlMap.set(item.secure_url, item.secure_url);
      if (item.asset_id) {
        urlMap.set(item.asset_id, item.secure_url);
      }
    }
  }

  const pathsToSign = Array.from(pathsToSignSet);
  if (pathsToSign.length === 0) return urlMap;

  try {
    // Chunk into batches of 50 to avoid payload/URL limits
    for (let i = 0; i < pathsToSign.length; i += 50) {
      const chunk = pathsToSign.slice(i, i + 50);
      const { data, error } = await supabase.storage
        .from(POST_MEDIA_BUCKET)
        .createSignedUrls(chunk, 86400); // 24 hours

      if (!error && data) {
        for (const res of data) {
          if (res.signedUrl && res.path) {
            urlMap.set(res.path, res.signedUrl);
          }
        }
      } else if (error) {
        console.warn('[Storage] Error batch signing post media chunk:', error.message);
      }
    }
  } catch (err) {
    console.warn('[Storage] Error batch signing post media URLs:', err);
  }

  return urlMap;
}

/**
 * Resolve a single post-media storage item into a fresh signed URL (used on retry).
 */
export async function resolveSinglePostMediaSignedUrl(
  assetId?: string | null,
  secureUrl?: string | null,
  provider?: string | null
): Promise<string | null> {
  const storagePath = extractPostMediaStoragePath(assetId, secureUrl, provider);
  if (!storagePath) {
    return secureUrl || null;
  }

  try {
    const { data, error } = await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .createSignedUrl(storagePath, 86400);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Upload a chat attachment (photo, video, or PDF document) to 'chat-attachments' bucket.
 * Enforces 25 MB file limit.
 */
export async function uploadChatAttachmentToStorage(
  userId: string,
  file: File
): Promise<ChatAttachmentUploadResult> {
  // Enforce 25MB limit
  const maxBytes = 25 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      success: false,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 25 MB limit for chat attachments.`,
    };
  }

  // Validate MIME type
  const isAudio =
    file.type.startsWith('audio/') ||
    Boolean(file.name.match(/\.(mp3|m4a|wav|ogg|aac)$/i)) ||
    (file.name.startsWith('voice_note_') && file.name.toLowerCase().endsWith('.webm'));
  const isImage = !isAudio && (file.type.startsWith('image/') || Boolean(file.name.match(/\.(jpg|jpeg|png|webp|avif|gif)$/i)));
  const isVideo = !isAudio && !isImage && (file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|webm|mov|m4v)$/i)));
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isImage && !isVideo && !isAudio && !isPdf) {
    return {
      success: false,
      error: 'Unsupported attachment type. Allowed formats: photos, videos, voice notes, and PDF documents.',
    };
  }

  let kind: 'image' | 'video' | 'audio' | 'pdf' | 'document' = 'document';
  if (isAudio) kind = 'audio';
  else if (isImage) kind = 'image';
  else if (isVideo) kind = 'video';
  else if (isPdf) kind = 'pdf';

  // Enforce 40-second maximum duration on DM videos
  if (isVideo && typeof document !== 'undefined') {
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const videoEl = document.createElement('video');
        videoEl.preload = 'metadata';
        const tempUrl = URL.createObjectURL(file);
        videoEl.src = tempUrl;
        videoEl.onloadedmetadata = () => {
          URL.revokeObjectURL(tempUrl);
          resolve(videoEl.duration);
        };
        videoEl.onerror = () => {
          URL.revokeObjectURL(tempUrl);
          reject(new Error('Failed to read video duration'));
        };
      });

      if (duration > 40) {
        return {
          success: false,
          error: `Video duration (${Math.round(duration)}s) exceeds the 40-second limit for direct messages.`,
        };
      }
    } catch {
      // If metadata inspection fails in current environment, proceed
    }
  }

  try {
    // 1. Verify active Supabase session and ensure scoped path matches authenticated user
    const { data: sessionData } = await supabase.auth.getSession();
    const effectiveUserId = sessionData?.session?.user?.id || userId;
    if (!effectiveUserId) {
      return {
        success: false,
        error: 'Please sign in to send chat attachments.',
      };
    }

    let fileToUpload = file;
    // Optional light compression on images over 1.5MB
    if (isImage && file.size > 1.5 * 1024 * 1024) {
      try {
        const comp = await compressImageForUpload(file, 2.0, 1920);
        fileToUpload = comp.file;
      } catch {
        fileToUpload = file;
      }
    }

    const { filePath, ext } = generateScopedFilePath(
      effectiveUserId,
      file.name,
      isImage ? 'jpg' : isAudio ? 'webm' : isVideo ? 'mp4' : 'pdf'
    );

    const contentType =
      fileToUpload.type ||
      (isPdf
        ? 'application/pdf'
        : isAudio
        ? ext === 'mp3'
          ? 'audio/mpeg'
          : ext === 'm4a'
          ? 'audio/mp4'
          : 'audio/webm'
        : isVideo
        ? 'video/mp4'
        : ext === 'png'
        ? 'image/png'
        : 'image/jpeg');

    // Convert to ArrayBuffer reliably across mobile browsers/WebViews
    const fileBuffer = await readFileAsArrayBuffer(fileToUpload);

    let uploadSuccess = false;
    let uploadErrMsg = '';

    // Primary attempt: Direct binary upload
    let effectiveContentType = contentType;
    try {
      const { error: directError } = await supabase.storage
        .from(CHAT_ATTACHMENTS_BUCKET)
        .upload(filePath, fileBuffer, {
          cacheControl: '3600',
          upsert: false,
          contentType: effectiveContentType,
        });

      if (!directError) {
        uploadSuccess = true;
      } else if (
        isAudio &&
        directError.message?.toLowerCase().includes('mime type') &&
        directError.message?.toLowerCase().includes('not supported')
      ) {
        effectiveContentType = 'video/webm';
        const { error: retryErr } = await supabase.storage
          .from(CHAT_ATTACHMENTS_BUCKET)
          .upload(filePath, fileBuffer, {
            cacheControl: '3600',
            upsert: false,
            contentType: effectiveContentType,
          });
        if (!retryErr) {
          uploadSuccess = true;
        } else {
          uploadErrMsg = retryErr.message;
        }
      } else {
        uploadErrMsg = directError.message;
        console.warn('[Storage Chat] Direct upload notice:', directError.message);
      }
    } catch (directCatch: unknown) {
      uploadErrMsg = directCatch instanceof Error ? directCatch.message : 'Network error';
      console.warn('[Storage Chat] Direct upload caught error:', uploadErrMsg);
    }

    // Secondary attempt: Fallback to signed upload URL
    if (!uploadSuccess) {
      console.log('[Storage Chat] Attempting resilient signed upload fallback...');
      try {
        const { data: signData, error: signErr } = await supabase.storage
          .from(CHAT_ATTACHMENTS_BUCKET)
          .createSignedUploadUrl(filePath);

        if (!signErr && signData?.token) {
          const { error: signedUpError } = await supabase.storage
            .from(CHAT_ATTACHMENTS_BUCKET)
            .uploadToSignedUrl(filePath, signData.token, fileBuffer, {
              cacheControl: '3600',
              contentType: effectiveContentType,
            });

          if (!signedUpError) {
            uploadSuccess = true;
            uploadErrMsg = '';
          } else {
            uploadErrMsg = signedUpError.message;
            console.error('[Storage Error] Chat signed upload fallback failed:', signedUpError.message);
          }
        }
      } catch (fallbackCatch: unknown) {
        const msg = fallbackCatch instanceof Error ? fallbackCatch.message : 'Signed upload failed';
        console.error('[Storage Error] Chat signed upload exception:', msg);
        if (!uploadErrMsg) uploadErrMsg = msg;
      }
    }

    if (!uploadSuccess) {
      const sanitized = uploadErrMsg.includes('Failed to fetch')
        ? 'Network error reaching chat storage. Please check your internet connection.'
        : uploadErrMsg || 'Attachment upload failed.';
      console.error('[Storage Error] chat-attachments upload failed:', uploadErrMsg);
      return {
        success: false,
        error: sanitized,
      };
    }

    // Generate signed URL
    const { data: signData } = await supabase.storage
      .from(CHAT_ATTACHMENTS_BUCKET)
      .createSignedUrl(filePath, 86400);

    return {
      success: true,
      attachment: {
        asset_id: filePath,
        file_name: file.name,
        bytes: fileToUpload.size,
        format: ext,
        kind,
        provider: 'supabase',
        secure_url: signData?.signedUrl || filePath,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Attachment upload failed';
    return { success: false, error: msg };
  }
}

/**
 * Remove orphaned chat attachment files if message creation fails
 */
export async function deleteChatAttachmentsFromStorage(paths: string[]): Promise<void> {
  if (!paths || paths.length === 0) return;
  try {
    await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).remove(paths);
  } catch (err) {
    console.warn('[Storage] Failed to cleanup orphaned chat attachments:', err);
  }
}

const chatSignedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const CHAT_SIGNED_URL_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Batch resolve signed URLs for private 'chat-attachments' objects with a 15-minute TTL cache.
 */
export async function batchResolveChatAttachmentSignedUrls(
  attachments: MessageAttachment[]
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  const pathsToSignSet = new Set<string>();
  const now = Date.now();

  for (const a of attachments) {
    if (a.provider === 'cloudinary' || a.secure_url?.startsWith('http://') || a.secure_url?.startsWith('https://')) {
      if (a.secure_url) {
        urlMap.set(a.asset_id, a.secure_url);
        urlMap.set(a.id, a.secure_url);
      }
    } else if (a.asset_id) {
      const cached = chatSignedUrlCache.get(a.asset_id);
      if (cached && cached.expiresAt > now) {
        urlMap.set(a.asset_id, cached.url);
        urlMap.set(a.id, cached.url);
      } else {
        pathsToSignSet.add(a.asset_id);
      }
    } else if (a.secure_url) {
      urlMap.set(a.id, a.secure_url);
    }
  }

  const pathsToSign = Array.from(pathsToSignSet);
  if (pathsToSign.length === 0) return urlMap;

  try {
    const { data, error } = await supabase.storage
      .from(CHAT_ATTACHMENTS_BUCKET)
      .createSignedUrls(pathsToSign, 86400);

    if (!error && data) {
      const expiresAt = Date.now() + CHAT_SIGNED_URL_CACHE_TTL_MS;
      for (const res of data) {
        if (res.signedUrl && res.path) {
          chatSignedUrlCache.set(res.path, { url: res.signedUrl, expiresAt });
          urlMap.set(res.path, res.signedUrl);
        }
      }
    }
  } catch (err) {
    console.warn('[Storage] Error signing chat attachment URLs:', err);
  }

  return urlMap;
}

/**
 * Upload a student profile avatar to 'profile-avatars' bucket
 */
export async function uploadProfileAvatarToStorage(
  userId: string,
  file: File
): Promise<StorageUploadResult> {
  const validation = validateImageFile({ type: file.type, size: file.size });
  if (!validation.valid) {
    return { success: false, error: validation.error || 'Invalid image file.' };
  }

  // Enforce 10MB limit for profile-avatars bucket
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: 'Avatar file size must be less than 10 MB.' };
  }

  try {
    // 1. Verify active Supabase session and ensure scoped path matches authenticated user
    const session = await getActiveUploadSession();
    const effectiveUserId = session?.user?.id || userId;
    if (!effectiveUserId) {
      return {
        success: false,
        error: 'Please sign in to upload your profile picture.',
      };
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExt)
      ? fileExt
      : 'jpg';
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const fileName = `${uniqueId}_avatar.${cleanExt}`;
    const filePath = `${effectiveUserId}/${fileName}`;

    // Read bytes immediately into in-memory ArrayBuffer
    const fileBuffer = await readFileAsArrayBuffer(file);

    // Normalize contentType to exact supported MIME types for profile-avatars bucket
    let contentType = 'image/jpeg';
    if (cleanExt === 'png' || file.type === 'image/png') {
      contentType = 'image/png';
    } else if (cleanExt === 'webp' || file.type === 'image/webp') {
      contentType = 'image/webp';
    } else if (cleanExt === 'gif' || file.type === 'image/gif') {
      contentType = 'image/gif';
    } else {
      contentType = 'image/jpeg';
    }

    let uploadSuccess = false;
    let uploadErrMsg = '';

    // Primary attempt: Direct binary upload with upsert: false (prevents triggering missing UPDATE RLS policy)
    try {
      const { error: directError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, fileBuffer, {
          cacheControl: '3600',
          upsert: false,
          contentType,
        });

      if (!directError) {
        uploadSuccess = true;
      } else {
        uploadErrMsg = directError.message;
        console.warn('[Storage Error] Direct avatar upload notice:', directError.message);
      }
    } catch (directCatch: unknown) {
      uploadErrMsg = directCatch instanceof Error ? directCatch.message : 'Network error';
      console.warn('[Storage Error] Direct avatar upload exception:', uploadErrMsg);
    }

    // Secondary attempt: Fallback to signed upload URL if direct upload returned an error
    if (!uploadSuccess) {
      console.log('[Storage] Attempting signed upload fallback for avatar...');
      try {
        const { data: signData, error: signErr } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUploadUrl(filePath);

        if (!signErr && signData?.token) {
          const { error: signedUpError } = await supabase.storage
            .from(AVATAR_BUCKET)
            .uploadToSignedUrl(filePath, signData.token, fileBuffer, {
              cacheControl: '3600',
              contentType,
            });

          if (!signedUpError) {
            uploadSuccess = true;
            uploadErrMsg = '';
          } else {
            uploadErrMsg = signedUpError.message;
            console.error('[Storage Error] Avatar signed upload fallback failed:', signedUpError.message);
          }
        }
      } catch (fallbackCatch: unknown) {
        const msg = fallbackCatch instanceof Error ? fallbackCatch.message : 'Signed upload failed';
        console.error('[Storage Error] Avatar signed upload exception:', msg);
        if (!uploadErrMsg) uploadErrMsg = msg;
      }
    }

    if (!uploadSuccess) {
      console.error('[Storage Error] profile-avatars upload failed:', uploadErrMsg);
      return {
        success: false,
        error: uploadErrMsg || 'Failed to upload profile picture to storage.',
      };
    }

    const { data: urlData } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(filePath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: filePath,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Storage upload failed';
    console.error('[Storage Error] profile avatar upload exception:', message);
    return { success: false, error: message };
  }
}

/**
 * Delete an old avatar from `profile-avatars` bucket
 */
export async function deleteProfileAvatarFromStorage(
  filePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([filePath]);
    if (error) {
      console.warn('Supabase storage delete error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Storage deletion failed';
    return { success: false, error: message };
  }
}

/**
 * Upload an event flyer/poster to the dedicated `event-flyers` bucket in Supabase.
 * Organizes files into: "{userId}/flyers/{timestamp}_{random}.{ext}"
 * Returns the public URL to be stored in "campus_events.poster_url".
 */
export async function uploadEventFlyerToStorage(
  userId: string,
  file: File,
  onProgress?: (message: string) => void
): Promise<StorageUploadResult> {
  try {
    const effectiveUserId = userId || 'anonymous';
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error || 'Invalid event flyer image' };
    }

    onProgress?.('Preparing flyer photo...');
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt) ? fileExt : 'jpg';
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const scopedPath = `${effectiveUserId}/flyers/${uniqueId}.${cleanExt}`;
    const contentType = file.type || (cleanExt === 'png' ? 'image/png' : cleanExt === 'webp' ? 'image/webp' : 'image/jpeg');

    onProgress?.('Uploading to event-flyers storage...');
    // Direct upload of File with upsert: false avoids RLS UPDATE permission violations
    const { error: uploadError } = await supabase.storage
      .from(EVENT_FLYERS_BUCKET)
      .upload(scopedPath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });

    if (uploadError) {
      console.warn('[Storage] event-flyers direct upload notice:', uploadError.message);
      // Resilient fallback with ArrayBuffer
      try {
        const buffer = await readFileAsArrayBuffer(file);
        const { error: bufErr } = await supabase.storage
          .from(EVENT_FLYERS_BUCKET)
          .upload(scopedPath, buffer, {
            cacheControl: '3600',
            upsert: false,
            contentType,
          });
        if (bufErr) {
          return { success: false, error: bufErr.message };
        }
      } catch (bufCatch: any) {
        return { success: false, error: uploadError.message || bufCatch.message };
      }
    }

    const { data: urlData } = supabase.storage
      .from(EVENT_FLYERS_BUCKET)
      .getPublicUrl(scopedPath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: scopedPath,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Flyer upload failed';
    console.error('[Storage Error] Event flyer upload exception:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Delete an event flyer from `event-flyers` bucket
 */
export async function deleteEventFlyerFromStorage(
  filePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanPath = filePath.includes('event-flyers/')
      ? filePath.split('event-flyers/').pop()!
      : filePath;
    const { error } = await supabase.storage.from(EVENT_FLYERS_BUCKET).remove([cleanPath]);
    if (error) {
      console.warn('Supabase flyer storage delete error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Storage deletion failed';
    return { success: false, error: message };
  }
}

/**
 * Upload a community profile avatar or cover photo to the dedicated `community-images` bucket.
 * Organizes files into:
 *   - Profile icons: "{userId}/profile/{timestamp}_{random}.{ext}"
 *   - Cover banners: "{userId}/cover/{timestamp}_{random}.{ext}"
 * Returns the public URL to be stored in "communities.image_url" or "communities.cover_image_url".
 */
export async function uploadCommunityImageToStorage(
  userId: string,
  file: File,
  kind: 'profile' | 'cover',
  communityId?: string,
  onProgress?: (message: string) => void
): Promise<StorageUploadResult> {
  try {
    const effectiveUserId = userId || 'anonymous';
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error || 'Invalid community image' };
    }

    onProgress?.(`Uploading community ${kind} photo...`);
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt) ? fileExt : 'jpg';
    const prefix = communityId ? `${communityId.replace(/[^a-zA-Z0-9_-]/g, '')}_` : '';
    const uniqueFileName = `${prefix}${kind}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${cleanExt}`;
    const scopedPath = `${effectiveUserId}/${kind}/${uniqueFileName}`;
    const contentType = file.type || (cleanExt === 'png' ? 'image/png' : cleanExt === 'webp' ? 'image/webp' : 'image/jpeg');

    const { error: uploadError } = await supabase.storage
      .from(COMMUNITY_IMAGES_BUCKET)
      .upload(scopedPath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });

    if (uploadError) {
      console.warn('[Storage] community-images direct upload notice:', uploadError.message);
      // Secondary attempt with ArrayBuffer
      try {
        const buffer = await readFileAsArrayBuffer(file);
        const { error: bufErr } = await supabase.storage
          .from(COMMUNITY_IMAGES_BUCKET)
          .upload(scopedPath, buffer, {
            cacheControl: '3600',
            upsert: false,
            contentType,
          });
        if (bufErr) {
          return { success: false, error: bufErr.message };
        }
      } catch (bufCatch: any) {
        return { success: false, error: uploadError.message || bufCatch.message };
      }
    }

    const { data: urlData } = supabase.storage
      .from(COMMUNITY_IMAGES_BUCKET)
      .getPublicUrl(scopedPath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: scopedPath,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Community image upload failed';
    console.error('[Storage Error] Community image upload exception:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Delete a community image from `community-images` bucket
 */
export async function deleteCommunityImageFromStorage(
  filePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanPath = filePath.includes('community-images/')
      ? filePath.split('community-images/').pop()!
      : filePath;
    const { error } = await supabase.storage.from(COMMUNITY_IMAGES_BUCKET).remove([cleanPath]);
    if (error) {
      console.warn('Supabase community image storage delete error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Storage deletion failed';
    return { success: false, error: message };
  }
}

/**
 * Upload a page asset (avatar or cover) to the dedicated `page-assets` bucket.
 * Organizes files into:
 *   - Avatar logo: "{userId}/pages/{pageId}_avatar_{timestamp}_{random}.{ext}"
 *   - Cover banner: "{userId}/pages/{pageId}_cover_{timestamp}_{random}.{ext}"
 * Returns the public URL to be stored in "pages.avatar_url" or "pages.cover_path".
 */
export async function uploadPageAssetToStorage(
  userId: string,
  file: File,
  kind: 'avatar' | 'cover',
  pageId?: string,
  onProgress?: (message: string) => void
): Promise<StorageUploadResult> {
  try {
    const effectiveUserId = userId || 'anonymous';
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error || 'Invalid page image' };
    }

    onProgress?.(`Uploading page ${kind}...`);
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt) ? fileExt : 'jpg';
    const prefix = pageId ? `${pageId.replace(/[^a-zA-Z0-9_-]/g, '')}_` : '';
    const uniqueFileName = `${prefix}${kind}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${cleanExt}`;
    const scopedPath = `${effectiveUserId}/pages/${uniqueFileName}`;
    const contentType = file.type || (cleanExt === 'png' ? 'image/png' : cleanExt === 'webp' ? 'image/webp' : 'image/jpeg');

    const { error: uploadError } = await supabase.storage
      .from(PAGE_ASSETS_BUCKET)
      .upload(scopedPath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });

    if (uploadError) {
      console.warn('[Storage] page-assets direct upload notice:', uploadError.message);
      // Secondary attempt with ArrayBuffer
      try {
        const buffer = await readFileAsArrayBuffer(file);
        const { error: bufErr } = await supabase.storage
          .from(PAGE_ASSETS_BUCKET)
          .upload(scopedPath, buffer, {
            cacheControl: '3600',
            upsert: false,
            contentType,
          });
        if (bufErr) {
          return { success: false, error: bufErr.message };
        }
      } catch (bufCatch: any) {
        return { success: false, error: uploadError.message || bufCatch.message };
      }
    }

    const { data: urlData } = supabase.storage
      .from(PAGE_ASSETS_BUCKET)
      .getPublicUrl(scopedPath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: scopedPath,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Page asset upload failed';
    console.error('[Storage Error] Page asset upload exception:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Delete a page asset from `page-assets` bucket
 */
export async function deletePageAssetFromStorage(
  filePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanPath = filePath.includes('page-assets/')
      ? filePath.split('page-assets/').pop()!
      : filePath;
    const { error } = await supabase.storage.from(PAGE_ASSETS_BUCKET).remove([cleanPath]);
    if (error) {
      console.warn('Supabase page asset storage delete error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Storage deletion failed';
    return { success: false, error: message };
  }
}

/**
 * Upload a photo or video to the private `story-media` bucket.
 * Enforces 25MB max size and 60-second max video duration.
 * Direct browser File upload with upsert: false.
 */
export async function uploadStoryMediaToStorage(
  userId: string,
  file: File,
  mediaType: 'image' | 'video',
  onProgress?: (message: string) => void,
  fallbackUrl?: string
): Promise<StorageUploadResult> {
  if (!file || file.size <= 0) {
    return { success: false, error: 'Selected media file is empty or unreadable.' };
  }

  const maxBytes = 25 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      success: false,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 25 MB limit for stories.`,
    };
  }

  if (mediaType === 'video' && typeof document !== 'undefined') {
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const videoEl = document.createElement('video');
        videoEl.preload = 'metadata';
        const tempUrl = URL.createObjectURL(file);
        videoEl.src = tempUrl;
        videoEl.onloadedmetadata = () => {
          URL.revokeObjectURL(tempUrl);
          resolve(videoEl.duration);
        };
        videoEl.onerror = () => {
          URL.revokeObjectURL(tempUrl);
          reject(new Error('Failed to read video duration'));
        };
      });

      if (Number.isFinite(duration) && duration > 60) {
        return {
          success: false,
          error: `Video length (${Math.round(duration)}s) exceeds the 60-second limit for stories.`,
        };
      }
    } catch {
      // Proceed if metadata inspection fails on browser codec
    }
  }

  try {
    const session = await getActiveUploadSession();
    const effectiveUserId = session?.user?.id || userId;
    if (!effectiveUserId) {
      return { success: false, error: 'Please sign in to upload your story.' };
    }

    onProgress?.(`Uploading ${mediaType} story to Supabase Storage...`);

    const rawExt = file.name.split('.').pop()?.toLowerCase() || (mediaType === 'video' ? 'mp4' : 'jpg');
    const cleanExt =
      mediaType === 'video'
        ? ['mp4', 'webm', 'mov', 'm4v'].includes(rawExt)
          ? rawExt
          : 'mp4'
        : ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(rawExt)
        ? rawExt
        : 'jpg';
    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${cleanExt}`;
    const scopedPath = `${effectiveUserId}/${uniqueFileName}`;
    const contentType =
      file.type ||
      (mediaType === 'video'
        ? cleanExt === 'webm'
          ? 'video/webm'
          : cleanExt === 'mov'
          ? 'video/quicktime'
          : 'video/mp4'
        : cleanExt === 'png'
        ? 'image/png'
        : cleanExt === 'webp'
        ? 'image/webp'
        : 'image/jpeg');

    let fileBuffer: ArrayBuffer;
    try {
      fileBuffer = await readFileAsArrayBuffer(file);
    } catch (readErr) {
      if (fallbackUrl) {
        fileBuffer = await readFileAsArrayBuffer(fallbackUrl);
      } else {
        throw readErr;
      }
    }
    if (!fileBuffer || fileBuffer.byteLength === 0) {
      return { success: false, error: 'Selected media file could not be read from device storage.' };
    }

    const { error: uploadError } = await supabase.storage
      .from(STORY_MEDIA_BUCKET)
      .upload(scopedPath, fileBuffer, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });

    if (uploadError) {
      console.warn('[Storage] story-media direct upload error:', uploadError.message);
      // Secondary attempt with signed upload URL
      try {
        const { data: signUploadData, error: signErr } = await supabase.storage
          .from(STORY_MEDIA_BUCKET)
          .createSignedUploadUrl(scopedPath);

        if (signErr || !signUploadData?.token) {
          return { success: false, error: uploadError.message || signErr?.message || 'Story upload failed.' };
        }

        const { error: signedUpErr } = await supabase.storage
          .from(STORY_MEDIA_BUCKET)
          .uploadToSignedUrl(scopedPath, signUploadData.token, fileBuffer, {
            cacheControl: '3600',
            contentType,
          });

        if (signedUpErr) {
          return { success: false, error: signedUpErr.message };
        }
      } catch (fallbackErr: any) {
        return { success: false, error: uploadError.message || fallbackErr?.message || 'Story upload failed.' };
      }
    }

    // Generate signed URL valid for 24 hours
    const { data: signData } = await supabase.storage
      .from(STORY_MEDIA_BUCKET)
      .createSignedUrl(scopedPath, 86400);

    if (!signData?.signedUrl) {
      console.warn('[Storage] story-media signed URL generation returned empty; using storage path:', scopedPath);
    }

    return {
      success: true,
      url: signData?.signedUrl || scopedPath,
      path: scopedPath,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Story media upload failed';
    return { success: false, error: msg };
  }
}

/**
 * Resolve signed URL for a story media path
 */
export async function resolveStoryMediaSignedUrl(storagePath: string): Promise<string> {
  if (!storagePath) return '';
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('data:')) {
    return storagePath;
  }
  try {
    const { data } = await supabase.storage
      .from(STORY_MEDIA_BUCKET)
      .createSignedUrl(storagePath, 86400);
    return data?.signedUrl || storagePath;
  } catch {
    return storagePath;
  }
}

/**
 * Delete story media file from storage
 */
export async function deleteStoryMediaFromStorage(storagePath: string): Promise<void> {
  if (!storagePath) return;
  try {
    await supabase.storage.from(STORY_MEDIA_BUCKET).remove([storagePath]);
  } catch (err) {
    console.warn('[Storage] Failed to delete story media:', err);
  }
}

