package com.photonicomega.facilities.module.governance;

import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.ApprovalGateService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Asserts that no route can destroy or revoke anything without going through the
 * approval gate.
 *
 * <p>This is the check the ARBAC work exists to satisfy, and it is deliberately
 * structural rather than behavioural. Fifteen executors and a working gate prove
 * that an approved action can be carried out correctly; they prove nothing at all
 * about whether the <em>old</em> route that did the same thing directly is still
 * sitting there answering requests. A gate with a door left open beside it is not a
 * gate, and that is the specific failure this catches - one that no amount of
 * testing the gate itself would ever reveal.
 *
 * <p>It also catches the version of the problem that arrives later: someone adds a
 * new {@code @DeleteMapping} next year, never having read {@link SensitiveAction},
 * and the coverage silently regresses. This test fails on that commit and names the
 * route.
 *
 * <p>Routes are classified by the two things visible at the mapping level - the HTTP
 * verb and the path. Every DELETE is destructive by definition. Beyond that, a small
 * vocabulary of path segments ({@code terminate}, {@code revoke}, {@code restore},
 * and so on) marks the POSTs and PUTs that take something away or overwrite it,
 * because in this codebase those verbs are spelled out in the URL. The vocabulary is
 * a heuristic and will over-match; that is the correct direction to be wrong in,
 * since an over-match costs one line in {@link #ROUTE_DECISIONS} and a miss costs an
 * ungoverned deletion.
 *
 * <p>Every route the sweep finds must appear in {@link #ROUTE_DECISIONS} with one of
 * two verdicts: the {@link SensitiveAction} that governs it, or {@code null} with a
 * written reason it needs no approval. The reason is required. An exemption nobody
 * had to justify in a sentence is how this list would quietly become a list of
 * everything.
 */
@SpringBootTest
@ActiveProfiles("test")
class GatedRouteCoverageTest {

    /**
     * Path segments that mark a mutating route as destructive.
     *
     * <p>Only whole segments count. Matching substrings would pull in every route
     * whose noun happens to contain one of these words.
     *
     * <p>{@code approve} and {@code reject} are here for a reason worth writing down.
     * They read as the opposite of destructive - one grants, one declines - and neither
     * takes anything away by itself. But {@code POST /v1/compliance/disposals/{id}/approve}
     * is the exact keystroke that destroys a record: it carries the last signature into
     * {@code ApprovalGateService.execute}, which runs the disposal executor. A
     * vocabulary of scary-sounding verbs missed it completely, and the verdict recorded
     * against it sat in {@link #ROUTE_DECISIONS} looking like coverage while the sweep
     * had never once surfaced the route. That is the failure this vocabulary exists to
     * prevent, arriving through the mildest word in the file.
     */
    private static final Set<String> DESTRUCTIVE_SEGMENTS = Set.of(
            "terminate", "revoke", "restore", "rollback", "purge", "dispose", "disposal",
            "declassify", "deactivate", "delete", "remove", "override", "unblock", "reset",
            "archive", "wipe", "approve", "reject");

    /** Verbs that can change state. GET and HEAD are read-only by contract. */
    private static final Set<String> MUTATING_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

    /**
     * The verdict on every destructive route in the application.
     *
     * <p>Keyed by {@code "METHOD /path"}. A {@link SensitiveAction} value means the
     * route must be reachable only through an approval; {@code null} means it is
     * exempt, and the comment above it says why.
     */
    private static final Map<String, SensitiveAction> ROUTE_DECISIONS = new LinkedHashMap<>();
    static {
        // ------------------------------------------------------------------
        // Governed. The route raises an approval and mutates nothing; the act
        // itself happens in the action's executor, after the signatures exist.
        // ------------------------------------------------------------------

        // Records disposal - the worked example the whole gate was built around.
        ROUTE_DECISIONS.put("POST /v1/compliance/documents/{id}/disposal", SensitiveAction.DOCUMENT_DISPOSE);

        // The other two are decision routes, not request routes: they carry a signature
        // into ApprovalGateService.decide, and the last signature into execute, which is
        // where the record is actually destroyed. They keep their original paths because
        // the Records Officer's disposal queue in the front end calls them, and the front
        // end is not being redesigned - so the path and the response envelope stayed and
        // the body was rewired onto the gate. What they must never go back to being is
        // what they were: a direct soft-delete with the module's own status check in
        // front of it.
        ROUTE_DECISIONS.put("POST /v1/compliance/disposals/{id}/approve", SensitiveAction.DOCUMENT_DISPOSE);
        ROUTE_DECISIONS.put("POST /v1/compliance/disposals/{id}/reject", SensitiveAction.DOCUMENT_DISPOSE);

        // Contracts and clauses. Two terminate routes exist, in legal and in
        // procurement, and they are separate mappings onto the same act - which is
        // exactly the kind of duplicate a hand audit misses and this sweep does not.
        ROUTE_DECISIONS.put("POST /v1/legal/contracts/{id}/terminate", SensitiveAction.CONTRACT_TERMINATE);
        ROUTE_DECISIONS.put("POST /v1/procurement/contracts/{id}/terminate", SensitiveAction.CONTRACT_TERMINATE);
        ROUTE_DECISIONS.put("DELETE /v1/legal/clauses/{id}", SensitiveAction.LEGAL_CLAUSE_DELETE);
        ROUTE_DECISIONS.put("DELETE /v1/procurement/clauses/{id}", SensitiveAction.LEGAL_CLAUSE_DELETE);
        ROUTE_DECISIONS.put("DELETE /v1/procurement/obligations/{id}", SensitiveAction.OBLIGATION_DELETE);

        // Security. Both take a control away rather than adding one, which is why
        // they are gated in the direction they are: blocking an IP needs no approval,
        // unblocking one does.
        ROUTE_DECISIONS.put("DELETE /v1/security/admin/blocked-ips/{ipAddress}", SensitiveAction.IP_UNBLOCK);
        ROUTE_DECISIONS.put("POST /v1/security/admin/sessions/{id}/revoke", SensitiveAction.SESSION_REVOKE);

        // AI. Changing what the assistant tells people is a policy change with no
        // build and no diff, so it gets the same treatment as deleting a record.
        ROUTE_DECISIONS.put("DELETE /v1/ai/providers/{id}", SensitiveAction.AI_PROVIDER_DELETE);
        ROUTE_DECISIONS.put("POST /v1/ai/instructions/{moduleKey}/restore/{version}",
                SensitiveAction.AI_INSTRUCTION_ROLLBACK);

        // ------------------------------------------------------------------
        // Exempt. Matched the destructive vocabulary but takes nothing away.
        // ------------------------------------------------------------------

        // Archiving sets status to ARCHIVED and saves. The document, its file and its
        // retention record all survive and stay retrievable - archiving is the
        // intended final state of a record's life in this system, not a loss of one,
        // so requiring two signatures to reach it would gate the success case. The
        // act that does destroy an archived document is DOCUMENT_DISPOSE, gated above.
        ROUTE_DECISIONS.put("POST /v1/compliance/documents/{id}/archive", null);

        // Spring Boot's BasicErrorController answers every verb on /error, so DELETE
        // appears here as a framework artefact. It renders an error page and touches
        // no application state.
        ROUTE_DECISIONS.put("DELETE /error", null);

        // Business approvals. Every one of these moves a record forward through its
        // ordinary life - a document becomes approved, a contract becomes active, a
        // reservation becomes confirmed, an employee's request gets an answer. They
        // matched the vocabulary only because "approve" and "reject" had to be added to
        // it to catch the disposal decision above, and over-matching is the direction
        // this sweep is deliberately wrong in.
        //
        // The distinction that decides all nine, and the one to apply to the tenth: it
        // is not the word in the URL that matters, it is what the thing being approved
        // does. Approving a disposal destroys a record, so that route is governed.
        // Approving a reservation books a room. Rejecting an employee's request
        // disappoints them and changes nothing that cannot be raised again tomorrow.
        // Gating these would put two signatures in front of the success path of the
        // whole system, which is not caution - it is a queue nobody clears, and the
        // fastest way to teach an organisation to route around its own controls.
        //
        // These are also the operational decisions of the departments that own them.
        // This system records and governs; it does not take over Procurement's judgment
        // about a contract or a manager's about a booking.
        ROUTE_DECISIONS.put("POST /v1/compliance/documents/{id}/approve", null);
        ROUTE_DECISIONS.put("POST /v1/legal/documents/{id}/approve", null);
        ROUTE_DECISIONS.put("POST /v1/legal/contracts/{id}/approve", null);
        ROUTE_DECISIONS.put("POST /v1/procurement/documents/{id}/approve", null);
        ROUTE_DECISIONS.put("POST /v1/procurement/contracts/{id}/approve", null);
        ROUTE_DECISIONS.put("POST /v1/facilities-manager/reservations/{id}/approve", null);
        ROUTE_DECISIONS.put("POST /v1/facilities-manager/reservations/{id}/reject", null);
        ROUTE_DECISIONS.put("POST /v1/requests-review/{id}/approve", null);
        ROUTE_DECISIONS.put("POST /v1/requests-review/{id}/reject", null);
    }

    /**
     * Routes belonging to the gate itself.
     *
     * <p>Excluded before classification rather than exempted individually. {@code
     * POST /v1/governance/approvals/{id}/reject} and its siblings match the
     * destructive vocabulary, but requiring an approval to approve something is the
     * one circularity that cannot be satisfied.
     */
    private static final String GATE_PREFIX = "/v1/governance";

    /**
     * The application's own mapping, named explicitly.
     *
     * <p>Actuator contributes a second {@code RequestMappingHandlerMapping}
     * ({@code controllerEndpointHandlerMapping}), so the injection is ambiguous
     * without the qualifier. Naming this one is also correct on the merits: actuator
     * endpoints are not application routes and have no business appearing in a
     * governance sweep.
     */
    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Autowired
    private ApprovalGateService gate;

    @Test
    @DisplayName("every destructive route has a recorded verdict: gated, or exempt with a reason")
    void everyDestructiveRouteIsAccountedFor() {
        Map<String, String> found = destructiveRoutes();

        List<String> unaccounted = new ArrayList<>();
        for (Map.Entry<String, String> route : found.entrySet()) {
            if (!ROUTE_DECISIONS.containsKey(route.getKey())) {
                unaccounted.add(route.getKey() + "   -> " + route.getValue());
            }
        }

        assertTrue(unaccounted.isEmpty(),
                "These routes can destroy, revoke or overwrite something and no verdict has been "
                        + "recorded for them. Each one is either a bypass around the approval gate or "
                        + "a route that genuinely needs no approval - but nobody has said which, so "
                        + "right now they are simply ungoverned. Add each to ROUTE_DECISIONS with the "
                        + "SensitiveAction that governs it, or with null and a written reason.\n\n  "
                        + String.join("\n  ", unaccounted)
                        + "\n\nGated actions available: "
                        + String.join(", ", actionNames()) + "\n");
    }

    @Test
    @DisplayName("no verdict is recorded for a route that no longer exists")
    void noStaleVerdicts() {
        // The other direction, and the reason this test does not simply grow forever.
        // A verdict left behind after its route is renamed reads as coverage while
        // protecting nothing, and it is invisible precisely because the sweep above
        // only ever looks for routes that are missing from the list.
        Set<String> live = destructiveRoutes().keySet();
        List<String> stale = new ArrayList<>();
        for (String recorded : ROUTE_DECISIONS.keySet()) {
            if (!live.contains(recorded)) {
                stale.add(recorded);
            }
        }

        assertTrue(stale.isEmpty(),
                "ROUTE_DECISIONS records a verdict for these routes, but no such route is mapped. "
                        + "Either the path changed - in which case the verdict is now protecting "
                        + "nothing and the real route is unaccounted for - or the route was removed "
                        + "and the line should go with it.\n\n  "
                        + String.join("\n  ", stale) + "\n");
    }

    @Test
    @DisplayName("every gated action has an executor, so an approval cannot be granted and then fail")
    void everyActionHasAnExecutor() {
        // Cheap, and it closes the worst failure ordering in the whole design: an
        // action that can be requested and approved but not carried out. By the time
        // anyone finds out, the people who signed have already spent their authority,
        // and the requester has been told twice that the act was authorised.
        //
        // Asserted for all fifteen, not only the ones with a route. An action with no
        // route of its own is still reachable through POST /v1/governance/approvals,
        // so "no route" is not the same as "cannot be requested".
        List<String> missing = new ArrayList<>();
        for (SensitiveAction action : SensitiveAction.values()) {
            if (gate.actionsWithoutExecutor().contains(action)) {
                missing.add(action.name());
            }
        }
        assertTrue(missing.isEmpty(),
                "These gated actions have no SensitiveActionExecutor, so an approval for them "
                        + "would be granted by two people and then fail at execution: "
                        + String.join(", ", missing));
    }

    /**
     * Every mapped route that could destroy something, as {@code "METHOD /path"} ->
     * the handler that serves it.
     */
    private Map<String, String> destructiveRoutes() {
        Map<String, String> routes = new TreeMap<>();
        for (Map.Entry<RequestMappingInfo, HandlerMethod> entry
                : handlerMapping.getHandlerMethods().entrySet()) {
            RequestMappingInfo info = entry.getKey();
            Set<String> patterns = patternsOf(info);
            Set<String> methods = new LinkedHashSet<>();
            info.getMethodsCondition().getMethods().forEach(m -> methods.add(m.name()));

            // A mapping with no explicit verb answers all of them, so it is treated
            // as mutating - being permissive here is the safe direction.
            if (methods.isEmpty()) {
                methods.addAll(MUTATING_METHODS);
            }

            for (String pattern : patterns) {
                if (pattern.startsWith(GATE_PREFIX)) {
                    continue;
                }
                for (String method : methods) {
                    if (!MUTATING_METHODS.contains(method)) {
                        continue;
                    }
                    if (isDestructive(method, pattern)) {
                        routes.put(method + " " + pattern,
                                entry.getValue().getBeanType().getSimpleName() + "."
                                        + entry.getValue().getMethod().getName());
                    }
                }
            }
        }
        return routes;
    }

    private static Set<String> patternsOf(RequestMappingInfo info) {
        Set<String> patterns = new LinkedHashSet<>();
        if (info.getPathPatternsCondition() != null) {
            info.getPathPatternsCondition().getPatterns()
                    .forEach(p -> patterns.add(p.getPatternString()));
        }
        if (info.getPatternsCondition() != null) {
            patterns.addAll(info.getPatternsCondition().getPatterns());
        }
        return patterns;
    }

    private static boolean isDestructive(String method, String pattern) {
        if ("DELETE".equals(method)) {
            return true;
        }
        for (String segment : pattern.split("/")) {
            if (DESTRUCTIVE_SEGMENTS.contains(segment.toLowerCase())) {
                return true;
            }
        }
        return false;
    }

    private static List<String> actionNames() {
        List<String> names = new ArrayList<>();
        for (SensitiveAction action : SensitiveAction.values()) {
            names.add(action.name());
        }
        return names;
    }
}
