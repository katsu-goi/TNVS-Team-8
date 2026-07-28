package com.photonicomega.facilities.module.admin.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.admin.domain.IntegrationStatus;
import com.photonicomega.facilities.module.admin.repository.IntegrationStatusRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/admin/integrations")
@RequiredArgsConstructor
@Tag(name = "Integration Management", description = "External system integration status and health")
public class IntegrationController {

    private final IntegrationStatusRepository repository;

    @GetMapping
    @Operation(summary = "Get all integration statuses")
    public ResponseEntity<ApiResponse<List<IntegrationStatus>>> getAll() {
        return ResponseEntity.ok(ApiResponse.success(repository.findAll()));
    }

    @GetMapping("/{systemName}")
    @Operation(summary = "Get integration status by system name")
    public ResponseEntity<ApiResponse<IntegrationStatus>> getBySystemName(@PathVariable String systemName) {
        return repository.findBySystemName(systemName)
                .map(s -> ResponseEntity.ok(ApiResponse.success(s)))
                .orElse(ResponseEntity.notFound().build());
    }
}
