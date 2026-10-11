import { useMemo, useSyncExternalStore } from 'react';
import type { PortalScope } from '../utils/portalAccess';
import { OVERSIGHT_SESSION_ID_KEY, OVERSIGHT_TARGET_USER_KEY } from '../utils/oversightSession';
const subscribe = (notify: () => void) => {
  window.addEventListener('oversight:changed',notify);
  window.addEventListener('storage',notify);
  return () => { window.removeEventListener('oversight:changed',notify); window.removeEventListener('storage',notify); };
};
const snapshot = () => JSON.stringify([localStorage.getItem(OVERSIGHT_SESSION_ID_KEY),localStorage.getItem(OVERSIGHT_TARGET_USER_KEY)]);
export function useOversightContext(): PortalScope {
  const value = useSyncExternalStore(subscribe,snapshot,() => '[null,null]');
  return useMemo(() => {
    const [sessionId,raw] = JSON.parse(value) as [string|null,string|null];
    try { return {sessionId,targetUser:raw ? JSON.parse(raw) : null}; }
    catch { return {sessionId:sessionId || 'invalid-oversight',targetUser:null}; }
  },[value]);
}
