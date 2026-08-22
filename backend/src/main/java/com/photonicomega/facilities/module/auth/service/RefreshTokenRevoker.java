package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.module.auth.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Revokes a refresh token in a transaction of its own.
 *
 * <p>Exists for the same reason as {@code ApprovalStateWriter}, in the same shape.
 * {@link AuthService#refreshToken} has to both <em>revoke</em> the token it is
 * refusing and <em>reject</em> the call presenting it. Doing that with a plain save
 * followed by a throw does not work: {@code AuthService} is annotated
 * {@code @Transactional} at class level and {@code AuthenticationException} is
 * unchecked, so Spring rolls the transaction back and takes the revocation with it.
 * The caller is told the token was rejected while the database still says it is
 * live.
 *
 * <p>That failure mode is quiet and specific. A deactivated account's refresh token
 * would be refused every time it was presented - so the security property looks
 * satisfied - but the row would stay unrevoked, and reactivating the account weeks
 * later would bring every session that was open when it was closed straight back to
 * life. Nobody would connect the two events.
 *
 * <p>It is a separate bean rather than a {@code REQUIRES_NEW} method on
 * {@code AuthService} because Spring applies transaction advice through a proxy: a
 * self-call inside the same bean bypasses the proxy, silently joins the doomed
 * transaction, and is rolled back exactly like the code it was meant to replace.
 *
 * <p>The row is reloaded inside the new transaction rather than reusing the caller's
 * instance, which belongs to the outer, about-to-be-discarded persistence context.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RefreshTokenRevoker {

    private final RefreshTokenRepository refreshTokenRepository;

    /**
     * Revoke one refresh token so the revocation survives the caller's rollback.
     *
     * <p>Silent when the token is already gone or already revoked: this is called
     * on the way to throwing, and a second failure here would replace a clean
     * "invalid token" with an unrelated 500.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void revokeInOwnTransaction(UUID tokenId) {
        if (tokenId == null) {
            return;
        }
        refreshTokenRepository.findById(tokenId)
                .filter(token -> !token.isRevoked())
                .ifPresent(token -> {
                    token.revoke();
                    refreshTokenRepository.save(token);
                    log.debug("Refresh token {} revoked in its own transaction", tokenId);
                });
    }
}
