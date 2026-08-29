package com.photonicomega.facilities.module.auth.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.dto.RbacDashboardDto;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.auth.service.RbacProfileService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/rbac")
@RequiredArgsConstructor
public class RbacProfileController {

    private final UserRepository userRepository;
    private final RbacProfileService rbacProfileService;

    @GetMapping("/me/dashboard")
    public ResponseEntity<ApiResponse<RbacDashboardDto>> getDashboardProfile(
            @AuthenticationPrincipal UserDetails principal
    ) {
        User user = userRepository.findByEmailWithRolesAndPermissions(principal.getUsername())
                .orElseThrow(() -> new ResourceNotFoundException("User", "email", principal.getUsername()));
        return ResponseEntity.ok(ApiResponse.success(rbacProfileService.dashboard(user)));
    }
}
