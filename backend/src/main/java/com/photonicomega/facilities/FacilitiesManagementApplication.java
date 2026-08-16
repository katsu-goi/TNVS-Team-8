package com.photonicomega.facilities;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

@SpringBootApplication
@EnableJpaAuditing(auditorAwareRef = "auditorAwareImpl")
@EnableCaching
@EnableScheduling
public class FacilitiesManagementApplication {
     public static void main(String[] args) {
        // Pin the JVM default zone to UTC BEFORE the context (and any datasource /
        // Hibernate Instant<->TIMESTAMP conversion) is created. Without this, a host
        // running in a non-UTC zone shifts every persisted Instant by its local
        // offset, so timestamps read back hours off (e.g. "480m ago" for a session
        // that just started). Setting it here makes persistence deterministic on any
        // host, independent of -Duser.timezone launch flags.
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        SpringApplication.run(FacilitiesManagementApplication.class, args);
    }

    @PostConstruct
    void enforceUtcTimeZone() {
        // Belt-and-suspenders: re-assert UTC after context init in case any
        // auto-configuration reset the default zone.
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    }
}
