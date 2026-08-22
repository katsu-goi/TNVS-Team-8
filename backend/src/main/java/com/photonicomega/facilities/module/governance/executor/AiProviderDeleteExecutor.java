package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.ai.AiStateManagementService;
import com.photonicomega.facilities.ai.domain.AiModuleConfig;
import com.photonicomega.facilities.ai.repository.AiModuleConfigRepository;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Removes a configured AI provider.
 *
 * <p>Gated because of what it takes down on its way out. Deleting the provider a
 * module routes through does not disable that module - the module goes on accepting
 * work and failing to do it. Document classification, contract analytics and
 * visitor verification would each keep reporting themselves as Active while
 * silently producing nothing, and the first person to notice would be a user
 * wondering why a document never got classified.
 *
 * <p>Two refusals guard that, and both exist because the failure they prevent is
 * silent:
 *
 * <ol>
 *   <li><b>A provider still bound to a module cannot be deleted.</b> The bindings
 *       live in {@code ai_module_config.provider_id} and outlive the provider, which
 *       is held in memory. Deleting the provider therefore leaves a dangling
 *       reference in the database that survives a restart - a broken configuration
 *       that no longer names anything you could look up to diagnose it.</li>
 *   <li><b>The default provider cannot be deleted.</b> It is the fallback every
 *       unconfigured module lands on, so removing it breaks the modules that were
 *       never explicitly configured - exactly the ones nobody is watching.</li>
 * </ol>
 *
 * <p>Both refusals name the fix in their message, because "cannot delete" without
 * "reassign these three modules first" just gets retried.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiProviderDeleteExecutor implements SensitiveActionExecutor {

    private final AiStateManagementService aiStateManagementService;
    private final AiModuleConfigRepository aiModuleConfigRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.AI_PROVIDER_DELETE;
    }

    @Override
    @Transactional(readOnly = true)
    public String execute(ApprovalRequest request) {
        String providerId = request.getTargetId();
        if (providerId == null || providerId.isBlank()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " names no provider, so there is nothing to delete.");
        }

        AiStateManagementService.ProviderDto provider = aiStateManagementService.getProviders().stream()
                .filter(candidate -> providerId.equals(candidate.getId()))
                .findFirst()
                .orElse(null);

        if (provider == null) {
            // Providers are held in memory, so a restart between the request and the
            // approval can legitimately remove one. The requested end state holds.
            return "AI provider '" + providerId + "' is not configured (already removed, or cleared "
                    + "by a restart); nothing to do.";
        }

        if (provider.isDefault()) {
            throw new BusinessRuleViolationException(
                    "Refusing to delete AI provider '" + provider.getName() + "': it is the default, "
                            + "which every module without an explicit binding falls back to. Deleting "
                            + "it would break those modules silently, since they would keep reporting "
                            + "themselves Active. Make another provider the default first.");
        }

        List<AiModuleConfig> bound = aiModuleConfigRepository.findAllByDeletedFalse().stream()
                .filter(config -> providerId.equals(config.getProviderId()))
                .toList();

        if (!bound.isEmpty()) {
            String modules = bound.stream()
                    .map(AiModuleConfig::getModuleKey)
                    .sorted()
                    .collect(Collectors.joining(", "));
            throw new BusinessRuleViolationException(
                    "Refusing to delete AI provider '" + provider.getName() + "': " + bound.size()
                            + " module(s) still route through it (" + modules + "). Those bindings are "
                            + "stored in the database and would outlive the provider, leaving a "
                            + "configuration that points at nothing and survives a restart. Reassign "
                            + "those modules to another provider first.");
        }

        boolean removed = aiStateManagementService.deleteProvider(providerId);
        if (!removed) {
            // Lost a race with a concurrent removal between the lookup above and here.
            return "AI provider '" + providerId + "' was removed concurrently; nothing to do.";
        }

        log.warn("Approval {} deleted AI provider {} ('{}', type {}); requested by {}",
                request.getId(), providerId, provider.getName(), provider.getType(),
                request.getRequestedByEmail());

        return "Deleted AI provider '" + provider.getName() + "' (" + provider.getType()
                + ", id " + providerId + "). No module was routing through it.";
    }
}
