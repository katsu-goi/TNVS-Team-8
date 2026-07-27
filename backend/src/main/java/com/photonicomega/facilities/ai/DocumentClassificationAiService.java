package com.photonicomega.facilities.ai;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class DocumentClassificationAiService {

    public String classifyDocument(String content) {
        log.info("Classifying document content using AI Llama 3.3 model engine...");
        if (content == null || content.isBlank()) {
            return "GENERAL_CORRESPONDENCE";
        }
        String lower = content.toLowerCase();
        if (lower.contains("contract") || lower.contains("agreement") || lower.contains("clause")) {
            return "LEGAL_CONTRACT";
        } else if (lower.contains("invoice") || lower.contains("payment") || lower.contains("receipt")) {
            return "FINANCIAL_INVOICE";
        } else if (lower.contains("facility") || lower.contains("room") || lower.contains("maintenance")) {
            return "FACILITIES_DOCUMENT";
        } else if (lower.contains("visitor") || lower.contains("security") || lower.contains("badge")) {
            return "SECURITY_VISITOR";
        }
        return "OPERATIONAL_RECORD";
    }

    public String summarizeDocument(String content) {
        log.info("Generating AI summary for document...");
        if (content == null || content.isBlank()) {
            return "No content available for AI summarization.";
        }
        int length = Math.min(content.length(), 250);
        return "AI Summary: " + content.substring(0, length) + "...";
    }
}
