package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.contracts.domain.Contract;
import com.photonicomega.facilities.module.contracts.domain.ContractClause;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.repository.ContractClauseRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Carries out an authorised deletion of a clause from the clause library.
 *
 * <p>Distinct from {@link ContractTerminateExecutor} even though both change what
 * a contract obliges. A termination announces itself: the contract's status says
 * the agreement is over. Removing a clause leaves the contract live and looking
 * untouched while quietly changing what it says, which is the more dangerous of
 * the two and the reason the outcome here names the owning contract and its
 * status rather than only the clause.
 *
 * <p>The clause is soft-deleted, following the convention the rest of this
 * codebase uses for records under governance. The clause text is the evidence of
 * what the contract said before this act, so a hard delete would leave the
 * approval record - and the audit entry that authorised it - pointing at a row
 * nobody can read.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class LegalClauseDeleteExecutor implements SensitiveActionExecutor {

    private final ContractClauseRepository contractClauseRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.LEGAL_CLAUSE_DELETE;
    }

    @Override
    public String execute(ApprovalRequest request) {
        UUID clauseId = UUID.fromString(request.getTargetId());
        ContractClause clause = contractClauseRepository.findById(clauseId)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "Clause " + clauseId + " no longer exists, so the approved deletion "
                                + "cannot be carried out."));

        if (clause.isDeleted()) {
            // Idempotent rather than an error: the outcome the approvers
            // authorised is already true.
            return "Clause '" + clause.getClauseType() + "' was already deleted on "
                    + clause.getDeletedAt() + " by " + clause.getDeletedBy() + ".";
        }

        // Worked out before the soft delete is written, so that what is reported is
        // the state the approvers were acting on.
        String dependants = describeDependants(clause);

        clause.softDelete(request.getRequestedByEmail());
        contractClauseRepository.save(clause);

        log.info("Contract clause {} ('{}') deleted under approval {} (requested by {})",
                clauseId, clause.getClauseType(), request.getId(), request.getRequestedByEmail());

        return "Clause '" + clause.getClauseType() + "' deleted under approval "
                + request.getId() + ". " + dependants;
    }

    /**
     * What depended on this clause, stated plainly in the outcome.
     *
     * <p>The enum gates this act because live contracts reference clauses, so an
     * outcome that reported only "clause deleted" would be the one piece of
     * information a reviewer cannot afford to be missing. Two facts are worth
     * more than the deletion itself: whether the contract carrying the clause is
     * still in force, and whether any clause of that kind is left on it - a
     * contract that has just lost its only Liability or Termination clause is a
     * different contract, and nothing else in the record would say so.
     */
    private String describeDependants(ContractClause clause) {
        Contract contract = clause.getContract();
        if (contract == null) {
            // The mapping makes contract_id non-nullable, so this is a data fault
            // rather than a normal case. Reported instead of thrown: the clause was
            // genuinely deleted, and failing the request here would leave the record
            // claiming nothing happened when something did.
            return "The clause was not attached to any contract, which is itself worth investigating.";
        }

        boolean live = contract.getStatus() == ContractStatus.ACTIVE
                || contract.getStatus() == ContractStatus.RENEWED;
        String clauseType = clause.getClauseType();
        long sameTypeRemaining = 0;

        List<ContractClause> siblings = contract.getClauses();
        if (siblings != null) {
            sameTypeRemaining = siblings.stream()
                    .filter(c -> c != null && !c.isDeleted())
                    // Excluded by id rather than by the deleted flag, because this
                    // runs before the soft delete is written and the target is still
                    // marked live in the collection it belongs to.
                    .filter(c -> !clause.getId().equals(c.getId()))
                    .filter(c -> clauseType != null && clauseType.equalsIgnoreCase(c.getClauseType()))
                    .count();
        }

        return "Contract " + contract.getContractNumber() + " ('" + contract.getTitle() + "', "
                + contract.getStatus() + ") referenced it and "
                + (live ? "is in force, so what that contract obliges has changed as of now"
                        : "is not in force")
                + (sameTypeRemaining == 0
                        ? "; it now carries no " + clauseType + " clause at all."
                        : "; " + sameTypeRemaining + " further " + clauseType + " clause(s) remain on it.");
    }
}
