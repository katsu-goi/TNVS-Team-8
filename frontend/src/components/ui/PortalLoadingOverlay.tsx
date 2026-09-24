import React, { lazy, Suspense, useEffect, useState } from 'react';
import loadingAnimationUrl from '../../assets/lottie/loading.json?url';
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

export interface PortalLoadingOverlayProps {
  message?: string;
}

export const PortalLoadingOverlay: React.FC<PortalLoadingOverlayProps> = ({
  message = 'Loading page…',
}) => {
  const reducedMotion = useReducedMotion();

  return (
    <section
      className="portal-loading-overlay absolute inset-0 z-10 flex min-h-full w-full items-center justify-center overflow-hidden px-5 py-8 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
    >
      <div className="flex flex-col items-center">
        <div
          className="flex h-[128px] w-[128px] items-center justify-center sm:h-[156px] sm:w-[156px] lg:h-[184px] lg:w-[184px]"
          aria-hidden="true"
          data-testid="portal-loading-animation"
        >
          <Suspense fallback={null}>
            <LazyDotLottie
              src={loadingAnimationUrl}
              autoplay={!reducedMotion}
              loop={!reducedMotion}
              className="h-full w-full"
            />
          </Suspense>
        </div>
        <p className="mt-3 text-sm font-bold text-[var(--hirna-text)] sm:text-base">{message}</p>
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
