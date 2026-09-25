import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, getDashboardPath } from '../../stores/authStore';
import { login, extractLoginLockout } from '../../api/authService';
import { extractErrorMessage } from '../../api/client';
import { Eye, EyeOff } from 'lucide-react';
import { validateCorporateEmail } from '../../utils/emailValidation';
import { consumeSessionEndReason } from '../../session/sessionState';

const savedRestriction = (): { email: string; retryAt: string } | null => {
  try {
    const value = JSON.parse(sessionStorage.getItem('loginRestriction') ?? 'null');
    return typeof value?.email === 'string' && typeof value?.retryAt === 'string' ? value : null;
  } catch {
    return null;
  }
};

type FieldErrors = {
  email?: string;
  password?: string;
};

const PUBLIC_LOGIN_PATHS = new Set([
  '/login',
  '/hr-assistance',
  '/reservation-portal/login',
  '/reservation-portal/pass',
]);

function safePostLoginPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
    if (PUBLIC_LOGIN_PATHS.has(normalizedPath) || normalizedPath.startsWith('/guest-pass/')) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthTokens = useAuthStore((s) => s.setAuthTokens);
  const verifyLoginSession = useAuthStore((s) => s.verifyLoginSession);

  const [email, setEmail] = useState(() => savedRestriction()?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sessionNotice] = useState(() => {
    const reason = consumeSessionEndReason();
    if (reason === 'inactivity') return 'Your session ended due to inactivity. Please sign in again.';
    if (reason === 'expired') return 'Your session has expired. Please sign in again.';
    return '';
  });
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [retryAt, setRetryAt] = useState<string | null>(() => {
    return savedRestriction()?.retryAt ?? null;
  });
  const [countdown, setCountdown] = useState(0);

  const locked = retryAt !== null && Date.parse(retryAt) > Date.now();

  useEffect(() => {
    if (!retryAt) {
      setCountdown(0);
      return;
    }
    const update = () => {
      const next = Math.max(0, Math.ceil((Date.parse(retryAt) - Date.now()) / 1000));
      setCountdown(next);
      if (next === 0) {
        setRetryAt(null);
        setError('');
        try { sessionStorage.removeItem('loginRestriction'); } catch {}
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const countdownLabel = `${String(Math.floor(countdown / 60)).padStart(2, '0')}:${String(countdown % 60).padStart(2, '0')}`;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    const nextFieldErrors: FieldErrors = {};
    if (!email.trim()) nextFieldErrors.email = 'Email or Corporate ID is required.';
    if (!password) nextFieldErrors.password = 'Password is required.';
    if (email.trim() && !nextFieldErrors.email) {
      const emailValidation = validateCorporateEmail(email);
      if (emailValidation) nextFieldErrors.email = emailValidation;
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError('');
      window.requestAnimationFrame(() => {
        if (nextFieldErrors.email) emailRef.current?.focus();
        else passwordRef.current?.focus();
      });
      return;
    }
    setFieldErrors({});
    setLoading(true);
    setError('');

    try {
      const res = await login({ email: email.trim(), password });
      setAuthTokens(res.user, res.accessToken, res.refreshToken);
      const verifiedUser = await verifyLoginSession();
      if (!verifiedUser) return;
      setRetryAt(null);
      try { sessionStorage.removeItem('loginRestriction'); } catch {}
      const returnTo = new URLSearchParams(location.search).get('returnTo');
      const safeReturnTo = safePostLoginPath(returnTo);
      navigate(safeReturnTo || getDashboardPath(verifiedUser), { replace: true });
    } catch (err) {
      const info = extractLoginLockout(err);
      if (info?.retryAt && Date.parse(info.retryAt) > Date.now()) {
        setRetryAt(info.retryAt);
        try {
          sessionStorage.setItem('loginRestriction', JSON.stringify({
            email: email.trim().toLowerCase(), retryAt: info.retryAt,
          }));
        } catch {}
        setError('');
      } else {
        setRetryAt(null);
        setError(extractErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <div className="absolute inset-0 bg-[length:100%_100%] bg-no-repeat bg-fixed" style={{ backgroundImage: `url('/hirna-vehicle4.png')` }} />
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 flex items-center justify-center h-screen px-4 py-4">
        <div className="w-full max-h-[90vh] overflow-y-auto" style={{ maxWidth: '445px' }}>
          <div className="rounded-[28px] p-8" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 25px 70px rgba(0,0,0,0.35)' }}>
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)] mb-3 overflow-hidden">
                <img src="/hirna-logo.png" alt="Hirna Logo" className="w-full h-full object-contain" draggable={false} />
              </div>
              <h1 className="text-lg font-bold text-white tracking-tight">Hirna Portal</h1>
              <p className="text-[10px] text-[#FFC629] font-medium tracking-widest uppercase">Enterprise</p>
              <h2 className="text-3xl font-bold text-white tracking-tight mt-3 leading-tight">Welcome back</h2>
              <p className="text-sm text-white/70 leading-relaxed mt-2 max-w-xs">Sign in to your account to continue.</p>
            </div>

            {sessionNotice ? (
              <div role="status" className="mb-5 rounded-xl border border-amber-300/30 bg-amber-400/15 px-4 py-3 text-sm text-amber-100">
                {sessionNotice}
              </div>
            ) : null}

            {locked ? (
              <div role="status" aria-live="polite" aria-atomic="true" className="mb-5 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm">
                <div className="flex items-center justify-between">
                  <span>Too many failed login attempts. Sign in is temporarily disabled.</span>
                  <span aria-hidden="true" className="font-mono text-lg font-bold tabular-nums">{countdownLabel}</span>
                </div>
              </div>
            ) : error ? (
              <div role="alert" className="mb-5 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm">{error}</div>
            ) : null}

            <form onSubmit={handleLogin} noValidate className="space-y-3">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-white/80 mb-1.5">Email / Corporate ID</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    ref={emailRef}
                    id="login-email"
                    type="text"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
                    }}
                    disabled={locked}
                    aria-required="true"
                    aria-invalid={fieldErrors.email ? 'true' : 'false'}
                    aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                    placeholder="admin@photonicomega.com"
                    autoComplete="username"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border bg-white/10 text-white placeholder-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-[#D02F34] focus:border-transparent transition-shadow disabled:opacity-60 disabled:cursor-not-allowed ${fieldErrors.email ? 'border-rose-400' : 'border-white/15'}`}
                  />
                </div>
                {fieldErrors.email ? <p id="login-email-error" className="mt-1.5 text-xs font-medium text-rose-300">{fieldErrors.email}</p> : null}
              </div>
              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-white/80 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
                    }}
                    onKeyDown={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                    onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                    onBlur={() => setCapsLock(false)}
                    disabled={locked}
                    aria-required="true"
                    aria-invalid={fieldErrors.password ? 'true' : 'false'}
                    aria-describedby={[
                      fieldErrors.password ? 'login-password-error' : '',
                      capsLock ? 'caps-lock-warning' : '',
                    ].filter(Boolean).join(' ') || undefined}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className={`w-full pl-4 pr-10 py-2.5 rounded-xl border bg-white/10 text-white placeholder-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-[#D02F34] focus:border-transparent transition-shadow disabled:opacity-60 disabled:cursor-not-allowed ${fieldErrors.password ? 'border-rose-400' : 'border-white/15'}`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/50 hover:text-white">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password ? <p id="login-password-error" className="mt-1.5 text-xs font-medium text-rose-300">{fieldErrors.password}</p> : null}
                {capsLock ? <p id="caps-lock-warning" role="status" className="mt-1.5 text-xs font-medium text-amber-300">Caps Lock is on.</p> : null}
              </div>
              <button type="submit" disabled={loading || locked} className="w-full flex items-center justify-center space-x-2 py-3 rounded-full bg-[#D02F34] hover:bg-[#A9252A] text-white font-bold text-sm shadow-[0_0_15px_rgba(208,47,52,0.3)] hover:shadow-[0_0_24px_rgba(208,47,52,0.45)] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed">
                <span>{loading ? 'Signing in...' : locked ? `Try again in ${countdownLabel}` : 'Sign In'}</span>
              </button>
            </form>

              <div className="mt-4 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => navigate('/hr-assistance')}
                  className="w-full text-center text-xs text-white/40 transition-colors hover:text-hirna-yellow"
                >
                  Contact HR Department
                </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};
