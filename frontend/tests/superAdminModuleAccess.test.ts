import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRouteAuthorized } from '../../supabase/functions/_shared/authorization-policy';
type CapturedRoute={method:string;path:string;handler:(...args:any[])=>Promise<Response>;guard:Parameters<typeof isRouteAuthorized>[1]};
const captured = vi.hoisted(() => ({routes:[] as CapturedRoute[], groups:{} as Record<string,CapturedRoute[]>, results:[] as unknown[], updates:[] as unknown[],inserts:[] as any[]}));
vi.mock('../../supabase/functions/_shared/guard.ts', () => ({
  createHandler:(routes:typeof captured.routes,options:{name:string})=>{captured.groups[options.name]=routes;if(options.name==='governance')captured.routes=routes;return ()=>{};},
  isDirectSuperAdmin:(ctx:any)=>ctx?.user.assignedRoles.includes('SUPER_ADMIN') && !ctx.oversight,
  hasRole:(ctx:any,role:string)=>ctx.roles.includes(role),
}));
vi.mock('../../supabase/functions/_shared/db.ts', () => ({adminDb:()=>({from:()=>{
  const query:any={};
  for (const key of ['select','eq','in','order','limit','neq']) query[key]=()=>query;
  query.update=(value:unknown)=>{captured.updates.push(value);return query;};
  query.insert=(value:unknown)=>{captured.inserts.push(value);return query;};
  query.upsert=query.insert;
  query.maybeSingle=()=>Promise.resolve(captured.results.shift());
  query.single=query.maybeSingle;
  query.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(captured.results.shift()).then(resolve);
  return query;
}})}));
vi.mock('../../supabase/functions/_shared/lockout.ts',()=>({writeAudit:vi.fn()}));
vi.mock('../../supabase/functions/_shared/password.ts',()=>({hashPassword:vi.fn()}));
vi.stubGlobal('Deno',{serve:vi.fn(),env:{get:()=>undefined}});
await import('../../supabase/functions/governance/index.ts');
await import('../../supabase/functions/legal/index.ts');
await import('../../supabase/functions/procurement/index.ts');
await import('../../supabase/functions/employee/index.ts');
await import('../../supabase/functions/security/index.ts');
await import('../../supabase/functions/admin/index.ts');
const subject={assignedRoles:['SUPER_ADMIN'],roles:['SUPER_ADMIN'],permissions:[],oversightActive:false};
const ctx={userId:'actual-admin',roles:['SUPER_ADMIN'],permissions:[],user:{assignedRoles:['SUPER_ADMIN'],row:{},roles:['SUPER_ADMIN']},email:'admin@test.invalid'};
const req=new Request('https://test.invalid');
describe('Super Admin governance handlers',()=>{
  beforeEach(()=>{captured.results=[];captured.updates=[];captured.inserts=[];});
  it('authorizes every actual legal, procurement, employee, security and administration route',()=>{
    for (const [group,routes] of Object.entries(captured.groups)) {
      expect(routes.length,group).toBeGreaterThan(0);
      for (const route of routes) expect(isRouteAuthorized(subject,route.guard),`${group}: ${route.method} ${route.path}`).toBe(true);
    }
  });
  it('creates a legal contract under the actual administrator identity',async()=>{
    captured.results.push({data:null,error:null},{data:{id:'contract',title:'Agreement'},error:null},{error:null});
    const route=captured.groups.legal.find(route=>route.method==='POST' && route.path==='/legal/contracts')!;
    expect((await route.handler(ctx,req,{title:'Agreement',type:'NON_DISCLOSURE'},{})).status).toBe(200);
    expect(captured.inserts[0].created_by).toBe('admin@test.invalid');
  });
  it('creates a vendor under the actual administrator identity',async()=>{
    captured.results.push({data:null,error:null},{data:{id:'vendor',name:'Supplier'},error:null});
    const route=captured.groups.procurement.find(route=>route.method==='POST' && route.path==='/procurement/vendors')!;
    expect((await route.handler(ctx,req,{name:'Supplier',category:'SUPPLIES'},{})).status).toBe(200);
    expect(captured.inserts[0].created_by).toBe('admin@test.invalid');
  });
  it.each(['approve','reject','complete'])('preserves the real administrator identity for request %s',async action=>{
    const initial=action==='complete'?'APPROVED':'PENDING';
    const target=action==='approve'?'APPROVED':action==='reject'?'REJECTED':'COMPLETED';
    captured.results.push({data:{id:'request',type:'LEGAL',status:initial,title:'Request',requester_id:'employee'},error:null},{data:{id:'request',status:target},error:null},{error:null});
    const response=await captured.groups.employee.find(route=>route.path===`/requests-review/:id/${action}`)!.handler(ctx,req,{reason:'Reviewed request'},{id:'request'});
    expect(response.status).toBe(200);expect(captured.updates[0]).toMatchObject({status:target,updated_by:'admin@test.invalid'});
  });
  it.each(['approve','reject','complete'])('rejects concurrent request %s without a false success',async action=>{
    captured.results.push({data:{id:'request',type:'LEGAL',status:action==='complete'?'APPROVED':'PENDING'},error:null},{data:null,error:null});
    const response=await captured.groups.employee.find(route=>route.path===`/requests-review/:id/${action}`)!.handler(ctx,req,{}, {id:'request'});
    expect(response.status).toBe(409);expect(captured.inserts).toHaveLength(0);
  });
  it('authorizes each actual workspace/action route without synthesizing roles',()=>{
    for (const route of captured.routes) expect(isRouteAuthorized(subject,route.guard),route.path).toBe(true);
    const employee={...subject,assignedRoles:['EMPLOYEE'],roles:['EMPLOYEE']};
    expect(captured.routes.every(route=>!isRouteAuthorized(employee,route.guard))).toBe(true);
  });
  it.each(['/governance/management/signoffs/:id/decision','/governance/department/approvals/:id/decision','/governance/privacy/cctv/:id/decision'])('returns conflict for a stale %s',async path=>{
    captured.results.push({data:null,error:null});
    const route=captured.routes.find(route=>route.path===path)!;
    const response=await route.handler(ctx,req,{approve:true,decision:'APPROVED',justification:'Verified business purpose'},{id:'record'});
    expect(response.status).toBe(409);
    expect((captured.updates[0] as any).decided_by ?? (captured.updates[0] as any).privacy_approved_by).toBe('actual-admin');
  });
  it('retains independent CCTV approvals for Super Admin',async()=>{
    captured.results.push({data:{privacy_approved_by:'actual-admin'},error:null});
    const route=captured.routes.find(route=>route.path==='/governance/records/cctv/:id/decision')!;
    const response=await route.handler(ctx,req,{approve:true},{id:'record'});
    expect(response.status).toBe(422);expect(captured.updates).toHaveLength(0);
  });
  it('returns conflict when custody changes after lookup',async()=>{
    captured.results.push({data:{privacy_approved_by:'other-admin'},error:null},{data:null,error:null});
    const response=await captured.routes.find(route=>route.path==='/governance/records/cctv/:id/decision')!.handler(ctx,req,{approve:true},{id:'record'});
    expect(response.status).toBe(409);
  });
});
