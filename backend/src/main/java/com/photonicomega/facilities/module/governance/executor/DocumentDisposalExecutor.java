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
 * Carries out an authorised document disposal.
 *
 * <p>This is the only place in the application a document is disposed of. It is
 * unreachable except through {@code ApprovalGateService.execute}, which is
 * unreachable without a quorum of distinct approvers.
 *
 * <p>Disposal is a soft delete that also flips status to {@code DELETED}. Records
 * governance wants the <em>fact</em> of the disposal to survive the record: a
 * hard delete would remove the only evidence that the company ever held the
 * document, which defeats the audit trail the approval was recorded in.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DocumentDisposalExecutor implements SensitiveActionExecutor {

    private final DocumentRepository documentRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.DOCUMENT_DISPOSE;
    }

    @Override
    public String execute(ApprovalRequest request) {
        UUID documentId = UUID.fromString(request.getTargetId());
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "Document " + documentId + " no longer exists, so the approved disposal "
                                + "cannot be carried out."));

        if (document.isDeleted()) {
            // Idempotent rather than an error: the outcome the approvers
            // authorised is already true.
            return "Document '" + document.getTitle() + "' was already disposed of on "
                    + document.getDeletedAt() + " by " + document.getDeletedBy() + ".";
        }

        document.setStatus(DocumentStatus.DELETED);
        document.softDelete(request.getRequestedByEmail());
        documentRepository.save(document);

        log.info("Document {} disposed of under approval {} (requested by {}, {} approval(s))",
                documentId, request.getId(), request.getRequestedByEmail(), request.getApprovalCount());

        return "Document '" + document.getTitle() + "' disposed of under approval "
                + request.getId() + ".";
    }
}
