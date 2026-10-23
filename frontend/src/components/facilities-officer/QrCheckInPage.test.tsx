import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { checkInPass, checkOutPass, scanVisitorPass } = vi.hoisted(() => ({ checkInPass: vi.fn(), checkOutPass: vi.fn(), scanVisitorPass: vi.fn() }));
const scanner = vi.hoisted(() => ({
  callback: undefined as undefined | ((result: { getText(): string } | undefined, error?: unknown) => void),
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
vi.mock('../../api/visitorService', () => ({
  visitorService: { scanVisitorPass },
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
    scanVisitorPass.mockReset();
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
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
    localStorage.clear();
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
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleName('Check-In Successful');
    expect(await screen.findByText('Pass checked in')).toBeInTheDocument();
  });

  it('routes visitor credentials to visitor validation without changing reservation passes', async () => {
    scanVisitorPass.mockResolvedValue({
      email: 'visitor@example.com', status: 'CHECKED_IN', actualArrival: '2026-10-21T02:00:00Z',
      purposeOfVisit: 'Meeting an Employee', expectedArrival: '2026-10-21T02:00:00Z',
      receivingDepartment: 'Operations', host: null,
    });
    render(<QrCheckInPage />);

    fireEvent.change(screen.getByLabelText('Guest pass URL or token'), {
      target: { value: 'https://hirna.example/visitor-pass/vst_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check in pass' }));

    await waitFor(() => expect(scanVisitorPass).toHaveBeenCalledWith('vst_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG', 'CHECK_IN'));
    expect(checkInPass).not.toHaveBeenCalled();
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
    expect(screen.getAllByText('Position the QR code inside the frame.').length).toBeGreaterThan(0);
    expect(scanner.possibleFormats).toEqual(['QR_CODE']);

    await act(async () => {
      scanner.callback?.({ getText: () => 'camera-token-123' });
      scanner.callback?.({ getText: () => 'camera-token-123' });
    });

    await waitFor(() => expect(checkInPass).toHaveBeenCalledWith('camera-token-123'));
    expect(checkInPass).toHaveBeenCalledTimes(1);
    expect(scanner.decodeFromVideoElement).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleName('Check-In Successful');
    expect(await screen.findByText('Pass checked in')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Scan Again' }));
    await waitFor(() => expect(scanner.decodeFromVideoElement).toHaveBeenCalledTimes(2));
    await act(async () => { scanner.callback?.({ getText: () => 'camera-token-123' }); });
    expect(checkInPass).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Stop camera' }));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(video?.srcObject).toBeNull();
    expect(screen.getAllByText('Camera is paused').length).toBeGreaterThan(0);
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

    expect(await screen.findByRole('alertdialog')).toHaveAccessibleName('Visitor Pass Expired');
    expect(screen.getByText('This visitor pass has expired. Please contact reception.')).toBeInTheDocument();
    expect(checkInPass).toHaveBeenCalledWith('expired-token');
  });

  it('shows feedback when an entry does not contain a guest-pass token', async () => {
    render(<QrCheckInPage />);

    fireEvent.change(screen.getByLabelText('Guest pass URL or token'), { target: { value: 'https://hirna.example/guest-pass/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in pass' }));

    expect(await screen.findByRole('alertdialog')).toHaveAccessibleName('Invalid QR Code');
    expect(screen.getByText('No valid visitor or reservation pass token was found.')).toBeInTheDocument();
    expect(checkInPass).not.toHaveBeenCalled();
  });

  it('maps a not-yet-valid backend decision to a paused warning modal', async () => {
    scanVisitorPass.mockRejectedValue({
      response: { status: 409, data: { errorCode: 'VISITOR_PASS_TOO_EARLY', message: 'This visitor pass is not valid yet.' } },
    });
    render(<QrCheckInPage />);

    fireEvent.change(screen.getByLabelText('Guest pass URL or token'), { target: { value: 'vst_scheduled-pass-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in pass' }));

    expect(await screen.findByRole('alertdialog')).toHaveAccessibleName('Visitor Pass Not Yet Valid');
    expect(screen.getByText('This pass cannot be used before its authorized entry time.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan Again' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Check in pass' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Check in pass' })).toBeEnabled();
  });

  it('announces a sanitized result only after voice guidance is enabled and honors mute', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    class MockUtterance {
      text: string;
      rate = 1;
      volume = 1;
      lang = '';
      voice: SpeechSynthesisVoice | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: MockUtterance });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel, getVoices: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    checkInPass.mockResolvedValue({
      inviteeEmail: 'private.person@example.com', checkedIn: true, checkedInAt: '2026-09-26T02:00:00Z',
      title: 'Private meeting', startTime: '2026-09-26T02:00:00Z', status: 'CONFIRMED', facilityName: 'Team 8 Hall',
    });
    render(<QrCheckInPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Enable Voice Guidance' }));
    expect(speak).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    fireEvent.change(screen.getByLabelText('Guest pass URL or token'), { target: { value: 'private-reservation-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in pass' }));
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleName('Check-In Successful');
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls.flat().map((item) => String((item as MockUtterance).text ?? item)).join(' ')).not.toContain('private.person@example.com');
    expect(speak.mock.calls.flat().map((item) => String((item as MockUtterance).text ?? item)).join(' ')).not.toContain('private-reservation-token');
  });

  it('cancels stale guidance and announces the backend outcome once without sensitive data', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    class MockUtterance {
      text: string;
      rate = 1;
      volume = 1;
      lang = '';
      voice: SpeechSynthesisVoice | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: MockUtterance });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel, getVoices: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    localStorage.setItem('hirna:qr-scanner-voice:v1', JSON.stringify({ enabled: true, muted: false, language: 'en-PH', voiceURI: '', rate: 1, volume: 1 }));
    scanVisitorPass.mockRejectedValue({
      response: { status: 409, data: { errorCode: 'VISITOR_PASS_TOO_EARLY', message: 'Internal schedule for private.person@example.com' } },
    });
    render(<QrCheckInPage />);

    fireEvent.change(screen.getByLabelText('Guest pass URL or token'), { target: { value: 'vst_private-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in pass' }));
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleName('Visitor Pass Not Yet Valid');

    const spoken = speak.mock.calls.map(([utterance]) => (utterance as MockUtterance).text);
    expect(spoken.at(-1)).toBe('Your visitor pass is not valid yet. Please wait until your scheduled entry time.');
    expect(spoken.join(' ')).not.toMatch(/private\.person|vst_private-token/i);
    expect(cancel.mock.calls.length).toBeGreaterThanOrEqual(speak.mock.calls.length);
  });

  it('keeps visual guidance available when browser speech synthesis is unsupported', () => {
    render(<QrCheckInPage />);
    expect(screen.getByText('Voice synthesis is unavailable in this browser. Visual guidance remains active.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable Voice Guidance' })).not.toBeInTheDocument();
  });
});
