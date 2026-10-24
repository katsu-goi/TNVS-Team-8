export type FacilityPermitNotificationInput = {
  facilityName: string;
  documentCategory: string;
  documentId: string;
};

export function buildFacilityPermitNotification(input: FacilityPermitNotificationInput) {
  return {
    p_roles: ['COMPLIANCE_OFFICER'],
    p_dedup_key: `facility:permit:${input.documentId}:review`,
    p_title: `Permit routed for review: ${input.documentCategory}`,
    p_message: `${input.facilityName} has a new regulatory document awaiting Compliance Officer review.`,
    p_type: 'FACILITY_PERMIT_REVIEW',
    p_entity_type: 'Document',
    p_entity_id: input.documentId,
  };
}
