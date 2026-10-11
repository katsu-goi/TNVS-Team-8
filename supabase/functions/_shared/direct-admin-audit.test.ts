import { buildDirectAdminAuditRecord, runDirectAdminMutation } from './direct-admin-audit.ts';
import type { AuthContext, Route } from './guard.ts';
const ctx = { userId: 'admin-id', email: 'admin@example.test', ip: '127.0.0.1', userAgent: null } as AuthContext;
const route = { method: 'POST', path: '/documents/:id/classify' } as Route;
const req = new Request('https://example.test/documents/doc-id/classify', { method: 'POST', headers: { Authorization: 'Bearer SECRET' }, body: 'sensitive body' });
Deno.test('direct audit retains the real actor and excludes credentials and content', () => {
  const row = buildDirectAdminAuditRecord(ctx, req, route, { id: 'doc-id' }, 'COMPLETED', 409);
  const text = JSON.stringify(row);
  if (row.actor_user_id !== 'admin-id' || row.target_user_id !== null || !text.includes('FAILED') || text.includes('SECRET') || text.includes('sensitive body')) throw new Error('Incorrect audit');
});
Deno.test('audit failure prevents the business mutation', async () => {
  let mutated = false;
  try { await runDirectAdminMutation(ctx, req, route, {}, async () => { mutated = true; return new Response(); }, async () => { throw new Error('audit unavailable'); }); } catch { /* expected */ }
  if (mutated) throw new Error('An unaudited mutation ran');
});
Deno.test('completion audit failure does not pretend the mutation failed', async () => {
  const phases: string[] = [];
  const response = await runDirectAdminMutation(ctx, req, route, {}, async () => new Response('stored', { status: 201 }), async (_c,_r,_t,_p,phase) => { phases.push(phase); if (phase === 'COMPLETED') throw new Error('completion unavailable'); });
  if (response.status !== 201 || phases.join(',') !== 'AUTHORIZED_ATTEMPT,COMPLETED') throw new Error('Incorrect outcome');
});
