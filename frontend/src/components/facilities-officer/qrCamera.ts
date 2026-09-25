export function cameraFailureMessage(error: unknown, secureContext = window.isSecureContext): string {
  if (!secureContext) return 'Camera scanning requires HTTPS or localhost. Open this page over a secure connection, or use Manual Token Entry below.';
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was denied. Allow camera access in the browser site settings, or use Manual Token Entry below.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No camera was detected on this device.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'The camera is already in use by another application or browser tab.';
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') return 'The selected camera does not support the requested scan mode.';
  if (name === 'NotSupportedError') return 'This browser does not provide camera access. Use Manual Token Entry below.';
  return error instanceof Error && error.message ? error.message : 'Camera access was unavailable.';
}
