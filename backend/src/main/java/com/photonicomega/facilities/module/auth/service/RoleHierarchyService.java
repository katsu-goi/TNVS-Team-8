package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.Permission;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.RoleConflict;
import com.photonicomega.facilities.module.auth.repository.RoleConflictRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RoleHierarchyService {

    private static final Map<String, Integer> DASHBOARD_PRIORITY = Map.ofEntries(
            Map.entry("SUPER_ADMIN", 0),
            Map.entry("DATA_PROTECTION_OFFICER", 10),
            Map.entry("LEGAL_COUNSEL", 20),
            Map.entry("RECORDS_OFFICER", 30),
            Map.entry("DEPARTMENT_HEAD", 40),
            Map.entry("SECURITY_OFFICER", 50),
            Map.entry("INFOSEC_OFFICER", 60),
            Map.entry("FACILITIES_MANAGER", 70),
            Map.entry("FACILITIES_OFFICER", 80),
            Map.entry("COMPLIANCE_OFFICER", 90),
            Map.entry("LEGAL_OFFICER", 100),
            Map.entry("CONTRACT_OFFICER", 110),
            Map.entry("EMPLOYEE", 120)
    );

    private final RoleConflictRepository roleConflictRepository;

    public Set<Role> resolveEffectiveRoles(Collection<Role> assignedRoles) {
        Set<Role> effective = new LinkedHashSet<>();
        Set<String> visited = new HashSet<>();
        Set<String> visiting = new HashSet<>();
        assignedRoles.stream()
                .sorted(Comparator.comparing(Role::getName))
                .forEach(role -> visit(role, visiting, visited, effective));
        return effective;
    }

    public Set<Permission> resolveEffectivePermissions(Collection<Role> assignedRoles) {
        return resolveEffectiveRoles(assignedRoles).stream()
                .flatMap(role -> role.getPermissions().stream())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    public List<RoleConflict> findConflicts(Collection<Role> assignedRoles) {
        Set<String> effectiveNames = resolveEffectiveRoles(assignedRoles).stream()
                .map(Role::getName)
                .collect(Collectors.toSet());
        return roleConflictRepository.findAllByActiveTrueAndDeletedFalse().stream()
                .filter(conflict -> effectiveNames.contains(conflict.getFirstRole().getName())
                        && effectiveNames.contains(conflict.getSecondRole().getName()))
                .toList();
    }

    public List<RoleConflict> findRelevantConstraints(Collection<Role> assignedRoles) {
        Set<String> effectiveNames = resolveEffectiveRoles(assignedRoles).stream()
                .map(Role::getName)
                .collect(Collectors.toSet());
        return roleConflictRepository.findAllByActiveTrueAndDeletedFalse().stream()
                .filter(conflict -> effectiveNames.contains(conflict.getFirstRole().getName())
                        || effectiveNames.contains(conflict.getSecondRole().getName()))
                .toList();
    }

    public void assertNoConflicts(Collection<Role> assignedRoles) {
        List<RoleConflict> conflicts = findConflicts(assignedRoles);
        if (!conflicts.isEmpty()) {
            String details = conflicts.stream()
                    .map(conflict -> conflict.getFirstRole().getDisplayName()
                            + " conflicts with " + conflict.getSecondRole().getDisplayName())
                    .collect(Collectors.joining("; "));
            throw new BusinessRuleViolationException("Separation of Duties violation: " + details);
        }
    }

    public void assertInheritanceDoesNotCycle(Role seniorRole, Role juniorRole) {
        if (seniorRole.getName().equals(juniorRole.getName())) {
            throw new BusinessRuleViolationException("A role cannot inherit itself.");
        }
        boolean juniorAlreadyInheritsSenior = resolveEffectiveRoles(Set.of(juniorRole)).stream()
                .anyMatch(role -> role.getName().equals(seniorRole.getName()));
        if (juniorAlreadyInheritsSenior) {
            throw new BusinessRuleViolationException(
                    "Role hierarchy cycle detected between " + seniorRole.getName()
                            + " and " + juniorRole.getName() + ".");
        }
    }

    public String resolveDashboardKey(Collection<Role> assignedRoles) {
        return assignedRoles.stream()
                .filter(role -> role.getDashboardKey() != null && !role.getDashboardKey().isBlank())
                .min(Comparator.comparingInt(role -> DASHBOARD_PRIORITY.getOrDefault(role.getName(), 1_000)))
                .map(Role::getDashboardKey)
                .orElse("employee");
    }

    private void visit(
            Role role,
            Set<String> visiting,
            Set<String> visited,
            Set<Role> effective
    ) {
        String roleName = role.getName();
        if (visited.contains(roleName)) return;
        if (!visiting.add(roleName)) {
            throw new BusinessRuleViolationException("Role hierarchy cycle detected at " + roleName + ".");
        }
        effective.add(role);
        role.getInheritedRoles().stream()
                .sorted(Comparator.comparing(Role::getName))
                .forEach(inherited -> visit(inherited, visiting, visited, effective));
        visiting.remove(roleName);
        visited.add(roleName);
    }
}
