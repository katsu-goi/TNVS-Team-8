import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, getDashboardPath } from '../../stores/authStore';
import { login, extractLoginLockout } from '../../api/authService';
import { extractErrorMessage } from '../../api/client';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { validateCorporateEmail } from '../../utils/emailValidation';

const savedRestriction = (): { email: string; retryAt: string } | null => {
  try {
    const value = JSON.parse(sessionStorage.getItem('loginRestriction') ?? 'null');
    return typeof value?.email === 'string' && typeof value?.retryAt === 'string' ? value : null;
  } catch {
    return null;
  }
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthTokens = useAuthStore((s) => s.setAuthTokens);

  const [email, setEmail] = useState(() => savedRestriction()?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const countdownLabel = `${String(Math.floor(countdown / 60)).padStart(2, '0')}:${String(countdown % 60).padStart(2, '0')}`;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }
    const emailValidation = validateCorporateEmail(email);
    if (emailValidation) {
      setError(emailValidation);
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await login({ email: email.trim(), password });
      setAuthTokens(res.user, res.accessToken, res.refreshToken);
      setRetryAt(null);
      try { sessionStorage.removeItem('loginRestriction'); } catch {}
      const returnTo = new URLSearchParams(location.search).get('returnTo');
      const safeReturnTo = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : null;
      navigate(safeReturnTo || getDashboardPath(res.user), { replace: true });
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
              <p className="text-sm text-white/50 leading-relaxed mt-2 max-w-xs">Sign in to your account to continue.</p>
            </div>

            {locked ? (
              <div className="mb-5 px-4 py-3 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-200 text-sm">
                <div className="flex items-center justify-between">
                  <span>Too many unsuccessful login attempts. Try again in</span>
                  <span className="font-mono text-lg font-bold tabular-nums">{countdownLabel}</span>
                </div>
              </div>
            ) : error ? (
              <div className="mb-5 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm">{error}</div>
            ) : null}

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">Email / Corporate ID</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} disabled={locked} placeholder="admin@photonicomega.com" autoComplete="username" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/15 bg-white/10 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#D02F34] focus:border-transparent transition-shadow disabled:opacity-60 disabled:cursor-not-allowed" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" autoComplete="current-password" className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-white/15 bg-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-[#D02F34] focus:border-transparent transition-shadow" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/50 hover:text-white" tabIndex={-1}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-white/30 bg-white/10 text-[#D02F34] focus:ring-[#D02F34]" />
                  <span className="text-sm text-white/70">Remember me</span>
                </label>
              </div>
              <button type="submit" disabled={loading || locked} className="w-full flex items-center justify-center space-x-2 py-3 rounded-full bg-[#D02F34] hover:bg-[#A9252A] text-white font-bold text-sm shadow-[0_0_15px_rgba(208,47,52,0.3)] hover:shadow-[0_0_24px_rgba(208,47,52,0.45)] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{loading ? 'Signing in...' : 'Sign In'}</span>
              </button>
            </form>

              <div className="mt-4 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => navigate('/hr-assistance')}
                  className="w-full text-center text-xs text-white/40 hover:text-[#FFC629] transition-colors"
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
