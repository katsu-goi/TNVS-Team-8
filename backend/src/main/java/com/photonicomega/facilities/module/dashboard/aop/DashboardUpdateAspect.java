package com.photonicomega.facilities.module.dashboard.aop;

import com.photonicomega.facilities.module.dashboard.service.RealtimeDashboardService;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect
@Component
@RequiredArgsConstructor
public class DashboardUpdateAspect {

    private final RealtimeDashboardService realtimeDashboardService;

    @AfterReturning("execution(* org.springframework.data.repository.CrudRepository+.save*(..)) || execution(* org.springframework.data.repository.CrudRepository+.delete*(..))")
    public void notifyDashboardUpdate() {
        // Run asynchronously so we don't block the transaction? 
        // Actually, simpMessagingTemplate is async and fast, but we could use an Executor.
        // For now, doing it synchronously is fine as it's just querying and sending to broker.
        realtimeDashboardService.broadcastMetrics();
    }
}
