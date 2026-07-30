package com.photonicomega.facilities.module.dashboard;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.admin.repository.AdminNotificationRepository;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.facilities.domain.ReservationStatus;
import com.photonicomega.facilities.module.facilities.repository.FacilityRepository;
import com.photonicomega.facilities.module.facilities.repository.ReservationRepository;
import com.photonicomega.facilities.module.facilities.repository.RoomRepository;
import com.photonicomega.facilities.module.legal.domain.CaseStatus;
import com.photonicomega.facilities.module.legal.repository.LegalCaseRepository;
import com.photonicomega.facilities.module.records.repository.RetentionPolicyRepository;
import com.photonicomega.facilities.module.security.repository.ActiveSessionRepository;
import com.photonicomega.facilities.module.security.repository.BlockedIpRepository;
import com.photonicomega.facilities.module.security.repository.LoginHistoryRepository;
import com.photonicomega.facilities.module.security.repository.SecurityAlertRepository;
import com.photonicomega.facilities.module.visitor.domain.VisitorStatus;
import com.photonicomega.facilities.module.visitor.repository.VisitorRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

@RestController
@RequestMapping("/v1/admin/kpi")
@RequiredArgsConstructor
@Tag(name = "System Admin KPI", description = "Comprehensive KPI dashboard for System Administrator")
public class KpiController {

    private final FacilityRepository facilityRepository;
    private final RoomRepository roomRepository;
    private final ReservationRepository reservationRepository;
    private final VisitorRepository visitorRepository;
    private final DocumentRepository documentRepository;
    private final ContractRepository contractRepository;
    private final LegalCaseRepository legalCaseRepository;
    private final RetentionPolicyRepository retentionPolicyRepository;
    private final UserRepository userRepository;
    private final ActiveSessionRepository activeSessionRepository;
    private final BlockedIpRepository blockedIpRepository;
    private final SecurityAlertRepository securityAlertRepository;
    private final LoginHistoryRepository loginHistoryRepository;
    private final AdminNotificationRepository adminNotificationRepository;

    @Data @Builder
    public static class KpiResponse {
        private FacilitiesKpi facilities;
        private VisitorKpi visitors;
        private DocumentKpi documents;
        private RecordsKpi records;
        private LegalKpi legal;
        private ContractKpi contracts;
        private GlobalKpi global;
    }

    @Data @Builder
    public static class FacilitiesKpi {
        private long totalFacilities;
        private long totalRooms;
        private long activeRooms;
        private long bookingsToday;
        private long pendingApprovals;
        private long checkedIn;
    }

    @Data @Builder
    public static class VisitorKpi {
        private long totalVisitors;
        private long onSite;
        private long checkedIn;
        private long registered;
        private long checkedOut;
    }

    @Data @Builder
    public static class DocumentKpi {
        private long totalDocuments;
        private long archived;
        private long approved;
        private long pendingReview;
        private long draft;
    }

    @Data @Builder
    public static class RecordsKpi {
        private long totalPolicies;
        private long activePolicies;
    }

    @Data @Builder
    public static class LegalKpi {
        private long totalCases;
        private long open;
        private long inProgress;
        private long pendingHearing;
        private long closed;
    }

    @Data @Builder
    public static class ContractKpi {
        private long totalContracts;
        private long active;
        private long underReview;
        private long draft;
        private long expired;
        private long pendingApproval;
        private BigDecimal totalContractValue;
    }

    @Data @Builder
    public static class GlobalKpi {
        private long activeUsers;
        private long activeSessions;
        private long failedLoginAttempts;
        private long blockedIps;
        private long activeAlerts;
        private long unreadNotifications;
    }

    @GetMapping
    @Operation(summary = "Get comprehensive KPI data for System Administrator dashboard")
    public ResponseEntity<ApiResponse<KpiResponse>> getKpi() {
        java.time.LocalDateTime startOfDay = java.time.LocalDateTime.now()
                .with(java.time.temporal.ChronoField.HOUR_OF_DAY, 0)
                .with(java.time.temporal.ChronoField.MINUTE_OF_HOUR, 0);
        java.time.LocalDateTime endOfDay = startOfDay.plusDays(1);
        long bookingToday = reservationRepository.countByDateRange(startOfDay, endOfDay);

        KpiResponse response = KpiResponse.builder()
                .facilities(FacilitiesKpi.builder()
                        .totalFacilities(facilityRepository.count())
                        .totalRooms(roomRepository.count())
                        .activeRooms(roomRepository.countByActiveTrue())
                        .bookingsToday(bookingToday)
                        .pendingApprovals(reservationRepository.countByStatus(ReservationStatus.PENDING))
                        .checkedIn(reservationRepository.countByStatus(ReservationStatus.CHECKED_IN))
                        .build())
                .visitors(VisitorKpi.builder()
                        .totalVisitors(visitorRepository.count())
                        .onSite(visitorRepository.countByStatus(VisitorStatus.CHECKED_IN))
                        .checkedIn(visitorRepository.countByStatus(VisitorStatus.CHECKED_IN))
                        .registered(visitorRepository.countByStatus(VisitorStatus.REGISTERED))
                        .checkedOut(visitorRepository.countByStatus(VisitorStatus.CHECKED_OUT))
                        .build())
                .documents(DocumentKpi.builder()
                        .totalDocuments(documentRepository.count())
                        .archived(documentRepository.countByStatus(DocumentStatus.ARCHIVED))
                        .approved(documentRepository.countByStatus(DocumentStatus.APPROVED))
                        .pendingReview(documentRepository.countByStatus(DocumentStatus.PENDING_REVIEW))
                        .draft(documentRepository.countByStatus(DocumentStatus.DRAFT))
                        .build())
                .records(RecordsKpi.builder()
                        .totalPolicies(retentionPolicyRepository.count())
                        .activePolicies(retentionPolicyRepository.findByActiveTrue().size())
                        .build())
                .legal(LegalKpi.builder()
                        .totalCases(legalCaseRepository.count())
                        .open(legalCaseRepository.countByStatus(CaseStatus.OPEN))
                        .inProgress(legalCaseRepository.countByStatus(CaseStatus.IN_PROGRESS))
                        .pendingHearing(legalCaseRepository.countByStatus(CaseStatus.PENDING_HEARING))
                        .closed(legalCaseRepository.countByStatus(CaseStatus.CLOSED))
                        .build())
                .contracts(ContractKpi.builder()
                        .totalContracts(contractRepository.count())
                        .active(contractRepository.countByStatus(ContractStatus.ACTIVE))
                        .underReview(contractRepository.countByStatus(ContractStatus.UNDER_REVIEW))
                        .draft(contractRepository.countByStatus(ContractStatus.DRAFT))
                        .expired(contractRepository.countByStatus(ContractStatus.EXPIRED))
                        .pendingApproval(contractRepository.countByStatus(ContractStatus.APPROVED))
                        .totalContractValue(BigDecimal.ZERO)
                        .build())
                .global(GlobalKpi.builder()
                        .activeUsers(userRepository.count())
                        .activeSessions(activeSessionRepository.findByStatus("ACTIVE").size())
                        .failedLoginAttempts(loginHistoryRepository.countByUsernameAndStatus("admin", "FAILED")
                                + loginHistoryRepository.countByUsernameAndStatus("user", "FAILED"))
                        .blockedIps(blockedIpRepository.findByStatus("ACTIVE").size())
                        .activeAlerts(securityAlertRepository.findByStatus("UNRESOLVED").size())
                        .unreadNotifications(adminNotificationRepository.countByReadFalse())
                        .build())
                .build();

        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
