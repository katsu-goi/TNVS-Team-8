import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkInPass, checkOutPass } = vi.hoisted(() => ({ checkInPass: vi.fn(), checkOutPass: vi.fn() }));

vi.mock('@zxing/browser', () => ({ BrowserMultiFormatReader: vi.fn() }));
vi.mock('../../api/reservationPortalService', () => ({
  reservationPortalService: { checkInPass, checkOutPass },
}));
vi.mock('../../stores/realtimeSyncStore', () => ({
  useRealtimeSyncStore: (selector: (state: { revision: number }) => unknown) => selector({ revision: 0 }),
}));
vi.mock('../../stores/notificationRealtimeStore', () => ({
  useNotificationRealtimeStore: (selector: (state: { revision: number }) => unknown) => selector({ revision: 0 }),
}));

import { QrCheckInPage } from './FacilitiesOfficerPages';
import { cameraFailureMessage } from './qrCamera';

describe('QR check-in camera fallback', () => {
  beforeEach(() => {
    checkInPass.mockReset();
    checkOutPass.mockReset();
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  });

  it('explains insecure-context and permission failures accurately', () => {
    expect(cameraFailureMessage(new DOMException('blocked', 'SecurityError'), false)).toContain('requires HTTPS or localhost');
    expect(cameraFailureMessage(new DOMException('denied', 'NotAllowedError'), true)).toContain('permission was denied');
  });

  it('keeps manual token check-in usable when camera startup is blocked', async () => {
    checkInPass.mockResolvedValue({
      inviteeEmail: 'guest@example.com', checkedIn: true, checkedInAt: '2026-09-26T02:00:00Z',
      title: 'Safety briefing', startTime: '2026-09-26T02:00:00Z', status: 'CONFIRMED', facilityName: 'Team 8 Hall',
    });
    render(<QrCheckInPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('requires HTTPS or localhost');
    expect(screen.getByRole('heading', { name: 'Manual Token Entry' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Guest pass URL or token'), { target: { value: 'guest-token-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in pass' }));

    await waitFor(() => expect(checkInPass).toHaveBeenCalledWith('guest-token-123'));
    expect(await screen.findByText('Pass checked in')).toBeInTheDocument();
  });
});
