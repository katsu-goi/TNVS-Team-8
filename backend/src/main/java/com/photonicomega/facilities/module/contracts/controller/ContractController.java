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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    // Contract.associatedDocument is LAZY OneToOne and open-in-view is disabled,
    // so the data is flattened to DTO maps inside a session.
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAllContracts() {
        List<Map<String, Object>> contracts = contractRepository.findAll().stream()
                .map(c -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", c.getId());
                    m.put("contractNumber", c.getContractNumber());
                    m.put("title", c.getTitle());
                    m.put("type", c.getType() != null ? c.getType().name() : null);
                    m.put("counterParty", c.getCounterParty());
                    m.put("contractValue", c.getContractValue());
                    m.put("vendorId", c.getVendorId());
                    m.put("startDate", c.getStartDate());
                    m.put("endDate", c.getEndDate());
                    m.put("renewalNoticeDate", c.getRenewalNoticeDate());
                    m.put("status", c.getStatus() != null ? c.getStatus().name() : null);
                    m.put("aiAssessedRiskLevel", c.getAiAssessedRiskLevel() != null ? c.getAiAssessedRiskLevel().name() : null);
                    m.put("aiRiskSummary", c.getAiRiskSummary());
                    m.put("associatedDocumentId", c.getAssociatedDocument() != null ? c.getAssociatedDocument().getId() : null);
                    m.put("createdAt", c.getCreatedAt());
                    return m;
                }).toList();
        return ResponseEntity.ok(ApiResponse.success(contracts, "Contracts retrieved"));
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
