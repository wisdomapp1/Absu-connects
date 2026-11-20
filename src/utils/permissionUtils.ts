/**
 * ABSU Connect — Media Permission Utilities for WebRTC Calling
 * Handles query, verification, device availability, and explanations
 * for Microphone and Camera access across Android Chrome and all modern browsers.
 */

export type PermissionCheckResult = 'granted' | 'prompt' | 'denied' | 'unsupported';

/**
 * Check permission status using Permissions API where supported.
 * Falls back safely to 'prompt' on Safari / older browsers that do not support camera/microphone queries.
 */
export async function checkMediaPermission(
  type: 'audio' | 'video'
): Promise<{
  mic: PermissionCheckResult;
  camera: PermissionCheckResult;
  canDirectlyCall: boolean;
}> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return { mic: 'unsupported', camera: 'unsupported', canDirectlyCall: false };
  }

  let micStatus: PermissionCheckResult = 'prompt';
  let cameraStatus: PermissionCheckResult = 'prompt';

  // 1. Try querying microphone permission
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const micPermission = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      micStatus = micPermission.state; // 'granted' | 'prompt' | 'denied'
    }
  } catch {
    // Safari / unsupported browser throws; fallback to 'prompt'
    micStatus = 'prompt';
  }

  // 2. Try querying camera permission if video is required
  if (type === 'video') {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const cameraPermission = await navigator.permissions.query({
          name: 'camera' as PermissionName,
        });
        cameraStatus = cameraPermission.state;
      }
    } catch {
      cameraStatus = 'prompt';
    }
  } else {
    cameraStatus = 'granted'; // Not needed for voice call
  }

  const canDirectlyCall =
    type === 'audio'
      ? micStatus === 'granted'
      : micStatus === 'granted' && cameraStatus === 'granted';

  return { mic: micStatus, camera: cameraStatus, canDirectlyCall };
}

/**
 * Checks whether audio input (microphone) or video input (camera) devices exist on the hardware.
 */
export async function checkDeviceAvailability(): Promise<{
  hasMicrophone: boolean;
  hasCamera: boolean;
}> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return { hasMicrophone: true, hasCamera: true };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasMicrophone = devices.some((d) => d.kind === 'audioinput');
    const hasCamera = devices.some((d) => d.kind === 'videoinput');
    return { hasMicrophone, hasCamera };
  } catch {
    return { hasMicrophone: true, hasCamera: true };
  }
}
