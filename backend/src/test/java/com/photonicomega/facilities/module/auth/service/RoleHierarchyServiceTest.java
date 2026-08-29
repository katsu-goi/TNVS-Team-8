package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.Permission;
import com.photonicomega.facilities.module.auth.domain.PermissionAction;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.RoleConflict;
import com.photonicomega.facilities.module.auth.repository.RoleConflictRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RoleHierarchyServiceTest {

    @Mock
    private RoleConflictRepository roleConflictRepository;

    private RoleHierarchyService service;

    @BeforeEach
    void setUp() {
        service = new RoleHierarchyService(roleConflictRepository);
    }

    @Test
    void inheritedRolesAndPermissionsAreIncludedInEffectiveAccess() {
        Permission inheritedPermission = permission("FACILITIES_READ");
        Role officer = role("FACILITIES_OFFICER");
        officer.setPermissions(Set.of(inheritedPermission));

        Role manager = role("FACILITIES_MANAGER");
        manager.setInheritedRoles(Set.of(officer));

        assertEquals(
                Set.of("FACILITIES_MANAGER", "FACILITIES_OFFICER"),
                service.resolveEffectiveRoles(Set.of(manager)).stream()
                        .map(Role::getName)
                        .collect(java.util.stream.Collectors.toSet())
        );
        assertEquals(Set.of(inheritedPermission), service.resolveEffectivePermissions(Set.of(manager)));
    }

    @Test
    void hierarchyCyclesAreRejected() {
        Role first = role("FIRST");
        Role second = role("SECOND");
        first.setInheritedRoles(Set.of(second));
        second.setInheritedRoles(Set.of(first));

        BusinessRuleViolationException exception = assertThrows(
                BusinessRuleViolationException.class,
                () -> service.resolveEffectiveRoles(Set.of(first))
        );

        assertTrue(exception.getMessage().contains("Role hierarchy cycle detected"));
    }

    @Test
    void addingAnExistingReverseInheritanceIsRejected() {
        Role senior = role("SENIOR");
        Role junior = role("JUNIOR");
        junior.setInheritedRoles(Set.of(senior));

        BusinessRuleViolationException exception = assertThrows(
                BusinessRuleViolationException.class,
                () -> service.assertInheritanceDoesNotCycle(senior, junior)
        );

        assertTrue(exception.getMessage().contains("Role hierarchy cycle detected"));
    }

    @Test
    void activeSeparationOfDutiesConflictsAreRejected() {
        Role privacy = role("DATA_PROTECTION_OFFICER");
        Role security = role("SECURITY_OFFICER");
        RoleConflict conflict = RoleConflict.builder()
                .firstRole(privacy)
                .secondRole(security)
                .code("SOD_PRIVACY_SECURITY")
                .description("The roles must remain separate.")
                .active(true)
                .build();
        when(roleConflictRepository.findAllByActiveTrueAndDeletedFalse()).thenReturn(List.of(conflict));

        BusinessRuleViolationException exception = assertThrows(
                BusinessRuleViolationException.class,
                () -> service.assertNoConflicts(Set.of(privacy, security))
        );

        assertTrue(exception.getMessage().contains("Separation of Duties violation"));
    }

    @Test
    void highestPriorityAssignedDashboardWins() {
        Role employee = role("EMPLOYEE");
        employee.setDashboardKey("employee");
        Role departmentHead = role("DEPARTMENT_HEAD");
        departmentHead.setDashboardKey("department");

        assertEquals(
                "department",
                service.resolveDashboardKey(Set.of(employee, departmentHead))
        );
    }

    private Role role(String name) {
        return Role.builder()
                .name(name)
                .displayName(name)
                .description(name)
                .build();
    }

    private Permission permission(String name) {
        return Permission.builder()
                .name(name)
                .displayName(name)
                .description(name)
                .module("TEST")
                .resource("*")
                .action(PermissionAction.READ)
                .build();
    }
}
