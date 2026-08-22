package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.contracts.domain.Contract;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import com.photonicomega.facilities.module.procurement.domain.ObligationStatus;
import com.photonicomega.facilities.module.procurement.domain.VendorObligation;
import com.photonicomega.facilities.module.procurement.repository.VendorObligationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Carries out an authorised early termination of a live contract.
 *
 * <p>Distinct from a contract lapsing into {@link ContractStatus#EXPIRED}, which
 * is what happens on its own when the end date passes. Termination is a decision
 * somebody made and usually a penalty somebody paid; expiry is the absence of a
 * decision. Recording one as the other would hide the penalty and lose the fact
 * that a person chose to end the agreement - which is why an already-expired
 * contract is refused here rather than quietly overwritten.
 *
 * <p>Also distinct from {@link LegalClauseDeleteExecutor}: this ends the whole
 * agreement and says so on the contract's status, where removing a clause leaves
 * the contract live and looking untouched.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ContractTerminateExecutor implements SensitiveActionExecutor {

    private final ContractRepository contractRepository;
    private final VendorObligationRepository vendorObligationRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.CONTRACT_TERMINATE;
    }

    @Override
    public String execute(ApprovalRequest request) {
        UUID contractId = UUID.fromString(request.getTargetId());
        Contract contract = contractRepository.findById(contractId)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "Contract " + contractId + " no longer exists, so the approved termination "
                                + "cannot be carried out."));

        if (contract.getStatus() == ContractStatus.TERMINATED) {
            // Idempotent rather than an error: the outcome the approvers
            // authorised is already true.
            return "Contract " + contract.getContractNumber() + " ('" + contract.getTitle()
                    + "') was already terminated.";
        }

        if (contract.getStatus() == ContractStatus.EXPIRED) {
            // Not the act that was authorised. Two approvers signed off on ending a
            // live contract early; this one reached its end date on its own in the
            // meantime, and stamping TERMINATED over EXPIRED would destroy the only
            // evidence that it ran its full term.
            throw new BusinessRuleViolationException("Contract " + contract.getContractNumber()
                    + " has already expired"
                    + (contract.getEndDate() == null ? "" : " (end date " + contract.getEndDate() + ")")
                    + ", so there is no remaining term to terminate early.");
        }

        // Counted before the status changes so the number reported is what was
        // outstanding at the moment of termination, not afterwards.
        List<VendorObligation> outstanding = outstandingObligationsFor(contract);

        contract.setStatus(ContractStatus.TERMINATED);
        // endDate is deliberately left at the agreed date. It is the only field
        // that still records how much term was cut short, and comparing it against
        // the execution timestamp is how the penalty in the enum's rationale gets
        // checked later.
        contractRepository.save(contract);

        log.info("Contract {} ({}) terminated early under approval {} (requested by {}); "
                        + "{} outstanding obligation(s) left open",
                contractId, contract.getContractNumber(), request.getId(),
                request.getRequestedByEmail(), outstanding.size());

        return "Contract " + contract.getContractNumber() + " ('" + contract.getTitle()
                + "') terminated early under approval " + request.getId() + "."
                + (contract.getEndDate() == null ? ""
                        : " It was scheduled to run to " + contract.getEndDate() + ".")
                + " " + obligationNote(outstanding);
    }

    /**
     * Obligations still being monitored against this contract's counterparty.
     *
     * <p>Reached through the vendor because that is the only link the schema has:
     * {@code VendorObligation} hangs off {@code Vendor}, never off {@code Contract}.
     * That makes this an over-count when one vendor holds several contracts, and it
     * is reported as an over-count rather than narrowed by guesswork - an
     * over-count sends a human to look, an under-count tells them there is nothing
     * to look at.
     */
    private List<VendorObligation> outstandingObligationsFor(Contract contract) {
        if (contract.getVendorId() == null) {
            return List.of();
        }
        return vendorObligationRepository.findByVendorId(contract.getVendorId()).stream()
                .filter(o -> !o.isDeleted())
                .filter(o -> o.getStatus() != ObligationStatus.COMPLETED)
                .toList();
    }

    /**
     * Whether the counterparty still owes what it promised is a legal question
     * about the termination terms, not a consequence of a status change, so
     * nothing here touches the obligation rows. Closing them would turn an unmet
     * obligation into one that reads as met, and dropping them from the outcome
     * string would let a live commitment disappear along with the contract - so
     * they are counted into the record and handed back to a human.
     */
    private String obligationNote(List<VendorObligation> outstanding) {
        if (outstanding.isEmpty()) {
            return "No outstanding obligations are tracked against the counterparty.";
        }
        return outstanding.size() + " outstanding obligation(s) tracked against the counterparty "
                + "were left open, not closed; settle or reassign them separately.";
    }
}
