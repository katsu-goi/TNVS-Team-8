package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import com.photonicomega.facilities.module.security.domain.ActiveSession;
import com.photonicomega.facilities.module.security.repository.ActiveSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Terminates one authorised active session.
 *
 * <p>The cheapest action in the catalogue, and deliberately so. Kicking a session
 * during an incident is a legitimate reflex and the cost of being wrong is that
 * somebody logs in again. It is gated only so that the act is <em>recorded</em> -
 * a session that vanishes with no attribution looks identical to one an attacker
 * hijacked, and the difference matters during the review afterwards.
 *
 * <p>Targets the session's {@code sessionId}, not its row id. That is what the
 * security console shows and what an operator reading an alert has in front of
 * them, so it is what they can act on without a lookup step in between.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SessionRevokeExecutor implements SensitiveActionExecutor {

    private final ActiveSessionRepository activeSessionRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.SESSION_REVOKE;
    }

    @Override
    @Transactional
    public String execute(ApprovalRequest request) {
        String sessionId = request.getTargetId();
        if (sessionId == null || sessionId.isBlank()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " names no session, so there is nothing to revoke.");
        }

        Optional<ActiveSession> active =
                activeSessionRepository.findBySessionIdAndStatus(sessionId, "ACTIVE");

        if (active.isEmpty()) {
            // The common case, and not a failure: sessions expire on their own, and
            // an approval that took a few minutes to collect its signature will often
            // outlive the session it was raised against. The intended end state - that
            // session no longer active - holds either way.
            return "Session " + sessionId + " was no longer active (already revoked, expired, or "
                    + "logged out); nothing to do.";
        }

        ActiveSession session = active.get();
        session.setStatus("REVOKED");
        activeSessionRepository.save(session);

        log.info("Approval {} revoked session {} belonging to {} from {}; requested by {}",
                request.getId(), sessionId, session.getUsername(), session.getIpAddress(),
                request.getRequestedByEmail());

        return "Revoked session " + sessionId + " for " + session.getUsername()
                + " (" + session.getIpAddress() + ").";
    }
}
