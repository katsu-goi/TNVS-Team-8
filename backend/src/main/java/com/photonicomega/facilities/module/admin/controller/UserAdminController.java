package com.photonicomega.facilities.module.admin.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.admin.dto.UserDTO;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.auth.service.AuditService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/admin/users")
@RequiredArgsConstructor
@Tag(name = "User Management", description = "Administrative user management")
public class UserAdminController {

    private final UserRepository userRepository;
    private final AuditService auditService;

    @GetMapping
    @Operation(summary = "List all users")
    public ResponseEntity<ApiResponse<List<UserDTO>>> listUsers() {
        List<UserDTO> users = userRepository.findAll().stream()
                .map(UserDTO::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(users));
    }

    @PostMapping("/{id}/unlock")
    @Operation(summary = "Unlock a user account",
            description = "Clears the login lockout (failed-attempt counter and lock expiry) so the user can sign in again")
    public ResponseEntity<ApiResponse<Void>> unlockUser(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserDetails admin) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", id));
        user.resetFailedAttempts();
        userRepository.save(user);
        auditService.log(admin != null
                        ? userRepository.findByEmailAndDeletedFalse(admin.getUsername()).orElse(null)
                        : null,
                "USER_UNLOCKED", "ADMIN", "User", id.toString(),
                "Account " + user.getEmail() + " unlocked after login lockout", null);
        return ResponseEntity.ok(ApiResponse.success("Account unlocked successfully"));
    }
}
