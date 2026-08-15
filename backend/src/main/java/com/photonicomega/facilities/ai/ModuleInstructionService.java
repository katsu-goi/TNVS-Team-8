package com.photonicomega.facilities.ai;

import jakarta.annotation.PostConstruct;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Loads, caches, versions, and composes per-module AI instructions.
 *
 * Module instruction files live under {@code ai/modules/*.md} and are loaded
 * once at startup into an in-memory cache (the same architecture the rest of
 * the AI management layer uses). Every administrator update records a versioned
 * audit entry (previous content, new content, author, timestamp, change
 * summary) instead of silently overwriting the previous instruction.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ModuleInstructionService {

    @Data
    @Builder
    public static class InstructionVersion {
        private String version;
        private String content;
        private String updatedBy;
        private String updatedAt;
        private String changeSummary;
    }

    @Data
    @Builder
    public static class ModuleInstructionDto {
        private String moduleKey;
        private String name;
        private String description;
        private boolean enabled;
        private String content;
        private String version;
        private String updatedBy;
        private String updatedAt;
        private List<InstructionVersion> versions;
    }

    private static final String MODULES_PATH = "ai/modules/";
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** Real modules that exist in the system. Keys match the .md file names. */
    private static final LinkedHashMap<String, String[]> MODULE_METADATA = new LinkedHashMap<>();
    static {
        MODULE_METADATA.put("reservations", new String[]{
                "Facility Reservation System", "Reservation scheduling, approvals, and occupancy"});
        MODULE_METADATA.put("visitor_management", new String[]{
                "Visitor Management System", "Visitor registration, Philippine ID verification, and watchlists"});
        MODULE_METADATA.put("document_management", new String[]{
                "Document Management (Archiving)", "Document storage, classification, and access grants"});
        MODULE_METADATA.put("records_management", new String[]{
                "Records Retention & Compliance", "Retention policies, disposals, and compliance alerts"});
        MODULE_METADATA.put("legal_management", new String[]{
                "Legal Management System", "Legal cases, notices, and legal documents"});
        MODULE_METADATA.put("contract_management", new String[]{
                "Contract Management System", "Contracts, clauses, vendors, and obligations"});
    }

    private final ConcurrentHashMap<String, ModuleInstructionDto> cache = new ConcurrentHashMap<>();

    @PostConstruct
    public void loadDefaults() {
        cache.clear();
        for (Map.Entry<String, String[]> entry : MODULE_METADATA.entrySet()) {
            String moduleKey = entry.getKey();
            String content = readResource(MODULES_PATH + moduleKey + ".md");
            cache.put(moduleKey, ModuleInstructionDto.builder()
                    .moduleKey(moduleKey)
                    .name(entry.getValue()[0])
                    .description(entry.getValue()[1])
                    .enabled(true)
                    .content(content != null ? content : "")
                    .version("1.0.0")
                    .updatedBy("System")
                    .updatedAt(LocalDateTime.now().format(TS))
                    .versions(new ArrayList<>())
                    .build());
        }
        log.info("Loaded {} per-module AI instructions from {}*.md", cache.size(), MODULES_PATH);
    }

    private String readResource(String path) {
        try {
            ClassPathResource resource = new ClassPathResource(path);
            if (resource.exists()) {
                return new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            }
        } catch (IOException e) {
            log.warn("Failed to load AI instruction resource {}: {}", path, e.getMessage());
        }
        return null;
    }

    public List<ModuleInstructionDto> listAll() {
        return new ArrayList<>(cache.values());
    }

    /** Reloads the default module instructions from the resource files (used by tests to reset state). */
    public void reset() {
        loadDefaults();
    }
    public Optional<ModuleInstructionDto> get(String moduleKey) {
        return Optional.ofNullable(cache.get(moduleKey));
    }

    public boolean isValidModule(String moduleKey) {
        return moduleKey != null && cache.containsKey(moduleKey);
    }

    /**
     * Returns the enabled module instruction content, or empty when the module
     * is unknown or disabled (fallback to global-only instructions).
     */
    public Optional<String> getActiveContent(String moduleKey) {
        ModuleInstructionDto dto = cache.get(moduleKey);
        if (dto == null || !dto.isEnabled() || dto.getContent() == null || dto.getContent().isBlank()) {
            return Optional.empty();
        }
        return Optional.of(dto.getContent());
    }

    public ModuleInstructionDto updateContent(String moduleKey, String content, String changeSummary, String user) {
        ModuleInstructionDto current = cache.get(moduleKey);
        if (current == null) {
            return null;
        }
        String author = user != null && !user.isBlank() ? user : "System Administrator";
        String now = LocalDateTime.now().format(TS);

        List<InstructionVersion> versions = new ArrayList<>(current.getVersions());
        versions.add(0, InstructionVersion.builder()
                .version(current.getVersion())
                .content(current.getContent())
                .updatedBy(current.getUpdatedBy())
                .updatedAt(current.getUpdatedAt())
                .changeSummary(changeSummary != null ? changeSummary : "Updated module instructions")
                .build());
        // keep recent 20 versions per module
        if (versions.size() > 20) {
            versions = new ArrayList<>(versions.subList(0, 20));
        }

        ModuleInstructionDto updated = ModuleInstructionDto.builder()
                .moduleKey(moduleKey)
                .name(current.getName())
                .description(current.getDescription())
                .enabled(current.isEnabled())
                .content(content != null ? content.trim() : "")
                .version(bumpVersion(current.getVersion()))
                .updatedBy(author)
                .updatedAt(now)
                .versions(versions)
                .build();
        cache.put(moduleKey, updated);
        log.info("AI module instruction '{}' updated to v{} by {}", moduleKey, updated.getVersion(), author);
        return updated;
    }

    public ModuleInstructionDto toggle(String moduleKey, String user) {
        ModuleInstructionDto current = cache.get(moduleKey);
        if (current == null) {
            return null;
        }
        boolean nextState = !current.isEnabled();
        String author = user != null && !user.isBlank() ? user : "System Administrator";
        String now = LocalDateTime.now().format(TS);

        List<InstructionVersion> versions = new ArrayList<>(current.getVersions());
        versions.add(0, InstructionVersion.builder()
                .version(current.getVersion())
                .content(current.getContent())
                .updatedBy(current.getUpdatedBy())
                .updatedAt(current.getUpdatedAt())
                .changeSummary(nextState ? "Module instructions enabled" : "Module instructions disabled")
                .build());

        ModuleInstructionDto updated = ModuleInstructionDto.builder()
                .moduleKey(moduleKey)
                .name(current.getName())
                .description(current.getDescription())
                .enabled(nextState)
                .content(current.getContent())
                .version(bumpVersion(current.getVersion()))
                .updatedBy(author)
                .updatedAt(now)
                .versions(versions)
                .build();
        cache.put(moduleKey, updated);
        log.info("AI module instruction '{}' {} by {}", moduleKey, nextState ? "enabled" : "disabled", author);
        return updated;
    }

    /**
     * Restores the content of a previous version as a NEW version (the current
     * content is kept in the audit history - nothing is silently overwritten).
     */
    public ModuleInstructionDto restoreVersion(String moduleKey, String version, String user) {
        ModuleInstructionDto current = cache.get(moduleKey);
        if (current == null) {
            return null;
        }
        InstructionVersion target = current.getVersions().stream()
                .filter(v -> v.getVersion().equals(version))
                .findFirst()
                .orElse(null);
        if (target == null) {
            return null;
        }
        String author = user != null && !user.isBlank() ? user : "System Administrator";
        String now = LocalDateTime.now().format(TS);

        List<InstructionVersion> versions = new ArrayList<>(current.getVersions());
        versions.add(0, InstructionVersion.builder()
                .version(current.getVersion())
                .content(current.getContent())
                .updatedBy(current.getUpdatedBy())
                .updatedAt(current.getUpdatedAt())
                .changeSummary("Restored to version " + version)
                .build());

        ModuleInstructionDto updated = ModuleInstructionDto.builder()
                .moduleKey(moduleKey)
                .name(current.getName())
                .description(current.getDescription())
                .enabled(current.isEnabled())
                .content(target.getContent())
                .version(bumpVersion(current.getVersion()))
                .updatedBy(author)
                .updatedAt(now)
                .versions(versions)
                .build();
        cache.put(moduleKey, updated);
        log.info("AI module instruction '{}' restored to v{} by {}", moduleKey, version, author);
        return updated;
    }

    private String bumpVersion(String version) {
        if (version == null) {
            return "1.0.1";
        }
        String[] parts = version.split("\\.");
        try {
            int patch = parts.length > 2 ? Integer.parseInt(parts[2]) + 1 : 1;
            String major = parts.length > 0 ? parts[0] : "1";
            String minor = parts.length > 1 ? parts[1] : "0";
            return major + "." + minor + "." + patch;
        } catch (NumberFormatException e) {
            return "1.0.1";
        }
    }

    /**
     * Detects the active module from a route/context string, e.g. the frontend
     * pathname. Falls back to global-only (empty) when no module matches.
     */
    public Optional<String> detectModule(String route) {
        if (route == null || route.isBlank()) {
            return Optional.empty();
        }
        String path = route.toLowerCase();
        if (path.contains("reservation") || path.contains("approval") || path.contains("calendar")
                || path.contains("facility") || path.contains("room") || path.contains("equipment")
                || path.contains("asset")) {
            return Optional.of("reservations");
        }
        if (path.contains("visitor")) {
            return Optional.of("visitor_management");
        }
        if (path.contains("document") || path.contains("folder") || path.contains("tag")) {
            return Optional.of("document_management");
        }
        if (path.contains("retention") || path.contains("disposal") || path.contains("compliance") || path.contains("records")) {
            return Optional.of("records_management");
        }
        if (path.contains("legal") || path.contains("case") || path.contains("notice")) {
            return Optional.of("legal_management");
        }
        if (path.contains("contract") || path.contains("vendor") || path.contains("procurement") || path.contains("obligation")) {
            return Optional.of("contract_management");
        }
        return Optional.empty();
    }
}