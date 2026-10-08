import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { checkInPass, checkOutPass } = vi.hoisted(() => ({ checkInPass: vi.fn(), checkOutPass: vi.fn() }));
const scanner = vi.hoisted(() => ({
  callback: undefined as undefined | ((result: { getText(): string } | undefined) => void),
  decodeFromVideoElement: vi.fn(),
  possibleFormats: [] as unknown[],
  stop: vi.fn(),
}));

vi.mock('@zxing/browser', () => ({
  BarcodeFormat: { QR_CODE: 'QR_CODE' },
  BrowserMultiFormatReader: vi.fn(function MockBrowserMultiFormatReader() {
    return {
      decodeFromVideoElement: scanner.decodeFromVideoElement,
      set possibleFormats(formats: unknown[]) { scanner.possibleFormats = formats; },
    };
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
import { cameraFailureMessage, cameraRecoverySteps } from './qrCamera';

describe('QR check-in camera fallback', () => {
  beforeEach(() => {
    checkInPass.mockReset();
    checkOutPass.mockReset();
    scanner.callback = undefined;
    scanner.possibleFormats = [];
    scanner.stop.mockReset();
    scanner.decodeFromVideoElement.mockReset();
    scanner.decodeFromVideoElement.mockImplementation(async (_video, callback) => {
      scanner.callback = callback;
      return { stop: scanner.stop };
    });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('explains camera failures accurately by error type', () => {
    expect(cameraFailureMessage(new DOMException('blocked', 'SecurityError'), false)).toContain('requires HTTPS or localhost');
    expect(cameraFailureMessage(new DOMException('denied', 'NotAllowedError'), true)).toContain('denied or blocked');
    expect(cameraFailureMessage(new DOMException('policy', 'SecurityError'), true)).toContain('security context');
    expect(cameraFailureMessage(new DOMException('missing', 'NotFoundError'), true)).toContain('No camera was detected');
    expect(cameraFailureMessage(new DOMException('busy', 'NotReadableError'), true)).toContain('in use');
    expect(cameraFailureMessage(new DOMException('constraint', 'OverconstrainedError'), true)).toContain('selected camera');
    expect(cameraFailureMessage(new DOMException('unsupported', 'NotSupportedError'), true)).toContain('does not provide camera access');
  });

  it('provides browser-specific permission recovery steps', () => {
    expect(cameraRecoverySteps('Mozilla/5.0 Chrome/130.0')).toContain('In Chrome');
    expect(cameraRecoverySteps('Mozilla/5.0 Edg/130.0')).toContain('In Edge');
    expect(cameraRecoverySteps('Mozilla/5.0 Firefox/130.0')).toContain('In Firefox');
    expect(cameraRecoverySteps('Mozilla/5.0 Version/18.0 Safari/605.1.15')).toContain('In Safari');
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
      value: { getUserMedia, getSupportedConstraints: () => ({ facingMode: true }), enumerateDevices: vi.fn().mockResolvedValue([]) },
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
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.srcObject).toBe(stream);
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(play).toHaveBeenCalled();
    expect(scanner.decodeFromVideoElement).toHaveBeenCalledWith(video, expect.any(Function));
    expect(screen.getByText('Camera active — align the QR code inside the frame')).toBeInTheDocument();
    expect(scanner.possibleFormats).toEqual(['QR_CODE']);

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
      value: { getUserMedia, getSupportedConstraints: () => ({ facingMode: true }), enumerateDevices: vi.fn().mockResolvedValue([]) },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

    const { unmount } = render(<QrCheckInPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    expect(await screen.findByRole('button', { name: 'Stop camera' })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it('does not call getUserMedia when camera permission is already denied', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([]) },
    });

    render(<QrCheckInPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('denied or blocked');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByText('Camera troubleshooting')).toBeInTheDocument();
  });

  it('starts the camera selected in the device switcher', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    const track = { readyState: 'live', stop: vi.fn(), getSettings: () => ({ deviceId: 'rear-camera' }) };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const devices = [
      { deviceId: 'front-camera', kind: 'videoinput', label: 'Front Camera', groupId: '' },
      { deviceId: 'rear-camera', kind: 'videoinput', label: 'Rear Camera', groupId: '' },
    ] as MediaDeviceInfo[];
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue(devices),
        getSupportedConstraints: () => ({ facingMode: true }),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

    const { unmount } = render(<QrCheckInPage />);
    const selector = await screen.findByRole('combobox', { name: 'Camera device' });
    fireEvent.change(selector, { target: { value: 'rear-camera' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    expect(await screen.findByRole('button', { name: 'Stop camera' })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        deviceId: { exact: 'rear-camera' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it('surfaces an expired pass response without bypassing validation', async () => {
    checkInPass.mockRejectedValue({ response: { data: { message: 'This guest pass has expired.' } } });
    render(<QrCheckInPage />);

    fireEvent.change(screen.getByLabelText('Guest pass URL or token'), { target: { value: 'expired-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in pass' }));

    expect(await screen.findByText('This guest pass has expired.')).toBeInTheDocument();
    expect(checkInPass).toHaveBeenCalledWith('expired-token');
  });

  it('shows feedback when an entry does not contain a guest-pass token', async () => {
    render(<QrCheckInPage />);

    fireEvent.change(screen.getByLabelText('Guest pass URL or token'), { target: { value: 'https://hirna.example/guest-pass/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in pass' }));

    expect(await screen.findByText(/No guest-pass token was found/)).toBeInTheDocument();
    expect(checkInPass).not.toHaveBeenCalled();
  });
});
