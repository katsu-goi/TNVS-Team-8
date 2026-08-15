package com.photonicomega.facilities.ai.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Per-module AI configuration. Stores which provider/model each AI module
 * executes with, the execution mode, the enabled feature set, and the fallback
 * model used when the assigned model becomes unavailable. Providers themselves
 * live in-memory in {@code AiStateManagementService}; this table stores only the
 * per-module binding so the database is the source of truth for model routing.
 */
@Entity
@Table(name = "ai_module_config")
@Getter
@Setter
@NoArgsConstructor
public class AiModuleConfig extends BaseEntity {

    @Column(name = "module_key", nullable = false, unique = true, length = 100)
    private String moduleKey;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @Column(name = "provider_id", length = 100)
    private String providerId;

    @Column(name = "model", length = 200)
    private String model;

    @Column(name = "fallback_model", length = 200)
    private String fallbackModel;

    @Column(name = "execution_mode", nullable = false, length = 20)
    private String executionMode = "REALTIME";

    @Column(name = "features", columnDefinition = "TEXT")
    private String features;
}