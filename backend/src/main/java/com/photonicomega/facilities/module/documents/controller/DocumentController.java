package com.photonicomega.facilities.module.documents.controller;

import com.photonicomega.facilities.ai.DocumentClassificationAiService;
import com.photonicomega.facilities.ai.OcrService;
import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.documents.domain.ClassificationLevel;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/documents")
@RequiredArgsConstructor
@Tag(name = "Document Management & AI", description = "Endpoints for document management, OCR processing, and AI classification/summarization")
public class DocumentController {

    private final DocumentRepository documentRepository;
    private final DocumentClassificationAiService aiService;
    private final OcrService ocrService;

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
}
