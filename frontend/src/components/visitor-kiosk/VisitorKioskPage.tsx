import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2,
  IdCard, Loader2, LockKeyhole, Mail, RefreshCw, ShieldCheck, UserRound,
} from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import { visitorService, type KioskConfig, type KioskRegistration } from '../../api/visitorService';
import { VisitorIdScanner } from './VisitorIdScanner';
import { PrivacyNoticeStep } from './PrivacyNoticeStep';

type Step = 'welcome' | 'privacy' | 'id' | 'verification' | 'details' | 'review' | 'submitted';

export type VisitorKioskFormState = {
  fullName: string;
  email: string;
  phoneNumber: string;
  company: string;
  idType: string;
  idNumberLast4: string;
  idImage: string;
  imageConfirmed: boolean;
  purposeCategory: string;
  otherPurpose: string;
  hostId: string;
  receivingDepartment: string;
  expectedArrival: string;
};

const emptyForm: VisitorKioskFormState = {
  fullName: '', email: '', phoneNumber: '', company: '', idType: '', idNumberLast4: '',
  idImage: '', imageConfirmed: false, purposeCategory: '', otherPurpose: '', hostId: '',
  receivingDepartment: '', expectedArrival: '',
};

const steps: Array<{ key: Step; label: string }> = [
  { key: 'privacy', label: 'Privacy' },
  { key: 'id', label: 'ID capture' },
  { key: 'verification', label: 'Verification' },
  { key: 'details', label: 'Visit details' },
  { key: 'review', label: 'Review' },
];

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/10';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600';

function errorMessage(error: unknown): string {
  return extractErrorMessage(error);
}

export function visitorDetailsAreValid(form: VisitorKioskFormState): boolean {
  const otherValid = form.purposeCategory !== 'OTHER' || form.otherPurpose.trim().length >= 3;
  const hostValid = form.purposeCategory !== 'MEETING_EMPLOYEE' || Boolean(form.hostId);
  const destinationValid = Boolean(form.hostId || form.receivingDepartment);
  const organizationValid = form.purposeCategory !== 'GOVERNMENT_REGULATORY' || form.company.trim().length >= 2;
  return form.fullName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    && Boolean(form.purposeCategory) && Boolean(form.expectedArrival) && otherValid && hostValid && destinationValid && organizationValid;
}

const KioskShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fee2e2,transparent_34%),linear-gradient(145deg,#f8fafc,#fff)] text-slate-900">
    <header className="border-b border-white/70 bg-white/85 px-4 py-3 shadow-sm backdrop-blur sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-3"><img src="/hirna-logo.png" alt="Hirna TNVS" className="h-11 w-11 object-contain" /><div><p className="text-sm font-black tracking-tight">HIRNA TNVS</p><p className="text-xs text-slate-500">Visitor Registration Kiosk</p></div></div>
        <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 sm:flex"><LockKeyhole className="h-3.5 w-3.5" />Secure visitor workflow</div>
      </div>
    </header>
    {children}
  </main>
);

const NoticeRow: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-700">{title}</p><div className="mt-1.5 text-sm leading-6 text-slate-600">{children}</div></div>
);

export const VisitorKioskPage: React.FC = () => {
  const [step, setStep] = useState<Step>('welcome');
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [form, setForm] = useState<VisitorKioskFormState>(emptyForm);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    referenceNumber: string;
    approvalStatus: string;
    emailDeliveryStatus: string;
    statusToken: string | null;
  } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true); setError('');
    try { setConfig(await visitorService.getKioskConfig()); }
    catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const selectedHost = config?.hosts.find((host) => host.id === form.hostId);
  const selectedPurpose = config?.purposes.find((purpose) => purpose.value === form.purposeCategory);
  const detailsValid = useMemo(() => visitorDetailsAreValid(form), [form]);

  const reset = () => {
    setStep('welcome'); setPrivacyAcknowledged(false); setForm(emptyForm); setResult(null); setError(''); setIdempotencyKey(crypto.randomUUID());
  };

  const submit = async () => {
    if (!config || !privacyAcknowledged || !detailsValid || !form.idImage || !form.imageConfirmed) return;
    setSubmitting(true); setError('');
    const payload: KioskRegistration = {
      idempotencyKey,
      privacyNoticeVersion: config.privacy.noticeVersion,
      privacyAcknowledged: true,
      fullName: form.fullName.trim(), email: form.email.trim(), phoneNumber: form.phoneNumber.trim() || undefined,
      company: form.company.trim() || undefined, idType: form.idType, idNumberLast4: form.idNumberLast4.trim() || undefined,
      idImage: { dataUrl: form.idImage, confirmedReadable: true }, purposeCategory: form.purposeCategory,
      otherPurpose: form.otherPurpose.trim() || undefined, hostId: form.hostId || undefined,
      receivingDepartment: selectedHost?.department || form.receivingDepartment || undefined,
      expectedArrival: new Date(form.expectedArrival).toISOString(),
    };
    try {
      const saved = await visitorService.submitKioskRegistration(payload);
      setResult(saved); setForm((current) => ({ ...current, idImage: '', idNumberLast4: '' })); setStep('submitted');
    } catch (submitError) { setError(errorMessage(submitError)); }
    finally { setSubmitting(false); }
  };

  if (loading) return <KioskShell><div className="flex min-h-[75vh] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-red-700" /><span className="ml-3 text-sm font-semibold text-slate-600">Preparing secure registration…</span></div></KioskShell>;

  if (!config || error && step === 'welcome') return <KioskShell><div className="mx-auto flex min-h-[75vh] max-w-xl items-center p-6"><div className="w-full rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-xl"><AlertCircle className="mx-auto h-10 w-10 text-rose-600" /><h1 className="mt-4 text-xl font-black">Kiosk unavailable</h1><p className="mt-2 text-sm text-slate-600">{error || 'The kiosk configuration could not be loaded.'}</p><button onClick={() => void loadConfig()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" />Try again</button></div></div></KioskShell>;

  const currentIndex = steps.findIndex((item) => item.key === step);
  return (
    <KioskShell>
      {step !== 'welcome' && step !== 'submitted' && <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-8"><ol className="grid grid-cols-5 gap-1" aria-label="Registration progress">{steps.map((item, index) => <li key={item.key} className="text-center"><div className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${index < currentIndex ? 'bg-emerald-600 text-white' : index === currentIndex ? 'bg-red-700 text-white' : 'bg-slate-200 text-slate-500'}`}>{index < currentIndex ? <Check className="h-4 w-4" /> : index + 1}</div><span className="mt-1 hidden text-[11px] font-semibold text-slate-500 sm:block">{item.label}</span></li>)}</ol></div>}
      <div className={`mx-auto flex min-h-[calc(100vh-76px)] max-w-5xl px-4 py-8 sm:px-8 ${step === 'privacy' ? 'items-start' : 'items-center'}`}>
        {step === 'welcome' && <section className="w-full overflow-hidden rounded-[2rem] border border-white bg-white shadow-2xl"><div className="grid lg:grid-cols-[1.15fr_.85fr]"><div className="p-8 sm:p-12"><div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-extrabold text-red-700"><ShieldCheck className="h-4 w-4" />Reception self-service</div><h1 className="mt-6 max-w-2xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">Welcome to Hirna TNVS</h1><p className="mt-5 max-w-xl text-base leading-7 text-slate-600">Register your visit, provide an approved ID for authorized review, and submit your request. A QR pass is emailed only after identity clearance and visit approval.</p>{!config.privacy.ready && <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-extrabold">Registration is not yet enabled.</p><p className="mt-1">The organization must complete its privacy and identity-handling policy, active-department routing, required privacy/security/operations reviews, and explicitly enable registration.</p></div>}<button disabled={!config.privacy.ready} onClick={() => { setPrivacyAcknowledged(false); setStep('privacy'); }} className="mt-8 inline-flex min-h-14 items-center gap-3 rounded-2xl bg-red-700 px-7 py-4 text-base font-black text-white shadow-lg shadow-red-700/20 hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300">Start Visitor Registration <ArrowRight className="h-5 w-5" /></button></div><div className="flex min-h-72 items-center justify-center bg-slate-950 p-10 text-white"><div className="max-w-sm"><IdCard className="h-16 w-16 text-red-400" /><p className="mt-6 text-xl font-black">Before you begin</p><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300"><li>• Have an accepted ID ready.</li><li>• Know your employee host or receiving department.</li><li>• Provide an email address for approval updates and the QR pass.</li></ul></div></div></div></section>}

        {step === 'privacy' && <PrivacyNoticeStep privacy={config.privacy} acknowledged={privacyAcknowledged} onAcknowledgedChange={setPrivacyAcknowledged} onBack={() => setStep('welcome')} onContinue={() => setStep('id')} />}

        {step === 'id' && (
          <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
            <h1 className="text-2xl font-black">Capture an approved ID</h1>
            <p className="mt-1 text-sm text-slate-500">Align a well-lit ID inside the guide for automatic capture, or use the manual and upload fallbacks. Detection checks image quality only; authorized staff still perform identity review.</p>
            <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
              <div>
                <label className={labelClass}>ID type</label>
                <select value={form.idType} onChange={(event) => setForm((current) => ({ ...current, idType: event.target.value }))} className={inputClass}>
                  <option value="">Select an approved ID</option>
                  {config.privacy.acceptedIdTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <label className="mt-4 block">
                  <span className={labelClass}>Last 4 ID characters (optional)</span>
                  <input maxLength={4} value={form.idNumberLast4} onChange={(event) => setForm((current) => ({ ...current, idNumberLast4: event.target.value.replace(/[^A-Za-z0-9]/g, '') }))} className={inputClass} autoComplete="off" />
                  <span className="mt-1 block text-xs text-slate-500">Only the last four are requested to reduce retained ID data.</span>
                </label>
                <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-800"><strong>OCR and authenticity status:</strong> Not configured. Edge detection, alignment, focus, lighting, and glare checks do not verify that an ID is genuine.</div>
              </div>
              <VisitorIdScanner
                image={form.idImage}
                confirmed={form.imageConfirmed}
                onImageChange={(idImage, imageConfirmed) => setForm((current) => ({ ...current, idImage, imageConfirmed }))}
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep('privacy')} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button>
              <button disabled={!form.idType || !form.idImage || !form.imageConfirmed} onClick={() => setStep('verification')} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Continue <ArrowRight className="h-4 w-4" /></button>
            </div>
          </section>
        )}

        {step === 'verification' && <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10"><div className="mx-auto max-w-2xl text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><UserRound className="h-8 w-8" /></div><h1 className="mt-5 text-2xl font-black">Identity verification requires manual review</h1><p className="mt-3 text-sm leading-7 text-slate-600">{config.privacy.identityVerification.message}</p><div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-left text-sm leading-6 text-amber-900"><p className="font-extrabold">No face image will be collected in this configuration.</p><p className="mt-1">Ordinary camera detection is not identity verification, and no successful face match, liveness result, or confidence score will be fabricated.</p><p className="mt-3"><strong>Approved alternative:</strong> {config.privacy.alternativeVerification}</p></div></div><div className="mt-8 flex justify-between"><button onClick={() => setStep('id')} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button><button onClick={() => setStep('details')} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white">Continue for manual review <ArrowRight className="h-4 w-4" /></button></div></section>}

        {step === 'details' && <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"><h1 className="text-2xl font-black">Visitor and visit details</h1><p className="mt-1 text-sm text-slate-500">Provide only the information needed to route and approve this visit.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Full name</span><input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} className={inputClass} autoComplete="name" maxLength={150} /></label><label><span className={labelClass}>Email for QR pass</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} autoComplete="email" /></label><label><span className={labelClass}>Phone number (optional)</span><input value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} className={inputClass} autoComplete="tel" maxLength={30} /></label><label><span className={labelClass}>Organization (required for government visits)</span><input value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} className={inputClass} maxLength={150} /></label><label className="sm:col-span-2"><span className={labelClass}>Purpose of visit</span><select value={form.purposeCategory} onChange={(event) => { const purpose = config.purposes.find((item) => item.value === event.target.value); setForm((current) => ({ ...current, purposeCategory: event.target.value, hostId: '', receivingDepartment: purpose?.department ?? '', otherPurpose: '' })); }} className={inputClass}><option value="">Select a purpose</option>{config.purposes.map((purpose) => <option key={purpose.value} value={purpose.value}>{purpose.label}</option>)}</select></label>{form.purposeCategory === 'OTHER' && <label className="sm:col-span-2"><span className={labelClass}>Explain the other purpose</span><textarea value={form.otherPurpose} onChange={(event) => setForm((current) => ({ ...current, otherPurpose: event.target.value }))} className={inputClass} rows={3} minLength={3} maxLength={500} /><span className="mt-1 block text-right text-xs text-slate-400">{form.otherPurpose.length}/500</span></label>}{form.purposeCategory === 'MEETING_EMPLOYEE' || form.purposeCategory === 'BUSINESS_MEETING' ? <label className="sm:col-span-2"><span className={labelClass}>{form.purposeCategory === 'MEETING_EMPLOYEE' ? 'Employee host' : 'Intended host (if applicable)'}</span><select value={form.hostId} onChange={(event) => setForm((current) => ({ ...current, hostId: event.target.value, receivingDepartment: config.hosts.find((host) => host.id === event.target.value)?.department ?? '' }))} className={inputClass}><option value="">Select an active employee</option>{config.hosts.map((host) => <option key={host.id} value={host.id}>{host.name} — {host.department}</option>)}</select></label> : selectedPurpose?.department ? <div className="sm:col-span-2"><span className={labelClass}>Receiving department</span><div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">Automatically routed to {selectedPurpose.department}</div></div> : <label className="sm:col-span-2"><span className={labelClass}>Receiving department</span><select value={form.receivingDepartment} onChange={(event) => setForm((current) => ({ ...current, receivingDepartment: event.target.value }))} className={inputClass}><option value="">Select a department</option>{config.departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>}<label className="sm:col-span-2"><span className={labelClass}>Expected arrival</span><input type="datetime-local" value={form.expectedArrival} onChange={(event) => setForm((current) => ({ ...current, expectedArrival: event.target.value }))} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} className={inputClass} /></label></div><div className="mt-6 flex justify-between"><button onClick={() => setStep('verification')} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button><button disabled={!detailsValid} onClick={() => setStep('review')} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Review request <ArrowRight className="h-4 w-4" /></button></div></section>}

        {step === 'review' && <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"><h1 className="text-2xl font-black">Review and submit</h1><p className="mt-1 text-sm text-slate-500">Submitting creates a pending request. It does not authorize entry or activate a QR pass.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><NoticeRow title="Visitor">{form.fullName}<br />{form.email}{form.phoneNumber && <><br />{form.phoneNumber}</>}</NoticeRow><NoticeRow title="Identity">{form.idType}{form.idNumberLast4 && <> ending in ••••{form.idNumberLast4}</>}<br /><span className="font-bold text-amber-700">Manual review required</span></NoticeRow><NoticeRow title="Purpose">{selectedPurpose?.label}{form.otherPurpose && <><br />{form.otherPurpose}</>}</NoticeRow><NoticeRow title="Destination">{selectedHost ? `${selectedHost.name} — ${selectedHost.department}` : form.receivingDepartment}<br />{new Date(form.expectedArrival).toLocaleString()}</NoticeRow></div>{error && <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}<div className="mt-6 flex justify-between"><button disabled={submitting} onClick={() => setStep('details')} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Edit details</button><button disabled={submitting} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{submitting ? 'Submitting securely…' : 'Submit pending request'}</button></div></section>}

        {step === 'submitted' && result && <section className="mx-auto w-full max-w-2xl rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-2xl sm:p-12"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-10 w-10" /></div><h1 className="mt-6 text-3xl font-black">Request received</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your visit is <strong>Pending Approval</strong> and identity requires authorized manual review. You are not yet authorized to enter.</p><div className="mt-6 rounded-2xl bg-slate-950 p-5 text-white"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Reference number</p><p className="mt-2 font-mono text-2xl font-black tracking-wide">{result.referenceNumber}</p></div><div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-left text-sm leading-6 text-blue-900"><Mail className="mt-0.5 h-5 w-5 shrink-0" /><p>{result.emailDeliveryStatus === 'ACCEPTED' ? 'The email provider accepted your registration acknowledgment.' : 'Your registration is saved. Email delivery is not yet confirmed; use the secure status link below.'} If approved and cleared, a visit-specific QR pass will be sent separately.</p></div>{result.statusToken && <a href={`/visitor-status/${encodeURIComponent(result.statusToken)}`} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-800 hover:bg-red-100"><ShieldCheck className="h-4 w-4" />Check secure request status</a>}<div><button onClick={reset} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-red-700 px-6 py-3 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" />Reset kiosk</button></div></section>}
      </div>
    </KioskShell>
  );
};

export const VisitorPassPage: React.FC = () => {
  const { token = '' } = useParams();
  const [state, setState] = useState<{ loading: boolean; data?: any; error?: string }>({ loading: true });
  useEffect(() => {
    let active = true;
    void visitorService.inspectVisitorPass(token).then((data) => { if (active) setState({ loading: false, data }); })
      .catch((error) => { if (active) setState({ loading: false, error: errorMessage(error) }); });
    return () => { active = false; };
  }, [token]);
  return <KioskShell><div className="mx-auto flex min-h-[75vh] max-w-xl items-center p-5"><section className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">{state.loading ? <><Loader2 className="mx-auto h-10 w-10 animate-spin text-red-700" /><p className="mt-4 text-sm font-bold">Validating pass…</p></> : state.error ? <><AlertCircle className="mx-auto h-12 w-12 text-rose-600" /><h1 className="mt-4 text-2xl font-black">Pass unavailable</h1><p className="mt-2 text-sm text-slate-600">{state.error}</p></> : <><ShieldCheck className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-4 text-2xl font-black">Active visitor pass</h1><p className="mt-2 text-sm text-slate-600">Present the QR code from your email to authorized security staff.</p><div className="mt-6 space-y-2 rounded-xl bg-slate-50 p-5 text-left text-sm"><p><strong>Reference:</strong> {state.data.referenceNumber}</p><p><strong>Visitor:</strong> {state.data.visitorName}</p><p><strong>Destination:</strong> {state.data.destination}</p><p><strong>Expected:</strong> {new Date(state.data.expectedArrival).toLocaleString()}</p><p><strong>Valid until:</strong> {new Date(state.data.expiresAt).toLocaleString()}</p></div></>}</section></div></KioskShell>;
};

export const VisitorStatusPage: React.FC = () => {
  const { token = '' } = useParams();
  const [state, setState] = useState<{ loading: boolean; data?: Awaited<ReturnType<typeof visitorService.inspectVisitorStatus>>; error?: string }>({ loading: true });
  useEffect(() => {
    let active = true;
    void visitorService.inspectVisitorStatus(token).then((data) => { if (active) setState({ loading: false, data }); })
      .catch((error) => { if (active) setState({ loading: false, error: errorMessage(error) }); });
    return () => { active = false; };
  }, [token]);
  const tone = state.data?.status === 'APPROVED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : state.data?.status === 'DECLINED'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-amber-200 bg-amber-50 text-amber-900';
  return <KioskShell><div className="mx-auto flex min-h-[75vh] max-w-xl items-center p-5"><section className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">{state.loading ? <><Loader2 className="mx-auto h-10 w-10 animate-spin text-red-700" /><p className="mt-4 text-sm font-bold">Checking request status…</p></> : state.error ? <><AlertCircle className="mx-auto h-12 w-12 text-rose-600" /><h1 className="mt-4 text-2xl font-black">Status unavailable</h1><p className="mt-2 text-sm text-slate-600">{state.error}</p></> : state.data && <><ShieldCheck className="mx-auto h-12 w-12 text-red-700" /><h1 className="mt-4 text-2xl font-black">Visitor request status</h1><p className="mt-2 font-mono text-sm font-bold text-slate-600">{state.data.referenceNumber}</p><div className={`mt-6 rounded-2xl border p-5 ${tone}`}><p className="text-xs font-black uppercase tracking-widest">Current status</p><p className="mt-2 text-2xl font-black">{state.data.status}</p></div><p className="mt-5 text-sm leading-6 text-slate-700">{state.data.message}</p><p className="mt-5 text-xs text-slate-500">This high-entropy link is required to view status. A reference number alone cannot access visitor records.</p></>}</section></div></KioskShell>;
};
