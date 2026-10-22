import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, Loader2, Mail, RefreshCw, Save, Unplug } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import {
  visitorKioskConfigService,
  type VisitorKioskAdminConfig,
  type VisitorKioskAdminState,
  type VisitorGmailOAuthStatus,
} from '../../api/visitorKioskConfigService';
import { useAuthStore } from '../../stores/authStore';
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
  const directSuperAdmin = useAuthStore((store) => Boolean(store.user?.assignedRoles?.includes('SUPER_ADMIN')));
  const [state, setState] = useState<VisitorKioskAdminState | null>(null);
  const [form, setForm] = useState<VisitorKioskAdminConfig | null>(null);
  const [gmail, setGmail] = useState<VisitorGmailOAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailStatusError, setGmailStatusError] = useState('');
  const [gmailActionError, setGmailActionError] = useState('');
  const [gmailAction, setGmailAction] = useState<'connect' | 'disconnect' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [disconnectReason, setDisconnectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const loaded = await visitorKioskConfigService.load();
      setState(loaded); setForm(loaded.config);
    } catch (loadError) { setError(extractErrorMessage(loadError)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadGmailStatus = useCallback(async () => {
    if (!directSuperAdmin) {
      setGmail(null); setGmailStatusError(''); setGmailActionError('');
      return;
    }
    setGmailLoading(true); setGmailStatusError('');
    try { setGmail(await visitorKioskConfigService.loadGmailOAuthStatus()); }
    catch (statusError) {
      setGmail(null);
      setGmailStatusError(extractErrorMessage(statusError));
    } finally { setGmailLoading(false); }
  }, [directSuperAdmin]);

  useEffect(() => { void loadGmailStatus(); }, [loadGmailStatus]);

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

  const connectGmail = async () => {
    setGmailBusy(true); setGmailAction('connect'); setGmailActionError(''); setNotice('');
    try {
      const authorization = await visitorKioskConfigService.startGmailOAuth();
      const popup = window.open(authorization.authorizationUrl, '_blank', 'noopener,noreferrer');
      if (!popup) throw new Error('The Google authorization window was blocked. Allow pop-ups for this site and try again.');
      setNotice('Google authorization opened in a new window. Complete consent using the authorized Gmail account, then select Refresh Gmail status. No email is sent during connection.');
    } catch (connectError) { setGmailActionError(extractErrorMessage(connectError)); }
    finally { setGmailBusy(false); }
  };

  const refreshGmail = async () => {
    setGmailBusy(true); setGmailActionError(''); setGmailAction('');
    try { await loadGmailStatus(); }
    finally { setGmailBusy(false); }
  };

  const disconnectGmail = async () => {
    if (disconnectReason.trim().length < 10) return;
    setGmailBusy(true); setGmailAction('disconnect'); setGmailActionError(''); setNotice('');
    try {
      await visitorKioskConfigService.disconnectGmail(disconnectReason.trim());
      setDisconnectReason('');
      setGmail(await visitorKioskConfigService.loadGmailOAuthStatus());
      setNotice('Gmail authorization was revoked and the encrypted refresh token was removed.');
    } catch (disconnectError) { setGmailActionError(extractErrorMessage(disconnectError)); }
    finally { setGmailBusy(false); }
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
          ['Email delivery', state.technical.emailDeliveryConfigured || gmail?.connected ? 'Configured' : 'Not configured'],
          ['Pass validity policy', state.technical.passPolicyConfigured ? 'Configured' : 'Not configured'],
          ['Identity verification', state.technical.identityVerificationStatus],
        ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p></div>)}</div>

        {directSuperAdmin && <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5" data-testid="gmail-email-integration">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <Mail className={`mt-0.5 h-6 w-6 ${gmail?.connected ? 'text-emerald-700' : gmailStatusError || gmail?.connectionStatus === 'ERROR' ? 'text-rose-700' : 'text-slate-500'}`} />
              <div>
                <h3 className="font-black text-slate-900">Gmail Email Integration</h3>
                <p className="mt-1 text-sm text-slate-600">Email provider: <strong>Gmail API</strong></p>
                <p className="mt-1 text-sm text-slate-600">Sender address: <strong>{gmail?.senderEmail ?? 'hirnamobilitysolutionsinc@gmail.com'}</strong></p>
                <p className="mt-1 text-xs text-slate-500">Scope: {gmail?.scope ?? 'https://www.googleapis.com/auth/gmail.send'}</p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${gmail?.connected ? 'bg-emerald-100 text-emerald-800' : gmailStatusError || gmail?.connectionStatus === 'ERROR' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'}`}>
              {gmailLoading ? 'CHECKING' : gmail?.connected ? 'CONNECTED' : gmailStatusError || gmail?.connectionStatus === 'ERROR' ? 'ERROR' : 'NOT CONNECTED'}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-white p-3 text-xs text-slate-600"><span className="block font-bold uppercase tracking-wide text-slate-500">Connection status</span><span className="mt-1 block font-semibold text-slate-800">{gmailLoading ? 'Checking backend…' : gmail?.connected ? 'Connected' : gmailStatusError || gmail?.connectionStatus === 'ERROR' ? 'Error' : 'Not Connected'}</span></div>
            <div className="rounded-xl bg-white p-3 text-xs text-slate-600"><span className="block font-bold uppercase tracking-wide text-slate-500">Gmail API configuration</span><span className="mt-1 block font-semibold text-slate-800">{gmailLoading ? 'Checking…' : gmail?.serverConfigurationStatus === 'CONFIGURED' ? 'Configured' : gmail?.serverConfigurationStatus === 'INVALID' ? 'Invalid' : gmail?.serverConfigurationStatus === 'MISSING' ? 'Not configured' : 'Unavailable'}</span></div>
            <div className="rounded-xl bg-white p-3 text-xs text-slate-600"><span className="block font-bold uppercase tracking-wide text-slate-500">Last connection time</span><span className="mt-1 block font-semibold text-slate-800">{gmail?.connectedAt ? new Date(gmail.connectedAt).toLocaleString() : 'Never connected'}</span></div>
            <div className="rounded-xl bg-white p-3 text-xs text-slate-600 md:col-span-3"><span className="block font-bold uppercase tracking-wide text-slate-500">Authorized redirect URI</span><code className="mt-1 block break-all text-slate-800">{gmail?.redirectUri || 'https://dunijfrvfozwlykpkfhy.supabase.co/functions/v1/visitor/admin/gmail-oauth/callback'}</code></div>
          </div>
          {gmailStatusError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">Gmail status could not be loaded: {gmailStatusError}</p>}
          {gmailActionError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">Gmail {gmailAction === 'disconnect' ? 'disconnect' : 'connection'} failed: {gmailActionError}</p>}
          {gmail?.configurationErrorCode && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Server configuration requires attention: {gmail.configurationErrorCode}. No OAuth credential has been stored.</p>}
          {gmail?.lastErrorCode && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">Last backend error: {gmail.lastErrorCode}. Reconnect after correcting the server configuration.</p>}
          <p className="mt-3 text-xs text-slate-500">OAuth client secrets, refresh tokens, and access tokens are never returned to this page. Connecting does not send a test or live visitor email.</p>
          {gmail?.connected && <div className="mt-4 rounded-xl border border-rose-200 bg-white p-4">
            <Field label="Reason to revoke Gmail authorization" requiredByPolicy value={disconnectReason} onChange={(event) => setDisconnectReason(event.target.value)} minLength={10} maxLength={500} placeholder="Explain why notification delivery is being disconnected" />
          </div>}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Button variant="primary" busy={gmailBusy} disabled={gmailBusy || gmailLoading || gmail?.connected || gmail?.serverConfigurationStatus !== 'CONFIGURED'} onClick={() => void connectGmail()}><ExternalLink className="h-4 w-4" />Connect Gmail</Button>
            <Button disabled={gmailBusy || gmailLoading || !gmail?.connected || disconnectReason.trim().length < 10} onClick={() => void disconnectGmail()}><Unplug className="h-4 w-4" />Disconnect Gmail</Button>
            <Button disabled={gmailBusy} onClick={() => void refreshGmail()}><RefreshCw className="h-4 w-4" />Refresh Gmail status</Button>
          </div>
        </div>}
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
