package com.photonicomega.facilities.module.visitor.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.visitor.domain.*;
import com.photonicomega.facilities.module.visitor.repository.VisitorRepository;
import com.photonicomega.facilities.module.visitor.service.VisitorVerificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/v1/visitors")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Visitor Management", description = "Endpoints for visitor registration, QR passes, check-in/out, and ID verification")
@PreAuthorize("hasRole('FACILITIES_OFFICER')")
public class VisitorController {

    private final VisitorRepository visitorRepository;
    private final VisitorVerificationService verificationService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    @GetMapping
    @Operation(summary = "List all visitors")
    public ResponseEntity<ApiResponse<List<Visitor>>> getAllVisitors() {
        return ResponseEntity.ok(ApiResponse.success(visitorRepository.findAll(), "Visitors list retrieved"));
    }

    @PostMapping("/register")
    @Operation(summary = "Register a new visitor pass")
    public ResponseEntity<ApiResponse<Visitor>> registerVisitor(@RequestBody Visitor visitor) {
        visitor.setStatus(VisitorStatus.REGISTERED);
        visitor.setQrCodeToken("QR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        return ResponseEntity.ok(ApiResponse.success(visitorRepository.save(visitor), "Visitor registered and pass generated"));
    }

    @PostMapping("/{id}/check-in")
    @Operation(summary = "Check in visitor")
    public ResponseEntity<ApiResponse<Visitor>> checkInVisitor(@PathVariable UUID id) {
        return visitorRepository.findById(id).map(v -> {
            v.setStatus(VisitorStatus.CHECKED_IN);
            v.setActualArrival(LocalDateTime.now());
            Visitor saved = visitorRepository.save(v);
            // Side effect only - notifyHostOfArrival never throws, so the
            // response shape and status of this endpoint are unchanged.
            verificationService.notifyHostOfArrival(saved);
            return ResponseEntity.ok(ApiResponse.success(saved, "Visitor checked in"));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/check-out")
    @Operation(summary = "Check out visitor")
    public ResponseEntity<ApiResponse<Visitor>> checkOutVisitor(@PathVariable UUID id) {
        return visitorRepository.findById(id).map(v -> {
            v.setStatus(VisitorStatus.CHECKED_OUT);
            v.setActualDeparture(LocalDateTime.now());
            return ResponseEntity.ok(ApiResponse.success(visitorRepository.save(v), "Visitor checked out"));
        }).orElse(ResponseEntity.notFound().build());
    }

    // ---------------------------------------------------------------
    // Verification (Task 4 - additive)
    // ---------------------------------------------------------------

    @PostMapping("/{id}/verify")
    @Operation(summary = "Verify a visitor's ID and screen them against the watchlist")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyVisitor(
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {

        IdType idType = parseIdType(body == null ? null : body.get("idType"));
        String idNumber = body == null ? null : Objects.toString(body.get("idNumber"), null);

        try {
            VisitorVerification result =
                    verificationService.verify(id, idType, idNumber, resolveUser(userDetails));
            String message = result.getWatchlistStatus() == WatchlistStatus.FLAGGED
                    ? "Visitor FLAGGED - watchlist match, security alert raised"
                    : "Visitor verified - no watchlist match";
            return ResponseEntity.ok(ApiResponse.success(toVerificationDto(result), message));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/verifications")
    @Operation(summary = "Verification history for one visitor, newest first")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getVerifications(@PathVariable UUID id) {
        List<Map<String, Object>> result = verificationService.listVerifications(id).stream()
                .map(this::toVerificationDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Verification history retrieved"));
    }

    // ---------------------------------------------------------------
    // Watchlist (Task 4 - additive)
    // ---------------------------------------------------------------

    @GetMapping("/watchlist")
    @Operation(summary = "List visitor watchlist entries")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getWatchlist() {
        List<Map<String, Object>> result = verificationService.listWatchlist().stream()
                .map(this::toWatchlistDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Visitor watchlist retrieved"));
    }

    @PostMapping("/watchlist")
    @Operation(summary = "Add an entry to the visitor watchlist")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addWatchlistEntry(
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {

        try {
            VisitorWatchlist saved = verificationService.addWatchlistEntry(
                    Objects.toString(body.get("fullName"), null),
                    Objects.toString(body.get("idNumber"), null),
                    Objects.toString(body.get("reason"), null),
                    resolveUser(userDetails));
            return ResponseEntity.ok(ApiResponse.success(toWatchlistDto(saved), "Watchlist entry added"));
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    @PostMapping("/watchlist/{id}/status")
    @Operation(summary = "Activate or deactivate a watchlist entry")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateWatchlistStatus(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {

        try {
            VisitorWatchlist saved = verificationService.updateWatchlistStatus(
                    id, Objects.toString(body.get("status"), null), resolveUser(userDetails));
            return ResponseEntity.ok(ApiResponse.success(toWatchlistDto(saved), "Watchlist entry updated"));
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    /**
     * GlobalExceptionHandler does not map IllegalArgumentException, so bad input
     * would otherwise surface as a 500. Handled locally rather than by widening
     * the shared handler, which would change status codes across every module.
     */
    private ResponseEntity<ApiResponse<Map<String, Object>>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest()
                .body(ApiResponse.failure(e.getMessage(), "VALIDATION_ERROR"));
    }

    // ---------------------------------------------------------------
    // DTO mappers (scalar fields only - no lazy associations touched)
    // ---------------------------------------------------------------

    private Map<String, Object> toVerificationDto(VisitorVerification v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", v.getId());
        m.put("visitorId", v.getVisitorId());
        m.put("idType", v.getIdType());
        m.put("idNumber", v.getIdNumber());
        // Re-inflated so the client gets a JSON object, not a JSON string.
        m.put("extractedFields", readExtractedFields(v.getExtractedFields()));
        m.put("matchScore", v.getMatchScore());
        m.put("watchlistStatus", v.getWatchlistStatus());
        m.put("verificationStatus", v.getVerificationStatus());
        m.put("verifiedAt", v.getVerifiedAt());
        m.put("verifiedBy", v.getVerifiedBy());
        m.put("notes", v.getNotes());
        m.put("createdAt", v.getCreatedAt());
        return m;
    }

    private Map<String, Object> toWatchlistDto(VisitorWatchlist w) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", w.getId());
        m.put("fullName", w.getFullName());
        m.put("idNumber", w.getIdNumber());
        m.put("reason", w.getReason());
        m.put("status", w.getStatus());
        m.put("createdAt", w.getCreatedAt());
        return m;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readExtractedFields(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            log.warn("Could not parse stored extracted_fields: {}", e.getMessage());
            return Map.of();
        }
    }

    /** Unknown or absent idType degrades to OTHER rather than rejecting the request. */
    private IdType parseIdType(Object raw) {
        if (raw == null) return IdType.OTHER;
        try {
            return IdType.valueOf(raw.toString().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return IdType.OTHER;
        }
    }

    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) return null;
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }
}
