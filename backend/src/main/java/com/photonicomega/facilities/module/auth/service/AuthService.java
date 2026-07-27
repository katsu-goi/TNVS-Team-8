package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.exception.AuthenticationException;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.auth.domain.*;
import com.photonicomega.facilities.module.auth.dto.*;
import com.photonicomega.facilities.module.auth.repository.*;
import com.photonicomega.facilities.security.JwtTokenProvider;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.RandomStringUtils;
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
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class AuthService {

    private final UserRepository userRepository;
    private final OtpRepository otpRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final AuditLogRepository auditLogRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final AuthenticationManager authenticationManager;
    private final UserDetailsService userDetailsService;
    private final PasswordEncoder passwordEncoder;
    private final JavaMailSender mailSender;
    private final AuditService auditService;

    @Value("${app.otp.length:6}")
    private int otpLength;

    @Value("${app.otp.expiry-seconds:30}")
    private int otpExpirySeconds;

    @Value("${app.otp.max-attempts:5}")
    private int otpMaxAttempts;

    @Value("${app.otp.lock-duration-minutes:15}")
    private int otpLockMinutes;

    @Value("${app.security.password-reset-expiry-minutes:30}")
    private int passwordResetExpiryMinutes;

    @Value("${spring.mail.username}")
    private String fromEmail;

    // ==================== LOGIN ====================

    public LoginInitResponse initiateLogin(LoginRequest request, String ipAddress) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));
        } catch (org.springframework.security.core.AuthenticationException ex) {
            handleFailedLogin(request.getEmail());
            throw ex;
        }

        User user = userRepository.findByEmailAndDeletedFalse(request.getEmail())
                .orElseThrow(() -> new ResourceNotFoundException("User", "email", request.getEmail()));

        if (!user.isAccountActive()) {
            throw new BusinessRuleViolationException("Account is not active. Contact administrator.");
        }

        // Generate and send OTP
        String otpCode = generateAndSaveOtp(user, OtpPurpose.LOGIN_VERIFICATION, ipAddress);
        sendOtpEmail(user, otpCode, "Login Verification OTP");

        auditService.log(user, "LOGIN_INITIATED", "AUTH", null, null,
                "Login initiated, OTP sent to " + maskEmail(user.getEmail()), ipAddress);

        return LoginInitResponse.builder()
                .userId(user.getId())
                .email(maskEmail(user.getEmail()))
                .otpExpirySeconds(otpExpirySeconds)
                .message("OTP sent to your registered email address.")
                .build();
    }

    public AuthTokenResponse verifyOtpAndLogin(OtpVerifyRequest request, String ipAddress,
                                                String userAgent) {
        User user = userRepository.findById(request.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getUserId()));

        List<OtpToken> activeOtps = otpRepository.findActiveOtpByUserAndPurpose(
                user.getId(), OtpPurpose.LOGIN_VERIFICATION);

        if (activeOtps.isEmpty()) {
            throw AuthenticationException.otpExpired();
        }

        OtpToken otp = activeOtps.get(0);

        if (otp.isLocked()) {
            throw AuthenticationException.otpLocked();
        }

        if (otp.isExpired()) {
            otp.markAsUsed();
            otpRepository.save(otp);
            throw AuthenticationException.otpExpired();
        }

        if (!otp.getOtpCode().equals(request.getOtpCode())) {
            otp.incrementFailedAttempts(otpMaxAttempts, otpLockMinutes);
            otpRepository.save(otp);
            if (otp.isLocked()) {
                throw AuthenticationException.otpMaxAttempts();
            }
            throw AuthenticationException.otpInvalid();
        }

        // OTP valid — mark as used and issue tokens
        otp.markAsUsed();
        otpRepository.save(otp);

        user.setLastLoginAt(LocalDateTime.now());
        user.setLastLoginIp(ipAddress);
        user.resetFailedAttempts();
        userRepository.save(user);

        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        String accessToken = jwtTokenProvider.generateAccessToken(userDetails);
        String refreshToken = jwtTokenProvider.generateRefreshToken(userDetails);

        // Persist refresh token
        refreshTokenRepository.revokeAllUserTokens(user.getId());
        RefreshToken tokenEntity = RefreshToken.builder()
                .user(user)
                .token(refreshToken)
                .expiresAt(LocalDateTime.now().plusDays(7))
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .build();
        refreshTokenRepository.save(tokenEntity);

        auditService.log(user, "LOGIN_SUCCESS", "AUTH", null, null,
                "User logged in successfully", ipAddress);

        return AuthTokenResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(900)
                .user(UserSummaryDto.from(user))
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
                .user(UserSummaryDto.from(user))
                .build();
    }

    public void logout(UUID userId, String refreshTokenStr) {
        refreshTokenRepository.revokeAllUserTokens(userId);
        User user = userRepository.findById(userId).orElse(null);
        auditService.log(user, "LOGOUT", "AUTH", null, null,
                "User logged out", null);
    }

    // ==================== OTP RESEND ====================

    public ResendOtpResponse resendOtp(UUID userId, String ipAddress) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        // Invalidate all previous OTPs
        otpRepository.invalidateAllActiveOtps(userId, OtpPurpose.LOGIN_VERIFICATION);

        String otpCode = generateAndSaveOtp(user, OtpPurpose.LOGIN_VERIFICATION, ipAddress);
        sendOtpEmail(user, otpCode, "Login Verification OTP (Resend)");

        return ResendOtpResponse.builder()
                .otpExpirySeconds(otpExpirySeconds)
                .message("New OTP sent to your registered email address.")
                .build();
    }

    // ==================== PASSWORD RESET ====================

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
        // Always return success to prevent email enumeration
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

    // ==================== HELPERS ====================

    private String generateAndSaveOtp(User user, OtpPurpose purpose, String ipAddress) {
        // Invalidate existing active OTPs
        otpRepository.invalidateAllActiveOtps(user.getId(), purpose);

        String code = RandomStringUtils.randomNumeric(otpLength);
        OtpToken otp = OtpToken.builder()
                .user(user)
                .otpCode(code)
                .purpose(purpose)
                .expiresAt(LocalDateTime.now().plusSeconds(otpExpirySeconds))
                .ipAddress(ipAddress)
                .build();
        otpRepository.save(otp);
        return code;
    }

    private void sendOtpEmail(User user, String code, String subject) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(user.getEmail());
            message.setSubject(subject + " - Photonic Omega");
            message.setText(String.format(
                    "Dear %s,\n\nYour verification OTP is: %s\n\nThis OTP expires in %d seconds.\n\n" +
                    "Do not share this OTP with anyone.\n\nRegards,\nPhotonic Omega System",
                    user.getFirstName(), code, otpExpirySeconds));
            mailSender.send(message);
        } catch (Exception e) {
            log.error("Failed to send OTP email to {}: {}", user.getEmail(), e.getMessage());
        }
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

    private void handleFailedLogin(String email) {
        userRepository.findByEmailAndDeletedFalse(email).ifPresent(user -> {
            user.incrementFailedAttempts();
            if (user.getFailedLoginAttempts() >= 5) {
                user.lockAccount(15);
            }
            userRepository.save(user);
        });
    }

    private String maskEmail(String email) {
        int atIndex = email.indexOf('@');
        if (atIndex <= 2) return email;
        return email.charAt(0) + "*".repeat(atIndex - 2) + email.charAt(atIndex - 1) + email.substring(atIndex);
    }
}
