package com.photonicomega.facilities.module.admin.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.admin.domain.BackupRecord;
import com.photonicomega.facilities.module.admin.repository.BackupRecordRepository;
import com.photonicomega.facilities.module.admin.service.BackupService;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.auth.service.AuditService;
import com.photonicomega.facilities.module.security.util.ClientIpResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/v1/admin/backups")
@RequiredArgsConstructor
@Tag(name = "Backup & Disaster Recovery", description = "Database backup and disaster recovery management")
public class BackupController {

    private final BackupRecordRepository repository;
    private final BackupService backupService;
    private final UserRepository userRepository;
    private final AuditService auditService;

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
    @Operation(summary = "Start a new database backup")
    public ResponseEntity<ApiResponse<BackupRecord>> create(@RequestBody Map<String, String> body) {
        BackupRecord record = backupService.startBackup(
                body.get("backupType"),
                body.get("triggeredBy"));
        return ResponseEntity.ok(ApiResponse.success(record));
    }

    @PostMapping("/{id}/download")
    @Operation(summary = "Download a completed backup archive")
    public ResponseEntity<?> download(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserDetails userDetails,
            HttpServletRequest request) {
        Optional<BackupRecord> found = repository.findById(id);
        if (found.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("Backup record not found: " + id, "RESOURCE_NOT_FOUND"));
        }

        BackupRecord record = found.get();
        if (!"COMPLETED".equalsIgnoreCase(record.getStatus())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ApiResponse.failure("The backup archive is not ready for download.", "BACKUP_FILE_NOT_READY"));
        }

        final Path file;
        try {
            file = backupService.locateBackupFile(record);
        } catch (IOException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure(ex.getMessage(), "BACKUP_FILE_NOT_FOUND"));
        }

        User actor = userDetails == null
                ? null
                : userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
        auditService.log(actor, "BACKUP_DOWNLOADED", "ADMIN", "BackupRecord", id.toString(),
                "Downloaded backup archive: " + file.getFileName(), ClientIpResolver.resolve(request).ip());

        try {
            Resource resource = new InputStreamResource(Files.newInputStream(file));
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(Files.size(file))
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + file.getFileName().toString().replaceAll("[\\r\\n\"\\\\]", "_") + "\"")
                    .body(resource);
        } catch (IOException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("The backup archive is no longer available on the backup server.", "BACKUP_FILE_NOT_FOUND"));
        }
    }
}
