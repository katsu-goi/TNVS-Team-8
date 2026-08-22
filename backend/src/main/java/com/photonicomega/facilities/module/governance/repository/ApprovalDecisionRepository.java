package com.photonicomega.facilities.module.governance.repository;

import com.photonicomega.facilities.module.governance.domain.ApprovalDecision;
import com.photonicomega.facilities.module.governance.domain.DecisionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ApprovalDecisionRepository extends JpaRepository<ApprovalDecision, UUID> {

    List<ApprovalDecision> findByRequestIdOrderByDecidedAtAsc(UUID requestId);

    boolean existsByRequestIdAndDecidedById(UUID requestId, UUID decidedById);

    /**
     * Counted rather than trusting a stored counter. The quorum check reads this,
     * so the number of approvals can never drift from the number of approvers on
     * record - a stored count that got incremented twice would otherwise be
     * indistinguishable from two genuine signatures.
     */
    long countByRequestIdAndDecision(UUID requestId, DecisionType decision);
}
