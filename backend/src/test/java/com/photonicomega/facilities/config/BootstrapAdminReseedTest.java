package com.photonicomega.facilities.config;

import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Proves that soft-deleting a seeded default account cannot brick the backend.
 *
 * <p>The defect this guards was the worst kind: silent, permanent, and triggered
 * by an ordinary administrative action. Every seeder guarded itself with
 * {@code findByEmailAndDeletedFalse}, which is blind in exactly the wrong
 * direction. Soft-deleting a seeded account removes it from that query while its
 * row goes on occupying the unique {@code idx_users_email} index and the unique
 * {@code employee_id} column. So the next startup concluded the account was
 * missing, tried to INSERT it, hit the constraint, and threw out of
 * {@link org.springframework.boot.CommandLineRunner#run} - which aborts the
 * entire Spring Boot application.
 *
 * <p>The consequence, stated plainly: an administrator deleting the default
 * employee account through the ordinary UI would have produced a backend that
 * never booted again, with a constraint-violation stack trace that pointed at
 * seeding rather than at the deletion weeks earlier. Nothing short of hand-editing
 * the database would have recovered it.
 *
 * <p>Two assertions matter here and they pull in opposite directions, which is
 * why both are made:
 *
 * <ul>
 *   <li><b>Startup must survive.</b> The seeder has to notice the deleted row and
 *       skip.</li>
 *   <li><b>The account must NOT come back.</b> Skipping is deliberate, not
 *       incidental. Quietly recreating an account somebody chose to revoke would
 *       hand its default credentials back to whoever could reach the login page -
 *       turning a boot crash into a credential leak, which is a worse bug than the
 *       one being fixed.</li>
 * </ul>
 *
 * <p><b>Do not add {@code @DirtiesContext} here.</b> It is the obvious instinct -
 * this test mutates a row that {@link BootstrapAdmin} seeded into a Spring context
 * shared with every other test class - and it breaks the build. The test profile
 * uses {@code jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1} with
 * {@code ddl-auto: create-drop}, so the database outlives any single context while
 * Hibernate runs its DROP phase whenever a context closes. Discarding this context
 * therefore drops every table out from under the other cached contexts, and the
 * next test class to run fails with {@code Table "USERS" not found (this database
 * is empty)} - an error that points at that innocent class and not at this one.
 *
 * <p>The teardown below is what keeps the shared state clean instead. It runs even
 * when an assertion fails, and it restores the captured instance rather than
 * re-fetching, because {@link UserRepository} has no soft-delete-blind
 * {@code findByEmail} to fetch a deleted row back with.
 */
@SpringBootTest
@ActiveProfiles("test")
class BootstrapAdminReseedTest {

    /**
     * The account named in the original bug report. Chosen over the admin account
     * deliberately: it is the one an administrator would plausibly delete, and its
     * sample-data seeder is count-guarded, so re-running the seeders exercises the
     * guard under test rather than some unrelated duplicate-insert.
     */
    private static final String TARGET = "employee@photonicomega.com";

    /**
     * The one seeded role deliberately held by two accounts. Named here rather than
     * inlined so it is obvious this is a property of the seeding and not of the
     * security module.
     */
    private static final String SHARED_ROLE = "SECURITY_OFFICER";

    @Autowired
    private BootstrapAdmin bootstrapAdmin;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    /**
     * Held so teardown can restore the row even when an assertion fails. The
     * instance carries its own id, so saving it issues an UPDATE rather than
     * inserting a second row.
     */
    private User softDeleted;

    @AfterEach
    void restoreTheSeededAccount() {
        if (softDeleted == null) {
            return;
        }
        softDeleted.setDeleted(false);
        softDeleted.setDeletedAt(null);
        softDeleted.setDeletedBy(null);
        userRepository.save(softDeleted);
        softDeleted = null;
    }

    @Test
    @DisplayName("a soft-deleted seeded account does not abort startup, and is not resurrected either")
    void softDeletedSeededAccountDoesNotAbortStartup() {
        User seeded = userRepository.findByEmailAndDeletedFalse(TARGET)
                .orElseThrow(() -> new IllegalStateException(
                        "precondition failed: " + TARGET + " was never seeded, so this test "
                                + "cannot exercise the guard it exists to check"));

        seeded.softDelete("bootstrap-reseed-test");
        softDeleted = userRepository.save(seeded);

        // Precondition, asserted rather than assumed: the row must still be
        // physically present. If soft-delete were a hard delete the original bug
        // could not occur and this test would prove nothing.
        assertTrue(userRepository.existsByEmail(TARGET),
                "soft delete must leave the row in place - it is the surviving row that "
                        + "collides with the unique index on the next insert");
        assertFalse(userRepository.existsByEmailAndDeletedFalse(TARGET),
                "precondition: the account must look absent to the seeder's old-style guard");

        // The assertion the original code failed. run() is invoked directly because
        // the failure mode being guarded is specifically "CommandLineRunner.run
        // throws", which is what aborts the application at startup.
        assertDoesNotThrow(() -> bootstrapAdmin.run(),
                "re-running the seeders over a soft-deleted account must not throw; throwing "
                        + "out of CommandLineRunner.run aborts the whole application, so this is "
                        + "the difference between a warning in the log and a backend that never "
                        + "boots again");

        assertTrue(userRepository.existsByEmail(TARGET),
                "the deleted row should still be there, untouched");
        assertFalse(userRepository.existsByEmailAndDeletedFalse(TARGET),
                "the account must NOT have been resurrected: recreating an account an "
                        + "administrator deliberately revoked would hand its default credentials "
                        + "back, which is a worse outcome than the crash this replaced");
    }

    @Test
    @DisplayName("two holders of one role share a single role row, and seeding them does not abort startup")
    void aRoleSharedBySeveralHoldersIsSeededOnce() {
        // A role held by more than one person is the normal case, not the exception -
        // two security officers exist precisely so BACKUP_RESTORE's two-signature rule
        // is reachable by somebody who did not raise the request. Seeding the second
        // one has failed twice, in two different ways, and both were fatal at startup
        // rather than merely wrong:
        //
        //   1. Building a fresh Role per holder violates the unique index on
        //      roles.name, throwing out of CommandLineRunner.run.
        //   2. Looking the Role up instead returns a *detached* instance, because the
        //      finder's transaction ends when it returns. Saving a brand-new User then
        //      calls persist(), which cascades PERSIST onto that detached Role, and
        //      Hibernate throws PersistentObjectException - also out of run().
        //
        // Both produce a backend that never boots, so neither is visible to any test
        // that assumes a running context. The assertions below fail under either.
        List<Role> securityOfficerRows = roleRepository.findAll().stream()
                .filter(role -> SHARED_ROLE.equalsIgnoreCase(role.getName()))
                .toList();

        assertEquals(1, securityOfficerRows.size(),
                "expected exactly one " + SHARED_ROLE + " row, found " + securityOfficerRows.size()
                        + ". More than one means the unique index on roles.name is gone; none means "
                        + "the role was never seeded and every action needing that signature is "
                        + "unapprovable");

        List<User> holders = userRepository.findByRoleName(SHARED_ROLE).stream()
                .filter(User::isAccountActive)
                .toList();

        assertTrue(holders.size() >= 2,
                "only " + holders.size() + " live account(s) hold " + SHARED_ROLE + ". Two are "
                        + "required: an approver cannot sign their own request, so a rule needing "
                        + "two signatures needs a third holder to survive one of them being the "
                        + "requester. ApprovalQuorumReachableTest states that arithmetic; this "
                        + "asserts the seeding that satisfies it.");

        // The same act again, on a database that already has the row. This is what
        // every restart does, and it is the path where the detached-entity fault lives -
        // the first startup creates the role, so only later ones look it up.
        assertDoesNotThrow(() -> bootstrapAdmin.run(),
                "re-seeding a role that already exists must not throw; throwing out of "
                        + "CommandLineRunner.run aborts the application, so this is the difference "
                        + "between a no-op and a backend that boots exactly once");

        assertEquals(1, roleRepository.findAll().stream()
                        .filter(role -> SHARED_ROLE.equalsIgnoreCase(role.getName()))
                        .count(),
                "re-seeding inserted a second " + SHARED_ROLE + " row");
    }

    @Test
    @DisplayName("re-running the seeders over a fully seeded database is a no-op")
    void reseedingAnAlreadySeededDatabaseIsHarmless() {
        // The general case behind the specific one above. Every seeder and every
        // sample-data block has to be idempotent, because BootstrapAdmin runs on
        // every single startup, not just the first.
        long usersBefore = userRepository.count();

        assertDoesNotThrow(() -> bootstrapAdmin.run(),
                "BootstrapAdmin runs on every startup, so a second invocation over an "
                        + "already-seeded database must be a no-op rather than a duplicate insert");

        assertTrue(userRepository.count() == usersBefore,
                "re-seeding created " + (userRepository.count() - usersBefore) + " extra user(s); "
                        + "the seeders are supposed to skip, not duplicate");
    }
}
