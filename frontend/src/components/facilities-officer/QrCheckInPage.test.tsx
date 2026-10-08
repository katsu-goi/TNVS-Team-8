import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { checkInPass, checkOutPass } = vi.hoisted(() => ({ checkInPass: vi.fn(), checkOutPass: vi.fn() }));
const scanner = vi.hoisted(() => ({
  callback: undefined as undefined | ((result: { getText(): string } | undefined) => void),
  decodeFromVideoElement: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn(function MockBrowserMultiFormatReader() {
    return { decodeFromVideoElement: scanner.decodeFromVideoElement };
  }),
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
  beforeEach(() => {
    checkInPass.mockReset();
    checkOutPass.mockReset();
    scanner.callback = undefined;
    scanner.stop.mockReset();
    scanner.decodeFromVideoElement.mockReset();
    scanner.decodeFromVideoElement.mockImplementation(async (_video, callback) => {
      scanner.callback = callback;
      return { stop: scanner.stop };
    });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

  it('requests a rear camera only after the user clicks and scans a real decoded value once', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    const track = { readyState: 'live', stop: vi.fn() };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, getSupportedConstraints: () => ({ facingMode: true }) },
    });
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    checkInPass.mockResolvedValue({
      inviteeEmail: 'camera@example.com', checkedIn: true, checkedInAt: '2026-09-26T02:00:00Z',
      title: 'Camera visit', startTime: '2026-09-26T02:00:00Z', status: 'CONFIRMED', facilityName: 'Team 8 Hall',
    });

    const { container } = render(<QrCheckInPage />);
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    expect(await screen.findByRole('button', { name: 'Stop camera' })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.srcObject).toBe(stream);
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(play).toHaveBeenCalled();
    expect(scanner.decodeFromVideoElement).toHaveBeenCalledWith(video, expect.any(Function));
    expect(screen.getByText('Camera active — scanning for a QR code')).toBeInTheDocument();

    await act(async () => {
      scanner.callback?.({ getText: () => 'camera-token-123' });
      scanner.callback?.({ getText: () => 'camera-token-123' });
    });

    await waitFor(() => expect(checkInPass).toHaveBeenCalledWith('camera-token-123'));
    expect(checkInPass).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Pass checked in')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop camera' }));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(video?.srcObject).toBeNull();
    expect(screen.getByText('Camera is paused')).toBeInTheDocument();
  });

  it('retries without facingMode when the browser rejects that constraint', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    const track = { readyState: 'live', stop: vi.fn() };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new DOMException('unsupported', 'OverconstrainedError'))
      .mockResolvedValueOnce(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, getSupportedConstraints: () => ({ facingMode: true }) },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

    const { unmount } = render(<QrCheckInPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    expect(await screen.findByRole('button', { name: 'Stop camera' })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: false, video: true });
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });
});
