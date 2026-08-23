package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.ai.AiStateManagementService;
import com.photonicomega.facilities.ai.ModuleAiConfigService;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Makes a configured AI provider the default one.
 *
 * <p>Gated as the other half of {@link SensitiveAction#AI_PROVIDER_DELETE}, which was
 * already gated on its own. Deleting a provider was treated as the dangerous act and
 * promoting one was treated as configuration, which had it backwards: the default
 * provider is the endpoint and the API key that every module without an explicit
 * binding sends its work to, so promoting a different one redirects the company's
 * documents and contracts to somebody else's service in a single call. Deletion
 * removes a capability and shows up as work not happening. Promotion keeps the
 * capability and changes where the data goes, which shows up as nothing at all.
 *
 * <p>The route this replaces also had no {@code @AuthenticationPrincipal}, so there
 * was no record of who changed it. Requiring a requester fixes that as a side effect.
 *
 * <p>Two refusals, both because {@code setDefaultProvider} is unusually easy to
 * misuse:
 *
 * <ol>
 *   <li><b>An unknown id is refused outright.</b> The underlying call loops the
 *       providers setting {@code isDefault} to {@code id.equals(candidate)}, so an id
 *       matching nothing does not fail - it clears the flag on every provider and
 *       leaves the system with no default at all. Every unbound module then has
 *       nowhere to send its work, and the call that caused it reported success.</li>
 *   <li><b>A provider that is not connected is refused.</b> Promoting an OFFLINE
 *       provider is how a working configuration becomes a silently broken one: the
 *       modules stay Active and stop producing anything.</li>
 * </ol>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiProviderSetDefaultExecutor implements SensitiveActionExecutor {

    private final AiStateManagementService aiStateService;
    private final ModuleAiConfigService moduleAiConfigService;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.AI_PROVIDER_SET_DEFAULT;
    }

    @Override
    public String execute(ApprovalRequest request) {
        String providerId = request.getTargetId();
        if (providerId == null || providerId.isBlank()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " names no provider, so there is nothing to make "
                            + "the default. Nothing was changed.");
        }

        List<AiStateManagementService.ProviderDto> providers = aiStateService.getProviders();
        AiStateManagementService.ProviderDto target = providers.stream()
                .filter(candidate -> providerId.equals(candidate.getId()))
                .findFirst()
                .orElse(null);

        if (target == null) {
            // Refused rather than reported as a no-op, and this is the important one.
            // setDefaultProvider would accept this id, match nothing, and clear the
            // default flag from every provider - leaving no default at all, which is
            // strictly worse than the state before the request and reported as success.
            throw new BusinessRuleViolationException(
                    "AI provider '" + providerId + "' is not configured, so it cannot be made the "
                            + "default. Nothing was changed - and this is refused rather than skipped "
                            + "because setting the default to an unknown id would leave the system "
                            + "with no default provider and every unbound module with nowhere to send "
                            + "its work. Providers are held in memory, so a restart between the "
                            + "request and the approval can remove one. Configured providers: "
                            + describe(providers) + ".");
        }

        AiStateManagementService.ProviderDto previous = providers.stream()
                .filter(AiStateManagementService.ProviderDto::isDefault)
                .findFirst()
                .orElse(null);

        if (target.isDefault()) {
            return "AI provider '" + target.getName() + "' is already the default, which is what "
                    + "approval " + request.getId() + " asked for, so nothing was changed.";
        }

        if (!"CONNECTED".equalsIgnoreCase(String.valueOf(target.getStatus()))) {
            throw new BusinessRuleViolationException(
                    "Refusing to make AI provider '" + target.getName() + "' the default: its last "
                            + "health check left it " + target.getStatus() + ", not CONNECTED. Every "
                            + "module without an explicit binding would start sending its work there "
                            + "and would keep reporting itself Active while producing nothing. Test "
                            + "the connection first, then raise the request again.");
        }

        aiStateService.setDefaultProvider(providerId);
        moduleAiConfigService.broadcastProviderChange("PROVIDER_DEFAULT_CHANGED");

        log.warn("Approval {} made AI provider {} ('{}', type {}) the default, replacing {}; "
                        + "requested by {}",
                request.getId(), providerId, target.getName(), target.getType(),
                previous == null ? "no previous default" : "'" + previous.getName() + "'",
                request.getRequestedByEmail());

        return "AI provider '" + target.getName() + "' (" + target.getType() + ", id " + providerId
                + ") is now the default under approval " + request.getId() + ", replacing "
                + (previous == null ? "no previous default" : "'" + previous.getName() + "'")
                + ". Every module without its own provider binding sends its work there from the "
                + "next AI request.";
    }

    private static String describe(List<AiStateManagementService.ProviderDto> providers) {
        if (providers.isEmpty()) {
            return "none";
        }
        return providers.stream()
                .map(p -> p.getName() + " (id " + p.getId() + ", " + p.getStatus()
                        + (p.isDefault() ? ", current default" : "") + ")")
                .collect(Collectors.joining("; "));
    }
}
