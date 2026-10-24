import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft, ArrowRight, Building2, Database, FileCheck2, LockKeyhole,
  Mail, ShieldCheck, UserRoundCheck,
} from 'lucide-react';
import type { KioskConfig } from '../../api/visitorService';

type PrivacyNoticeStepProps = {
  privacy: KioskConfig['privacy'];
  acknowledged: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
};

const actionClass = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2';

const overviewItems = [
  {
    title: 'Information We Collect',
    description: 'Visitor and visit details, plus an approved ID image for authorized manual review.',
    icon: Database,
  },
  {
    title: 'Why We Collect It',
    description: 'To route, review, authorize, and audit visits under the organization-approved purpose and lawful basis.',
    icon: FileCheck2,
  },
  {
    title: 'How We Protect It',
    description: 'Private storage, role-restricted access, audit records, and the approved retention and deletion process.',
    icon: ShieldCheck,
  },
  {
    title: 'Your Privacy Rights',
    description: 'Use the approved privacy contact and request procedure described in the full notice.',
    icon: UserRoundCheck,
  },
] as const;

function privacyNoticeUrlTransform(url: string): string {
  const value = url.trim();
  if (/^https:\/\//i.test(value) || /^mailto:/i.test(value)) return value;
  return '';
}

const DetailGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 text-sm font-black text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
      {title}
      <span aria-hidden="true" className="text-lg text-red-700 transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
    </summary>
    <div className="space-y-4 border-t border-slate-100 px-5 py-4 text-sm leading-6 text-slate-600">{children}</div>
  </details>
);

const Detail: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-700">{label}</h3>
    <div className="mt-1 whitespace-pre-line">{children}</div>
  </div>
);

export const PrivacyNoticeStep: React.FC<PrivacyNoticeStepProps> = ({
  privacy, acknowledged, onAcknowledgedChange, onBack, onContinue,
}) => (
  <section aria-labelledby="privacy-heading" className="w-full rounded-3xl border border-slate-200 bg-white shadow-xl">
    <div className="border-b border-slate-100 px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex items-start gap-4">
        <div className="shrink-0 rounded-2xl bg-red-50 p-3 text-red-700"><LockKeyhole className="h-7 w-7" aria-hidden="true" /></div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-red-700">Privacy notice</p>
          <h1 id="privacy-heading" className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Your Privacy Matters</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">Please understand how your information will be used and protected before any personal information or ID image is collected.</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-500">
            <span>{privacy.organizationName}</span>
            <span>Notice version {privacy.noticeVersion}</span>
          </div>
        </div>
      </div>
    </div>

    <div className="space-y-8 px-5 py-7 sm:px-8 sm:py-9">
      <section aria-labelledby="privacy-overview-heading">
        <h2 id="privacy-overview-heading" className="text-lg font-black text-slate-950">Before You Continue</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Here is a short overview. The complete approved notice remains available directly below.</p>
        <div className="mt-4 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overviewItems.map(({ title, description, icon: Icon }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-red-700 shadow-sm"><Icon className="h-5 w-5" aria-hidden="true" /></div>
              <h3 className="mt-4 text-sm font-black text-slate-900">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <details open className="group overflow-hidden rounded-2xl border border-red-100 bg-red-50/30">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-base font-black text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-700 [&::-webkit-details-marker]:hidden">
          <span>Full Privacy Notice</span>
          <span aria-hidden="true" className="text-lg text-red-700 transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
        </summary>
        <article id="full-privacy-notice" className="border-t border-red-100 bg-white px-5 py-6 text-sm leading-7 text-slate-700 sm:px-7">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={privacyNoticeUrlTransform}
            components={{
              h1: ({ children }) => <h2 className="mb-3 mt-7 text-2xl font-black text-slate-950 first:mt-0">{children}</h2>,
              h2: ({ children }) => <h2 className="mb-2 mt-7 text-xl font-black text-slate-950 first:mt-0">{children}</h2>,
              h3: ({ children }) => <h3 className="mb-2 mt-6 text-base font-black text-slate-900">{children}</h3>,
              p: ({ children }) => <p className="my-3">{children}</p>,
              ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 marker:text-red-700">{children}</ul>,
              ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 marker:font-bold marker:text-red-700">{children}</ol>,
              strong: ({ children }) => <strong className="font-extrabold text-slate-950">{children}</strong>,
              blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-red-300 bg-red-50 px-4 py-2 text-slate-700">{children}</blockquote>,
              a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener" className="font-bold text-red-700 underline decoration-red-300 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-red-700">{children}</a>,
              table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-left text-xs sm:text-sm">{children}</table></div>,
              th: ({ children }) => <th className="border border-slate-200 bg-slate-100 px-3 py-2 font-black text-slate-900">{children}</th>,
              td: ({ children }) => <td className="border border-slate-200 px-3 py-2 align-top">{children}</td>,
            }}
          >{privacy.privacyNoticeText}</ReactMarkdown>
        </article>
      </details>

      <section aria-labelledby="policy-details-heading">
        <h2 id="policy-details-heading" className="text-lg font-black text-slate-950">Policy Details</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Open a group for the organization-approved details behind the summary.</p>
        <div className="mt-4 grid items-start gap-3 lg:grid-cols-3">
          <DetailGroup title="Organization and Contact">
            <Detail label="Organization">{privacy.organizationName}</Detail>
            <Detail label="Personal information controller">{privacy.controllerName}</Detail>
            <Detail label="Controller contact">{privacy.controllerContact}</Detail>
            <Detail label="DPO and privacy concerns">{privacy.dpoContact}</Detail>
          </DetailGroup>
          <DetailGroup title="Information and Processing">
            <Detail label="Purposes and information collected">{privacy.processingPurposes}</Detail>
            <Detail label="Lawful basis">{privacy.lawfulBasis}</Detail>
            <Detail label="Authorized access and service providers">Authorized Facilities/Security personnel and the intended host or department have role-restricted access. Approved processors: {privacy.processors}</Detail>
            <Detail label="Approved ID types">{privacy.acceptedIdTypes.join(', ')}</Detail>
          </DetailGroup>
          <DetailGroup title="Privacy and Security">
            <Detail label="Retention and secure deletion">{privacy.retentionPolicy}{privacy.retentionDays ? ` (${privacy.retentionDays} days)` : ''}</Detail>
            <Detail label="Safeguards">{privacy.safeguards}</Detail>
            <Detail label="Your rights and requests">{privacy.rightsProcess}</Detail>
          </DetailGroup>
        </div>
      </section>

      <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div><h2 className="font-black">Manual identity verification is available</h2><p className="mt-1">{privacy.alternativeVerification}</p><p className="mt-2 text-xs">No biometric match, liveness result, or OCR result is implied by this registration step.</p></div>
        </div>
      </aside>

      <p className="text-xs leading-5 text-slate-500">This notice supports transparency but does not by itself establish legal compliance. Processing must follow the approved lawful basis and policy. See the <a className="font-bold text-red-700 underline outline-none focus-visible:ring-2 focus-visible:ring-red-700" href="https://privacy.gov.ph/data-privacy-act-/" target="_blank" rel="noreferrer">Philippine Data Privacy Act of 2012</a> and its <a className="font-bold text-red-700 underline outline-none focus-visible:ring-2 focus-visible:ring-red-700" href="https://privacy.gov.ph/implementing-rules%20regulations-data-privacy-act-2012/" target="_blank" rel="noreferrer">Implementing Rules and Regulations</a>.</p>

      <section aria-labelledby="privacy-acknowledgment-heading" className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-5 sm:p-6">
        <div className="flex items-start gap-3"><Mail className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" /><div><h2 id="privacy-acknowledgment-heading" className="font-black text-slate-950">Acknowledge the notice</h2><p id="privacy-acknowledgment-help" className="mt-1 text-xs leading-5 text-slate-600">Checking this box records that you read and understood notice version {privacy.noticeVersion}. It is not blanket consent where another lawful basis applies. You can <a href="#full-privacy-notice" className="font-bold text-red-700 underline outline-none focus-visible:ring-2 focus-visible:ring-red-700">review the full notice again</a> before continuing.</p></div></div>
        <label className="mt-5 flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-red-700 has-[:focus-visible]:ring-offset-2">
          <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledgedChange(event.target.checked)} aria-describedby="privacy-acknowledgment-help" className="mt-0.5 h-6 w-6 shrink-0 accent-red-700 outline-none" />
          <span className="text-sm font-semibold leading-6 text-slate-800">{privacy.acknowledgementText}</span>
        </label>
      </section>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-between">
        <button type="button" onClick={onBack} className={`${actionClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</button>
        <button type="button" disabled={!acknowledged} onClick={onContinue} className={`${actionClass} bg-red-700 text-white shadow-lg shadow-red-700/20 hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:min-w-36`}>Continue <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>
  </section>
);
