package com.photonicomega.facilities.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end verification of the per-module AI instructions feature:
 * loading from resource files, versioned updates with audit history, toggle,
 * restore, RBAC (admin-only edits, authenticated chat), context-aware chat
 * composition (global + module + role + real backend data), module detection
 * from routes, cross-module related modules, and the no-fabrication fallback.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ModuleInstructionTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ModuleInstructionService moduleInstructionService;

    @Autowired
    private ObjectMapper objectMapper;

    private String adminToken;
    private String employeeToken;

    /**
     * A seeded approver who is not the requester. Named as a constant because the
     * rollback loop below only proves anything if the account signing it is somebody
     * other than the account that asked - which is the one property of a two-person
     * rule that cannot be asserted by looking at either half on its own.
     */
    private static final String SEEDED_SECURITY_OFFICER = "security@photonicomega.com";

    @BeforeEach
    void seedUsersAndMintTokens() {
        moduleInstructionService.reset();
        if (userRepository.findByEmailAndDeletedFalse("mi.admin@test.local").isEmpty()) {
            Role superRole = ensureRole("SUPER_ADMIN");
            Role employeeRole = ensureRole("EMPLOYEE");
            userRepository.save(user("mi.admin@test.local", "IT", superRole));
            userRepository.save(user("mi.employee@test.local", "General", employeeRole));
        }
        adminToken = token("mi.admin@test.local");
        employeeToken = token("mi.employee@test.local");
    }

    // ------------------------------------------------------------------
    // 1. Module loading from resource files
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Module instructions load from resource files and are returned by the API")
    void moduleInstructionsLoadFromResources() throws Exception {
        mockMvc.perform(get("/v1/ai/instructions").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(6))
                .andExpect(jsonPath("$.data[?(@.moduleKey=='reservations')].content")
                        .isNotEmpty());
    }

    @Test
    @DisplayName("Global prompt is separate from module instructions and always present")
    void globalPromptSeparateFromModuleInstructions() throws Exception {
        String prompt = mockMvc.perform(get("/v1/ai/prompt").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.prompt").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        assertTrue(prompt.contains("Photonic Omega AI"));
        // The global prompt must NOT contain module-specific business logic.
        assertFalse(prompt.contains("ACTIVE MODULE"));
    }

    @Test
    @DisplayName("Unknown module instruction returns 404 with MODULE_NOT_FOUND")
    void unknownModuleInstructionReturns404() throws Exception {
        mockMvc.perform(get("/v1/ai/instructions/does_not_exist").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("MODULE_NOT_FOUND"));
    }

    // ------------------------------------------------------------------
    // 2. RBAC security
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Non-admin cannot update module instructions (403); admin can")
    void onlyAdminCanUpdateInstructions() throws Exception {
        String body = """
                {"content": "Updated content", "changeSummary": "test"}""";
        mockMvc.perform(put("/v1/ai/instructions/reservations")
                        .contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + employeeToken))
                .andExpect(status().isForbidden());

        mockMvc.perform(put("/v1/ai/instructions/reservations")
                        .contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value("1.0.1"));
    }

    @Test
    @DisplayName("Authenticated users (all roles) can use the context-aware chat")
    void anyAuthenticatedUserCanChat() throws Exception {
        String body = """
                {"message": "How many reservations are there?", "module": "reservations"}""";
        mockMvc.perform(post("/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reply").isNotEmpty());
        mockMvc.perform(post("/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reply").isNotEmpty());
        // Unauthenticated chat is rejected.
        mockMvc.perform(post("/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------
    // 3. Versioning with audit history
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Updating instructions records the previous version with author, timestamp and change summary")
    void updateRecordsAuditHistory() throws Exception {
        String update = """
                {"content": "New Facilities v2 instructions", "changeSummary": "Clarified maintenance scope"}""";
        String resp = mockMvc.perform(put("/v1/ai/instructions/reservations")
                        .contentType(MediaType.APPLICATION_JSON).content(update)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value("1.0.1"))
                .andExpect(jsonPath("$.data.updatedBy").value("mi.admin@test.local"))
                .andExpect(jsonPath("$.data.updatedAt").isNotEmpty())
                .andExpect(jsonPath("$.data.versions[0].version").value("1.0.0"))
                .andExpect(jsonPath("$.data.versions[0].changeSummary").value("Clarified maintenance scope"))
                .andReturn().getResponse().getContentAsString();

        assertTrue(resp.contains("1.0.0"));
        assertTrue(resp.contains("mi.admin@test.local"));
    }

    @Test
    @DisplayName("The new version is used when composing context after an update")
    void newVersionUsedInComposition() throws Exception {
        String update = """
                {"content": "RESERVATION SPECIAL RULE: capacity checks first", "changeSummary": "test"}""";
        mockMvc.perform(put("/v1/ai/instructions/reservations")
                        .contentType(MediaType.APPLICATION_JSON).content(update)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());

        String chat = """
                {"message": "hello", "module": "reservations"}""";
        mockMvc.perform(post("/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON).content(chat)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.moduleApplied").value(true))
                .andExpect(jsonPath("$.data.module").value("reservations"));
        assertEquals("RESERVATION SPECIAL RULE: capacity checks first",
                moduleInstructionService.getActiveContent("reservations").orElse(""));
    }

    @Test
    @DisplayName("Toggle disables the module so it is not applied in composition")
    void toggleDisablesModuleInstructions() throws Exception {
        mockMvc.perform(put("/v1/ai/instructions/reservations/toggle")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false));

        assertTrue(moduleInstructionService.getActiveContent("reservations").isEmpty());

        String chat = """
                {"message": "hello", "module": "reservations"}""";
        mockMvc.perform(post("/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON).content(chat)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.moduleApplied").value(false));
    }

    /**
     * The rollback route used to restore an earlier version on the spot. It is now
     * gated, and these three tests replace the single test that asserted the old
     * behaviour.
     *
     * <p>Worth being explicit about why the old test had to go rather than be adjusted:
     * it asserted that one administrator, acting alone, could change what the assistant
     * tells every user in the company, with no second signature and no written reason.
     * It passed for as long as that was true. A test that goes red when a control is
     * added is doing its job - it is the specification of the behaviour that was
     * deliberately removed, and leaving it green would have meant leaving the bypass.
     */
    @Test
    @DisplayName("Requesting a rollback restores nothing on its own")
    void rollbackRequestRestoresNothingByItself() throws Exception {
        String update = """
                {"content": "REPLACED CONTENT", "changeSummary": "test"}""";
        mockMvc.perform(put("/v1/ai/instructions/reservations")
                        .contentType(MediaType.APPLICATION_JSON).content(update)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value("1.0.1"));

        mockMvc.perform(post("/v1/ai/instructions/reservations/restore/1.0.0")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"the replacement text drops the conflict-detection rule\"}")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pendingApproval").value(true))
                .andExpect(jsonPath("$.data.action").value("AI_INSTRUCTION_ROLLBACK"))
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                // The approver has to be told what they are deciding about without
                // opening the editor, so the label names both versions and the module.
                .andExpect(jsonPath("$.data.targetLabel").value(
                        org.hamcrest.Matchers.containsString("v1.0.1 back to v1.0.0")));

        // The assertion that matters. A request is not a rollback: until somebody else
        // signs it, the module is still running the text the requester wanted gone.
        String live = moduleInstructionService.getActiveContent("reservations").orElse("");
        assertTrue(live.contains("REPLACED CONTENT"),
                "the rollback was requested, not approved, so the replacement content must "
                        + "still be live - if it is not, the route is still performing the act "
                        + "itself and the approval is decoration");
        assertEquals("1.0.1", moduleInstructionService.get("reservations").orElseThrow().getVersion(),
                "requesting a rollback must not bump the version");
    }

    @Test
    @DisplayName("A rollback request with no written reason is refused")
    void rollbackWithoutAWrittenReasonIsRefused() throws Exception {
        // The reason is not paperwork. It is the only thing the approver reads before
        // deciding, and the only record of why the change was wanted once everyone
        // involved has moved on. A gate that accepts a blank one collects signatures
        // against no stated purpose.
        mockMvc.perform(post("/v1/ai/instructions/reservations/restore/1.0.0")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isUnprocessableEntity());

        mockMvc.perform(post("/v1/ai/instructions/reservations/restore/1.0.0")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"   \"}")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("A rollback is carried out only after a second person approves it")
    void rollbackHappensOnlyAfterSomebodyElseApprovesAndExecutes() throws Exception {
        String update = """
                {"content": "REPLACED CONTENT", "changeSummary": "test"}""";
        mockMvc.perform(put("/v1/ai/instructions/reservations")
                        .contentType(MediaType.APPLICATION_JSON).content(update)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());

        String raised = mockMvc.perform(post("/v1/ai/instructions/reservations/restore/1.0.0")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"restoring the conflict-detection rule\"}")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String approvalId = objectMapper.readTree(raised).path("data").path("approvalRequestId").asText();
        assertFalse(approvalId.isBlank(), "the route must return the id of the request it raised, "
                + "or the approver has nothing to open");

        // The requester cannot sign their own request, so a second person has to. The
        // seeded security officer is an eligible approver for this action; the
        // administrator who asked for it is not, and asserting that first is the point.
        mockMvc.perform(post("/v1/governance/approvals/" + approvalId + "/approve")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isUnprocessableEntity());

        String approverToken = token(SEEDED_SECURITY_OFFICER);
        mockMvc.perform(post("/v1/governance/approvals/" + approvalId + "/approve")
                        .header("Authorization", "Bearer " + approverToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("APPROVED"));

        // Still nothing restored: approving authorises the act, executing performs it.
        assertTrue(moduleInstructionService.getActiveContent("reservations").orElse("")
                        .contains("REPLACED CONTENT"),
                "approval alone must not change the instructions");

        mockMvc.perform(post("/v1/governance/approvals/" + approvalId + "/execute")
                        .header("Authorization", "Bearer " + approverToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("EXECUTED"));

        // Now, and only now, the old text is back - as a new version, so the history
        // still shows that the replacement happened and was undone.
        String restored = moduleInstructionService.getActiveContent("reservations").orElse("");
        assertTrue(restored.contains("Facility Reservation"),
                "after execution the earlier content must be live again");
        assertFalse(restored.contains("REPLACED CONTENT"),
                "after execution the replacement content must be gone");
        ModuleInstructionService.ModuleInstructionDto after =
                moduleInstructionService.get("reservations").orElseThrow();
        assertEquals("1.0.2", after.getVersion(),
                "the rollback must land as a new version rather than rewriting history");
        assertEquals("1.0.1", after.getVersions().get(0).getVersion(),
                "the version that was rolled back from must remain in the audit history");
    }

    // ------------------------------------------------------------------
    // 4. Context-aware chat composition
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Chat composes global + module + role/permissions + real backend data context")
    void chatComposesContextLayers() throws Exception {
        String chat = """
                {"message": "list the live data context", "module": "reservations"}""";
        String resp = mockMvc.perform(post("/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON).content(chat)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.composedContext").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        assertTrue(resp.contains("ACTIVE MODULE"));
        assertTrue(resp.contains("CALLER ROLE / PERMISSIONS"));
        assertTrue(resp.contains("ROLE_SUPER_ADMIN"));
        assertTrue(resp.contains("LIVE SYSTEM DATA"));
        assertTrue(resp.contains("facilities="));
        assertTrue(resp.contains("rooms="));
    }

    @Test
    @DisplayName("Invalid module falls back to global-only context instead of erroring")
    void invalidModuleFallsBackToGlobal() throws Exception {
        String chat = """
                {"message": "hello", "module": "not_a_real_module"}""";
        mockMvc.perform(post("/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON).content(chat)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.module").value("global"))
                .andExpect(jsonPath("$.data.moduleApplied").value(false));
    }

    @Test
    @DisplayName("Related modules are included in composition for cross-module requests")
    void relatedModulesIncludedInComposition() throws Exception {
        String chat = """
                {"message": "hello", "module": "legal_management", "relatedModules": ["contract_management"]}""";
        String resp = mockMvc.perform(post("/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON).content(chat)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertTrue(resp.contains("RELATED MODULE INSTRUCTIONS"));
        assertTrue(resp.contains("contract_management"));
    }

    @Test
    @DisplayName("Module detection maps routes to the correct module key")
    void moduleDetectionFromRoutes() throws Exception {
        expectDetected("/facilities/reservations", "reservations");
        expectDetected("/compliance/retention-policies", "records_management");
        expectDetected("/legal/cases", "legal_management");
        expectDetected("/procurement/contracts", "contract_management");
        // /admin/* has no module instructions -> global fallback
        expectDetected("/admin/ai-services", "global");
        expectDetected("/unknown", "global");
    }

    @Test
    @DisplayName("No LLM provider configured => graceful fallback, no fabricated answer")
    void fallbackDoesNotFabricate() throws Exception {
        String chat = """
                {"message": "What is the current case status?", "module": "legal_management"}""";
        String resp = mockMvc.perform(post("/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON).content(chat)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.liveLlm").value(false))
                .andExpect(jsonPath("$.data.reply").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        assertTrue(resp.contains("not currently available"));
        // The fallback must not invent a case status value.
        assertFalse(resp.contains("\"COMPLETED\""));
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private void expectDetected(String route, String expectedModule) throws Exception {
        mockMvc.perform(get("/v1/ai/modules/detect")
                        .param("route", route)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.module").value(expectedModule));
    }

    private String token(String email) {
        String roleName = userRepository.findByEmailWithRolesAndPermissions(email)
                .orElseThrow().getRoles().iterator().next().getName();
        UserDetails userDetails = new org.springframework.security.core.userdetails.User(
                email, "unused", true, true, true, true,
                List.of(new SimpleGrantedAuthority("ROLE_" + roleName)));
        return jwtTokenProvider.generateAccessToken(userDetails);
    }

    private Role ensureRole(String name) {
        return roleRepository.findByName(name).orElseGet(() -> roleRepository.save(Role.builder()
                .name(name)
                .displayName(name.replace('_', ' ').toLowerCase())
                .description("module instruction test role")
                .build()));
    }

    private User user(String email, String dept, Role role) {
        return User.builder()
                .firstName("Module")
                .lastName("Instruction")
                .email(email)
                .department(dept)
                .passwordHash("$2a$10$invalid-hash")
                .status(UserStatus.ACTIVE)
                .roles(Set.of(role))
                .build();
    }
}