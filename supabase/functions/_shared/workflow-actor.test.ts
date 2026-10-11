import { workflowActorRole } from './workflow-actor.ts';
import type { AuthContext } from './guard.ts';
const ctx = {user:{assignedRoles:['SUPER_ADMIN']},roles:['SUPER_ADMIN'],permissions:[]} as unknown as AuthContext;
Deno.test('workflow actions record genuine Super Admin authority', () => {
  if (workflowActorRole(ctx,'FACILITIES_OFFICER') !== 'SUPER_ADMIN') throw new Error('False actor role');
});
Deno.test('oversight and ordinary callers retain their workflow role', () => {
  if (workflowActorRole({...ctx,oversight:{} as AuthContext['oversight']},'FACILITIES_OFFICER') !== 'FACILITIES_OFFICER') throw new Error('Actor privilege leaked');
  if (workflowActorRole({...ctx,user:{assignedRoles:['FACILITIES_MANAGER']} as AuthContext['user']},'FACILITIES_MANAGER') !== 'FACILITIES_MANAGER') throw new Error('Manager identity lost');
});
