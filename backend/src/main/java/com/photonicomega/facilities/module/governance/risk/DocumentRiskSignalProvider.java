package com.photonicomega.facilities.module.governance.risk;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.documents.domain.ClassificationLevel;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.RiskSignalProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Evidence about a document somebody is proposing to destroy.
 *
 * <p>All of these are lookups against data the system already holds, which is
 * the point: they are the questions an experienced records officer asks before
 * signing, and they are cheap and exact. A language model asked the same
 * questions would guess.
 */
@Component
@RequiredArgsConstructor
public class DocumentRiskSignalProvider implements RiskSignalProvider {

    /**
     * Words that, in a document title, mean destroying it may defeat a live
     * matter. Crude on purpose - a keyword hit is a CONCERN that a human reads,
     * not an automatic refusal, so a false positive costs one sentence of
     * reading and a false negative costs evidence.
     */
    private static final List<String> LITIGATION_HINTS = List.of(
            "litigation", "lawsuit", "subpoena", "dispute", "claim", "tribunal",
            "arbitration", "investigation", "audit", "regulator", "hold",
            "breach", "incident", "grievance");

    private final DocumentRepository documentRepository;

    @Override
    public boolean supports(SensitiveAction action, String targetType) {
        boolean documentAction = action == SensitiveAction.DOCUMENT_DISPOSE
                || action == SensitiveAction.DOCUMENT_DELETE
                || action == SensitiveAction.RETENTION_OVERRIDE
                || action == SensitiveAction.DOCUMENT_DECLASSIFY;
        return documentAction && "Document".equalsIgnoreCase(targetType);
    }

    @Override
    public List<Signal> gather(SensitiveAction action, String targetType, String targetId, User requester) {
        List<Signal> signals = new ArrayList<>();

        UUID id;
        try {
            id = UUID.fromString(targetId);
        } catch (IllegalArgumentException ex) {
            signals.add(Signal.note("Target id '" + targetId + "' is not a valid document id, "
                    + "so no automated check could run."));
            return signals;
        }

        Document document = documentRepository.findById(id).orElse(null);
        if (document == null) {
            signals.add(Signal.note("Document " + targetId + " no longer exists, "
                    + "so it could not be checked."));
            return signals;
        }

        checkRetentionWindow(action, document, signals);
        checkLitigationHint(document, signals);
        checkClassification(action, document, signals);
        checkRequesterIsOwner(document, requester, signals);
        checkAgeOfRecord(document, signals);

        return signals;
    }

    /**
     * The single most important check. Disposing of a document whose retention
     * window has not closed is the difference between routine records management
     * and a compliance breach.
     */
    private void checkRetentionWindow(SensitiveAction action, Document document, List<Signal> signals) {
        if (action == SensitiveAction.DOCUMENT_DECLASSIFY) {
            return;
        }
        LocalDateTime expiry = document.getRetentionExpiresAt();
        if (document.getRetentionPolicyId() == null || expiry == null) {
            signals.add(Signal.concern("No retention policy has been assigned to this document, so "
                    + "there is no evidence its retention window has closed. Assign a policy before "
                    + "disposing of it."));
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        if (expiry.isAfter(now)) {
            long days = Duration.between(now, expiry).toDays();
            signals.add(Signal.disqualifying("This document is still inside its retention window - "
                    + days + " day(s) remain (expires " + expiry.toLocalDate() + "). "
                    + "Disposing of it now is a retention breach."));
        } else {
            long days = Duration.between(expiry, now).toDays();
            signals.add(Signal.clear("Retention window closed " + days + " day(s) ago on "
                    + expiry.toLocalDate() + "; the document is eligible for disposal."));
        }
    }

    /**
     * A document that looks connected to a live matter should not be destroyed on
     * a records-schedule technicality.
     */
    private void checkLitigationHint(Document document, List<Signal> signals) {
        String haystack = (safe(document.getTitle()) + " " + safe(document.getAiPredictedCategory())
                + " " + safe(document.getAiSummary())).toLowerCase(Locale.ROOT);
        List<String> hits = LITIGATION_HINTS.stream().filter(haystack::contains).toList();
        if (!hits.isEmpty()) {
            signals.add(Signal.disqualifying("This document references " + String.join(", ", hits)
                    + ", which suggests it may be subject to a legal hold. Confirm with Legal that "
                    + "no matter depends on it before authorising."));
        } else {
            signals.add(Signal.clear("No litigation or investigation keywords found in the title, "
                    + "category, or summary."));
        }
    }

    private void checkClassification(SensitiveAction action, Document document, List<Signal> signals) {
        ClassificationLevel level = document.getClassificationLevel();
        if (level == null) {
            signals.add(Signal.note("The document has no classification level set."));
            return;
        }
        boolean sensitive = level != ClassificationLevel.PUBLIC && level != ClassificationLevel.INTERNAL;
        if (action == SensitiveAction.DOCUMENT_DECLASSIFY && sensitive) {
            signals.add(Signal.concern("This document is classified " + level
                    + ". Lowering it widens who can read it, and that cannot be undone once read."));
        } else if (sensitive) {
            signals.add(Signal.concern("This document is classified " + level
                    + ", so its destruction should be recorded against a named authority."));
        } else {
            signals.add(Signal.clear("Classification is " + level + "."));
        }
    }

    /**
     * Someone deleting their own document is the ordinary case, but it is also
     * what covering a mistake looks like. Worth one line in front of the
     * approver, and nothing more.
     */
    private void checkRequesterIsOwner(Document document, User requester, List<Signal> signals) {
        if (requester == null) {
            return;
        }
        String owner = document.getOwnerEmail() != null ? document.getOwnerEmail() : document.getCreatedBy();
        if (owner != null && owner.equalsIgnoreCase(requester.getEmail())) {
            signals.add(Signal.note("The requester is the document's own author or owner ("
                    + owner + "), so this is a self-interested deletion."));
        }
    }

    private void checkAgeOfRecord(Document document, List<Signal> signals) {
        if (document.getCreatedAt() == null) {
            return;
        }
        long days = Duration.between(document.getCreatedAt(), LocalDateTime.now()).toDays();
        if (days < 30) {
            signals.add(Signal.concern("This document is only " + days + " day(s) old. "
                    + "Destroying a very recent record is unusual for routine records management."));
        }
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
