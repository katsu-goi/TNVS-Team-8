package com.photonicomega.facilities.module.visitor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.service.AuditService;
import com.photonicomega.facilities.module.employee.domain.EmployeeNotification;
import com.photonicomega.facilities.module.employee.domain.NotificationType;
import com.photonicomega.facilities.module.employee.repository.EmployeeNotificationRepository;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityAlert;
import com.photonicomega.facilities.module.security.repository.SecurityAlertRepository;
import com.photonicomega.facilities.module.visitor.domain.*;
import com.photonicomega.facilities.module.visitor.repository.VisitorRepository;
import com.photonicomega.facilities.module.visitor.repository.VisitorVerificationRepository;
import com.photonicomega.facilities.module.visitor.repository.VisitorWatchlistRepository;
import com.photonicomega.facilities.notification.RealtimeNotificationPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Visitor identity verification: heuristic ID parsing plus a screen against the
 * visitor watchlist.
 *
 * <p>Deliberately dependency-free. There is no OCR engine and no external
 * identity provider - the "parse" is a normalisation plus a format check, and
 * the "match" is a normalised comparison against {@link VisitorWatchlist}. That
 * makes every result deterministic and reproducible for the demo, and leaves a
 * clean seam where a real OCR/KYC provider can be dropped in later.
 *
 * <p>Every attempt is persisted as a new {@link VisitorVerification} row; rows
 * are never mutated, so the lobby keeps a full screening history.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class VisitorVerificationService {

    private static final String MODULE = "VISITOR";

    /**
     * Philippine driver's licence: one letter then 9-10 digits once the dashes
     * are stripped. Both lengths are accepted - the licence has been issued as
     * {@code N##-#######} and as {@code N##-##-######}.
     */
    private static final Pattern DRIVERS_LICENSE = Pattern.compile("^[A-Z]\\d{9,10}$");

    /** Everything else: alphanumeric, at least 6 characters. */
    private static final Pattern GENERIC_ID = Pattern.compile("^[A-Z0-9]{6,}$");

    private static final BigDecimal SCORE_ID_MATCH = new BigDecimal("0.99");
    private static final BigDecimal SCORE_NAME_MATCH = new BigDecimal("0.80");
    private static final BigDecimal SCORE_BASE = new BigDecimal("0.40");
    private static final BigDecimal SCORE_PARSE_BONUS = new BigDecimal("0.30");
    private static final BigDecimal SCORE_CLEAR_MAX = new BigDecimal("0.95");

    private final VisitorRepository visitorRepository;
    private final VisitorVerificationRepository verificationRepository;
    private final VisitorWatchlistRepository watchlistRepository;
    private final SecurityAlertRepository securityAlertRepository;
    private final EmployeeNotificationRepository employeeNotificationRepository;
    private final RealtimeNotificationPublisher realtimeNotificationPublisher;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    // ---------------------------------------------------------------
    // Verification
    // ---------------------------------------------------------------

    /**
     * Parses the presented ID, screens the visitor against the active watchlist,
     * and persists the outcome.
     *
     * @param idNumber the ID presented at the desk; when blank, falls back to the
     *                 number captured at registration ({@link Visitor#getIdNumber()})
     * @throws IllegalArgumentException when the visitor does not exist
     */
    @Transactional
    public VisitorVerification verify(UUID visitorId, IdType idType, String idNumber, User actor) {
        Visitor visitor = visitorRepository.findById(visitorId)
                .orElseThrow(() -> new IllegalArgumentException("Visitor not found: " + visitorId));

        IdType resolvedType = idType != null ? idType : IdType.OTHER;
        String presented = (idNumber != null && !idNumber.isBlank())
                ? idNumber.trim()
                : visitor.getIdNumber();

        String normalized = normalize(presented);
        boolean parses = matchesFormat(resolvedType, normalized);

        // --- Screen against the active watchlist -------------------
        List<VisitorWatchlist> active = watchlistRepository.findByStatusAndDeletedFalse("ACTIVE");

        VisitorWatchlist idHit = normalized.isEmpty() ? null : active.stream()
                .filter(w -> normalized.equals(normalize(w.getIdNumber())))
                .findFirst().orElse(null);

        VisitorWatchlist nameHit = idHit != null ? null : active.stream()
                .filter(w -> nameMatches(w.getFullName(), visitor.getFullName()))
                .findFirst().orElse(null);

        WatchlistStatus watchlistStatus;
        BigDecimal score;
        String notes;

        if (idHit != null) {
            watchlistStatus = WatchlistStatus.FLAGGED;
            score = SCORE_ID_MATCH;
            notes = "Watchlist ID match: '" + idHit.getFullName() + "'. Reason: "
                    + Objects.toString(idHit.getReason(), "not recorded");
        } else if (nameHit != null) {
            watchlistStatus = WatchlistStatus.FLAGGED;
            score = SCORE_NAME_MATCH;
            notes = "Watchlist name match: '" + nameHit.getFullName() + "'. Reason: "
                    + Objects.toString(nameHit.getReason(), "not recorded")
                    + ". ID number did not match - confirm identity manually.";
        } else {
            watchlistStatus = WatchlistStatus.CLEAR;
            score = SCORE_BASE.add(parses ? SCORE_PARSE_BONUS : BigDecimal.ZERO).min(SCORE_CLEAR_MAX);
            notes = normalized.isEmpty()
                    ? "No watchlist match. No ID number was presented, so the score reflects name screening only."
                    : parses
                        ? "No watchlist match. ID number matches the expected " + resolvedType + " format."
                        : "No watchlist match. ID number does not match the expected " + resolvedType
                          + " format - inspect the physical ID.";
        }

        VisitorVerification verification = VisitorVerification.builder()
                .visitorId(visitor.getId())
                .idType(resolvedType)
                .idNumber(presented)
                .extractedFields(buildExtractedFields(visitor, resolvedType, presented, normalized, parses))
                .matchScore(score.setScale(2, RoundingMode.HALF_UP))
                .watchlistStatus(watchlistStatus)
                // VERIFIED means the screen completed, not that the visitor is
                // cleared - watchlistStatus carries that.
                .verificationStatus(VerificationStatus.VERIFIED)
                .verifiedAt(LocalDateTime.now())
                .verifiedBy(actor != null ? actor.getEmail() : "system")
                .notes(notes)
                .build();

        VisitorVerification saved = verificationRepository.save(verification);

        if (watchlistStatus == WatchlistStatus.FLAGGED) {
            raiseWatchlistAlert(visitor, saved, notes);
        }

        auditService.log(actor, "VERIFY_VISITOR", MODULE, "Visitor", visitor.getId().toString(),
                "Verified visitor '" + visitor.getFullName() + "' (" + resolvedType + "): "
                        + watchlistStatus + ", score " + saved.getMatchScore() + ". " + notes,
                null);

        log.info("Visitor verification: {} -> {} (score {})",
                visitor.getFullName(), watchlistStatus, saved.getMatchScore());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<VisitorVerification> listVerifications(UUID visitorId) {
        return visitorId != null
                ? verificationRepository.findByVisitorIdAndDeletedFalseOrderByCreatedAtDesc(visitorId)
                : verificationRepository.findByDeletedFalseOrderByCreatedAtDesc();
    }

    // ---------------------------------------------------------------
    // Watchlist management
    // ---------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<VisitorWatchlist> listWatchlist() {
        return watchlistRepository.findByDeletedFalseOrderByCreatedAtDesc();
    }

    @Transactional
    public VisitorWatchlist addWatchlistEntry(String fullName, String idNumber, String reason, User actor) {
        if (fullName == null || fullName.isBlank()) {
            throw new IllegalArgumentException("fullName is required");
        }
        VisitorWatchlist saved = watchlistRepository.save(VisitorWatchlist.builder()
                .fullName(fullName.trim())
                .idNumber(idNumber != null && !idNumber.isBlank() ? idNumber.trim() : null)
                .reason(reason)
                .status("ACTIVE")
                .build());

        auditService.log(actor, "ADD_VISITOR_WATCHLIST", MODULE, "VisitorWatchlist",
                saved.getId().toString(),
                "Added '" + saved.getFullName() + "' to the visitor watchlist. Reason: "
                        + Objects.toString(reason, "not recorded"), null);
        return saved;
    }

    @Transactional
    public VisitorWatchlist updateWatchlistStatus(UUID id, String status, User actor) {
        VisitorWatchlist entry = watchlistRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Watchlist entry not found: " + id));

        String next = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!next.equals("ACTIVE") && !next.equals("INACTIVE")) {
            throw new IllegalArgumentException("status must be ACTIVE or INACTIVE");
        }
        String previous = entry.getStatus();
        entry.setStatus(next);
        VisitorWatchlist saved = watchlistRepository.save(entry);

        auditService.log(actor, "UPDATE_VISITOR_WATCHLIST", MODULE, "VisitorWatchlist", id.toString(),
                "Watchlist entry '" + entry.getFullName() + "' changed from " + previous + " to " + next,
                null);
        return saved;
    }

    // ---------------------------------------------------------------
    // Host notification (check-in side effect)
    // ---------------------------------------------------------------

    /**
     * Notifies the visitor's host that their guest has arrived.
     *
     * <p>Never throws: check-in must succeed even if the notification cannot be
     * written, and the caller's response shape must not change.
     *
     * @return {@code true} when a notification was persisted
     */
    @Transactional
    public boolean notifyHostOfArrival(Visitor visitor) {
        try {
            User host = visitor.getHost();
            if (host == null) return false;

            String when = visitor.getActualArrival() != null
                    ? visitor.getActualArrival().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
                    : "just now";

            StringBuilder message = new StringBuilder()
                    .append(visitor.getFullName());
            if (visitor.getCompany() != null && !visitor.getCompany().isBlank()) {
                message.append(" (").append(visitor.getCompany()).append(")");
            }
            message.append(" arrived at ").append(when).append(".")
                   .append(" Purpose: ").append(Objects.toString(visitor.getPurposeOfVisit(), "not stated"))
                   .append(".");

            EmployeeNotification saved = employeeNotificationRepository.save(EmployeeNotification.builder()
                    .recipient(host)
                    .title("Visitor arrived: " + visitor.getFullName())
                    .message(message.toString())
                    .type(NotificationType.VISITOR_ARRIVAL)
                    .relatedEntityType("Visitor")
                    .relatedEntityId(visitor.getId().toString())
                    .build());
            log.info("Notification created: type=VISITOR_ARRIVAL recipient={} title={}", host.getId(), saved.getTitle());
            realtimeNotificationPublisher.publishToUser(host.getEmail(), Map.of(
                    "id", saved.getId(),
                    "title", saved.getTitle(),
                    "message", saved.getMessage(),
                    "type", saved.getType(),
                    "read", saved.isRead(),
                    "relatedEntityType", saved.getRelatedEntityType(),
                    "relatedEntityId", saved.getRelatedEntityId(),
                    "createdAt", saved.getCreatedAt()));
            return true;
        } catch (Exception e) {
            log.error("Failed to notify host of visitor arrival ({}): {}",
                    visitor.getId(), e.getMessage());
            return false;
        }
    }

    // ---------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------

    /** Raises a security alert so a watchlist hit surfaces on the SysAdmin security page. */
    private void raiseWatchlistAlert(Visitor visitor, VisitorVerification verification, String notes) {
        try {
            securityAlertRepository.save(SecurityAlert.builder()
                    .title("Visitor watchlist match")
                    .description("Visitor '" + visitor.getFullName() + "' (id " + visitor.getId()
                            + ") matched an active watchlist entry during verification "
                            + verification.getId() + ". " + notes)
                    .severity(RiskLevel.HIGH)
                    .alertType("VISITOR_WATCHLIST")
                    .targetIp("")
                    // "UNRESOLVED", not "OPEN": that is the vocabulary
                    // SecurityAlert.prePersist defaults to and the value the
                    // SysAdmin security page filters on.
                    .status("UNRESOLVED")
                    .build());
        } catch (Exception e) {
            log.error("Failed to raise watchlist security alert for visitor {}: {}",
                    visitor.getId(), e.getMessage());
        }
    }

    /** Strips separators and upper-cases, so 'n02-18-998412' == 'N02 18 998412'. */
    private static String normalize(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
    }

    private static boolean matchesFormat(IdType type, String normalized) {
        if (normalized.isEmpty()) return false;
        return type == IdType.DRIVERS_LICENSE
                ? DRIVERS_LICENSE.matcher(normalized).matches()
                : GENERIC_ID.matcher(normalized).matches();
    }

    /**
     * Bidirectional contains: the watchlist may hold a fuller or shorter form of
     * the name than the visitor registered under. Guarded at 4 characters so a
     * short token cannot match everything.
     */
    private static boolean nameMatches(String watchlistName, String visitorName) {
        if (watchlistName == null || visitorName == null) return false;
        String a = watchlistName.trim().toLowerCase(Locale.ROOT);
        String b = visitorName.trim().toLowerCase(Locale.ROOT);
        if (a.length() < 4 || b.length() < 4) return false;
        return a.contains(b) || b.contains(a);
    }

    /** The parsed ID components stored in the {@code extracted_fields} jsonb column. */
    private String buildExtractedFields(Visitor visitor, IdType type, String presented,
                                        String normalized, boolean parses) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("idType", type.name());
        fields.put("rawIdNumber", presented);
        fields.put("normalizedIdNumber", normalized);
        fields.put("formatValid", parses);
        fields.put("detectedFormat", parses
                ? (type == IdType.DRIVERS_LICENSE ? "PH_DRIVERS_LICENSE" : "ALPHANUMERIC")
                : "UNRECOGNIZED");
        if (parses && !normalized.isEmpty()) {
            fields.put("prefix", normalized.substring(0, 1));
            fields.put("serial", normalized.substring(1));
        }
        fields.put("visitorFullName", visitor.getFullName());
        fields.put("visitorCompany", visitor.getCompany());
        fields.put("source", "HEURISTIC_PARSER");

        try {
            return objectMapper.writeValueAsString(fields);
        } catch (Exception e) {
            log.error("Failed to serialise extracted fields for visitor {}: {}",
                    visitor.getId(), e.getMessage());
            return "{}";
        }
    }
}
