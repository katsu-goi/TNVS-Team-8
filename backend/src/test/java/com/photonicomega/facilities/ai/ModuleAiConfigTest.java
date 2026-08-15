package com.photonicomega.facilities.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.ai.domain.AiModuleConfig;
import com.photonicomega.facilities.ai.repository.AiModuleConfigRepository;
import com.photonicomega.facilities.module.auth.domain.AuditLog;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.AuditLogRepository;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
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
 * End-to-end verification of the per-module AI model selection feature:
 * assigning a provider/model per module, effective execution routing, DB
 * persistence + reload, fallback handling for unavailable providers/models,
 * audit records, RBAC, and coexistence with per-module AI instructions.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ModuleAiConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ModuleAiConfigService moduleAiConfigService;

    @Autowired
    private AiStateManagementService aiStateService;

    @Autowired
    private AiModuleConfigRepository configRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private ObjectMapper objectMapper;

    private String adminToken;
    private String employeeToken;

    private String providerAId;
    private String providerAName;

    @BeforeEach
    void seedUsersAndMintTokens() {
        aiStateService.reset();
        moduleAiConfigService.reset();
        if (userRepository.findByEmailAndDeletedFalse("mac.admin@test.local").isEmpty()) {
            Role superRole = ensureRole("SUPER_ADMIN");
            Role employeeRole = ensureRole("EMPLOYEE");
            userRepository.save(user("mac.admin@test.local", "IT", superRole));
            userRepository.save(user("mac.employee@test.local", "General", employeeRole));
        }
        adminToken = token("mac.admin@test.local");
        employeeToken = token("mac.employee@test.local");
    }

    /**
     * Adds a usable (real-key) default provider so effective routing resolves.
     */
    private void addUsableDefaultProvider(String model) {
        AiStateManagementService.ProviderDto p = aiStateService.addProvider(
                AiStateManagementService.ProviderDto.builder()
                        .name("Test OpenAI Gateway")
                        .model(model)
                        .status("CONNECTED")
                        .isDefault(true)
                        .type("openai")
                        .baseUrl("http://localhost:1/v1")
                        .endpoint("/chat/completions")
                        .apiKey("sk-test-real-key")
                        .capabilities(List.of("documentClassification", "ocrExtraction", "contractAnalysis",
                                "legalReview", "visitorVerification", "recordsCompliance", "aiSummarization", "smartSearch"))
                        .build());
        providerAId = p.getId();
        providerAName = p.getName();
    }

    private void addUnusableProvider(String id) {
        aiStateService.addProvider(
                AiStateManagementService.ProviderDto.builder()
                        .id(id)
                        .name("Unusable Gateway")
                        .model("not-configured")
                        .status("CONNECTED")
                        .isDefault(false)
                        .type("openai")
                        .baseUrl("http://localhost:1/v1")
                        .apiKey("sk-proj-default")
                        .capabilities(List.of())
                        .build());
    }

    private void addProvider(String id, String name, String model, boolean isDefault) {
        aiStateService.addProvider(
                AiStateManagementService.ProviderDto.builder()
                        .id(id)
                        .name(name)
                        .model(model)
                        .status("CONNECTED")
                        .isDefault(isDefault)
                        .type("openai")
                        .baseUrl("http://localhost:1/v1")
                        .apiKey("sk-test-real-key")
                        .capabilities(List.of("documentClassification", "ocrExtraction", "contractAnalysis",
                                "legalReview", "visitorVerification", "recordsCompliance", "aiSummarization", "smartSearch"))
                        .build());
    }

    // ------------------------------------------------------------------
    // 1-3. Assignment routing
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Execution uses the model assigned to the module and the API returns it")
    void executionUsesAssignedModel() throws Exception {
        addUsableDefaultProvider("gpt-4o");
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"gpt-4o-custom\",\"executionMode\":\"REALTIME\"}");

        ModuleAiConfigService.ExecutionTarget target = moduleAiConfigService.resolveExecution("mod-1");
        assertNotNull(target);
        assertFalse(target.isDisabled());
        assertEquals("gpt-4o-custom", target.getModel());
        assertEquals(providerAName, target.getProviderName());
        assertFalse(target.isFallbackUsed());

        // Enriched module list exposes provider + model to the UI.
        mockMvc.perform(get("/v1/ai/modules").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.id=='mod-1')].model").value("gpt-4o-custom"))
                .andExpect(jsonPath("$.data[?(@.id=='mod-1')].providerName").value(providerAName));
    }

    @Test
    @DisplayName("Re-assigning a different model changes the effective execution model")
    void reassignmentChangesEffectiveModel() throws Exception {
        addUsableDefaultProvider("gpt-4o");
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"gpt-4o-custom\",\"executionMode\":\"REALTIME\"}");
        assertEquals("gpt-4o-custom", moduleAiConfigService.resolveExecution("mod-1").getModel());

        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"gpt-4o-turbo\",\"executionMode\":\"REALTIME\"}");
        assertEquals("gpt-4o-turbo", moduleAiConfigService.resolveExecution("mod-1").getModel());
    }

    @Test
    @DisplayName("Different modules can be assigned different models simultaneously")
    void differentModelsPerModule() throws Exception {
        addUsableDefaultProvider("gpt-4o");
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"model-alpha\",\"executionMode\":\"REALTIME\"}");
        updateConfig("mod-2", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"model-beta\",\"executionMode\":\"REALTIME\"}");

        assertEquals("model-alpha", moduleAiConfigService.resolveExecution("mod-1").getModel());
        assertEquals("model-beta", moduleAiConfigService.resolveExecution("mod-2").getModel());
        assertNotEquals(moduleAiConfigService.resolveExecution("mod-1").getModel(),
                moduleAiConfigService.resolveExecution("mod-2").getModel());
    }

    // ------------------------------------------------------------------
    // 4. Disabled module gating
    // ------------------------------------------------------------------

    @Test
    @DisplayName("A disabled module is not used for execution")
    void disabledModuleNotExecuted() throws Exception {
        addUsableDefaultProvider("gpt-4o");
        updateConfig("mod-1", "{\"enabled\":false,\"providerId\":\"" + providerAId
                + "\",\"model\":\"gpt-4o-custom\",\"executionMode\":\"REALTIME\"}");

        ModuleAiConfigService.ExecutionTarget target = moduleAiConfigService.resolveExecution("mod-1");
        assertNotNull(target);
        assertTrue(target.isDisabled());

        // Re-enabling the module through the config resumes execution.
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"gpt-4o-custom\",\"executionMode\":\"REALTIME\"}");
        assertFalse(moduleAiConfigService.resolveExecution("mod-1").isDisabled());
    }

    // ------------------------------------------------------------------
    // 5. Unavailable provider/model fallback
    // ------------------------------------------------------------------

    @Test
    @DisplayName("No usable provider => graceful null target (heuristic fallback), never an error")
    void noUsableProviderFallsBackGracefully() throws Exception {
        // Only the seeded default (placeholder key) provider exists.
        updateConfig("mod-3", "{\"enabled\":true,\"providerId\":\"\",\"model\":\"some-model\",\"executionMode\":\"REALTIME\"}");
        assertNull(moduleAiConfigService.resolveExecution("mod-3"));
    }

    @Test
    @DisplayName("Unavailable assigned provider falls back to the explicitly configured fallback model")
    void unavailableProviderUsesFallbackModel() throws Exception {
        addUsableDefaultProvider("gpt-4o");
        addUnusableProvider("p-unusable");
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"p-unusable\",\"model\":\"b-model\","
                + "\"fallbackModel\":\"falcon-7b\",\"executionMode\":\"REALTIME\"}");

        ModuleAiConfigService.ExecutionTarget target = moduleAiConfigService.resolveExecution("mod-1");
        assertNotNull(target);
        assertEquals("falcon-7b", target.getModel());
        assertTrue(target.isFallbackUsed());
        assertEquals("b-model", target.getFallbackFrom());
    }

    // ------------------------------------------------------------------
    // 6-7. Persistence + reload
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Assignment is persisted to the ai_module_config table")
    void configPersistedToDatabase() throws Exception {
        addUsableDefaultProvider("gpt-4o");
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"gpt-4o-custom\",\"fallbackModel\":\"gpt-4o-mini\","
                + "\"executionMode\":\"FAILOVER\",\"enabledFeatures\":[\"Automatic PDF & Image Text Extraction\"]}");

        AiModuleConfig stored = configRepository.findByModuleKeyAndDeletedFalse("mod-1").orElseThrow();
        assertEquals("gpt-4o-custom", stored.getModel());
        assertEquals("gpt-4o-mini", stored.getFallbackModel());
        assertEquals(providerAId, stored.getProviderId());
        assertEquals("FAILOVER", stored.getExecutionMode());
        assertTrue(stored.isEnabled());
    }

    @Test
    @DisplayName("Configuration survives a cache reload from the database")
    void configLoadedAfterRefresh() throws Exception {
        addUsableDefaultProvider("gpt-4o");
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"persistent-model\",\"executionMode\":\"REALTIME\"}");

        moduleAiConfigService.reset(); // simulates a service restart reload

        ModuleAiConfigService.ExecutionTarget target = moduleAiConfigService.resolveExecution("mod-1");
        assertNotNull(target);
        assertEquals("persistent-model", target.getModel());
    }

    // ------------------------------------------------------------------
    // 8. Audit
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Saving module config writes an audit record with old/new provider+model values")
    void configUpdateAudited() throws Exception {
        addUsableDefaultProvider("gpt-4o");
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"gpt-4o-custom\",\"executionMode\":\"REALTIME\"}");
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"gpt-4o-turbo\",\"executionMode\":\"REALTIME\"}");

        List<AuditLog> audit = auditLogRepository.findByEntityTypeAndEntityId(
                "AiModuleConfig", "mod-1", PageRequest.of(0, 10)).getContent();
        assertFalse(audit.isEmpty());
        AuditLog update = audit.stream()
                .filter(a -> a.getAction().equals("UPDATE_AI_MODULE_CONFIG"))
                .findFirst().orElseThrow(() -> new AssertionError("Expected UPDATE_AI_MODULE_CONFIG audit record"));
        assertEquals("mac.admin@test.local", update.getUserEmail());
        assertTrue(update.getOldValues().contains("gpt-4o-custom"));
        assertTrue(update.getNewValues().contains("gpt-4o-turbo"));
    }

    // ------------------------------------------------------------------
    // 9. RBAC
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Only administrators can configure module AI models (employee 403)")
    void onlyAdminCanConfigureModules() throws Exception {
        String body = "{\"enabled\":true,\"providerId\":\"\",\"model\":\"gpt-4o\",\"executionMode\":\"REALTIME\"}";
        mockMvc.perform(put("/v1/ai/modules/mod-1/config")
                        .contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + employeeToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/v1/ai/modules/mod-1/config")
                        .contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.config.model").value("gpt-4o"));
    }

    // ------------------------------------------------------------------
    // 11. Validation + system-default visibility
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Saving a module with a provider that no longer exists is rejected (400)")
    void missingProviderRejectedOnSave() throws Exception {
        String body = "{\"enabled\":true,\"providerId\":\"p-deleted\",\"model\":\"gpt-4o\",\"executionMode\":\"REALTIME\"}";
        mockMvc.perform(put("/v1/ai/modules/mod-1/config")
                        .contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("PROVIDER_NOT_FOUND"));
    }

    @Test
    @DisplayName("A module with no explicit assignment reports System Default with the default provider/model")
    void systemDefaultExposedInModuleList() throws Exception {
        mockMvc.perform(get("/v1/ai/modules").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.id=='mod-1')].usesSystemDefault").value(true))
                .andExpect(jsonPath("$.data[?(@.id=='mod-1')].defaultProviderName").value("OpenAI Production Gateway"))
                .andExpect(jsonPath("$.data[?(@.id=='mod-1')].defaultModel").value("gpt-4o"));
    }

    @Test
    @DisplayName("Deleting an assigned provider flags the module instead of silently leaving it dangling")
    void deletedAssignedProviderFlagged() throws Exception {
        addProvider("p-temp", "Temp Gateway", "temp-model", false);
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"p-temp\",\"model\":\"temp-model\",\"executionMode\":\"REALTIME\"}");
        aiStateService.deleteProvider("p-temp");

        mockMvc.perform(get("/v1/ai/modules").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.id=='mod-1')].assignedProviderMissing").value(true))
                .andExpect(jsonPath("$.data[?(@.id=='mod-1')].usesSystemDefault").value(true));
    }

    @Test
    @DisplayName("Explicitly assigned modules are not treated as system default")
    void explicitAssignmentNotSystemDefault() throws Exception {
        addUsableDefaultProvider("gpt-4o");
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"gpt-4o-custom\",\"executionMode\":\"REALTIME\"}");
        mockMvc.perform(get("/v1/ai/modules").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.id=='mod-1')].usesSystemDefault").value(false));
    }

    // ------------------------------------------------------------------
    // 10. Coexistence with per-module instructions
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Assigned model routing coexists with per-module AI instructions in chat")
    void instructionsAndModelCoexist() throws Exception {
        addUsableDefaultProvider("gpt-4o");
        updateConfig("mod-1", "{\"enabled\":true,\"providerId\":\"" + providerAId
                + "\",\"model\":\"gpt-4o-custom\",\"executionMode\":\"REALTIME\"}");

        String chat = """
                {"message": "hello", "module": "document_management"}""";
        String resp = mockMvc.perform(post("/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON).content(chat)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.module").value("document_management"))
                .andExpect(jsonPath("$.data.moduleApplied").value(true))
                .andExpect(jsonPath("$.data.modelUsed").value("gpt-4o-custom"))
                .andExpect(jsonPath("$.data.provider").value(providerAName))
                .andExpect(jsonPath("$.data.liveLlm").value(false))
                .andReturn().getResponse().getContentAsString();

        assertTrue(resp.contains("ASSIGNED AI MODEL"));
        assertTrue(resp.contains("gpt-4o-custom"));
        assertTrue(resp.contains("ACTIVE MODULE"));
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private void updateConfig(String moduleId, String body) throws Exception {
        mockMvc.perform(put("/v1/ai/modules/" + moduleId + "/config")
                        .contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
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
                .description("module ai config test role")
                .build()));
    }

    private User user(String email, String dept, Role role) {
        return User.builder()
                .firstName("Module")
                .lastName("Config")
                .email(email)
                .department(dept)
                .passwordHash("$2a$10$invalid-hash")
                .status(UserStatus.ACTIVE)
                .roles(Set.of(role))
                .build();
    }
}