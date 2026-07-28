package com.photonicomega.facilities.module.admin.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.admin.domain.SystemConfiguration;
import com.photonicomega.facilities.module.admin.repository.SystemConfigurationRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/admin/config")
@RequiredArgsConstructor
@Tag(name = "System Configuration", description = "Application configuration management")
public class SystemConfigController {

    private final SystemConfigurationRepository repository;

    @GetMapping
    @Operation(summary = "Get all system configurations")
    public ResponseEntity<ApiResponse<List<SystemConfiguration>>> getAll() {
        return ResponseEntity.ok(ApiResponse.success(repository.findAll()));
    }

    @GetMapping("/{key}")
    @Operation(summary = "Get configuration by key")
    public ResponseEntity<ApiResponse<SystemConfiguration>> getByKey(@PathVariable String key) {
        return repository.findByConfigKey(key)
                .map(c -> ResponseEntity.ok(ApiResponse.success(c)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{key}")
    @Operation(summary = "Update configuration value")
    public ResponseEntity<ApiResponse<SystemConfiguration>> update(
            @PathVariable String key, @RequestBody Map<String, String> body) {
        SystemConfiguration config = repository.findByConfigKey(key).orElseGet(() ->
                SystemConfiguration.builder().configKey(key).build());
        config.setConfigValue(body.get("value"));
        config.setDescription(body.getOrDefault("description", config.getDescription()));
        config.setCategory(body.getOrDefault("category", config.getCategory()));
        config.setUpdatedAt(Instant.now());
        config.setUpdatedBy(body.getOrDefault("updatedBy", "admin"));
        return ResponseEntity.ok(ApiResponse.success(repository.save(config)));
    }
}
