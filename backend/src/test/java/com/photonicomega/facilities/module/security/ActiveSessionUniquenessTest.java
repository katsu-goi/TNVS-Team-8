package com.photonicomega.facilities.module.security;

import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.security.domain.ActiveSession;
import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.repository.ActiveSessionRepository;
import com.photonicomega.facilities.module.security.service.SecurityThreatMapService;
import com.photonicomega.facilities.module.security.service.UserActivityService;
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

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Proves that a user with two ACTIVE session rows can still use the application.
 *
 * <h3>The fault this was written to name</h3>
 * {@code POST /v1/auth/heartbeat} answered 500 every thirty seconds, for one signed-in
 * administrator, on a backend that was otherwise healthy - it was serving other routes,
 * broadcasting subsystem health and writing audit rows throughout. The server's own
 * explanation was {@code IncorrectResultSizeDataAccessException: Query did not return a
 * unique result: 2 results were returned}, raised from
 * {@code UserActivityService.upsert} through
 * {@code ActiveSessionRepository.findByUsernameAndStatus}.
 *
 * <p>That repository method returns {@link java.util.Optional}, which is a promise that
 * at most one row can match. Nothing keeps that promise. {@code ActiveSession} declares
 * {@code unique = true} on {@code sessionId} only, and every insert mints a fresh random
 * {@code sessionId}, so the one uniqueness constraint in the schema cannot constrain this
 * invariant. {@code upsert} then reads-then-inserts with no lock: two requests that both
 * find no ACTIVE row both create one.
 *
 * <p>The dev database showed exactly that. Two rows for the same account, login times
 * {@code 12:32:55.638} and {@code 12:32:55.662} - twenty-four milliseconds apart, a
 * login and a still-open tab's heartbeat racing after a logout had revoked the previous
 * row. The next heartbeat, at {@code 12:33:25.600}, threw.
 *
 * <p>Two properties of the failure are worth stating, because they are what make it
 * worse than a transient error:
 * <ul>
 *   <li><b>It latches.</b> The duplicate rows are persistent, so every subsequent
 *       heartbeat hits the same two rows and throws again. It cleared only when
 *       {@code reapStaleSessions} eventually expired them - up to five minutes of a
 *       signed-in user's session answering 500 on a fixed interval.</li>
 *   <li><b>It is not confined to the heartbeat.</b>
 *       {@code SecurityThreatMapService.buildTrustedSessionForLog} calls the same method,
 *       and already treats the result as a stream it takes the first element of - it
 *       wants a list, and the {@code Optional} return type is the only reason it can
 *       throw. Duplicate rows therefore also break the threat map's trusted-session
 *       marker on every successful login.</li>
 * </ul>
 *
 * <h3>What is asserted, and why the schema is not the place to assert it</h3>
 * The obvious fix is a unique constraint, and it does not fit: the invariant is "at most
 * one <em>ACTIVE</em> row per username", and the table deliberately keeps many EXPIRED
 * and REVOKED rows per username as session history (twenty-four of them in the dev
 * database). Expressing that needs a partial unique index, whose syntax differs between
 * the H2 the developer profile runs and the PostgreSQL the deployed profiles run, and
 * which {@code ddl-auto} will not create from the entity model on either. So the
 * invariant is enforced where it can be enforced identically on both: on read, by
 * collapsing duplicates the moment they are observed.
 *
 * <p>Hence the tests below assert both halves. Tolerating the duplicate is not enough -
 * a heartbeat that merely stopped throwing would leave the second row in place forever,
 * still ACTIVE, still counted among the online users. Healing it is the point.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ActiveSessionUniquenessTest {

    private static final String USER = "duplicate.session@test.local";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ActiveSessionRepository activeSessionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private UserActivityService userActivityService;

    @Autowired
    private SecurityThreatMapService securityThreatMapService;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private String userToken;

    @BeforeEach
    void seedUser() {
        if (userRepository.findByEmailAndDeletedFalse(USER).isEmpty()) {
            Role role = roleRepository.findByName("EMPLOYEE")
                    .orElseGet(() -> roleRepository.save(Role.builder()
                            .name("EMPLOYEE")
                            .displayName("employee")
                            .description("active session uniqueness test role")
                            .build()));
            userRepository.save(User.builder()
                    .firstName("Duplicate")
                    .lastName("Session")
                    .email(USER)
                    .department("IT")
                    .passwordHash("$2a$10$invalid-hash")
                    .status(UserStatus.ACTIVE)
                    .roles(Set.of(role))
                    .build());
        }
        userToken = token(USER);
    }

    // ------------------------------------------------------------------
    // The route that was returning 500
    // ------------------------------------------------------------------

    @Test
    @DisplayName("The heartbeat answers 200 for a user who already has two ACTIVE rows")
    void heartbeatDoesNotFailOnDuplicateActiveSessions() throws Exception {
        givenTwoActiveSessionsTwentyFourMillisecondsApart();

        mockMvc.perform(post("/v1/auth/heartbeat")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("The heartbeat leaves exactly one ACTIVE row behind, the most recent one")
    void heartbeatCollapsesDuplicatesToTheMostRecentSession() {
        String[] sessionIds = givenTwoActiveSessionsTwentyFourMillisecondsApart();
        String older = sessionIds[0];
        String newer = sessionIds[1];

        userActivityService.heartbeat(USER, "127.0.0.1", "Mozilla/5.0 Chrome/131.0");

        List<ActiveSession> active = activeOf(USER);
        assertThat(active)
                .as("a heartbeat that only stopped throwing would leave the duplicate ACTIVE "
                    + "forever, still counted among the online users")
                .hasSize(1);
        assertThat(active.get(0).getSessionId())
                .as("the surviving row must be the session the user is actually on - the most "
                    + "recently active one - not whichever row the database happened to return first")
                .isEqualTo(newer);

        assertThat(activeSessionRepository.findAll())
                .as("the loser is retired, not deleted: session history is what this table is for")
                .anySatisfy(session -> {
                    assertThat(session.getSessionId()).isEqualTo(older);
                    assertThat(session.getStatus()).isNotEqualTo("ACTIVE");
                });
    }

    @Test
    @DisplayName("A second heartbeat after the collapse is an ordinary update")
    void theCollapseIsStableAcrossRepeatedHeartbeats() {
        givenTwoActiveSessionsTwentyFourMillisecondsApart();

        userActivityService.heartbeat(USER, "127.0.0.1", "Mozilla/5.0 Chrome/131.0");
        userActivityService.heartbeat(USER, "127.0.0.1", "Mozilla/5.0 Chrome/131.0");
        userActivityService.heartbeat(USER, "127.0.0.1", "Mozilla/5.0 Chrome/131.0");

        assertThat(activeOf(USER))
                .as("collapsing must not itself create or retire rows once there is nothing "
                    + "left to collapse")
                .hasSize(1);
    }

    // ------------------------------------------------------------------
    // The second call site, which fails the same way
    // ------------------------------------------------------------------

    @Test
    @DisplayName("The threat map's trusted-session lookup survives duplicates too")
    void trustedSessionLookupDoesNotFailOnDuplicateActiveSessions() {
        givenTwoActiveSessionsTwentyFourMillisecondsApart();

        // Never persisted: buildTrustedSessionForLog reads the username and the IP, and
        // this test is about which rows that username matches.
        SecurityLog log = SecurityLog.builder()
                .username(USER)
                .ipAddress("203.0.113.7")
                .action("LOGIN_SUCCESS")
                .timestamp(Instant.now())
                .build();

        assertThatCode(() -> securityThreatMapService.buildTrustedSessionForLog(log))
                .as("this is reached on every successful login, and it reads the same rows the "
                    + "heartbeat does")
                .doesNotThrowAnyException();
    }

    // ------------------------------------------------------------------
    // The ordinary path, which must keep working
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Signing in twice reuses the one ACTIVE row rather than adding another")
    void repeatedSignInDoesNotAccumulateActiveRows() {
        User user = userRepository.findByEmailWithRolesAndPermissions(USER).orElseThrow();

        userActivityService.registerSession(user, "127.0.0.1", "Mozilla/5.0 Chrome/131.0");
        userActivityService.registerSession(user, "127.0.0.1", "Mozilla/5.0 Chrome/131.0");

        assertThat(activeOf(USER))
                .as("the upsert has always been meant to reuse; this is the behaviour the "
                    + "duplicate-tolerant read must not regress")
                .hasSize(1);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Recreates the two rows found in the dev database, including the ordering that
     * matters: the second row logged in twenty-four milliseconds after the first, so
     * "most recently active" and "inserted second" are the same row and the assertion
     * about which one survives is meaningful.
     *
     * @return the older session id, then the newer one
     */
    private String[] givenTwoActiveSessionsTwentyFourMillisecondsApart() {
        Instant first = Instant.now().minusSeconds(30);
        Instant second = first.plusMillis(24);
        ActiveSession older = activeSessionRepository.save(activeRow(first));
        ActiveSession newer = activeSessionRepository.save(activeRow(second));
        return new String[]{older.getSessionId(), newer.getSessionId()};
    }

    private ActiveSession activeRow(Instant at) {
        return ActiveSession.builder()
                .sessionId(UUID.randomUUID().toString())
                .userId(UUID.randomUUID().toString())
                .username(USER)
                .fullName("Duplicate Session")
                .role("EMPLOYEE")
                .ipAddress("127.0.0.1")
                .browser("Chrome")
                .deviceName("Desktop")
                .loginTime(at)
                .lastActivity(at)
                .status("ACTIVE")
                .build();
    }

    private List<ActiveSession> activeOf(String username) {
        return activeSessionRepository.findAll().stream()
                .filter(s -> username.equals(s.getUsername()))
                .filter(s -> "ACTIVE".equals(s.getStatus()))
                .toList();
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
