import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), '../supabase/functions/visitor/index.ts'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20261022000100_visitor_status_notifications.sql'), 'utf8');
const guard = readFileSync(resolve(process.cwd(), '../supabase/functions/_shared/guard.ts'), 'utf8');
const cors = readFileSync(resolve(process.cwd(), '../supabase/functions/_shared/cors.ts'), 'utf8');

describe('visitor notification and status security contract', () => {
  it('stores only hashed high-entropy status credentials and never looks up by reference number', () => {
    expect(migration).toContain('status_token_hash varchar(64)');
    expect(source).toContain('await sha256(statusToken)');
    expect(source).toContain('.eq("status_token_hash", tokenHash)');
    expect(source).not.toContain('.eq("reference_number", token)');
    expect(source).toContain('path: "/visitor-status/inspect", guard: { kind: "public" }');
  });

  it('keeps status inspection public and rate limited while exposing only a correlation header', () => {
    expect(source).toContain('path: "/visitor-status/inspect", guard: { kind: "public" }');
    expect(guard).toContain('tierFor("guest", route.path)');
    expect(guard).toContain('headers.set("X-Request-ID", requestId)');
    expect(cors).toContain('Content-Disposition, Retry-After, X-Request-ID');
  });

  it('keeps pending submissions unauthorized and sends a tracked acknowledgment', () => {
    expect(source).toContain('approval_status: "PENDING"');
    expect(source).toContain('access_status: "NOT_AUTHORIZED"');
    expect(source).toContain('qr_code_token: null');
    expect(source).toContain('sendRegistrationAcknowledgment(saved as unknown as VisitorRow, statusToken)');
    expect(source).toContain('REGISTRATION_ACKNOWLEDGMENT');
  });

  it('requires identity clearance before approval pass creation', () => {
    expect(source).toContain('"VISITOR_IDENTITY_REVIEW_REQUIRED"');
    expect(source).toContain('await approveAndIssueVisitorPass(visitor, ctx!, reason, req.headers.get("X-Request-ID") ?? undefined)');
    expect(source).toContain('.eq("id", visitor.id).eq("approval_status", "PENDING")');
    expect(source).toContain('attachments: [{ filename: `${visitor.reference_number ?? "visitor-pass"}.png`');
  });

  it('validates pass policy before committing approval and pass state together', () => {
    const start = source.indexOf('async function approveAndIssueVisitorPass');
    const end = source.indexOf('async function handleApprovalDecision');
    const approval = source.slice(start, end);
    expect(approval.indexOf('VISITOR_PASS_POLICY_NOT_CONFIGURED')).toBeLessThan(approval.indexOf('approval_status: "APPROVED"'));
    expect(approval).toContain('access_status: "AUTHORIZED"');
    expect(approval).toContain('qr_token_hash: tokenHash');
  });

  it('sends a public-safe decline notification without a QR attachment or internal reason', () => {
    const declineStart = source.indexOf('async function sendDeclineEmail');
    const approvalStart = source.indexOf('async function sendVisitorPassEmail');
    const declineTemplate = source.slice(declineStart, approvalStart);
    expect(declineTemplate).toContain('Status: DECLINED');
    expect(declineTemplate).toContain('No visitor pass or entry credential has been issued.');
    expect(declineTemplate).not.toContain('attachments');
    expect(declineTemplate).not.toContain('approval_reason');
  });

  it('tracks provider outcomes and uses stable Resend idempotency keys for safe retry', () => {
    expect(migration).toContain("delivery_status in ('NOT_REQUESTED', 'PENDING', 'ACCEPTED', 'FAILED', 'NOT_CONFIGURED')");
    expect(migration).toContain('constraint visitor_email_notification_unique unique (visitor_id, notification_type)');
    expect(source).toContain('"Idempotency-Key": idempotencyKey');
    expect(source).toContain("if (existing.delivery_status === \"ACCEPTED\")");
    expect(source).toContain("['FAILED', 'NOT_CONFIGURED'].includes(visitor.email_delivery_status");
  });

  it('reconstructs the same HMAC pass for retry without creating a second active credential', () => {
    expect(source).toContain('signedVisitorToken("vst_", "visitor-pass", visitor.id, issuedAt)');
    expect(source).toContain('if (!visitor.qr_token_hash)');
    expect(source).toContain('visitor.qr_token_hash !== tokenHash');
    expect(source).toContain('VISITOR_PASS_NOT_RETRYABLE');
  });
});
