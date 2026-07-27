package com.photonicomega.facilities.module.legal.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.legal.domain.CaseStatus;
import com.photonicomega.facilities.module.legal.domain.LegalCase;
import com.photonicomega.facilities.module.legal.repository.LegalCaseRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/legal-cases")
@RequiredArgsConstructor
@Tag(name = "Legal Case Management", description = "Endpoints for tracking legal cases, hearings, and evidence")
public class LegalCaseController {

    private final LegalCaseRepository legalCaseRepository;

    @GetMapping
    @Operation(summary = "List all legal cases")
    public ResponseEntity<ApiResponse<List<LegalCase>>> getAllCases() {
        return ResponseEntity.ok(ApiResponse.success(legalCaseRepository.findAll(), "Legal cases retrieved"));
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
