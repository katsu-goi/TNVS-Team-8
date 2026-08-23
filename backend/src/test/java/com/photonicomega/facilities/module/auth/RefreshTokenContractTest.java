package com.photonicomega.facilities.module.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pins the contract that lets an expired access token be replaced without signing in again.
 *
 * <h3>Why this exists</h3>
 * {@code jwt.access-token-expiration} is fifteen minutes and
 * {@code jwt.refresh-token-expiration} is seven days, so the intended behaviour is
 * plainly that a session outlives the access token. The frontend did not implement the
 * other half. Its one response interceptor treated <em>any</em> 401 as the end of the
 * session: it deleted {@code accessToken} <em>and</em> {@code refreshToken} from
 * localStorage and hard-navigated to {@code /login}. {@code authService.refreshToken()}
 * was written, exported, and called from nowhere in the application.
 *
 * <p>The effect is that every signed-in user is thrown back to the login screen roughly
 * fifteen minutes after signing in, on whichever background poll happens to be the first
 * request after the token lapses - and the seven-day refresh token is discarded in the
 * same breath, so nothing can recover it. It was observed exactly that way during
 * verification: a routine {@code POST /v1/admin/backups} answered 401 and the browser
 * was at {@code /login} with an empty localStorage a moment later, mid-task.
 *
 * <p>That matters more here than in an ordinary application because of what this system
 * asks people to do. Every gated destructive action requires a written justification of
 * at least ten characters before it can even be raised. Ejecting the author of that
 * sentence to a login screen discards the sentence, and the approval request is never
 * raised. The control does not fail loudly; the work just disappears.
 *
 * <h3>What is asserted</h3>
 * Only the server side, because that is the side that can be tested here - the repository
 * has no frontend test tooling, so the interceptor change is verified in the browser
 * instead. These assertions are the contract the interceptor is being written against:
 * a refresh token from a login is exchangeable for an access token that a protected route
 * accepts, and a refresh call cannot be used to launder a bad or an access-typed token
 * into a valid session. If any of that were untrue, retrying on 401 would be an infinite
 * loop rather than a fix.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RefreshTokenContractTest {

    private static final String USER = "refresh.contract@test.local";
    private static final String PASSWORD = "RefreshContract2026!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void seedUser() {
        if (userRepository.findByEmailAndDeletedFalse(USER).isEmpty()) {
            Role role = roleRepository.findByName("EMPLOYEE")
                    .orElseGet(() -> roleRepository.save(Role.builder()
                            .name("EMPLOYEE")
                            .displayName("employee")
                            .description("refresh token contract test role")
                            .build()));
            userRepository.save(User.builder()
                    .firstName("Refresh")
                    .lastName("Contract")
                    .email(USER)
                    .department("IT")
                    .passwordHash(passwordEncoder.encode(PASSWORD))
                    .status(UserStatus.ACTIVE)
                    // A mutable set, deliberately. `Set.of(role)` is immutable, and because
                    // this test shares a persistence context with the request it drives,
                    // Hibernate hands that very instance back to `AuthService.login`, which
                    // updates the last-login fields and saves - at which point wrapping the
                    // immutable set throws UnsupportedOperationException and login answers
                    // 500. That is a fault in the seeding, not in the route, and it is easy
                    // to mistake for one: the stack trace names `userRepository.save`.
                    .roles(new HashSet<>(Set.of(role)))
                    .build());
        }
    }

    @Test
    @DisplayName("A refresh token from login buys a new access token")
    void refreshTokenIsExchangeableForAnAccessToken() throws Exception {
        Map<String, Object> login = login();
        String refreshToken = (String) login.get("refreshToken");
        assertThat(refreshToken)
                .as("login has to hand out the refresh token, or there is nothing to retry with")
                .isNotBlank();

        Map<String, Object> refreshed = refresh(refreshToken, status().isOk());

        assertThat((String) refreshed.get("accessToken"))
                .as("the point of the exchange is a usable access token")
                .isNotBlank();
        assertThat((String) refreshed.get("accessToken"))
                .as("a refresh that returned the same string would leave the caller in the "
                    + "same 401 it was trying to escape, and the interceptor would retry forever")
                .isNotEqualTo((String) login.get("accessToken"));
    }

    @Test
    @DisplayName("The refreshed access token is accepted by a protected route")
    void refreshedAccessTokenAuthenticatesAProtectedRoute() throws Exception {
        String refreshToken = (String) login().get("refreshToken");
        String newAccessToken = (String) refresh(refreshToken, status().isOk()).get("accessToken");

        // The heartbeat is the honest choice: it is the poll that runs on a timer for
        // every signed-in user, so it is the request most likely to be the one that
        // discovers the access token has lapsed and gets retried.
        mockMvc.perform(post("/v1/auth/heartbeat")
                        .header("Authorization", "Bearer " + newAccessToken))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("A garbage refresh token is refused, so the retry gives up instead of looping")
    void garbageRefreshTokenIsRefused() throws Exception {
        mockMvc.perform(post("/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"not-a-jwt\"}"))
                .andExpect(result -> assertThat(result.getResponse().getStatus())
                        .as("the interceptor treats any non-2xx here as 'the session really is "
                            + "over' and signs the user out, so this must not be a 2xx")
                        .isGreaterThanOrEqualTo(400)
                        .isLessThan(500));
    }

    @Test
    @DisplayName("An access token cannot be presented as a refresh token")
    void accessTokenIsNotAcceptedAsARefreshToken() throws Exception {
        String accessToken = (String) login().get("accessToken");

        mockMvc.perform(post("/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("refreshToken", accessToken))))
                .andExpect(result -> assertThat(result.getResponse().getStatus())
                        .as("the two token types have different lifetimes for a reason; honouring "
                            + "an access token here would silently give it the refresh token's "
                            + "seven days")
                        .isGreaterThanOrEqualTo(400)
                        .isLessThan(500));
    }

    @Test
    @DisplayName("A protected route still refuses a request with no token at all")
    void protectedRouteStillRejectsAnUnauthenticatedRequest() throws Exception {
        // The guard on the fix: retry-on-401 must not become retry-forever for a caller
        // that never had a session. This is the 401 the interceptor is still supposed to
        // turn into a sign-out.
        mockMvc.perform(get("/v1/admin/analytics"))
                .andExpect(result -> assertThat(result.getResponse().getStatus())
                        .isIn(401, 403));
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private Map<String, Object> login() throws Exception {
        MvcResult result = mockMvc.perform(post("/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("email", USER, "password", PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();
        return dataOf(result);
    }

    private Map<String, Object> refresh(String refreshToken,
                                        org.springframework.test.web.servlet.ResultMatcher expected)
            throws Exception {
        MvcResult result = mockMvc.perform(post("/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("refreshToken", refreshToken))))
                .andExpect(expected)
                .andReturn();
        return dataOf(result);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataOf(MvcResult result) throws Exception {
        Map<String, Object> body = objectMapper.readValue(
                result.getResponse().getContentAsString(), Map.class);
        return (Map<String, Object>) body.get("data");
    }
}
