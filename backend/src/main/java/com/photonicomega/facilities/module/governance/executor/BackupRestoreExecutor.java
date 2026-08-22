package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.admin.domain.BackupRecord;
import com.photonicomega.facilities.module.admin.repository.BackupRecordRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Authorises a database restore from a named backup, and records that
 * authorisation against the backup it applies to.
 *
 * <p><b>This executor does not itself overwrite the database, and that is
 * deliberate.</b> {@code BackupService} can take a backup and has no restore path;
 * there is no restore machinery in this application to call. Writing one here -
 * dropping the schema and replaying a dump from inside a request thread, while the
 * application it is replacing holds open connections to the same database - is not
 * a thing to invent quietly underneath an approval button. A restore that fails
 * halfway leaves no working database and no application able to report why.
 *
 * <p>What this does instead is the part that was actually missing: make the
 * authorisation real, checked, and permanent. It proves the named backup exists,
 * that it completed, and that it passed its integrity check, then stamps the
 * approval onto the record. The operator performing the restore has, in the
 * database, a specific backup marked as authorised by two named people at a known
 * time - which is what the two-signature requirement was for.
 *
 * <p>The three refusals below are the point of the check. Restoring from a RUNNING
 * backup gives a truncated database; from a FAILED one, an unusable file; from one
 * whose integrity check did not pass, silent corruption that will be discovered
 * weeks later with no way back. Each of those is worse than the outage that
 * prompted the restore, and each is invisible until after the damage.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class BackupRestoreExecutor implements SensitiveActionExecutor {

    private final BackupRecordRepository backupRecordRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.BACKUP_RESTORE;
    }

    @Override
    @Transactional
    public String execute(ApprovalRequest request) {
        UUID backupId = parseTargetId(request);

        BackupRecord backup = backupRecordRepository.findById(backupId)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "Backup " + backupId + " does not exist, so there is nothing to restore "
                                + "from. Refusing rather than reporting an authorised restore of a "
                                + "backup that is not there."));

        if (!"COMPLETED".equals(backup.getStatus())) {
            throw new BusinessRuleViolationException(
                    "Backup " + backupId + " has status " + backup.getStatus() + ", not COMPLETED. "
                            + "Restoring from an unfinished or failed backup yields a truncated "
                            + "database, and the damage is not visible until something reads the "
                            + "missing rows.");
        }

        if (backup.getIntegrityCheck() != null && !"PASSED".equals(backup.getIntegrityCheck())) {
            throw new BusinessRuleViolationException(
                    "Backup " + backupId + " did not pass its integrity check (recorded: "
                            + backup.getIntegrityCheck() + "). Restoring it would replace live data "
                            + "with data already known to be damaged.");
        }

        String stamp = "RESTORE AUTHORISED under approval " + request.getId()
                + " at " + LocalDateTime.now()
                + ", requested by " + request.getRequestedByEmail()
                + " (" + request.getRequiredApprovals() + " approval(s) collected). "
                + "Justification: " + request.getJustification();

        backup.setNotes(backup.getNotes() == null || backup.getNotes().isBlank()
                ? stamp
                : backup.getNotes() + System.lineSeparator() + stamp);
        backupRecordRepository.save(backup);

        log.warn("Approval {} AUTHORISED a restore from backup {} ({} taken {}, file {}); "
                        + "requested by {}. The data-plane restore is performed out of band - this "
                        + "application does not overwrite its own database.",
                request.getId(), backupId, backup.getBackupType(), backup.getStartedAt(),
                backup.getFilePath(), request.getRequestedByEmail());

        return "Restore from backup " + backupId + " (" + backup.getBackupType() + ", taken "
                + backup.getStartedAt() + ", integrity " + backup.getIntegrityCheck()
                + ") is authorised and stamped on the record. The restore itself is carried out by "
                + "the operator against " + backup.getFilePath()
                + " - this application deliberately does not overwrite its own live database from a "
                + "request thread. Everything written since " + backup.getStartedAt()
                + " will be lost when it runs.";
    }

    private UUID parseTargetId(ApprovalRequest request) {
        try {
            return UUID.fromString(request.getTargetId());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " targets '" + request.getTargetId()
                            + "', which is not a backup id. A restore needs the backup record's UUID "
                            + "so there is no ambiguity about which snapshot was authorised.");
        }
    }
}
