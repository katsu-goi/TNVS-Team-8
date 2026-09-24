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
  <div className="flex h-28 w-28 items-center justify-center rounded-full border border-[var(--hirna-border)] bg-[var(--hirna-section)] shadow-[0_12px_40px_rgba(101,24,30,0.10)] sm:h-32 sm:w-32">
    <img
      src="/hirna-logo.png"
      alt=""
      aria-hidden="true"
      className="h-16 w-16 object-contain sm:h-20 sm:w-20"
      draggable={false}
    />
  </div>
);

export interface PortalLoadingStateProps {
  message?: string;
}

export const PortalLoadingState: React.FC<PortalLoadingStateProps> = ({
  message = 'Loading page',
}) => {
  const reducedMotion = useReducedMotion();

  return (
    <section
      className="relative flex min-h-[22rem] w-full items-center justify-center overflow-hidden rounded-card border border-[var(--hirna-border)] bg-[var(--hirna-surface)] px-5 py-8 text-center shadow-card sm:min-h-[26rem]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
    >
      <div aria-hidden="true" className="absolute -left-20 top-1/4 h-48 w-48 rounded-full bg-[#D02F34]/[0.06] blur-3xl" />
      <div aria-hidden="true" className="absolute -right-20 bottom-1/4 h-52 w-52 rounded-full bg-[#FFC629]/[0.06] blur-3xl" />
      <div className="relative flex flex-col items-center">
        <div className="flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44" aria-hidden="true">
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
        <div aria-hidden="true" className="mt-2 h-0.5 w-12 rounded-full bg-[#D02F34]" />
        <p className="mt-4 text-sm font-bold text-[var(--hirna-text)] sm:text-base">{message}</p>
        <p className="mt-1 text-xs text-[var(--hirna-text-muted)]">Please wait while the latest content is prepared.</p>
      </div>
    </section>
  );
};

export const SessionBootstrapPlaceholder: React.FC = () => (
  <div
    className="flex min-h-screen items-center justify-center bg-[var(--hirna-page)] px-6 text-center"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div>
      <img src="/hirna-logo.png" alt="Hirna" className="mx-auto h-16 w-16 object-contain" draggable={false} />
      <p className="mt-4 text-sm font-semibold text-[var(--hirna-text)]">Verifying secure session</p>
    </div>
  </div>
);

export const PortalInitializationError: React.FC<{
  message?: string;
  onRetry: () => void;
}> = ({ message = 'An unexpected problem interrupted portal initialization.', onRetry }) => (
  <div className="flex min-h-screen items-center justify-center bg-[var(--hirna-page)] px-5 py-8">
    <div className="w-full max-w-lg rounded-card border border-[var(--hirna-border)] bg-[var(--hirna-surface)] p-6 shadow-modal sm:p-8">
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
