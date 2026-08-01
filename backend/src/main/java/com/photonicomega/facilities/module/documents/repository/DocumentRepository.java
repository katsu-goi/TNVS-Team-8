package com.photonicomega.facilities.module.documents.repository;

import com.photonicomega.facilities.module.documents.domain.ClassificationLevel;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DocumentRepository extends JpaRepository<Document, UUID> {

    List<Document> findByFolderId(UUID folderId);
    List<Document> findByCategoryId(UUID categoryId);
    List<Document> findByStatus(DocumentStatus status);
    long countByStatus(DocumentStatus status);
    List<Document> findByClassificationLevel(ClassificationLevel level);
    List<Document> findByCreatedByAndDeletedFalseOrderByCreatedAtDesc(String createdBy);

    @Query("""
        SELECT d FROM Document d
        WHERE LOWER(d.title) LIKE LOWER(CONCAT('%', :query, '%'))
        OR LOWER(d.ocrExtractedText) LIKE LOWER(CONCAT('%', :query, '%'))
        OR LOWER(d.aiSummary) LIKE LOWER(CONCAT('%', :query, '%'))
    """)
    List<Document> searchDocuments(@Param("query") String query);
}
