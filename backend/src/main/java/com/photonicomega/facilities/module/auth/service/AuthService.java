package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.exception.AuthenticationException;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.exception.LoginFailedException;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.auth.domain.*;
import com.photonicomega.facilities.module.auth.dto.*;
import com.photonicomega.facilities.module.auth.repository.*;
import com.photonicomega.facilities.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final AuthenticationManager authenticationManager;
    private final UserDetailsService userDetailsService;
    private final PasswordEncoder passwordEncoder;
    private final JavaMailSender mailSender;
    private final AuditService auditService;
    private final LoginAttemptService loginAttemptService;
    private final RbacProfileService rbacProfileService;
    private final com.photonicomega.facilities.module.security.service.UserActivityService userActivityService;

    @Value("${app.security.password-reset-expiry-minutes:30}")
    private int passwordResetExpiryMinutes;

    @Value("${spring.mail.username}")
    private String fromEmail;

    public AuthTokenResponse login(LoginRequest request, String ipAddress, String userAgent) {
        String email = normalizeEmail(request.getEmail());

        // Server-side lockout gate: a locked account is rejected before any
        // password is checked, so the progressive/permanent lock cannot be
        // bypassed by refreshing the page, opening another browser, or
        // clearing browser storage.
        LoginLockoutInfo lockout = loginAttemptService.getCurrentLockoutInfo(email);
        if (lockout != null) {
            throw lockoutException(lockout);
        }

        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.getPassword()));
        } catch (org.springframework.security.core.AuthenticationException ex) {
            LoginLockoutInfo info = loginAttemptService.recordFailedAttempt(email, ipAddress, userAgent);
            if (info == null) {
                // Unknown account: keep the response generic so account existence
                // is never revealed.
                throw ex;
            }
            throw lockoutException(info);
        }

        User user = userRepository.findByEmailAndDeletedFalse(email)
                .orElseThrow(() -> new ResourceNotFoundException("User", "email", email));

        if (!user.isAccountActive()) {
            throw new BusinessRuleViolationException("Account is not active. Contact administrator.");
        }

        user.setLastLoginAt(LocalDateTime.now());
        user.setLastLoginIp(ipAddress);
        user.resetFailedAttempts();
        userRepository.save(user);

        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        String accessToken = jwtTokenProvider.generateAccessToken(userDetails);
        String refreshTokenStr = jwtTokenProvider.generateRefreshToken(userDetails);

        refreshTokenRepository.revokeAllUserTokens(user.getId());
        RefreshToken tokenEntity = RefreshToken.builder()
                .user(user)
                .token(refreshTokenStr)
                .expiresAt(LocalDateTime.now().plusDays(7))
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .build();
        refreshTokenRepository.save(tokenEntity);

        auditService.log(user, "LOGIN_SUCCESS", "AUTH", null, null,
                "User logged in successfully", ipAddress);

        userActivityService.registerSession(user, ipAddress, userAgent);

        return AuthTokenResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshTokenStr)
                .tokenType("Bearer")
                .expiresIn(900)
                .user(rbacProfileService.summarize(user))
                .build();
    }

    public AuthTokenResponse refreshToken(String refreshTokenStr, String ipAddress, String userAgent) {
        RefreshToken token = refreshTokenRepository.findByTokenAndRevokedFalse(refreshTokenStr)
                .orElseThrow(() -> AuthenticationException.invalidToken());

        if (token.isExpired()) {
            token.revoke();
            refreshTokenRepository.save(token);
            throw AuthenticationException.invalidToken();
        }

        User user = token.getUser();
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());

        if (!jwtTokenProvider.isRefreshTokenValid(refreshTokenStr, userDetails)) {
            throw AuthenticationException.invalidToken();
        }

        String newAccessToken = jwtTokenProvider.generateAccessToken(userDetails);
        String newRefreshToken = jwtTokenProvider.generateRefreshToken(userDetails);

        token.revoke();
        refreshTokenRepository.save(token);

        RefreshToken newToken = RefreshToken.builder()
                .user(user)
                .token(newRefreshToken)
                .expiresAt(LocalDateTime.now().plusDays(7))
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .build();
        refreshTokenRepository.save(newToken);

        return AuthTokenResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .tokenType("Bearer")
                .expiresIn(900)
                .user(rbacProfileService.summarize(user))
                .build();
    }

    public void logout(String username, String refreshTokenStr) {
        User user = (username != null && !username.isBlank())
                ? userRepository.findByEmailAndDeletedFalse(username).orElse(null)
                : null;
        if (user != null) {
            refreshTokenRepository.revokeAllUserTokens(user.getId());
            userActivityService.markOffline(user);
            auditService.log(user, "LOGOUT", "AUTH", null, null,
                    "User logged out", null);
        }
    }

    public void requestPasswordReset(ForgotPasswordRequest request, String ipAddress) {
        userRepository.findByEmailAndDeletedFalse(request.getEmail()).ifPresent(user -> {
            String token = UUID.randomUUID().toString();
            user.setPasswordResetToken(token);
            user.setPasswordResetExpiresAt(LocalDateTime.now().plusMinutes(passwordResetExpiryMinutes));
            userRepository.save(user);
            sendPasswordResetEmail(user, token);
            auditService.log(user, "PASSWORD_RESET_REQUESTED", "AUTH", null, null,
                    "Password reset requested", ipAddress);
        });
    }

    public void resetPassword(ResetPasswordRequest request, String ipAddress) {
        User user = userRepository.findAll().stream()
                .filter(u -> request.getToken().equals(u.getPasswordResetToken())
                        && u.getPasswordResetExpiresAt() != null
                        && LocalDateTime.now().isBefore(u.getPasswordResetExpiresAt())
                        && !u.isDeleted())
                .findFirst()
                .orElseThrow(() -> new AuthenticationException(
                        "Invalid or expired password reset token", "INVALID_RESET_TOKEN"));

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        user.setPasswordResetToken(null);
        user.setPasswordResetExpiresAt(null);
        userRepository.save(user);

        refreshTokenRepository.revokeAllUserTokens(user.getId());
        auditService.log(user, "PASSWORD_RESET_SUCCESS", "AUTH", null, null,
                "Password reset successfully", ipAddress);
    }

    private void sendPasswordResetEmail(User user, String token) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(user.getEmail());
            message.setSubject("Password Reset - Photonic Omega");
            message.setText(String.format(
                    "Dear %s,\n\nYour password reset token is: %s\n\n" +
                    "This token expires in %d minutes.\n\nRegards,\nPhotonic Omega System",
                    user.getFirstName(), token, passwordResetExpiryMinutes));
            mailSender.send(message);
        } catch (Exception e) {
            log.error("Failed to send password reset email: {}", e.getMessage());
        }
    }

    private String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase();
    }

    private LoginFailedException lockoutException(LoginLockoutInfo info) {
        if (info.isPermanentlyLocked()) {
            return new LoginFailedException(
                    "Your account has been temporarily locked due to multiple failed login attempts.",
                    "ACCOUNT_LOCKED", info);
        }
        if (info.getLockSecondsRemaining() > 0) {
            return new LoginFailedException(
                    "Too many failed login attempts. Please wait " + info.getLockSecondsRemaining()
                            + " seconds before trying again.",
                    "ACCOUNT_TEMP_LOCKED", info);
        }
        return new LoginFailedException("Invalid email or password", "INVALID_CREDENTIALS", info);
    }
}
