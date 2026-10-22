import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Save } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import {
  visitorKioskConfigService,
  type VisitorKioskAdminConfig,
  type VisitorKioskAdminState,
} from '../../api/visitorKioskConfigService';
import { Button, PageHeader, TextAreaField } from '../ui/SharedUI';

const purposeLabels: Record<string, string> = {
  DRIVER_PARTNER_ASSISTANCE: 'Driver-partner inquiry or assistance',
  DRIVER_PARTNER_ONBOARDING: 'Driver-partner onboarding or requirements',
  HR_RECRUITMENT: 'Human Resources or recruitment',
  DOCUMENT_TRANSACTION: 'Document submission or collection',
  DELIVERY_PICKUP: 'Delivery or pickup',
  FLEET_OPERATIONS: 'Vehicle, fleet, or operations concern',
  MAINTENANCE_SERVICE: 'Maintenance or service visit',
  GOVERNMENT_REGULATORY: 'Government or regulatory transaction',
};

const fieldClass = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/10';
const sectionClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; requiredByPolicy?: boolean; hint?: string }> = ({ label, requiredByPolicy, hint, ...props }) => (
  <label className="block">
    <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}{requiredByPolicy && <span className="ml-1 text-red-600">Required</span>}</span>
    <input {...props} className={fieldClass} />
    {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
  </label>
);

const PolicyArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }> = ({ label, hint, ...props }) => (
  <TextAreaField {...props} required label={label} hint={hint} className="min-h-28" />
);

function localConfigurationComplete(config: VisitorKioskAdminConfig, fixedPurposes: string[], departments: string[]): boolean {
  const textValues = [
    config.organizationName, config.controllerName, config.controllerContact, config.dpoContact,
    config.processingPurposes, config.lawfulBasis, config.privacyNoticeText, config.acknowledgementText,
    config.noticeVersion, config.retentionPolicy, config.rightsProcess, config.processors,
    config.safeguards, config.alternativeVerification,
  ];
  const validRoutes = fixedPurposes.every((purpose) => departments.includes(config.purposeDepartmentRoutes[purpose] ?? ''));
  return textValues.every((value) => value.trim()) && Boolean(config.retentionDays && config.retentionDays > 0)
    && config.acceptedIdTypes.length > 0 && validRoutes && config.privacyReviewApproved
    && config.securityReviewApproved && config.operationsReviewApproved;
}

export const VisitorKioskConfigPage: React.FC = () => {
  const [state, setState] = useState<VisitorKioskAdminState | null>(null);
  const [form, setForm] = useState<VisitorKioskAdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [changeReason, setChangeReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const loaded = await visitorKioskConfigService.load();
      setState(loaded); setForm(loaded.config);
    } catch (loadError) { setError(extractErrorMessage(loadError)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const localComplete = useMemo(() => Boolean(form && state && localConfigurationComplete(
    form, state.fixedDepartmentPurposes, state.availableDepartments,
  )), [form, state]);

  const update = <K extends keyof VisitorKioskAdminConfig>(key: K, value: VisitorKioskAdminConfig[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!form || !state || changeReason.trim().length < 10) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await visitorKioskConfigService.update({
        organizationName: form.organizationName,
        controllerName: form.controllerName,
        controllerContact: form.controllerContact,
        dpoContact: form.dpoContact,
        processingPurposes: form.processingPurposes,
        lawfulBasis: form.lawfulBasis,
        privacyNoticeText: form.privacyNoticeText,
        acknowledgementText: form.acknowledgementText,
        noticeVersion: form.noticeVersion,
        retentionPolicy: form.retentionPolicy,
        retentionDays: form.retentionDays,
        rightsProcess: form.rightsProcess,
        processors: form.processors,
        safeguards: form.safeguards,
        alternativeVerification: form.alternativeVerification,
        acceptedIdTypes: form.acceptedIdTypes,
        purposeDepartmentRoutes: form.purposeDepartmentRoutes,
        registrationEnabled: form.registrationEnabled,
        privacyReviewApproved: form.privacyReviewApproved,
        securityReviewApproved: form.securityReviewApproved,
        operationsReviewApproved: form.operationsReviewApproved,
        expectedRevision: form.revision,
        changeReason: changeReason.trim(),
      });
      setState(saved); setForm(saved.config); setChangeReason('');
      setNotice(saved.readiness.ready ? 'Configuration saved. Public visitor registration is enabled.' : 'Configuration saved. Registration remains disabled until every readiness requirement is complete.');
    } catch (saveError) { setError(extractErrorMessage(saveError)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-red-700" /><span className="ml-3 text-sm text-slate-600">Loading visitor kiosk policy…</span></div>;
  if (!form || !state) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800"><AlertCircle className="mb-3 h-7 w-7" /><p className="font-bold">Visitor kiosk configuration is unavailable.</p><p className="mt-1 text-sm">{error}</p><Button className="mt-4" onClick={() => void load()}>Try again</Button></div>;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader eyebrow="Privacy & Visitor Operations" title="Visitor Kiosk Configuration" description="Administrator-managed privacy, identity-review, routing, and activation controls" />

      <div className={`rounded-2xl border p-5 ${state.readiness.ready ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            {state.readiness.ready ? <CheckCircle2 className="h-6 w-6 text-emerald-700" /> : <AlertTriangle className="h-6 w-6 text-amber-700" />}
            <div><h2 className="font-black text-slate-900">{state.readiness.ready ? 'Registration enabled' : 'Registration is not ready'}</h2><p className="mt-1 text-sm text-slate-700">Effective readiness is calculated by the backend from saved policy fields, active departments, recorded reviews, and the enable switch.</p></div>
          </div>
          <a href="/visitor-kiosk" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"><ExternalLink className="h-4 w-4" />Open public kiosk</a>
        </div>
        {!state.readiness.ready && <div className="mt-4 flex flex-wrap gap-2">{state.readiness.missing.map((item) => <span key={item} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">{item}</span>)}</div>}
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

      <section className={sectionClass}>
        <h2 className="text-lg font-black text-slate-900">Organization and privacy controller</h2>
        <p className="mt-1 text-sm text-amber-700">These are legally significant notice details. Supply only organization-approved information; the application will not infer a DPO or legal basis.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Organization name" requiredByPolicy value={form.organizationName} onChange={(e) => update('organizationName', e.target.value)} maxLength={200} />
          <Field label="Privacy notice version" requiredByPolicy value={form.noticeVersion} onChange={(e) => update('noticeVersion', e.target.value)} maxLength={80} />
          <Field label="Personal information controller" requiredByPolicy value={form.controllerName} onChange={(e) => update('controllerName', e.target.value)} maxLength={200} />
          <Field label="Controller contact" requiredByPolicy value={form.controllerContact} onChange={(e) => update('controllerContact', e.target.value)} maxLength={300} />
          <div className="md:col-span-2"><Field label="DPO / privacy contact" requiredByPolicy value={form.dpoContact} onChange={(e) => update('dpoContact', e.target.value)} maxLength={300} hint="Must be supplied or approved by the organization. Do not enter invented contact details." /></div>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-black text-slate-900">Purpose, lawful basis, and notice</h2>
        <div className="mt-5 grid gap-5">
          <PolicyArea label="Processing purposes and information collected" value={form.processingPurposes} onChange={(e) => update('processingPurposes', e.target.value)} maxLength={4000} />
          <PolicyArea label="Lawful basis" value={form.lawfulBasis} onChange={(e) => update('lawfulBasis', e.target.value)} maxLength={4000} hint="Requires DPO/legal approval for the actual processing activities." />
          <PolicyArea label="Public privacy notice" value={form.privacyNoticeText} onChange={(e) => update('privacyNoticeText', e.target.value)} maxLength={12000} />
          <PolicyArea label="Visitor acknowledgment statement" value={form.acknowledgementText} onChange={(e) => update('acknowledgementText', e.target.value)} maxLength={2000} hint="This must not be presented as blanket consent when another lawful basis applies." />
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-black text-slate-900">Identity data and retention</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2"><PolicyArea label="Approved government or organization ID types" value={form.acceptedIdTypes.join('\n')} onChange={(e) => update('acceptedIdTypes', e.target.value.split(/\r?\n|\|/).map((value) => value.trim()).filter(Boolean))} hint="One approved ID label per line. No default list is assumed." /></div>
          <Field type="number" min={1} max={3650} label="Identity-image retention days" requiredByPolicy value={form.retentionDays ?? ''} onChange={(e) => update('retentionDays', e.target.value ? Number(e.target.value) : null)} />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><p className="font-bold text-slate-800">Secure deletion</p><p className="mt-1">The existing private bucket and service-only cleanup function remain in force. An authorized scheduled cleanup job is still required operationally.</p></div>
          <div className="md:col-span-2"><PolicyArea label="Retention and secure deletion policy" value={form.retentionPolicy} onChange={(e) => update('retentionPolicy', e.target.value)} maxLength={4000} /></div>
          <PolicyArea label="Safeguards" value={form.safeguards} onChange={(e) => update('safeguards', e.target.value)} maxLength={4000} />
          <PolicyArea label="Authorized processors and service providers" value={form.processors} onChange={(e) => update('processors', e.target.value)} maxLength={4000} hint="List only processors covered by an approved arrangement." />
          <PolicyArea label="Data subject rights and request procedure" value={form.rightsProcess} onChange={(e) => update('rightsProcess', e.target.value)} maxLength={4000} />
          <PolicyArea label="Alternative/manual identity verification" value={form.alternativeVerification} onChange={(e) => update('alternativeVerification', e.target.value)} maxLength={4000} />
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-black text-slate-900">Purpose routing</h2>
        <p className="mt-1 text-sm text-slate-500">Each fixed-purpose route must reference a department with at least one active employee. Readiness automatically fails if that department becomes inactive.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">{state.fixedDepartmentPurposes.map((purpose) => <label key={purpose} className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-600">{purposeLabels[purpose] ?? purpose}</span><select className={fieldClass} value={form.purposeDepartmentRoutes[purpose] ?? ''} onChange={(e) => update('purposeDepartmentRoutes', { ...form.purposeDepartmentRoutes, [purpose]: e.target.value })}><option value="">Select an active department</option>{state.availableDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>)}</div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-black text-slate-900">Required organizational reviews</h2>
        <p className="mt-1 text-sm text-amber-700">Checking a review records the authenticated administrator and timestamp. It is an attestation that the named organizational review actually occurred—not a compliance certification generated by the application.</p>
        <div className="mt-5 grid gap-3">{([
          ['privacyReviewApproved', 'DPO / privacy review completed'],
          ['securityReviewApproved', 'Security and private-storage safeguards reviewed'],
          ['operationsReviewApproved', 'Visitor operations, manual review, retention, and routing approved'],
        ] as const).map(([key, label]) => <label key={key} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" className="mt-1 h-5 w-5 accent-red-700" checked={form[key]} onChange={(e) => update(key, e.target.checked)} /><span><span className="block text-sm font-bold text-slate-800">{label}</span><span className="text-xs text-slate-500">Organization approval required.</span></span></label>)}</div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-black text-slate-900">Technical status and activation</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ['Public URL', state.technical.publicUrl || 'Not configured'],
          ['Email delivery', state.technical.emailDeliveryConfigured ? 'Configured' : 'Not configured'],
          ['Pass validity policy', state.technical.passPolicyConfigured ? 'Configured' : 'Not configured'],
          ['Identity verification', state.technical.identityVerificationStatus],
        ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p></div>)}</div>
        <label className={`mt-5 flex items-start gap-3 rounded-xl border p-4 ${localComplete ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}><input type="checkbox" className="mt-1 h-5 w-5 accent-red-700" checked={form.registrationEnabled} disabled={!form.registrationEnabled && !localComplete} onChange={(e) => update('registrationEnabled', e.target.checked)} /><span><span className="block text-sm font-black text-slate-900">Enable public visitor registration</span><span className="text-xs text-slate-600">The backend will reject activation unless all fields, active-department routes, and organizational reviews are complete.</span></span></label>
      </section>

      <section className="sticky bottom-4 rounded-2xl border border-slate-300 bg-white/95 p-4 shadow-xl backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1"><Field label="Change reason for audit log" requiredByPolicy value={changeReason} onChange={(e) => setChangeReason(e.target.value)} minLength={10} maxLength={500} placeholder="Explain the policy or operational change" /></div>
          <Button variant="primary" busy={saving} disabled={saving || changeReason.trim().length < 10} onClick={() => void save()}><Save className="h-4 w-4" />Save configuration</Button>
          <Button disabled={saving} onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </section>
    </div>
  );
};
