package com.photonicomega.facilities.config;

import com.photonicomega.facilities.module.auth.domain.Permission;
import com.photonicomega.facilities.module.auth.domain.PermissionAction;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class BootstrapAdmin implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        if (userRepository.findByEmailAndDeletedFalse("admin@photonicomega.com").isEmpty()) {
            log.info("Creating bootstrap admin user...");

            Permission allPermission = Permission.builder()
                    .name("ALL")
                    .displayName("All Permissions")
                    .description("Grants full system access")
                    .module("SYSTEM")
                    .resource("*")
                    .action(PermissionAction.MANAGE)
                    .build();

            Role superAdminRole = Role.builder()
                    .name("SUPER_ADMIN")
                    .displayName("Super Administrator")
                    .description("System super administrator with unrestricted access")
                    .systemRole(true)
                    .permissions(Set.of(allPermission))
                    .build();

            userRepository.save(User.builder()
                    .email("admin@photonicomega.com")
                    .passwordHash(passwordEncoder.encode("Admin2026!"))
                    .firstName("System")
                    .lastName("Administrator")
                    .employeeId("ADMIN-001")
                    .department("IT")
                    .position("System Administrator")
                    .status(UserStatus.ACTIVE)
                    .emailVerified(true)
                    .roles(Set.of(superAdminRole))
                    .build());

            log.info("Bootstrap admin user created.");
        }

        if (userRepository.findByEmailAndDeletedFalse("fm@photonicomega.com").isEmpty()) {
            log.info("Creating bootstrap facilities manager user...");

            Permission fmPermission = Permission.builder()
                    .name("FACILITIES_MANAGE")
                    .displayName("Facilities Management")
                    .description("Grants access to facilities management modules")
                    .module("FACILITIES")
                    .resource("*")
                    .action(PermissionAction.MANAGE)
                    .build();

            Role fmRole = Role.builder()
                    .name("FACILITIES_MANAGER")
                    .displayName("Facilities Manager")
                    .description("Facilities manager with operational access")
                    .systemRole(true)
                    .permissions(Set.of(fmPermission))
                    .build();

            userRepository.save(User.builder()
                    .email("fm@photonicomega.com")
                    .passwordHash(passwordEncoder.encode("Fm2026!"))
                    .firstName("Facilities")
                    .lastName("Manager")
                    .employeeId("FM-001")
                    .department("Facilities")
                    .position("Facilities Manager")
                    .status(UserStatus.ACTIVE)
                    .emailVerified(true)
                    .roles(Set.of(fmRole))
                    .build());

            log.info("Bootstrap facilities manager user created.");
        }
    }
}
