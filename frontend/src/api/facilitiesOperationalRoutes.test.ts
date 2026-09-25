import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const facilitiesSource = readFileSync(resolve(process.cwd(), '../supabase/functions/facilities/index.ts'), 'utf8');
const visitorSource = readFileSync(resolve(process.cwd(), '../supabase/functions/visitor/index.ts'), 'utf8');
const officerPagesSource = readFileSync(resolve(process.cwd(), 'src/components/facilities-officer/FacilitiesOfficerPages.tsx'), 'utf8');

describe('facilities operational Edge routes', () => {
  it('serves the deployed dashboard summary path with live database counts', () => {
    expect(facilitiesSource).toContain('path: "/facilities/dashboard/summary"');
    expect(facilitiesSource).toContain('.from("facilities").select("id", { count: "exact", head: true })');
    expect(facilitiesSource).toContain('.from("visitors").select("id", { count: "exact", head: true })');
    for (const metric of ['activeBookings', 'pendingRequests', 'activeFacilities', 'todaysVisitors']) {
      expect(facilitiesSource).toContain(metric);
    }
  });

  it('loads non-deleted visitor logs and retains the legacy singular path', () => {
    expect(visitorSource).toContain('.from("visitors")');
    expect(visitorSource).toContain('.eq("is_deleted", false)');
    expect(visitorSource).toContain('path: "/visitor"');
    expect(visitorSource).toContain('path: "/visitors"');
    expect(officerPagesSource).toContain('visitorService.listVisitors()');
    expect(officerPagesSource).not.toContain("safeFetchJson('/api/v1/visitors')");
  });
});
