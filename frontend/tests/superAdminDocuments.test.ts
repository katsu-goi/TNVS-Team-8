import { beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({routes:[] as {method:string;path:string;handler:(...args:any[])=>Promise<Response>}[],rows:{} as Record<string,unknown[]>,deleted:false}));
vi.mock('../../supabase/functions/_shared/guard.ts',()=>({createHandler:(routes:typeof state.routes)=>{state.routes=routes;return ()=>{};},isDirectSuperAdmin:(ctx:any)=>ctx?.user.assignedRoles.includes('SUPER_ADMIN')&&!ctx.oversight}));
vi.mock('../../supabase/functions/_shared/db.ts',()=>({adminDb:()=>({from:(table:string)=>{
 const query:any={};
 for(const key of ['select','eq','in','order','limit'])query[key]=()=>query;
 query.delete=()=>{state.deleted=true;return query;};
 const result=()=>Promise.resolve({data:state.rows[table]?.shift()??null,error:null});
 query.maybeSingle=result;
 query.then=(resolve:(value:unknown)=>unknown)=>result().then(resolve);
 return query;
}})}));
vi.mock('../../supabase/functions/_shared/lockout.ts',()=>({writeAudit:vi.fn()}));
vi.mock('../../supabase/functions/_shared/document-content.ts',()=>({SUPPORTED_DOCUMENT_EXTENSIONS:['pdf','docx','txt'],MAX_EXTRACTABLE_FILE_BYTES:20971520,DocumentExtractionError:class extends Error{},extractDocumentContent:vi.fn(),validateDocumentUpload:vi.fn()}));
vi.mock('../../supabase/functions/_shared/document-ai.ts',()=>({DocumentAiError:class extends Error{},classifyDocumentContent:vi.fn(),getDocumentBusinessCategories:vi.fn()}));
vi.stubGlobal('Deno',{serve:vi.fn()});
await import('../../supabase/functions/documents/index.ts');
const ctx={userId:'admin',email:'admin@test.invalid',user:{assignedRoles:['SUPER_ADMIN'],row:{}},roles:['SUPER_ADMIN'],permissions:[]};
const id='10000000-0000-0000-0000-000000000001';
const request=new Request('https://test.invalid/documents/'+id);
describe('authoritative Super Admin document invariants',()=>{
 beforeEach(()=>{state.rows={};state.deleted=false;});
 it('returns not found for missing classification source',async()=>{
  const route=state.routes.find(route=>route.path==='/documents/:id/classification-review')!;
  expect((await route.handler(ctx,request,{decision:'APPROVE'},{id})).status).toBe(404);
 });
 it('returns conflict for a document no longer pending review',async()=>{
  state.rows={documents:[{id,status:'APPROVED',classification_level:'HIGHLY_RESTRICTED',owner_email:'other@test.invalid'}],document_grants:[[]]};
  const route=state.routes.find(route=>route.path==='/documents/:id/classification-review')!;
  expect((await route.handler(ctx,request,{decision:'APPROVE'},{id})).status).toBe(409);
 });
 it('blocks deletion under an active legal hold even for direct Super Admin',async()=>{
  state.rows={documents:[{id,status:'DRAFT',created_by:'other@test.invalid'}],document_legal_holds:[[{document_id:id}]]};
  const route=state.routes.find(route=>route.method==='DELETE'&&route.path==='/documents/:id')!;
  const response=await route.handler(ctx,request,{}, {id});
  expect(response.status).toBe(409);expect(await response.text()).toContain('LEGAL_HOLD_ACTIVE');expect(state.deleted).toBe(false);
 });
 it('treats an already deleted document as missing before further mutation',async()=>{
  state.rows={documents:[{id,status:'DELETED',is_deleted:true,created_by:'other@test.invalid'}]};
  const route=state.routes.find(route=>route.method==='DELETE'&&route.path==='/documents/:id')!;
  expect((await route.handler(ctx,request,{}, {id})).status).toBe(404);
  expect(state.deleted).toBe(false);
 });
});
