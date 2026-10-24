export type ReservationFocusStatus =
  | 'PENDING' | 'PENDING_MANAGER_APPROVAL' | 'APPROVED' | 'CONFIRMED'
  | 'ESCALATED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

export type ReservationTab = 'upcoming' | 'pending' | 'calendar' | 'recent' | 'utilization' | 'notices';

export function getReservationFocusTab(status: ReservationFocusStatus): ReservationTab {
  if (status === 'PENDING' || status === 'PENDING_MANAGER_APPROVAL') return 'pending';
  if (status === 'APPROVED') return 'upcoming';
  return 'recent';
}
