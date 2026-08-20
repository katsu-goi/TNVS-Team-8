import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestHrAssistance } from '../../api/authService';
import { extractErrorMessage } from '../../api/client';
import { validateCorporateEmail } from '../../utils/emailValidation';
import { SubjectDropdown } from './SubjectDropdown';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';

const SUBJECT_OPTIONS = [
  'Account access / login locked',
  'Password recovery',
  'Account unlock request',
  'Other',
];

export const HRAssistancePage: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [subject, setSubject] = useState('Account access / login locked');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const validateName = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return 'Full name is required.';
    if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(trimmed)) {
      return 'Please enter a valid name using letters and spaces only.';
    }
    return '';
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setNameError(validateName(value));
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setEmailError(validateCorporateEmail(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameValidation = validateName(name);
    const emailValidation = validateCorporateEmail(email);
    setNameError(nameValidation);
    setEmailError(emailValidation);
    if (nameValidation || emailValidation) {
      setError('');
      return;
    }
    if (!subject.trim() || !message.trim()) {
      setError('Please complete all fields.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await requestHrAssistance({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      <div className="absolute inset-0 bg-cover bg-top bg-no-repeat bg-fixed" style={{ backgroundImage: `url('/hirna-vehicle3.png')` }} />
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-8">
        <div className="w-full max-h-[92vh] overflow-y-auto scrollbar-none" style={{ maxWidth: '445px' }}>
          <div className="rounded-[28px] p-8" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 25px 70px rgba(0,0,0,0.35)' }}>
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)] mb-3">
                <svg className="w-6 h-6 text-[#FFC629]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-white tracking-tight">Hirna Portal</h1>
              <p className="text-[10px] text-[#FFC629] font-medium tracking-widest uppercase">Enterprise</p>
              <h2 className="text-2xl font-bold text-white tracking-tight mt-3 leading-tight">HR Department</h2>
              <p className="text-sm text-white/50 leading-relaxed mt-2 max-w-xs">
                Request assistance with account access or password recovery. The HR Department will contact you shortly.
              </p>
            </div>

            {submitted ? (
              <div className="px-4 py-6 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-center space-y-3">
                <MailCheck className="w-10 h-10 text-emerald-300 mx-auto" />
                <div className="space-y-1">
                  <p className="text-emerald-200 text-sm font-semibold">Request submitted</p>
                  <p className="text-emerald-200/80 text-sm leading-relaxed">
                    Your request has been sent to the HR Department. They will contact you at{' '}
                    <span className="font-medium">{email.trim()}</span> shortly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="mt-2 w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-[#D02F34] hover:bg-[#A9252A] text-white font-semibold text-sm transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Login</span>
                </button>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-5 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm">{error}</div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1.5">Full name</label>
                    <input type="text" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Juan Dela Cruz" autoComplete="name" className="w-full px-4 py-2.5 rounded-xl border border-white/15 bg-white/10 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#D02F34] focus:border-transparent transition-shadow" />
                    {nameError && <p className="mt-1.5 text-[11px] text-rose-300">{nameError}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1.5">Corporate email</label>
                    <input type="email" value={email} onChange={(e) => handleEmailChange(e.target.value)} placeholder="employee@photonicomega.com" autoComplete="email" className="w-full px-4 py-2.5 rounded-xl border border-white/15 bg-white/10 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#D02F34] focus:border-transparent transition-shadow" />
                    {emailError ? (
                      <p className="mt-1.5 text-[11px] text-rose-300">{emailError}</p>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-white/40">Personal email providers (e.g. @gmail.com) are not accepted. Use your corporate email.</p>
                    )}
                  </div>
                  <div>
                    <label id="subject-label" htmlFor="subject" className="block text-sm font-medium text-white/80 mb-1.5">Subject</label>
                    <SubjectDropdown id="subject" labelId="subject-label" value={subject} onChange={setSubject} options={SUBJECT_OPTIONS} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1.5">Message</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Describe the issue you are experiencing with your account." className="w-full px-4 py-2.5 rounded-xl border border-white/15 bg-white/10 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#D02F34] focus:border-transparent transition-shadow resize-none" />
                  </div>
                  <button type="submit" disabled={loading} className="w-full flex items-center justify-center space-x-2 py-3 rounded-full bg-[#D02F34] hover:bg-[#A9252A] text-white font-bold text-sm shadow-[0_0_15px_rgba(208,47,52,0.3)] hover:shadow-[0_0_24px_rgba(208,47,52,0.45)] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>{loading ? 'Submitting...' : 'Submit Request'}</span>
                  </button>
                </form>

                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="w-full flex items-center justify-center space-x-1.5 text-center text-xs text-white/40 hover:text-[#FFC629] transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Login</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
