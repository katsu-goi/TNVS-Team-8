package com.photonicomega.facilities.ai;

import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.facilities.repository.FacilityRepository;
import com.photonicomega.facilities.module.facilities.repository.ReservationRepository;
import com.photonicomega.facilities.module.facilities.repository.RoomRepository;
import com.photonicomega.facilities.module.legal.repository.LegalCaseRepository;
import com.photonicomega.facilities.module.records.repository.RetentionPolicyRepository;
import com.photonicomega.facilities.module.visitor.repository.VisitorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Builds a live, real-data context snapshot for the active module so the AI
 * assistant grounds answers in actual system state (counts, statuses) instead
 * of fabricated numbers. Each module exposes the entities that actually exist
 * in the system; unknown modules return an empty context.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ModuleDataContextService {

    private final FacilityRepository facilityRepository;
    private final RoomRepository roomRepository;
    private final ReservationRepository reservationRepository;
    private final VisitorRepository visitorRepository;
    private final DocumentRepository documentRepository;
    private final RetentionPolicyRepository retentionPolicyRepository;
    private final LegalCaseRepository legalCaseRepository;
    private final ContractRepository contractRepository;

    public Optional<String> dataContext(String moduleKey) {
        if (moduleKey == null || moduleKey.isBlank()) {
            return Optional.empty();
        }
        Map<String, Object> snapshot = new LinkedHashMap<>();
        switch (moduleKey) {
            case "reservations" -> {
                snapshot.put("facilities", count(facilityRepository::count));
                snapshot.put("rooms", count(roomRepository::count));
                snapshot.put("reservations", count(reservationRepository::count));
            }
            case "visitor_management" -> {
                snapshot.put("visitors", count(visitorRepository::count));
            }
            case "document_management" -> {
                snapshot.put("documents", count(documentRepository::count));
            }
            case "records_management" -> {
                snapshot.put("retentionPolicies", count(retentionPolicyRepository::count));
            }
            case "legal_management" -> {
                snapshot.put("legalCases", count(legalCaseRepository::count));
            }
            case "contract_management" -> {
                snapshot.put("contracts", count(contractRepository::count));
            }
            default -> {
                return Optional.empty();
            }
        }
        if (snapshot.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(snapshot.toString());
    }

    private long count(LongSupplier supplier) {
        try {
            return supplier.getAsLong();
        } catch (Exception e) {
            log.debug("Module data context count unavailable: {}", e.getMessage());
            return 0;
        }
    }

    @FunctionalInterface
    private interface LongSupplier {
        long getAsLong();
    }
}