package com.photonicomega.facilities.module.legal.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.legal.domain.CaseStatus;
import com.photonicomega.facilities.module.legal.domain.LegalCase;
import com.photonicomega.facilities.module.legal.repository.LegalCaseRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/legal-cases")
@RequiredArgsConstructor
@Tag(name = "Legal Case Management", description = "Endpoints for tracking legal cases, hearings, and evidence")
@PreAuthorize("hasRole('LEGAL_OFFICER')")
public class LegalCaseController {

    private final LegalCaseRepository legalCaseRepository;

    @GetMapping
    @Operation(summary = "List all legal cases")
    // LegalCase.leadLawyer is LAZY and open-in-view is disabled, so the data is
    // flattened to DTO maps inside a session.
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAllCases() {
        List<Map<String, Object>> cases = legalCaseRepository.findAll().stream()
                .map(c -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", c.getId());
                    m.put("caseNumber", c.getCaseNumber());
                    m.put("title", c.getTitle());
                    m.put("description", c.getDescription());
                    m.put("courtName", c.getCourtName());
                    m.put("judgeName", c.getJudgeName());
                    m.put("opposingParty", c.getOpposingParty());
                    m.put("caseType", c.getCaseType() != null ? c.getCaseType().name() : null);
                    m.put("status", c.getStatus() != null ? c.getStatus().name() : null);
                    m.put("priority", c.getPriority() != null ? c.getPriority().name() : null);
                    m.put("leadLawyerId", c.getLeadLawyer() != null ? c.getLeadLawyer().getId() : null);
                    m.put("leadLawyerName", c.getLeadLawyer() != null ? c.getLeadLawyer().getFullName() : null);
                    m.put("filingDate", c.getFilingDate());
                    m.put("expectedResolutionDate", c.getExpectedResolutionDate());
                    m.put("closedDate", c.getClosedDate());
                    m.put("resolutionNotes", c.getResolutionNotes());
                    m.put("createdAt", c.getCreatedAt());
                    return m;
                }).toList();
        return ResponseEntity.ok(ApiResponse.success(cases, "Legal cases retrieved"));
    }

    @PostMapping
    @Operation(summary = "Create a legal case")
    public ResponseEntity<ApiResponse<LegalCase>> createCase(@RequestBody LegalCase legalCase) {
        if (legalCase.getStatus() == null) {
            legalCase.setStatus(CaseStatus.OPEN);
        }
        return ResponseEntity.ok(ApiResponse.success(legalCaseRepository.save(legalCase), "Legal case created"));
    }
}
