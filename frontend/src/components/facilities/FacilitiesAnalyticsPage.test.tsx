import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FacilitiesAnalyticsPage } from './FacilitiesAnalyticsPage';
import { fetchAnalytics, exportAnalyticsCsv } from '../../api/analyticsService';
import type { AnalyticsData } from '../../types';
vi.mock('../../api/analyticsService',()=>({fetchAnalytics:vi.fn(),exportAnalyticsCsv:vi.fn()}));
vi.mock('../../stores/realtimeSyncStore',()=>({useRealtimeSyncStore:()=>0}));
describe('Super Admin facility reporting scope',()=>{
 const base: AnalyticsData = {scope:'FACILITIES_MANAGER', timezone:'Asia/Manila', generatedAt:'2026-10-02T00:00:00Z', filter:{preset:'last_30_days',semantics:'from-inclusive/to-exclusive'}, period:{from:'2026-10-01T00:00:00Z',toExclusive:'2026-10-02T00:00:00Z'}};
 beforeEach(()=>{vi.mocked(fetchAnalytics).mockReset().mockResolvedValue({...base,facilities:{submitted:12}});});
 afterEach(cleanup);
 it('requests and exports the facility view and displays its real totals',async()=>{
  render(<FacilitiesAnalyticsPage title="Facility Reports" subtitle="Facility analysis"/>);
  expect(await screen.findByText('12')).toBeInTheDocument();
  expect(fetchAnalytics).toHaveBeenCalledWith({preset:'last_30_days',viewRole:'FACILITIES_MANAGER'});
  fireEvent.click(screen.getByRole('button',{name:'CSV'}));
  await waitFor(()=>expect(exportAnalyticsCsv).toHaveBeenCalledWith({preset:'last_30_days',viewRole:'FACILITIES_MANAGER'}));
 });
 it('reports a wrong response shape instead of manufacturing facility zeros',async()=>{
  vi.mocked(fetchAnalytics).mockResolvedValue({...base,scope:'SUPER_ADMIN'});
  render(<FacilitiesAnalyticsPage title="Facility Reports" subtitle="Facility analysis"/>);
  expect(await screen.findByText('The server did not return facility analytics.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Facility KPI summary')).not.toBeInTheDocument();
 });
});
