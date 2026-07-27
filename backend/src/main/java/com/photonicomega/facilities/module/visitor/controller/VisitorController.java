package com.photonicomega.facilities.module.visitor.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.visitor.domain.Visitor;
import com.photonicomega.facilities.module.visitor.domain.VisitorStatus;
import com.photonicomega.facilities.module.visitor.repository.VisitorRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/visitors")
@RequiredArgsConstructor
@Tag(name = "Visitor Management", description = "Endpoints for visitor registration, QR passes, and check-in/out")
public class VisitorController {

    private final VisitorRepository visitorRepository;

    @GetMapping
    @Operation(summary = "List all visitors")
    public ResponseEntity<ApiResponse<List<Visitor>>> getAllVisitors() {
        return ResponseEntity.ok(ApiResponse.success(visitorRepository.findAll(), "Visitors list retrieved"));
    }

    @PostMapping("/register")
    @Operation(summary = "Register a new visitor pass")
    public ResponseEntity<ApiResponse<Visitor>> registerVisitor(@RequestBody Visitor visitor) {
        visitor.setStatus(VisitorStatus.REGISTERED);
        visitor.setQrCodeToken("QR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        return ResponseEntity.ok(ApiResponse.success(visitorRepository.save(visitor), "Visitor registered and pass generated"));
    }

    @PostMapping("/{id}/check-in")
    @Operation(summary = "Check in visitor")
    public ResponseEntity<ApiResponse<Visitor>> checkInVisitor(@PathVariable UUID id) {
        return visitorRepository.findById(id).map(v -> {
            v.setStatus(VisitorStatus.CHECKED_IN);
            v.setActualArrival(LocalDateTime.now());
            return ResponseEntity.ok(ApiResponse.success(visitorRepository.save(v), "Visitor checked in"));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/check-out")
    @Operation(summary = "Check out visitor")
    public ResponseEntity<ApiResponse<Visitor>> checkOutVisitor(@PathVariable UUID id) {
        return visitorRepository.findById(id).map(v -> {
            v.setStatus(VisitorStatus.CHECKED_OUT);
            v.setActualDeparture(LocalDateTime.now());
            return ResponseEntity.ok(ApiResponse.success(visitorRepository.save(v), "Visitor checked out"));
        }).orElse(ResponseEntity.notFound().build());
    }
}
