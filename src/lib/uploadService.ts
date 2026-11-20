import { validateImageFile } from '../utils/logic.ts';
import { uploadMediaToCloudinary } from './cloudinaryService.ts';

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  isLocalOnly?: boolean;
}

/**
 * Upload an avatar image using the Cloudinary signing Supabase Edge Function `cloudinary-sign-upload`.
 */
export async function uploadProfileAvatar(
  file: File,
  _accessToken?: string
): Promise<UploadResult> {
  const validation = validateImageFile({ type: file.type, size: file.size });
  if (!validation.valid) {
    return { success: false, error: validation.error || 'Invalid image file.' };
  }

  try {
    const res = await uploadMediaToCloudinary(file, 'profile');
    if (!res.success || !res.secure_url) {
      return {
        success: false,
        error: res.error || 'Failed to upload profile picture to Cloudinary.',
      };
    }

    return {
      success: true,
      url: res.secure_url,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload network error';
    return {
      success: false,
      error: msg,
    };
  }
}
