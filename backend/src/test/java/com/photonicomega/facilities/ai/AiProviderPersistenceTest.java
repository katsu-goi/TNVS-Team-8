package com.photonicomega.facilities.ai;

import com.photonicomega.facilities.ai.domain.AiProvider;
import com.photonicomega.facilities.ai.repository.AiProviderRepository;
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
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end verification that AI provider API keys are encrypted at rest in the
 * {@code ai_providers} table, that providers survive a cache reload, that the
 * API never leaks the key back to the client, and that registry mutations
 * (delete / default) are persisted.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AiProviderPersistenceTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private AiProviderRepository providerRepository;

    @Autowired
    private AiStateManagementService aiStateService;

    @Autowired
    private ApiKeyEncryptionService encryptionService;

    private String adminToken;

    @BeforeEach
    void seedUsersAndMintTokens() {
        aiStateService.reset();
        if (userRepository.findByEmailAndDeletedFalse("persist.admin@test.local").isEmpty()) {
            Role superRole = roleRepository.findByName("SUPER_ADMIN").orElseGet(() -> roleRepository.save(Role.builder()
                    .name("SUPER_ADMIN")
                    .displayName("super admin")
                    .description("ai provider persistence test role")
                    .build()));
            userRepository.save(user("persist.admin@test.local", "IT", superRole));
        }
        UserDetails userDetails = new org.springframework.security.core.userdetails.User(
                "persist.admin@test.local", "unused", true, true, true, true,
                List.of(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN")));
        adminToken = jwtTokenProvider.generateAccessToken(userDetails);
    }

    @Test
    @DisplayName("API key is stored encrypted (not plaintext) in the ai_providers table")
    void apiKeyStoredEncrypted() {
        AiStateManagementService.ProviderDto p = aiStateService.addProvider(
                AiStateManagementService.ProviderDto.builder()
                        .name("Encrypted Gateway")
                        .model("gpt-4o")
                        .status("CONNECTED")
                        .isDefault(true)
                        .type("openai")
                        .baseUrl("https://api.openai.com/v1")
                        .endpoint("/chat/completions")
                        .apiKey("sk-proj-top-secret-key-value-12345")
                        .capabilities(List.of("documentClassification"))
                        .build());

        AiProvider stored = providerRepository.findById(p.getId()).orElseThrow();
        assertNotNull(stored.getEncryptedApiKey());
        assertFalse(stored.getEncryptedApiKey().contains("sk-proj-top-secret-key-value-12345"));
        assertTrue(stored.getEncryptedApiKey().contains(":")); // iv:ciphertext format
        assertEquals("sk-proj-top-secret-key-value-12345",
                encryptionService.decrypt(stored.getEncryptedApiKey()));
    }

    @Test
    @DisplayName("Provider survives a cache reload by loading from the database")
    void providerSurvivesCacheReload() {
        AiStateManagementService.ProviderDto p = aiStateService.addProvider(
                AiStateManagementService.ProviderDto.builder()
                        .name("Persistent Gateway")
                        .model("gpt-4o-mini")
                        .status("CONNECTED")
                        .isDefault(true)
                        .type("openai")
                        .baseUrl("https://api.openai.com/v1")
                        .endpoint("/chat/completions")
                        .apiKey("sk-proj-survive-reload")
                        .capabilities(List.of("documentClassification"))
                        .build());

        aiStateService.reset(); // reload from DB, simulating a service restart

        List<AiStateManagementService.ProviderDto> reloaded = aiStateService.getProviders();
        AiStateManagementService.ProviderDto found = reloaded.stream()
                .filter(x -> p.getId().equals(x.getId()))
                .findFirst().orElse(null);
        assertNotNull(found);
        assertEquals("Persistent Gateway", found.getName());
        assertEquals("sk-proj-survive-reload", found.getApiKey());
    }

    @Test
    @DisplayName("GET /v1/ai/providers never returns the API key")
    void apiDoesNotExposeApiKey() throws Exception {
        aiStateService.addProvider(
                AiStateManagementService.ProviderDto.builder()
                        .name("Hidden Key Gateway")
                        .model("gpt-4o")
                        .status("CONNECTED")
                        .isDefault(true)
                        .type("openai")
                        .baseUrl("https://api.openai.com/v1")
                        .endpoint("/chat/completions")
                        .apiKey("sk-proj-must-not-leak")
                        .capabilities(List.of("documentClassification"))
                        .build());

        String body = mockMvc.perform(get("/v1/ai/providers")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andReturn().getResponse().getContentAsString();

        assertFalse(body.contains("sk-proj-must-not-leak"));
        assertFalse(body.contains("\"apiKey\""));
    }

    @Test
    @DisplayName("Deleting a provider soft-deletes it and it is removed from the registry")
    void deleteProviderPersisted() {
        AiStateManagementService.ProviderDto p = aiStateService.addProvider(
                AiStateManagementService.ProviderDto.builder()
                        .name("Disposable Gateway")
                        .model("gpt-4o")
                        .status("CONNECTED")
                        .isDefault(false)
                        .type("openai")
                        .baseUrl("https://api.openai.com/v1")
                        .endpoint("/chat/completions")
                        .apiKey("sk-proj-delete-me")
                        .capabilities(List.of("documentClassification"))
                        .build());

        assertTrue(aiStateService.deleteProvider(p.getId()));

        AiProvider stored = providerRepository.findById(p.getId()).orElseThrow();
        assertTrue(stored.isDeleted());
        assertTrue(aiStateService.getProviders().stream().noneMatch(x -> p.getId().equals(x.getId())));
    }

    @Test
    @DisplayName("Default provider flag is persisted and restored on reload")
    void defaultFlagPersisted() {
        aiStateService.addProvider(
                AiStateManagementService.ProviderDto.builder()
                        .name("Default Gateway")
                        .model("gpt-4o")
                        .status("CONNECTED")
                        .isDefault(true)
                        .type("openai")
                        .baseUrl("https://api.openai.com/v1")
                        .endpoint("/chat/completions")
                        .apiKey("sk-proj-default-one")
                        .capabilities(List.of("documentClassification"))
                        .build());
        AiStateManagementService.ProviderDto other = aiStateService.addProvider(
                AiStateManagementService.ProviderDto.builder()
                        .name("Other Gateway")
                        .model("gpt-4o-mini")
                        .status("CONNECTED")
                        .isDefault(false)
                        .type("openai")
                        .baseUrl("https://api.openai.com/v1")
                        .endpoint("/chat/completions")
                        .apiKey("sk-proj-default-two")
                        .capabilities(List.of("documentClassification"))
                        .build());

        aiStateService.setDefaultProvider(other.getId());
        aiStateService.reset();

        long defaultCount = aiStateService.getProviders().stream()
                .filter(AiStateManagementService.ProviderDto::isDefault)
                .count();
        assertEquals(1, defaultCount);
        assertEquals(other.getId(), aiStateService.getProviders().stream()
                .filter(AiStateManagementService.ProviderDto::isDefault)
                .findFirst().orElseThrow().getId());
    }

    @Test
    @DisplayName("Providers without an API key (local engines) are persisted without encryption")
    void localProviderWithoutKeyPersisted() {
        AiStateManagementService.ProviderDto p = aiStateService.addProvider(
                AiStateManagementService.ProviderDto.builder()
                        .name("Local Engine")
                        .model("llama3.3")
                        .status("CONNECTED")
                        .isDefault(false)
                        .type("local")
                        .baseUrl("http://localhost:11434")
                        .endpoint("/v1/chat/completions")
                        .apiKey(null)
                        .capabilities(List.of("documentClassification"))
                        .build());

        AiProvider stored = providerRepository.findById(p.getId()).orElseThrow();
        assertNull(stored.getEncryptedApiKey());
        assertNull(aiStateService.getProviders().stream()
                .filter(x -> p.getId().equals(x.getId()))
                .findFirst().orElseThrow().getApiKey());
    }

    private User user(String email, String dept, Role role) {
        return User.builder()
                .firstName("Provider")
                .lastName("Persist")
                .email(email)
                .department(dept)
                .passwordHash("$2a$10$invalid-hash")
                .status(UserStatus.ACTIVE)
                .roles(Set.of(role))
                .build();
    }
}
