package com.photonicomega.facilities.module.documents.repository;

import com.photonicomega.facilities.module.documents.domain.DocumentGrant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DocumentGrantRepository extends JpaRepository<DocumentGrant, UUID> {

    List<DocumentGrant> findByDocumentId(UUID documentId);

    void deleteByDocumentId(UUID documentId);
}
