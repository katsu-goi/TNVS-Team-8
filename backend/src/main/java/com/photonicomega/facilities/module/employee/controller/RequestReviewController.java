package com.photonicomega.facilities.module.employee.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.employee.service.RequestReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Review endpoints for employee contract/legal requests. Guarded by
 * {@link PreAuthorize}: only SUPER_ADMIN, CONTRACT_OFFICER and LEGAL_OFFICER
 * may call them; per-request-type authorization is enforced in
 * {@link RequestReviewService}.
 */
@RestController
@RequestMapping("/v1/requests-review")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('SUPER_ADMIN','CONTRACT_OFFICER','LEGAL_OFFICER')")
@Tag(name = "Request Review", description = "Review and decide employee contract/legal requests")
public class RequestReviewController {

    private final RequestReviewService reviewService;
    private final UserRepository userRepository;

    @GetMapping
    @Operation(summary = "List requests visible to the reviewer (all statuses)")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listForReview(
            @AuthenticationPrincipal UserDetails userDetails) {
        List<Map<String, Object>> requests = reviewService.listForReview(resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(requests, "Requests retrieved"));
    }

    @GetMapping("/pending")
    @Operation(summary = "List pending/in-review requests visible to the reviewer")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listPending(
            @AuthenticationPrincipal UserDetails userDetails) {
        List<Map<String, Object>> requests = reviewService.listPending(resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(requests, "Pending requests retrieved"));
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "Approve a pending/in-review request (notifies requester)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approve(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Map<String, Object> request = reviewService.approve(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(request, "Request approved"));
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "Reject a pending/in-review request (notifies requester)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reject(
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        String reason = body != null ? Objects.toString(body.get("reason"), null) : null;
        Map<String, Object> request = reviewService.reject(id, reason, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(request, "Request rejected"));
    }

    @PostMapping("/{id}/complete")
    @Operation(summary = "Complete an approved request (notifies requester)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> complete(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Map<String, Object> request = reviewService.complete(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(request, "Request completed"));
    }

    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) return null;
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }
}