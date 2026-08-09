package com.photonicomega.facilities.module.contracts.controller;

import com.photonicomega.facilities.ai.ContractAnalyticsAiService;
import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.contracts.domain.Contract;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/contracts")
@RequiredArgsConstructor
@Tag(name = "Contract Management & AI Analytics", description = "Endpoints for contract management and AI clause risk extraction")
@PreAuthorize("hasAnyRole('CONTRACT_OFFICER','LEGAL_OFFICER')")
public class ContractController {

    private final ContractRepository contractRepository;
    private final ContractAnalyticsAiService contractAiService;

    @GetMapping
    @Operation(summary = "Get all contracts")
    public ResponseEntity<ApiResponse<List<Contract>>> getAllContracts() {
        return ResponseEntity.ok(ApiResponse.success(contractRepository.findAll(), "Contracts retrieved"));
    }

    @PostMapping
    @Operation(summary = "Create contract with automatic AI clause extraction & risk assessment")
    public ResponseEntity<ApiResponse<Contract>> createContract(@RequestBody Contract contract) {
        if (contract.getStatus() == null) {
            contract.setStatus(ContractStatus.ACTIVE);
        }

        // Perform AI contract risk assessment
        var aiResult = contractAiService.analyzeContract(contract.getTitle());
        contract.setAiAssessedRiskLevel(aiResult.getOverallRisk());
        contract.setAiRiskSummary(aiResult.getSummary());

        return ResponseEntity.ok(ApiResponse.success(contractRepository.save(contract), "Contract created & analyzed by AI"));
    }

    @GetMapping("/{id}/analyze")
    @Operation(summary = "Run AI contract risk analysis on demand")
    public ResponseEntity<ApiResponse<ContractAnalyticsAiService.ContractAnalysisResponse>> analyzeContract(@PathVariable UUID id) {
        return contractRepository.findById(id).map(c -> {
            var analysis = contractAiService.analyzeContract(c.getTitle());
            return ResponseEntity.ok(ApiResponse.success(analysis, "AI Contract analysis complete"));
        }).orElse(ResponseEntity.notFound().build());
    }
}
