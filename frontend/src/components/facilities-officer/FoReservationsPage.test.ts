import { describe, expect, it } from 'vitest';
import { getReservationFocusTab } from './reservationFocus';

describe('Facilities Officer notification focus', () => {
  it('opens the tab that renders the authorized reservation status', () => {
    expect(getReservationFocusTab('PENDING')).toBe('pending');
    expect(getReservationFocusTab('PENDING_MANAGER_APPROVAL')).toBe('pending');
    expect(getReservationFocusTab('APPROVED')).toBe('upcoming');
    expect(getReservationFocusTab('COMPLETED')).toBe('recent');
  });
});
