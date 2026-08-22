package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import com.photonicomega.facilities.module.security.domain.BlockedIp;
import com.photonicomega.facilities.module.security.repository.BlockedIpRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Lifts an authorised IP block.
 *
 * <p>Every other action in the catalogue is gated because it destroys something.
 * This one is gated because it <em>permits</em> something, which makes it the
 * odd one out and the easiest to under-rate. An IP block is the control that
 * stopped an attack; un-blocking is how the attacker who reached the console
 * restores their own access. Reviewing it costs a minute and being wrong about it
 * costs the incident.
 *
 * <p>The block row is kept and marked UNBLOCKED rather than deleted. The history
 * is the point: "this address was blocked for credential stuffing in March and
 * unblocked by X in April" is a sentence the security review needs to be able to
 * form, and a deleted row cannot say the first half of it.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class IpUnblockExecutor implements SensitiveActionExecutor {

    private final BlockedIpRepository blockedIpRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.IP_UNBLOCK;
    }

    @Override
    @Transactional
    public String execute(ApprovalRequest request) {
        String ipAddress = request.getTargetId();
        if (ipAddress == null || ipAddress.isBlank()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " names no IP address, so there is nothing to unblock.");
        }

        Optional<BlockedIp> blocked =
                blockedIpRepository.findByIpAddressAndStatus(ipAddress, "ACTIVE");

        if (blocked.isEmpty()) {
            // Blocks lapse on their own when expiresAt passes, so an approval raised
            // against a temporary block will frequently find it already gone. The
            // requested end state - traffic from this address is not blocked - holds.
            return "IP " + ipAddress + " was not actively blocked (block already expired or lifted); "
                    + "nothing to do.";
        }

        BlockedIp entry = blocked.get();
        entry.setStatus("UNBLOCKED");
        blockedIpRepository.save(entry);

        log.warn("Approval {} UNBLOCKED ip {} - originally blocked by {} at {} for: {}; "
                        + "requested by {}",
                request.getId(), ipAddress, entry.getBlockedBy(), entry.getBlockedAt(),
                entry.getReason(), request.getRequestedByEmail());

        return "Unblocked " + ipAddress + " (blocked " + entry.getBlockedAt() + " by "
                + entry.getBlockedBy() + " for: " + entry.getReason() + ").";
    }
}
