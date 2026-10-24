export type RouteParams = Record<string, string>;

/**
 * Matches an Edge Function request pathname against a route suffix.
 *
 * Supabase keeps the function slug in the pathname delivered to the worker.
 * For example, invoking the `visitor` function route `/visitor-kiosk/config`
 * arrives as `/visitor/visitor-kiosk/config`. Matching by complete path
 * segments keeps that platform prefix while avoiding substring matches.
 */
export function matchPath(actual: string, template: string): RouteParams | null {
  const actualSegs = actual.split("/").filter(Boolean);
  const templateSegs = template.split("/").filter(Boolean);
  if (templateSegs.length > actualSegs.length) return null;
  const offset = actualSegs.length - templateSegs.length;
  const params: RouteParams = {};
  for (let i = 0; i < templateSegs.length; i++) {
    const expected = templateSegs[i];
    const received = actualSegs[offset + i];
    if (expected.startsWith(":")) {
      params[expected.slice(1)] = received;
    } else if (expected !== received) {
      return null;
    }
  }
  return params;
}
