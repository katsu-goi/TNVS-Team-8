package com.photonicomega.facilities.module.security.repository;

import com.photonicomega.facilities.module.security.domain.ActiveSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ActiveSessionRepository extends JpaRepository<ActiveSession, UUID> {

    Optional<ActiveSession> findBySessionIdAndStatus(String sessionId, String status);

    /**
     * Every session row recorded for a username in a given status, most recently active
     * first.
     *
     * <p>This deliberately returns a list where an {@code Optional} would read better.
     * It used to be {@code Optional<ActiveSession> findByUsernameAndStatus}, which is a
     * promise that at most one row can match, and nothing in the schema keeps it:
     * {@code ActiveSession} constrains {@code sessionId} to be unique and every insert
     * mints a fresh random one, so two ACTIVE rows for the same username are perfectly
     * legal. Two callers read-then-insert without a lock, and when they raced - a login
     * and an open tab's heartbeat, twenty-four milliseconds apart - both created a row.
     * Spring Data then threw {@code IncorrectResultSizeDataAccessException} on every
     * subsequent read, which surfaced as {@code POST /v1/auth/heartbeat} answering 500
     * every thirty seconds until a scheduled reaper happened to expire one of the rows.
     *
     * <p>The invariant cannot be moved into the schema: it is "at most one <em>ACTIVE</em>
     * row per username", while the table intentionally keeps every EXPIRED and REVOKED row
     * as session history. That needs a partial unique index, whose syntax differs between
     * the H2 the {@code dev} profile runs and the PostgreSQL the deployed profiles run, and
     * which {@code ddl-auto} generates from the entity model on neither. So callers are
     * handed the truth instead - all matching rows - and
     * {@code UserActivityService} collapses the surplus when it sees one.
     * {@code ActiveSessionUniquenessTest} holds this line.
     *
     * <p>The ordering is part of the contract, not a convenience: it decides which row
     * survives a collapse. Most recently active wins, with the newest login as tiebreak,
     * and both columns are {@code nullable = false} so neither can make the order
     * ambiguous.
     */
    List<ActiveSession> findByUsernameAndStatusOrderByLastActivityDescLoginTimeDesc(String username, String status);

    List<ActiveSession> findByStatus(String status);

    List<ActiveSession> findByUserIdAndStatus(String userId, String status);
}
