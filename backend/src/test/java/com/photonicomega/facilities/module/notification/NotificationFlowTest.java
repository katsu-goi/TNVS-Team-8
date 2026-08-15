package com.photonicomega.facilities.module.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.ai.AiStateManagementService;
import com.photonicomega.facilities.module.admin.repository.AdminNotificationRepository;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.service.SecurityAuditService;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end verification of the hardened notification flows on the H2-backed
 * test profile: per-user request notifications (submission/approval/rejection/
 * completion/cancellation), per-admin admin notifications scoped to the current
 * SUPER_ADMIN, and the AI-provider OFFLINE hook. Real STOMP delivery is covered
 * by {@link RealtimeNotificationPublisherTest}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class NotificationFlowTest {

    private static final String EMPLOYEE = "nflow.employee@test.local";
    private static final String CONTRACT = "nflow.contract@test.local";
    private static final String LEGAL = "nflow.legal@test.local";
    private static final String SUPER1 = "nflow.superadmin1@test.local";
    private static final String SUPER2 = "nflow.superadmin2@test.local";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JwtTokenProvider jwtTokenProvider;
    @Autowired private UserRepository userRepository;
    @Autowired private RoleRepository roleRepository;
    @Autowired private AdminNotificationRepository adminNotificationRepository;
    @Autowired private SecurityAuditService securityAuditService;
    @Autowired private AiStateManagementService aiStateManagementService;

    private String employeeToken;
    private String contractToken;
    private String legalToken;
    private String super1Token;
    private String super2Token;

    @BeforeEach
    void seedUsersAndMintTokens() {
        seedRole("SUPER_ADMIN");
        seedRole("CONTRACT_OFFICER");
        seedRole("LEGAL_OFFICER");
        seedRole("EMPLOYEE");
        ensureUser(EMPLOYEE, "EMPLOYEE");
        ensureUser(CONTRACT, "CONTRACT_OFFICER");
        ensureUser(LEGAL, "LEGAL_OFFICER");
        ensureUser(SUPER1, "SUPER_ADMIN");
        ensureUser(SUPER2, "SUPER_ADMIN");

        employeeToken = token(EMPLOYEE);
        contractToken = token(CONTRACT);
        legalToken = token(LEGAL);
        super1Token = token(SUPER1);
        super2Token = token(SUPER2);
    }

    // ------------------------------------------------------------------
    // Request lifecycle notifications
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Request lifecycle (submit/approve/complete/reject/cancel) notifies the requester per-user")
    void requestLifecycleNotifiesRequester() throws Exception {
        String approved = createRequest(EMPLOYEE, "CONTRACT", "Renew service contract", employeeToken);
        String rejected = createRequest(EMPLOYEE, "CONTRACT", "Buy new hardware", employeeToken);
        String cancelled = createRequest(EMPLOYEE, "CONTRACT", "Travel booking", employeeToken);

        // Contract officer approves the first, rejects the second.
        review(approved, "approve", null, contractToken);
        review(rejected, "reject", "Budget unavailable this quarter", contractToken);
        // Contract officer completes the approved one.
        review(approved, "complete", null, contractToken);
        // Employee cancels their own pending request.
        cancelRequest(cancelled, employeeToken);

        JsonNode notifications = getNotifications(employeeToken);
        List<String> types = typesOf(notifications);

        assertThat(types).contains("APPROVAL", "REJECTION", "COMPLETED", "CANCELLED");

        JsonNode rejection = findByType(notifications, "REJECTION");
        assertThat(rejection.get("relatedEntityId").asText()).isEqualTo(rejected);
        assertThat(rejection.get("message").asText()).contains("Budget unavailable this quarter");

        JsonNode completed = findByType(notifications, "COMPLETED");
        assertThat(completed.get("relatedEntityId").asText()).isEqualTo(approved);

        JsonNode cancelledNote = findByType(notifications, "CANCELLED");
        assertThat(cancelledNote.get("relatedEntityId").asText()).isEqualTo(cancelled);
    }

    @Test
    @DisplayName("Review endpoints are role-and-type scoped: legal officer cannot decide contract requests")
    void reviewRoleTypeGuardEnforced() throws Exception {
        String legalRequest = createRequest(EMPLOYEE, "LEGAL", "Review NDA", employeeToken);
        String contractRequest = createRequest(EMPLOYEE, "CONTRACT", "Order supplies", employeeToken);

        // Contract officer must NOT be able to decide a LEGAL request.
        mockMvc.perform(post("/v1/requests-review/" + legalRequest + "/approve")
                        .header("Authorization", "Bearer " + contractToken))
                .andExpect(status().isForbidden());

        // Legal officer cannot decide a CONTRACT request.
        mockMvc.perform(post("/v1/requests-review/" + contractRequest + "/approve")
                        .header("Authorization", "Bearer " + legalToken))
                .andExpect(status().isForbidden());

        // Legal officer can decide the LEGAL one and complete it.
        review(legalRequest, "approve", null, legalToken);
        review(legalRequest, "complete", null, legalToken);

        // Contract officer only sees contract requests in the review list.
        JsonNode contractView = getJson("/v1/requests-review", contractToken);
        List<String> ids = idsOf(contractView);
        assertThat(ids).contains(contractRequest).doesNotContain(legalRequest);

        // Employee cannot use the review endpoints at all.
        mockMvc.perform(get("/v1/requests-review")
                        .header("Authorization", "Bearer " + employeeToken))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Marking a notification read persists and only affects the owner")
    void readStateIsPersistentAndPerOwner() throws Exception {
        String request = createRequest(EMPLOYEE, "CONTRACT", "Stationery order", employeeToken);
        review(request, "approve", null, contractToken);

        JsonNode before = getNotifications(employeeToken);
        JsonNode approval = findByType(before, "APPROVAL");
        String noteId = approval.get("id").asText();

        mockMvc.perform(post("/v1/employee/notifications/" + noteId + "/read")
                        .header("Authorization", "Bearer " + employeeToken))
                .andExpect(status().isOk());

        JsonNode after = getNotifications(employeeToken);
        assertThat(findById(after, noteId).get("read").asBoolean()).isTrue();

        // The contract officer - not the recipient - can never see the employee's notifications.
        mockMvc.perform(get("/v1/employee/notifications")
                        .header("Authorization", "Bearer " + contractToken))
                .andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------------
    // Admin notifications (per-admin scoping + real event hooks)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("HIGH security alerts notify every SUPER_ADMIN with a private row per admin")
    void highSecurityAlertNotifiesEachSuperAdmin() throws Exception {
        securityAuditService.createSecurityAlert(
                "Breach attempt detected", "Repeated failed logins from a flagged IP",
                RiskLevel.HIGH, "BRUTE_FORCE", "10.0.0.99", null);

        // Every SUPER_ADMIN has their own unread row.
        assertThat(adminNotificationRepository.countUnread(userId(SUPER1))).isEqualTo(1L);
        assertThat(adminNotificationRepository.countUnread(userId(SUPER2))).isEqualTo(1L);

        // Each admin only sees their own notification through the API.
        JsonNode one = getJson("/v1/admin/notifications", super1Token);
        assertThat(one.get("data").size()).isEqualTo(1);
        assertThat(one.get("data").get(0).get("type").asText()).isEqualTo("SECURITY");

        // Marking one admin's notification read does not affect the other admin's count.
        String adminNoteId = one.get("data").get(0).get("id").asText();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/v1/admin/notifications/" + adminNoteId + "/read")
                        .header("Authorization", "Bearer " + super1Token))
                .andExpect(status().isOk());

        assertThat(adminNotificationRepository.countUnread(userId(SUPER1))).isZero();
        assertThat(adminNotificationRepository.countUnread(userId(SUPER2))).isEqualTo(1L);

        // LOW severity alerts must NOT create admin notifications.
        securityAuditService.createSecurityAlert(
                "Minor event", "Low-risk activity", RiskLevel.LOW, "INFO", null, null);
        assertThat(adminNotificationRepository.countUnread(userId(SUPER1))).isZero();
    }

    @Test
    @DisplayName("AI provider transition to OFFLINE notifies admins once per transition")
    void aiProviderOfflineNotifiesAdminsOnlyOnTransition() {
        AiStateManagementService.ProviderDto p = AiStateManagementService.ProviderDto.builder()
                .id("p-test-offline").name("Test Provider").status("CONNECTED")
                .type("local").build();
        aiStateManagementService.addProvider(p);

        // CONNECTED -> OFFLINE: notify.
        aiStateManagementService.updateProviderHealth("p-test-offline", false, 0, "timeout");
        assertThat(adminNotificationRepository.countUnread(userId(SUPER1))).isEqualTo(1L);
        assertThat(adminNotificationRepository.countUnread(userId(SUPER2))).isEqualTo(1L);

        // Already OFFLINE -> OFFLINE: no duplicate notification.
        aiStateManagementService.updateProviderHealth("p-test-offline", false, 0, "still down");
        assertThat(adminNotificationRepository.countUnread(userId(SUPER1))).isEqualTo(1L);

        // OFFLINE -> CONNECTED: no notification (recovery is not an alert).
        aiStateManagementService.updateProviderHealth("p-test-offline", true, 12, "recovered");
        assertThat(adminNotificationRepository.countUnread(userId(SUPER1))).isEqualTo(1L);

        // CONNECTED -> OFFLINE again: a fresh transition, so notify again.
        aiStateManagementService.updateProviderHealth("p-test-offline", false, 0, "down again");
        assertThat(adminNotificationRepository.countUnread(userId(SUPER1))).isEqualTo(2L);
        assertThat(adminNotificationRepository.countUnread(userId(SUPER2))).isEqualTo(2L);

        List<com.photonicomega.facilities.module.admin.domain.AdminNotification> alerts =
                adminNotificationRepository.findAllByOrderByCreatedAtDesc();
        assertThat(alerts.get(0).getType()).isEqualTo("AI_PROVIDER");
        assertThat(alerts.get(0).getRelatedEntityType()).isEqualTo("AIProvider");
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private String createRequest(String email, String type, String title, String token) throws Exception {
        MvcResult result = mockMvc.perform(post("/v1/employee/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"" + type + "\",\"title\":\"" + title + "\",\"description\":\"test\"}")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return body(result).get("data").get("id").asText();
    }

    private void review(String id, String action, String reason, String token) throws Exception {
        String url = "/v1/requests-review/" + id + "/" + action;
        if ("reject".equals(action) && reason != null) {
            mockMvc.perform(post(url)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"reason\":\"" + reason + "\"}")
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        } else {
            mockMvc.perform(post(url)
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }
    }

    private void cancelRequest(String id, String token) throws Exception {
        mockMvc.perform(post("/v1/employee/requests/" + id + "/cancel")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    private JsonNode getNotifications(String token) throws Exception {
        return getJson("/v1/employee/notifications", token);
    }

    private JsonNode getJson(String path, String token) throws Exception {
        MvcResult result = mockMvc.perform(get(path).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return body(result);
    }

    private JsonNode body(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private List<String> typesOf(JsonNode notifications) {
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        notifications.get("data").forEach(n -> out.add(n.get("type").asText()));
        return out;
    }

    private List<String> idsOf(JsonNode response) {
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        response.get("data").forEach(n -> out.add(n.get("id").asText()));
        return out;
    }

    private JsonNode findByType(JsonNode notifications, String type) {
        for (JsonNode n : notifications.get("data")) {
            if (type.equals(n.get("type").asText())) return n;
        }
        throw new AssertionError("No notification of type " + type);
    }

    private JsonNode findById(JsonNode notifications, String id) {
        for (JsonNode n : notifications.get("data")) {
            if (id.equals(n.get("id").asText())) return n;
        }
        throw new AssertionError("No notification with id " + id);
    }

    private UUID userId(String email) {
        return userRepository.findByEmailAndDeletedFalse(email).orElseThrow().getId();
    }

    private void seedRole(String name) {
        if (roleRepository.findByName(name).isEmpty()) {
            roleRepository.save(Role.builder()
                    .name(name)
                    .displayName(name.replace('_', ' ').toLowerCase())
                    .description("test role")
                    .build());
        }
    }

    private void ensureUser(String email, String roleName) {
        if (userRepository.findByEmailAndDeletedFalse(email).isEmpty()) {
            Role role = roleRepository.findByName(roleName).orElseThrow();
            userRepository.save(User.builder()
                    .firstName("NFlow").lastName("Tester")
                    .email(email).department("General")
                    .passwordHash("$2a$10$invalid-hash")
                    .status(UserStatus.ACTIVE)
                    .roles(Set.of(role))
                    .build());
        }
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
