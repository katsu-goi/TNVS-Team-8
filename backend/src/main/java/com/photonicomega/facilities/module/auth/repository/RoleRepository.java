package com.photonicomega.facilities.module.auth.repository;

import com.photonicomega.facilities.module.auth.domain.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.List;
import java.util.UUID;

@Repository
public interface RoleRepository extends JpaRepository<Role, UUID> {
    Optional<Role> findByName(String name);

    List<Role> findAllByDeletedFalseOrderByNameAsc();
}
