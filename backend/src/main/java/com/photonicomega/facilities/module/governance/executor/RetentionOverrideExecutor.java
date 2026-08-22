package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import com.photonicomega.facilities.module.records.domain.RetentionPolicy;
import com.photonicomega.facilities.module.records.repository.RetentionPolicyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Carries out an authorised override of one document's retention window, closing
 * the window as of now so the remainder of the schedule is waived.
 *
 * <p>Distinct from {@link DocumentDisposalExecutor} and
 * {@link DocumentDeleteExecutor} because it destroys nothing. It only removes the
 * schedule's objection to a later destruction, and that separation is most of the
 * value of gating it: the waiver takes two independent records authorities, while
 * the disposal that usually follows takes one, and the disposal still has to be
 * requested and authorised in its own right. Collapsing the two would let a
 * single signature both open the window and empty it.
 *
 * <p>The override is written to the document's own {@code retentionExpiresAt} and
 * never to the {@link RetentionPolicy} row behind it. A policy is shared by every
 * document whose category matches its name, so shortening the policy to release
 * one record would quietly release all of them; and policy periods are already
 * editable through the ordinary records screens, which is further evidence that
 * this gated act is about a single record's window rather than the schedule.
 *
 * <p>Nothing about the prior window is erased. {@code retentionPolicyId} is left
 * in place, so the schedule the document was held under is still on the record
 * and the original period is still readable from it, and the exact date the
 * window would have closed is named in the returned outcome - which the gate
 * writes into a CRITICAL audit entry together with the e-mail addresses of the
 * approvers who authorised it.
 *
 * <p>The window is closed as of now rather than moved to some other proposed
 * date: nothing in the application writes or validates a shape for a date on
 * {@code payloadJson}, and "closed now" is the one outcome an approver can judge
 * exactly, because it is the whole difference between this record being
 * disposable today or not.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RetentionOverrideExecutor implements SensitiveActionExecutor {

    private final DocumentRepository documentRepository;
    private final RetentionPolicyRepository retentionPolicyRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.RETENTION_OVERRIDE;
    }

    @Override
    public String execute(ApprovalRequest request) {
        // Of the gated records actions this is the only one whose name reads as
        // though it could be aimed at either a document or a policy row, so the
        // target type is checked instead of assumed. A RetentionPolicy id is a
        // UUID too, and would otherwise be reported back as a document that has
        // vanished - which would send the records officer looking for a deletion
        // that never happened.
        String targetType = request.getTargetType();
        if (targetType != null && !targetType.isBlank()
                && !"Document".equalsIgnoreCase(targetType.trim())) {
            throw new BusinessRuleViolationException(
                    "A retention override applies to a single document's retention window, but this "
                            + "request targets a " + targetType.trim() + ". Raise it against the "
                            + "document whose window is to be shortened.");
        }

        UUID documentId = UUID.fromString(request.getTargetId());
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "Document " + documentId + " no longer exists, so the approved retention "
                                + "override cannot be carried out."));

        LocalDateTime previousExpiry = document.getRetentionExpiresAt();
        if (previousExpiry == null) {
            // There is no window to shorten, so the state the approvers
            // authorised - this record not held by a retention schedule - is
            // already the state of the record. Reported rather than failed, and
            // the document is left untouched so the nightly retention job can
            // still assign it a schedule if one turns out to apply.
            return "Document '" + document.getTitle() + "' carries no retention expiry date, so there "
                    + "was no window to shorten and nothing was changed.";
        }

        LocalDateTime now = LocalDateTime.now();
        if (!previousExpiry.isAfter(now)) {
            // Already closed, whether by the passage of time or by an earlier
            // override. Re-running lands here and changes nothing, which is the
            // point: an executor whose effect is already present is harmless.
            return "The retention window for '" + document.getTitle() + "' had already closed on "
                    + previousExpiry + ", so there was nothing left to waive.";
        }

        long daysWaived = Duration.between(now, previousExpiry).toDays();
        document.setRetentionExpiresAt(now);
        documentRepository.save(document);

        log.info("Retention window for document {} shortened from {} to {} under approval {} "
                        + "(requested by {}, {} approval(s)); {} day(s) waived, policy {} left unchanged",
                documentId, previousExpiry, now, request.getId(), request.getRequestedByEmail(),
                request.getApprovalCount(), daysWaived, document.getRetentionPolicyId());

        return "Retention window for '" + document.getTitle() + "' closed as of " + now
                + " under approval " + request.getId() + ", waiving the " + daysWaived
                + " day(s) that remained of " + policyDescription(document)
                + "; it would have closed on " + previousExpiry
                + ". The document itself is untouched - disposing of it still needs its own approval.";
    }

    /**
     * Names the schedule being overridden, where it can still be resolved. Falls
     * back to the bare id rather than omitting it: an auditor reading "waived 412
     * days" has to be able to see which schedule those days came from, and the
     * policy may have been renamed or removed in the meantime.
     */
    private String policyDescription(Document document) {
        UUID policyId = document.getRetentionPolicyId();
        if (policyId == null) {
            // An expiry date with no policy id behind it: the window was set
            // outside the retention job, so there is no schedule to name.
            return "an unscheduled retention window";
        }
        return retentionPolicyRepository.findById(policyId)
                .map(policy -> "retention policy '" + policy.getName() + "' ("
                        + policy.getRetentionPeriodDays() + " day(s))")
                .orElse("retention policy " + policyId + ", which no longer exists");
    }
}
