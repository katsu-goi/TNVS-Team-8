package com.photonicomega.facilities.module.governance.executor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;

import java.util.Locale;

/**
 * Reads the role name out of an approval request's payload.
 *
 * <p>Shared by {@link UserRoleGrantExecutor} and {@link UserRoleRevokeExecutor}
 * rather than written twice. The two executors do opposite things to the same
 * input, and a payload format that drifted between them would mean a grant and
 * its matching revoke could disagree about which role was involved - the sort of
 * mismatch that leaves a privilege in place after somebody has been told it was
 * removed.
 *
 * <p>Accepts either {@code {"roleName":"SECURITY_OFFICER"}} (the documented form)
 * or a bare {@code SECURITY_OFFICER}. The bare form is tolerated deliberately: the
 * payload is written by whichever UI raised the request, and a rejected payload
 * here fails <em>after</em> two people have already signed off, which is the worst
 * possible moment to be strict about quoting.
 */
final class RoleNamePayload {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private RoleNamePayload() {
    }

    /**
     * @return the role name, upper-cased with any {@code ROLE_} prefix stripped, so
     *         it matches the {@code roles.name} column regardless of whether the
     *         caller sent a Spring authority or a plain role name.
     * @throws BusinessRuleViolationException if no role name can be found
     */
    static String requireFrom(ApprovalRequest request) {
        String payload = request.getPayloadJson();
        if (payload == null || payload.isBlank()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " carries no payload, so there is no role to "
                            + "act on. A role grant or revoke must name the role in its payload as "
                            + "{\"roleName\":\"...\"}.");
        }

        String candidate = null;
        try {
            JsonNode node = MAPPER.readTree(payload);
            JsonNode field = node.hasNonNull("roleName") ? node.get("roleName") : node.get("role");
            if (field != null && field.isTextual()) {
                candidate = field.asText();
            } else if (node.isTextual()) {
                candidate = node.asText();
            }
        } catch (Exception notJson) {
            // Fall through to the bare-string reading below. Deliberately not
            // logged as an error: a bare role name is a supported input, not a
            // malformed one.
            candidate = payload;
        }

        if (candidate == null || candidate.isBlank()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " has a payload but no readable role name in "
                            + "it. Expected {\"roleName\":\"...\"}.");
        }

        String normalised = candidate.trim().toUpperCase(Locale.ROOT);
        return normalised.startsWith("ROLE_") ? normalised.substring("ROLE_".length()) : normalised;
    }
}
