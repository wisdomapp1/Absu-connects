import { supabase } from './supabase.ts';
import { validateImageFile, validateVideoFile } from '../utils/logic.ts';

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
}

export type UploadPurpose = 'post' | 'chat' | 'profile' | 'marketplace';

/**
 * Diagnostic tool: tests Supabase session and Cloudinary connectivity via the deployed Edge Function.
 */
export async function diagnoseCloudinary(): Promise<{
  ok: boolean;
  supabaseAuth?: string;
  cloudinaryConnection?: string;
  cloudinaryCredentials?: string;
  cloudName?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('cloudinary-sign-upload', {
      body: { action: 'diagnose' },
    });

    if (error) {
      return { ok: false, error: error.message || 'Diagnostic failed' };
    }
    return data || { ok: false, error: 'Empty diagnostic response' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Uploads media (images, videos, or audio voice notes) to Cloudinary via the
 * official Supabase Edge Function 'cloudinary-sign-upload'.
 *
 * Flow:
 * 1. Invokes 'cloudinary-sign-upload' Edge Function with current authenticated Supabase session.
 * 2. Uses the signed timestamp, folder, and signature to upload directly to Cloudinary API.
 * 3. Returns the Cloudinary secure_url, public_id, and metadata.
 */
export async function uploadMediaToCloudinary(
  file: File | Blob,
  purpose: UploadPurpose = 'post',
  onProgress?: (message: string) => void,
  customFormat?: string
): Promise<CloudinaryUploadResult> {
  const mimeType = file.type || '';
  const isVideo = mimeType.startsWith('video/');
  const isAudio = mimeType.startsWith('audio/') || (file instanceof File && Boolean(file.name.match(/\.(mp3|m4a|wav|ogg|aac|webm)$/i)));

  // Determine file extension
  let ext = '';
  if (customFormat) {
    ext = customFormat.toLowerCase().replace(/[^a-z0-9]/g, '');
  } else if (file instanceof File && file.name.includes('.')) {
    ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  } else if (mimeType.includes('/')) {
    ext = mimeType.split('/')[1]?.split(';')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  }

  // Cloudinary uses 'video' resourceType for both videos and audio files
  const resourceType: 'image' | 'video' = isVideo || isAudio ? 'video' : 'image';

  // Format normalization for edge function signing
  let format = ext;
  if (!format) {
    format = resourceType === 'video' ? (isAudio ? 'webm' : 'mp4') : 'jpg';
  }
  if (format === 'jpeg') format = 'jpg';
  if (format === 'quicktime') format = 'mov';

  // Validate limits client-side before requesting signature
  if (resourceType === 'image') {
    const val = validateImageFile({ type: mimeType, size: file.size });
    if (!val.valid) {
      return { success: false, error: val.error || 'Invalid image file.' };
    }
  } else {
    // 25MB limit for videos and audio
    if (file.size > 26214400) {
      return {
        success: false,
        error: `Media size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds Cloudinary 25 MB limit.`,
      };
    }
  }

  onProgress?.(`Requesting secure media signature for ${resourceType}...`);

  // Step 1: Request signature from Supabase Edge Function
  let signData: any;
  try {
    const { data, error } = await supabase.functions.invoke('cloudinary-sign-upload', {
      body: {
        purpose,
        resourceType,
        format,
      },
    });

    if (error) {
      let errMsg = error.message || 'Failed to sign upload.';
      if (error.context && typeof error.context.text === 'function') {
        try {
          const bodyText = await error.context.text();
          const parsed = JSON.parse(bodyText);
          if (parsed.error) errMsg = parsed.error;
        } catch {}
      }
      return { success: false, error: `Cloudinary signing error: ${errMsg}` };
    }

    signData = data;
  } catch (netErr: unknown) {
    const errMsg = netErr instanceof Error ? netErr.message : String(netErr);
    return {
      success: false,
      error: `Network error contacting signing service: ${errMsg}`,
    };
  }

  if (!signData || !signData.signature || !signData.cloudName || !signData.apiKey) {
    return {
      success: false,
      error: 'Signing service returned incomplete Cloudinary credentials.',
    };
  }

  onProgress?.(`Uploading ${resourceType} directly to Cloudinary...`);

  // Step 2: Upload directly to Cloudinary with the returned signature
  // Copy file into an in-memory Blob first so FormData upload never fails on an expired OS file handle
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
  const fileName = file instanceof File ? file.name : `media_${Date.now()}.${format}`;
  formData.append('file', uploadBlob, fileName);
  formData.append('api_key', String(signData.apiKey));
  formData.append('timestamp', String(signData.timestamp));
  formData.append('signature', signData.signature);

  if (signData.folder) {
    formData.append('folder', signData.folder);
  }

  const cldUrl = `https://api.cloudinary.com/v1_1/${signData.cloudName}/${signData.resourceType || resourceType}/upload`;

  let cldRes: Response;
  try {
    cldRes = await fetch(cldUrl, {
      method: 'POST',
      body: formData,
    });
  } catch (cldNetErr: unknown) {
    const errMsg = cldNetErr instanceof Error ? cldNetErr.message : String(cldNetErr);
    return {
      success: false,
      error: `Cloudinary upload network error (${errMsg}). Check connection.`,
    };
  }

  if (!cldRes.ok) {
    const errText = await cldRes.text().catch(() => '');
    let displayMsg = errText;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) {
        displayMsg = parsed.error.message;
      }
    } catch {}

    return {
      success: false,
      error: `Cloudinary upload error (${cldRes.status}): ${displayMsg}`,
    };
  }

  const cldData = (await cldRes.json()) as Record<string, any>;
  const secureUrl = (cldData.secure_url || cldData.url) as string | undefined;

  return {
    success: true,
    secure_url: secureUrl,
    asset_id: (cldData.public_id || cldData.asset_id) as string | undefined,
    public_id: cldData.public_id as string | undefined,
    format: cldData.format as string | undefined,
    bytes: cldData.bytes as number | undefined,
    width: cldData.width as number | undefined,
    height: cldData.height as number | undefined,
    duration: cldData.duration as number | undefined,
    resource_type: resourceType,
  };
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
