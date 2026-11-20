import imageCompression from 'browser-image-compression';

export interface ImageCompressionResult {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  savedPercent: number;
  width?: number;
  height?: number;
}

export interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
}

/**
 * Client-side image compression using browser-image-compression.
 * Preserves aspect ratio, colours, brightness, and orientation.
 * If compression does not reduce size (or is impossible), gracefully keeps original.
 */
export async function compressImageForUpload(
  file: File,
  maxSizeMB = 2.0,
  maxWidthOrHeight = 1920
): Promise<ImageCompressionResult> {
  const originalBytes = file.size;

  // Do not compress SVG or animated GIF
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      savedPercent: 0,
    };
  }

  // If already under 300KB, compression is unnecessary and could degrade quality
  if (file.size <= 300 * 1024) {
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      savedPercent: 0,
    };
  }

  try {
    let compressedBlob: Blob | null = null;
    try {
      // Safe, synchronous/microtask canvas compression (works in iframe / sandbox)
      compressedBlob = await imageCompression(file, {
        maxSizeMB,
        maxWidthOrHeight,
        useWebWorker: false,
        preserveExif: true,
        fileType: file.type || 'image/jpeg',
        initialQuality: 0.85,
      });
    } catch (e1) {
      console.warn('[Image Compression] Main thread compression notice, attempting with worker:', e1);
      try {
        compressedBlob = await imageCompression(file, {
          maxSizeMB,
          maxWidthOrHeight,
          useWebWorker: true,
          preserveExif: false,
          fileType: file.type || 'image/jpeg',
          initialQuality: 0.85,
        });
      } catch (e2) {
        console.warn('[Image Compression] Compression skipped or failed, using original file:', e2);
        return {
          file,
          originalBytes,
          compressedBytes: originalBytes,
          savedPercent: 0,
        };
      }
    }

    // If compressed result is actually smaller, use it; otherwise preserve the original
    if (compressedBlob && compressedBlob.size < originalBytes) {
      const compBuf = await compressedBlob.arrayBuffer();
      const compressedFile = new File([compBuf], file.name, {
        type: compressedBlob.type || file.type || 'image/jpeg',
        lastModified: Date.now(),
      });
      const savedPercent = Math.round(
        ((originalBytes - compressedFile.size) / originalBytes) * 100
      );

      return {
        file: compressedFile,
        originalBytes,
        compressedBytes: compressedFile.size,
        savedPercent,
      };
    }

    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      savedPercent: 0,
    };
  } catch (err) {
    console.warn('[Image Compression] Compression bypassed:', err);
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      savedPercent: 0,
    };
  }
}

/**
 * Inspect video file to read duration and dimensions.
 * Enforces the maximum 60-second limit for campus post videos.
 */
export async function inspectVideoFile(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const objectUrl = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        duration: video.duration || 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to read video metadata. The format may not be supported by this browser.'));
    };

    video.src = objectUrl;
  });
}

/**
 * Validate video file constraints: duration <= 60 seconds, size <= 50MB
 */
export async function validatePostVideoFile(file: File): Promise<{
  valid: boolean;
  error?: string;
  metadata?: VideoMetadata;
}> {
  // Max size 50 MB
  const maxBytes = 50 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `Video size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 50 MB limit.`,
    };
  }

  try {
    const meta = await inspectVideoFile(file);
    if (meta.duration > 60) {
      return {
        valid: false,
        error: `Video duration is ${Math.round(meta.duration)}s. ABSU Connect videos must be 60 seconds or shorter.`,
        metadata: meta,
      };
    }
    return { valid: true, metadata: meta };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid video file.';
    return { valid: false, error: msg };
  }
}

/**
 * Inspect image dimensions
 */
export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

/**
 * Converts any image File or Blob into an optimized, web-ready base64 Data URL.
 * Resizes to maxDimension (default 800px) and compresses with JPEG quality 0.72.
 * Output is typically 25KB-55KB, perfect for zero-latency database storage and
 * cross-device rendering without relying on external storage buckets.
 */
export async function fileToCompressedDataUrl(
  fileOrBlob: File | Blob,
  maxDimension = 800,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (fileOrBlob.type && !fileOrBlob.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(fileOrBlob);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (!width || !height) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(fileOrBlob);
        return;
      }

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(fileOrBlob);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      } catch {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(fileOrBlob);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(fileOrBlob);
    };

    img.src = objectUrl;
  });
}
