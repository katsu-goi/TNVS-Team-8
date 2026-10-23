import React, { FormEvent, useState } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { requestPasswordReset, resetPassword } from '../../api/authService';
import { extractErrorMessage } from '../../api/client';

const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/45 focus:border-[#FFC629] focus:ring-2 focus:ring-[#FFC629]/20';
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,100}$/;

const RecoveryShell: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <main className="relative min-h-screen w-full overflow-hidden bg-black px-4 py-8">
    <div className="absolute inset-0 bg-[url('/hirna-vehicle4.png')] bg-cover bg-center opacity-70" />
    <div className="absolute inset-0 bg-black/45" />
    <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
      <div className="w-full rounded-[28px] border border-white/25 bg-white/15 p-7 shadow-2xl backdrop-blur-md">
        <div className="mb-6 text-center">
          <img src="/hirna-logo.png" alt="Hirna Logo" className="mx-auto h-12 w-12 rounded-2xl object-contain" />
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#FFC629]">Hirna Portal</p>
          <h1 className="mt-2 text-2xl font-bold text-white">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/70">{description}</p>
        </div>
        {children}
      </div>
    </section>
  </main>
);

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError('Enter a valid corporate email address.');
      return;
    }
    setBusy(true); setError('');
    try {
      await requestPasswordReset(normalized);
      setSubmitted(true);
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally { setBusy(false); }
  };

  return <RecoveryShell title="Reset your password" description="Enter your corporate email to request a secure, time-limited reset link.">
    {submitted ? <div className="space-y-4">
      <div role="status" className="rounded-xl border border-emerald-300/30 bg-emerald-500/15 p-4 text-sm leading-relaxed text-emerald-100">
        <CheckCircle2 className="mb-2 h-5 w-5" />
        If an active account exists and email delivery is available, a reset link will arrive shortly. Check spam, then contact HR if it does not arrive.
      </div>
      <button type="button" onClick={() => navigate('/hr-assistance')} className="w-full rounded-full border border-white/25 px-4 py-3 text-sm font-bold text-white hover:bg-white/10">Contact HR Department</button>
      <button type="button" onClick={() => navigate('/login')} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-white/70 hover:text-[#FFC629]"><ArrowLeft className="h-4 w-4" />Back to sign in</button>
    </div> : <form onSubmit={submit} noValidate className="space-y-4">
      <label className="block text-sm font-semibold text-white/85" htmlFor="recovery-email">Corporate email
        <span className="relative block"><Mail className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-white/50" /><input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`${inputClass} pl-10`} /></span>
      </label>
      {error && <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">{error}</div>}
      <button type="submit" disabled={busy} className="w-full rounded-full bg-[#D02F34] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send reset link'}</button>
      <button type="button" onClick={() => navigate('/login')} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-white/70 hover:text-[#FFC629]"><ArrowLeft className="h-4 w-4" />Back to sign in</button>
    </form>}
  </RecoveryShell>;
};

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordPattern.test(newPassword)) {
      setError('Use 8–100 characters with uppercase, lowercase, number, and special character.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true); setError('');
    try {
      await resetPassword({ token, newPassword, confirmPassword });
      navigate('/login', { replace: true });
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally { setBusy(false); }
  };

  return <RecoveryShell title="Choose a new password" description="Create a strong password for your Hirna account.">
    {!token && <div role="alert" className="mb-4 rounded-xl border border-rose-300/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">This reset link is invalid or incomplete. Request a new link.</div>}
    <form onSubmit={submit} noValidate className="space-y-4">
      <label className="block text-sm font-semibold text-white/85" htmlFor="new-password">New password
        <span className="relative block"><KeyRound className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-white/50" /><input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={`${inputClass} pl-10`} /></span>
      </label>
      <label className="block text-sm font-semibold text-white/85" htmlFor="confirm-password">Confirm password
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} />
      </label>
      {error && <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">{error}</div>}
      <button type="submit" disabled={busy || !token} className="w-full rounded-full bg-[#D02F34] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Resetting…' : 'Reset password'}</button>
      <button type="button" onClick={() => navigate('/forgot-password')} className="w-full text-sm font-semibold text-white/70 hover:text-[#FFC629]">Request a new link</button>
    </form>
  </RecoveryShell>;
};
