import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useOversightContext } from './useOversightContext';
import { clearOversightSession, persistOversightSession } from '../utils/oversightSession';
describe('reactive oversight scope', () => {
  beforeEach(()=>localStorage.clear());
  afterEach(cleanup);
  it('updates mounted consumers when oversight starts and stops', () => {
    const hook=renderHook(useOversightContext);
    expect(hook.result.current.sessionId).toBeNull();
    act(()=>persistOversightSession('s',{id:'employee',email:'e@test.invalid',assignedRoles:['EMPLOYEE']}));
    expect(hook.result.current.targetUser?.id).toBe('employee');
    act(()=>clearOversightSession());
    expect(hook.result.current).toEqual({sessionId:null,targetUser:null});
    hook.unmount();
    act(()=>persistOversightSession('other',{id:'e',email:'e@test.invalid'}));
  });
  it('retains an incomplete or malformed scope as unprivileged', () => {
    localStorage.setItem('oversightSessionId','s');
    localStorage.setItem('oversightTargetUser','invalid');
    const hook=renderHook(useOversightContext);
    expect(hook.result.current.sessionId).toBe('s');
    expect(hook.result.current.targetUser).toBeNull();
  });
  it.each(['null', '"employee"', '{}', '{"id":"employee"}'])('rejects a malformed target shape %s', raw => {
    localStorage.setItem('oversightSessionId','s');
    localStorage.setItem('oversightTargetUser',raw);
    const hook=renderHook(useOversightContext);
    expect(hook.result.current.targetUser).toBeNull();
    expect(hook.result.current.sessionId).toBe('s');
  });
});
