package com.photonicomega.facilities.exception;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A client mistake must never be reported as a server fault.
 *
 * <p>{@link GlobalExceptionHandler} declares a catch-all
 * {@code @ExceptionHandler(Exception.class)} and does <em>not</em> extend
 * {@code ResponseEntityExceptionHandler}, so before the fix every Spring MVC
 * request-binding failure - a missing query parameter, an unparseable UUID, a
 * malformed JSON body, an unsupported content type - fell through to that
 * catch-all and came back as HTTP 500.
 *
 * <p>This is a governance problem, not only a cosmetic one. A facilities
 * administrator reading the audit trail cannot distinguish "the caller sent a
 * bad request" from "the platform broke" when both are recorded as 500, and an
 * uptime monitor gated on 5xx alarms on ordinary user typos.
 *
 * <p>Every case below is a request the caller got wrong. All of them must be
 * 4xx, and the happy path must keep working.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ClientErrorMappingTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    private String token;

    @BeforeEach
    void seedCaller() {
        String email = "clienterror.admin@test.local";
        if (userRepository.findByEmailAndDeletedFalse(email).isEmpty()) {
            Role superAdmin = roleRepository.findByName("SUPER_ADMIN")
                    .orElseGet(() -> roleRepository.save(Role.builder()
                            .name("SUPER_ADMIN")
                            .displayName("super admin")
                            .description("client-error mapping test role")
                            .build()));
            userRepository.save(User.builder()
                    .firstName("Client")
                    .lastName("Error")
                    .email(email)
                    .department("IT")
                    .passwordHash("$2a$10$invalid-hash")
                    .status(UserStatus.ACTIVE)
                    .roles(Set.of(superAdmin))
                    .build());
        }
        UserDetails principal = new org.springframework.security.core.userdetails.User(
                email, "unused", true, true, true, true,
                List.of(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN")));
        token = jwtTokenProvider.generateAccessToken(principal);
    }

    @Test
    @DisplayName("a required query parameter that was not sent is 400, not 500")
    void missingRequiredQueryParameterIs400() throws Exception {
        // The exact request the smoke harness made against /v1/documents/search.
        mockMvc.perform(get("/v1/documents/search").header("Authorization", bearer()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("MISSING_PARAMETER"))
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("query")));
    }

    @Test
    @DisplayName("the search happy path still returns 200 once the parameter is supplied")
    void searchWithParameterStillWorks() throws Exception {
        mockMvc.perform(get("/v1/documents/search").param("query", "retention")
                        .header("Authorization", bearer()))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an unparseable UUID path variable is 400, not 500")
    void malformedPathVariableIs400() throws Exception {
        mockMvc.perform(get("/v1/documents/not-a-uuid/download").header("Authorization", bearer()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("INVALID_PARAMETER"));
    }

    @Test
    @DisplayName("a malformed JSON body is 400, not 500")
    void malformedJsonBodyIs400() throws Exception {
        mockMvc.perform(post("/v1/documents")
                        .contentType("application/json")
                        .content("{\"title\": ")
                        .header("Authorization", bearer()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("MALFORMED_REQUEST_BODY"));
    }

    @Test
    @DisplayName("an unsupported content type is 415, not 500")
    void unsupportedContentTypeIs415() throws Exception {
        mockMvc.perform(post("/v1/documents")
                        .contentType("text/plain")
                        .content("not json")
                        .header("Authorization", bearer()))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.errorCode").value("UNSUPPORTED_MEDIA_TYPE"));
    }

    private String bearer() {
        return "Bearer " + token;
    }
}
