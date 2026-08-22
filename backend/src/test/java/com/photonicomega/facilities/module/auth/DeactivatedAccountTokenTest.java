package com.photonicomega.facilities.module.auth;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.dto.AuthTokenResponse;
import com.photonicomega.facilities.module.auth.dto.LoginRequest;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.auth.service.AuthService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Proves that deactivating an account actually ends its access.
 *
 * <p>Deactivation is one of the fifteen gated actions, and the whole point of
 * gating it is that two people agreed this person should no longer be able to use
 * the system. If the account can go on authenticating afterwards then the approval
 * bought nothing: the administrator sees INACTIVE in the console, the audit trail
 * records a properly authorised deactivation, and the person carries on working.
 * A control that reports success without taking effect is worse than no control,
 * because it stops anyone from looking for the real one.
 *
 * <p>The refresh endpoint is the interesting path, not login. Login checks
 * {@code isAccountActive} and refuses - that part was always right. Refresh takes a
 * token the holder already has and hands back a new access token plus a rotated
 * refresh token, which is a renewal that can be repeated forever. So an account
 * deactivated at 09:00 keeps working indefinitely as long as its client refreshes
 * every fifteen minutes, and never once needs to present a password.
 *
 * <p>Both assertions below matter. The first is the security property. The second
 * checks the token is also <em>invalidated</em> rather than merely refused this
 * once - if a rejected refresh token stays live, reactivating the account weeks
 * later silently revives every session that was open when it was closed. That
 * second assertion is what caught the first attempt at the fix: an inline
 * {@code token.revoke(); save();} before the throw is rolled back, because
 * {@code AuthService} is {@code @Transactional} at class level and
 * {@code AuthenticationException} is unchecked. Hence
 * {@code RefreshTokenRevoker}.
 *
 * <p><b>Do not add {@code @DirtiesContext} here.</b> The test profile pairs
 * {@code jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1} with {@code ddl-auto: create-drop},
 * so closing a context runs Hibernate's DROP phase against a database the other
 * cached contexts are still using. The next class to run then fails with
 * {@code Table "USERS" not found}, blaming itself for this class's cleanup. The
 * {@code @AfterEach} below restores the account status instead.
 */
@SpringBootTest
@ActiveProfiles("test")
class DeactivatedAccountTokenTest {

    private static final String EMAIL = "employee@photonicomega.com";
    private static final String PASSWORD = "Employee2026!";

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    private User target;
    private UserStatus originalStatus;

    @AfterEach
    void restoreAccountStatus() {
        if (target == null) {
            return;
        }
        target.setStatus(originalStatus);
        userRepository.save(target);
        target = null;
    }

    @Test
    @DisplayName("a deactivated account cannot refresh its way into a new access token")
    void deactivatedAccountCannotRefreshItsTokens() {
        // Log in while still active, exactly as the person would have done that
        // morning, and keep the refresh token their client would be holding.
        AuthTokenResponse session = authService.login(loginRequest(), "10.0.0.9", "junit");
        assertNotNull(session.getRefreshToken(), "precondition: login must issue a refresh token");
        String heldRefreshToken = session.getRefreshToken();

        // Now deactivate, as an approved USER_DEACTIVATE would.
        target = userRepository.findByEmailAndDeletedFalse(EMAIL)
                .orElseThrow(() -> new IllegalStateException(
                        "precondition failed: " + EMAIL + " was never seeded"));
        originalStatus = target.getStatus();
        target.setStatus(UserStatus.INACTIVE);
        userRepository.save(target);

        assertEquals(UserStatus.INACTIVE, userRepository.findByEmailAndDeletedFalse(EMAIL)
                        .orElseThrow().getStatus(),
                "precondition: the account must actually be INACTIVE before the real assertion");

        // The security property. If this passes, the refresh path is handing a
        // deactivated account a brand new 15-minute access token and a fresh refresh
        // token to do it again with - indefinitely, without a password.
        assertThrows(RuntimeException.class,
                () -> authService.refreshToken(heldRefreshToken, "10.0.0.9", "junit"),
                "a deactivated account must not be able to refresh into a new access token; "
                        + "refreshToken() checks the token's signature and expiry but never the "
                        + "account's status, so INACTIVE is enforced at login and nowhere else");

        // And the token must be dead, not merely refused once. A refusal that leaves
        // the token valid means reactivating the account later silently revives every
        // session that was open when it was closed.
        target.setStatus(originalStatus);
        userRepository.save(target);

        assertThrows(RuntimeException.class,
                () -> authService.refreshToken(heldRefreshToken, "10.0.0.9", "junit"),
                "the refresh token presented by a deactivated account must be revoked, not just "
                        + "rejected; otherwise reactivating the account brings every previously open "
                        + "session back to life");
    }

    @Test
    @DisplayName("an active account can still refresh - the guard must not break normal renewal")
    void activeAccountCanStillRefresh() {
        // The other half of the fix. A status check in the refresh path is only correct
        // if it leaves ordinary token renewal working; a guard that refuses everyone is
        // not a fix, and without this test the first one above would pass just as well
        // against a refreshToken() that always threw.
        AuthTokenResponse session = authService.login(loginRequest(), "10.0.0.9", "junit");

        AuthTokenResponse renewed =
                authService.refreshToken(session.getRefreshToken(), "10.0.0.9", "junit");

        assertNotNull(renewed.getAccessToken(), "an active account must still get a new access token");
        assertNotNull(renewed.getRefreshToken(), "and a rotated refresh token");
        assertTrue(renewed.getExpiresIn() > 0, "with a positive lifetime");
    }

    private LoginRequest loginRequest() {
        LoginRequest request = new LoginRequest();
        request.setEmail(EMAIL);
        request.setPassword(PASSWORD);
        return request;
    }
}
