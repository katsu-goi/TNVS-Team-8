package com.photonicomega.facilities.module.visitor.repository;

import com.photonicomega.facilities.module.visitor.domain.VisitorWatchlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface VisitorWatchlistRepository extends JpaRepository<VisitorWatchlist, UUID> {

    /** Full watchlist for the management UI, newest first. */
    List<VisitorWatchlist> findByDeletedFalseOrderByCreatedAtDesc();

    /** Screening set: only live entries are matched against. */
    List<VisitorWatchlist> findByStatusAndDeletedFalse(String status);
}
