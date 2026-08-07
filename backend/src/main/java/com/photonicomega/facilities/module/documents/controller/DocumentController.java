package com.photonicomega.facilities.module.documents.controller;

import com.photonicomega.facilities.ai.DocumentClassificationAiService;
import com.photonicomega.facilities.ai.OcrService;
import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.documents.domain.ClassificationLevel;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.documents.service.DocumentUploadService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/v1/documents")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Document Management & AI", description = "Endpoints for document management, OCR processing, and AI classification/summarization")
public class DocumentController {

    private final DocumentRepository documentRepository;
    private final DocumentClassificationAiService aiService;
    private final OcrService ocrService;
    private final DocumentUploadService uploadService;
    private final UserRepository userRepository;

    @GetMapping
    @Operation(summary = "List all documents")
    public ResponseEntity<ApiResponse<List<Document>>> getAllDocuments() {
        return ResponseEntity.ok(ApiResponse.success(documentRepository.findAll(), "Documents retrieved"));
    }

    @PostMapping
    @Operation(summary = "Upload and process document with AI OCR & Classification")
    public ResponseEntity<ApiResponse<Document>> createDocument(@RequestBody Document doc) {
        if (doc.getClassificationLevel() == null) {
            doc.setClassificationLevel(ClassificationLevel.INTERNAL);
        }
        if (doc.getStatus() == null) {
            doc.setStatus(DocumentStatus.APPROVED);
        }
        
        // AI OCR & Classification enrichment
        String extractedText = ocrService.extractTextFromImageOrPdf(new byte[0], doc.getFileName());
        doc.setOcrExtractedText(extractedText);
        doc.setAiPredictedCategory(aiService.classifyDocument(extractedText));
        doc.setAiSummary(aiService.summarizeDocument(extractedText));

        return ResponseEntity.ok(ApiResponse.success(documentRepository.save(doc), "Document uploaded & processed by AI"));
    }

    @GetMapping("/search")
    @Operation(summary = "Semantic & text search documents")
    public ResponseEntity<ApiResponse<List<Document>>> searchDocuments(@RequestParam String query) {
        return ResponseEntity.ok(ApiResponse.success(documentRepository.searchDocuments(query), "Search results retrieved"));
    }

    // ------------------------------------------------------------------
    // Real file upload / download pipeline (additive)
    // ------------------------------------------------------------------

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload a real file, store it, and run the OCR + AI classification pipeline")
    public ResponseEntity<ApiResponse<Document>> uploadDocument(
            @RequestPart(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam(value = "categoryId", required = false) UUID categoryId,
            @RequestParam(value = "folderId", required = false) UUID folderId,
            @RequestParam(value = "classificationLevel", required = false) ClassificationLevel classificationLevel,
            @AuthenticationPrincipal UserDetails userDetails,
            HttpServletRequest request) {

        List<String> errors = uploadService.validate(file);
        if (!errors.isEmpty()) {
            return ResponseEntity.badRequest().body(
                    ApiResponse.failure("Upload rejected", errors, "INVALID_UPLOAD"));
        }

        Document saved = uploadService.upload(file, title, categoryId, folderId,
                classificationLevel, resolveUser(userDetails), clientIp(request));

        return ResponseEntity.ok(ApiResponse.success(saved,
                "Document uploaded, stored and processed by AI"));
    }

    @GetMapping("/{id}/download")
    @Operation(summary = "Download the stored file for a document")
    public ResponseEntity<?> downloadDocument(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserDetails userDetails,
            HttpServletRequest request) {

        Optional<Document> found = documentRepository.findById(id);
        if (found.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("Document not found: " + id, "RESOURCE_NOT_FOUND"));
        }

        Document document = found.get();
        String filePath = document.getFilePath();
        if (filePath == null || filePath.isBlank()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.failure(
                    "Document '" + document.getTitle() + "' has no stored file. "
                            + "It was created as metadata only - use POST /v1/documents/upload to attach a file.",
                    "FILE_NOT_STORED"));
        }

        Resource resource;
        try {
            resource = new InputStreamResource(uploadService.openStoredFile(filePath));
        } catch (IOException e) {
            log.warn("Stored file missing for document {} at {}: {}", id, filePath, e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.failure(
                    "The stored file for this document is no longer available on the file server.",
                    "FILE_NOT_FOUND"));
        }

        uploadService.auditDownload(document, resolveUser(userDetails), clientIp(request));

        return ResponseEntity.ok()
                .contentType(resolveMediaType(document.getFileType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, attachmentHeader(document.getFileName()))
                .body(resource);
    }

    // ------------------------------------------------------------------
    // shared helpers
    // ------------------------------------------------------------------

    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) {
            return null;
        }
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }

    private String clientIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private MediaType resolveMediaType(String fileType) {
        if (fileType == null || fileType.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(fileType);
        } catch (org.springframework.http.InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    /**
     * Content-Disposition using the original filename, with an RFC 5987
     * filename* so non-ASCII names survive.
     */
    private String attachmentHeader(String fileName) {
        String safe = fileName == null || fileName.isBlank() ? "document" : fileName;
        String ascii = safe.replaceAll("[\\r\\n\"\\\\]", "_");
        String encoded = URLEncoder.encode(safe, StandardCharsets.UTF_8).replace("+", "%20");
        return "attachment; filename=\"" + ascii + "\"; filename*=UTF-8''" + encoded;
    }
}
