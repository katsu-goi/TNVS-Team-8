import { describe, expect, it } from 'vitest';
import { matchPath } from '../../../supabase/functions/_shared/route-path.ts';

describe('visitor Edge Function route matching', () => {
  it('matches the full function-prefixed kiosk configuration pathname', () => {
    expect(matchPath('/visitor/visitor-kiosk/config', '/visitor-kiosk/config')).toEqual({});
  });

  it('does not match a different HTTP route suffix', () => {
    expect(matchPath('/visitor/visitor-kiosk/register', '/visitor-kiosk/config')).toBeNull();
  });

  it('extracts protected visitor route parameters with the function prefix present', () => {
    expect(matchPath('/visitor/visitors/visitor-123/approval', '/visitors/:id/approval'))
      .toEqual({ id: 'visitor-123' });
  });
});
