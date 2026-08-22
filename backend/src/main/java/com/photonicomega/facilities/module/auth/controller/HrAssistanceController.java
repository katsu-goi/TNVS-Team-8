package com.photonicomega.facilities.module.auth.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.auth.domain.HrAssistanceRequest;
import com.photonicomega.facilities.module.auth.dto.HrAssistanceRequestDto;
import com.photonicomega.facilities.module.auth.service.HrAssistanceService;
import com.photonicomega.facilities.module.security.util.ClientIpResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/auth/hr")
@RequiredArgsConstructor
@Tag(name = "HR Assistance", description = "Public HR Department assistance requests")
public class HrAssistanceController {

    private final HrAssistanceService hrAssistanceService;

    @PostMapping("/assistance")
    @Operation(summary = "Request HR assistance",
            description = "Allows employees to request assistance with account access or password recovery")
    public ResponseEntity<ApiResponse<Void>> requestAssistance(
            @Valid @RequestBody HrAssistanceRequestDto request,
            HttpServletRequest httpRequest) {
        HrAssistanceRequest saved = hrAssistanceService.submit(
                request, getClientIp(httpRequest), httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(ApiResponse.success(
                "Your request has been submitted. The HR Department will contact you shortly."));
    }

    private String getClientIp(HttpServletRequest request) {
        return ClientIpResolver.resolve(request).ip();
    }
}
