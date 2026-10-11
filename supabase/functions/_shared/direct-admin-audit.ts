import type { AuthContext, Route, RouteParams } from './guard.ts';
type Phase = 'AUTHORIZED_ATTEMPT' | 'COMPLETED';
export function withMutationAuditResource(response: Response, resourceId: string): Response {
  if (/^[0-9a-f-]{36}$/i.test(resourceId)) response.headers.set('X-Audit-Resource-Id', resourceId);
  return response;
}
export function buildDirectAdminAuditRecord(ctx: AuthContext, req: Request, route: Route, params: RouteParams, phase: Phase, status?: number): Record<string,unknown> {
  const resourcePath = route.path.split('/:')[0].split('/').filter(Boolean);
  return {
    actor_user_id: ctx.userId, target_user_id: null, oversight_session_id: null,
    action: `SUPER_ADMIN_${req.method}_${route.path}`.replace(/[^A-Z0-9_]+/gi, '_').slice(0,100),
    entity_type: (resourcePath.at(-1) ?? 'ApplicationResource').slice(0,100),
    entity_id: (params.id ?? Object.values(params)[0] ?? '').slice(0,100) || null,
    source_ip: ctx.ip, user_agent: ctx.userAgent?.slice(0,500) ?? null,
    occurred_at: new Date().toISOString(),
    details: { auditMarker: 'Performed by Super Admin', actorEmail: ctx.email, actorRole: 'SUPER_ADMIN', requestMethod: req.method, route: route.path, phase, responseStatus: status ?? null, resultStatus: phase === 'AUTHORIZED_ATTEMPT' ? phase : status != null && status < 400 ? 'SUCCESS' : 'FAILED' },
  };
}
export async function writeDirectAdminActionAudit(ctx: AuthContext, req: Request, route: Route, params: RouteParams, phase: Phase, status?: number): Promise<void> {
  const { adminDb } = await import('./db.ts');
  const { error } = await adminDb().from('admin_audit_logs').insert(buildDirectAdminAuditRecord(ctx, req, route, params, phase, status));
  if (error) throw new Error(`direct admin audit failed: ${error.message}`);
}
export async function runDirectAdminMutation(ctx: AuthContext, req: Request, route: Route, params: RouteParams, run: () => Promise<Response>, write = writeDirectAdminActionAudit): Promise<Response> {
  await write(ctx,req,route,params,'AUTHORIZED_ATTEMPT');
  const response = await run();
  const resourceId = response.headers.get('X-Audit-Resource-Id');
  const completionParams = !params.id && resourceId && /^[0-9a-f-]{36}$/i.test(resourceId) ? { ...params, id: resourceId } : params;
  try { await write(ctx,req,route,completionParams,'COMPLETED',response.status); }
  catch (error) { console.error('Direct admin completion audit failed:', (error as Error).message); }
  return response;
}
