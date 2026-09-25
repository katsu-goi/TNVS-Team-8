import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { safeFetchJson } = vi.hoisted(() => ({ safeFetchJson: vi.fn() }));

vi.mock('../../api/client', () => ({ safeFetchJson }));
vi.mock('../../stores/realtimeSyncStore', () => ({
  useRealtimeSyncStore: (selector: (state: { revision: number }) => unknown) => selector({ revision: 0 }),
}));

import { FacilitiesOfficerDashboard } from './FacilitiesOfficerDashboard';

describe('FacilitiesOfficerDashboard', () => {
  beforeEach(() => {
    safeFetchJson.mockReset();
    safeFetchJson.mockResolvedValue({
      data: {
        kpi: { activeBookings: 4, pendingRequests: 2, activeFacilities: 3, todaysVisitors: 5 },
        charts: {},
        tables: {},
      },
    });
  });

  it('loads the real facilities summary route and renders its operational counts', async () => {
    render(<MemoryRouter><FacilitiesOfficerDashboard /></MemoryRouter>);

    expect(await screen.findByText('Active Bookings')).toBeInTheDocument();
    expect(screen.getByText('Pending Requests')).toBeInTheDocument();
    expect(screen.getByText('Active Facilities')).toBeInTheDocument();
    expect(screen.getByText("Today's Visitors")).toBeInTheDocument();
    await waitFor(() => expect(safeFetchJson).toHaveBeenCalledWith('/api/v1/facilities/dashboard/summary'));
  });
});
