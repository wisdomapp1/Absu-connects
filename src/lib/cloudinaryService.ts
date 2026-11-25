import { supabase } from './supabase.ts';
import { validateImageFile } from '../utils/logic.ts';

export interface CloudinaryUploadResult {
  success: boolean;
  secure_url?: string;
  asset_id?: string;
  public_id?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
  resource_type?: 'image' | 'video';
  error?: string;
  aborted?: boolean;
}

export type UploadPurpose =
  | 'post'
  | 'story'
  | 'chat'
  | 'profile'
  | 'marketplace'
  | 'page'
  | 'page-profile'
  | 'page-cover'
  | 'page-post';

export interface CloudinaryUploadOptions {
  onProgress?: (message: string) => void;
  onPercent?: (percent: number) => void;
  signal?: AbortSignal;
  customFormat?: string;
  maxBytes?: number;
  folderOverride?: string;
  pageId?: string;
}

const DEFAULT_CLOUD_NAME = 'hwxyrhlm';
const DEFAULT_UPLOAD_PRESET = 'absu_connect_unsigned';
const DEFAULT_ROOT_FOLDER = 'absu-connect';

export function getCloudinaryConfig(): {
  cloudName: string;
  uploadPreset: string;
  rootFolder: string;
} {
  const env = (import.meta as any).env || {};
  const cloudName = String(env.VITE_CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUD_NAME).trim();
  const uploadPreset = String(env.VITE_CLOUDINARY_UPLOAD_PRESET || DEFAULT_UPLOAD_PRESET).trim();
  const rootFolder = String(env.VITE_CLOUDINARY_ASSET_FOLDER || DEFAULT_ROOT_FOLDER)
    .trim()
    .replace(/^\/+|\/+$/g, '');

  return {
    cloudName: cloudName || DEFAULT_CLOUD_NAME,
    uploadPreset: uploadPreset || DEFAULT_UPLOAD_PRESET,
    rootFolder: rootFolder || DEFAULT_ROOT_FOLDER,
  };
}

export function isCloudinaryConfigured(): boolean {
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  return Boolean(cloudName && uploadPreset);
}

/**
 * Returns the exact subfolder within `absu-connect/` using Cloudinary's `folder` upload parameter.
 */
export function getCloudinaryFolder(purpose: UploadPurpose, pageId?: string): string {
  const { rootFolder } = getCloudinaryConfig();
  const safePageId = pageId ? pageId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
  switch (purpose) {
    case 'post':
      return `${rootFolder}/posts`;
    case 'story':
      return `${rootFolder}/stories`;
    case 'chat':
      return `${rootFolder}/messages`;
    case 'profile':
      return `${rootFolder}/profiles`;
    case 'marketplace':
      return `${rootFolder}/marketplace`;
    case 'page-profile':
      return safePageId ? `${rootFolder}/pages/${safePageId}/avatar` : `${rootFolder}/pages/avatars`;
    case 'page-cover':
      return safePageId ? `${rootFolder}/pages/${safePageId}/cover` : `${rootFolder}/pages/covers`;
    case 'page-post':
      return safePageId ? `${rootFolder}/pages/${safePageId}/posts` : `${rootFolder}/pages/posts`;
    case 'page':
      return safePageId ? `${rootFolder}/pages/${safePageId}` : `${rootFolder}/pages`;
    default:
      return `${rootFolder}/posts`;
  }
}

/**
 * Diagnostic helper verifying client unsigned config & optional delete Edge Function health.
 */
export async function diagnoseCloudinary(): Promise<{
  ok: boolean;
  cloudName?: string;
  uploadPreset?: string;
  folders?: { posts: string; stories: string; messages: string; pages: string };
  error?: string;
}> {
  const cfg = getCloudinaryConfig();
  if (!cfg.cloudName || !cfg.uploadPreset) {
    return { ok: false, error: 'Cloudinary cloud name or unsigned upload preset is missing.' };
  }
  return {
    ok: true,
    cloudName: cfg.cloudName,
    uploadPreset: cfg.uploadPreset,
    folders: {
      posts: getCloudinaryFolder('post'),
      stories: getCloudinaryFolder('story'),
      messages: getCloudinaryFolder('chat'),
      pages: getCloudinaryFolder('page'),
    },
  };
}

/**
 * Uploads images, videos, or audio files directly to Cloudinary using the unsigned upload preset.
 * Uses XMLHttpRequest to provide smooth upload percentage updates and clean AbortSignal cancellation.
 */
export async function uploadMediaToCloudinary(
  file: File | Blob,
  purpose: UploadPurpose = 'post',
  progressOrOptions?: ((message: string) => void) | CloudinaryUploadOptions,
  legacyCustomFormat?: string
): Promise<CloudinaryUploadResult> {
  const opts: CloudinaryUploadOptions =
    typeof progressOrOptions === 'function'
      ? { onProgress: progressOrOptions, customFormat: legacyCustomFormat }
      : progressOrOptions || {};

  if (opts.signal?.aborted) {
    return { success: false, aborted: true, error: 'Upload cancelled.' };
  }

  const { cloudName, uploadPreset } = getCloudinaryConfig();
  if (!cloudName || !uploadPreset) {
    return { success: false, error: 'Cloudinary unsigned configuration is missing.' };
  }

  const mimeType = (file.type || '').toLowerCase();
  const fileName = file instanceof File ? file.name : '';
  const isAudio =
    mimeType.startsWith('audio/') ||
    Boolean(fileName.match(/\.(mp3|m4a|wav|ogg|aac)$/i)) ||
    Boolean(fileName.match(/^(voicenote_|voice_note_).*\.webm$/i));
  const isVideo =
    !isAudio &&
    (mimeType.startsWith('video/') || Boolean(fileName.match(/\.(mp4|webm|mov|m4v|ogg)$/i)));

  let ext = '';
  if (opts.customFormat) {
    ext = opts.customFormat.toLowerCase().replace(/[^a-z0-9]/g, '');
  } else if (fileName.includes('.')) {
    ext = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  } else if (mimeType.includes('/')) {
    ext = mimeType.split('/')[1]?.split(';')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  }

  // Cloudinary handles audio files reliably via the 'video' resource_type endpoint
  const resourceType: 'image' | 'video' = isVideo || isAudio ? 'video' : 'image';
  const format =
    ext === 'jpeg'
      ? 'jpg'
      : ext === 'quicktime'
      ? 'mov'
      : ext || (resourceType === 'video' ? (isAudio ? 'webm' : 'mp4') : 'jpg');

  // Client-side file size validation
  if (resourceType === 'image') {
    const val = validateImageFile({ type: mimeType, size: file.size, name: fileName });
    if (!val.valid) {
      return { success: false, error: val.error || 'Invalid image file.' };
    }
  } else {
    const defaultMax = purpose === 'chat' ? 25 * 1024 * 1024 : 50 * 1024 * 1024;
    const maxBytes = opts.maxBytes ?? defaultMax;
    if (file.size > maxBytes) {
      return {
        success: false,
        error: `Media size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds ${Math.round(
          maxBytes / (1024 * 1024)
        )} MB limit.`,
      };
    }
  }

  const targetFolder = opts.folderOverride || getCloudinaryFolder(purpose, opts.pageId);
  const mediaLabel = isAudio ? 'voice note' : resourceType;

  opts.onProgress?.(`Uploading ${mediaLabel} to Cloudinary...`);
  opts.onPercent?.(5);

  // Copy file into an in-memory Blob first so FormData upload never fails on expired Android OS URIs
  let uploadBlob: Blob = file;
  try {
    const buf = await file.arrayBuffer();
    if (buf && buf.byteLength > 0) {
      uploadBlob = new Blob([buf], { type: mimeType || undefined });
    }
  } catch {
    uploadBlob = file;
  }

  if (opts.signal?.aborted) {
    return { success: false, aborted: true, error: 'Upload cancelled.' };
  }

  const finalFileName = fileName || `absu_${purpose}_${Date.now()}.${format}`;
  const formData = new FormData();
  formData.append('file', uploadBlob, finalFileName);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', targetFolder);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(
    cloudName
  )}/${resourceType}/upload`;

  return await new Promise<CloudinaryUploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();

    const handleAbortSignal = () => {
      try {
        xhr.abort();
      } catch {}
    };

    if (opts.signal) {
      opts.signal.addEventListener('abort', handleAbortSignal, { once: true });
    }

    const cleanup = () => {
      if (opts.signal) {
        opts.signal.removeEventListener('abort', handleAbortSignal);
      }
    };

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        const pct = Math.min(99, Math.max(5, Math.round((evt.loaded / evt.total) * 100)));
        opts.onPercent?.(pct);
        opts.onProgress?.(`Uploading ${mediaLabel} (${pct}%)...`);
      }
    };

    xhr.onabort = () => {
      cleanup();
      resolve({ success: false, aborted: true, error: 'Upload cancelled.' });
    };

    xhr.onerror = () => {
      cleanup();
      resolve({
        success: false,
        error: 'Network error uploading to Cloudinary. Check your internet connection.',
      });
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const cldData = JSON.parse(xhr.responseText) as Record<string, any>;
          const secureUrl = (cldData.secure_url || cldData.url) as string | undefined;
          if (!secureUrl) {
            resolve({ success: false, error: 'Cloudinary returned an empty URL.' });
            return;
          }
          opts.onPercent?.(100);
          resolve({
            success: true,
            secure_url: secureUrl,
            asset_id: (cldData.public_id || cldData.asset_id) as string | undefined,
            public_id: cldData.public_id as string | undefined,
            format: (cldData.format as string | undefined) || format,
            bytes: (cldData.bytes as number | undefined) ?? file.size,
            width: cldData.width as number | undefined,
            height: cldData.height as number | undefined,
            duration: cldData.duration as number | undefined,
            resource_type: resourceType,
          });
        } catch {
          resolve({ success: false, error: 'Unexpected response from Cloudinary.' });
        }
        return;
      }

      let errMsg = `Cloudinary upload failed (${xhr.status})`;
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (parsed?.error?.message) {
          errMsg = parsed.error.message;
        }
      } catch {}
      resolve({ success: false, error: errMsg });
    };

    xhr.open('POST', endpoint, true);
    xhr.send(formData);
  });
}

export interface DeleteCloudinaryAssetInput {
  public_id: string;
  resource_type?: 'image' | 'video' | 'raw';
  entity_type: 'post' | 'story' | 'message';
  entity_id?: string;
}

/**
 * Extracts a Cloudinary public_id (e.g. "absu-connect/posts/abc") from either a public_id string
 * or a full Cloudinary delivery URL.
 */
export function extractCloudinaryPublicId(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('absu-connect/')) {
    return trimmed;
  }
  const match = trimmed.match(/\/(?:image|video|raw)\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(absu-connect\/.+?)(?:\.[a-z0-9]+)?(?:\?.*)?$/i);
  return match?.[1] || null;
}

/**
 * Deletes Cloudinary assets via the authenticated Supabase Edge Function `cloudinary-delete-media`.
 * Signature generation and API keys stay strictly on the server.
 */
export async function deleteCloudinaryAssets(
  assets: DeleteCloudinaryAssetInput[]
): Promise<{
  success: boolean;
  deleted?: string[];
  results?: Array<{ public_id: string; ok: boolean; result?: string; error?: string }>;
  error?: string;
}> {
  const validAssets = assets.filter((a) => Boolean(a.public_id && a.public_id.trim()));
  if (validAssets.length === 0) return { success: true, deleted: [] };

  try {
    const { data, error } = await supabase.functions.invoke('cloudinary-delete-media', {
      body: { assets: validAssets },
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Cloudinary cleanup service failed.',
      };
    }

    const results: Array<{ public_id: string; ok: boolean; result?: string; error?: string }> =
      Array.isArray(data?.results) ? data.results : [];
    const deleted = results.filter((r) => r.ok).map((r) => r.public_id);

    return {
      success: Boolean(data?.success ?? (results.length > 0 && results.every((r) => r.ok))),
      deleted,
      results,
      error: typeof data?.error === 'string' ? data.error : undefined,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error calling media cleanup.',
    };
  }
}

/**
 * Injects Cloudinary transformation flags (`so_`, `eo_`, `ac_none`, crop aspect ratio, `f_auto,q_auto`)
 * cleanly into a Cloudinary `/video/upload/` delivery URL.
 * Non-Cloudinary URLs are returned untouched.
 */
export function buildCloudinaryVideoDeliveryUrl(
  secureUrl: string,
  opts?: {
    trimStart?: number | null;
    trimEnd?: number | null;
    isMuted?: boolean | null;
    aspectRatio?: string | null;
    max720p?: boolean;
  }
): string {
  if (!secureUrl || !secureUrl.includes('/video/upload/')) {
    return secureUrl;
  }

  const transforms: string[] = [];

  if (typeof opts?.trimStart === 'number' && Number.isFinite(opts.trimStart) && opts.trimStart > 0) {
    transforms.push(`so_${opts.trimStart.toFixed(1).replace(/\.0$/, '')}`);
  }
  if (
    typeof opts?.trimEnd === 'number' &&
    Number.isFinite(opts.trimEnd) &&
    opts.trimEnd > 0 &&
    (typeof opts?.trimStart !== 'number' || opts.trimEnd > opts.trimStart)
  ) {
    transforms.push(`eo_${opts.trimEnd.toFixed(1).replace(/\.0$/, '')}`);
  }
  if (opts?.isMuted) {
    transforms.push('ac_none');
  }
  if (opts?.aspectRatio && opts.aspectRatio !== 'original') {
    if (opts.aspectRatio === '16:9' || opts.aspectRatio === '1:1' || opts.aspectRatio === '9:16') {
      transforms.push(`c_fill,ar_${opts.aspectRatio}`);
    }
  }
  if (opts?.max720p) {
    transforms.push('c_limit,w_1280,h_720');
  }

  transforms.push('f_auto,q_auto');

  const marker = '/video/upload/';
  const idx = secureUrl.indexOf(marker);
  if (idx === -1) return secureUrl;

  const prefix = secureUrl.slice(0, idx + marker.length);
  const rest = secureUrl.slice(idx + marker.length);

  // Avoid double-injecting if already transformed cleanly
  const firstSegment = rest.split('/')[0] || '';
  if (!/^v\d+$/.test(firstSegment) && firstSegment.includes(',')) {
    return secureUrl;
  }

  return `${prefix}${transforms.join(',')}/${rest}`;
}

/**
 * Injects Cloudinary image optimization transforms (`f_auto,q_auto` + optional sizing) cleanly.
 */
export function buildCloudinaryImageDeliveryUrl(
  secureUrl: string,
  opts?: { width?: number; height?: number; crop?: 'fill' | 'limit' }
): string {
  if (!secureUrl || !secureUrl.includes('/image/upload/')) {
    return secureUrl;
  }
  const marker = '/image/upload/';
  const idx = secureUrl.indexOf(marker);
  if (idx === -1) return secureUrl;

  const prefix = secureUrl.slice(0, idx + marker.length);
  const rest = secureUrl.slice(idx + marker.length);
  const firstSegment = rest.split('/')[0] || '';
  if (!/^v\d+$/.test(firstSegment) && firstSegment.includes(',')) {
    return secureUrl;
  }

  const transforms: string[] = [];
  if (opts?.width && opts?.height) {
    transforms.push(`c_${opts.crop || 'fill'},w_${opts.width},h_${opts.height}`);
  } else if (opts?.width) {
    transforms.push(`c_${opts.crop || 'limit'},w_${opts.width}`);
  }
  transforms.push('f_auto,q_auto');

  return `${prefix}${transforms.join(',')}/${rest}`;
}

/**
 * Builds an optimized JPG poster frame URL for a Cloudinary video asset.
 */
export function buildCloudinaryVideoPosterUrl(
  secureUrl: string,
  opts?: { timeOffset?: number | null }
): string {
  if (!secureUrl || !secureUrl.includes('/video/upload/')) {
    return '';
  }

  const marker = '/video/upload/';
  const idx = secureUrl.indexOf(marker);
  if (idx === -1) return '';

  const prefix = secureUrl.slice(0, idx + marker.length);
  let rest = secureUrl.slice(idx + marker.length);

  // Strip query strings and rewrite file extension to .jpg
  const qIdx = rest.indexOf('?');
  if (qIdx !== -1) rest = rest.slice(0, qIdx);
  rest = rest.replace(/\.[a-z0-9]+$/i, '.jpg');

  const sec =
    typeof opts?.timeOffset === 'number' && Number.isFinite(opts.timeOffset) && opts.timeOffset > 0
      ? Math.round(opts.timeOffset)
      : 0;

  return `${prefix}so_${sec},f_jpg,q_auto/${rest}`;
}

/**
 * Upload Page media exclusively to Cloudinary (`res.cloudinary.com`).
 * 1. Invokes Supabase Edge Function `cloudinary-sign-upload` for a signed Page upload when available.
 * 2. Fails closed on 401/403 authorization errors.
 * 3. Falls back strictly to Cloudinary's unsigned upload endpoint (into `absu-connect/pages/<pageId>/...`)
 *    only if the signing Edge Function is unavailable — NEVER uses Supabase Storage.
 */
export async function uploadPageMediaToCloudinary(
  file: File | Blob,
  purpose: 'page-profile' | 'page-cover' | 'page-post' | 'chat' = 'page-post',
  pageId: string,
  opts?: CloudinaryUploadOptions
): Promise<CloudinaryUploadResult> {
  if (!pageId) {
    return { success: false, error: 'Page ID is required for Page media uploads.' };
  }
  if (opts?.signal?.aborted) {
    return { success: false, aborted: true, error: 'Upload cancelled.' };
  }

  const mimeType = (file.type || '').toLowerCase();
  const fileName = file instanceof File ? file.name : '';
  const isAudio =
    mimeType.startsWith('audio/') ||
    Boolean(fileName.match(/\.(mp3|m4a|wav|ogg|aac)$/i)) ||
    Boolean(fileName.match(/^(voicenote_|voice_note_).*\.webm$/i));
  const isVideo =
    !isAudio &&
    (mimeType.startsWith('video/') || Boolean(fileName.match(/\.(mp4|webm|mov|m4v|ogg)$/i)));
  const resourceType: 'image' | 'video' = isVideo || isAudio ? 'video' : 'image';

  // Enforce image / video bounds cleanly
  if (resourceType === 'image') {
    const val = validateImageFile({ type: mimeType, size: file.size, name: fileName });
    if (!val.valid) {
      return { success: false, error: val.error || 'Invalid image file.' };
    }
  } else {
    const maxBytes = opts?.maxBytes ?? 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      return {
        success: false,
        error: `Media size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds ${Math.round(
          maxBytes / (1024 * 1024)
        )} MB limit.`,
      };
    }
  }

  const targetFolder =
    purpose === 'chat'
      ? `absu-connect/pages/${pageId.replace(/[^a-zA-Z0-9_-]/g, '')}/messages`
      : getCloudinaryFolder(purpose, pageId);

  try {
    opts?.onProgress?.('Requesting secure Page upload signature...');
    opts?.onPercent?.(5);

    const { data: signData, error: signError } = await supabase.functions.invoke('cloudinary-sign-upload', {
      body: {
        purpose,
        pageId,
        page_id: pageId,
        folder: targetFolder,
        resourceType,
        resource_type: resourceType,
        fileName: fileName || `page_${purpose}_${Date.now()}`,
      },
    });

    if (signError) {
      const status = (signError as any)?.context?.status;
      const errMsg = signError.message || '';
      // Fail closed on explicit auth / permission errors from the Edge Function
      if (status === 401 || status === 403 || /not authorized|unauthorized|forbidden|permission/i.test(errMsg)) {
        return {
          success: false,
          error: errMsg || 'You do not have permission to upload media for this Page.',
        };
      }
    } else if (signData && (signData.signature || signData.params?.signature)) {
      const signed = signData.params && typeof signData.params === 'object' ? signData.params : signData;
      const cloudName = String(
        signed.cloudName || signed.cloud_name || signData.cloudName || signData.cloud_name || getCloudinaryConfig().cloudName
      ).trim();
      const apiKey = String(signed.apiKey || signed.api_key || signData.apiKey || signData.api_key || '').trim();
      const signature = String(signed.signature || '').trim();
      const timestamp = String(signed.timestamp || '').trim();
      const folder = String(signed.folder || targetFolder).trim();
      const publicId = signed.publicId || signed.public_id ? String(signed.publicId || signed.public_id).trim() : '';
      const eager = signed.eager ? String(signed.eager).trim() : '';
      const transformation = signed.transformation ? String(signed.transformation).trim() : '';

      if (cloudName && apiKey && signature && timestamp) {
        let uploadBlob: Blob = file;
        try {
          const buf = await file.arrayBuffer();
          if (buf && buf.byteLength > 0) {
            uploadBlob = new Blob([buf], { type: mimeType || undefined });
          }
        } catch {
          uploadBlob = file;
        }

        const formData = new FormData();
        formData.append('file', uploadBlob, fileName || `page_${purpose}_${Date.now()}`);
        formData.append('api_key', apiKey);
        formData.append('timestamp', timestamp);
        formData.append('signature', signature);
        if (folder) formData.append('folder', folder);
        if (publicId) formData.append('public_id', publicId);
        if (eager) formData.append('eager', eager);
        if (transformation) formData.append('transformation', transformation);

        const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`;

        const signedRes = await new Promise<CloudinaryUploadResult>((resolve) => {
          const xhr = new XMLHttpRequest();
          const onAbort = () => {
            try {
              xhr.abort();
            } catch {}
          };
          if (opts?.signal) opts.signal.addEventListener('abort', onAbort, { once: true });
          const cleanup = () => {
            if (opts?.signal) opts.signal.removeEventListener('abort', onAbort);
          };
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable && evt.total > 0) {
              const pct = Math.min(99, Math.max(8, Math.round((evt.loaded / evt.total) * 100)));
              opts?.onPercent?.(pct);
              opts?.onProgress?.(`Uploading Page media (${pct}%)...`);
            }
          };
          xhr.onabort = () => {
            cleanup();
            resolve({ success: false, aborted: true, error: 'Upload cancelled.' });
          };
          xhr.onerror = () => {
            cleanup();
            resolve({ success: false, error: 'Network error uploading Page media to Cloudinary.' });
          };
          xhr.onload = () => {
            cleanup();
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const cldData = JSON.parse(xhr.responseText) as Record<string, any>;
                const rawSecureUrl = String(cldData.secure_url || cldData.url || '');
                if (!rawSecureUrl) {
                  resolve({ success: false, error: 'Cloudinary returned an empty URL.' });
                  return;
                }
                const optimizedUrl =
                  isVideo && rawSecureUrl.includes('/video/upload/')
                    ? buildCloudinaryVideoDeliveryUrl(rawSecureUrl, { max720p: true })
                    : rawSecureUrl;
                opts?.onPercent?.(100);
                resolve({
                  success: true,
                  secure_url: optimizedUrl,
                  asset_id: (cldData.public_id || cldData.asset_id) as string | undefined,
                  public_id: cldData.public_id as string | undefined,
                  format: (cldData.format as string | undefined) || (isVideo ? 'mp4' : 'jpg'),
                  bytes: (cldData.bytes as number | undefined) ?? file.size,
                  width: cldData.width as number | undefined,
                  height: cldData.height as number | undefined,
                  duration: cldData.duration as number | undefined,
                  resource_type: resourceType,
                });
              } catch {
                resolve({ success: false, error: 'Unexpected response from Cloudinary.' });
              }
              return;
            }
            resolve({ success: false, error: `Cloudinary upload failed (${xhr.status}).` });
          };
          xhr.open('POST', endpoint, true);
          xhr.send(formData);
        });

        if (signedRes.success || signedRes.aborted) {
          return signedRes;
        }
      }
    }
  } catch {
    // Ignore transport failure on sign check and fall back to unsigned Cloudinary preset below
  }

  // Upload strictly to Cloudinary unsigned preset in Pages folder (NEVER Supabase Storage)
  const unsignedRes = await uploadMediaToCloudinary(file, purpose === 'chat' ? 'chat' : purpose, {
    ...opts,
    pageId,
    folderOverride: targetFolder,
  });

  if (unsignedRes.success && unsignedRes.secure_url && isVideo) {
    return {
      ...unsignedRes,
      secure_url: buildCloudinaryVideoDeliveryUrl(unsignedRes.secure_url, { max720p: true }),
    };
  }
  return unsignedRes;
}

/**
 * Backward-compatible helper for feed post uploads
 */
export async function uploadPostMediaToCloudinary(
  file: File,
  _accessToken?: string,
  purpose: UploadPurpose = 'post'
): Promise<CloudinaryUploadResult> {
  return uploadMediaToCloudinary(file, purpose);
}
