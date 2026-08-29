package com.photonicomega.facilities.config;

import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.rbac.bootstrap.enabled", havingValue = "true")
@Order(30)
@Slf4j
public class RbacProvisioningRunner implements CommandLineRunner {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.rbac.bootstrap.passwords.super-admin:}")
    private String superAdminPassword;
    @Value("${app.rbac.bootstrap.passwords.dpo:}")
    private String dpoPassword;
    @Value("${app.rbac.bootstrap.passwords.legal-counsel:}")
    private String legalCounselPassword;
    @Value("${app.rbac.bootstrap.passwords.records:}")
    private String recordsPassword;
    @Value("${app.rbac.bootstrap.passwords.department-head:}")
    private String departmentHeadPassword;
    @Value("${app.rbac.bootstrap.passwords.security:}")
    private String securityPassword;
    @Value("${app.rbac.bootstrap.passwords.infosec:}")
    private String infosecPassword;

    @Override
    @Transactional
    public void run(String... args) {
        List<BootstrapAccount> accounts = List.of(
                new BootstrapAccount("superadmin@photonicomega.com", superAdminPassword,
                        "Super", "Administrator", "RBAC-SA-001", "IT", "Super Administrator", "SUPER_ADMIN"),
                new BootstrapAccount("dpo@photonicomega.com", dpoPassword,
                        "Data Protection", "Officer", "RBAC-DPO-001", "Privacy", "Data Protection Officer", "DATA_PROTECTION_OFFICER"),
                new BootstrapAccount("counsel@photonicomega.com", legalCounselPassword,
                        "Legal", "Counsel", "RBAC-LC-001", "Legal", "Legal Counsel", "LEGAL_COUNSEL"),
                new BootstrapAccount("records@photonicomega.com", recordsPassword,
                        "Records", "Officer", "RBAC-RO-001", "Records", "Records Officer", "RECORDS_OFFICER"),
                new BootstrapAccount("dept.head@photonicomega.com", departmentHeadPassword,
                        "Department", "Head", "RBAC-DH-001", "Operations", "Department Head", "DEPARTMENT_HEAD"),
                new BootstrapAccount("security@photonicomega.com", securityPassword,
                        "Security", "Officer", "RBAC-SO-001", "Security", "Security Officer", "SECURITY_OFFICER"),
                new BootstrapAccount("infosec@photonicomega.com", infosecPassword,
                        "Information Security", "Officer", "RBAC-ISO-001", "Information Security", "Information Security Officer", "INFOSEC_OFFICER")
        );

        accounts.forEach(this::createIfMissing);
    }

    private void createIfMissing(BootstrapAccount account) {
        if (userRepository.findByEmailAndDeletedFalse(account.email()).isPresent()) {
            log.info("RBAC bootstrap account already exists: {}", account.email());
            return;
        }
        if (account.password() == null || account.password().isBlank()) {
            throw new IllegalStateException(
                    "RBAC bootstrap is enabled but a required password is missing for " + account.email());
        }

        Role role = roleRepository.findByName(account.roleName())
                .orElseThrow(() -> new IllegalStateException("Missing RBAC role: " + account.roleName()));
        userRepository.save(User.builder()
                .email(account.email())
                .passwordHash(passwordEncoder.encode(account.password()))
                .firstName(account.firstName())
                .lastName(account.lastName())
                .employeeId(account.employeeId())
                .department(account.department())
                .position(account.position())
                .status(UserStatus.ACTIVE)
                .emailVerified(true)
                .roles(Set.of(role))
                .build());
        log.info("Created RBAC bootstrap account {} with role {}", account.email(), account.roleName());
    }

    private record BootstrapAccount(
            String email,
            String password,
            String firstName,
            String lastName,
            String employeeId,
            String department,
            String position,
            String roleName
    ) {
    }
}
