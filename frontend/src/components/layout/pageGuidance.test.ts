import { describe, expect, it } from 'vitest';
import { getRolePresentation } from '../../config/roleRegistry';
import { findNavigationEntries, getCurrentNavigationEntry, getPageGuide } from './pageGuidance';

describe('guidance and navigation scope', () => {
  it('explains the manager list without offering a request form that does not exist', () => {
    const help = getPageGuide('/facilities/reservations', 'TNVS Hub Reservations');
    expect(help.steps.join(' ')).toContain('Booking Approvals');
    expect(help.steps.join(' ')).not.toContain('enter the meeting details');
  });
  it('keeps page search inside the current role navigation', () => {
    const employee = getRolePresentation('EMPLOYEE')!;
    expect(findNavigationEntries(employee.navigation, employee.portalLabel, 'backup')).toEqual([]);
    expect(findNavigationEntries(employee.navigation, employee.portalLabel, 'book a room').map(item => item.path)).toContain('/employee/reservations');
  });
  it('does not mistake a similarly named role path for the current page', () => {
    const legal = getRolePresentation('LEGAL_OFFICER')!;
    expect(getCurrentNavigationEntry(legal.navigation, legal.portalLabel, '/legal-counsel/dashboard')).toBeUndefined();
  });
  it('distinguishes Team 8 confirmation and email delivery from room approvals', () => {
    const help = getPageGuide('/reservation-portal', 'Team 8 Reservation Portal');
    expect(help.steps.join(' ')).toContain('confirmed even if an invitation email was not delivered');
    expect(help.steps.join(' ')).not.toContain('Facilities Manager then approves');
  });
});
