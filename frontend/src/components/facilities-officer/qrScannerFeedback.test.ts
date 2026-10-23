import { describe, expect, it } from 'vitest';
import { failedQrFeedback, successfulQrFeedback } from './qrScannerFeedback';

const backendError = (errorCode: string, message: string, status = 409) => ({
  response: { status, data: { errorCode, message } },
});

describe('QR scanner result classification', () => {
  it('reports successful check-in and check-out separately', () => {
    expect(successfulQrFeedback('CHECK_IN')).toMatchObject({ kind: 'SUCCESS', title: 'Check-In Successful' });
    expect(successfulQrFeedback('CHECK_OUT')).toMatchObject({ kind: 'SUCCESS', title: 'Check-Out Successful' });
    expect(successfulQrFeedback('CHECK_IN', 'RESERVATION').speech).toBe('Reservation pass verified. Check-in successful.');
  });

  it.each([
    ['VISITOR_PASS_TOO_EARLY', 'This visitor pass is not valid yet.', 'NOT_YET_VALID', 'Visitor Pass Not Yet Valid'],
    ['VISITOR_PASS_EXPIRED', 'This visitor pass has expired.', 'EXPIRED', 'Visitor Pass Expired'],
    ['VISITOR_PASS_REVOKED', 'This visitor pass is not active.', 'ACCESS_DENIED', 'Access Denied'],
    ['VISITOR_NOT_APPROVED', 'This visitor request is not approved.', 'ACCESS_DENIED', 'Access Denied'],
    ['VISITOR_PASS_ALREADY_USED', 'This pass has already been checked in.', 'ALREADY_PROCESSED', 'Already Checked In'],
    ['VISITOR_NOT_CHECKED_IN', 'This visitor is not currently checked in.', 'ALREADY_PROCESSED', 'Not Checked In'],
    ['VISITOR_PASS_INVALID', 'This visitor pass is invalid.', 'INVALID', 'Invalid QR Code'],
  ])('maps %s without exposing the backend reason', (code, message, kind, title) => {
    expect(failedQrFeedback(backendError(code, message))).toMatchObject({ kind, title });
  });

  it('treats network and server failures as verification unavailable', () => {
    expect(failedQrFeedback(new Error('Network Error'))).toMatchObject({ kind: 'UNAVAILABLE', title: 'Verification Unavailable' });
    expect(failedQrFeedback(backendError('INTERNAL_ERROR', 'Internal error', 503))).toMatchObject({ kind: 'UNAVAILABLE' });
  });

  it('does not disclose confidential denial details in visual or spoken output', () => {
    const feedback = failedQrFeedback(backendError('VISITOR_BLOCKED', 'Watchlist match: confidential reason'));
    expect(`${feedback.message} ${feedback.speech}`).not.toMatch(/watchlist|confidential/i);
    expect(feedback.title).toBe('Access Denied');
  });
});
