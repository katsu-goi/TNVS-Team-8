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
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.ResourceAccessException;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Proves that "Test Connection" cannot report a connection it did not make.
 *
 * <h3>The fault this pins</h3>
 * The AI Services screen showed <em>API Status: CONNECTED</em> and a green
 * "Connected Successfully" badge for an Ollama endpoint that was not running. It was
 * not one bug but three, stacked so that each one hid the next:
 *
 * <ol>
 *   <li><b>The failure branch returned success.</b> When the provider could not be
 *       reached, {@code AiController#testConnection} built a {@code status: "ERROR"}
 *       payload and then wrapped it in {@code ApiResponse.success(...)} at HTTP 200.
 *       The envelope said the call worked while its own contents said it had not.
 *       {@code fetchModels}, three methods further down the same file, already used
 *       {@code .success(false)} for exactly this case.</li>
 *   <li><b>An empty catalogue counted as verified.</b> A host that answers on the port
 *       but is not a model API - a proxy, a login page, the wrong service - yields an
 *       empty model list rather than an exception, and the response was still
 *       {@code status: "ONLINE"} with the message "Live connection verified".</li>
 *   <li><b>The client forced success either way.</b> {@code AddAiProviderModal}
 *       set {@code testStatus} to success when the promise resolved, and its catch
 *       block set success too, on a 400ms timer. Because the failure branch answered
 *       HTTP 200, the promise always resolved: there was no input for which the badge
 *       could turn red except a locally-detected missing API key.</li>
 * </ol>
 *
 * <p>Any one of the three alone would have been caught by an administrator wondering
 * why a "connected" provider produced no classifications. Together they made the
 * screen say what the administrator wanted to hear. This is the worst place in the
 * application for that to happen: the next thing an administrator does with a
 * provider they believe is working is make it the default, and the default provider
 * is where every module sends the company's documents.
 *
 * <p>The deliberate tolerance in the original code is kept. A provider that returns a
 * real catalogue not containing the requested model is still ONLINE, with the
 * mismatch named in the message - that was a considered decision (the provider is
 * reachable, the model name may simply be new) and this test asserts it stays.
 *
 * <h3>Why ModelFetcher is mocked</h3>
 * The suite otherwise avoids mocks and wires the real thing. Here the two cases under
 * test are "the socket refused" and "the host answered but listed nothing", which are
 * properties of the outside world; reproducing them with a real endpoint would make
 * the test depend on what is listening on the build machine. The mock stands in for
 * the network only - the controller, gate, security filter and JSON envelope are all
 * real.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AiConnectionTestContractTest {

    private static final String ADMIN = "aiconn.admin@test.local";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private AiStateManagementService aiStateService;

    @MockBean
    private ModelFetcher modelFetcher;

    private String adminToken;

    @BeforeEach
    void seedAdmin() {
        aiStateService.reset();
        if (userRepository.findByEmailAndDeletedFalse(ADMIN).isEmpty()) {
            Role superRole = roleRepository.findByName("SUPER_ADMIN")
                    .orElseGet(() -> roleRepository.save(Role.builder()
                            .name("SUPER_ADMIN")
                            .displayName("super admin")
                            .description("ai connection test role")
                            .build()));
            userRepository.save(User.builder()
                    .firstName("AiConn")
                    .lastName("Admin")
                    .email(ADMIN)
                    .department("IT")
                    .passwordHash("$2a$10$invalid-hash")
                    .status(UserStatus.ACTIVE)
                    .roles(Set.of(superRole))
                    .build());
        }
        adminToken = token(ADMIN);
    }

    @Test
    @DisplayName("An unreachable provider is reported as a failure, not as success")
    void unreachableProviderIsNotReportedAsSuccess() throws Exception {
        // What connection-refused actually looks like coming out of RestTemplate.
        when(modelFetcher.fetch(anyString(), any(), any(), any()))
                .thenThrow(new ResourceAccessException(
                        "I/O error on GET request for \"http://localhost:11434/v1/models\": Connection refused"));

        mockMvc.perform(post("/v1/ai/test-connection")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "provider", "Ollama Local",
                                "model", "llama3.1:8b",
                                "baseUrl", "http://localhost:11434",
                                "endpoint", "",
                                "apiKey", "")))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                // The envelope is what a client checks first. It must not claim success
                // while carrying an ERROR payload.
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data.status").value("ERROR"));
    }

    @Test
    @DisplayName("A host that answers but lists no models is not a verified connection")
    void emptyCatalogueIsNotReportedAsOnline() throws Exception {
        // No exception: something answered, it just was not a model API.
        when(modelFetcher.fetch(anyString(), any(), any(), any())).thenReturn(List.of());

        mockMvc.perform(post("/v1/ai/test-connection")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "provider", "Ollama Local",
                                "model", "llama3.1:8b",
                                "baseUrl", "http://localhost:11434",
                                "endpoint", "",
                                "apiKey", "")))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data.status").value("ERROR"));
    }

    @Test
    @DisplayName("A real catalogue containing the model is ONLINE")
    void reachableProviderWithTheModelIsOnline() throws Exception {
        when(modelFetcher.fetch(anyString(), any(), any(), any()))
                .thenReturn(List.of("llama3.1:8b", "qwen2.5-7b-instruct"));

        mockMvc.perform(post("/v1/ai/test-connection")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "provider", "Ollama Local",
                                "model", "llama3.1:8b",
                                "baseUrl", "http://localhost:11434",
                                "endpoint", "",
                                "apiKey", "")))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("ONLINE"));
    }

    @Test
    @DisplayName("A model absent from a real catalogue stays ONLINE and says so")
    void modelMissingFromARealCatalogueIsStillOnline() throws Exception {
        // Deliberately tolerated by the original implementation: the provider is
        // reachable and the model name may simply be newer than the catalogue. Pinned
        // so the fix above does not quietly tighten a decision somebody made on purpose.
        when(modelFetcher.fetch(anyString(), any(), any(), any()))
                .thenReturn(List.of("some-other-model"));

        mockMvc.perform(post("/v1/ai/test-connection")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "provider", "Ollama Local",
                                "model", "llama3.1:8b",
                                "baseUrl", "http://localhost:11434",
                                "endpoint", "",
                                "apiKey", "")))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("ONLINE"))
                .andExpect(jsonPath("$.data.message").value(
                        org.hamcrest.Matchers.containsString("not in the provider's model catalog")));
    }

    @Test
    @DisplayName("A failed connection test is not recorded in the log as a success")
    void failedTestIsNotLoggedAsSuccess() throws Exception {
        when(modelFetcher.fetch(anyString(), any(), any(), any()))
                .thenThrow(new ResourceAccessException("Connection refused"));

        mockMvc.perform(post("/v1/ai/test-connection")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "provider", "Ollama Local",
                                "model", "llama3.1:8b",
                                "baseUrl", "http://localhost:11434",
                                "endpoint", "",
                                "apiKey", "")))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());

        // "System = Record" is the promise this application makes about itself. A log
        // saying the health ping succeeded, written on the way to returning ERROR, is
        // the record contradicting the response - and the log is what somebody reads
        // later, when the response is long gone.
        List<AiStateManagementService.RequestLogDto> pings = aiStateService.getLogs().stream()
                .filter(l -> l.getOperation() != null && l.getOperation().contains("Test Connection"))
                .toList();

        assertThat(pings)
                .as("the attempt should still be recorded - the objection is to its verdict, "
                    + "not to its existence")
                .isNotEmpty();
        assertThat(pings)
                .as("a refused connection recorded as SUCCESS")
                .noneMatch(l -> "SUCCESS".equalsIgnoreCase(l.getStatus()));
    }

    private String token(String email) {
        String roleName = userRepository.findByEmailWithRolesAndPermissions(email)
                .orElseThrow().getRoles().iterator().next().getName();
        UserDetails userDetails = new org.springframework.security.core.userdetails.User(
                email, "unused", true, true, true, true,
                List.of(new SimpleGrantedAuthority("ROLE_" + roleName)));
        return jwtTokenProvider.generateAccessToken(userDetails);
    }
}
