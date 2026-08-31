package com.photonicomega.facilities.module.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.module.auth.domain.*;
import com.photonicomega.facilities.module.auth.repository.*;
import com.photonicomega.facilities.module.security.repository.LoginHistoryRepository;
import com.photonicomega.facilities.module.security.repository.SecurityLogRepository;
import com.photonicomega.facilities.security.JwtTokenProvider;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(LoginLockoutTest.SeedConfig.class)
class LoginLockoutTest {
    private static final String EMAIL = "lockout@test.local";
    private static final String PASSWORD = "S3cure-Passw0rd!";
    private static final AtomicInteger IP_SEQUENCE = new AtomicInteger(10);

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired HrAssistanceRequestRepository hrAssistanceRequestRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired TestSeedHelper seedHelper;
    @Autowired ObjectMapper objectMapper;
    @Autowired LoginHistoryRepository loginHistoryRepository;
    @Autowired SecurityLogRepository securityLogRepository;
    @Autowired AuditLogRepository auditLogRepository;

    private String clientIp;

    @BeforeEach
    void seedAccount() {
        clientIp = "203.0.113." + IP_SEQUENCE.getAndIncrement();
        hrAssistanceRequestRepository.deleteAll();
        seedHelper.resetAccount(EMAIL, PASSWORD, "EMPLOYEE");
    }

    @Test
    @DisplayName("Attempts 1-2 are generic 401 responses without public counters or a lock")
    void firstTwoFailuresDoNotLockOrExposeCounters() throws Exception {
        for (int expected = 1; expected <= 2; expected++) {
            attempt(EMAIL, "wrong", clientIp, "Browser-A")
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.message").value("Incorrect email or password."))
                    .andExpect(jsonPath("$.errorCode").value("INVALID_CREDENTIALS"))
                    .andExpect(jsonPath("$.data.failedAttempts").doesNotExist())
                    .andExpect(jsonPath("$.data.retryAt").isEmpty());
            assertEquals(expected, reload().getFailedLoginAttempts());
            assertNull(reload().getLockedUntil());
        }
    }

    @Test
    @DisplayName("Attempt 3 locks 30s, attempt 4 locks 60s, attempt 5 locks 5m; none is permanent")
    void progressiveTemporaryPolicy() throws Exception {
        attempt(EMAIL, "wrong", clientIp, "Browser-A").andExpect(status().isUnauthorized());
        attempt(EMAIL, "wrong", clientIp, "Browser-A").andExpect(status().isUnauthorized());

        assertLockResponse(30);
        expireLock();
        assertLockResponse(60);
        expireLock();
        assertLockResponse(300);

        User stored = reload();
        assertEquals(5, stored.getFailedLoginAttempts());
        assertTrue(stored.getLockedUntil().isBefore(LocalDateTime.now().plusMinutes(6)));
    }

    @Test
    @DisplayName("An active restriction survives device changes and does not consume another attempt")
    void activeLockCannotBeBypassedByAnotherDevice() throws Exception {
        reachAttemptThree();
        attempt(EMAIL, PASSWORD, clientIp, "Completely-Different-Device")
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_TEMP_LOCKED"))
                .andExpect(jsonPath("$.data.retryAt").isString());
        assertEquals(3, reload().getFailedLoginAttempts());
    }

    @Test
    @DisplayName("Successful login after expiry atomically resets attempts and retains no lock")
    void successResetsState() throws Exception {
        reachAttemptThree();
        expireLock();
        attempt(EMAIL, PASSWORD, clientIp, "Browser-A")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
        assertEquals(0, reload().getFailedLoginAttempts());
        assertNull(reload().getLockedUntil());
        assertNull(reload().getLastFailedAttemptAt());
    }

    @Test
    @DisplayName("Unknown and registered identifiers have the same external failure sequence")
    void unknownAccountDoesNotChangeResponseShapeOrTiming() throws Exception {
        String unknown = "unknown-" + UUID.randomUUID() + "@test.local";
        for (int attempt = 1; attempt <= 3; attempt++) {
            JsonNode known = responseJson(attempt(EMAIL, "wrong", clientIp, "Browser-A"));
            JsonNode missing = responseJson(attempt(unknown, "wrong", clientIp, "Browser-A"));
            assertEquals(known.get("errorCode"), missing.get("errorCode"));
            assertEquals(known.get("message").asText().replaceAll("\\d{2}:\\d{2}", "TIME"),
                    missing.get("message").asText().replaceAll("\\d{2}:\\d{2}", "TIME"));
            assertEquals(fieldNames(known.get("data")), fieldNames(missing.get("data")));
        }
    }

    @Test
    @DisplayName("Concurrent failures stop at the first active restriction")
    void concurrentFailuresAreSerialized() throws Exception {
        attempt(EMAIL, "wrong", clientIp, "Browser-A").andExpect(status().isUnauthorized());
        attempt(EMAIL, "wrong", clientIp, "Browser-A").andExpect(status().isUnauthorized());

        ExecutorService executor = Executors.newFixedThreadPool(6);
        try {
            List<Callable<Integer>> calls = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                calls.add(() -> attempt(EMAIL, "wrong", clientIp, "Browser-Parallel")
                        .andReturn().getResponse().getStatus());
            }
            for (Future<Integer> result : executor.invokeAll(calls)) {
                assertEquals(423, result.get());
            }
        } finally {
            executor.shutdownNow();
        }
        assertEquals(3, reload().getFailedLoginAttempts());
    }

    @Test
    @DisplayName("IP throttling is separate from accounts and returns HTTP 429")
    void ipRateLimitSpansMultipleIdentifiers() throws Exception {
        String ip = "198.51.100.250";
        for (int i = 0; i < 20; i++) {
            attempt("guess-" + i + "@test.local", "wrong", ip, "RateBot").andReturn();
        }
        attempt("guess-final@test.local", "wrong", ip, "RateBot")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
    }

    @Test
    @DisplayName("Failed logins are retained with FAILED results in all existing security feeds")
    void failedLoginLoggingUsesCorrectResultValues() throws Exception {
        java.time.Instant started = java.time.Instant.now().minusSeconds(1);
        LocalDateTime auditStarted = LocalDateTime.now().minusSeconds(1);
        attempt(EMAIL, "wrong", clientIp, "Logging-Browser").andExpect(status().isUnauthorized());

        awaitAsync(() -> loginHistoryRepository.findByTimestampBetween(started, java.time.Instant.now()).stream()
                .anyMatch(row -> EMAIL.equals(row.getUsername()) && "FAILED".equals(row.getStatus())));
        awaitAsync(() -> securityLogRepository.findByTimestampBetween(started, java.time.Instant.now()).stream()
                .anyMatch(row -> "LOGIN_FAILED".equals(row.getAction()) && "FAILED".equals(row.getStatus())));
        awaitAsync(() -> auditLogRepository.findByCreatedAtAfterOrderByCreatedAtDesc(auditStarted).stream()
                .anyMatch(row -> "LOGIN_FAILED".equals(row.getAction()) && "FAILED".equals(row.getStatus())));
    }

    @Test
    void hrAssistanceSubmissionRemainsPublic() throws Exception {
        mockMvc.perform(post("/v1/auth/hr/assistance")
                        .header("X-Forwarded-For", clientIp)
                        .contentType("application/json")
                        .content("{\"name\":\"Locked User\",\"email\":\"" + EMAIL + "\"," +
                                "\"subject\":\"Account access\",\"message\":\"Please help me regain access\"}"))
                .andExpect(status().isOk());
        assertEquals(1, hrAssistanceRequestRepository.count());
    }

    @Test
    void adminUnlockStillClearsTemporaryState() throws Exception {
        seedHelper.seedUser("admin.lockout@test.local", PASSWORD, "SUPER_ADMIN");
        String token = token("admin.lockout@test.local");
        User locked = reload();
        locked.setFailedLoginAttempts(5);
        locked.setLockedUntil(LocalDateTime.now().plusMinutes(5));
        userRepository.save(locked);

        mockMvc.perform(post("/v1/admin/users/" + locked.getId() + "/unlock")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Forwarded-For", clientIp))
                .andExpect(status().isOk());
        assertEquals(0, reload().getFailedLoginAttempts());
        assertNull(reload().getLockedUntil());
    }

    private void reachAttemptThree() throws Exception {
        attempt(EMAIL, "wrong", clientIp, "Browser-A").andExpect(status().isUnauthorized());
        attempt(EMAIL, "wrong", clientIp, "Browser-A").andExpect(status().isUnauthorized());
        attempt(EMAIL, "wrong", clientIp, "Browser-A").andExpect(status().isLocked());
    }

    private void assertLockResponse(int expectedSeconds) throws Exception {
        attempt(EMAIL, "wrong", clientIp, "Browser-A")
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_TEMP_LOCKED"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.matchesPattern(
                        "Too many unsuccessful login attempts\\. Try again in \\d{2}:\\d{2}\\.")))
                .andExpect(jsonPath("$.data.retryAt").isString())
                .andExpect(jsonPath("$.data.failedAttempts").doesNotExist());
        long seconds = java.time.Duration.between(LocalDateTime.now(), reload().getLockedUntil()).getSeconds();
        assertTrue(seconds >= expectedSeconds - 2 && seconds <= expectedSeconds,
                "expected approximately " + expectedSeconds + " seconds but got " + seconds);
    }

    private ResultActions attempt(String email, String password, String ip, String userAgent) throws Exception {
        return mockMvc.perform(post("/v1/auth/login")
                .header("X-Forwarded-For", ip)
                .header("User-Agent", userAgent)
                .contentType("application/json")
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"));
    }

    private JsonNode responseJson(ResultActions actions) throws Exception {
        return objectMapper.readTree(actions.andReturn().getResponse().getContentAsString());
    }

    private Set<String> fieldNames(JsonNode node) {
        Set<String> result = new TreeSet<>();
        if (node != null) node.fieldNames().forEachRemaining(result::add);
        return result;
    }

    private void awaitAsync(BooleanSupplier condition) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (!condition.getAsBoolean() && System.nanoTime() < deadline) {
            Thread.sleep(25);
        }
        assertTrue(condition.getAsBoolean(), "expected asynchronous security record was not persisted");
    }

    private User reload() {
        return userRepository.findByEmailAndDeletedFalse(EMAIL).orElseThrow();
    }

    private void expireLock() {
        User user = reload();
        user.setLockedUntil(LocalDateTime.now().minusSeconds(1));
        userRepository.save(user);
    }

    private String token(String email) {
        String role = userRepository.findByEmailWithRolesAndPermissions(email)
                .orElseThrow().getRoles().iterator().next().getName();
        UserDetails details = new org.springframework.security.core.userdetails.User(
                email, "unused", true, true, true, true,
                List.of(new SimpleGrantedAuthority("ROLE_" + role)));
        return jwtTokenProvider.generateAccessToken(details);
    }

    static class TestSeedHelper {
        private final UserRepository users;
        private final RoleRepository roles;
        private final PasswordEncoder encoder;

        TestSeedHelper(UserRepository users, RoleRepository roles, PasswordEncoder encoder) {
            this.users = users; this.roles = roles; this.encoder = encoder;
        }

        @Transactional
        public void resetAccount(String email, String password, String roleName) {
            Role role = ensureRole(roleName);
            User user = users.findByEmailAndDeletedFalse(email).orElseGet(() -> User.builder()
                    .firstName("Lock").lastName("Tester").email(email).department("IT")
                    .status(UserStatus.ACTIVE).roles(new HashSet<>(Set.of(role))).build());
            user.resetFailedAttempts();
            user.setPasswordHash(encoder.encode(password));
            users.save(user);
        }

        @Transactional
        public void seedUser(String email, String password, String roleName) {
            if (users.findByEmailAndDeletedFalse(email).isPresent()) return;
            Role role = ensureRole(roleName);
            users.save(User.builder().firstName("Admin").lastName("User").email(email)
                    .passwordHash(encoder.encode(password)).status(UserStatus.ACTIVE)
                    .roles(new HashSet<>(Set.of(role))).build());
        }

        private Role ensureRole(String name) {
            return roles.findByName(name).orElseGet(() -> roles.save(Role.builder()
                    .name(name).displayName(name).description("lockout test role").build()));
        }
    }

    @TestConfiguration
    static class SeedConfig {
        @Bean TestSeedHelper testSeedHelper(UserRepository users, RoleRepository roles, PasswordEncoder encoder) {
            return new TestSeedHelper(users, roles, encoder);
        }
    }
}
