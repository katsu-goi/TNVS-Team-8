import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import Lottie from 'lottie-react';
import loadingAnimation from '../../assets/lottie/loading.json';
import { ErrorState } from './SharedUI';

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

type LoadingToken = symbol;

type PortalLoadingContextValue = {
  active: boolean;
  message: string;
  request: (token: LoadingToken, message: string) => void;
  release: (token: LoadingToken) => void;
};

const PortalLoadingContext = createContext<PortalLoadingContextValue | null>(null);
const DISPLAY_THRESHOLD_MS = 150;
const MINIMUM_VISIBLE_MS = 180;
const SAFETY_TIMEOUT_MS = 30000;

const PortalLoadingVisual: React.FC<PortalLoadingOverlayProps & { visible?: boolean }> = ({
  message = 'Loading content...',
  visible = true,
}) => {
  const reducedMotion = useReducedMotion();

  return (
    <section
      className={`portal-loading-overlay fixed inset-0 z-[110] flex min-h-dvh w-full items-center justify-center overflow-hidden px-5 py-8 text-center transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
      data-visible={visible ? 'true' : 'false'}
    >
      <div className="flex flex-col items-center">
        <div
          className="flex h-[112px] w-[112px] items-center justify-center sm:h-[128px] sm:w-[128px] lg:h-[148px] lg:w-[148px]"
          style={{ minWidth: 112, minHeight: 112 }}
          aria-hidden="true"
          data-testid="portal-loading-animation"
        >
          <Lottie
            animationData={loadingAnimation}
            autoplay={!reducedMotion}
            loop={!reducedMotion}
            className="h-full w-full"
            rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
          />
        </div>
        <p className="mt-3 text-sm font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.65)] sm:text-base">{message}</p>
      </div>
    </section>
  );
};

export const PortalLoadingProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [requests, setRequests] = useState<Map<LoadingToken, string>>(() => new Map());
  const [visible, setVisible] = useState(false);
  const visibleSince = useRef(0);
  const active = requests.size > 0;
  const message = Array.from(requests.values()).at(-1) ?? 'Loading content...';

  const request = useCallback((token: LoadingToken, nextMessage: string) => {
    setRequests((current) => {
      const next = new Map(current);
      next.delete(token);
      next.set(token, nextMessage);
      return next;
    });
  }, []);

  const release = useCallback((token: LoadingToken) => {
    setRequests((current) => {
      if (!current.has(token)) return current;
      const next = new Map(current);
      next.delete(token);
      return next;
    });
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    if (active && !visible) {
      timer = window.setTimeout(() => {
        visibleSince.current = Date.now();
        setVisible(true);
      }, DISPLAY_THRESHOLD_MS);
    } else if (!active && visible) {
      const remaining = Math.max(0, MINIMUM_VISIBLE_MS - (Date.now() - visibleSince.current));
      timer = window.setTimeout(() => setVisible(false), remaining);
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active, visible]);

  useEffect(() => {
    if (!active) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    const timeout = window.setTimeout(() => setRequests(new Map()), SAFETY_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [active]);

  const value = useMemo<PortalLoadingContextValue>(() => ({
    active, message, request, release,
  }), [active, message, release, request]);

  return (
    <PortalLoadingContext.Provider value={value}>
      {children}
      {(active || visible) && <PortalLoadingVisual message={message} visible={visible} />}
    </PortalLoadingContext.Provider>
  );
};

// The controller intentionally lives beside its provider so all portal loaders share one registry.
// eslint-disable-next-line react-refresh/only-export-components
export function usePortalLoadingController(): PortalLoadingContextValue {
  const context = useContext(PortalLoadingContext);
  if (!context) throw new Error('usePortalLoadingController must be used inside PortalLoadingProvider');
  return context;
}

export const PortalLoadingOverlay: React.FC<PortalLoadingOverlayProps> = ({
  message = 'Loading content...',
}) => {
  const context = useContext(PortalLoadingContext);
  const request = context?.request;
  const release = context?.release;
  const token = useRef<LoadingToken>(Symbol('portal-page-loading'));

  useEffect(() => {
    if (!request || !release) return undefined;
    const currentToken = token.current;
    request(currentToken, message);
    return () => release(currentToken);
  }, [message, release, request]);

  if (context) return null;
  return <PortalLoadingVisual message={message} />;
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
