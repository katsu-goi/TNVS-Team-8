package com.photonicomega.facilities.module.documents.service;

import com.photonicomega.facilities.ai.DocumentClassificationAiService;
import com.photonicomega.facilities.ai.OcrService;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.service.AuditService;
import com.photonicomega.facilities.module.documents.domain.Category;
import com.photonicomega.facilities.module.documents.domain.ClassificationLevel;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.domain.Folder;
import com.photonicomega.facilities.module.documents.domain.Tag;
import com.photonicomega.facilities.module.documents.repository.CategoryRepository;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.documents.repository.FolderRepository;
import com.photonicomega.facilities.module.documents.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Upload pipeline for the Document Management module: store the bytes,
 * run OCR + AI classification + summarisation, derive tags, persist, audit.
 *
 * <p>Additive - the pre-existing JSON endpoint (POST /v1/documents) is
 * untouched and keeps its own inline AI enrichment.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentUploadService {

    private static final String MODULE = "DOCUMENTS";

    /**
     * How much of the stored file is handed to the OCR engine. The current
     * OcrService is heuristic and ignores the bytes, so reading a bounded
     * prefix keeps a 100 MB upload from being pulled into the heap.
     */
    private static final int OCR_SAMPLE_BYTES = 256 * 1024;

    private static final int MAX_AUTO_TAGS = 3;

    /** Tags derived from the AI predicted category, most specific first. */
    private static final Map<String, List<String>> CATEGORY_TAGS = Map.of(
            "LEGAL_CONTRACT", List.of("legal", "contract", "ai-classified"),
            "FINANCIAL_INVOICE", List.of("finance", "invoice", "ai-classified"),
            "FACILITIES_DOCUMENT", List.of("facilities", "maintenance", "ai-classified"),
            "SECURITY_VISITOR", List.of("security", "visitor", "ai-classified"),
            "OPERATIONAL_RECORD", List.of("operations", "record", "ai-classified"),
            "GENERAL_CORRESPONDENCE", List.of("general", "correspondence", "ai-classified"));

    /** Categories the classifier falls back to when nothing matched. */
    private static final Set<String> LOW_SIGNAL_CATEGORIES =
            Set.of("GENERAL_CORRESPONDENCE", "OPERATIONAL_RECORD");

    private final DocumentRepository documentRepository;
    private final TagRepository tagRepository;
    private final CategoryRepository categoryRepository;
    private final FolderRepository folderRepository;
    private final DocumentStorageService storageService;
    private final OcrService ocrService;
    private final DocumentClassificationAiService aiService;
    private final AuditService auditService;

    /**
     * Validates the multipart part before anything is written to disk.
     *
     * @return a list of human-readable problems; empty when the file is acceptable
     */
    public List<String> validate(MultipartFile file) {
        List<String> errors = new ArrayList<>();

        if (file == null) {
            errors.add("No file was supplied. Send the file under the 'file' form field.");
            return errors;
        }
        // MultipartFile.isEmpty() is also true for a present-but-0-byte part,
        // so report that case as an empty file rather than a missing one.
        if (file.isEmpty() || file.getSize() <= 0) {
            errors.add("The uploaded file is empty (0 bytes).");
            return errors;
        }
        if (file.getSize() > DocumentStorageService.MAX_FILE_SIZE_BYTES) {
            errors.add("File exceeds the 100MB limit (received "
                    + (file.getSize() / (1024 * 1024)) + "MB).");
        }

        String extension = storageService.extensionOf(file.getOriginalFilename());
        if (extension.isEmpty()) {
            errors.add("The file has no extension. Allowed types: "
                    + String.join(", ", DocumentStorageService.ALLOWED_EXTENSIONS) + ".");
        } else if (!storageService.isAllowedExtension(extension)) {
            errors.add("File type '." + extension + "' is not allowed. Allowed types: "
                    + String.join(", ", DocumentStorageService.ALLOWED_EXTENSIONS) + ".");
        }

        return errors;
    }

    /**
     * Stores the file, runs the full AI pipeline, persists the document and
     * writes the audit trail. Returns the saved entity.
     */
    @Transactional
    public Document upload(MultipartFile file,
                           String title,
                           UUID categoryId,
                           UUID folderId,
                           ClassificationLevel classificationLevel,
                           User user,
                           String ipAddress) {

        String originalFilename = file.getOriginalFilename();
        DocumentStorageService.StoredFile stored = storageService.store(file);

        Document document = new Document();
        document.setTitle(resolveTitle(title, originalFilename));
        document.setFileName(originalFilename);
        document.setFileType(file.getContentType());
        document.setFileSize(file.getSize());
        document.setFilePath(stored.absolutePath());
        document.setStatus(DocumentStatus.PENDING_REVIEW);
        document.setClassificationLevel(
                classificationLevel != null ? classificationLevel : ClassificationLevel.INTERNAL);
        document.setVersionNumber(1);

        if (categoryId != null) {
            categoryRepository.findById(categoryId).ifPresent(document::setCategory);
        }
        if (folderId != null) {
            folderRepository.findById(folderId).ifPresent(document::setFolder);
        }

        // --- AI pipeline: OCR -> classify -> summarise -> confidence ---
        String extractedText = ocrService.extractTextFromImageOrPdf(
                readOcrSample(stored.absolutePath()), originalFilename);
        String predictedCategory = aiService.classifyDocument(extractedText);

        document.setOcrExtractedText(extractedText);
        document.setAiPredictedCategory(predictedCategory);
        document.setAiSummary(aiService.summarizeDocument(extractedText));
        document.setConfidenceScore(estimateConfidence(predictedCategory, extractedText));

        document.setTags(resolveAutoTags(predictedCategory));

        Document saved = documentRepository.save(document);

        auditService.log(user, "UPLOAD_DOCUMENT", MODULE, "Document", saved.getId().toString(),
                "Uploaded document: " + saved.getTitle()
                        + " (" + saved.getFileName() + ", " + saved.getFileSize() + " bytes)"
                        + " - AI category: " + predictedCategory
                        + ", confidence: " + saved.getConfidenceScore()
                        + (stored.usedFallback() ? " [stored in fallback location]" : ""),
                ipAddress);

        log.info("Document {} uploaded by {} - AI category {} (confidence {})",
                saved.getId(), user != null ? user.getEmail() : "anonymous",
                predictedCategory, saved.getConfidenceScore());

        return toResponseSafe(saved);
    }

    /** Records a download in the audit trail. */
    public void auditDownload(Document document, User user, String ipAddress) {
        auditService.log(user, "DOWNLOAD_DOCUMENT", MODULE, "Document", document.getId().toString(),
                "Downloaded document: " + document.getTitle() + " (" + document.getFileName() + ")",
                ipAddress);
    }

    /**
     * Opens a stored document for streaming.
     *
     * @throws IOException when the path no longer resolves to a readable file
     */
    public InputStream openStoredFile(String absolutePath) throws IOException {
        return storageService.openStream(absolutePath);
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private String resolveTitle(String title, String originalFilename) {
        if (title != null && !title.isBlank()) {
            return title.trim();
        }
        if (originalFilename == null || originalFilename.isBlank()) {
            return "Untitled document";
        }
        int dot = originalFilename.lastIndexOf('.');
        return dot > 0 ? originalFilename.substring(0, dot) : originalFilename;
    }

    /**
     * Reads a bounded prefix of the stored file for the OCR engine. A read
     * failure is not fatal - OCR simply runs against an empty sample.
     */
    private byte[] readOcrSample(String absolutePath) {
        try (InputStream in = storageService.openStream(absolutePath)) {
            return in.readNBytes(OCR_SAMPLE_BYTES);
        } catch (IOException e) {
            log.warn("Could not read stored file for OCR ({}): {}", absolutePath, e.getMessage());
            return new byte[0];
        }
    }

    /**
     * Heuristic confidence in the AI category, in the 0.00 - 1.00 range that
     * documents.confidence_score numeric(5,2) stores.
     */
    private BigDecimal estimateConfidence(String predictedCategory, String extractedText) {
        double score = 0.55;

        if (predictedCategory != null && !LOW_SIGNAL_CATEGORIES.contains(predictedCategory)) {
            // A specific category means a keyword actually matched.
            score += 0.25;
        }
        if (extractedText != null && extractedText.length() >= 120) {
            score += 0.10;
        }
        if (extractedText != null && !extractedText.isBlank()) {
            // Reward repeated evidence for the chosen category.
            long hits = CATEGORY_TAGS.getOrDefault(predictedCategory, List.of()).stream()
                    .filter(tag -> extractedText.toLowerCase(Locale.ROOT).contains(tag))
                    .count();
            score += Math.min(hits, 2) * 0.04;
        }

        score = Math.max(0.05, Math.min(0.99, score));
        return BigDecimal.valueOf(score).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Resolves up to {@value #MAX_AUTO_TAGS} tags for the predicted category,
     * creating any that do not exist yet. Idempotent: re-uploading the same
     * kind of document reuses the same Tag rows.
     */
    private Set<Tag> resolveAutoTags(String predictedCategory) {
        List<String> names = CATEGORY_TAGS.getOrDefault(predictedCategory, List.of("ai-classified"));
        Set<Tag> tags = new LinkedHashSet<>();

        for (String name : names.stream().limit(MAX_AUTO_TAGS).toList()) {
            Tag tag = tagRepository.findByName(name)
                    .orElseGet(() -> tagRepository.save(Tag.builder().name(name).build()));
            tags.add(tag);
        }
        return tags;
    }

    /**
     * The service runs with open-in-view disabled, so the entity is detached
     * by the time Jackson sees it. Folder in particular is bidirectional
     * (parent / subfolders) and would either blow up on lazy init or recurse
     * forever, so the associations are replaced with flat, already-populated
     * copies carrying just what the UI needs.
     */
    private Document toResponseSafe(Document saved) {
        Folder folder = saved.getFolder();
        if (folder != null) {
            Folder flat = new Folder();
            flat.setId(folder.getId());
            flat.setName(folder.getName());
            flat.setPath(folder.getPath());
            saved.setFolder(flat);
        }

        Category category = saved.getCategory();
        if (category != null) {
            Category flat = new Category();
            flat.setId(category.getId());
            flat.setName(category.getName());
            flat.setDescription(category.getDescription());
            saved.setCategory(flat);
        }

        return saved;
    }
}
