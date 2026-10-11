import { resolveAnalyticsRole, canUseChatModule } from './module-scope.ts';
const admin={assignedRoles:['SUPER_ADMIN'],roles:['SUPER_ADMIN'],permissions:[],oversightActive:false};
const roles=['SUPER_ADMIN','SYSTEM_ADMIN','FACILITIES_MANAGER','EMPLOYEE'];
Deno.test('Super Admin selects actual operational or business analytics without changing actor',()=>{
  if(resolveAnalyticsRole(admin,roles,'SYSTEM_ADMIN')!=='SYSTEM_ADMIN')throw Error('operational scope missing');
  if(resolveAnalyticsRole(admin,roles,'FACILITIES_MANAGER')!=='FACILITIES_MANAGER')throw Error('facilities scope missing');
  if(resolveAnalyticsRole(admin,roles,'UNKNOWN')!==null)throw Error('unknown scope allowed');
  if(admin.assignedRoles.join()!=='SUPER_ADMIN')throw Error('actor changed');
});
Deno.test('requested analytics never elevates ordinary or target-scoped accounts',()=>{
  const employee={...admin,assignedRoles:['EMPLOYEE'],roles:['EMPLOYEE']};
  if(resolveAnalyticsRole(employee,roles,'SYSTEM_ADMIN')!==null)throw Error('ordinary account elevated');
  if(resolveAnalyticsRole({...employee,oversightActive:true},roles,'FACILITIES_MANAGER')!==null)throw Error('target elevated');
  if(resolveAnalyticsRole(employee,roles,'EMPLOYEE')!=='EMPLOYEE')throw Error('own scope denied');
});
Deno.test('direct administrator can use known AI modules in own context',()=>{
  const map={legal_management:['LEGAL_OFFICER']};
  if(!canUseChatModule(admin,'legal_management',map))throw Error('administrator module denied');
  if(canUseChatModule(admin,'unknown',map))throw Error('unknown module allowed');
  if(canUseChatModule({...admin,oversightActive:true},'legal_management',map))throw Error('target elevated');
});
