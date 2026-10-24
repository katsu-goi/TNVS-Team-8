import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as detection from './idDocumentDetection';
import { VisitorIdScanner, visitorCameraFailureMessage } from './VisitorIdScanner';
import { screenIdentityDocument } from './visitorOcr';

vi.mock('./visitorOcr', () => ({
  clearOcrResultCache: vi.fn(),
  screenIdentityDocument: vi.fn().mockResolvedValue({
    ocrStatus: 'SUCCEEDED', classification: 'SUPPORTED_ID_TYPE', detectedIdType: 'Philippine Passport',
    extracted: { fullName: '', detectedIdType: 'Philippine Passport', idNumberLast4: '', expirationDate: '', issuingAuthority: '' },
    warnings: [], textQuality: 'HIGH',
  }),
}));

const scannerProps = {
  selectedIdType: 'Philippine Passport', acceptedIdTypes: ['Philippine Passport'], onScreeningChange: vi.fn(),
};

describe('VisitorIdScanner camera lifecycle', () => {
  const stop = vi.fn();
  const stream = {
    getTracks: () => [{ stop }],
    getVideoTracks: () => [{ readyState: 'live', getSettings: () => ({ deviceId: 'rear-camera' }) }],
  } as unknown as MediaStream;

  beforeEach(() => {
    stop.mockReset();
    vi.mocked(screenIdentityDocument).mockResolvedValue({
      ocrStatus: 'SUCCEEDED', classification: 'SUPPORTED_ID_TYPE', detectedIdType: 'Philippine Passport',
      extracted: { fullName: '', detectedIdType: 'Philippine Passport', idNumberLast4: '', expirationDate: '', issuingAuthority: '' },
      warnings: [], textQuality: 'HIGH', reason: 'CLASSIFIED',
    });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, get: () => HTMLMediaElement.HAVE_CURRENT_DATA });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1280 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 720 });
    Object.defineProperty(HTMLVideoElement.prototype, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(HTMLVideoElement.prototype, 'pause', { configurable: true, value: vi.fn() });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) } });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
        enumerateDevices: vi.fn().mockResolvedValue([{ deviceId: 'rear-camera', kind: 'videoinput', label: 'Rear camera', groupId: '' }]),
      },
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('mounts the video before requesting media, attaches the stream, and releases it on cleanup', async () => {
    const { unmount } = render(<VisitorIdScanner {...scannerProps} image="" confirmed={false} onImageChange={vi.fn()} />);
    const video = screen.getByLabelText('Live ID camera preview') as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use camera' }));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    await waitFor(() => expect(video.srcObject).toBe(stream));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
    });
    expect(await screen.findByRole('button', { name: 'Manual capture' })).toBeInTheDocument();
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('captures a valid current frame manually once and clears the camera stream', async () => {
    const onImageChange = vi.fn();
    vi.spyOn(detection, 'captureDocumentFrame').mockReturnValue('data:image/jpeg;base64,captured');
    render(<VisitorIdScanner {...scannerProps} image="" confirmed={false} onImageChange={onImageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use camera' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Manual capture' }));
    await waitFor(() => expect(onImageChange).toHaveBeenCalledWith('data:image/jpeg;base64,captured', false));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not request media when permission is already denied and offers retry/upload guidance', async () => {
    vi.mocked(navigator.permissions.query).mockResolvedValue({ state: 'denied' } as PermissionStatus);
    render(<VisitorIdScanner {...scannerProps} image="" confirmed={false} onImageChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use camera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission was denied/i);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retry camera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeInTheDocument();
  });

  it('uses the selected camera device and supports review, confirmation, and retake', async () => {
    const cameras = [
      { deviceId: 'front-camera', kind: 'videoinput', label: 'Front camera', groupId: '' },
      { deviceId: 'rear-camera', kind: 'videoinput', label: 'Rear camera', groupId: '' },
    ];
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue(cameras as MediaDeviceInfo[]);
    const Harness = () => {
      const [photo, setPhoto] = React.useState({ image: 'data:image/jpeg;base64,review', confirmed: false });
      return <VisitorIdScanner {...scannerProps} image={photo.image} confirmed={photo.confirmed} onImageChange={(image, confirmed) => setPhoto({ image, confirmed })} />;
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Use photo' }));
    expect(await screen.findByText(/Photo passed document-category screening/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retake photo' }));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    const selector = await screen.findByRole('combobox', { name: 'Camera device' });
    fireEvent.change(selector, { target: { value: 'front-camera' } });
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith({
      audio: false,
      video: expect.objectContaining({ deviceId: { exact: 'front-camera' } }),
    }));
  });

  it('shows precise recovery actions without accepting or uploading an inconclusive image', async () => {
    const onImageChange = vi.fn();
    const onScreeningChange = vi.fn();
    vi.spyOn(detection, 'captureDocumentFrame').mockReturnValue('data:image/jpeg;base64,blurred');
    vi.mocked(screenIdentityDocument).mockResolvedValue({
      ocrStatus: 'SUCCEEDED', classification: 'INCONCLUSIVE', detectedIdType: null,
      extracted: { fullName: '', detectedIdType: '', idNumberLast4: '', expirationDate: '', issuingAuthority: '' },
      warnings: ['The image is blurry. Hold your ID steady and retake it.'], textQuality: 'LOW', reason: 'IMAGE_BLURRY',
    });
    render(<VisitorIdScanner {...scannerProps} onScreeningChange={onScreeningChange} image="" confirmed={false} onImageChange={onImageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use camera' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Manual capture' }));
    expect(await screen.findByText(/image is blurry/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retake Photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan Another ID' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Request Manual Assistance' }));
    expect(screen.getByText(/registration has not been approved/i)).toBeInTheDocument();
    expect(onScreeningChange).toHaveBeenCalledWith(null);
    expect(onImageChange).toHaveBeenCalledWith('', false);
    expect(screen.queryByText(/captured successfully/i)).not.toBeInTheDocument();
  });
});

describe('visitorCameraFailureMessage', () => {
  it('distinguishes insecure, busy, unavailable, and unsupported cameras', () => {
    expect(visitorCameraFailureMessage(new DOMException('', 'SecurityError'), false)).toMatch(/HTTPS/i);
    expect(visitorCameraFailureMessage(new DOMException('', 'NotReadableError'), true)).toMatch(/already in use/i);
    expect(visitorCameraFailureMessage(new DOMException('', 'NotFoundError'), true)).toMatch(/No camera/i);
    expect(visitorCameraFailureMessage(new DOMException('', 'NotSupportedError'), true)).toMatch(/does not provide/i);
  });
});
