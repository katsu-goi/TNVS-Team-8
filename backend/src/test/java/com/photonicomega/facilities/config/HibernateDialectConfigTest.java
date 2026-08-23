package com.photonicomega.facilities.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every profile must tell Hibernate the truth about which database it is talking to.
 *
 * <h3>The fault this was written to name</h3>
 * The root document of {@code application.yml} sets
 * {@code hibernate.dialect: PostgreSQLDialect} for all profiles, and the {@code dev}
 * and {@code test} profiles run H2. Nothing failed loudly. What happened instead:
 * {@code dev} uses {@code ddl-auto: update}, and Hibernate read the existing H2 schema
 * through a PostgreSQL dialect. It re-issued constraints and indexes that were already
 * present - the "already exists" warnings on every boot, easy to dismiss as noise - and
 * it did not notice three columns the entity model had gained. A dev database created
 * before {@code DisposalRequest} grew {@code approval_request_id},
 * {@code requested_by_id} and {@code requested_by_email} never received them, so
 * {@code GET /v1/compliance/alerts}, {@code GET /v1/compliance/disposals} and the gated
 * {@code POST /v1/compliance/documents/{id}/disposal} all answered HTTP 500 with
 * "An unexpected error occurred". A schema that had silently stopped migrating
 * presented itself as three crashing endpoints.
 *
 * <p>Deleting the database made the symptom disappear, which is the trap: a fresh
 * database is built by {@code create} rather than migrated by {@code update}, so it
 * comes out correct under either dialect and proves nothing. The fix is only real if
 * an <em>existing</em> database gains the missing columns.
 *
 * <h3>Why this test and not an integration test</h3>
 * Reproducing the original defect end to end needs a database file that predates an
 * entity change - a fixture that is obsolete the moment the schema moves again. The
 * durable invariant is one line of configuration: the dialect a profile declares has
 * to match the JDBC driver it points at. That is checkable from configuration alone,
 * for every profile at once, in milliseconds and with no database. It also covers the
 * profiles this machine cannot run: {@code supabase}, {@code local} and {@code docker}
 * are asserted here without a PostgreSQL server anywhere.
 *
 * <p>The mismatch is asserted in both directions on purpose. An H2 profile carrying
 * PostgreSQLDialect is the bug that happened; a PostgreSQL profile carrying H2Dialect
 * is the mirror image, and it would corrupt a real deployment rather than a
 * developer's scratch database.
 */
class HibernateDialectConfigTest {

    /** Every profile declared in {@code application.yml}, whether or not it can run here. */
    private static final List<String> ALL_PROFILES = List.of("dev", "test", "docker", "supabase", "local");

    private static final String DIALECT_PROPERTY = "spring.jpa.properties.hibernate.dialect";
    private static final String URL_PROPERTY = "spring.datasource.url";

    @Test
    @DisplayName("No profile tells Hibernate it is on a database it is not on")
    void everyProfileDeclaresTheDialectOfTheDatabaseItPointsAt() {
        for (String profile : ALL_PROFILES) {
            underProfile(profile).run(context -> {
                Environment env = context.getEnvironment();
                String url = env.getProperty(URL_PROPERTY, "");
                String dialect = env.getProperty(DIALECT_PROPERTY, "");

                assertThat(url)
                        .as("profile `%s` has no datasource url, so this test is asserting nothing "
                            + "about it - either the profile was renamed or the property moved", profile)
                        .isNotBlank();

                if (url.startsWith("jdbc:h2")) {
                    assertThat(dialect)
                            .as("profile `%s` runs H2 (%s) but declares dialect `%s`. The root document "
                                + "of application.yml forces PostgreSQLDialect; an H2 profile has to "
                                + "override it. Inheriting it is what stopped `ddl-auto: update` from "
                                + "adding new columns to an existing dev database and turned three "
                                + "compliance endpoints into HTTP 500s.", profile, url, dialect)
                            .isEqualTo("org.hibernate.dialect.H2Dialect");
                } else if (url.startsWith("jdbc:postgresql")) {
                    assertThat(dialect)
                            .as("profile `%s` runs PostgreSQL (%s) but declares dialect `%s`. This is the "
                                + "mirror of the dev bug and the more expensive direction: the damage "
                                + "would be to a real database, not a scratch one.", profile, url, dialect)
                            .isEqualTo("org.hibernate.dialect.PostgreSQLDialect");
                } else {
                    // A third database would need its own branch here rather than passing
                    // silently, which is how the H2 profiles slipped through in the first place.
                    throw new AssertionError("profile `" + profile + "` points at an unrecognised database ("
                            + url + "). Add the dialect this test should expect for it.");
                }
            });
        }
    }

    @Test
    @DisplayName("The dev profile is the one a developer runs, and it is on H2")
    void theDevProfileIsH2() {
        // Named separately from the sweep above so a failure reads as "the profile
        // `mvnw spring-boot:run` uses is misconfigured" rather than "one of five profiles is".
        underProfile("dev").run(context -> {
            Environment env = context.getEnvironment();
            assertThat(env.getProperty(URL_PROPERTY, "")).startsWith("jdbc:h2:file:");
            assertThat(env.getProperty(DIALECT_PROPERTY))
                    .isEqualTo("org.hibernate.dialect.H2Dialect");
            assertThat(env.getProperty("spring.jpa.hibernate.ddl-auto"))
                    .as("`update` is what makes the dialect matter here: it migrates a database that "
                        + "already exists, and it is the mode that silently skipped the new columns. "
                        + "If this ever becomes `create-drop` the dev database stops surviving a "
                        + "restart, which is the documented reason this profile is not the test one.")
                    .isEqualTo("update");
        });
    }

    private ApplicationContextRunner underProfile(String profile) {
        return new ApplicationContextRunner()
                // Loads the real application.yml, including profile documents, so this
                // asserts against shipped configuration and not a copy of it.
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=" + profile)
                .withUserConfiguration(NoBeans.class);
    }

    /** No datasource, no JPA, no beans - the properties are the whole subject. */
    @Configuration
    static class NoBeans {
    }
}
