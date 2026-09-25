import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listFacilities: vi.fn(), createFacility: vi.fn(), updateFacility: vi.fn(), uploadFloorPlan: vi.fn(), setFacilityActive: vi.fn(),
}));
vi.mock('../../api/facilityManagementService', () => ({ facilityManagementService: api }));

import { FacilityManagement } from './FacilityManagement';

const facility = {
  id: 'facility-a', name: 'Hirna Main Hub', facilityName: 'Hirna Main Hub', code: 'HIRNA-01', type: 'OFFICE',
  description: 'Primary operations site', capacity: 100, amenities: ['Wi-Fi', 'Projector'], status: 'AVAILABLE', active: true,
  floorPlanUrl: null, floorPlanFileName: null, floorPlanSize: null, spaceCount: 6, activeSpaceCount: 5,
  activeCapacity: 84, activeReservationCount: 4, createdAt: '2026-09-25T00:00:00Z', updatedAt: null,
};

const Destination = () => <div>Opened {useParams().facilityId}</div>;
const renderPage = () => render(<MemoryRouter initialEntries={['/facilities/rooms']}><Routes><Route path="/facilities/rooms" element={<FacilityManagement />} /><Route path="/facilities/management/:facilityId" element={<Destination />} /></Routes></MemoryRouter>);

describe('Facility Management cards', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => cleanup());

  it('renders live card fields and opens the correct dedicated facility route', async () => {
    api.listFacilities.mockResolvedValue([facility]);
    renderPage();
    expect(await screen.findByText('Hirna Main Hub')).toBeInTheDocument();
    expect(screen.getByText(/HIRNA-01/)).toBeInTheDocument();
    expect(screen.getAllByText('84').length).toBeGreaterThan(0);
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByText('No amenities listed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Hirna Main Hub'));
    expect(await screen.findByText('Opened facility-a')).toBeInTheDocument();
  });

  it('shows a professional empty state backed by the create action', async () => {
    api.listFacilities.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No facilities configured')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /add facility/i }).length).toBeGreaterThan(0);
  });

  it('replaces backend route details with a safe load error', async () => {
    api.listFacilities.mockRejectedValue(new Error('No route for GET /facilities/management'));
    renderPage();
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument());
    expect(screen.queryByText(/No route for GET/i)).not.toBeInTheDocument();
  });

  it('blocks invalid capacity before calling the create API', async () => {
    api.listFacilities.mockResolvedValue([]);
    renderPage();
    await screen.findByText('No facilities configured');
    fireEvent.click(screen.getAllByRole('button', { name: /add facility/i })[0]);
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'Invalid Hub' } });
    fireEvent.change(screen.getByPlaceholderText('HQ-MNL'), { target: { value: 'BAD-1' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save facility/i }));
    expect(api.createFacility).not.toHaveBeenCalled();
  });
});
