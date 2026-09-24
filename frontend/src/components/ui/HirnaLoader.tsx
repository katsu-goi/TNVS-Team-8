import React, { lazy, Suspense, useEffect, useState } from 'react';
import hirnaLoadingUrl from '../../assets/animations/hirna-loading.json?url';
import { ErrorState } from './SharedUI';

const LazyDotLottie = lazy(() =>
  import('@lottiefiles/dotlottie-react').then(({ DotLottieReact }) => ({
    default: DotLottieReact,
  })),
);

function getReducedMotionPreference(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(getReducedMotionPreference);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(query.matches);
    updatePreference();
    query.addEventListener?.('change', updatePreference);
    return () => query.removeEventListener?.('change', updatePreference);
  }, []);

  return reducedMotion;
}

const StaticLoaderMark: React.FC = () => (
  <div className="flex h-32 w-32 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] shadow-[0_0_60px_rgba(208,47,52,0.16)] sm:h-40 sm:w-40">
    <img
      src="/hirna-logo.png"
      alt=""
      aria-hidden="true"
      className="h-20 w-20 object-contain sm:h-24 sm:w-24"
      draggable={false}
    />
  </div>
);

export interface HirnaLoaderProps {
  title?: string;
  subtitle?: string;
  fullscreen?: boolean;
}

export const HirnaLoader: React.FC<HirnaLoaderProps> = ({
  title = 'Loading Hirna Portal...',
  subtitle = 'Preparing your workspace',
  fullscreen = true,
}) => {
  const reducedMotion = useReducedMotion();

  return (
    <div
      className={`${fullscreen ? 'fixed inset-0 z-[100]' : 'min-h-[28rem] w-full'} flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(208,47,52,0.26),_transparent_42%),linear-gradient(145deg,#07101f_0%,#111827_48%,#050912_100%)] px-5 py-8 text-white`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
    >
      <div aria-hidden="true" className="absolute -left-24 top-1/4 h-64 w-64 rounded-full bg-[#D02F34]/10 blur-3xl" />
      <div aria-hidden="true" className="absolute -right-28 bottom-1/4 h-72 w-72 rounded-full bg-[#FFC629]/[0.07] blur-3xl" />

      <div className="relative flex w-full max-w-md flex-col items-center rounded-[2rem] border border-white/10 bg-slate-950/45 px-6 py-8 text-center shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-10 sm:py-10">
        <div className="mb-4 flex items-center gap-3">
          <img src="/hirna-logo.png" alt="Hirna" className="h-11 w-11 object-contain" draggable={false} />
          <div className="text-left">
            <p className="text-lg font-extrabold tracking-tight text-white">Hirna Portal</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#FFC629]">Enterprise</p>
          </div>
        </div>

        <div className="mb-3 flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52" aria-hidden="true">
          {reducedMotion ? (
            <StaticLoaderMark />
          ) : (
            <Suspense fallback={<StaticLoaderMark />}>
              <LazyDotLottie
                src={hirnaLoadingUrl}
                autoplay
                loop
                className="h-full w-full"
              />
            </Suspense>
          )}
        </div>

        <div aria-hidden="true" className="mb-5 h-0.5 w-16 rounded-full bg-[#D02F34] shadow-[0_0_18px_rgba(208,47,52,0.75)]" />
        <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">{title}</h1>
        <p className="mt-2 text-sm font-medium text-slate-300">{subtitle}</p>
      </div>
    </div>
  );
};

export const HirnaInitializationError: React.FC<{
  message?: string;
  onRetry: () => void;
}> = ({ message = 'An unexpected problem interrupted portal initialization.', onRetry }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(208,47,52,0.22),_transparent_45%),linear-gradient(145deg,#07101f,#101827_52%,#050912)] px-5 py-8">
    <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-white/[0.97] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.5)] sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <img src="/hirna-logo.png" alt="Hirna" className="h-11 w-11 object-contain" draggable={false} />
        <div>
          <p className="font-extrabold text-slate-950">Hirna Portal</p>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#B5121B]">Initialization</p>
        </div>
      </div>
      <ErrorState
        title="Unable to load Hirna Portal"
        message={message}
        onRetry={onRetry}
        retryLabel="Try Again"
      />
    </div>
  </div>
);
