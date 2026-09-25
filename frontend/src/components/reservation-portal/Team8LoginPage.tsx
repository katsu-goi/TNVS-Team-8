import React, { useState } from 'react';
import { Building2, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../../api/authService';
import { extractErrorMessage } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { isTeam8Email, team8DomainLabel } from '../../utils/team8Access';

export const Team8LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthTokens = useAuthStore((state) => state.setAuthTokens);
  const verifyLoginSession = useAuthStore((state) => state.verifyLoginSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!isTeam8Email(normalizedEmail)) {
      setError(`Use a Team 8 internal email address (${team8DomainLabel()}).`);
      return;
    }
    if (!password) {
      setError('Enter your password to continue.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await login({ email: normalizedEmail, password });
      if (!isTeam8Email(session.user.email)) {
        setError('This account is not authorized for the Team 8 reservation portal.');
        return;
      }
      setAuthTokens(session.user, session.accessToken, session.refreshToken);
      const verifiedUser = await verifyLoginSession();
      if (!verifiedUser || !isTeam8Email(verifiedUser.email)) {
        throw new Error('This account is not authorized for the Team 8 reservation portal.');
      }
      const returnTo = new URLSearchParams(location.search).get('returnTo');
      const protectedReservationReturn = returnTo === '/reservation-portal'
        || (returnTo?.startsWith('/reservation-portal/')
          && !returnTo.startsWith('/reservation-portal/login')
          && !returnTo.startsWith('/reservation-portal/pass'));
      const target = protectedReservationReturn ? returnTo! : '/reservation-portal';
      navigate(target, { replace: true });
    } catch (loginError) {
      setError(extractErrorMessage(loginError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden bg-[#5f1018] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
                <Building2 className="h-6 w-6 text-[#FFBF2F]" />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FFBF2F]">Team 8 Facilities</p>
              <h1 className="mt-4 max-w-md text-4xl font-bold leading-tight">Reserve the right space for the right conversation.</h1>
              <p className="mt-5 max-w-md text-sm leading-6 text-white/70">Book internal meeting spaces, coordinate invitees, and issue secure digital passes from one focused workspace.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/60">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Internal Team 8 access only
            </div>
          </div>

          <div className="p-7 sm:p-10">
            <div className="mb-8 lg:hidden">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Team 8 Facilities</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">Reservation Portal</h1>
            </div>
            <div className="mb-7">
              <h2 className="text-2xl font-bold text-slate-900">Internal sign in</h2>
              <p className="mt-2 text-sm text-slate-500">Use your Team 8 corporate account to continue.</p>
            </div>
            {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Corporate email</span>
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" placeholder="you@photonicomega.com" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/10" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
                <span className="relative block">
                  <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/10" />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>
              <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Signing in...' : 'Sign in to reserve'}
              </button>
            </form>
            <p className="mt-6 text-center text-[11px] leading-5 text-slate-400">Authorized domains: {team8DomainLabel()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
