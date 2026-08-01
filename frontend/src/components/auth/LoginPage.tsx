import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, getDashboardPath } from '../../stores/authStore';
import { login } from '../../api/authService';
import { extractErrorMessage } from '../../api/client';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const setAuthTokens = useAuthStore((s) => s.setAuthTokens);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await login({ email: email.trim(), password });
      setAuthTokens(res.user, res.accessToken, res.refreshToken);
      if (rememberMe) {
        localStorage.setItem('accessToken', res.accessToken);
      }
      navigate(getDashboardPath(res.user), { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat bg-fixed" style={{ backgroundImage: `url('/image_18.png')` }} />
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 flex items-center justify-center h-screen px-4 py-4">
        <div className="w-full max-h-[90vh] overflow-y-auto" style={{ maxWidth: '445px' }}>
          <div className="rounded-[28px] p-8" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 25px 70px rgba(0,0,0,0.35)' }}>
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-[#00E676]/25 flex items-center justify-center shadow-[0_0_20px_rgba(0,230,118,0.25)] mb-3">
                <svg className="w-6 h-6 text-[#00E676]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-white tracking-tight">Green GSM</h1>
              <p className="text-[10px] text-[#00E676] font-medium tracking-widest uppercase">Enterprise</p>
              <h2 className="text-3xl font-bold text-white tracking-tight mt-3 leading-tight">Welcome back</h2>
              <p className="text-sm text-white/50 leading-relaxed mt-2 max-w-xs">Sign in to your account to continue.</p>
            </div>

            {error && (
              <div className="mb-5 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm">{error}</div>
            )}

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">Email / Corporate ID</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@photonicomega.com" autoComplete="username" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/15 bg-white/10 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#00E676] focus:border-transparent transition-shadow" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" autoComplete="current-password" className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-white/15 bg-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-[#00E676] focus:border-transparent transition-shadow" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/50 hover:text-white" tabIndex={-1}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-white/30 bg-white/10 text-[#00E676] focus:ring-[#00E676]" />
                  <span className="text-sm text-white/70">Remember me</span>
                </label>
              </div>
              <button type="submit" disabled={loading} className="w-full flex items-center justify-center space-x-2 py-3 rounded-full bg-[#00E676] hover:bg-[#00c853] text-[#042F24] font-bold text-sm shadow-[0_0_15px_rgba(0,230,118,0.3)] hover:shadow-[0_0_24px_rgba(0,230,118,0.45)] transition-all duration-200 disabled:opacity-60">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{loading ? 'Signing in...' : 'Sign In'}</span>
              </button>
            </form>

              <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('admin@photonicomega.com');
                    setPassword('Admin2026!');
                  }}
                  className="w-full text-center text-xs text-white/40 hover:text-[#00E676] transition-colors"
                >
                  Quick Admin Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('fm@photonicomega.com');
                    setPassword('Fm2026!');
                  }}
                  className="w-full text-center text-xs text-white/40 hover:text-[#00E676] transition-colors"
                >
                  Quick Facilities Manager Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('fo@photonicomega.com');
                    setPassword('Fo2026!');
                  }}
                  className="w-full text-center text-xs text-white/40 hover:text-[#00E676] transition-colors"
                >
                  Quick Facilities Officer Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('co@photonicomega.com');
                    setPassword('Co2026!');
                  }}
                  className="w-full text-center text-xs text-white/40 hover:text-[#00E676] transition-colors"
                >
                  Quick Compliance Officer Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('legal@photonicomega.com');
                    setPassword('Legal2026!');
                  }}
                  className="w-full text-center text-xs text-white/40 hover:text-[#00E676] transition-colors"
                >
                  Quick Legal Officer Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('contract@photonicomega.com');
                    setPassword('Contract2026!');
                  }}
                  className="w-full text-center text-xs text-white/40 hover:text-[#00E676] transition-colors"
                >
                  Quick Contract Officer Login
                </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};
