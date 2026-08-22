package com.photonicomega.facilities.module.governance.service;

import com.photonicomega.facilities.module.governance.domain.ApprovalStatus;
import com.photonicomega.facilities.module.governance.repository.ApprovalRequestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Writes terminal approval states in a transaction of their own.
 *
 * <p>This class exists for one reason. {@link ApprovalGateService} repeatedly
 * has to both <em>record</em> that something went wrong and <em>reject</em> the
 * call that discovered it. Doing that with an ordinary save followed by a throw
 * does not work: {@code BusinessRuleViolationException} is unchecked, so Spring
 * rolls the enclosing transaction back and takes the status write with it. The
 * caller is told the act failed while the database still says:
 *
 * <ul>
 *   <li>{@code APPROVED} with a null execution error - so a destructive act that
 *       failed halfway can be run again with no fresh authorisation; or</li>
 *   <li>{@code PENDING} after its window closed - which, because the gate allows
 *       only one open request per act per target, permanently blocks anyone from
 *       ever requesting that act on that target again.</li>
 * </ul>
 *
 * <p>It is a separate bean rather than a {@code REQUIRES_NEW} method on the gate
 * itself because Spring applies transaction advice through a proxy: a self-call
 * inside the same bean bypasses the proxy entirely, silently joins the doomed
 * transaction, and is rolled back exactly like the code it was meant to replace.
 * That version looks correct in review and fixes nothing, which is worse than
 * the original bug.
 *
 * <p>Each method reloads the row inside the new transaction rather than reusing
 * the caller's instance, which belongs to the outer (about to be discarded)
 * persistence context, and each guards on the state it expects so a concurrent
 * writer that already resolved the request wins instead of being clobbered.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ApprovalStateWriter {

    private final ApprovalRequestRepository requestRepository;

    /**
     * Lapse a request whose approval window closed. Only a PENDING request can
     * lapse; if a decision landed first, that decision is the truthful state.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markExpired(UUID requestId) {
        requestRepository.findById(requestId)
                .filter(r -> r.getStatus() == ApprovalStatus.PENDING)
                .ifPresent(r -> {
                    r.setStatus(ApprovalStatus.EXPIRED);
                    requestRepository.save(r);
                    log.info("Approval request {} passed its window at {} and was marked EXPIRED",
                            requestId, r.getExpiresAt());
                });
    }

    /**
     * Record that an authorised act could not be carried out, so it is not left
     * sitting in APPROVED where it would look ready to run a second time.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(UUID requestId, String error) {
        requestRepository.findById(requestId)
                .filter(r -> r.getStatus() == ApprovalStatus.APPROVED)
                .ifPresent(r -> {
                    r.setStatus(ApprovalStatus.FAILED);
                    r.setExecutionError(error == null || error.isBlank()
                            ? "Execution failed without an error message." : error);
                    requestRepository.save(r);
                    log.warn("Approval request {} moved to FAILED: {}", requestId, error);
                });
    }
}
