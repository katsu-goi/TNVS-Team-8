export type CameraPermissionState = PermissionState | 'unsupported';

function cameraErrorName(error: unknown): string {
  return error instanceof Error || (typeof error === 'object' && error !== null && 'name' in error)
    ? String((error as { name?: unknown }).name ?? '')
    : '';
}

export function cameraRecoverySteps(userAgent = navigator.userAgent): string {
  if (/Edg\//i.test(userAgent)) {
    return 'In Edge, open the lock icon > Permissions for this site > Camera > Allow, or visit edge://settings/content/camera.';
  }
  if (/Firefox\//i.test(userAgent)) {
    return 'In Firefox, open the lock icon > Connection secure > More information > Permissions, then allow Use the Camera.';
  }
  if (/Safari\//i.test(userAgent) && !/(Chrome|Chromium|CriOS)\//i.test(userAgent)) {
    return 'In Safari, open Safari > Settings for This Website, then set Camera to Allow.';
  }
  return 'In Chrome, open the tune or lock icon > Site settings > Camera > Allow, or visit chrome://settings/content/camera.';
}

export async function queryCameraPermission(): Promise<CameraPermissionState> {
  if (!navigator.permissions?.query) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state;
  } catch {
    // Some browsers expose Permissions API without supporting camera queries.
    return 'unsupported';
  }
}

export async function listVideoDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput');
  } catch {
    return [];
  }
}

export function cameraFailureMessage(error: unknown, secureContext = window.isSecureContext): string {
  if (!secureContext) {
    return 'Camera scanning requires HTTPS or localhost. Open the portal in a top-level secure tab, or use Manual Token Entry below.';
  }

  const name = cameraErrorName(error);
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return `Camera access was denied or blocked. ${cameraRecoverySteps()} Then click Start camera again. You can also use Manual Token Entry below.`;
  }
  if (name === 'SecurityError') {
    return 'Camera access is blocked by this page security context. Open the portal directly in a top-level HTTPS tab; if it is embedded, the parent frame must allow camera access.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was detected. Connect or enable a camera, then click Start camera again.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera could not be started because it is in use or blocked by the operating system. Close other camera apps or tabs, then try again.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'The selected camera does not support the requested scan settings. Choose another camera or use Automatic camera.';
  }
  if (name === 'NotSupportedError') {
    return 'This browser does not provide camera access. Update the browser or use Manual Token Entry below.';
  }
  if (name === 'AbortError') {
    return 'Camera startup was interrupted. Wait a moment, then click Start camera again.';
  }
  return error instanceof Error && error.message ? error.message : 'Camera access was unavailable.';
}
