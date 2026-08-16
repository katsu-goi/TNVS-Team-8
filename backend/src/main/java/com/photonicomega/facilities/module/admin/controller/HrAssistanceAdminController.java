package com.photonicomega.facilities.module.admin.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.auth.domain.HrAssistanceRequest;
import com.photonicomega.facilities.module.auth.repository.HrAssistanceRequestRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/admin/hr-assistance")
@RequiredArgsConstructor
@Tag(name = "HR Assistance Admin", description = "Administrative view of HR assistance requests")
public class HrAssistanceAdminController {

    private final HrAssistanceRequestRepository repository;

    @GetMapping
    @Operation(summary = "List HR assistance requests")
    public ResponseEntity<ApiResponse<List<HrAssistanceRequest>>> list() {
        return ResponseEntity.ok(ApiResponse.success(repository.findAllByOrderByCreatedAtDesc()));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get HR assistance request by ID")
    public ResponseEntity<ApiResponse<HrAssistanceRequest>> get(@PathVariable UUID id) {
        HrAssistanceRequest request = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("HrAssistanceRequest", "id", id));
        return ResponseEntity.ok(ApiResponse.success(request));
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Update HR assistance request status")
    public ResponseEntity<ApiResponse<HrAssistanceRequest>> updateStatus(
            @PathVariable UUID id,
            @RequestParam String status) {
        HrAssistanceRequest request = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("HrAssistanceRequest", "id", id));
        request.setStatus(status);
        return ResponseEntity.ok(ApiResponse.success(repository.save(request)));
    }
}
