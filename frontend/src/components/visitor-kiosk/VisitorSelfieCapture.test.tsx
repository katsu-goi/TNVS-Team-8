import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisitorSelfieCapture } from './VisitorSelfieCapture';

describe('VisitorSelfieCapture privacy gate', () => {
  const stop = vi.fn();
  const getUserMedia = vi.fn();

  beforeEach(() => {
    stop.mockReset(); getUserMedia.mockReset();
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    Object.defineProperty(HTMLVideoElement.prototype, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1280 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 720 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,selfie');
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('does not activate the camera before separate authorization', () => {
    render(<VisitorSelfieCapture image="" authorized={false} onImageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Start Camera' })).toBeDisabled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('captures only after authorization and releases the camera immediately', async () => {
    const onImageChange = vi.fn();
    render(<VisitorSelfieCapture image="" authorized onImageChange={onImageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false })));
    fireEvent.click(await screen.findByRole('button', { name: 'Capture Selfie' }));
    expect(onImageChange).toHaveBeenCalledWith('data:image/jpeg;base64,selfie');
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
