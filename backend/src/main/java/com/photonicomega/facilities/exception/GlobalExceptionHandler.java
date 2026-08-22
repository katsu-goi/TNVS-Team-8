package com.photonicomega.facilities.exception;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.auth.dto.LoginLockoutInfo;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleResourceNotFound(
            ResourceNotFoundException ex, HttpServletRequest request) {
        log.warn("Resource not found: {} at {}", ex.getMessage(), request.getRequestURI());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.failure(ex.getMessage(), "RESOURCE_NOT_FOUND"));
    }

    @ExceptionHandler(ResourceAlreadyExistsException.class)
    public ResponseEntity<ApiResponse<Void>> handleResourceAlreadyExists(
            ResourceAlreadyExistsException ex, HttpServletRequest request) {
        log.warn("Resource already exists: {} at {}", ex.getMessage(), request.getRequestURI());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.failure(ex.getMessage(), "RESOURCE_ALREADY_EXISTS"));
    }

    @ExceptionHandler(BusinessRuleViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessRule(
            BusinessRuleViolationException ex, HttpServletRequest request) {
        log.warn("Business rule violation: {} at {}", ex.getMessage(), request.getRequestURI());
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(ApiResponse.failure(ex.getMessage(), "BUSINESS_RULE_VIOLATION"));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiResponse<Void>> handleAuthException(
            AuthenticationException ex, HttpServletRequest request) {
        log.warn("Authentication error: {} at {}", ex.getMessage(), request.getRequestURI());
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.failure(ex.getMessage(), ex.getErrorCode()));
    }

    @ExceptionHandler(LoginFailedException.class)
    public ResponseEntity<ApiResponse<LoginLockoutInfo>> handleLoginFailed(LoginFailedException ex) {
        LoginLockoutInfo info = ex.getInfo();
        boolean locked = info.isPermanentlyLocked() || info.getLockSecondsRemaining() > 0;
        HttpStatus status = locked ? HttpStatus.LOCKED : HttpStatus.UNAUTHORIZED;
        return ResponseEntity.status(status)
                .body(ApiResponse.<LoginLockoutInfo>builder()
                        .success(false)
                        .message(ex.getMessage())
                        .errorCode(ex.getErrorCode())
                        .data(info)
                        .build());
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiResponse<Void>> handleBadCredentials(HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.failure("Invalid email or password", "INVALID_CREDENTIALS"));
    }

    @ExceptionHandler(LockedException.class)
    public ResponseEntity<ApiResponse<Void>> handleLocked(LockedException ex) {
        return ResponseEntity.status(HttpStatus.LOCKED)
                .body(ApiResponse.failure(ex.getMessage(), "ACCOUNT_LOCKED"));
    }

    @ExceptionHandler(DisabledException.class)
    public ResponseEntity<ApiResponse<Void>> handleDisabled(DisabledException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.failure("Account is disabled", "ACCOUNT_DISABLED"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(HttpServletRequest request) {
        log.warn("Access denied at {}", request.getRequestURI());
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.failure("Access denied: insufficient permissions", "ACCESS_DENIED"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        List<String> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .toList();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure("Validation failed", errors, "VALIDATION_ERROR"));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConstraintViolation(ConstraintViolationException ex) {
        List<String> errors = ex.getConstraintViolations().stream()
                .map(cv -> cv.getPropertyPath() + ": " + cv.getMessage())
                .toList();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure("Constraint violation", errors, "CONSTRAINT_VIOLATION"));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Void>> handleMaxUploadSize(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(ApiResponse.failure("File size exceeds maximum allowed limit (100MB)", "FILE_TOO_LARGE"));
    }

    // ------------------------------------------------------------------
    // Request-binding failures.
    //
    // These are all caller mistakes, and every one of them used to fall
    // through to handleGenericException and come back as HTTP 500. This class
    // does not extend ResponseEntityExceptionHandler, so Spring's own
    // 400/415/406 mappings never applied - the catch-all won instead.
    //
    // Reporting a caller mistake as a server fault is a governance defect, not
    // just a cosmetic one: in the audit trail "the request was malformed" and
    // "the platform broke" become indistinguishable, and any alert gated on
    // 5xx fires on ordinary user typos.
    // ------------------------------------------------------------------

    /** A required query parameter, header, cookie, or multipart part was not sent. */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingParameter(
            MissingServletRequestParameterException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure("Required request parameter '" + ex.getParameterName()
                        + "' (" + ex.getParameterType() + ") is missing.", "MISSING_PARAMETER"));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingPart(MissingServletRequestPartException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure("Required multipart file part '" + ex.getRequestPartName()
                        + "' is missing.", "MISSING_PARAMETER"));
    }

    /**
     * Catches the remaining {@link ServletRequestBindingException} subtypes -
     * missing request header, missing cookie, missing path variable, missing
     * matrix variable - so none of them can reach the catch-all either.
     */
    @ExceptionHandler(ServletRequestBindingException.class)
    public ResponseEntity<ApiResponse<Void>> handleBindingFailure(ServletRequestBindingException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure("Request is missing required data: " + ex.getMessage(),
                        "MISSING_PARAMETER"));
    }

    /**
     * A supplied value could not be converted to the declared type - most often
     * a path variable that is not a valid UUID, or a query parameter that is
     * not a valid enum constant or number.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        String expected = ex.getRequiredType() == null ? "the expected type"
                : ex.getRequiredType().getSimpleName();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure("Parameter '" + ex.getName() + "' has an invalid value "
                        + "'" + ex.getValue() + "'; expected " + expected + ".", "INVALID_PARAMETER"));
    }

    /** Body present but unparseable, or absent when the handler requires one. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleUnreadableBody(HttpMessageNotReadableException ex) {
        log.warn("Malformed request body: {}", ex.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure("Request body is missing or is not valid JSON.",
                        "MALFORMED_REQUEST_BODY"));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleUnsupportedMediaType(
            HttpMediaTypeNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .body(ApiResponse.failure("Content type " + ex.getContentType()
                        + " is not supported by this endpoint. Supported: "
                        + ex.getSupportedMediaTypes() + ".", "UNSUPPORTED_MEDIA_TYPE"));
    }

    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotAcceptable(HttpMediaTypeNotAcceptableException ex) {
        return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE)
                .body(ApiResponse.failure("This endpoint cannot produce any of the requested media "
                        + "types. Supported: " + ex.getSupportedMediaTypes() + ".", "NOT_ACCEPTABLE"));
    }

    /** Unmatched routes must be a 404, not a 500. */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResourceFound(
            NoResourceFoundException ex, HttpServletRequest request) {
        log.warn("No handler for {} {}", request.getMethod(), request.getRequestURI());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.failure("Endpoint not found: "
                        + request.getMethod() + " " + request.getRequestURI(), "ENDPOINT_NOT_FOUND"));
    }

    /** Known path called with an unsupported HTTP method (e.g. DELETE on a GET-only endpoint). */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        log.warn("Method {} not supported at {}", request.getMethod(), request.getRequestURI());
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(ApiResponse.failure("Method not allowed: "
                        + request.getMethod() + " " + request.getRequestURI(), "METHOD_NOT_ALLOWED"));
    }

    @ExceptionHandler(FileStorageException.class)
    public ResponseEntity<ApiResponse<Void>> handleFileStorage(FileStorageException ex) {
        log.error("File storage error: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.failure(ex.getMessage(), "FILE_STORAGE_ERROR"));
    }

    @ExceptionHandler(AiServiceException.class)
    public ResponseEntity<ApiResponse<Void>> handleAiService(AiServiceException ex) {
        log.error("AI service error: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.failure("AI service temporarily unavailable: " + ex.getMessage(), "AI_SERVICE_ERROR"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGenericException(
            Exception ex, HttpServletRequest request) {
        log.error("Unhandled exception at {}: {}", request.getRequestURI(), ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.failure("An unexpected error occurred. Please contact system administrator.", "INTERNAL_SERVER_ERROR"));
    }
}
