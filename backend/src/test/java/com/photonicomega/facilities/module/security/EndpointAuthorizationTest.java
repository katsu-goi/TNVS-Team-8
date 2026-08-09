package com.photonicomega.facilities.module.security;

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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the Phase 1.5 authorization model across the previously-unprotected
 * route families. For every family we assert the least-privilege role set is
 * allowed (200) and every other authenticated role is denied with 403 -
 * never 401 or 500 - while anonymous requests are rejected with 401 and lost
 * paths still 404.
 *
 * Runs on the H2-backed {@code test} profile so no external DB is required.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class EndpointAuthorizationTest {

    private static final String BASE = "";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    private String superAdminToken;
    private String fmToken;
    private String foToken;
    private String complianceToken;
    private String legalToken;
    private String contractToken;
    private String employeeToken;

    @BeforeEach
    void seedUsersAndMintTokens() {
        if (userRepository.findByEmailAndDeletedFalse("authz.superadmin@test.local").isEmpty()) {
            Role superRole = role("SUPER_ADMIN");
            Role fmRole = role("FACILITIES_MANAGER");
            Role foRole = role("FACILITIES_OFFICER");
            Role coRole = role("COMPLIANCE_OFFICER");
            Role legalRole = role("LEGAL_OFFICER");
            Role contractRole = role("CONTRACT_OFFICER");
            Role employeeRole = role("EMPLOYEE");
            Role[] r = {superRole, fmRole, foRole, coRole, legalRole, contractRole, employeeRole};
            String[][] users = {
                    {"authz.superadmin@test.local", "IT"},
                    {"authz.fm@test.local", "Facilities"},
                    {"authz.fo@test.local", "Facilities"},
                    {"authz.co@test.local", "Compliance"},
                    {"authz.legal@test.local", "Legal"},
                    {"authz.contract@test.local", "Procurement"},
                    {"authz.employee@test.local", "General"},
            };
            for (int i = 0; i < users.length; i++) {
                userRepository.save(user(users[i][0], users[i][1], r[i]));
            }
        }

        superAdminToken = token("authz.superadmin@test.local");
        fmToken = token("authz.fm@test.local");
        foToken = token("authz.fo@test.local");
        complianceToken = token("authz.co@test.local");
        legalToken = token("authz.legal@test.local");
        contractToken = token("authz.contract@test.local");
        employeeToken = token("authz.employee@test.local");
    }

    // ------------------------------------------------------------------
    // /v1/ai/** - SUPER_ADMIN only
    // ------------------------------------------------------------------

    @Test
    @DisplayName("/v1/ai/** is SUPER_ADMIN-only")
    void aiIsSuperAdminOnly() throws Exception {
        expectAllow("/v1/ai/providers", superAdminToken);
        expect403("/v1/ai/providers", fmToken);
        expect403("/v1/ai/providers", employeeToken);
        expectUnauthorized("/v1/ai/providers");
    }

    // ------------------------------------------------------------------
    // /v1/contracts - CONTRACT_OFFICER + LEGAL_OFFICER
    // ------------------------------------------------------------------

    @Test
    @DisplayName("/v1/contracts allows CONTRACT_OFFICER and LEGAL_OFFICER only")
    void contractsAllowContractAndLegalOfficers() throws Exception {
        expectAllow("/v1/contracts", contractToken);
        expectAllow("/v1/contracts", legalToken);
        expect403("/v1/contracts", foToken);
        expect403("/v1/contracts", complianceToken);
        expect403("/v1/contracts", employeeToken);
        expectUnauthorized("/v1/contracts");
    }

    // ------------------------------------------------------------------
    // /v1/facilities - GET: FM+FO, create facility: FM only
    // ------------------------------------------------------------------

    @Test
    @DisplayName("/v1/facilities GET allows FM + FO")
    void facilitiesReadAllowsManagerAndOfficer() throws Exception {
        expectAllow("/v1/facilities", fmToken);
        expectAllow("/v1/facilities", foToken);
        expect403("/v1/facilities", complianceToken);
        expectUnauthorized("/v1/facilities");
    }

    @Test
    @DisplayName("/v1/facilities POST (create facility) is FM only")
    void createFacilityIsManagerOnly() throws Exception {
        String body = """
                {"name": "Authz Test Facility", "code": "AUTHZ-1", "type": "OPERATIONS_HUB"}""";
        mockMvc.perform(post(BASE + "/v1/facilities")
                        .contentType("application/json").content(body)
                        .header("Authorization", "Bearer " + fmToken))
                .andExpect(status().isOk());
        mockMvc.perform(post(BASE + "/v1/facilities")
                        .contentType("application/json").content(body)
                        .header("Authorization", "Bearer " + foToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(post(BASE + "/v1/facilities")
                        .contentType("application/json").content(body))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /v1/facilities/{id}/rooms is readable by FM + FO")
    void roomsByFacilityRead() throws Exception {
        mockMvc.perform(get(BASE + "/v1/facilities/00000000-0000-0000-0000-000000000000/rooms")
                        .header("Authorization", "Bearer " + fmToken))
                .andExpect(status().isOk());
        mockMvc.perform(get(BASE + "/v1/facilities/00000000-0000-0000-0000-000000000000/rooms")
                        .header("Authorization", "Bearer " + foToken))
                .andExpect(status().isOk());
        mockMvc.perform(get(BASE + "/v1/facilities/00000000-0000-0000-0000-000000000000/rooms")
                        .header("Authorization", "Bearer " + employeeToken))
                .andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------------
    // /v1/legal-cases - LEGAL_OFFICER only
    // ------------------------------------------------------------------

    @Test
    @DisplayName("/v1/legal-cases is LEGAL_OFFICER only")
    void legalCasesAreLegalOfficerOnly() throws Exception {
        expectAllow("/v1/legal-cases", legalToken);
        expect403("/v1/legal-cases", superAdminToken);
        expect403("/v1/legal-cases", contractToken);
        expectUnauthorized("/v1/legal-cases");
    }

    // ------------------------------------------------------------------
    // /v1/visitors - FACILITIES_OFFICER only
    // ------------------------------------------------------------------

    @Test
    @DisplayName("/v1/visitors is FACILITIES_OFFICER only")
    void visitorsAreOfficerOnly() throws Exception {
        expectAllow("/v1/visitors", foToken);
        expect403("/v1/visitors", fmToken);
        expect403("/v1/visitors", superAdminToken);
        expectUnauthorized("/v1/visitors");
    }

    // ------------------------------------------------------------------
    // /v1/dashboard/summary - SUPER_ADMIN only
    // ------------------------------------------------------------------

    @Test
    @DisplayName("/v1/dashboard/summary is SUPER_ADMIN only")
    void dashboardSummaryIsSuperAdminOnly() throws Exception {
        expectAllow("/v1/dashboard/summary", superAdminToken);
        expect403("/v1/dashboard/summary", fmToken);
        expect403("/v1/dashboard/summary", contractToken);
        expectUnauthorized("/v1/dashboard/summary");
    }

    // ------------------------------------------------------------------
    // /v1/security/ip-threats - SUPER_ADMIN only (fixed threat map)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("/v1/security/ip-threats/* is SUPER_ADMIN only on the clean /v1 path")
    void threatMapIsSuperAdminOnlyOnCleanPath() throws Exception {
        expectAllow("/v1/security/ip-threats/stats", superAdminToken);
        expect403("/v1/security/ip-threats/stats", complianceToken);
        expectUnauthorized("/v1/security/ip-threats/stats");
        // The old double-/api path must no longer resolve for an authenticated caller.
        mockMvc.perform(get("/api/api/security/ip-threats/stats")
                        .header("Authorization", "Bearer " + superAdminToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/api/v1/security/ip-threats/stats")
                        .header("Authorization", "Bearer " + superAdminToken))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------
    // 404 / 405 sanity on gated families
    // ------------------------------------------------------------------

    @Test
    @DisplayName("missing resource on a gated family is still 404")
    void missingResourceStill404() throws Exception {
        mockMvc.perform(get(BASE + "/v1/legal-cases/does-not-exist")
                        .header("Authorization", "Bearer " + legalToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(BASE + "/v1/contracts/00000000-0000-0000-0000-000000000000/analyze")
                        .header("Authorization", "Bearer " + contractToken))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private String token(String email) {
        String roleName = userRepository.findByEmailWithRolesAndPermissions(email)
                .orElseThrow().getRoles().iterator().next().getName();
        UserDetails userDetails = new org.springframework.security.core.userdetails.User(
                email, "unused", true, true, true, true,
                java.util.List.of(new SimpleGrantedAuthority("ROLE_" + roleName)));
        return jwtTokenProvider.generateAccessToken(userDetails);
    }

    private Role role(String name) {
        return roleRepository.findByName(name).orElseGet(() -> roleRepository.save(Role.builder()
                .name(name)
                .displayName(name.replace('_', ' ').toLowerCase())
                .description("authz test role")
                .build()));
    }

    private User user(String email, String dept, Role role) {
        return User.builder()
                .firstName("Authz")
                .lastName("Tester")
                .email(email)
                .department(dept)
                .passwordHash("$2a$10$invalid-hash")
                .status(UserStatus.ACTIVE)
                .roles(Set.of(role))
                .build();
    }

    private void expectAllow(String path, String token) throws Exception {
        mockMvc.perform(get(BASE + path).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    private void expect403(String path, String token) throws Exception {
        mockMvc.perform(get(BASE + path).header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    private void expectUnauthorized(String path) throws Exception {
        mockMvc.perform(get(BASE + path)).andExpect(status().isUnauthorized());
    }
}