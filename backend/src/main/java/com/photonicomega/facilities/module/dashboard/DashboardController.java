package com.photonicomega.facilities.module.dashboard;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.facilities.repository.FacilityRepository;
import com.photonicomega.facilities.module.facilities.repository.ReservationRepository;
import com.photonicomega.facilities.module.legal.repository.LegalCaseRepository;
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

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
@Tag(name = "Executive & Operational Dashboard", description = "Aggregated KPI statistics for executive overview")
public class DashboardController {

    private final FacilityRepository facilityRepository;
    private final ReservationRepository reservationRepository;
    private final VisitorRepository visitorRepository;
    private final DocumentRepository documentRepository;
    private final ContractRepository contractRepository;
    private final LegalCaseRepository legalCaseRepository;

    @Data
    @Builder
    public static class ExecutiveDashboardStats {
        private long totalFacilities;
        private long totalReservations;
        private long totalVisitors;
        private long totalDocuments;
        private long totalContracts;
        private long totalLegalCases;
    }

    @GetMapping("/summary")
    @Operation(summary = "Get high-level aggregated statistics for executive dashboard")
    public ResponseEntity<ApiResponse<ExecutiveDashboardStats>> getDashboardSummary() {
        ExecutiveDashboardStats stats = ExecutiveDashboardStats.builder()
                .totalFacilities(facilityRepository.count())
                .totalReservations(reservationRepository.count())
                .totalVisitors(visitorRepository.count())
                .totalDocuments(documentRepository.count())
                .totalContracts(contractRepository.count())
                .totalLegalCases(legalCaseRepository.count())
                .build();

        return ResponseEntity.ok(ApiResponse.success(stats, "Dashboard metrics loaded successfully"));
    }
}
