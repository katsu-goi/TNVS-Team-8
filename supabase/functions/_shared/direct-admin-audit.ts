import type { AuthContext, Route, RouteParams } from './guard.ts';
type Phase = 'AUTHORIZED_ATTEMPT' | 'COMPLETED';
export function buildDirectAdminAuditRecord(ctx: AuthContext, req: Request, route: Route, params: RouteParams, phase: Phase, status?: number): Record<string,unknown> {
  return {
    actor_user_id: ctx.userId, target_user_id: null, oversight_session_id: null,
    action: `SUPER_ADMIN_${req.method}_${route.path}`.replace(/[^A-Z0-9_]+/gi, '_').slice(0,100),
    entity_type: (route.path.split('/').filter(Boolean).at(-2) ?? 'ApplicationResource').slice(0,100),
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
  try { await write(ctx,req,route,params,'COMPLETED',response.status); }
  catch (error) { console.error('Direct admin completion audit failed:', (error as Error).message); }
  return response;
}
