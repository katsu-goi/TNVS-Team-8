import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { employeeService } from '../../api/employeeService';
import { EmpReservationsPage, EmpRequestsPage, EmpVisitorsPage } from './EmployeePages';

vi.mock('../../api/employeeService', () => ({ employeeService: {
  getReservations: vi.fn(async () => [{ id: 'r1', title: 'Team meeting', status: 'APPROVED' }]),
  getAvailableRooms: vi.fn(async () => ({ rooms: [] })),
  getRequests: vi.fn(async () => []), getVisitors: vi.fn(async () => []),
  createReservation: vi.fn(), createRequest: vi.fn(), createVisitor: vi.fn(),
} }));
afterEach(cleanup);

describe('everyday workflow guidance', () => {
  it('ignores room availability for a schedule that changed while searching', async () => {
    let finish: ((value: { rooms: unknown[] }) => void) | undefined;
    vi.mocked(employeeService.getAvailableRooms).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<MemoryRouter><EmpReservationsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'New Reservation' }));
    const dialog = screen.getByRole('dialog');
    const date = within(dialog).getByLabelText('Date');
    fireEvent.change(date, { target: { value: '2026-10-20' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find Available Rooms' }));
    fireEvent.change(date, { target: { value: '2026-10-21' } });
    await act(async () => finish?.({ rooms: [{ id: 'old', roomName: 'Obsolete room result', selectable: true }] }));
    expect(within(dialog).queryByRole('button', { name: /Obsolete room result/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Find Available Rooms' })).toBeEnabled();
  });
  it('distinguishes room approval from confirmation and labels every booking field', async () => {
    render(<MemoryRouter><EmpReservationsPage /></MemoryRouter>);
    expect(await screen.findByText(/Waiting for the Facilities Officer to confirm/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'New Reservation' }));
    const dialog = screen.getByRole('dialog');
    for (const label of ['Date', 'Start time', 'End time', 'Meeting title', 'Description', 'Expected attendees']) {
      expect(within(dialog).getByLabelText(new RegExp(label, 'i'))).toBeVisible();
    }
    expect(within(dialog).getByText(/Choose a date and time/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find Available Rooms' }));
    expect(await within(dialog).findByText(/Choose a date before searching/)).toBeVisible();
    expect(employeeService.createReservation).not.toHaveBeenCalled();
  });

  it('names visitor fields and explains registration is followed by screening', async () => {
    render(<MemoryRouter><EmpVisitorsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Register Visitor' }));
    const dialog = screen.getByRole('dialog');
    for (const label of ['Full Name', 'Email', 'Phone', 'Company', 'Purpose of Visit', 'Expected Arrival']) {
      expect(within(dialog).getByLabelText(new RegExp(label, 'i'))).toBeVisible();
    }
    expect(within(dialog).getByText(/screening.*check-in/i)).toBeVisible();
  });

  it('names request fields and keeps missing-title feedback visible in the form', async () => {
    render(<MemoryRouter><EmpRequestsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Request' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/Request type/)).toBeVisible();
    expect(within(dialog).getByLabelText(/Title/)).toBeVisible();
    expect(within(dialog).getByLabelText(/Description/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Title is required.');
    expect(employeeService.createRequest).not.toHaveBeenCalled();
  });
});
