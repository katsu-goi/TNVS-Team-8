import { assertStringIncludes } from 'jsr:@std/assert@1';

const migrationUrl = new URL('../migrations/20261024000100_visitor_relationship_constraints.sql', import.meta.url);
const sql = (await Deno.readTextFile(migrationUrl)).toLowerCase();

Deno.test('visitor relationship migration covers every workflow relationship and supporting index', () => {
  for (const constraint of [
    'fk_visitor_verifications_visitor',
    'fk_visitors_current_verification',
    'fk_visitor_verifications_watchlist',
    'fk_visitor_verifications_reviewer',
    'fk_visitor_clearance_reviews_visitor',
    'fk_visitor_clearance_reviews_verification',
    'fk_visitor_clearance_reviews_reviewer',
    'fk_visitor_workflow_events_visitor',
    'fk_visitor_workflow_events_verification',
    'fk_visitor_workflow_events_actor',
  ]) {
    assertStringIncludes(sql, `constraint ${constraint}`);
    assertStringIncludes(sql, `validate constraint ${constraint}`);
  }

  for (const index of [
    'idx_visitors_current_verification_id',
    'idx_visitor_verifications_watchlist_entry',
    'idx_visitor_verifications_reviewed_by',
    'idx_visitor_clearance_reviews_visitor_id',
    'idx_visitor_clearance_reviews_reviewer_id',
    'idx_visitor_workflow_events_verification_id',
    'idx_visitor_workflow_events_actor_id',
  ]) assertStringIncludes(sql, `index if not exists ${index}`);

  assertStringIncludes(sql, 'not valid');
  assertStringIncludes(sql, 'visitor relationship migration aborted');
});
