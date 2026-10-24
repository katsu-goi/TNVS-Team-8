import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2,
  IdCard, Loader2, LockKeyhole, Mail, RefreshCw, ShieldCheck, UserRound,
} from 'lucide-react';
import { extractApiErrorCode, extractErrorMessage, extractRequestId } from '../../api/client';
import { visitorService, type KioskConfig, type KioskRegistration } from '../../api/visitorService';
import { VisitorIdScanner } from './VisitorIdScanner';
import { PrivacyNoticeStep } from './PrivacyNoticeStep';
import { VisitorSelfieCapture } from './VisitorSelfieCapture';
import type { DocumentScreeningResult } from './visitorDocumentScreening';

type Step = 'welcome' | 'privacy' | 'id' | 'verification' | 'details' | 'review' | 'submitted';

export type VisitorKioskFormState = {
  fullName: string;
  email: string;
  phoneNumber: string;
  company: string;
  idType: string;
  idNumberLast4: string;
  idExpirationDate: string;
  idIssuingAuthority: string;
  idImage: string;
  imageConfirmed: boolean;
  purposeCategory: string;
  otherPurpose: string;
  hostId: string;
  receivingDepartment: string;
  expectedArrival: string;
};

const emptyForm: VisitorKioskFormState = {
  fullName: '', email: '', phoneNumber: '', company: '', idType: '', idNumberLast4: '', idExpirationDate: '', idIssuingAuthority: '',
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

function publicStatusError(error: unknown): { error: string; requestId?: string } {
  const code = extractApiErrorCode(error);
  const requestId = extractRequestId(error) || undefined;
  if (code === 'VISITOR_STATUS_INVALID') {
    return { error: 'This secure visitor status link is invalid. Check that the complete link was opened.', requestId };
  }
  if (code === 'VISITOR_STATUS_EXPIRED') {
    return { error: 'This secure visitor status link has expired. Contact reception if you still need an update.', requestId };
  }
  return {
    error: 'We could not load your visitor status right now. Please try again. If the problem continues, contact reception.',
    requestId,
  };
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

const FieldSourceBadge: React.FC<{ source: IdFieldSources[IdReviewField]; optional?: boolean }> = ({ source, optional }) => (
  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${source === 'OCR' ? 'bg-blue-100 text-blue-800' : source === 'MANUAL' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>
    {source === 'OCR' ? 'OCR extracted' : source === 'MANUAL' ? 'Manually entered' : optional ? 'Optional - not read' : 'Manual entry required'}
  </span>
);

export const VisitorKioskPage: React.FC = () => {
  const [step, setStep] = useState<Step>('welcome');
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [form, setForm] = useState<VisitorKioskFormState>(emptyForm);
  const formRef = useRef<VisitorKioskFormState>(emptyForm);
  const [documentScreening, setDocumentScreening] = useState<DocumentScreeningResult | null>(null);
  const [idFieldSources, setIdFieldSources] = useState<IdFieldSources>(() => createEmptyIdFieldSources());
  const idFieldSourcesRef = useRef<IdFieldSources>(createEmptyIdFieldSources());
  const [selfieImage, setSelfieImage] = useState('');
  const [biometricAuthorization, setBiometricAuthorization] = useState(false);
  const [manualAlternativeRequested, setManualAlternativeRequested] = useState(false);
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
  useEffect(() => { formRef.current = form; }, [form]);

  const updateIdFieldSources = (next: IdFieldSources) => {
    idFieldSourcesRef.current = next;
    setIdFieldSources(next);
  };

  useEffect(() => {
    const screeningName = documentScreening?.classification === 'SUPPORTED_ID_TYPE'
      ? documentScreening.extracted.fullName.trim()
      : '';
    if (idFieldSourcesRef.current.fullName === 'OCR' && form.fullName.trim() !== screeningName) {
      updateIdFieldSources({
        ...idFieldSourcesRef.current,
        fullName: form.fullName.trim() ? 'MANUAL' : 'EMPTY',
      });
    }
  }, [documentScreening, form.fullName]);

  const updateManualIdField = (field: IdReviewField, value: string) => {
    const nextForm = { ...formRef.current, [field]: value };
    formRef.current = nextForm;
    setForm(nextForm);
    updateIdFieldSources({
      ...idFieldSourcesRef.current,
      [field]: value.trim() ? 'MANUAL' : 'EMPTY',
    });
  };

  const clearOcrDerivedFields = () => {
    const currentSources = idFieldSourcesRef.current;
    const nextForm = { ...formRef.current };
    extractedFieldMap.forEach(({ formField }) => {
      if (currentSources[formField] === 'OCR') nextForm[formField] = '';
    });
    formRef.current = nextForm;
    setForm(nextForm);
    updateIdFieldSources(Object.fromEntries(
      Object.entries(currentSources).map(([field, source]) => [field, source === 'OCR' ? 'EMPTY' : source]),
    ) as IdFieldSources);
  };

  const applyScreening = (screening: DocumentScreeningResult | null) => {
    setDocumentScreening(screening);
    if (!screening) return;
    const applied = applyOcrExtraction(formRef.current, idFieldSourcesRef.current, screening);
    formRef.current = applied.form;
    updateIdFieldSources(applied.sources);
    setForm(applied.form);
  };

  const selectIdType = (idType: string) => {
    const sources = idFieldSourcesRef.current;
    const nextSources: IdFieldSources = {
      fullName: sources.fullName === 'MANUAL' ? 'MANUAL' : 'EMPTY',
      idNumberLast4: 'EMPTY', idExpirationDate: 'EMPTY', idIssuingAuthority: 'EMPTY',
    };
    const nextForm: VisitorKioskFormState = {
      ...formRef.current,
      idType,
      fullName: sources.fullName === 'MANUAL' ? formRef.current.fullName : '',
      idNumberLast4: '', idExpirationDate: '', idIssuingAuthority: '', idImage: '', imageConfirmed: false,
    };
    formRef.current = nextForm;
    updateIdFieldSources(nextSources);
    setDocumentScreening(null);
    setForm(nextForm);
  };

  const updateIdImage = (idImage: string, imageConfirmed: boolean) => {
    if (!idImage) clearOcrDerivedFields();
    const nextForm = { ...formRef.current, idImage, imageConfirmed };
    formRef.current = nextForm;
    setForm(nextForm);
  };

  const idStepIssues = useMemo(() => {
    const issues: string[] = [];
    if (!form.idType) issues.push('Select an approved ID type.');
    if (form.idType && documentScreening?.classification !== 'SUPPORTED_ID_TYPE') issues.push('The document type has not been confirmed by OCR screening.');
    if (documentScreening?.classification === 'SUPPORTED_ID_TYPE' && !form.idImage) issues.push('Capture or upload the supported ID image.');
    if (form.idImage && !form.imageConfirmed) issues.push('Select "Use photo" after reviewing the captured image.');
    if (documentScreening?.classification === 'SUPPORTED_ID_TYPE' && form.fullName.trim().length < 2) issues.push("Enter the visitor's full name because OCR could not read it reliably.");
    return issues;
  }, [documentScreening?.classification, form.fullName, form.idImage, form.idType, form.imageConfirmed]);
  const idStepReady = idStepIssues.length === 0;

  const reset = () => {
    formRef.current = emptyForm; setStep('welcome'); setPrivacyAcknowledged(false); setForm(emptyForm); setDocumentScreening(null); updateIdFieldSources(createEmptyIdFieldSources()); setSelfieImage(''); setBiometricAuthorization(false); setManualAlternativeRequested(false); setResult(null); setError(''); setIdempotencyKey(crypto.randomUUID());
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
      idExpirationDate: form.idExpirationDate.trim() || undefined,
      idIssuingAuthority: form.idIssuingAuthority.trim() || undefined,
      documentScreening: documentScreening ? {
        ocrStatus: documentScreening.ocrStatus,
        classification: documentScreening.classification,
        detectedIdType: documentScreening.detectedIdType,
        warnings: documentScreening.warnings,
        textQuality: documentScreening.textQuality,
      } : undefined,
      selfieImage: selfieImage ? { dataUrl: selfieImage } : undefined,
      biometricAuthorization: selfieImage ? biometricAuthorization : undefined,
      manualAlternativeRequested,
      idImage: { dataUrl: form.idImage, confirmedReadable: true }, purposeCategory: form.purposeCategory,
      otherPurpose: form.otherPurpose.trim() || undefined, hostId: form.hostId || undefined,
      receivingDepartment: selectedHost?.department || form.receivingDepartment || undefined,
      expectedArrival: new Date(form.expectedArrival).toISOString(),
    };
    try {
      const saved = await visitorService.submitKioskRegistration(payload);
      setResult(saved); setForm((current) => ({ ...current, idImage: '', idNumberLast4: '' })); setSelfieImage(''); setBiometricAuthorization(false); setStep('submitted');
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
                <select value={form.idType} onChange={(event) => selectIdType(event.target.value)} className={inputClass}>
                  <option value="">Select an approved ID</option>
                  {config.privacy.acceptedIdTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <label className="mt-4 block">
                  <span className={labelClass}>Last 4 ID characters (optional)</span>
                  <input maxLength={4} value={form.idNumberLast4} onChange={(event) => updateManualIdField('idNumberLast4', event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} className={inputClass} autoComplete="off" />
                  <FieldSourceBadge source={idFieldSources.idNumberLast4} optional />
                  <span className="mt-1 block text-xs text-slate-500">Only the last four are requested to reduce retained ID data.</span>
                </label>
                <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-800"><strong>OCR screening:</strong> Tesseract.js runs locally after capture. It assists transcription and document-category screening only; it does not prove authenticity or identity.</div>
              </div>
              <VisitorIdScanner
                key={form.idType || 'no-id-type'}
                image={form.idImage}
                confirmed={form.imageConfirmed}
                selectedIdType={form.idType}
                acceptedIdTypes={config.privacy.acceptedIdTypes}
                onImageChange={updateIdImage}
                onScreeningChange={applyScreening}
              />
            </div>
            {documentScreening?.classification === 'SUPPORTED_ID_TYPE' && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
              <h2 className="text-lg font-black text-slate-950">Review Your ID Information</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">Correct OCR mistakes before continuing. Empty optional fields may be left blank. OCR assists transcription and category screening; it does not establish authenticity.</p>
              <div className="mt-3 rounded-xl border border-blue-200 bg-white/80 p-3 text-xs font-semibold text-blue-900">
                {documentScreening.extracted.fullName || documentScreening.extracted.expirationDate || documentScreening.extracted.issuingAuthority || documentScreening.extracted.idNumberLast4
                  ? 'Information extracted. Please review every value before continuing.'
                  : 'Some details could not be read. Enter the required full name manually; other fields are optional when they are not shown or readable.'}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label><span className={labelClass}>Full name</span><input aria-label="ID review full name" value={form.fullName} onChange={(event) => updateManualIdField('fullName', event.target.value)} maxLength={150} className={inputClass} /><FieldSourceBadge source={idFieldSources.fullName} /></label>
                <div><span className={labelClass}>OCR-confirmed ID type</span><div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm font-bold text-blue-950">{documentScreening.detectedIdType}</div><span className="mt-1 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-blue-800">OCR classified</span></div>
                <label><span className={labelClass}>Last 4 ID characters (optional)</span><input aria-label="ID review last four characters" value={form.idNumberLast4} onChange={(event) => updateManualIdField('idNumberLast4', event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} maxLength={4} className={inputClass} autoComplete="off" /><FieldSourceBadge source={idFieldSources.idNumberLast4} optional /></label>
                <label><span className={labelClass}>Expiration date (when shown)</span><input aria-label="ID expiration date" value={form.idExpirationDate} onChange={(event) => updateManualIdField('idExpirationDate', event.target.value)} maxLength={40} className={inputClass} placeholder="Leave blank if not shown" /><FieldSourceBadge source={idFieldSources.idExpirationDate} optional /></label>
                <label><span className={labelClass}>Issuing authority (when shown)</span><input aria-label="ID issuing authority" value={form.idIssuingAuthority} onChange={(event) => updateManualIdField('idIssuingAuthority', event.target.value)} maxLength={120} className={inputClass} placeholder="Leave blank if not readable" /><FieldSourceBadge source={idFieldSources.idIssuingAuthority} optional /></label>
              </div>
              {documentScreening.warnings.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-amber-900">{documentScreening.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            </div>}
            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep('privacy')} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button>
              <button disabled={!idStepReady} onClick={() => setStep('verification')} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Confirm and Continue <ArrowRight className="h-4 w-4" /></button>
            </div>
            {!idStepReady && <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">Complete the following before continuing:</p><ul className="mt-1 list-disc pl-5">{idStepIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          </section>
        )}

        {step === 'verification' && <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10"><div className="mx-auto max-w-2xl text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><UserRound className="h-8 w-8" /></div><h1 className="mt-5 text-2xl font-black">Verify Your Identity</h1><p className="mt-3 text-sm leading-7 text-slate-600">{config.privacy.identityVerification.message}</p>{config.privacy.identityVerification.status === 'ENABLED' ? <div className="mt-6 text-left"><div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950"><p className="font-extrabold">Biometric-processing notice</p><p className="mt-1">{config.privacy.identityVerification.biometricNotice}</p><p className="mt-3">A DeepFace comparison is supporting evidence only. It does not authenticate the ID and cannot approve your identity or visit.</p></div><label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" checked={biometricAuthorization} disabled={manualAlternativeRequested} onChange={(event) => { setBiometricAuthorization(event.target.checked); if (!event.target.checked) setSelfieImage(''); }} className="mt-1 h-5 w-5 accent-red-700" /><span className="text-sm font-semibold">{config.privacy.identityVerification.authorizationText}</span></label><VisitorSelfieCapture image={selfieImage} authorized={biometricAuthorization && !manualAlternativeRequested} onImageChange={setSelfieImage} /><button type="button" onClick={() => { setManualAlternativeRequested(true); setBiometricAuthorization(false); setSelfieImage(''); }} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-800">Request Manual Verification</button>{manualAlternativeRequested && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Manual verification selected. No selfie will be collected. {config.privacy.alternativeVerification}</p>}</div> : <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-left text-sm leading-6 text-amber-900"><p className="font-extrabold">No face image will be collected in this configuration.</p><p className="mt-1">Production biometric processing remains disabled until every organizational approval and safeguard is complete.</p><p className="mt-3"><strong>Approved alternative:</strong> {config.privacy.alternativeVerification}</p></div>}</div><div className="mt-8 flex justify-between"><button onClick={() => setStep('id')} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button><button disabled={config.privacy.identityVerification.status === 'ENABLED' && !manualAlternativeRequested && !(biometricAuthorization && selfieImage)} onClick={() => setStep('details')} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300">{manualAlternativeRequested || config.privacy.identityVerification.status !== 'ENABLED' ? 'Continue for manual review' : 'Continue'} <ArrowRight className="h-4 w-4" /></button></div></section>}

        {step === 'details' && <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"><h1 className="text-2xl font-black">Visitor and visit details</h1><p className="mt-1 text-sm text-slate-500">Provide only the information needed to route and approve this visit.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Full name</span><input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} className={inputClass} autoComplete="name" maxLength={150} /></label><label><span className={labelClass}>Email for QR pass</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} autoComplete="email" /></label><label><span className={labelClass}>Phone number (optional)</span><input value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} className={inputClass} autoComplete="tel" maxLength={30} /></label><label><span className={labelClass}>Organization (required for government visits)</span><input value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} className={inputClass} maxLength={150} /></label><label className="sm:col-span-2"><span className={labelClass}>Purpose of visit</span><select value={form.purposeCategory} onChange={(event) => { const purpose = config.purposes.find((item) => item.value === event.target.value); setForm((current) => ({ ...current, purposeCategory: event.target.value, hostId: '', receivingDepartment: purpose?.department ?? '', otherPurpose: '' })); }} className={inputClass}><option value="">Select a purpose</option>{config.purposes.map((purpose) => <option key={purpose.value} value={purpose.value}>{purpose.label}</option>)}</select></label>{form.purposeCategory === 'OTHER' && <label className="sm:col-span-2"><span className={labelClass}>Explain the other purpose</span><textarea value={form.otherPurpose} onChange={(event) => setForm((current) => ({ ...current, otherPurpose: event.target.value }))} className={inputClass} rows={3} minLength={3} maxLength={500} /><span className="mt-1 block text-right text-xs text-slate-400">{form.otherPurpose.length}/500</span></label>}{form.purposeCategory === 'MEETING_EMPLOYEE' || form.purposeCategory === 'BUSINESS_MEETING' ? <label className="sm:col-span-2"><span className={labelClass}>{form.purposeCategory === 'MEETING_EMPLOYEE' ? 'Employee host' : 'Intended host (if applicable)'}</span><select value={form.hostId} onChange={(event) => setForm((current) => ({ ...current, hostId: event.target.value, receivingDepartment: config.hosts.find((host) => host.id === event.target.value)?.department ?? '' }))} className={inputClass}><option value="">Select an active employee</option>{config.hosts.map((host) => <option key={host.id} value={host.id}>{host.name} — {host.department}</option>)}</select></label> : selectedPurpose?.department ? <div className="sm:col-span-2"><span className={labelClass}>Receiving department</span><div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">Automatically routed to {selectedPurpose.department}</div></div> : <label className="sm:col-span-2"><span className={labelClass}>Receiving department</span><select value={form.receivingDepartment} onChange={(event) => setForm((current) => ({ ...current, receivingDepartment: event.target.value }))} className={inputClass}><option value="">Select a department</option>{config.departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>}<label className="sm:col-span-2"><span className={labelClass}>Expected arrival</span><input type="datetime-local" value={form.expectedArrival} onChange={(event) => setForm((current) => ({ ...current, expectedArrival: event.target.value }))} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} className={inputClass} /></label></div><div className="mt-6 flex justify-between"><button onClick={() => setStep('verification')} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button><button disabled={!detailsValid} onClick={() => setStep('review')} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Review request <ArrowRight className="h-4 w-4" /></button></div></section>}

        {step === 'review' && <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"><h1 className="text-2xl font-black">Review and submit</h1><p className="mt-1 text-sm text-slate-500">Submitting creates a pending request. It does not authorize entry or activate a QR pass.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><NoticeRow title="Visitor">{form.fullName}<br />{form.email}{form.phoneNumber && <><br />{form.phoneNumber}</>}</NoticeRow><NoticeRow title="Identity">{form.idType}{form.idNumberLast4 && <> ending in ••••{form.idNumberLast4}</>}<br /><span className="font-bold text-amber-700">Manual review required</span></NoticeRow><NoticeRow title="Purpose">{selectedPurpose?.label}{form.otherPurpose && <><br />{form.otherPurpose}</>}</NoticeRow><NoticeRow title="Destination">{selectedHost ? `${selectedHost.name} — ${selectedHost.department}` : form.receivingDepartment}<br />{new Date(form.expectedArrival).toLocaleString()}</NoticeRow></div>{error && <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}<div className="mt-6 flex justify-between"><button disabled={submitting} onClick={() => setStep('details')} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Edit details</button><button disabled={submitting} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{submitting ? 'Submitting securely…' : 'Submit pending request'}</button></div></section>}

        {step === 'submitted' && result && <section className="mx-auto w-full max-w-2xl rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-2xl sm:p-12"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-10 w-10" /></div><h1 className="mt-6 text-3xl font-black">Request received</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your visit is <strong>Pending Approval</strong> and identity requires authorized manual review. You are not yet authorized to enter.</p><div className="mt-6 rounded-2xl bg-slate-950 p-5 text-white"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Reference number</p><p className="mt-2 font-mono text-2xl font-black tracking-wide">{result.referenceNumber}</p></div><div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-left text-sm leading-6 text-blue-900"><Mail className="mt-0.5 h-5 w-5 shrink-0" /><p>{result.emailDeliveryStatus === 'ACCEPTED' ? 'The email provider accepted your registration acknowledgment.' : 'Your registration is saved. Email delivery is not yet confirmed; use the secure status link below.'} If approved and cleared, a visit-specific QR pass will be sent separately.</p></div>{result.statusToken && <a href={`/visitor-status/${encodeURIComponent(result.statusToken)}`} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-800 hover:bg-red-100"><ShieldCheck className="h-4 w-4" />Check secure request status</a>}<div><button onClick={reset} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-red-700 px-6 py-3 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" />Reset kiosk</button></div></section>}
      </div>
    </KioskShell>
  );
};

export const VisitorPassPage: React.FC = () => {
  const { token = '' } = useParams();
  const [state, setState] = useState<{ loading: boolean; data?: Awaited<ReturnType<typeof visitorService.inspectVisitorPass>>; error?: string }>({ loading: true });
  const loadPass = useCallback(async (isActive: () => boolean = () => true) => {
    setState({ loading: true });
    try {
      const data = await visitorService.inspectVisitorPass(token);
      if (isActive()) setState({ loading: false, data });
    } catch (error) {
      if (isActive()) setState({ loading: false, error: errorMessage(error) });
    }
  }, [token]);
  useEffect(() => {
    let active = true;
    void loadPass(() => active);
    return () => { active = false; };
  }, [loadPass]);
  const formatSchedule = (value: string) => `${new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  })} PHT`;
  const scheduled = state.data?.status === 'NOT_YET_VALID';
  return <KioskShell><div className="mx-auto flex min-h-[75vh] max-w-xl items-center p-5"><section className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">{state.loading ? <><Loader2 className="mx-auto h-10 w-10 animate-spin text-red-700" /><p className="mt-4 text-sm font-bold">Validating pass…</p></> : state.error ? <><AlertCircle className="mx-auto h-12 w-12 text-rose-600" /><h1 className="mt-4 text-2xl font-black">Pass unavailable</h1><p className="mt-2 text-sm text-slate-600">{state.error}</p><button type="button" onClick={() => void loadPass()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" />Try again</button></> : state.data && <><ShieldCheck className={`mx-auto h-12 w-12 ${scheduled ? 'text-amber-600' : 'text-emerald-600'}`} /><h1 className="mt-4 text-2xl font-black">{scheduled ? 'Visitor pass approved' : 'Active visitor pass'}</h1><p className="mt-2 text-sm text-slate-600">{scheduled ? <>Entry is not active yet. This pass becomes valid on <strong>{formatSchedule(state.data.validFrom)}</strong>.</> : 'Present the QR code from your email to authorized security staff.'}</p><div className={`mt-6 rounded-xl border p-4 text-sm font-bold ${scheduled ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{scheduled ? 'APPROVED — NOT YET VALID' : 'ACTIVE'}</div><div className="mt-5 space-y-2 rounded-xl bg-slate-50 p-5 text-left text-sm"><p><strong>Reference:</strong> {state.data.referenceNumber}</p><p><strong>Visitor:</strong> {state.data.visitorName}</p><p><strong>Destination:</strong> {state.data.destination}</p><p><strong>Expected arrival:</strong> {formatSchedule(state.data.expectedArrival)}</p><p><strong>Valid from:</strong> {formatSchedule(state.data.validFrom)}</p><p><strong>Valid until:</strong> {formatSchedule(state.data.expiresAt)}</p></div>{scheduled && <button type="button" onClick={() => void loadPass()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" />Check activation</button>}</>}</section></div></KioskShell>;
};

export type IdReviewField = 'fullName' | 'idNumberLast4' | 'idExpirationDate' | 'idIssuingAuthority';
export type IdFieldSources = Record<IdReviewField, 'EMPTY' | 'OCR' | 'MANUAL'>;

const createEmptyIdFieldSources = (): IdFieldSources => ({
  fullName: 'EMPTY', idNumberLast4: 'EMPTY', idExpirationDate: 'EMPTY', idIssuingAuthority: 'EMPTY',
});

const extractedFieldMap: Array<{
  formField: IdReviewField;
  extractedField: 'fullName' | 'idNumberLast4' | 'expirationDate' | 'issuingAuthority';
  maxLength: number;
}> = [
  { formField: 'fullName', extractedField: 'fullName', maxLength: 150 },
  { formField: 'idNumberLast4', extractedField: 'idNumberLast4', maxLength: 4 },
  { formField: 'idExpirationDate', extractedField: 'expirationDate', maxLength: 40 },
  { formField: 'idIssuingAuthority', extractedField: 'issuingAuthority', maxLength: 120 },
];

export function applyOcrExtraction(
  form: VisitorKioskFormState,
  sources: IdFieldSources,
  screening: DocumentScreeningResult,
): { form: VisitorKioskFormState; sources: IdFieldSources } {
  if (screening.ocrStatus !== 'SUCCEEDED' || screening.classification !== 'SUPPORTED_ID_TYPE'
    || !screening.detectedIdType || screening.detectedIdType.trim().toLowerCase() !== form.idType.trim().toLowerCase()) {
    return { form, sources };
  }
  const nextForm = { ...form };
  const nextSources = { ...sources };
  extractedFieldMap.forEach(({ formField, extractedField, maxLength }) => {
    if (sources[formField] === 'MANUAL') return;
    const raw = screening.extracted?.[extractedField];
    if (typeof raw !== 'string') return;
    let value = raw.replace(/\s+/g, ' ').trim().slice(0, maxLength);
    if (formField === 'idNumberLast4') value = value.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
    if (!value) return;
    nextForm[formField] = value;
    nextSources[formField] = 'OCR';
  });
  return { form: nextForm, sources: nextSources };
}

export const VisitorStatusPage: React.FC = () => {
  const { token = '' } = useParams();
  const [state, setState] = useState<{ loading: boolean; data?: Awaited<ReturnType<typeof visitorService.inspectVisitorStatus>>; error?: string; requestId?: string }>({ loading: true });
  const loadStatus = useCallback(async (isActive: () => boolean = () => true) => {
    setState({ loading: true });
    try {
      const data = await visitorService.inspectVisitorStatus(token);
      if (isActive()) setState({ loading: false, data });
    } catch (error) {
      if (isActive()) setState({ loading: false, ...publicStatusError(error) });
    }
  }, [token]);
  useEffect(() => {
    let active = true;
    void loadStatus(() => active);
    return () => { active = false; };
  }, [loadStatus]);
  const tone = state.data?.status === 'APPROVED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : state.data?.status === 'DECLINED'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-amber-200 bg-amber-50 text-amber-900';
  const statusLabel = state.data?.status.replace(/_/g, ' ');
  return <KioskShell><div className="mx-auto flex min-h-[75vh] max-w-xl items-center p-5"><section className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">{state.loading ? <><Loader2 className="mx-auto h-10 w-10 animate-spin text-red-700" /><p className="mt-4 text-sm font-bold">Checking request status…</p></> : state.error ? <><AlertCircle className="mx-auto h-12 w-12 text-rose-600" /><h1 className="mt-4 text-2xl font-black">Status unavailable</h1><p className="mt-2 text-sm text-slate-600">{state.error}</p>{state.requestId && <p className="mt-3 font-mono text-xs text-slate-500">Support reference: {state.requestId}</p>}<button type="button" onClick={() => void loadStatus()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" />Try again</button></> : state.data && <><ShieldCheck className="mx-auto h-12 w-12 text-red-700" /><h1 className="mt-4 text-2xl font-black">Visitor request status</h1><p className="mt-2 font-mono text-sm font-bold text-slate-600">{state.data.referenceNumber}</p><div className={`mt-6 rounded-2xl border p-5 ${tone}`}><p className="text-xs font-black uppercase tracking-widest">Current status</p><p className="mt-2 text-2xl font-black">{statusLabel}</p></div><p className="mt-5 text-sm leading-6 text-slate-700">{state.data.message}</p><p className="mt-5 text-xs text-slate-500">This high-entropy link is required to view status. A reference number alone cannot access visitor records.</p></>}</section></div></KioskShell>;
};
