package com.photonicomega.facilities.module.auth.repository;

import com.photonicomega.facilities.module.auth.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;

@Repository
public interface UserRepository extends JpaRepository<User, UUID>, JpaSpecificationExecutor<User> {

    Optional<User> findByEmailAndDeletedFalse(String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.email = :email AND u.deleted = false")
    Optional<User> findByEmailAndDeletedFalseForUpdate(@Param("email") String email);

    Optional<User> findByEmployeeIdAndDeletedFalse(String employeeId);

    boolean existsByEmailAndDeletedFalse(String email);

    boolean existsByEmployeeIdAndDeletedFalse(String employeeId);

    @Query("SELECT DISTINCT u FROM User u LEFT JOIN FETCH u.roles r LEFT JOIN FETCH r.permissions WHERE u.email = :email AND u.deleted = false")
    Optional<User> findByEmailWithRolesAndPermissions(String email);

    List<User> findAllByDeletedFalseOrderByEmailAsc();

    @Query("SELECT DISTINCT u FROM User u JOIN u.roles r WHERE r.name = :roleName AND u.deleted = false")
    List<User> findByRoleName(@Param("roleName") String roleName);
}
