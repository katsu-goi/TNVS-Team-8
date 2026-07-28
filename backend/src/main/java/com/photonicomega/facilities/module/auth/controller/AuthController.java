package com.photonicomega.facilities.module.auth.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.auth.dto.*;
import com.photonicomega.facilities.module.auth.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "Authentication and authorization endpoints")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    @Operation(summary = "Login", description = "Authenticate with email and password, returns JWT tokens")
    public ResponseEntity<ApiResponse<AuthTokenResponse>> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {
        AuthTokenResponse response = authService.login(
                request, getClientIp(httpRequest), httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(ApiResponse.success(response, "Login successful"));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh access token")
    public ResponseEntity<ApiResponse<AuthTokenResponse>> refreshToken(
            @Valid @RequestBody RefreshTokenRequest request,
            HttpServletRequest httpRequest) {
        AuthTokenResponse response = authService.refreshToken(
                request.getRefreshToken(), getClientIp(httpRequest),
                httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(ApiResponse.success(response, "Token refreshed"));
    }

    @PostMapping("/logout")
    @Operation(summary = "Logout")
    public ResponseEntity<ApiResponse<Void>> logout(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody(required = false) RefreshTokenRequest request) {
        authService.logout(null, request != null ? request.getRefreshToken() : null);
        return ResponseEntity.ok(ApiResponse.success("Logged out successfully"));
    }

    @PostMapping("/forgot-password")
    @Operation(summary = "Request password reset")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request,
            HttpServletRequest httpRequest) {
        authService.requestPasswordReset(request, getClientIp(httpRequest));
        return ResponseEntity.ok(ApiResponse.success(
                "If your email is registered, you will receive password reset instructions."));
    }

    @PostMapping("/reset-password")
    @Operation(summary = "Reset password with token")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request,
            HttpServletRequest httpRequest) {
        authService.resetPassword(request, getClientIp(httpRequest));
        return ResponseEntity.ok(ApiResponse.success("Password reset successfully. Please login."));
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
