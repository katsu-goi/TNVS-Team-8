package com.photonicomega.facilities.config;

import com.photonicomega.facilities.module.auth.domain.Permission;
import com.photonicomega.facilities.module.auth.domain.PermissionAction;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.RoleConflict;
import com.photonicomega.facilities.module.auth.repository.PermissionRepository;
import com.photonicomega.facilities.module.auth.repository.RoleConflictRepository;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;

@Component
@RequiredArgsConstructor
@Order(20)
public class RbacCatalogBootstrap implements CommandLineRunner {

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final RoleConflictRepository roleConflictRepository;

    @Override
    @Transactional
    public void run(String... args) {
        Role superAdmin = upsertRole("SUPER_ADMIN", "Super Administrator",
                "Administers users, roles, permissions, hierarchy, and constraints.", "admin");
        Role systemAdmin = upsertRole("SYSTEM_ADMIN", "System Administrator",
                "Administers system health, backups, integrations, AI configuration, and platform operations.",
                "system-admin");
        Role facilitiesOfficer = upsertRole("FACILITIES_OFFICER", "Facilities Officer",
                "Handles day-to-day facilities operations.", "facilities-officer");
        Role facilitiesManager = upsertRole("FACILITIES_MANAGER", "Facilities Manager",
                "Manages facilities and inherits facilities officer capabilities.", "facilities");
        Role complianceOfficer = upsertRole("COMPLIANCE_OFFICER", "Compliance Officer",
                "Handles day-to-day compliance monitoring and evidence workflows.", "compliance");
        Role complianceManager = upsertRole("COMPLIANCE_MANAGER", "Compliance Manager",
                "Oversees compliance operations, subordinate review, and management approvals.",
                "compliance-manager");
        Role legalOfficer = upsertRole("LEGAL_OFFICER", "Legal Officer",
                "Manages legal operations and reviews.", "legal");
        upsertRole("CONTRACT_OFFICER", "Contract Officer",
                "Manages contracts and procurement.", "procurement");
        Role employee = upsertRole("EMPLOYEE", "Employee",
                "Uses employee self-service features.", "employee");

        Role dpo = upsertRole("DATA_PROTECTION_OFFICER", "Data Protection Officer",
                "Oversees privacy, data protection, and compliance.", "privacy");
        Role counsel = upsertRole("LEGAL_COUNSEL", "Legal Counsel",
                "Provides legal advice and inherits legal officer capabilities.", "counsel");
        Role records = upsertRole("RECORDS_OFFICER", "Records Officer",
                "Manages records, retention, and controlled disposal.", "records");
        Role departmentHead = upsertRole("DEPARTMENT_HEAD", "Department Head",
                "Reviews departmental activity and approvals.", "department");
        Role security = upsertRole("SECURITY_OFFICER", "Security Officer",
                "Monitors physical and operational security.", "security");
        Role infosec = upsertRole("INFOSEC_OFFICER", "Information Security Officer",
                "Oversees information-security risk and controls.", "infosec");

        grant(superAdmin, upsertPermission("RBAC_ADMINISTER", "Administer RBAC",
                "Assign and revoke roles and permissions, hierarchy, and SoD constraints.",
                "SYSTEM", "RBAC", PermissionAction.MANAGE));
        grant(superAdmin, upsertPermission("USER_OVERSIGHT", "User Oversight",
                "Review users and start audited read-only impersonation sessions.",
                "SYSTEM", "USERS", PermissionAction.MANAGE));
        grant(systemAdmin, upsertPermission("SYSTEM_ADMINISTER", "Administer System Operations",
                "Manage platform health, backups, integrations, AI configuration, and system operations.",
                "SYSTEM", "OPERATIONS", PermissionAction.MANAGE));
        grant(complianceManager, upsertPermission("COMPLIANCE_OVERSIGHT", "Compliance Oversight",
                "Review compliance and records activity through audited read-only shadow sessions.",
                "COMPLIANCE", "OVERSIGHT", PermissionAction.READ));
        grant(dpo, upsertPermission("PRIVACY_OVERSIGHT", "Privacy Oversight",
                "Review privacy, data-protection, and compliance controls.",
                "PRIVACY", "*", PermissionAction.MANAGE));
        grant(counsel, upsertPermission("LEGAL_COUNSEL_OPERATIONS", "Legal Counsel Operations",
                "Review legal matters and provide counsel.",
                "LEGAL", "COUNSEL", PermissionAction.MANAGE));
        grant(records, upsertPermission("RECORDS_MANAGE", "Records Management",
                "Manage records, retention, and disposal workflows.",
                "RECORDS", "*", PermissionAction.MANAGE));
        grant(departmentHead, upsertPermission("DEPARTMENT_APPROVE", "Department Approval",
                "Review and approve department-level requests.",
                "DEPARTMENT", "*", PermissionAction.APPROVE));
        Permission securityMonitor = upsertPermission("SECURITY_MONITOR", "Security Monitoring",
                "Read security events, sessions, and alerts.",
                "SECURITY", "*", PermissionAction.READ);
        grant(security, securityMonitor);
        grant(infosec, securityMonitor);
        grant(infosec, upsertPermission("INFOSEC_MANAGE", "Information Security Management",
                "Manage information-security risks and controls.",
                "SECURITY", "INFOSEC", PermissionAction.MANAGE));

        inherit(facilitiesManager, facilitiesOfficer);
        inherit(counsel, legalOfficer);
        inherit(departmentHead, employee);
        inherit(security, employee);
        inherit(infosec, employee);

        removeInheritance(dpo, complianceOfficer);
        removeInheritance(records, complianceOfficer);

        upsertConflict("SOD_PRIVACY_SECURITY", dpo, security,
                "Privacy oversight and operational security must be assigned to different users.");
        upsertConflict("SOD_PRIVACY_COMPLIANCE", dpo, complianceOfficer,
                "Privacy oversight and compliance execution must be assigned to different users.");
        upsertConflict("SOD_RECORDS_COMPLIANCE", records, complianceOfficer,
                "Records custody and compliance execution must be assigned to different users.");
        upsertConflict("SOD_LEGAL_RECORDS", counsel, records,
                "Legal counsel and records custody must be assigned to different users.");
        upsertConflict("SOD_PHYSICAL_INFOSEC", security, infosec,
                "Physical security and information-security oversight must be assigned to different users.");
    }

    private Role upsertRole(String name, String displayName, String description, String dashboardKey) {
        Role role = roleRepository.findByName(name).orElseGet(() -> Role.builder()
                .name(name)
                .permissions(new HashSet<>())
                .inheritedRoles(new HashSet<>())
                .build());
        role.setDisplayName(displayName);
        role.setDescription(description);
        role.setDashboardKey(dashboardKey);
        role.setSystemRole(true);
        return roleRepository.save(role);
    }

    private Permission upsertPermission(
            String name,
            String displayName,
            String description,
            String module,
            String resource,
            PermissionAction action
    ) {
        Permission permission = permissionRepository.findByName(name).orElseGet(() -> Permission.builder()
                .name(name)
                .build());
        permission.setDisplayName(displayName);
        permission.setDescription(description);
        permission.setModule(module);
        permission.setResource(resource);
        permission.setAction(action);
        return permissionRepository.save(permission);
    }

    private void grant(Role role, Permission permission) {
        role.getPermissions().add(permission);
        roleRepository.save(role);
    }

    private void inherit(Role senior, Role junior) {
        senior.getInheritedRoles().add(junior);
        roleRepository.save(senior);
    }

    private void removeInheritance(Role senior, Role junior) {
        senior.getInheritedRoles().removeIf(role -> role.getName().equals(junior.getName()));
        roleRepository.save(senior);
    }

    private void upsertConflict(String code, Role first, Role second, String description) {
        RoleConflict conflict = roleConflictRepository.findByCodeAndDeletedFalse(code)
                .orElseGet(() -> RoleConflict.builder().code(code).build());
        conflict.setFirstRole(first);
        conflict.setSecondRole(second);
        conflict.setDescription(description);
        conflict.setActive(true);
        conflict.setDeleted(false);
        roleConflictRepository.save(conflict);
    }
}
