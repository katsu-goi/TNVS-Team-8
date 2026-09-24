import { hasAssignedWorkspace } from "./workspace-access.ts";

Deno.test("workspace access accepts a single direct assignment", () => {
  const allowed = hasAssignedWorkspace(
    ["COMPLIANCE_MANAGER"],
    "compliance-management",
    { COMPLIANCE_MANAGER: "compliance-management" },
  );
  if (!allowed) throw new Error("A direct workspace assignment was rejected");
});

Deno.test("workspace access checks every directly assigned role", () => {
  const workspaceByRole = {
    COMPLIANCE_MANAGER: "compliance-management",
    DATA_PROTECTION_OFFICER: "privacy",
  };

  if (!hasAssignedWorkspace(
    ["COMPLIANCE_MANAGER", "DATA_PROTECTION_OFFICER"],
    "privacy",
    workspaceByRole,
  )) {
    throw new Error("A valid secondary assigned role was rejected");
  }
});

Deno.test("workspace access rejects unassigned workspaces", () => {
  const allowed = hasAssignedWorkspace(
    ["COMPLIANCE_MANAGER"],
    "privacy",
    { COMPLIANCE_MANAGER: "compliance-management" },
  );
  if (allowed) throw new Error("An unassigned workspace was accepted");
});

Deno.test("workspace access rejects missing and malformed assignments", () => {
  const workspaceByRole = { COMPLIANCE_MANAGER: "compliance-management" };
  if (hasAssignedWorkspace([], "compliance-management", workspaceByRole)) {
    throw new Error("Missing assignments were accepted");
  }
  if (hasAssignedWorkspace([" role_compliance_manager ", "UNKNOWN"], "compliance-management", workspaceByRole)) {
    throw new Error("Malformed or unknown roles were accepted");
  }
});
