package com.photonicomega.facilities.module.auth.repository;

import com.photonicomega.facilities.module.auth.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID>, JpaSpecificationExecutor<User> {

    Optional<User> findByEmailAndDeletedFalse(String email);

    Optional<User> findByEmployeeIdAndDeletedFalse(String employeeId);

    boolean existsByEmailAndDeletedFalse(String email);

    boolean existsByEmployeeIdAndDeletedFalse(String employeeId);

    @Query("SELECT u FROM User u JOIN FETCH u.roles r JOIN FETCH r.permissions WHERE u.email = :email AND u.deleted = false")
    Optional<User> findByEmailWithRolesAndPermissions(String email);

    @Query("SELECT DISTINCT u FROM User u JOIN u.roles r WHERE r.name = :roleName AND u.deleted = false")
    List<User> findByRoleName(@Param("roleName") String roleName);
}
