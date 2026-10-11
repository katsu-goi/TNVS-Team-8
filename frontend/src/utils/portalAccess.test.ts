import { describe, expect, it } from 'vitest';
import { hasDirectSuperAdminAccess, hasPortalAccess } from './portalAccess';
import type { User } from '../types';
const admin: User = { id: 'a', email: 'a@test.invalid', assignedRoles: ['SUPER_ADMIN'], roles: ['SUPER_ADMIN'] };
const employee: User = { id: 'e', email: 'e@test.invalid', assignedRoles: ['EMPLOYEE'], roles: ['EMPLOYEE'] };
const none = { sessionId: null, targetUser: null };
describe('portal authority', () => {
  it('admits a directly assigned Super Admin into every business role', () => {
    for (const role of ['SYSTEM_ADMIN','FACILITIES_MANAGER','FACILITIES_OFFICER','EMPLOYEE','LEGAL_OFFICER','CONTRACT_OFFICER','DATA_PROTECTION_OFFICER']) expect(hasPortalAccess(admin,role,none)).toBe(true);
  });
  it('does not use inherited authority or an incomplete oversight session', () => {
    expect(hasDirectSuperAdminAccess({...admin,assignedRoles:[]},none)).toBe(false);
    expect(hasDirectSuperAdminAccess(admin,{sessionId:'session',targetUser:null})).toBe(false);
    expect(hasPortalAccess(admin,'FACILITIES_MANAGER',{sessionId:'session',targetUser:null})).toBe(false);
  });
  it('uses the selected target without leaking actor authority', () => {
    const scope = {sessionId:'session',targetUser:employee};
    expect(hasPortalAccess(admin,'EMPLOYEE',scope)).toBe(true);
    expect(hasPortalAccess(admin,'FACILITIES_MANAGER',scope)).toBe(false);
    expect(hasPortalAccess(employee,'FACILITIES_MANAGER',none)).toBe(false);
  });
});
