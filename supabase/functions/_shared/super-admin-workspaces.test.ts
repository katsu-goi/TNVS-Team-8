import { hasAssignedWorkspace } from './workspace-access.ts';
import { canAccessReservationPortal, canOperateReservations } from './reservation-portal-access.ts';
const admin = { assignedRoles:['SUPER_ADMIN'], roles:['SUPER_ADMIN'], permissions:[], oversightActive:false };
Deno.test('Super Admin can access configured workspaces but not unknown workspaces or target scopes', () => {
  const map = { DATA_PROTECTION_OFFICER:'privacy' };
  if (!hasAssignedWorkspace(admin.assignedRoles,'privacy',map)) throw Error('admin denied');
  if (hasAssignedWorkspace(admin.assignedRoles,'unknown',map)) throw Error('unknown allowed');
  if (hasAssignedWorkspace(admin.assignedRoles,'privacy',map,true)) throw Error('oversight allowed');
});
Deno.test('Team8 domain and operations authority depend on direct assignment and scope', () => {
  if (!canAccessReservationPortal(admin,'admin@outside.test',['team8.tnvs']) || !canOperateReservations(admin)) throw Error('admin denied');
  const scoped = {...admin,assignedRoles:['EMPLOYEE'],oversightActive:true};
  if (canAccessReservationPortal(scoped,'employee@outside.test',['team8.tnvs']) || canOperateReservations(scoped)) throw Error('scope elevated');
  if (!canAccessReservationPortal(scoped,'employee@team8.tnvs',['team8.tnvs'])) throw Error('ordinary domain denied');
  if (!canOperateReservations({...scoped,assignedRoles:['FACILITIES_OFFICER']})) throw Error('officer denied');
});
