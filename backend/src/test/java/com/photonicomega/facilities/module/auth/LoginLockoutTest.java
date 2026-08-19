package com.photonicomega.facilities.module.auth;

import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.HrAssistanceRequestRepository;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.security.domain.ActiveSession;
import com.photonicomega.facilities.module.security.repository.ActiveSessionRepository;
import com.photonicomega.facilities.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end verification of the progressive login lockout and HR assistance
 * flow. Exercises the real HTTP layer (MockMvc) against the H2-backed test
 * profile so counters, lock windows, and audit rows are checked exactly as
 * they would be in production - the lock cannot be bypassed from the client.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(LoginLockoutTest.SeedConfig.class)
class LoginLockoutTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private HrAssistanceRequestRepository hrAssistanceRequestRepository;

    @Autowired
    private ActiveSessionRepository activeSessionRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private TestSeedHelper seedHelper;

    private static final String EMAIL = "lockout@test.local";
    private static final String PASSWORD = "S3cure-Passw0rd!";

    @BeforeEach
    void seedAccount() {
        hrAssistanceRequestRepository.deleteAll();
        activeSessionRepository.deleteAll();
        seedHelper.resetAccount(EMAIL, PASSWORD, "EMPLOYEE");
    }

    @Test
    @DisplayName("1st wrong password -> 423 temp lock, 10s countdown, counter persisted server-side")
    void firstFailureLocksForTenSeconds() throws Exception {
        attempt(EMAIL, "wrong-password")
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_TEMP_LOCKED"))
                .andExpect(jsonPath("$.data.failedAttempts").value(1))
                .andExpect(jsonPath("$.data.maxAttempts").value(3))
                .andExpect(jsonPath("$.data.remainingAttempts").value(2))
                .andExpect(jsonPath("$.data.permanentlyLocked").value(false))
                .andExpect(jsonPath("$.data.lockSecondsRemaining").isNumber());

        User stored = reload();
        assertEquals(1, stored.getFailedLoginAttempts(), "counter must persist in the DB");
        assertNotNull(stored.getLockedUntil(), "lock expiry must be persisted");
        assertTrue(stored.getLockedUntil().isAfter(LocalDateTime.now()));
        long seconds = java.time.Duration.between(LocalDateTime.now(), stored.getLockedUntil()).getSeconds();
        assertTrue(seconds >= 1 && seconds <= 10, "expected ~10s lock, got " + seconds);
    }

    @Test
    @DisplayName("2nd wrong password -> 30s countdown, then 3rd failure locks the account permanently")
    void progressiveLockoutEndsInPermanentLock() throws Exception {
        attempt(EMAIL, "wrong-password").andExpect(status().isLocked());
        expireTempLock();

        attempt(EMAIL, "wrong-password")
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_TEMP_LOCKED"))
                .andExpect(jsonPath("$.data.failedAttempts").value(2))
                .andExpect(jsonPath("$.data.lockSecondsRemaining").isNumber());

        User stored = reload();
        long seconds = java.time.Duration.between(LocalDateTime.now(), stored.getLockedUntil()).getSeconds();
        assertTrue(seconds >= 1 && seconds <= 30, "expected ~30s lock, got " + seconds);

        expireTempLock();

        attempt(EMAIL, "wrong-password")
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_LOCKED"))
                .andExpect(jsonPath("$.data.failedAttempts").value(3))
                .andExpect(jsonPath("$.data.remainingAttempts").value(0))
                .andExpect(jsonPath("$.data.permanentlyLocked").value(true));

        // A permanently locked account rejects even the correct password.
        attempt(EMAIL, PASSWORD)
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_LOCKED"));

        stored = reload();
        assertTrue(stored.getFailedLoginAttempts() >= 3);
    }

    @Test
    @DisplayName("Attempts during the active countdown are rejected without consuming a new attempt")
    void attemptsDuringCountdownAreRejected() throws Exception {
        attempt(EMAIL, "wrong-password").andExpect(status().isLocked());

        // Correct password submitted while the 10s lock is still active.
        attempt(EMAIL, PASSWORD)
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_TEMP_LOCKED"))
                .andExpect(jsonPath("$.data.failedAttempts").value(1));

        assertEquals(1, reload().getFailedLoginAttempts(), "lockout-period attempts must not increment");
    }

    @Test
    @DisplayName("Successful login after failures resets the counter and clears the lock")
    void successfulLoginResetsCounter() throws Exception {
        User user = reload();
        user.setFailedLoginAttempts(2);
        user.setLockedUntil(LocalDateTime.now().minusSeconds(1));
        userRepository.save(user);

        assertTrue(passwordEncoder.matches(PASSWORD, reload().getPasswordHash()),
                "seeded password hash must verify");
        assertEquals(2, reload().getFailedLoginAttempts());

        attempt(EMAIL, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        User after = reload();
        assertEquals(0, after.getFailedLoginAttempts());
        assertNull(after.getLockedUntil());
    }

    @Test
    @DisplayName("Duplicate active-session rows do not turn a valid login into a 500")
    void duplicateActiveSessionsAreConsolidatedDuringLogin() throws Exception {
        User user = reload();
        activeSessionRepository.saveAll(List.of(
                activeSession(user, "session-older", Instant.now().minusSeconds(30)),
                activeSession(user, "session-newer", Instant.now())
        ));

        attempt(EMAIL, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        List<ActiveSession> active = activeSessionRepository
                .findByUsernameAndStatusOrderByLastActivityDesc(EMAIL, "ACTIVE");
        assertEquals(1, active.size(), "only one active session should remain");
        assertEquals("session-newer", active.get(0).getSessionId());
        assertEquals(1, activeSessionRepository.findByStatus("REVOKED").size());
    }

    @Test
    @DisplayName("Unknown account returns a generic 401 without exposing account existence")
    void unknownAccountReturnsGenericError() throws Exception {
        attempt("nobody@test.local", PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("INVALID_CREDENTIALS"))
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    @Test
    @DisplayName("HR assistance endpoint is public and persists the request")
    void hrAssistanceSubmissionIsPublic() throws Exception {
        mockMvc.perform(post("/v1/auth/hr/assistance")
                        .contentType("application/json")
                        .content("{\"name\":\"Locked User\",\"email\":\"" + EMAIL + "\","
                                + "\"subject\":\"Account locked\",\"message\":\"Please help me regain access to my account\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        assertEquals(1, hrAssistanceRequestRepository.count(),
                "HR assistance request must be persisted");
    }

    @Test
    @DisplayName("Super admin can unlock a permanently locked account")
    void adminCanUnlockAccount() throws Exception {
        seedHelper.seedUser("admin.lockout@test.local", PASSWORD, "SUPER_ADMIN");
        String adminToken = token("admin.lockout@test.local");

        User locked = reload();
        locked.setFailedLoginAttempts(3);
        locked.setLockedUntil(LocalDateTime.now().plusDays(365));
        userRepository.save(locked);

        mockMvc.perform(post("/v1/admin/users/" + locked.getId() + "/unlock")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        User after = reload();
        assertEquals(0, after.getFailedLoginAttempts());
        assertNull(after.getLockedUntil());
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private ResultActions attempt(String email, String password) throws Exception {
        return mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"));
    }

    private User reload() {
        return userRepository.findByEmailAndDeletedFalse(EMAIL).orElseThrow();
    }

    private ActiveSession activeSession(User user, String sessionId, Instant lastActivity) {
        return ActiveSession.builder()
                .sessionId(sessionId)
                .userId(user.getId().toString())
                .username(user.getEmail())
                .fullName(user.getFullName())
                .role("EMPLOYEE")
                .ipAddress("127.0.0.1")
                .browser("Test")
                .deviceName("Test")
                .loginTime(lastActivity)
                .lastActivity(lastActivity)
                .status("ACTIVE")
                .build();
    }

    /** Simulates the progressive countdown reaching zero so the next attempt can run. */
    private void expireTempLock() {
        User user = reload();
        user.setLockedUntil(LocalDateTime.now().minusSeconds(1));
        userRepository.save(user);
    }

    private String token(String email) {
        String roleName = userRepository.findByEmailWithRolesAndPermissions(email)
                .orElseThrow().getRoles().iterator().next().getName();
        UserDetails userDetails = new org.springframework.security.core.userdetails.User(
                email, "unused", true, true, true, true,
                java.util.List.of(new SimpleGrantedAuthority("ROLE_" + roleName)));
        return jwtTokenProvider.generateAccessToken(userDetails);
    }

    /**
     * Seeds users together with their roles inside a single transaction so a
     * freshly-created Role stays managed when it is attached to the User. The
     * test itself must NOT be @Transactional: the lockout flow relies on
     * REQUIRES_NEW commits being visible to later reads.
     */
    static class TestSeedHelper {
        private final UserRepository userRepository;
        private final RoleRepository roleRepository;
        private final PasswordEncoder passwordEncoder;

        TestSeedHelper(UserRepository userRepository, RoleRepository roleRepository,
                       PasswordEncoder passwordEncoder) {
            this.userRepository = userRepository;
            this.roleRepository = roleRepository;
            this.passwordEncoder = passwordEncoder;
        }

        @Transactional
        public void resetAccount(String email, String password, String roleName) {
            Role role = ensureRole(roleName);
            User existing = userRepository.findByEmailAndDeletedFalse(email).orElse(null);
            if (existing != null) {
                existing.resetFailedAttempts();
                existing.setPasswordHash(passwordEncoder.encode(password));
                if (existing.getRoles().isEmpty()) {
                    existing.setRoles(new HashSet<>(Set.of(role)));
                }
                userRepository.save(existing);
            } else {
                userRepository.save(User.builder()
                        .firstName("Lock")
                        .lastName("Tester")
                        .email(email)
                        .department("IT")
                        .passwordHash(passwordEncoder.encode(password))
                        .status(UserStatus.ACTIVE)
                        .roles(new HashSet<>(Set.of(role)))
                        .build());
            }
        }

        @Transactional
        public void seedUser(String email, String password, String roleName) {
            Role role = ensureRole(roleName);
            userRepository.save(User.builder()
                    .firstName("Admin")
                    .lastName("User")
                    .email(email)
                    .passwordHash(passwordEncoder.encode(password))
                    .status(UserStatus.ACTIVE)
                    .roles(new HashSet<>(Set.of(role)))
                    .build());
        }

        private Role ensureRole(String name) {
            return roleRepository.findByName(name)
                    .orElseGet(() -> roleRepository.save(Role.builder()
                            .name(name)
                            .displayName(name.replace('_', ' ').toLowerCase())
                            .description("lockout test role")
                            .build()));
        }
    }

    @TestConfiguration
    static class SeedConfig {
        @Bean
        TestSeedHelper testSeedHelper(UserRepository userRepository, RoleRepository roleRepository,
                                      PasswordEncoder passwordEncoder) {
            return new TestSeedHelper(userRepository, roleRepository, passwordEncoder);
        }
    }
}
