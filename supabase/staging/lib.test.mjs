import assert from "node:assert/strict";
import test from "node:test";
import { QA_ACCOUNTS, TEAM8_EMAIL_BY_SLUG } from "./lib.mjs";

test("QA account catalog contains all 17 unique password and employee identifiers", () => {
  assert.equal(QA_ACCOUNTS.length, 17);
  assert.equal(new Set(QA_ACCOUNTS.map((account) => account.passwordEnv)).size, 17);
  assert.equal(new Set(QA_ACCOUNTS.map((account) => account.employeeId)).size, 17);
  assert.equal(new Set(QA_ACCOUNTS.map((account) => account.email)).size, 17);
});

test("the twelve supplied Team 8 identifiers are normalized and the remaining five stay staging-only", () => {
  assert.equal(Object.keys(TEAM8_EMAIL_BY_SLUG).length, 12);
  for (const [slug, email] of Object.entries(TEAM8_EMAIL_BY_SLUG)) {
    const account = QA_ACCOUNTS.find((candidate) => candidate.slug === slug);
    assert.equal(account?.email, email.toLowerCase());
    assert.match(account.email, /@photonicomega\.com$/);
  }
  const stagingOnly = QA_ACCOUNTS.filter((account) => !TEAM8_EMAIL_BY_SLUG[account.slug]);
  assert.deepEqual(stagingOnly.map((account) => account.slug), ["legal-officer", "contract-officer", "employee-a", "employee-b", "multi-role"]);
  for (const account of stagingOnly) assert.match(account.email, /^qa\..+@tnvs-staging\.invalid$/);
});

test("direct role mappings remain canonical, including the multi-role account", () => {
  assert.deepEqual(QA_ACCOUNTS.find((account) => account.slug === "legal-counsel")?.roles, ["LEGAL_COUNSEL"]);
  assert.deepEqual(QA_ACCOUNTS.find((account) => account.slug === "department-head")?.roles, ["DEPARTMENT_HEAD"]);
  assert.deepEqual(QA_ACCOUNTS.find((account) => account.slug === "multi-role")?.roles, ["COMPLIANCE_MANAGER", "DEPARTMENT_HEAD"]);
});
