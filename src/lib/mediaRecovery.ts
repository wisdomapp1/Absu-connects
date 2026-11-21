import {
  createInMemoryFile,
  decodeAndValidateImageFile,
  readFileAsArrayBuffer,
} from './storageService.ts';
import { validateImageFile, validateVideoFile } from '../utils/logic.ts';

export type MediaErrorCategory =
  | 'file_read'
  | 'decode'
  | 'metadata'
  | 'unsupported_type'
  | 'size_limit'
  | 'duration_limit'
  | 'upload_network'
  | 'cancelled'
  | 'unknown';

export interface MediaRecoveryState {
  category: MediaErrorCategory;
  fileName?: string;
  title: string;
  message: string;
  canChooseAgain: boolean;
  canRetryUpload?: boolean;
}

export interface PreparedImageResult {
  ok: boolean;
  file?: File;
  buffer?: ArrayBuffer;
  previewUrl?: string;
  width?: number;
  height?: number;
  recovery?: MediaRecoveryState;
}

export interface PreparedVideoResult {
  ok: boolean;
  file?: File;
  buffer?: ArrayBuffer;
  previewUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  recovery?: MediaRecoveryState;
}

export interface PreparedGenericMediaResult {
  ok: boolean;
  file?: File;
  buffer?: ArrayBuffer;
  previewUrl?: string;
  recovery?: MediaRecoveryState;
}

export function categorizeMediaError(
  err: unknown,
  context?: {
    fileName?: string;
    phase?: 'read' | 'decode' | 'metadata' | 'upload';
    maxMb?: number;
    maxSeconds?: number;
  }
): MediaRecoveryState {
  const fileName = context?.fileName;
  const rawMsg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : 'An unexpected media issue occurred.';
  const lower = rawMsg.toLowerCase();

  if (
    (err instanceof DOMException && err.name === 'AbortError') ||
    lower.includes('aborted') ||
    lower.includes('cancelled') ||
    lower.includes('canceled')
  ) {
    return {
      category: 'cancelled',
      fileName,
      title: 'Upload Cancelled',
      message: rawMsg,
      canChooseAgain: true,
      canRetryUpload: false,
    };
  }

  if (
    lower.includes('unsupported') ||
    lower.includes('valid image') ||
    lower.includes('valid video') ||
    lower.includes('format')
  ) {
    return {
      category: 'unsupported_type',
      fileName,
      title: 'Unsupported Media Format',
      message: rawMsg,
      canChooseAgain: true,
      canRetryUpload: false,
    };
  }

  if (lower.includes('exceeds') || lower.includes('limit') || lower.includes('mb')) {
    return {
      category: 'size_limit',
      fileName,
      title: 'File Too Large',
      message: rawMsg,
      canChooseAgain: true,
      canRetryUpload: false,
    };
  }

  if (lower.includes('seconds') || lower.includes('duration') || lower.includes('shorter')) {
    return {
      category: 'duration_limit',
      fileName,
      title: 'Video Too Long',
      message: rawMsg,
      canChooseAgain: true,
      canRetryUpload: false,
    };
  }

  if (
    context?.phase === 'upload' ||
    lower.includes('network') ||
    lower.includes('cloudinary') ||
    lower.includes('timeout') ||
    lower.includes('offline') ||
    lower.includes('failed to publish') ||
    lower.includes('status') ||
    lower.includes('server')
  ) {
    return {
      category: 'upload_network',
      fileName,
      title: 'Upload / Network Error',
      message: rawMsg,
      canChooseAgain: false,
      canRetryUpload: true,
    };
  }

  if (
    context?.phase === 'metadata' ||
    lower.includes('metadata') ||
    lower.includes('video could not')
  ) {
    return {
      category: 'metadata',
      fileName,
      title: 'Video File Unreadable',
      message: fileName
        ? `Could not load video details for "${fileName}". Choose the file again or select another video.`
        : rawMsg,
      canChooseAgain: true,
      canRetryUpload: false,
    };
  }

  if (
    context?.phase === 'decode' ||
    lower.includes('corrupt') ||
    lower.includes('truncated') ||
    lower.includes('decode')
  ) {
    return {
      category: 'decode',
      fileName,
      title: 'Corrupted or Unreadable Photo',
      message: fileName
        ? `"${fileName}" could not be decoded for preview. Please choose the file again.`
        : rawMsg,
      canChooseAgain: true,
      canRetryUpload: false,
    };
  }

  if (
    context?.phase === 'read' ||
    lower.includes('read') ||
    lower.includes('0 bytes') ||
    lower.includes('empty') ||
    lower.includes('notreadableerror') ||
    lower.includes('permission') ||
    lower.includes('arraybuffer')
  ) {
    return {
      category: 'file_read',
      fileName,
      title: 'Could Not Read Selected File',
      message: fileName
        ? `Could not read "${fileName}" from device storage. Temporary file access may have expired — tap "Choose File Again".`
        : 'Could not read the selected file from device storage. Please choose the file again.',
      canChooseAgain: true,
      canRetryUpload: false,
    };
  }

  return {
    category: 'unknown',
    fileName,
    title: 'Media Issue',
    message: rawMsg,
    canChooseAgain: true,
    canRetryUpload: context?.phase === 'upload',
  };
}

/**
 * Safely reads, buffers, and decodes an image file without leaking Blob URLs on failure.
 */
export async function safeReadAndPrepareImage(file: File): Promise<PreparedImageResult> {
  if (!file || file.size <= 0) {
    return {
      ok: false,
      recovery: categorizeMediaError(
        new Error(`"${file?.name || 'Selected file'}" is empty or unreadable (0 bytes).`),
        { fileName: file?.name, phase: 'read' }
      ),
    };
  }

  const preCheck = validateImageFile({ type: file.type, size: file.size, name: file.name });
  if (!preCheck.valid) {
    return {
      ok: false,
      recovery: categorizeMediaError(new Error(preCheck.error || 'Unsupported image file.'), {
        fileName: file.name,
      }),
    };
  }

  try {
    const decoded = await decodeAndValidateImageFile(file);
    if (!decoded.valid || !decoded.file || !decoded.previewUrl) {
      return {
        ok: false,
        recovery: categorizeMediaError(
          new Error(decoded.error || `"${file.name}" could not be decoded.`),
          { fileName: file.name, phase: 'decode' }
        ),
      };
    }

    return {
      ok: true,
      file: decoded.file,
      buffer: decoded.buffer,
      previewUrl: decoded.previewUrl,
      width: decoded.width,
      height: decoded.height,
    };
  } catch (err) {
    return {
      ok: false,
      recovery: categorizeMediaError(err, { fileName: file.name, phase: 'read' }),
    };
  }
}

/**
 * Safely reads a video file into an in-memory buffer FIRST (avoiding expired Android content:// URIs),
 * then validates format, size, and playable video metadata with a safe timeout.
 */
export async function safeReadAndPrepareVideo(
  file: File,
  options?: { maxBytes?: number; maxDurationSeconds?: number }
): Promise<PreparedVideoResult> {
  const maxBytes = options?.maxBytes ?? 50 * 1024 * 1024;
  const maxDurationSeconds = options?.maxDurationSeconds ?? 60;

  if (!file || file.size <= 0) {
    return {
      ok: false,
      recovery: categorizeMediaError(
        new Error(`"${file?.name || 'Selected video'}" is empty or unreadable (0 bytes).`),
        { fileName: file?.name, phase: 'read' }
      ),
    };
  }

  const preCheck = validateVideoFile({ type: file.type, size: file.size, name: file.name });
  if (!preCheck.valid) {
    return {
      ok: false,
      recovery: categorizeMediaError(new Error(preCheck.error || 'Unsupported video file.'), {
        fileName: file.name,
      }),
    };
  }

  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    return {
      ok: false,
      recovery: categorizeMediaError(
        new Error(
          `Video "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the ${maxMb} MB limit.`
        ),
        { fileName: file.name }
      ),
    };
  }

  let mem: { file: File; buffer: ArrayBuffer; previewUrl: string };
  try {
    mem = await createInMemoryFile(file);
  } catch (err) {
    return {
      ok: false,
      recovery: categorizeMediaError(err, { fileName: file.name, phase: 'read' }),
    };
  }

  if (!mem.buffer || mem.buffer.byteLength <= 0) {
    URL.revokeObjectURL(mem.previewUrl);
    return {
      ok: false,
      recovery: categorizeMediaError(new Error(`"${file.name}" returned 0 bytes when read.`), {
        fileName: file.name,
        phase: 'read',
      }),
    };
  }

  // Validate video metadata using the durable in-memory blob URL
  const metaResult = await new Promise<{
    ok: boolean;
    duration: number;
    width: number;
    height: number;
    error?: string;
  }>((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ ok: true, duration: 0, width: 0, height: 0 });
      return;
    }

    const videoEl = document.createElement('video');
    let settled = false;

    const finish = (res: { ok: boolean; duration: number; width: number; height: number; error?: string }) => {
      if (settled) return;
      settled = true;
      videoEl.onloadedmetadata = null;
      videoEl.onerror = null;
      videoEl.src = '';
      resolve(res);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        duration: 0,
        width: 0,
        height: 0,
        error: `Timed out reading video metadata for "${file.name}". Please re-select the file.`,
      });
    }, 8500);

    videoEl.preload = 'metadata';
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.onloadedmetadata = () => {
      clearTimeout(timer);
      const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
      finish({
        ok: true,
        duration,
        width: videoEl.videoWidth || 0,
        height: videoEl.videoHeight || 0,
      });
    };
    videoEl.onerror = () => {
      clearTimeout(timer);
      finish({
        ok: false,
        duration: 0,
        width: 0,
        height: 0,
        error: `"${file.name}" could not be decoded. Please choose a valid MP4, WebM, or MOV video.`,
      });
    };
    videoEl.src = mem.previewUrl;
  });

  if (!metaResult.ok) {
    URL.revokeObjectURL(mem.previewUrl);
    return {
      ok: false,
      recovery: categorizeMediaError(new Error(metaResult.error || 'Video metadata error'), {
        fileName: file.name,
        phase: 'metadata',
      }),
    };
  }

  if (metaResult.duration > maxDurationSeconds) {
    URL.revokeObjectURL(mem.previewUrl);
    return {
      ok: false,
      recovery: categorizeMediaError(
        new Error(
          `Video duration (${Math.round(metaResult.duration)}s) exceeds the ${maxDurationSeconds}-second limit.`
        ),
        { fileName: file.name }
      ),
    };
  }

  return {
    ok: true,
    file: mem.file,
    buffer: mem.buffer,
    previewUrl: mem.previewUrl,
    duration: metaResult.duration,
    width: metaResult.width,
    height: metaResult.height,
  };
}

/**
 * Safely buffers generic attachments (e.g. DM audio files or PDFs) into memory so
 * Android content:// handles never fail mid-send.
 */
export async function safeReadGenericAttachment(
  file: File,
  options?: { maxBytes?: number }
): Promise<PreparedGenericMediaResult> {
  const maxBytes = options?.maxBytes ?? 25 * 1024 * 1024;
  if (!file || file.size <= 0) {
    return {
      ok: false,
      recovery: categorizeMediaError(
        new Error(`"${file?.name || 'Selected file'}" is empty (0 bytes).`),
        { fileName: file?.name, phase: 'read' }
      ),
    };
  }
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    return {
      ok: false,
      recovery: categorizeMediaError(
        new Error(
          `"${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds ${maxMb} MB limit.`
        ),
        { fileName: file.name }
      ),
    };
  }

  try {
    const buf = await readFileAsArrayBuffer(file);
    if (!buf || buf.byteLength <= 0) {
      return {
        ok: false,
        recovery: categorizeMediaError(new Error(`Could not read "${file.name}" (0 bytes).`), {
          fileName: file.name,
          phase: 'read',
        }),
      };
    }
    const memFile = new File([buf], file.name, {
      type: file.type || 'application/octet-stream',
      lastModified: file.lastModified || Date.now(),
    });
    const previewUrl = URL.createObjectURL(memFile);
    return {
      ok: true,
      file: memFile,
      buffer: buf,
      previewUrl,
    };
  } catch (err) {
    return {
      ok: false,
      recovery: categorizeMediaError(err, { fileName: file.name, phase: 'read' }),
    };
  }
}
