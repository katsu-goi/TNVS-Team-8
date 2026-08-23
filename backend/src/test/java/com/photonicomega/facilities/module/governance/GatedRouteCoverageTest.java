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
import java.util.function.BiPredicate;

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
     * Path prefixes where every mutating route needs a verdict, whatever it is called.
     *
     * <p>{@link #DESTRUCTIVE_SEGMENTS} finds routes that announce themselves. It cannot
     * find the ones that do not, and there is a whole class of those: a route whose path
     * is a bare noun and whose verb is {@code PUT}. {@code PUT /v1/ai/prompt} overwrites
     * the instruction every module's assistant is composed from, for every user in the
     * company, and the sweep above walks straight past it - no {@code DELETE}, no word
     * from the vocabulary, nothing to match on. {@code PUT /v1/ai/instructions/{moduleKey}}
     * is the same shape.
     *
     * <p>That gap was not hypothetical. {@code POST /v1/ai/instructions/{moduleKey}/restore/{version}}
     * was gated because {@code restore} is in the vocabulary, while the {@code PUT} one
     * segment above it - which can set the instruction text to anything at all, including
     * whatever the old version said - was not. Gating the rollback and not the overwrite
     * governs the tidy way of doing it and leaves the general way open, which is worse
     * than gating neither: it reads as coverage.
     *
     * <p>So on these prefixes the test inverts its default. Instead of asking "does this
     * path look dangerous", it asks for a written verdict on every route that can change
     * anything, and lets the exemptions carry the argument. That is noisier - an AI
     * inference call has to be exempted in a line of prose - and it is the only version
     * that cannot be walked past by choosing a mild name.
     */
    private static final Set<String> POLICY_SURFACES = Set.of("/v1/ai");

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

        // The three routes that write instruction text. All three land on the same
        // action because they are the same act reached three ways: set one module's
        // instructions, set the global prompt every module inherits, or switch a
        // module's instruction set off so it falls back to that global prompt. Any of
        // them changes the words the assistant answers with tomorrow.
        //
        // These were the gap. The restore route above was gated because "restore" is
        // in the destructive vocabulary; the PUT one segment above it, which can set
        // the text to anything including whatever the old version said, was not. The
        // policy-surface sweep exists because of this pair.
        ROUTE_DECISIONS.put("PUT /v1/ai/prompt", SensitiveAction.AI_INSTRUCTION_UPDATE);
        ROUTE_DECISIONS.put("PUT /v1/ai/instructions/{moduleKey}", SensitiveAction.AI_INSTRUCTION_UPDATE);
        ROUTE_DECISIONS.put("PUT /v1/ai/instructions/{moduleKey}/toggle",
                SensitiveAction.AI_INSTRUCTION_UPDATE);

        // Promoting a provider to default. The same asymmetry as above, one level up:
        // deleting a provider was gated and pointing every module at a different one
        // was not, so the ungoverned route was the one that actually moves the
        // company's documents and contracts to a new endpoint and a new key. It also
        // has no @AuthenticationPrincipal today, so there is currently no record of
        // who did it - which the gate fixes as a side effect of requiring a requester.
        ROUTE_DECISIONS.put("PUT /v1/ai/providers/{id}/default", SensitiveAction.AI_PROVIDER_SET_DEFAULT);

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

        // ------------------------------------------------------------------
        // Exempt on a policy surface. Swept in by prefix rather than by looking
        // dangerous, so most of these are ordinary routes - but each still owes a
        // sentence, because the reason a route changes no policy is exactly the
        // thing that stops being true when someone edits it.
        // ------------------------------------------------------------------

        // Switching a module's AI on or off. This looks like the instruction toggle
        // gated above and is the opposite case, on the one distinction that matters
        // here: this route decides whether the assistant speaks at all, not what it
        // says. Off is the fail-safe direction - no advice cannot be wrong advice -
        // and it has to stay cheap for the same reason SESSION_REVOKE is deliberately
        // cheap to approve: during an incident, the person who needs to silence a
        // misbehaving assistant should not first need to find a second signature. On
        // is safe for the mirror reason: the assistant can only come back saying what
        // the gated instruction text tells it to say.
        ROUTE_DECISIONS.put("PUT /v1/ai/modules/{id}/toggle", null);

        // Per-module tuning - model, temperature, token ceiling. It changes how the
        // assistant answers rather than what it is told, it is scoped to one module,
        // and unlike the routes above it already carries an @AuthenticationPrincipal
        // and writes the change to the audit history with the administrator's name and
        // IP. The company-wide equivalent of this dial is the default provider, which
        // is gated.
        ROUTE_DECISIONS.put("PUT /v1/ai/modules/{id}/config", null);

        // Registering a provider. Additive: a new entry that nothing routes to until it
        // is made the default or a module is bound to it, and both of those are
        // controlled elsewhere - promote and delete are the real control points and are
        // both gated. Gating registration as well would mean two signatures to create
        // the thing you then need two more signatures to use.
        //
        // This verdict was not true when it was first written, and the sequence is worth
        // keeping. addProvider honours a caller-supplied default flag: it clears the flag
        // from every existing provider and hands it to the new one. So registration was
        // the cheapest way to become the default - no approval, no recorded requester -
        // and anyone able to add a provider could point every unbound module at their own
        // endpoint and API key in one call. The gate on promotion was worth what that
        // call cost, which was nothing. AiController now refuses a registration that asks
        // to arrive as the default while another provider holds it, and
        // AiPolicyGateTest.registeringAProviderCannotPromoteItPastTheGate holds that
        // line. If that refusal is ever removed, this null becomes a lie again.
        ROUTE_DECISIONS.put("POST /v1/ai/providers", null);

        // Inference and read-through. These seven send a prompt to the configured
        // provider and return the answer: connectivity check, model list, document
        // classification, contract analysis, a live completion, the module data an
        // assistant is given as context, and the chat turn itself. None of them
        // persists policy - what the assistant is, which provider serves it, and what
        // it is instructed to say are all decided by the routes above. They consume
        // AI; they do not change it. They are POSTs because they carry a body, not
        // because they write anything.
        //
        // They are also the system's day-to-day work. An approval in front of a chat
        // turn is not a control, it is a reason to stop using the assistant.
        ROUTE_DECISIONS.put("POST /v1/ai/test-connection", null);
        ROUTE_DECISIONS.put("POST /v1/ai/models", null);
        ROUTE_DECISIONS.put("POST /v1/ai/classify", null);
        ROUTE_DECISIONS.put("POST /v1/ai/analyze-contract", null);
        ROUTE_DECISIONS.put("POST /v1/ai/execute", null);
        ROUTE_DECISIONS.put("POST /v1/ai/context", null);
        ROUTE_DECISIONS.put("POST /v1/ai/chat", null);
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
    @DisplayName("every mutating route on a policy surface has a recorded verdict, however mildly it is named")
    void everyPolicySurfaceMutationIsAccountedFor() {
        Map<String, String> found = policySurfaceRoutes();

        // If this ever finds nothing, the prefix stopped matching anything - which
        // would make the test pass by sweeping an empty set. That is the one failure
        // mode a coverage test must not have.
        assertTrue(!found.isEmpty(),
                "The policy-surface sweep matched no routes at all. POLICY_SURFACES is "
                        + POLICY_SURFACES + " and nothing under it is mapped, so this test is "
                        + "currently guarding nothing. Either the prefix is wrong or the routes moved.");

        List<String> unaccounted = new ArrayList<>();
        for (Map.Entry<String, String> route : found.entrySet()) {
            if (!ROUTE_DECISIONS.containsKey(route.getKey())) {
                unaccounted.add(route.getKey() + "   -> " + route.getValue());
            }
        }

        assertTrue(unaccounted.isEmpty(),
                "These routes can change AI policy - what the assistant tells every user in the "
                        + "company - and no verdict has been recorded for them. Changing an "
                        + "instruction takes effect immediately, with no build, no diff and no "
                        + "release for anyone to review, which is why the bar here is a written "
                        + "decision per route rather than a dangerous-looking path. Add each to "
                        + "ROUTE_DECISIONS with the SensitiveAction that governs it, or with null "
                        + "and a written reason it changes no policy.\n\n  "
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
        //
        // Checked against the union of both sweeps, not just the destructive one. Most
        // of the policy-surface verdicts are on routes no vocabulary would ever match -
        // that is the whole point of that sweep - so measuring them against the
        // destructive sweep alone would report every one of them as stale.
        Set<String> live = governedRoutes();
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
        return sweep(GatedRouteCoverageTest::isDestructive);
    }

    /**
     * Every mutating route on a policy surface, whether or not it looks dangerous.
     */
    private Map<String, String> policySurfaceRoutes() {
        return sweep((method, pattern) -> onPolicySurface(pattern));
    }

    /** Both sweeps together - the full set of routes this test has an opinion about. */
    private Set<String> governedRoutes() {
        Set<String> all = new LinkedHashSet<>(destructiveRoutes().keySet());
        all.addAll(policySurfaceRoutes().keySet());
        return all;
    }

    /**
     * Walks the application's mappings and keeps the mutating ones the predicate accepts.
     */
    private Map<String, String> sweep(BiPredicate<String, String> include) {
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
                    if (include.test(method, pattern)) {
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

    /**
     * True if the pattern sits under a policy surface.
     *
     * <p>Compared segment-wise rather than with {@code startsWith}, so a future
     * {@code /v1/airports} does not get swept in as though it were {@code /v1/ai}.
     */
    private static boolean onPolicySurface(String pattern) {
        for (String prefix : POLICY_SURFACES) {
            if (pattern.equals(prefix) || pattern.startsWith(prefix + "/")) {
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
