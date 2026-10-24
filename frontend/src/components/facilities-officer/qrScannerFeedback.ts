import { extractApiErrorCode, extractErrorMessage } from '../../api/client';

export type QrResultKind =
  | 'SUCCESS'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'INVALID'
  | 'ACCESS_DENIED'
  | 'ALREADY_PROCESSED'
  | 'UNAVAILABLE';

export type QrResultFeedback = {
  kind: QrResultKind;
  title: string;
  message: string;
  speech: string;
  filipinoSpeech?: string;
};

export function successfulQrFeedback(
  mode: 'CHECK_IN' | 'CHECK_OUT',
  credentialType: 'RESERVATION' | 'VISITOR' = 'VISITOR',
): QrResultFeedback {
  const passLabel = credentialType === 'RESERVATION' ? 'Reservation pass' : 'Visitor pass';
  if (mode === 'CHECK_OUT') {
    return {
      kind: 'SUCCESS',
      title: 'Check-Out Successful',
      message: `${passLabel} verified. Departure has been recorded.`,
      speech: `${passLabel} verified. Check-out successful.`,
      filipinoSpeech: 'Beripikado ang pass. Matagumpay ang pag-check-out.',
    };
  }
  return {
    kind: 'SUCCESS',
    title: 'Check-In Successful',
    message: `${passLabel} verified. Entry has been recorded.`,
    speech: `${passLabel} verified. Check-in successful.`,
    filipinoSpeech: 'Beripikado ang visitor pass. Matagumpay ang pag-check-in.',
  };
}

function responseStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const status = (error as { response?: { status?: unknown } }).response?.status;
  return typeof status === 'number' ? status : null;
}

function hasResponse(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'response' in error
    && Boolean((error as { response?: unknown }).response);
}

export function failedQrFeedback(error: unknown): QrResultFeedback {
  const code = extractApiErrorCode(error).toUpperCase();
  const serverMessage = extractErrorMessage(error);
  const normalized = `${code} ${serverMessage}`.toUpperCase();
  const status = responseStatus(error);

  if (!hasResponse(error) || (status !== null && status >= 500)) {
    return {
      kind: 'UNAVAILABLE',
      title: 'Verification Unavailable',
      message: 'Unable to verify this pass right now. Please try again.',
      speech: 'Verification unavailable. Please try again.',
      filipinoSpeech: 'Hindi available ang verification. Pakisubukan muli.',
    };
  }
  if (normalized.includes('TOO_EARLY') || normalized.includes('NOT VALID YET') || normalized.includes('BEFORE ITS AUTHORIZED')) {
    return {
      kind: 'NOT_YET_VALID',
      title: 'Visitor Pass Not Yet Valid',
      message: 'This pass cannot be used before its authorized entry time.',
      speech: 'Your visitor pass is not valid yet. Please wait until your scheduled entry time.',
      filipinoSpeech: 'Hindi pa maaaring gamitin ang visitor pass. Maghintay hanggang sa nakatakdang oras ng pagpasok.',
    };
  }
  if (normalized.includes('ALREADY_CHECKED_IN') || normalized.includes('ALREADY_USED') || normalized.includes('ALREADY BEEN CHECKED IN')) {
    return {
      kind: 'ALREADY_PROCESSED',
      title: 'Already Checked In',
      message: 'The server confirms that this pass has already been checked in.',
      speech: 'This visitor has already checked in.',
      filipinoSpeech: 'Naka-check-in na ang visitor na ito.',
    };
  }
  if (normalized.includes('NOT_CHECKED_IN') || normalized.includes('NOT CURRENTLY CHECKED IN') || normalized.includes('NO LONGER CHECKED IN')) {
    return {
      kind: 'ALREADY_PROCESSED',
      title: 'Not Checked In',
      message: 'The server confirms that this pass is not currently checked in.',
      speech: 'This pass is not currently checked in.',
      filipinoSpeech: 'Hindi kasalukuyang naka-check-in ang pass na ito.',
    };
  }
  if (normalized.includes('INVALID OR HAS EXPIRED')) {
    return {
      kind: 'INVALID',
      title: 'Invalid QR Code',
      message: 'This QR code is not recognized as a valid HIRNA visitor or reservation pass.',
      speech: 'Invalid QR code. Please try again.',
      filipinoSpeech: 'Hindi valid ang QR code. Pakisubukan muli.',
    };
  }
  if (normalized.includes('EXPIRED')) {
    return {
      kind: 'EXPIRED',
      title: 'Visitor Pass Expired',
      message: 'This visitor pass has expired. Please contact reception.',
      speech: 'This visitor pass has expired. Please contact reception.',
      filipinoSpeech: 'Nag-expire na ang visitor pass. Mangyaring makipag-ugnayan sa reception.',
    };
  }
  if (['REVOKED', 'UNAUTHORIZED', 'NOT_APPROVED', 'IDENTITY_NOT_CLEARED', 'CANCELLED', 'BLOCKED'].some((term) => normalized.includes(term))) {
    return {
      kind: 'ACCESS_DENIED',
      title: 'Access Denied',
      message: 'This pass is not authorized for entry. Please contact the Facilities Officer.',
      speech: 'Access denied. Please contact reception.',
      filipinoSpeech: 'Hindi pinahihintulutan ang pagpasok. Mangyaring makipag-ugnayan sa reception.',
    };
  }
  return {
    kind: 'INVALID',
    title: 'Invalid QR Code',
    message: 'This QR code is not recognized as a valid HIRNA visitor or reservation pass.',
    speech: 'Invalid QR code. Please try again.',
    filipinoSpeech: 'Hindi valid ang QR code. Pakisubukan muli.',
  };
}

export const missingTokenFeedback = (): QrResultFeedback => ({
  kind: 'INVALID',
  title: 'Invalid QR Code',
  message: 'No valid visitor or reservation pass token was found.',
  speech: 'Invalid QR code. Please try again.',
  filipinoSpeech: 'Hindi valid ang QR code. Pakisubukan muli.',
});
