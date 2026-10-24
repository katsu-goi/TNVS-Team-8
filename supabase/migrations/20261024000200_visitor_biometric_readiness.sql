-- Adds evidence-backed biometric approvals. Existing boolean approvals from the
-- earlier screening migration are deliberately revoked because the application
-- cannot invent the missing approval evidence or attest that it remains valid.

alter table public.visitor_kiosk_configuration
  add column if not exists biometric_privacy_evidence text,
  add column if not exists biometric_pia_evidence text,
  add column if not exists biometric_security_evidence text,
  add column if not exists biometric_license_evidence text,
  add column if not exists biometric_retention_approved boolean not null default false,
  add column if not exists biometric_retention_approved_by uuid references public.users(id),
  add column if not exists biometric_retention_approved_at timestamptz,
  add column if not exists biometric_retention_evidence text;

update public.visitor_kiosk_configuration
set biometric_processing_enabled = false,
    biometric_privacy_approved = false,
    biometric_privacy_approved_by = null,
    biometric_privacy_approved_at = null,
    biometric_pia_approved = false,
    biometric_pia_approved_by = null,
    biometric_pia_approved_at = null,
    biometric_security_approved = false,
    biometric_security_approved_by = null,
    biometric_security_approved_at = null,
    biometric_license_approved = false,
    biometric_license_approved_by = null,
    biometric_license_approved_at = null
where biometric_privacy_approved
   or biometric_pia_approved
   or biometric_security_approved
   or biometric_license_approved;

alter table public.visitor_kiosk_configuration
  drop constraint if exists visitor_kiosk_biometric_privacy_evidence_check,
  add constraint visitor_kiosk_biometric_privacy_evidence_check check (
    not biometric_privacy_approved or
    (biometric_privacy_approved_by is not null and biometric_privacy_approved_at is not null
      and length(trim(coalesce(biometric_privacy_evidence, ''))) >= 10)
  ),
  drop constraint if exists visitor_kiosk_biometric_pia_evidence_check,
  add constraint visitor_kiosk_biometric_pia_evidence_check check (
    not biometric_pia_approved or
    (biometric_pia_approved_by is not null and biometric_pia_approved_at is not null
      and length(trim(coalesce(biometric_pia_evidence, ''))) >= 10)
  ),
  drop constraint if exists visitor_kiosk_biometric_security_evidence_check,
  add constraint visitor_kiosk_biometric_security_evidence_check check (
    not biometric_security_approved or
    (biometric_security_approved_by is not null and biometric_security_approved_at is not null
      and length(trim(coalesce(biometric_security_evidence, ''))) >= 10)
  ),
  drop constraint if exists visitor_kiosk_biometric_license_evidence_check,
  add constraint visitor_kiosk_biometric_license_evidence_check check (
    not biometric_license_approved or
    (biometric_license_approved_by is not null and biometric_license_approved_at is not null
      and length(trim(coalesce(biometric_license_evidence, ''))) >= 10)
  ),
  drop constraint if exists visitor_kiosk_biometric_retention_evidence_check,
  add constraint visitor_kiosk_biometric_retention_evidence_check check (
    not biometric_retention_approved or
    (biometric_retention_approved_by is not null and biometric_retention_approved_at is not null
      and length(trim(coalesce(biometric_retention_evidence, ''))) >= 10)
  );

comment on column public.visitor_kiosk_configuration.biometric_retention_approved is
  'Attestation that biometric retention and secure deletion procedures were approved and made operational; never inferred by the application.';
comment on column public.visitor_kiosk_configuration.biometric_privacy_evidence is
  'Organization-supplied approval reference or evidence summary. It must not contain secret keys or sensitive visitor data.';
