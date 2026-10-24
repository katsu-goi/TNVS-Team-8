import { assertEquals } from 'jsr:@std/assert@1';
import { buildFacilityPermitNotification } from './facility-permit-notification.ts';

Deno.test('facility permit review is delivered to every active Compliance Officer', () => {
  assertEquals(buildFacilityPermitNotification({
    facilityName: 'TNVS Hub',
    documentCategory: 'LTFRB Permit',
    documentId: '1b8a9977-9874-4ea6-a79b-1b71c2a7b5ef',
  }), {
    p_roles: ['COMPLIANCE_OFFICER'],
    p_dedup_key: 'facility:permit:1b8a9977-9874-4ea6-a79b-1b71c2a7b5ef:review',
    p_title: 'Permit routed for review: LTFRB Permit',
    p_message: 'TNVS Hub has a new regulatory document awaiting Compliance Officer review.',
    p_type: 'FACILITY_PERMIT_REVIEW',
    p_entity_type: 'Document',
    p_entity_id: '1b8a9977-9874-4ea6-a79b-1b71c2a7b5ef',
  });
});
