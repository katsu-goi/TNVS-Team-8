-- Adds minimum screening metadata to the existing visitor workflow. Raw OCR
-- text, full document numbers, facial embeddings, and model images are not
-- stored by this migration. Biometric processing defaults to disabled and is
-- gated by four independently recorded organizational reviews.

alter table public.visitor_kiosk_configuration
  add column if not exists biometric_processing_enabled boolean not null default false,
  add column if not exists biometric_notice_text text,
  add column if not exists biometric_authorization_text text,
  add column if not exists biometric_privacy_approved boolean not null default false,
  add column if not exists biometric_privacy_approved_by uuid references public.users(id),
  add column if not exists biometric_privacy_approved_at timestamptz,
  add column if not exists biometric_pia_approved boolean not null default false,
  add column if not exists biometric_pia_approved_by uuid references public.users(id),
  add column if not exists biometric_pia_approved_at timestamptz,
  add column if not exists biometric_security_approved boolean not null default false,
  add column if not exists biometric_security_approved_by uuid references public.users(id),
  add column if not exists biometric_security_approved_at timestamptz,
  add column if not exists biometric_license_approved boolean not null default false,
  add column if not exists biometric_license_approved_by uuid references public.users(id),
  add column if not exists biometric_license_approved_at timestamptz;

alter table public.visitor_kiosk_configuration
  drop constraint if exists visitor_kiosk_biometric_privacy_evidence_check,
  add constraint visitor_kiosk_biometric_privacy_evidence_check check (
    not biometric_privacy_approved or
    (biometric_privacy_approved_by is not null and biometric_privacy_approved_at is not null)
  ),
  drop constraint if exists visitor_kiosk_biometric_pia_evidence_check,
  add constraint visitor_kiosk_biometric_pia_evidence_check check (
    not biometric_pia_approved or
    (biometric_pia_approved_by is not null and biometric_pia_approved_at is not null)
  ),
  drop constraint if exists visitor_kiosk_biometric_security_evidence_check,
  add constraint visitor_kiosk_biometric_security_evidence_check check (
    not biometric_security_approved or
    (biometric_security_approved_by is not null and biometric_security_approved_at is not null)
  ),
  drop constraint if exists visitor_kiosk_biometric_license_evidence_check,
  add constraint visitor_kiosk_biometric_license_evidence_check check (
    not biometric_license_approved or
    (biometric_license_approved_by is not null and biometric_license_approved_at is not null)
  );

alter table public.visitors
  add column if not exists ocr_processing_status varchar(30) not null default 'NOT_REQUESTED',
  add column if not exists document_classification varchar(40) not null default 'NOT_SCREENED',
  add column if not exists document_detected_type varchar(100),
  add column if not exists document_expiration_text varchar(40),
  add column if not exists document_issuing_authority varchar(120),
  add column if not exists document_screening_warnings jsonb not null default '[]'::jsonb,
  add column if not exists ocr_text_quality varchar(20),
  add column if not exists facial_comparison_status varchar(40) not null default 'PROVIDER_NOT_CONFIGURED',
  add column if not exists facial_comparison_provider varchar(80),
  add column if not exists facial_comparison_model varchar(80),
  add column if not exists facial_comparison_detector varchar(80),
  add column if not exists facial_comparison_distance numeric,
  add column if not exists facial_comparison_threshold numeric,
  add column if not exists facial_comparison_at timestamptz,
  add column if not exists anti_spoofing_status varchar(40) not null default 'NOT_PERFORMED',
  add column if not exists manual_identity_review_required boolean not null default true;

alter table public.visitors
  drop constraint if exists visitors_ocr_processing_status_check,
  add constraint visitors_ocr_processing_status_check
    check (ocr_processing_status in ('NOT_REQUESTED', 'SUCCEEDED', 'FAILED')),
  drop constraint if exists visitors_document_classification_check,
  add constraint visitors_document_classification_check
    check (document_classification in ('NOT_SCREENED', 'SUPPORTED_ID_TYPE', 'UNSUPPORTED_DOCUMENT', 'PAYMENT_CARD_DETECTED', 'INCONCLUSIVE')),
  drop constraint if exists visitors_ocr_text_quality_check,
  add constraint visitors_ocr_text_quality_check
    check (ocr_text_quality is null or ocr_text_quality in ('HIGH', 'MEDIUM', 'LOW')),
  drop constraint if exists visitors_facial_comparison_status_check,
  add constraint visitors_facial_comparison_status_check
    check (facial_comparison_status in ('MATCH_INDICATED', 'MISMATCH_INDICATED', 'INCONCLUSIVE', 'NO_FACE_DETECTED', 'MULTIPLE_FACES_DETECTED', 'PROCESSING_FAILED', 'PROVIDER_NOT_CONFIGURED')),
  drop constraint if exists visitors_anti_spoofing_status_check,
  add constraint visitors_anti_spoofing_status_check
    check (anti_spoofing_status in ('NOT_PERFORMED', 'REAL_INDICATED', 'SPOOF_INDICATED', 'INCONCLUSIVE')),
  drop constraint if exists visitors_document_screening_warnings_check,
  add constraint visitors_document_screening_warnings_check
    check (jsonb_typeof(document_screening_warnings) = 'array');

comment on column public.visitors.document_classification is
  'Client OCR-assisted category screening only; never proof of document authenticity.';
comment on column public.visitors.facial_comparison_status is
  'DeepFace comparison evidence only; never an automatic identity clearance.';
comment on column public.visitors.manual_identity_review_required is
  'Must remain true for kiosk registrations regardless of automated screening outcomes.';
comment on column public.visitor_kiosk_configuration.biometric_processing_enabled is
  'Administrator intent only. Edge runtime flag, service configuration, notice, alternative procedure, and all biometric approvals are also required.';
