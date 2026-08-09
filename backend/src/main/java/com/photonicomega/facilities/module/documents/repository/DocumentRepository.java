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

    /** Candidates for retention auto-assignment (nightly retention job). */
    List<Document> findByRetentionPolicyIdIsNullAndDeletedFalse();

    /** Documents already under a retention schedule, for expiry alert scanning. */
    List<Document> findByRetentionExpiresAtIsNotNullAndDeletedFalse();

    /** Retention assigned but the expiry date was never computed - backfill target. */
    List<Document> findByRetentionPolicyIdIsNotNullAndRetentionExpiresAtIsNullAndDeletedFalse();

    /**
     * Fetch all documents with tags, category, and folder initialized, so the
     * entities stay serializable after the persistence context closes
     * (open-in-view: false). The {@code @BatchSize} on {@code Document.tags}
     * otherwise defers the collection load until first access, which happens
     * only during Jackson serialization - outside any live session.
     */
    @Query("""
        SELECT DISTINCT d FROM Document d
        LEFT JOIN FETCH d.tags
        LEFT JOIN FETCH d.category
        LEFT JOIN FETCH d.folder
    """)
    List<Document> findAllWithAssociations();

    @Query("""
        SELECT DISTINCT d FROM Document d
        LEFT JOIN FETCH d.tags
        LEFT JOIN FETCH d.category
        LEFT JOIN FETCH d.folder
        WHERE LOWER(d.title) LIKE LOWER(CONCAT('%', :query, '%'))
        OR LOWER(d.ocrExtractedText) LIKE LOWER(CONCAT('%', :query, '%'))
        OR LOWER(d.aiSummary) LIKE LOWER(CONCAT('%', :query, '%'))
    """)
    List<Document> searchDocuments(@Param("query") String query);
}
