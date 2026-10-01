import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AiCircuitOpenError,
  AiProviderRequestError,
  classifyProviderFailure,
  executeAiProviderCall,
} from '../../../supabase/functions/_shared/ai-circuit-breaker.ts';

type Circuit = {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  totalFailures: number;
  version: number;
  lastFailureVersion: number;
  nextAttemptAt: number;
  lockUntil: number;
};

class FakeCircuitDb {
  now = 1_000_000;
  circuits = new Map<string, Circuit>();
  audits: Array<Record<string, unknown>> = [];

  private key(provider: string, capability: string) { return `${provider}:${capability}`; }
  get(provider: string, capability: string): Circuit {
    const key = this.key(provider, capability);
    let value = this.circuits.get(key);
    if (!value) {
      value = { state: 'CLOSED', failures: 0, totalFailures: 0, version: 0, lastFailureVersion: 0, nextAttemptAt: 0, lockUntil: 0 };
      this.circuits.set(key, value);
    }
    return value;
  }

  from() {
    return { insert: async (row: Record<string, unknown>) => { this.audits.push(row); return { error: null }; } };
  }

  async rpc(name: string, args: Record<string, any>) {
    const circuit = this.get(args.p_provider_id, args.p_capability);
    if (name === 'acquire_ai_provider_circuit') {
      if (circuit.state === 'OPEN' && circuit.nextAttemptAt > this.now) {
        return { data: [{ allowed: false, permission_code: 'CIRCUIT_OPEN', circuit_state: 'OPEN', lease_version: circuit.version, retry_after_seconds: Math.ceil((circuit.nextAttemptAt - this.now) / 1000), transitioned: false }], error: null };
      }
      if (circuit.state === 'OPEN') {
        circuit.state = 'HALF_OPEN'; circuit.version++; circuit.lockUntil = this.now + args.p_probe_lock_seconds * 1000;
        return { data: [{ allowed: true, permission_code: 'HALF_OPEN_PROBE', circuit_state: 'HALF_OPEN', lease_version: circuit.version, retry_after_seconds: 0, transitioned: true }], error: null };
      }
      if (circuit.state === 'HALF_OPEN' && circuit.lockUntil > this.now) {
        return { data: [{ allowed: false, permission_code: 'PROBE_ALREADY_IN_PROGRESS', circuit_state: 'HALF_OPEN', lease_version: circuit.version, retry_after_seconds: 1, transitioned: false }], error: null };
      }
      circuit.version++;
      return { data: [{ allowed: true, permission_code: 'REQUEST_ALLOWED', circuit_state: 'CLOSED', lease_version: circuit.version, retry_after_seconds: 0, transitioned: false }], error: null };
    }
    if (name === 'record_ai_provider_circuit_success') {
      const applied = args.p_lease_version >= circuit.lastFailureVersion;
      const transitioned = applied && circuit.state !== 'CLOSED';
      if (applied) Object.assign(circuit, { state: 'CLOSED', failures: 0, nextAttemptAt: 0, lockUntil: 0 });
      return { data: [{ circuit_state: circuit.state, applied, transitioned }], error: null };
    }
    if (name === 'record_ai_provider_circuit_failure') {
      if (!args.p_countable) {
        const transitioned = circuit.state === 'HALF_OPEN';
        if (transitioned) Object.assign(circuit, { state: 'OPEN', nextAttemptAt: this.now + args.p_cooldown_seconds * 1000, lockUntil: 0 });
        return { data: [{ circuit_state: circuit.state, failure_count: circuit.failures, transitioned, next_attempt_at: circuit.nextAttemptAt ? new Date(circuit.nextAttemptAt).toISOString() : null }], error: null };
      }
      circuit.failures++; circuit.totalFailures++; circuit.lastFailureVersion = Math.max(circuit.lastFailureVersion, args.p_lease_version);
      const shouldOpen = circuit.state !== 'CLOSED' || circuit.failures >= args.p_failure_threshold;
      const transitioned = shouldOpen && circuit.state !== 'OPEN';
      if (shouldOpen) Object.assign(circuit, { state: 'OPEN', nextAttemptAt: this.now + args.p_cooldown_seconds * 1000, lockUntil: 0 });
      return { data: [{ circuit_state: circuit.state, failure_count: circuit.failures, transitioned, next_attempt_at: circuit.nextAttemptAt ? new Date(circuit.nextAttemptAt).toISOString() : null }], error: null };
    }
    return { data: null, error: new Error(`Unexpected RPC ${name}`) };
  }
}

const run = <T>(db: FakeCircuitDb, providerId: string, capability: string, operation: () => Promise<T>, overrides: Record<string, number> = {}) =>
  executeAiProviderCall({
    db,
    providerId,
    capability,
    config: { failureThreshold: 3, openCooldownSeconds: 60, requestTimeoutMs: 1000, maxRetries: 0, retryBaseDelayMs: 50, ...overrides },
    operation,
    dependencies: { sleep: async () => undefined, random: () => 0 },
  });

describe('persistent AI provider circuit executor', () => {
  it('A: allows CLOSED success and keeps the circuit closed', async () => {
    const db = new FakeCircuitDb();
    await expect(run(db, 'a', 'document-classification', async () => 'ok')).resolves.toBe('ok');
    expect(db.get('a', 'document-classification')).toMatchObject({ state: 'CLOSED', failures: 0 });
  });

  it('B-D: opens at the threshold and blocks without calling the provider during cooldown', async () => {
    const db = new FakeCircuitDb();
    const failure = () => Promise.reject(new AiProviderRequestError('UPSTREAM', 'raw upstream detail', 500));
    await expect(run(db, 'a', 'document-classification', failure)).rejects.toBeInstanceOf(AiProviderRequestError);
    await expect(run(db, 'a', 'document-classification', failure)).rejects.toBeInstanceOf(AiProviderRequestError);
    await expect(run(db, 'a', 'document-classification', failure)).rejects.toMatchObject({ code: 'AI_PROVIDER_CIRCUIT_OPEN' });
    let providerCalls = 0;
    await expect(run(db, 'a', 'document-classification', async () => { providerCalls++; return 'never'; })).rejects.toBeInstanceOf(AiCircuitOpenError);
    expect(providerCalls).toBe(0);
  });

  it('E-H: permits exactly one HALF_OPEN probe, closes on success, and reopens on failure', async () => {
    const db = new FakeCircuitDb();
    const circuit = db.get('a', 'ocr');
    Object.assign(circuit, { state: 'OPEN', failures: 3, nextAttemptAt: db.now - 1 });
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
    const first = run(db, 'a', 'ocr', async () => { await gate; return 'recovered'; });
    const second = run(db, 'a', 'ocr', async () => 'must-not-run');
    await expect(second).rejects.toMatchObject({ code: 'AI_PROVIDER_PROBE_IN_PROGRESS' });
    release();
    await expect(first).resolves.toBe('recovered');
    expect(circuit.state).toBe('CLOSED');

    Object.assign(circuit, { state: 'OPEN', failures: 3, nextAttemptAt: db.now - 1 });
    let failedProbeCalls = 0;
    await expect(run(db, 'a', 'ocr', async () => {
      failedProbeCalls++;
      throw new AiProviderRequestError('UPSTREAM', 'unavailable', 500);
    }, { maxRetries: 2 })).rejects.toBeInstanceOf(AiCircuitOpenError);
    expect(failedProbeCalls).toBe(1);
    expect(circuit.state).toBe('OPEN');
  });

  it('I-J: classifies timeout, performs bounded exponential retries, then records one failed operation', async () => {
    const db = new FakeCircuitDb();
    const delays: number[] = [];
    let attempts = 0;
    await expect(executeAiProviderCall({
      db, providerId: 'a', capability: 'contract-analysis',
      config: { failureThreshold: 3, openCooldownSeconds: 60, requestTimeoutMs: 1000, maxRetries: 2, retryBaseDelayMs: 50 },
      operation: async () => { attempts++; throw new DOMException('timed out', 'AbortError'); },
      dependencies: { sleep: async (ms) => { delays.push(ms); }, random: () => 0 },
    })).rejects.toBeInstanceOf(DOMException);
    expect(attempts).toBe(3);
    expect(delays).toEqual([50, 100]);
    expect(db.get('a', 'contract-analysis').failures).toBe(1);
    expect(classifyProviderFailure(new DOMException('timed out', 'AbortError')).code).toBe('PROVIDER_TIMEOUT');
  });

  it('classifies HTTP 429, HTTP 500, and connection failures as transient provider failures', () => {
    expect(classifyProviderFailure(new AiProviderRequestError('RATE', 'rate limited', 429))).toMatchObject({ countable: true, retryable: true, category: 'RATE_LIMIT' });
    expect(classifyProviderFailure(new AiProviderRequestError('UPSTREAM', 'unavailable', 500))).toMatchObject({ countable: true, retryable: true, category: 'UPSTREAM_5XX' });
    expect(classifyProviderFailure(new TypeError('fetch failed'))).toMatchObject({ countable: true, retryable: true, category: 'NETWORK' });
  });

  it('K: does not count deterministic validation or authentication failures', async () => {
    const db = new FakeCircuitDb();
    await expect(run(db, 'a', 'document-classification', async () => { throw new AiProviderRequestError('BAD_REQUEST', 'invalid input', 400); })).rejects.toMatchObject({ status: 400 });
    expect(db.get('a', 'document-classification')).toMatchObject({ state: 'CLOSED', failures: 0 });
  });

  it('L-M: isolates providers and capabilities', async () => {
    const db = new FakeCircuitDb();
    Object.assign(db.get('provider-a', 'ocr'), { state: 'OPEN', failures: 3, nextAttemptAt: db.now + 60_000 });
    await expect(run(db, 'provider-a', 'ocr', async () => 'blocked')).rejects.toBeInstanceOf(AiCircuitOpenError);
    await expect(run(db, 'provider-b', 'ocr', async () => 'provider-b-ok')).resolves.toBe('provider-b-ok');
    await expect(run(db, 'provider-a', 'contract-analysis', async () => 'capability-ok')).resolves.toBe('capability-ok');
  });

  it('P: never writes raw provider errors or secrets to operational audit rows', async () => {
    const db = new FakeCircuitDb();
    const secret = 'sk-super-secret-token';
    await expect(run(db, 'a', 'ocr', async () => { throw new AiProviderRequestError('UPSTREAM', secret, 500); })).rejects.toBeInstanceOf(AiProviderRequestError);
    expect(JSON.stringify(db.audits)).not.toContain(secret);
  });
});

describe('circuit integration security contracts', () => {
  const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20261001000200_ai_provider_circuit_breaker.sql'), 'utf8');
  const aiRoute = readFileSync(resolve(process.cwd(), '../supabase/functions/ai/index.ts'), 'utf8');
  const documents = readFileSync(resolve(process.cwd(), '../supabase/functions/documents/index.ts'), 'utf8');

  it('H: serializes probe acquisition and grants RPC execution only to service_role', () => {
    expect(migration).toContain('for update');
    expect(migration).toContain("state = 'HALF_OPEN'");
    expect(migration).toContain("'PROBE_ALREADY_IN_PROGRESS'");
    expect(migration).toMatch(/revoke all on function public\.reset_ai_provider_circuit[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.reset_ai_provider_circuit[\s\S]*to service_role/i);
  });

  it('N-O: preserves configured fallback and protects reset with the SYSTEM_ADMIN guard', () => {
    expect(aiRoute).toContain('configuredFallback');
    expect(aiRoute).toContain('config: candidate.circuitConfig');
    expect(aiRoute).toMatch(/providers\/:id\/circuit\/reset", guard: AI_ADMIN_GUARD/);
    expect(aiRoute).toContain('roles: ["SYSTEM_ADMIN"]');
  });

  it('Q-R: stores documents during AI outages and never reports an unavailable duplicate check as NO_DUPLICATE', () => {
    expect(documents).toContain('UPLOAD_DOCUMENT_AI_UNAVAILABLE');
    expect(documents).toContain('confidence: "UNAVAILABLE"');
    expect(documents).toContain('duplicate_check_status: "UNAVAILABLE"');
    expect(documents).toContain('runDuplicateDetection(ctx, row)');
  });
});
