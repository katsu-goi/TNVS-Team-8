package com.photonicomega.facilities.module.admin.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.admin.domain.BackupRecord;
import com.photonicomega.facilities.module.admin.repository.BackupRecordRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/admin/backups")
@RequiredArgsConstructor
@Tag(name = "Backup & Disaster Recovery", description = "Database backup and disaster recovery management")
public class BackupController {

    private final BackupRecordRepository repository;

    @GetMapping
    @Operation(summary = "Get all backup records (most recent first)")
    public ResponseEntity<ApiResponse<List<BackupRecord>>> getAll() {
        return ResponseEntity.ok(ApiResponse.success(repository.findAllByOrderByStartedAtDesc()));
    }

    @GetMapping("/latest")
    @Operation(summary = "Get the most recent backup record")
    public ResponseEntity<ApiResponse<BackupRecord>> getLatest() {
        BackupRecord latest = repository.findFirstByOrderByStartedAtDesc();
        if (latest == null) {
            return ResponseEntity.ok(ApiResponse.success(null, "No backup records found"));
        }
        return ResponseEntity.ok(ApiResponse.success(latest));
    }

    @PostMapping
    @Operation(summary = "Create a new backup record")
    public ResponseEntity<ApiResponse<BackupRecord>> create(@RequestBody Map<String, String> body) {
        BackupRecord record = BackupRecord.builder()
                .backupType(body.getOrDefault("backupType", "FULL"))
                .status(body.getOrDefault("status", "RUNNING"))
                .startedAt(Instant.now())
                .triggeredBy(body.getOrDefault("triggeredBy", "system"))
                .build();
        return ResponseEntity.ok(ApiResponse.success(repository.save(record)));
    }
}
