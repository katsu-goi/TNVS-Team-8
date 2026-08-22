package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Carries out an authorised deletion of a document outside the retention
 * schedule.
 *
 * <p>Distinct from {@link DocumentDisposalExecutor} even though the mechanics are
 * similar, because the two acts mean different things in the record: a disposal
 * is a scheduled records event at end of retention, whereas a deletion is an
 * exception to the schedule. Collapsing them would make an out-of-schedule
 * deletion indistinguishable from routine housekeeping in every later report.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DocumentDeleteExecutor implements SensitiveActionExecutor {

    private final DocumentRepository documentRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.DOCUMENT_DELETE;
    }

    @Override
    public String execute(ApprovalRequest request) {
        UUID documentId = UUID.fromString(request.getTargetId());
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "Document " + documentId + " no longer exists, so the approved deletion "
                                + "cannot be carried out."));

        if (document.isDeleted()) {
            return "Document '" + document.getTitle() + "' was already deleted on "
                    + document.getDeletedAt() + " by " + document.getDeletedBy() + ".";
        }

        document.setStatus(DocumentStatus.DELETED);
        document.softDelete(request.getRequestedByEmail());
        documentRepository.save(document);

        log.info("Document {} deleted out-of-schedule under approval {} (requested by {})",
                documentId, request.getId(), request.getRequestedByEmail());

        return "Document '" + document.getTitle() + "' deleted outside the retention schedule under "
                + "approval " + request.getId() + ".";
    }
}
