import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, ImageUp, Loader2, RefreshCw, RotateCcw, ScanLine, SwitchCamera } from 'lucide-react';
import {
  advanceAutoCapture,
  analyzeDocumentFrame,
  captureDocumentFrame,
  guideRect,
  type AutoCaptureState,
  type DocumentFrameAnalysis,
  type ScanGuideState,
} from './idDocumentDetection';
import { clearOcrResultCache, screenIdentityDocument } from './visitorOcr';
import type { DocumentScreeningResult } from './visitorDocumentScreening';

type Props = {
  image: string;
  confirmed: boolean;
  selectedIdType: string;
  acceptedIdTypes: string[];
  onImageChange: (image: string, confirmed: boolean) => void;
  onScreeningChange: (result: DocumentScreeningResult | null) => void;
};

const initialAutoCapture: AutoCaptureState = { stableSince: null, progress: 0, captured: false, lastQuad: null };
const ANALYSIS_INTERVAL_MS = 180;

function cameraErrorName(error: unknown): string {
  return typeof error === 'object' && error && 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';
}

export function visitorCameraFailureMessage(error: unknown, secureContext = window.isSecureContext): string {
  if (!secureContext) return 'Camera access requires HTTPS or localhost. Open the kiosk directly in a secure tab, or upload a clear ID photo.';
  const name = cameraErrorName(error);
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Camera permission was denied or blocked. Allow camera access in this site’s browser settings, then select Retry camera. You can also upload a photo.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No camera was detected. Connect or enable a camera, then retry, or upload a photo.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'The camera is already in use or blocked by the operating system. Close other camera apps or tabs, then retry.';
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') return 'The selected camera does not support the requested settings. Choose another camera or use Automatic camera.';
  if (name === 'SecurityError') return 'This page or its parent frame blocks camera access. Open the kiosk directly in a top-level HTTPS tab.';
  if (name === 'NotSupportedError') return 'This browser does not provide camera access. Update the browser or upload a clear photo.';
  if (name === 'AbortError') return 'Camera startup was interrupted. Wait a moment, then retry.';
  return error instanceof Error && error.message ? error.message : 'The camera could not be started. Retry or upload a clear photo.';
}

export async function validateIdImageFile(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPEG, PNG, or WebP image.');
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error('The image must be no larger than 5 MB.');
  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (Math.max(bitmap.width, bitmap.height) < 640 || Math.min(bitmap.width, bitmap.height) < 400) {
        bitmap.close(); throw new Error('The ID image is too small. Use an image at least 640 × 400 pixels.');
      }
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      if (!context) { bitmap.close(); return originalDataUrl; }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      let normalized = canvas.toDataURL('image/jpeg', 0.94);
      if (normalized.length * 0.75 > 5 * 1024 * 1024) normalized = canvas.toDataURL('image/jpeg', 0.88);
      return normalized;
    } catch (orientationError) {
      if (orientationError instanceof Error && orientationError.message.includes('too small')) throw orientationError;
      // Older browsers fall back to normal image decoding below.
    }
  }
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => Math.max(image.naturalWidth, image.naturalHeight) >= 640 && Math.min(image.naturalWidth, image.naturalHeight) >= 400
      ? resolve()
      : reject(new Error('The ID image is too small. Use an image at least 640 × 400 pixels.'));
    image.onerror = () => reject(new Error('The selected file is not a readable image.'));
    image.src = originalDataUrl;
  });
  return originalDataUrl;
}

async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput'); }
  catch { return []; }
}

async function waitForUsableFrame(video: HTMLVideoElement): Promise<void> {
  const usable = () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    && Math.max(video.videoWidth, video.videoHeight) >= 640
    && Math.min(video.videoWidth, video.videoHeight) >= 400;
  if (usable()) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('The camera started but did not provide a usable video frame.')), 8000);
    const check = () => {
      if (usable()) finish();
    };
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', check); video.removeEventListener('canplay', check); video.removeEventListener('resize', check);
      if (error) reject(error); else resolve();
    };
    video.addEventListener('loadedmetadata', check); video.addEventListener('canplay', check); video.addEventListener('resize', check);
    check();
  });
}

const guideColors: Record<ScanGuideState, { border: string; glow: string; text: string; polygon: string }> = {
  red: { border: 'border-rose-500', glow: 'shadow-[0_0_30px_rgba(244,63,94,.28)]', text: 'text-rose-100', polygon: '#fb7185' },
  yellow: { border: 'border-amber-400', glow: 'shadow-[0_0_30px_rgba(251,191,36,.3)]', text: 'text-amber-100', polygon: '#fbbf24' },
  green: { border: 'border-emerald-400', glow: 'shadow-[0_0_34px_rgba(52,211,153,.35)]', text: 'text-emerald-100', polygon: '#34d399' },
};

export const VisitorIdScanner: React.FC<Props> = ({ image, confirmed, selectedIdType, acceptedIdTypes, onImageChange, onScreeningChange }) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const captureLockRef = useRef(false);
  const restartAfterClearRef = useRef(false);
  const lastAnalysisAtRef = useRef(0);
  const analysisRef = useRef<DocumentFrameAnalysis | null>(null);
  const autoCaptureRef = useRef<AutoCaptureState>(initialAutoCapture);
  const fileRef = useRef<HTMLInputElement>(null);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [analysis, setAnalysis] = useState<DocumentFrameAnalysis | null>(null);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [candidateImage, setCandidateImage] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [screeningResult, setScreeningResult] = useState<DocumentScreeningResult | null>(null);
  const [videoLayout, setVideoLayout] = useState<{ left: number; top: number; width: number; height: number; guide: { left: number; top: number; width: number; height: number } } | null>(null);

  const updateVideoLayout = useCallback(() => {
    const preview = previewRef.current;
    const video = videoRef.current;
    if (!preview || !video?.videoWidth || !video.videoHeight) return;
    const bounds = preview.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const scale = Math.min(bounds.width / video.videoWidth, bounds.height / video.videoHeight);
    const width = video.videoWidth * scale; const height = video.videoHeight * scale;
    const left = (bounds.width - width) / 2; const top = (bounds.height - height) / 2;
    const sourceGuide = guideRect(video.videoWidth, video.videoHeight);
    setVideoLayout({
      left, top, width, height,
      guide: {
        left: left + sourceGuide.x * scale, top: top + sourceGuide.y * scale,
        width: sourceGuide.width * scale, height: sourceGuide.height * scale,
      },
    });
  }, []);

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    activeRef.current = false;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) { try { video.pause(); } catch { /* no-op for browsers without pause */ } video.srcObject = null; }
    setActive(false); setStarting(false); setCapturing(false); setCaptureProgress(0);
  }, []);

  const processCandidate = useCallback(async (dataUrl: string) => {
    if (!selectedIdType) {
      captureLockRef.current = false;
      setCapturing(false);
      setError('Select the ID type before capturing or uploading a document.');
      return;
    }
    stopCamera();
    setCapturing(true);
    setCandidateImage(dataUrl);
    setOcrProgress(0);
    setScreeningResult(null);
    const result = await screenIdentityDocument(dataUrl, selectedIdType, acceptedIdTypes, ({ progress }) => {
      setOcrProgress(Math.max(0, Math.min(1, progress)));
    });
    setCapturing(false);
    setScreeningResult(result);
    if (result.classification === 'SUPPORTED_ID_TYPE') {
      onScreeningChange(result);
      onImageChange(dataUrl, false);
      setCandidateImage('');
      return;
    }
    // Rejected candidates are discarded before they can enter the registration payload.
    setCandidateImage('');
    onScreeningChange(null);
    onImageChange('', false);
  }, [acceptedIdTypes, onImageChange, onScreeningChange, selectedIdType, stopCamera]);

  const saveCurrentFrame = useCallback((source: 'automatic' | 'manual', frameAnalysis = analysisRef.current) => {
    if (captureLockRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    captureLockRef.current = true;
    setCapturing(true); setError('');
    const dataUrl = captureDocumentFrame(video, source === 'automatic' ? frameAnalysis : frameAnalysis?.detected ? frameAnalysis : null);
    if (!dataUrl) {
      captureLockRef.current = false; setCapturing(false);
      setError('The camera has not produced a complete image yet. Hold the ID steady, then retry.');
      return;
    }
    void processCandidate(dataUrl);
  }, [processCandidate]);

  const runAnalysis = useCallback((timestamp: number) => {
    if (!activeRef.current) return;
    animationRef.current = requestAnimationFrame(runAnalysis);
    if (timestamp - lastAnalysisAtRef.current < ANALYSIS_INTERVAL_MS || captureLockRef.current) return;
    lastAnalysisAtRef.current = timestamp;
    const video = videoRef.current;
    const canvas = analysisCanvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
    const analysisWidth = 320;
    const analysisHeight = Math.max(180, Math.round(analysisWidth * video.videoHeight / video.videoWidth));
    canvas.width = analysisWidth; canvas.height = analysisHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, analysisWidth, analysisHeight);
    const frame = context.getImageData(0, 0, analysisWidth, analysisHeight);
    const nextAnalysis = analyzeDocumentFrame(frame, analysisRef.current?.signature);
    analysisRef.current = nextAnalysis; setAnalysis(nextAnalysis);
    const nextAuto = advanceAutoCapture(autoCaptureRef.current, nextAnalysis, timestamp);
    autoCaptureRef.current = nextAuto; setCaptureProgress(nextAuto.progress);
    if (nextAuto.captured && !captureLockRef.current) saveCurrentFrame('automatic', nextAnalysis);
  }, [saveCurrentFrame]);

  const startCamera = useCallback(async (deviceId = selectedDeviceId) => {
    if (starting || activeRef.current || image) return;
    setStarting(true); setError(''); setAnalysis(null); setCaptureProgress(0);
    analysisRef.current = null; autoCaptureRef.current = initialAutoCapture; captureLockRef.current = false;
    const session = sessionRef.current + 1; sessionRef.current = session;
    try {
      if (!window.isSecureContext) throw new DOMException('Camera access requires HTTPS.', 'SecurityError');
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Camera API unavailable.', 'NotSupportedError');
      if (navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (permission.state === 'denied') throw new DOMException('Camera permission denied.', 'NotAllowedError');
        } catch (permissionError) {
          if (cameraErrorName(permissionError) === 'NotAllowedError') throw permissionError;
        }
      }
      const videoSize = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      const preferred: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, ...videoSize }
        : { facingMode: { ideal: 'environment' }, ...videoSize };
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: preferred }); }
      catch (preferredError) {
        const name = cameraErrorName(preferredError);
        if (deviceId || (!(preferredError instanceof TypeError) && !['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(name))) throw preferredError;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoSize });
      }
      if (sessionRef.current !== session) { stream.getTracks().forEach((track) => track.stop()); return; }
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach((track) => track.stop()); throw new Error('Camera preview is not available.'); }
      streamRef.current = stream; video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      track?.addEventListener?.('ended', () => {
        if (sessionRef.current !== session) return;
        stopCamera(); setError('The camera stream stopped unexpectedly. Reconnect the camera or select Retry camera.');
      }, { once: true });
      await video.play(); await waitForUsableFrame(video);
      if (sessionRef.current !== session) return;
      activeRef.current = true; setActive(true); setStarting(false);
      requestAnimationFrame(updateVideoLayout);
      animationRef.current = requestAnimationFrame(runAnalysis);
      void listCameras().then((available) => {
        if (sessionRef.current !== session) return;
        setDevices(available);
        const activeId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
        if (!deviceId && activeId && available.some((camera) => camera.deviceId === activeId)) setSelectedDeviceId(activeId);
      });
    } catch (cameraError) {
      stopCamera(); setError(visitorCameraFailureMessage(cameraError));
    } finally { setStarting(false); }
  }, [image, runAnalysis, selectedDeviceId, starting, stopCamera, updateVideoLayout]);

  const switchCamera = (deviceId: string) => {
    const wasActive = activeRef.current;
    setSelectedDeviceId(deviceId); stopCamera();
    if (wasActive) window.setTimeout(() => void startCamera(deviceId), 0);
  };

  const retake = () => {
    restartAfterClearRef.current = true;
    clearOcrResultCache(); onScreeningChange(null); onImageChange('', false); captureLockRef.current = false; autoCaptureRef.current = initialAutoCapture;
    setCandidateImage(''); setScreeningResult(null); setOcrProgress(0);
    setAnalysis(null); analysisRef.current = null; setCaptureProgress(0); setError('');
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      const dataUrl = await validateIdImageFile(file);
      captureLockRef.current = true;
      setCapturing(true);
      await processCandidate(dataUrl);
    }
    catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'The image is invalid.'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  useEffect(() => { void listCameras().then(setDevices); return () => stopCamera(); }, [stopCamera]);
  useEffect(() => {
    if (!active) return undefined;
    updateVideoLayout();
    const preview = previewRef.current;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateVideoLayout);
    if (preview) observer?.observe(preview);
    window.addEventListener('resize', updateVideoLayout);
    return () => { observer?.disconnect(); window.removeEventListener('resize', updateVideoLayout); };
  }, [active, updateVideoLayout]);
  useEffect(() => {
    if (!image && restartAfterClearRef.current) {
      restartAfterClearRef.current = false;
      void startCamera(selectedDeviceId);
    }
  }, [image, selectedDeviceId, startCamera]);

  const state: ScanGuideState = analysis?.state ?? 'red';
  const colors = guideColors[state];
  const instruction = capturing ? 'Capturing ID…' : analysis?.instruction ?? (active ? 'Position your ID inside the frame' : 'Start the camera or upload a clear photo');
  const polygon = analysis?.quad?.map((point) => `${point.x * 100},${point.y * 100}`).join(' ');

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-wide text-slate-600">ID camera</p><p className="mt-1 text-xs text-slate-500">Detection checks document edges and image quality only. It does not authenticate the ID.</p></div>
        {devices.length > 1 && <label className="text-xs font-bold text-slate-600">Camera<select aria-label="Camera device" className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs" value={selectedDeviceId} onChange={(event) => switchCamera(event.target.value)} disabled={starting}><option value="">Automatic rear camera</option>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>}
      </div>

      <div ref={previewRef} className="relative aspect-video min-h-72 overflow-hidden rounded-2xl bg-slate-950 shadow-inner">
        <video ref={videoRef} autoPlay muted playsInline aria-label="Live ID camera preview" className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${active || starting ? 'opacity-100' : 'opacity-0'}`} />
        <canvas ref={analysisCanvasRef} className="hidden" aria-hidden="true" />
        {(image || candidateImage) && <img src={image || candidateImage} alt="Captured ID preview" className="absolute inset-0 h-full w-full bg-slate-950 object-contain" />}

        {!image && active && <>
          <div className={`pointer-events-none absolute rounded-[1.25rem] border-2 ${colors.border} ${colors.glow} transition-colors duration-200`} style={videoLayout ? { left: videoLayout.guide.left, top: videoLayout.guide.top, width: videoLayout.guide.width, height: videoLayout.guide.height, boxShadow: '0 0 0 9999px rgba(2,6,23,.55)' } : { left: '19.65%', top: '16%', width: '60.7%', height: '68%', boxShadow: '0 0 0 9999px rgba(2,6,23,.55)' }}>
            {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'].map((classes) => <span key={classes} className={`absolute h-9 w-9 ${classes} ${colors.border}`} />)}
            <span className="absolute inset-x-5 top-1/2 h-px animate-pulse bg-white/35" />
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute" style={videoLayout ? { left: videoLayout.left, top: videoLayout.top, width: videoLayout.width, height: videoLayout.height } : { inset: 0, width: '100%', height: '100%' }} aria-hidden="true">{polygon && <polygon points={polygon} fill="none" stroke={colors.polygon} strokeWidth="0.65" strokeDasharray="2 1" vectorEffect="non-scaling-stroke" />}</svg>
          <div className="absolute inset-x-4 bottom-4 flex justify-center"><div className={`max-w-md rounded-full bg-slate-950/80 px-4 py-2 text-center text-sm font-bold backdrop-blur ${colors.text}`} aria-live="polite">{instruction}</div></div>
          {state === 'green' && <div className="absolute inset-x-[18%] bottom-1 h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full bg-emerald-400 transition-[width] duration-150" style={{ width: `${Math.round(captureProgress * 100)}%` }} /></div>}
        </>}

        {!image && !active && !starting && <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-slate-300"><ScanLine className="h-12 w-12" /><p className="mt-3 text-sm font-bold">Camera preview appears here</p><p className="mt-1 max-w-sm text-xs text-slate-400">The camera starts only when you choose it. A photo upload remains available.</p></div>}
        {starting && <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/65 text-white"><Loader2 className="h-9 w-9 animate-spin" /><p className="mt-3 text-sm font-bold">Starting camera…</p></div>}
        {capturing && <div className="absolute inset-0 flex items-center justify-center bg-white/90 text-slate-950"><div className="w-64 text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-red-700" /><p className="mt-2 text-sm font-black">Checking document type with OCR…</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-red-700 transition-[width]" style={{ width: `${Math.round(ocrProgress * 100)}%` }} /></div><p className="mt-2 text-xs text-slate-600">The image remains in this browser while it is screened.</p></div></div>}
        {image && <div className="absolute left-4 top-4 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="mr-1 inline h-3.5 w-3.5" />ID captured successfully</div>}
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
      <div className="mt-3 flex flex-wrap gap-2">
        {image ? <>
          {!confirmed && <button type="button" onClick={() => onImageChange(image, true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"><Check className="h-4 w-4" />Use photo</button>}
          <button type="button" onClick={retake} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold"><RotateCcw className="h-4 w-4" />Retake photo</button>
        </> : active ? <>
          <button type="button" onClick={() => saveCurrentFrame('manual')} disabled={capturing} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Camera className="h-4 w-4" />Manual capture</button>
          <button type="button" onClick={stopCamera} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold"><RefreshCw className="h-4 w-4" />Stop camera</button>
        </> : <button type="button" disabled={starting} onClick={() => void startCamera()} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : error ? <RefreshCw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}{error ? 'Retry camera' : 'Use camera'}</button>}
        {!image && <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold"><ImageUp className="h-4 w-4" />Upload photo</button>}
        {active && devices.length > 1 && <button type="button" onClick={() => { const current = devices.findIndex((device) => device.deviceId === selectedDeviceId); switchCamera(devices[(current + 1) % devices.length]?.deviceId ?? ''); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold"><SwitchCamera className="h-4 w-4" />Switch camera</button>}
      </div>
      {screeningResult && screeningResult.classification !== 'SUPPORTED_ID_TYPE' && <div role="alertdialog" aria-modal="true" className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-black">{screeningResult.classification === 'PAYMENT_CARD_DETECTED' ? 'Unsupported Document Detected' : screeningResult.classification === 'UNSUPPORTED_DOCUMENT' ? 'Unsupported document' : 'Document screening inconclusive'}</p><p className="mt-1">{screeningResult.classification === 'PAYMENT_CARD_DETECTED' ? 'This appears to be a payment card, not an accepted identification document. Please present an approved ID. The image and OCR output were discarded.' : screeningResult.warnings[0]}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={retake} className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white">Scan Another ID</button><span className="self-center text-xs font-semibold">Or ask staff for the approved manual verification alternative.</span></div></div>}
      {confirmed && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Photo passed document-category screening and is selected for secure submission. This does not prove authenticity or identity.</p>}
      {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
    </div>
  );
};
