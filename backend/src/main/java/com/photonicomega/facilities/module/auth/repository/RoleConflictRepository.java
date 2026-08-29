package com.photonicomega.facilities.module.auth.repository;

import com.photonicomega.facilities.module.auth.domain.RoleConflict;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RoleConflictRepository extends JpaRepository<RoleConflict, UUID> {
    List<RoleConflict> findAllByActiveTrueAndDeletedFalse();

    List<RoleConflict> findAllByDeletedFalseOrderByCodeAsc();

    Optional<RoleConflict> findByCodeAndDeletedFalse(String code);

    @Query("""
            SELECT CASE WHEN COUNT(conflict) > 0 THEN true ELSE false END
            FROM RoleConflict conflict
            WHERE conflict.deleted = false
              AND ((conflict.firstRole.id = :firstRoleId AND conflict.secondRole.id = :secondRoleId)
                OR (conflict.firstRole.id = :secondRoleId AND conflict.secondRole.id = :firstRoleId))
            """)
    boolean existsByUnorderedRolePair(
            @Param("firstRoleId") UUID firstRoleId,
            @Param("secondRoleId") UUID secondRoleId
    );
}
