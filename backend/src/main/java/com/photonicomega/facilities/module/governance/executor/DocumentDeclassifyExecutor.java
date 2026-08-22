package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.documents.domain.ClassificationLevel;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Carries out an authorised declassification, lowering a document exactly one
 * step down the classification ladder.
 *
 * <p>Distinct from {@link RetentionOverrideExecutor}, the other gated act that
 * loosens a control without destroying anything: an override changes how long the
 * company must keep a record, this changes who may look at it. The two fail in
 * opposite directions - keeping a record too briefly is a compliance breach,
 * showing it too widely is a disclosure - so they are authorised separately and
 * recorded separately, and neither is a substitute for the other.
 *
 * <p>The step is deliberately one level rather than a level named by the
 * requester. A single signature that could carry a document from SECRET straight
 * to PUBLIC would make the ladder decorative; one rung per authorisation means
 * every widening of the audience is judged on its own terms.
 * {@code ApprovalRequest.payloadJson} can carry a requested target level, but
 * nothing in the application writes or validates a shape for it, so it is not
 * read here - a free-form blob deciding how far a document is declassified is a
 * guess dressed up as an instruction. The outcome below names both levels, so an
 * approver who intended a larger reduction can see that only one rung was taken
 * and authorise the next.
 *
 * <p>The previous level is not destroyed. {@link Document} has no column for a
 * prior classification, and adding one would still not say who authorised the
 * change, so the old level is named in the returned outcome, which the gate
 * writes into a CRITICAL audit entry alongside the approvers who signed for it -
 * and the approval request itself survives as the record of the act.
 *
 * <p>Note what this does <em>not</em> do: no read is refused on classification
 * alone in this application today, so the level is a handling instruction to the
 * people holding the document and an input to the approval risk signals, not a
 * technical barrier. Raising it back afterwards therefore repairs nothing -
 * whoever acted on the lower marking has already read the document, which is the
 * irreversibility this act is gated for.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DocumentDeclassifyExecutor implements SensitiveActionExecutor {

    private final DocumentRepository documentRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.DOCUMENT_DECLASSIFY;
    }

    @Override
    public String execute(ApprovalRequest request) {
        UUID documentId = UUID.fromString(request.getTargetId());
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "Document " + documentId + " no longer exists, so the approved "
                                + "declassification cannot be carried out."));

        ClassificationLevel current = document.getClassificationLevel();
        if (current == null) {
            // Defensive: the column is non-null, so an unclassified row got in
            // around the mapping. Refused rather than guessed at - "one step
            // down" has no meaning without a level to descend from, and choosing
            // a starting point here would be this executor inventing a
            // classification nobody authorised.
            throw new BusinessRuleViolationException("Document '" + document.getTitle()
                    + "' has no classification level recorded, so there is nothing to lower. "
                    + "Classify it first, then request the declassification.");
        }

        ClassificationLevel lowered = oneStepDown(current);
        if (lowered == current) {
            // Already at the widest marking, so the outcome the approvers
            // authorised is present and there is nothing to write. Reported
            // rather than failed, and re-running is harmless by construction
            // because the floor never steps any further.
            return "Document '" + document.getTitle() + "' is already classified " + current
                    + ", the lowest level there is, so its classification was left as it stands.";
        }

        document.setClassificationLevel(lowered);
        documentRepository.save(document);

        log.info("Document {} declassified from {} to {} under approval {} (requested by {})",
                documentId, current, lowered, request.getId(), request.getRequestedByEmail());

        return "Document '" + document.getTitle() + "' declassified from " + current + " to "
                + lowered + " under approval " + request.getId()
                + ". One level only - a further reduction needs a fresh approval.";
    }

    /**
     * One rung down the ladder.
     *
     * <p>Mapped explicitly rather than by ordinal arithmetic on
     * {@link ClassificationLevel}, which carries no ordering of its own. Reading
     * the order out of the declaration would mean that inserting or reordering a
     * constant silently redefines what every declassification does, and the first
     * evidence of it would be a document sitting a level lower than anyone
     * approved. PUBLIC maps to itself: it is the floor, and the caller reports
     * that as nothing to do instead of an error.
     */
    private static ClassificationLevel oneStepDown(ClassificationLevel level) {
        return switch (level) {
            case SECRET -> ClassificationLevel.RESTRICTED;
            case RESTRICTED -> ClassificationLevel.CONFIDENTIAL;
            case CONFIDENTIAL -> ClassificationLevel.INTERNAL;
            case INTERNAL -> ClassificationLevel.PUBLIC;
            case PUBLIC -> ClassificationLevel.PUBLIC;
        };
    }
}
