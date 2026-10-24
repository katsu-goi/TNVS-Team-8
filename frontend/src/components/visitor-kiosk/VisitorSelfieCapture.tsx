import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, RotateCcw, UserRound } from 'lucide-react';
import { visitorCameraFailureMessage } from './VisitorIdScanner';

type Props = {
  image: string;
  authorized: boolean;
  onImageChange: (value: string) => void;
};

export const VisitorSelfieCapture: React.FC<Props> = ({ image, authorized, onImageChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setStarting(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    if (!authorized || active || starting) return;
    setStarting(true); setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('Selfie preview is unavailable.');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setActive(true);
    } catch (cause) {
      stop();
      setError(visitorCameraFailureMessage(cause));
    } finally { setStarting(false); }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const value = canvas.toDataURL('image/jpeg', 0.9);
    stop();
    onImageChange(value);
  };

  const retake = () => { onImageChange(''); void start(); };

  return <div className="mt-5">
    <div className="relative mx-auto aspect-video max-w-xl overflow-hidden rounded-2xl bg-slate-950">
      <video ref={videoRef} muted playsInline autoPlay aria-label="Selfie camera preview" className="h-full w-full object-cover" />
      {image && <img src={image} alt="Selfie awaiting secure comparison" className="absolute inset-0 h-full w-full object-cover" />}
      {!active && !image && !starting && <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300"><UserRound className="h-14 w-14" /><p className="mt-2 text-sm font-bold">Selfie camera is off</p></div>}
      {active && <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(2,6,23,.28)]" />}
      {starting && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 text-white"><Loader2 className="h-9 w-9 animate-spin" /></div>}
      {image && <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white"><Check className="mr-1 inline h-3.5 w-3.5" />Selfie captured</span>}
    </div>
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {!active && !image && <button type="button" disabled={!authorized || starting} onClick={() => void start()} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"><Camera className="h-4 w-4" />Start Camera</button>}
      {active && <button type="button" onClick={capture} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white"><Camera className="h-4 w-4" />Capture Selfie</button>}
      {image && <button type="button" onClick={retake} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold"><RotateCcw className="h-4 w-4" />Retake</button>}
    </div>
    {error && <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
  </div>;
};
