package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import com.photonicomega.facilities.module.procurement.domain.ObligationStatus;
import com.photonicomega.facilities.module.procurement.domain.Vendor;
import com.photonicomega.facilities.module.procurement.domain.VendorObligation;
import com.photonicomega.facilities.module.procurement.repository.VendorObligationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Carries out an authorised deletion of a tracked contractual obligation.
 *
 * <p>Distinct from moving the obligation to {@link ObligationStatus#COMPLETED},
 * which is the claim that the counterparty did what it promised. A deletion is
 * the claim that the company will stop asking. Those are opposite statements
 * about the same row, and they are exactly what the enum's rationale for gating
 * this act warns about: an unmonitored obligation and a met obligation read
 * identically in every later report. So the status is left precisely as it was
 * found and only the deleted flag moves - the record keeps saying the obligation
 * was still outstanding when somebody stopped watching it.
 *
 * <p>Distinct from {@link ContractTerminateExecutor} too, which ends the whole
 * agreement and deliberately leaves every obligation standing. This narrows what
 * is being monitored while the agreement carries on, so the outcome states what
 * the obligation was and when it was due rather than only that it is gone.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ObligationDeleteExecutor implements SensitiveActionExecutor {

    private final VendorObligationRepository vendorObligationRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.OBLIGATION_DELETE;
    }

    @Override
    public String execute(ApprovalRequest request) {
        UUID obligationId = UUID.fromString(request.getTargetId());
        VendorObligation obligation = vendorObligationRepository.findById(obligationId)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "Obligation " + obligationId + " no longer exists, so the approved deletion "
                                + "cannot be carried out."));

        if (obligation.isDeleted()) {
            // Idempotent rather than an error: the outcome the approvers
            // authorised is already true.
            return "Obligation '" + obligation.getTitle() + "' was already deleted on "
                    + obligation.getDeletedAt() + " by " + obligation.getDeletedBy() + ".";
        }

        // Captured before the write, because the whole point of the outcome string
        // is to say what was being monitored at the moment monitoring stopped.
        ObligationStatus statusAtDeletion = obligation.getStatus();
        Vendor vendor = obligation.getVendor();
        String vendorName = vendor == null ? "an unidentified counterparty" : vendor.getName();

        obligation.softDelete(request.getRequestedByEmail());
        vendorObligationRepository.save(obligation);

        log.info("Vendor obligation {} ('{}') deleted under approval {} (requested by {}); "
                        + "status at deletion was {}",
                obligationId, obligation.getTitle(), request.getId(),
                request.getRequestedByEmail(), statusAtDeletion);

        return "Obligation '" + obligation.getTitle() + "' for " + vendorName
                + " deleted under approval " + request.getId() + "; it stood at " + statusAtDeletion
                + (obligation.getDueDate() == null ? "" : ", due " + obligation.getDueDate())
                + ", and is no longer monitored.";
    }
}
