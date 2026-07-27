package com.photonicomega.facilities.module.documents.repository;

import com.photonicomega.facilities.module.documents.domain.Folder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FolderRepository extends JpaRepository<Folder, UUID> {
    List<Folder> findByParentIdNull();
    List<Folder> findByParentId(UUID parentId);
}
