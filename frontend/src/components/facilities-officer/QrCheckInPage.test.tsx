import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  checkInPass, checkOutPass, decodeFromStream, scannerStop, getUserMedia, trackStop,
} = vi.hoisted(() => ({
  checkInPass: vi.fn(),
  checkOutPass: vi.fn(),
  decodeFromStream: vi.fn(),
  scannerStop: vi.fn(),
  getUserMedia: vi.fn(),
  trackStop: vi.fn(),
}));

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class MockBrowserMultiFormatReader {
    decodeFromStream = decodeFromStream;
  },
}));
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
  afterEach(cleanup);

  beforeEach(() => {
    checkInPass.mockReset();
    checkOutPass.mockReset();
    decodeFromStream.mockReset();
    scannerStop.mockReset();
    getUserMedia.mockReset();
    trackStop.mockReset();
    decodeFromStream.mockResolvedValue({ stop: scannerStop });
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  });

  it('explains insecure-context and permission failures accurately', () => {
    expect(cameraFailureMessage(new DOMException('blocked', 'SecurityError'), false)).toContain('requires HTTPS or localhost');
    expect(cameraFailureMessage(new DOMException('denied', 'NotAllowedError'), true)).toBe(
      "Camera access is blocked. Enable camera permission in your browser's Site Settings or use Manual Token Entry.",
    );
  });

  it('requests the environment camera from a user action and initializes ZXing from that stream', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    const { unmount } = render(<QrCheckInPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
    }));
    expect(decodeFromStream).toHaveBeenCalledWith(
      expect.objectContaining({ getTracks: expect.any(Function) }),
      expect.any(HTMLVideoElement),
      expect.any(Function),
    );
    expect(await screen.findByRole('button', { name: 'Stop camera' })).toBeInTheDocument();

    unmount();
    expect(scannerStop).toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
  });

  it('shows the browser Site Settings guidance when permission is denied', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    getUserMedia.mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    render(<QrCheckInPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Camera access is blocked. Enable camera permission in your browser's Site Settings or use Manual Token Entry.",
    );
    expect(screen.getByText('denied')).toBeInTheDocument();
  });

  it('keeps manual token check-in usable when camera startup is blocked', async () => {
    checkInPass.mockResolvedValue({
      inviteeEmail: 'guest@example.com', checkedIn: true, checkedInAt: '2026-09-26T02:00:00Z',
      title: 'Safety briefing', startTime: '2026-09-26T02:00:00Z', status: 'CONFIRMED', facilityName: 'Team 8 Hall',
    });
    render(<QrCheckInPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('requires HTTPS or localhost');
    expect(screen.getByRole('heading', { name: 'Manual Token Entry' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Guest pass URL or token'), { target: { value: 'guest-token-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in pass' }));

    await waitFor(() => expect(checkInPass).toHaveBeenCalledWith('guest-token-123'));
    expect(await screen.findByText('Pass checked in')).toBeInTheDocument();
  });
});
