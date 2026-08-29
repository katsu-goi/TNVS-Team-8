package com.photonicomega.facilities.module.admin.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.admin.dto.UserDTO;
import com.photonicomega.facilities.module.auth.dto.CreateRoleConflictRequest;
import com.photonicomega.facilities.module.auth.dto.RbacConflictDto;
import com.photonicomega.facilities.module.auth.dto.RbacPermissionDto;
import com.photonicomega.facilities.module.auth.dto.RbacRoleDto;
import com.photonicomega.facilities.module.auth.service.RbacAdministrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/admin/rbac")
@RequiredArgsConstructor
public class RbacAdminController {

    private final RbacAdministrationService rbacAdministrationService;

    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<UserDTO>>> listUsers() {
        return ResponseEntity.ok(ApiResponse.success(rbacAdministrationService.listUsers()));
    }

    @GetMapping("/roles")
    public ResponseEntity<ApiResponse<List<RbacRoleDto>>> listRoles() {
        return ResponseEntity.ok(ApiResponse.success(rbacAdministrationService.listRoles()));
    }

    @GetMapping("/permissions")
    public ResponseEntity<ApiResponse<List<RbacPermissionDto>>> listPermissions() {
        return ResponseEntity.ok(ApiResponse.success(rbacAdministrationService.listPermissions()));
    }

    @GetMapping("/conflicts")
    public ResponseEntity<ApiResponse<List<RbacConflictDto>>> listConflicts() {
        return ResponseEntity.ok(ApiResponse.success(rbacAdministrationService.listConflicts()));
    }

    @PutMapping("/users/{userId}/roles/{roleId}")
    public ResponseEntity<ApiResponse<Void>> assignRole(
            @PathVariable UUID userId,
            @PathVariable UUID roleId,
            @AuthenticationPrincipal UserDetails principal
    ) {
        rbacAdministrationService.assignRole(userId, roleId, principal.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Role assigned successfully"));
    }

    @DeleteMapping("/users/{userId}/roles/{roleId}")
    public ResponseEntity<ApiResponse<Void>> revokeRole(
            @PathVariable UUID userId,
            @PathVariable UUID roleId,
            @AuthenticationPrincipal UserDetails principal
    ) {
        rbacAdministrationService.revokeRole(userId, roleId, principal.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Role revoked successfully"));
    }

    @PutMapping("/roles/{roleId}/permissions/{permissionId}")
    public ResponseEntity<ApiResponse<Void>> grantPermission(
            @PathVariable UUID roleId,
            @PathVariable UUID permissionId,
            @AuthenticationPrincipal UserDetails principal
    ) {
        rbacAdministrationService.grantPermission(roleId, permissionId, principal.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Permission granted successfully"));
    }

    @DeleteMapping("/roles/{roleId}/permissions/{permissionId}")
    public ResponseEntity<ApiResponse<Void>> revokePermission(
            @PathVariable UUID roleId,
            @PathVariable UUID permissionId,
            @AuthenticationPrincipal UserDetails principal
    ) {
        rbacAdministrationService.revokePermission(roleId, permissionId, principal.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Permission revoked successfully"));
    }

    @PutMapping("/hierarchy/{seniorRoleId}/{juniorRoleId}")
    public ResponseEntity<ApiResponse<Void>> addInheritance(
            @PathVariable UUID seniorRoleId,
            @PathVariable UUID juniorRoleId,
            @AuthenticationPrincipal UserDetails principal
    ) {
        rbacAdministrationService.addInheritance(seniorRoleId, juniorRoleId, principal.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Role inheritance added successfully"));
    }

    @DeleteMapping("/hierarchy/{seniorRoleId}/{juniorRoleId}")
    public ResponseEntity<ApiResponse<Void>> removeInheritance(
            @PathVariable UUID seniorRoleId,
            @PathVariable UUID juniorRoleId,
            @AuthenticationPrincipal UserDetails principal
    ) {
        rbacAdministrationService.removeInheritance(seniorRoleId, juniorRoleId, principal.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Role inheritance removed successfully"));
    }

    @PostMapping("/conflicts")
    public ResponseEntity<ApiResponse<RbacConflictDto>> createConflict(
            @Valid @RequestBody CreateRoleConflictRequest request,
            @AuthenticationPrincipal UserDetails principal
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                rbacAdministrationService.createConflict(request, principal.getUsername()),
                "Separation of Duties constraint created"
        ));
    }

    @DeleteMapping("/conflicts/{conflictId}")
    public ResponseEntity<ApiResponse<Void>> deactivateConflict(
            @PathVariable UUID conflictId,
            @AuthenticationPrincipal UserDetails principal
    ) {
        rbacAdministrationService.deactivateConflict(conflictId, principal.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Constraint deactivated successfully"));
    }
}
